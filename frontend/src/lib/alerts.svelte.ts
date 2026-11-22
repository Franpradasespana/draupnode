// Avisos de la app: lo que conviene mirar, en un solo sitio (pantalla
// «Avisos», el número en el menú y la campana de arriba). Así no hace falta
// una franja en todas las pantallas: solo el Panel los enseña.
import { api, isDesktop, onEvent, type BackupDue, type BackupFetchProgress, type BackupResult, type CachedOverview, type ServerOverview } from './api'
import { ui, toast, refreshProjects } from './state.svelte'
import { withConnection } from './connect'

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
            const name = ui.servers.find((x) => x.id === p.id)?.name ?? 'El servidor'
            toast(`${name} vuelve a responder`)
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
    for (const f of serverFindings(c.overview)) {
      out.push({ kind: 'server', key: `s:${sid}:${f.id}`, serverId: sid, name: srv.name, text: f.text, bad: f.bad, at: c.at })
    }
  }
  for (const r of ui.recipes) {
    for (const d of r.deployments) {
      if (d.applied && !d.pending) continue
      out.push({ kind: 'pending', key: `p:${d.projectId}:${d.applied}`, projectId: d.projectId, name: r.name, server: d.serverName, applied: d.applied })
    }
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
      toast(`Copias de «${d.name}» traídas a ${r.fetch.dir}`)
      return true
    }
    if (!quiet && r && r.status !== 'ok') toast(r.message || 'No se pudieron traer', 'error')
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
export const BACKUP_HOURS = 26

/** Lo que conviene mirar en la última ficha leída de un servidor. */
export function serverFindings(ov: ServerOverview): { id: string; text: string; bad: boolean }[] {
  const out: { id: string; text: string; bad: boolean }[] = []
  for (const d of ov.disks ?? []) {
    const pct = d.size ? Math.round((d.used / d.size) * 100) : 0
    if (pct >= DISK_WARN) out.push({ id: 'disk:' + d.mount, text: `Disco ${d.mount} al ${pct} %`, bad: pct >= 95 })
  }
  const sick = (ov.containers ?? []).filter((c) => ['restarting', 'dead'].includes(c.state) || c.health === 'unhealthy')
  if (sick.length) out.push({ id: 'ctr:' + sick.map((c) => c.name).sort().join(','), text: `${sick.length === 1 ? 'Contenedor con problemas' : sick.length + ' contenedores con problemas'}: ${sick.map((c) => c.name).join(', ')}`, bad: true })
  if (ov.failed?.length) out.push({ id: 'svc:' + [...ov.failed].sort().join(','), text: `${ov.failed.length === 1 ? 'Servicio caído' : 'Servicios caídos'}: ${ov.failed.join(', ')}`, bad: true })
  for (const b of ov.backups ?? []) {
    if (b.running) continue
    if (!b.ok) out.push({ id: 'bk:' + b.slug, text: `La última copia de «${b.slug}» falló`, bad: true })
    else if (b.ago === null) out.push({ id: 'bk0:' + b.slug, text: `No consta ninguna copia de «${b.slug}»`, bad: false })
    else if (b.ago > BACKUP_HOURS * 3600) out.push({ id: 'bkold:' + b.slug, text: `La última copia de «${b.slug}» es de hace ${Math.round(b.ago / 3600)} h`, bad: false })
  }
  return out
}

/** Guarda en memoria una ficha recién leída (ServerOverview ya la deja en disco). */
export function rememberOverview(serverId: string, overview: ServerOverview) {
  alerts.fichas[serverId] = { at: new Date().toISOString(), overview }
}
