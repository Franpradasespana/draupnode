// Avisos de la app: lo que conviene mirar, en un solo sitio (pantalla
// «Avisos», el número en el menú y la campana de arriba). Así no hace falta
// una franja en todas las pantallas: solo el Panel los enseña.
import { api, isDesktop, onEvent, type BackupDue, type BackupFetchProgress, type BackupResult, type CachedOverview, type DomainCheck, type DomainReport, type DriftReport, type ImageReport, type ServerOverview } from './api'
import { ui, toast, refreshProjects, moduleName } from './state.svelte'
import { withConnection } from './connect'
import { sameValues } from './modules'
import type { Project } from './api'
import { t, plural } from './i18n.svelte'

export type AlertItem =
  | { kind: 'backups'; key: string; projectId: string; name: string; server: string; due: BackupDue }
  | { kind: 'failed'; key: string; projectId: string; name: string; server: string; at: string; error: string }
  | { kind: 'export'; key: string; last: string | null }
  | { kind: 'update'; key: string; latest: string; url: string }
  | { kind: 'down'; key: string; serverId: string; name: string; since: string }
  | { kind: 'server'; key: string; serverId: string; name: string; text: string; bad: boolean; at: string }
  | { kind: 'pending'; key: string; projectId: string; name: string; server: string; applied: boolean }

// Vigilancia de los servidores mientras la app está abierta: cada
// WATCH_SECONDS se mira si su SSH responde; tras DOWN_AFTER fallos seguidos,
// aviso. (Un servidor no puede avisar de que él mismo se ha caído.)
export const WATCH_SECONDS = 120
// (En la demo del navegador, al primer fallo, para poder verlo.)
export const DOWN_AFTER = isDesktop ? 2 : 1
let watching = false
export function watchServers() {
  if (watching) return
  watching = true
  const tick = async () => {
    try {
      const now = new Date().toISOString()
      for (const p of await api.PingServers()) {
        alerts.ping[p.id] = { reachable: p.reachable, latencyMs: p.latencyMs, at: now, lab: p.lab }
        if (p.lab) continue
        const d = alerts.down[p.id]
        if (p.reachable) {
          if (d && d.fails >= DOWN_AFTER) {
            const name = ui.servers.find((x) => x.id === p.id)?.name ?? t('El servidor')
            toast(t('{0} vuelve a responder', name))
          }
          delete alerts.down[p.id]
        } else {
          alerts.down[p.id] = { fails: (d?.fails ?? 0) + 1, since: d?.since ?? new Date().toISOString() }
        }
      }
    } catch { /* siguiente vuelta */ }
  }
  tick()
  setInterval(tick, WATCH_SECONDS * 1000)
}

// Cada cuántos días se recuerda hacer la copia de Draupnode.
export const EXPORT_DAYS = 30

export const alerts = $state({
  due: [] as BackupDue[],
  // Ocultos hasta que se vuelva a abrir la app.
  hidden: [] as string[],
  busy: '',
  // Última copia de Draupnode exportada (undefined = aún no se sabe).
  lastExport: undefined as string | null | undefined,
  // Versión nueva de Draupnode publicada (null = no hay o no se sabe).
  update: null as { latest: string; url: string } | null,
  // Servidores que no responden: fallos seguidos y desde cuándo.
  down: {} as Record<string, { fails: number; since: string }>,
  // Última comprobación de cada servidor (también el de pruebas), para el Panel.
  ping: {} as Record<string, { reachable: boolean; latencyMs: number; at: string; lab: boolean }>,
  // Última ficha leída de cada servidor (guardada en este equipo): el Panel y los avisos del servidor.
  fichas: {} as Record<string, CachedOverview>,
  // Última comprobación de «¿Ha cambiado algo a mano?» de cada servidor.
  drifts: {} as Record<string, DriftReport>,
  // Última comprobación de imágenes Docker de cada servidor.
  images: {} as Record<string, ImageReport>,
  // Última comprobación de dominios (desde este equipo) de cada servidor.
  domains: {} as Record<string, DomainReport>,
  progress: null as BackupFetchProgress | null,
})

onEvent('backupfetch', (p: BackupFetchProgress) => {
  if (p.projectId === alerts.busy) alerts.progress = p
})

const serverName = (projectId: string) => {
  const p = ui.projects.find((x) => x.id === projectId)
  return ui.servers.find((s) => s.id === p?.serverId)?.name ?? ''
}

export function alertItems(): AlertItem[] {
  const out: AlertItem[] = []
  for (const d of alerts.due) {
    out.push({ kind: 'backups', key: 'b:' + d.projectId, projectId: d.projectId, name: d.name, server: serverName(d.projectId), due: d })
  }
  for (const p of ui.projects) {
    const r = p.lastRun
    if (r && !r.ok && !r.check && !r.canceled) {
      out.push({ kind: 'failed', key: 'f:' + p.id + ':' + r.at, projectId: p.id, name: p.name, server: serverName(p.id), at: r.at, error: r.error ?? '' })
    }
  }
  const le = alerts.lastExport
  if (le !== undefined && ui.servers.length && (!le || Date.now() - new Date(le).getTime() > EXPORT_DAYS * 86400000)) {
    out.push({ kind: 'export', key: 'e', last: le })
  }
  for (const [sid, d] of Object.entries(alerts.down)) {
    const srv = ui.servers.find((x) => x.id === sid)
    if (srv && d.fails >= DOWN_AFTER) out.push({ kind: 'down', key: 'd:' + sid + ':' + d.since, serverId: sid, name: srv.name, since: d.since })
  }
  for (const [sid, c] of Object.entries(alerts.fichas)) {
    const srv = ui.servers.find((x) => x.id === sid)
    if (!srv) continue
    const outside = new Set((alerts.domains[sid]?.domains ?? []).map((d) => d.domain))
    for (const f of serverFindings(c.overview)) {
      if (f.id.startsWith('cert:') && outside.has(f.id.slice(5))) continue
      out.push({ kind: 'server', key: `s:${sid}:${f.id}`, serverId: sid, name: srv.name, text: f.text, bad: f.bad, at: c.at })
    }
  }
  for (const [sid, r] of Object.entries(alerts.drifts)) {
    const srv = ui.servers.find((x) => x.id === sid)
    const n = driftOpen(r).length
    if (srv && n) out.push({ kind: 'server', key: `s:${sid}:drift:${driftOpen(r).map((i) => i.key).join(',')}`, serverId: sid, name: srv.name, text: t(n === 1 ? 'Ha cambiado fuera de Draupnode: {0}' : 'Han cambiado {1} cosas fuera de Draupnode: {0}', driftOpen(r).slice(0, 2).map(driftLabel).join(', ') + (n > 2 ? '…' : ''), n), bad: false, at: r.at })
  }
  for (const [sid, r] of Object.entries(alerts.images)) {
    const srv = ui.servers.find((x) => x.id === sid)
    const n = newImages(r).length
    if (srv && n) out.push({ kind: 'server', key: `s:${sid}:img:${newImages(r).map((i) => i.image).join(',')}`, serverId: sid, name: srv.name, text: t(n === 1 ? 'Hay versión nueva de 1 imagen Docker: {1}' : 'Hay versión nueva de {0} imágenes Docker: {1}', n, newImages(r).slice(0, 2).map((i) => i.image).join(', ') + (n > 2 ? '…' : '')), bad: false, at: r.at })
  }
  for (const [sid, r] of Object.entries(alerts.domains)) {
    const srv = ui.servers.find((x) => x.id === sid)
    if (!srv) continue
    for (const d of r.domains ?? []) {
      const p = domainProblem(d)
      if (p) out.push({ kind: 'server', key: `s:${sid}:dom:${d.domain}:${p.id}`, serverId: sid, name: srv.name, text: `${d.domain}: ${p.text}`, bad: p.bad, at: r.at })
    }
  }
  // Servidores con módulos sin aplicar (nuevos o con la configuración cambiada).
  for (const p of ui.projects) {
    if (!p.modules.length) continue
    const n = pendingModules(p)
    if (!n) continue
    const srv = ui.servers.find((x) => x.id === p.serverId)
    out.push({ kind: 'pending', key: `p:${p.id}:${n}`, projectId: p.id, name: plural(n, 'módulo', 'módulos'), server: srv?.name ?? '', applied: !!p.appliedAt })
  }
  if (alerts.update) out.push({ kind: 'update', key: 'u:' + alerts.update.latest, ...alerts.update })
  return out.filter((a) => !alerts.hidden.includes(a.key))
}

export function hideAlert(key: string) {
  alerts.hidden.push(key)
}

export async function fetchBackups(d: BackupDue, quiet = false): Promise<boolean> {
  alerts.busy = d.projectId
  alerts.progress = null
  try {
    const srv = ui.servers.find((s) => s.id === ui.projects.find((p) => p.id === d.projectId)?.serverId)
    const call = (s: string, a: string, u: string) => api.FetchBackups(d.projectId, d.dest, s, a, u)
    // Solas: sin preguntar nada (si hace falta una contraseña, se queda en aviso).
    const r: BackupResult | null = quiet ? await call('', '', '') : await withConnection(srv, call)
    if (r?.status === 'ok' && r.fetch) {
      alerts.due = alerts.due.filter((x) => x.projectId !== d.projectId)
      toast(t('Copias de «{0}» traídas a {1}', d.name, r.fetch.dir))
      return true
    }
    if (!quiet && r && r.status !== 'ok') toast(r.message || t('No se pudieron traer'), 'error')
    return false
  } catch (e) {
    if (!quiet) toast(String(e), 'error')
    return false
  } finally {
    alerts.busy = ''
    alerts.progress = null
  }
}

// Al abrir la app: mira las copias pendientes y trae solas las que lo tienen así.
export async function loadAlerts() {
  api.LastOverviews().then((f) => (alerts.fichas = f ?? {})).catch(() => {})
  api.LastDrifts().then((d) => (alerts.drifts = d ?? {})).catch(() => {})
  api.LastImageChecks().then((d) => (alerts.images = d ?? {})).catch(() => {})
  api.LastDomainChecks().then((d) => (alerts.domains = d ?? {})).catch(() => {})
  api.BackupStatus().then((b) => (alerts.lastExport = b.lastExport ?? null)).catch(() => {})
  api.CheckUpdate().then((u) => (alerts.update = u.newer && u.url ? { latest: u.latest, url: u.url } : null)).catch(() => {})
  try {
    alerts.due = await api.BackupsDue()
  } catch {
    return
  }
  for (const d of alerts.due.filter((x) => x.mode === 'fetch')) {
    if (!(await fetchBackups(d, true))) d.mode = 'warn' // no se pudo sin preguntar: queda como aviso
  }
  await refreshProjects()
}

// Umbrales de los avisos sacados de la ficha del servidor.
export const DISK_WARN = 85
/** Avisar si, a este ritmo, el disco se llena antes de estos días. */
export const DISK_FULL_DAYS = 14
export const BACKUP_HOURS = 26
/** Avisar si la prueba de restaurar tiene más de estos días (se hace cada semana). */
export const VERIFY_DAYS = 15

/** Lo que conviene mirar en la última ficha leída de un servidor. */
export function serverFindings(ov: ServerOverview): { id: string; text: string; bad: boolean }[] {
  const out: { id: string; text: string; bad: boolean }[] = []
  for (const d of ov.disks ?? []) {
    const pct = d.size ? Math.round((d.used / d.size) * 100) : 0
    if (pct >= DISK_WARN) out.push({ id: 'disk:' + d.mount, text: t('Disco {0} al {1} %', d.mount, pct), bad: pct >= 95 })
  }
  // Previsión del historial: a este ritmo, cuándo se llena el disco.
  const fc = ov.history?.forecast
  if (fc?.days !== undefined && fc.days < DISK_FULL_DAYS) {
    const when = fc.days < 1 ? t('en menos de un día') : t('en unos {0} días', Math.round(fc.days))
    out.push({ id: 'diskfull', text: t('A este ritmo, el disco se llena {0} (crece {1} GB al día)', when, ((fc.perDay ?? 0) / 1024 ** 3).toFixed(1)), bad: fc.days < 3 })
  }
  const sick = (ov.containers ?? []).filter((c) => ['restarting', 'dead'].includes(c.state) || c.health === 'unhealthy')
  if (sick.length) out.push({ id: 'ctr:' + sick.map((c) => c.name).sort().join(','), text: `${sick.length === 1 ? t('Contenedor con problemas') : sick.length + t(' contenedores con problemas')}: ${sick.map((c) => c.name).join(', ')}`, bad: true })
  if (ov.failed?.length) out.push({ id: 'svc:' + [...ov.failed].sort().join(','), text: `${ov.failed.length === 1 ? t('Servicio caído') : t('Servicios caídos')}: ${ov.failed.join(', ')}`, bad: true })
  const up = ov.updates
  if (up?.reboot) out.push({ id: 'reboot', text: t('Necesita reiniciarse{0} para terminar de aplicar actualizaciones', up.rebootFor?.length ? ` (${up.rebootFor.slice(0, 2).join(', ')})` : ''), bad: false })
  if (up && up.security > 0) out.push({ id: 'secupd:' + up.security, text: `${up.security} ${up.security === 1 ? t('actualización de seguridad pendiente') : t('actualizaciones de seguridad pendientes')}`, bad: false })
  for (const c of ov.certs ?? []) {
    if (c.error) out.push({ id: 'cert:' + c.domain, text: t('HTTPS de {0}: {1}', c.domain, c.error), bad: false })
    else if (c.days !== undefined && c.days < 21) out.push({ id: 'cert:' + c.domain, text: c.days < 0 ? t('El certificado de {0} ha caducado', c.domain) : t('El certificado de {0} caduca en {1} días', c.domain, c.days), bad: c.days < 7 })
  }
  if (ov.clock?.known && !ov.clock.synced) out.push({ id: 'clock', text: t('La hora del servidor no está sincronizada (fallan certificados, copias y registros)'), bad: false })
  const sec = ov.security
  if (sec && sec.failed24h >= 50 && !sec.fail2ban) out.push({ id: 'ssh', text: t('{0} intentos de entrar por SSH en 24 h ({1} IPs) y sin fail2ban: añade el módulo «SSH seguro»', sec.failed24h, sec.ips), bad: false })
  const clam = ov.hardening?.clamav
  if (clam?.found) out.push({ id: 'clamav:' + clam.found, text: t('El antivirus ha encontrado {0} fichero(s) sospechoso(s): {1}', clam.found, clam.files.slice(0, 2).join(', ')), bad: true })
  for (const b of ov.backups ?? []) {
    const v = b.verify
    if (v && !v.ok && !b.verifyRunning) out.push({ id: 'bkver:' + b.slug + ':' + v.at, text: t('La prueba de restaurar las copias de «{0}» falló: {1}', b.slug, v.error), bad: true })
    else if (v && b.verifyTimer && Date.now() / 1000 - v.at > VERIFY_DAYS * 86400) out.push({ id: 'bkverold:' + b.slug, text: t('No se ha probado a restaurar las copias de «{0}» desde hace {1} días', b.slug, Math.round((Date.now() / 1000 - v.at) / 86400)), bad: false })
    if (b.running) continue
    if (!b.ok) out.push({ id: 'bk:' + b.slug, text: t('La última copia de «{0}» falló', b.slug), bad: true })
    else if (b.ago === null) out.push({ id: 'bk0:' + b.slug, text: t('No consta ninguna copia de «{0}»', b.slug), bad: false })
    else if (b.ago > BACKUP_HOURS * 3600) out.push({ id: 'bkold:' + b.slug, text: t('La última copia de «{0}» es de hace {1} h', b.slug, Math.round(b.ago / 3600)), bad: false })
  }
  return out
}

/** Guarda en memoria una ficha recién leída (ServerOverview ya la deja en disco). */
export function rememberOverview(serverId: string, overview: ServerOverview) {
  alerts.fichas[serverId] = { at: new Date().toISOString(), overview }
}

/** Módulos de un servidor por instalar o con la configuración cambiada desde que se aplicó. */
export function pendingModules(p: Project): number {
  return p.modules.filter((m) => !(p.installedModules ?? []).includes(m.id) || !sameValues(m.values, p.installedValues?.[m.id] ?? {})).length
}

// Cada cuántas horas se comprueba solo (desde el Panel) si algo ha cambiado a mano.
export const DRIFT_HOURS = 24

/** Lo cambiado fuera de Draupnode que no se ha dado por bueno. */
export function driftOpen(r: DriftReport | undefined) {
  if (!r || r.skipped) return []
  return (r.items ?? []).filter((i) => !(r.accepted ?? []).includes(i.key))
}

/** Nombre corto de una diferencia, para los avisos. */
export function driftLabel(i: { kind: string; module?: string; name: string }): string {
  if (i.kind === 'timer') return t('tarea programada {0} parada', i.name.replace(/\.timer$/, ''))
  if (i.kind === 'container') return t('contenedor {0} parado', i.name)
  const mod = i.module ? moduleName(i.module) : ''
  return mod ? `${mod} · ${i.name}` : i.name
}

// Cada cuántas horas se buscan solas (desde el Panel) versiones nuevas de las imágenes.
export const IMAGES_HOURS = 24

/** Imágenes con versión nueva que se pueden actualizar desde Draupnode o Coolify. */
export function newImages(r: ImageReport | undefined) {
  return (r?.images ?? []).filter((i) => i.status === 'new')
}

/** Proyectos Compose con alguna imagen nueva que Draupnode puede actualizar (no los de Coolify). */
export function updatableProjects(r: ImageReport | undefined): string[] {
  return [...new Set(newImages(r).filter((i) => !i.coolify).flatMap((i) => i.compose.map((c) => c.project)))]
}

/** Lo que falla de un dominio visto desde fuera (lo más grave), o null si va bien. */
export function domainProblem(d: DomainCheck): { id: string; text: string; bad: boolean } | null {
  if (d.dnsError) return { id: 'dns', text: d.dnsError, bad: true }
  if (d.webError && !d.status) return { id: 'web', text: t('la web no responde ({0})', d.webError), bad: true }
  if (d.certError) return { id: 'cert', text: t('certificado: {0}', d.certError), bad: true }
  if (d.certDays !== undefined && d.certDays < 21) return { id: 'certdays', text: d.certDays < 0 ? t('el certificado ha caducado') : t('el certificado caduca en {0} días', d.certDays), bad: d.certDays < 7 }
  if (d.status && d.status >= 500) return { id: 'status', text: t('la web da error {0}', d.status), bad: true }
  if (!d.pointsHere) return { id: 'ip', text: t('el DNS apunta a {0}, no a este servidor', d.ips.join(', ')), bad: false }
  return null
}

// Cada cuántos minutos se miran solos los dominios (desde este equipo, sin SSH).
export const DOMAINS_MINUTES = 30
let watchingDomains = false
/** Mira los dominios de los servidores mientras la app está abierta. */
export function watchDomains() {
  if (watchingDomains) return
  watchingDomains = true
  const tick = async () => {
    for (const s of ui.servers) {
      const r = alerts.domains[s.id]
      const has = (alerts.fichas[s.id]?.overview.sites?.length ?? 0) + (alerts.fichas[s.id]?.overview.coolify?.apps.length ?? 0) + (r?.extra?.length ?? 0)
      if (!has || (r && Date.now() - new Date(r.at).getTime() < DOMAINS_MINUTES * 60000)) continue
      try { alerts.domains[s.id] = await api.CheckDomains(s.id) } catch { /* siguiente vuelta */ }
    }
  }
  setTimeout(tick, 20000)
  setInterval(tick, 5 * 60000)
}
