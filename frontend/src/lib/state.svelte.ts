// Estado global de la interfaz (Svelte 5 runes).
import { api, onEvent, vaultCode, type RecipeView, type AppInfo, type ModulesInfo, type Project, type RunEvent, type RunSummary, type SecretsInfo, type Server } from './api'
import { applyPalette, BUILTIN_PALETTES, DEFAULT_PALETTE_ID, isHex, COLOR_KEYS, type Palette } from './palettes'

export type View = 'dashboard' | 'servers' | 'catalog' | 'projects' | 'lab' | 'docker' | 'terminal' | 'settings' | 'alerts'

export function moduleName(id: string): string {
  return ui.modules?.modules.find((m) => m.id === id)?.name ?? id
}

export interface TaskRow {
  name: string
  role: string
  status: 'running' | 'ok' | 'changed' | 'failed' | 'skipped'
  handler?: boolean
  msg?: string
  note?: string
  diffs: string[]
}

export interface RunState {
  runId: string
  projectId: string
  check: boolean
  /** Módulos que se desinstalan (si es una desinstalación). */
  uninstall?: string[]
  startedAt: number
  stage: string
  tasks: TaskRow[]
  lines: string[]
  notes: string[]
  stats?: Record<string, number>
  summary?: RunSummary
  done: boolean
}

export const ui = $state({
  view: 'dashboard' as View,
  info: null as AppInfo | null,
  secrets: null as SecretsInfo | null,
  servers: [] as Server[],
  modules: null as ModulesInfo | null,
  projects: [] as Project[],
  // Proyecto desplegado abierto (su pantalla de aplicar y módulos), dentro de la ficha de su servidor.
  projectId: null as string | null,
  // Ficha de servidor abierta (null = lista de servidores).
  serverId: null as string | null,
  // Recetas («Proyectos»): la abierta ('' = nueva, null = lista) y la lista.
  recipeId: null as string | null,
  recipes: [] as RecipeView[],
  // Servidor por el que se filtra la lista de proyectos (null = todos).
  projectServer: null as string | null,
  // Servidor que se muestra en la barra de estado (el último elegido).
  activeServer: readLocal('draupnode.activeServer') as string | null,
  // Ventana de ayuda abierta y sección que enseña.
  help: null as View | null,
  // Ejecuciones por proyecto (la última de cada uno).
  runs: {} as Record<string, RunState>,
  // Diálogos genéricos (los pinta App.svelte).
  ask: null as { title: string; message: string; label: string; password: boolean; resolve: (v: string | null) => void } | null,
  confirm: null as { title: string; message: string; detail?: string; confirmLabel: string; danger?: boolean; resolve: (ok: boolean) => void } | null,
  // Diálogo de la bóveda cifrada (lo pinta App.svelte).
  // Ventana «¿Dónde guardar la contraseña?» (la pinta App.svelte).
  storePrompt: null as { initial: 'keyring' | 'vault'; resolve: (v: 'keyring' | 'vault' | null) => void } | null,
  vaultPrompt: null as { mode: 'create' | 'unlock'; reason: string; resolve: (ok: boolean) => void } | null,
  themeId: DEFAULT_PALETTE_ID,
  custom: [] as Palette[],
  toast: null as { kind: 'ok' | 'error'; text: string } | null,
})

function readLocal(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

/** Elige el servidor de la barra de estado (y lo recuerda). */
export function setActiveServer(id: string) {
  ui.activeServer = id
  try { localStorage.setItem('draupnode.activeServer', id) } catch { /* sin almacenamiento */ }
}

/** Abre la ficha de un servidor. */
export function openServer(id: string) {
  setActiveServer(id)
  ui.serverId = id
  ui.projectId = null
  ui.view = 'servers'
}
/** Compatibilidad: antes abría la lista de proyectos de un servidor; ahora su ficha. */
export const openServerProjects = openServer

/** Abre el proyecto desplegado en un servidor (su pantalla de aplicar y módulos). */
export function openDeployment(projectId: string) {
  const p = ui.projects.find((x) => x.id === projectId)
  if (p) setActiveServer(p.serverId)
  ui.serverId = p?.serverId ?? ui.serverId
  ui.projectId = projectId
  ui.view = 'servers'
}

/** Abre una receta (proyecto) para editarla; '' = nueva. */
export function openRecipe(id: string) {
  ui.recipeId = id
  ui.view = 'projects'
}

/** Servidor del que habla la pantalla actual, o el último elegido. */
export function contextServerId(): string | null {
  if (ui.view === 'servers' && ui.serverId) return ui.serverId
  if (ui.projectId) {
    const p = ui.projects.find((x) => x.id === ui.projectId)
    if (p) return p.serverId
  }
  if (ui.activeServer && ui.servers.some((s) => s.id === ui.activeServer)) return ui.activeServer
  return ui.servers[0]?.id ?? null
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function toast(text: string, kind: 'ok' | 'error' = 'ok') {
  ui.toast = { kind, text }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (ui.toast = null), kind === 'error' ? 6000 : 3000)
}

export function allPalettes(): Palette[] {
  return [...BUILTIN_PALETTES, ...ui.custom]
}

export function currentPalette(): Palette {
  return allPalettes().find((p) => p.id === ui.themeId) ?? BUILTIN_PALETTES[0]
}

/** Valida paletas importadas/guardadas (descarta las que estén mal). */
export function sanitizePalettes(raw: unknown): Palette[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((p): Palette[] => {
    if (!p || typeof p !== 'object') return []
    const o = p as Record<string, any>
    if (typeof o.name !== 'string' || !o.colors) return []
    const ok = COLOR_KEYS.every(({ key }) => typeof o.colors[key] === 'string' && isHex(o.colors[key]))
    if (!ok) return []
    const id = typeof o.id === 'string' && o.id.startsWith('custom-') ? o.id : 'custom-' + Math.random().toString(36).slice(2, 9)
    const mode = o.mode === 'light' || o.mode === 'mixed' ? o.mode : 'dark'
    return [{ id, name: o.name.slice(0, 40), tag: String(o.tag ?? 'Personalizada').slice(0, 40), mode, colors: { ...o.colors }, custom: true }]
  })
}

export async function persistSettings() {
  await api.SaveSettings({ theme: ui.themeId, customPalettes: ui.custom })
}

export function setTheme(id: string, persist = true) {
  ui.themeId = id
  applyPalette(currentPalette().colors)
  if (persist) persistSettings().catch(() => toast('No se pudo guardar el tema', 'error'))
}

export async function refreshServers() {
  ui.servers = await api.ListServers()
}

export async function refreshProjects() {
  const [p, r] = await Promise.all([api.ListProjects(), api.ListRecipes()])
  ui.projects = p
  ui.recipes = r
}

export async function refreshModules(reload = false) {
  ui.modules = reload ? await api.ReloadModules() : await api.ListModules()
}

/** Pide un texto (contraseña…) en un diálogo. null si se cancela. */
export function ask(title: string, message: string, label = 'Contraseña', password = true): Promise<string | null> {
  return new Promise((resolve) => {
    ui.ask = { title, message, label, password, resolve: (v) => { ui.ask = null; resolve(v) } }
  })
}

/** Pide confirmación. */
export function confirmDialog(o: { title: string; message: string; detail?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    ui.confirm = { confirmLabel: 'Aceptar', ...o, resolve: (ok) => { ui.confirm = null; resolve(ok) } }
  })
}

// Eventos que llegan antes de que la interfaz registre la ejecución.
const pending: Record<string, RunEvent[]> = {}

export function startRun(projectId: string, runId: string, check: boolean, uninstall?: string[]) {
  ui.runs[projectId] = { runId, projectId, check, uninstall, startedAt: Date.now(), stage: 'Conectando…', tasks: [], lines: [], notes: [], done: false }
  for (const e of pending[runId] ?? []) handleRunEvent(e)
  delete pending[runId]
}

function handleRunEvent(e: RunEvent) {
  const r = ui.runs[e.projectId]
  if (!r || r.runId !== e.runId) {
    ;(pending[e.runId] ||= []).push(e)
    return
  }
  const last = r.tasks[r.tasks.length - 1]
  if (e.kind === 'line') {
    if (e.text?.trim()) r.lines.push(e.text)
    if (r.lines.length > 4000) r.lines.splice(0, r.lines.length - 4000)
    return
  }
  if (e.kind === 'done') {
    r.done = true
    r.summary = e.summary
    if (last?.status === 'running') last.status = e.summary?.ok ? 'ok' : 'failed'
    refreshProjects()
    refreshServers() // p. ej. si al aplicar cambió el puerto SSH
    return
  }
  const ev = e.ev ?? {}
  switch (ev.ev) {
    case 'notice': // aviso de Draupnode (no de una tarea)
      r.notes.push(String(ev.msg))
      break
    case 'stage':
      r.stage = ev.name
      r.lines.push('==> ' + ev.name)
      break
    case 'task': {
      const name = String(ev.name).replace(/^[\w-]+ : /, '')
      r.tasks.push({ name: name === 'Gathering Facts' ? 'Recoger datos del servidor' : name, role: ev.role || '', handler: !!ev.handler, status: 'running', diffs: [] })
      r.stage = 'Ejecutando Ansible'
      break
    }
    case 'ok':
      if (last) {
        if (last.status === 'running' || last.status === 'ok') last.status = ev.changed ? 'changed' : 'ok'
        else if (ev.changed) last.status = 'changed'
        if (ev.note) {
          last.note = ev.note
          r.notes.push(ev.note)
        }
      }
      break
    case 'skipped':
      if (last && last.status === 'running') last.status = 'skipped'
      break
    case 'failed':
    case 'item_failed':
      if (last && !ev.ignored) {
        last.status = 'failed'
        last.msg = [last.msg, ev.item ? `[${ev.item}] ${ev.msg}` : ev.msg].filter(Boolean).join('\n')
      }
      break
    case 'diff':
      last?.diffs.push(ev.text)
      break
    case 'stats':
      r.stats = ev as Record<string, number>
      break
  }
}

export async function refreshSecrets() {
  ui.secrets = await api.SecretsInfo()
}

/** Abre el diálogo para crear o desbloquear la bóveda. true si se consiguió. */
export function requestVault(mode: 'create' | 'unlock', reason = ''): Promise<boolean> {
  return new Promise((resolve) => {
    ui.vaultPrompt = {
      mode,
      reason,
      resolve: (ok) => {
        ui.vaultPrompt = null
        refreshSecrets().finally(() => resolve(ok))
      },
    }
  })
}

/** Pregunta dónde guardar una contraseña. null si se cancela. */
export function requestStore(current: '' | 'keyring' | 'vault' = ''): Promise<'keyring' | 'vault' | null> {
  let initial: 'keyring' | 'vault' = current || ui.secrets?.effective || 'vault'
  if (initial === 'keyring' && !ui.secrets?.keyring.available) initial = 'vault'
  return new Promise((resolve) => {
    ui.storePrompt = {
      initial,
      resolve: (v) => {
        ui.storePrompt = null
        resolve(v)
      },
    }
  })
}

export function storeName(s: string): string {
  if (s === 'keyring') return ui.secrets?.keyring.name ?? 'el llavero del sistema'
  if (s === 'vault') return 'la bóveda cifrada de Draupnode'
  return '—'
}

/**
 * Ejecuta fn; si el backend responde que la bóveda falta o está bloqueada,
 * pide crearla/desbloquearla y reintenta una vez.
 */
export async function withVault<T>(fn: () => Promise<T>, reason = ''): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    const code = vaultCode(e)
    if (!code) throw e
    const ok = await requestVault(code === 'missing' ? 'create' : 'unlock', reason)
    if (!ok) throw 'Cancelado: la contraseña no se ha guardado'
    return await fn()
  }
}

export async function boot() {
  const [info, settings, secrets] = await Promise.all([api.AppInfo(), api.GetSettings(), api.SecretsInfo()])
  ui.info = info
  ui.secrets = secrets
  ui.custom = sanitizePalettes(settings.customPalettes)
  setTheme(settings.theme || DEFAULT_PALETTE_ID, false)
  onEvent('run', handleRunEvent)
  await Promise.all([refreshServers(), refreshProjects(), refreshModules()])
}

// ---- formato -------------------------------------------------------------

export function kbToGB(kb?: string): string {
  const n = Number(kb)
  if (!kb || !Number.isFinite(n)) return '—'
  const gb = n / 1024 / 1024
  return gb >= 10 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`
}

export function timeAgo(iso?: string): string {
  if (!iso) return 'nunca'
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.round(s / 60)} min`
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`
  return `hace ${Math.round(s / 86400)} días`
}
