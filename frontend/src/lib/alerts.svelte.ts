// Avisos de la app: lo que conviene mirar, en un solo sitio (pantalla
// «Avisos», el número en el menú y la campana de arriba). Así no hace falta
// una franja en todas las pantallas: solo el Panel los enseña.
import { api, isDesktop, onEvent, type BackupDue, type BackupFetchProgress, type BackupResult } from './api'
import { ui, toast, refreshProjects } from './state.svelte'
import { withConnection } from './connect'

export type AlertItem =
  | { kind: 'backups'; key: string; projectId: string; name: string; server: string; due: BackupDue }
  | { kind: 'failed'; key: string; projectId: string; name: string; server: string; at: string; error: string }
  | { kind: 'export'; key: string; last: string | null }
  | { kind: 'update'; key: string; latest: string; url: string }
  | { kind: 'down'; key: string; serverId: string; name: string; since: string }

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
      for (const p of await api.PingServers()) {
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
