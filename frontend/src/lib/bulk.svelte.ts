// Tareas en grupo: aplicar módulos, instalar actualizaciones o reiniciar en
// varios servidores, uno detrás de otro. Si un servidor pide una contraseña
// se pregunta (como siempre); si se cancela o falla, se sigue con el siguiente.
import { api, errorText, type DockerResult } from './api'
import { ui, startRun, refreshProjects, toast } from './state.svelte'
import { withConnection } from './connect'
import { rememberOverview, alerts, updatableProjects } from './alerts.svelte'
import { t } from './i18n.svelte'

export type BulkKind = 'apply' | 'simulate' | 'upgrade' | 'reboot' | 'images'
export interface BulkJob {
  serverId: string
  projectId?: string
  kind: BulkKind
  state: 'wait' | 'run' | 'ok' | 'fail' | 'skip'
  detail?: string
}

export const bulk = $state({ title: '', jobs: [] as BulkJob[], running: false, stop: false })

export const kindLabel = (k: BulkKind) =>
  k === 'apply' ? t('Aplicar módulos') : k === 'simulate' ? t('Simular') : k === 'upgrade' ? t('Instalar actualizaciones') : k === 'images' ? t('Actualizar imágenes') : t('Reiniciar')

/** Espera a que termine una ejecución (sus eventos llegan por ui.runs). */
export function waitRun(projectId: string, runId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const tm = setInterval(() => {
      const r = ui.runs[projectId]
      if (!r || r.runId !== runId) return
      if (r.done) {
        clearInterval(tm)
        resolve(!!r.summary?.ok)
      }
    }, 500)
  })
}

async function runJob(j: BulkJob) {
  const srv = ui.servers.find((s) => s.id === j.serverId)
  if (!srv) { j.state = 'skip'; j.detail = t('servidor no encontrado'); return }
  if (j.kind === 'apply' || j.kind === 'simulate') {
    const pid = j.projectId ?? ui.projects.find((p) => p.serverId === j.serverId)?.id
    if (!pid) { j.state = 'skip'; j.detail = t('sin módulos'); return }
    j.projectId = pid
    const check = j.kind === 'simulate'
    const r = await withConnection(srv, (s, a, u) => api.RunProject(pid, check, s, a, u))
    if (!r || r.status !== 'started') { j.state = r ? 'fail' : 'skip'; j.detail = r?.message || t('Cancelado'); return }
    startRun(pid, r.runId!, check)
    const ok = await waitRun(pid, r.runId!)
    j.state = ok ? 'ok' : 'fail'
    if (!ok) j.detail = ui.runs[pid]?.summary?.error || t('Ha fallado: ábrelo para ver qué pasó.')
    return
  }
  if (j.kind === 'images') {
    const projects = updatableProjects(alerts.images[j.serverId])
    if (!projects.length) { j.state = 'skip'; j.detail = t('nada que actualizar'); return }
    const r = await withConnection(srv, (s, a, u) => api.UpdateImages(j.serverId, projects, s, a, u))
    if (!r) { j.state = 'skip'; j.detail = t('Cancelado'); return }
    if (r.report) alerts.images[j.serverId] = r.report
    j.state = r.status === 'ok' ? 'ok' : 'fail'
    j.detail = r.status === 'ok' ? '' : r.message || t('No se pudo')
    return
  }
  const call = j.kind === 'upgrade' ? api.ServerUpgrade : api.ServerReboot
  const r = await withConnection<DockerResult>(srv, (s, a, u) => call(j.serverId, s, a, u))
  if (!r) { j.state = 'skip'; j.detail = t('Cancelado'); return }
  j.state = r.status === 'ok' ? 'ok' : 'fail'
  j.detail = r.status === 'ok' ? (j.kind === 'reboot' ? t('reiniciándose: vuelve en un par de minutos') : '') : r.message || t('No se pudo')
  if (r.status === 'ok' && j.kind === 'upgrade') {
    // Vuelve a leer la ficha para que el Panel deje de contar lo ya instalado.
    try {
      const o = await api.ServerOverview(j.serverId, '', '', '')
      if (o.status === 'ok' && o.overview) rememberOverview(j.serverId, o.overview)
    } catch { /* se leerá luego */ }
  }
}

/** Lanza las tareas en orden. Devuelve cuántas salieron bien. */
export async function runBulk(title: string, jobs: Omit<BulkJob, 'state'>[]): Promise<number> {
  if (bulk.running) {
    toast(t('Ya hay tareas en grupo en marcha: espera a que terminen.'), 'error')
    return 0
  }
  bulk.title = title
  bulk.jobs = jobs.map((j) => ({ ...j, state: 'wait' }))
  bulk.running = true
  bulk.stop = false
  try {
    for (const j of bulk.jobs) {
      if (bulk.stop) { j.state = 'skip'; j.detail = t('No se llegó a hacer'); continue }
      j.state = 'run'
      try { await runJob(j) } catch (e) { j.state = 'fail'; j.detail = errorText(e) }
    }
  } finally {
    bulk.running = false
    await refreshProjects()
  }
  const ok = bulk.jobs.filter((j) => j.state === 'ok').length
  toast(t('{0}: {1} de {2} bien', title, ok, bulk.jobs.length), ok === bulk.jobs.length ? 'ok' : 'error')
  return ok
}

/** Para después de la tarea en curso (la que está en marcha termina). */
export function stopBulk() {
  bulk.stop = true
}

export function closeBulk() {
  if (!bulk.running) bulk.jobs = []
}
