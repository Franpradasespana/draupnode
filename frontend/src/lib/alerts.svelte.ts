// Avisos de la app: lo que conviene mirar, en un solo sitio (pantalla
// «Avisos», el número en el menú y la campana de arriba). Así no hace falta
// una franja en todas las pantallas: solo el Panel los enseña.
import { api, onEvent, type BackupDue, type BackupFetchProgress, type BackupResult } from './api'
import { ui, toast, refreshProjects } from './state.svelte'
import { withConnection } from './connect'

export type AlertItem =
  | { kind: 'backups'; key: string; projectId: string; name: string; server: string; due: BackupDue }
  | { kind: 'failed'; key: string; projectId: string; name: string; server: string; at: string; error: string }

export const alerts = $state({
  due: [] as BackupDue[],
  // Ocultos hasta que se vuelva a abrir la app.
  hidden: [] as string[],
  busy: '',
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
