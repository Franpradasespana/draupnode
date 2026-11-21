// Puente con el backend Go (Wails expone los métodos en window.go.main.App).
// Si se abre la interfaz en un navegador normal (npm run dev) se usa un
// simulador en memoria para poder diseñar sin el backend.

export interface CheckResult {
  at: string
  ok: boolean
  error?: string
  facts?: Record<string, string>
  durationMs: number
}

export type AuthMethod = 'key' | 'password' | 'agent'
export type SecretStore = '' | 'keyring' | 'vault'

export interface Server {
  id: string
  name: string
  host: string
  port: number
  user: string
  authMethod: AuthMethod
  keyPath: string
  keyEncrypted: boolean
  secretStore: SecretStore
  notes: string
  createdAt?: string
  lastCheck?: CheckResult | null
  hasSecret?: boolean
}

export interface AppInfo {
  version: string
  configDir: string
  os: string
}

export interface VaultStatus {
  exists: boolean
  unlocked: boolean
  path: string
  entries: number
}

export interface SecretsInfo {
  keyring: { available: boolean; name: string; suggestions?: { name: string; description: string; command?: string }[] }
  vault: VaultStatus
  backend: 'auto' | 'keyring' | 'vault'
  effective: 'keyring' | 'vault'
}

export interface Settings {
  theme: string
  secretBackend?: string
  customPalettes?: unknown
}

export type TestStatus =
  | 'ok' | 'needs_secret' | 'bad_secret' | 'vault_locked' | 'vault_missing'
  | 'unknown_host' | 'host_changed' | 'error'

export interface TestResult {
  status: TestStatus
  secretKind?: 'passphrase' | 'password'
  message: string
  keyType?: string
  fingerprint?: string
  facts?: Record<string, string>
  durationMs: number
}

export interface KeyInfo {
  path: string
  name: string
  format: 'openssh' | 'pem' | 'ppk' | ''
  keyType?: string
  encrypted: boolean
  comment?: string
  source?: 'ssh-dir' | 'ssh-config'
  error?: string
}

export interface ConfigHost {
  alias: string
  hostName: string
  user: string
  port: number
  identityFile: string
}

// ---- módulos y proyectos ----

export interface ModVariable {
  name: string
  label: string
  help?: string
  type: 'string' | 'int' | 'bool' | 'select' | 'list' | 'secret'
  default: unknown
  options?: string[]
  required?: boolean
  pattern?: string
  patternHelp?: string
  min?: number
  max?: number
  placeholder?: string
  managed?: boolean // lo rellena Draupnode: no sale en los formularios
}

export interface Module {
  links?: { label: string; url: string }[]
  proxySite?: { domain: string; port: string }
  udpPortsFrom?: string[]
  id: string
  name: string
  version: string
  category: string
  description: string
  details?: string
  depends: string[] | null
  requires: { os?: string[]; minRamMb?: number; minDiskGb?: number }
  variables: ModVariable[] | null
  firewallPorts?: number[] | null
  /** Variables (int) cuyo valor es un puerto que hay que abrir en el Cortafuegos. */
  firewallPortsFrom?: string[] | null
  /** Módulos que no pueden ir en el mismo proyecto. */
  conflicts?: string[] | null
  /** Si están en el proyecto, este módulo va detrás. */
  after?: string[] | null
  checks?: { containerFree?: string }[] | null
  secrets?: { file: string; label: string }[] | null
  uninstallable?: boolean
  uninstallWarning?: string
  uninstallData?: string
  noUninstall?: string
  source: 'builtin' | 'user'
  files: string[] | null
}

export interface ModulesInfo {
  modules: Module[]
  errors: string[]
  userDir: string
}

export interface ProjectModule {
  id: string
  values: Record<string, unknown>
}

export interface RunSummary {
  at: string
  check: boolean
  ok: boolean
  canceled?: boolean
  changed: number
  failed: number
  tasks: number
  error?: string
  logFile?: string
  durationMs: number
  uninstall?: boolean
}

export type UninstallChoice = { action: 'remove' } | { action: 'uninstall'; purge: boolean } | null

export interface UninstallCheck {
  ok: boolean
  error?: string
  modules: { id: string; name: string; warning?: string; data?: string }[]
  hasData: boolean
  server: string
  selected: string[]
}

export interface Project {
  id: string
  name: string
  serverId: string
  modules: ProjectModule[]
  createdAt?: string
  updatedAt?: string
  lastRun?: RunSummary | null
  appliedAt?: string | null
  collapsed?: string[] | null
  slug?: string
  /** Módulos que el proyecto ha instalado alguna vez (quitar uno del proyecto no lo desinstala). */
  installedModules?: string[] | null
  installedValues?: Record<string, Record<string, unknown>> | null
  backupsFetched?: FetchInfo | null
  backupsAuto?: { mode: 'off' | 'warn' | 'fetch'; days: number } | null
  recipeId?: string
  overrides?: { added?: string[]; removed?: string[]; values?: Record<string, Record<string, unknown>> } | null
}

export interface FetchInfo {
  at: string
  dir: string
  bytes: number
  files: number
}

export interface Snapshot {
  id: string
  time: string
  tags: string[]
  paths: string[]
  host: string
  bytes?: number
}

export interface BackupResult extends RunStart {
  ok: boolean
  snapshots?: Snapshot[]
  output?: string
  fetch?: FetchInfo
}

export interface MonitorStats {
  cpu: number
  ram: number
  ramTotal: number
  disk: number
  diskFree: number
  load: number
  cpus: number
  uptime: number
  containers: number
  targets: { job: string; up: boolean }[]
  at: string
}

export interface MonitorResult extends RunStart {
  url?: string
  stats?: MonitorStats
}

export interface SnapEntry {
  name: string
  path: string
  type: string
  size: number
  mtime: string
}

export interface BackupRestoreResult extends BackupResult {
  entries?: SnapEntry[]
}

export interface BackupFetchProgress {
  projectId: string
  done: number
  total: number
  stage: string
}

export interface UserModule {
  id: string
  name: string
  files: string[]
  problems: string[]
  notes: string[]
  usedBy?: string[]
}

export interface RunEntry {
  projectId: string
  project: string
  name: string
  at: string
  mode: string
  known: boolean
  ok: boolean
  canceled: boolean
  changed: number
  failed: number
  error?: string
  durationMs: number
}

export interface BackupManifest {
  version: number
  created: string
  app: string
  servers: number
  templates: number
  deployments: number
  vaultEntries: number
  keyring: number
  modules: number
  keys: { serverId: string; server: string; file: string; origPath: string }[]
}

export interface ProjectSecretsSummary {
  vaultExists: boolean
  generated: number
  typed: string[]
  at?: string
}

export interface ProjectSecret {
  kind: 'generated' | 'typed'
  module: string
  label: string
  name: string
  value: string
}

export interface ProjectCheck {
  order: string[]
  added: string[]
  errors: Record<string, Record<string, string>>
  general: string[]
  warnings: string[]
}

export type RunStatus =
  | 'started' | 'ok' | 'needs_secret' | 'bad_secret' | 'vault_locked' | 'vault_missing' | 'unknown_host'
  | 'host_changed' | 'needs_sudo' | 'bad_sudo' | 'busy' | 'error'

export interface RunStart {
  status: RunStatus
  runId?: string
  message?: string
  secretKind?: 'passphrase' | 'password'
  keyType?: string
  fingerprint?: string
}

export interface RunEvent {
  runId: string
  projectId: string
  kind: 'line' | 'ev' | 'done'
  text?: string
  ev?: Record<string, any>
  summary?: RunSummary
}

// ---- servidor de pruebas (Docker local) ----

export interface LabStatus {
  docker: {
    os: string
    installed: boolean
    version?: string
    problem: '' | 'missing' | 'daemon' | 'permission' | 'other'
    message?: string
    needsRelogin?: boolean
    viaGroup: boolean
    canAutoFix: boolean
    installCommand: string
    downloadUrl?: string
  }
  server: { exists: boolean; running: boolean; startedAt?: string; byPort?: boolean }
  keys: { path: string; label: string; passphrase?: string }[]
  fingerprint: string
  host: string
  port: number
  user: string
  password: string
  coolifyUrl: string
  coolifyUp: boolean
  serverId?: string
  busy?: string
}

export interface LabEvent {
  action: string
  kind: 'line' | 'done'
  text?: string
  ok?: boolean
  error?: string
}

export interface ServerLive {
  reachable: boolean
  latencyMs: number
  error?: string
  webUrl?: string
  webLabel?: string
}

// ---- creador de Dockerfile ----
export interface DockerSpec {
  stack: string
  framework: string
  name: string
  version: string
  port: number
  hostPort: number
  start: string
  pyInstall: string
  module: string
  extraPip: string[]
  djangoMigrate: boolean
  djangoCollectstatic: boolean
  djangoSuperuser: boolean
  nodePm: string
  nodeBuild: boolean
  nodeLock: boolean
  staticDir: string
  javaBuild: string
  javaWrapper: boolean
  docRoot: string
  laravelMigrate: boolean
  goMain: string
  systemPackages: string[]
  volumes: string[]
  envKeys: string[]
  nonRoot: boolean
  healthPath: string
  postgres: boolean
  mariadb: boolean
  redis: boolean
  dbMode: string
  sharedNetwork: string
  sharedHost: string
  sideBySide: boolean
  proxy: boolean
  proxyDomain: string
  proxyPort: number
  maxBodyMb: number
}

export interface DockerAnalysis {
  dir: string
  name: string
  spec: DockerSpec
  evidence: string[]
  warnings: string[]
  existing: string[]
  alternatives: string[]
}

export interface DockerFile {
  name: string
  content: string
  exists: boolean
}

export interface DockerPreview {
  files: DockerFile[]
  errors: string[]
}

export interface AlertsResult extends RunStart {
  ok: boolean
  output?: string
}

export interface BackupTargetResult {
  targetProjectId: string
  targetProjectName: string
  targetIsNew: boolean
  url: string
  notes: string[]
}

export interface DockerInfo {
  versions: Record<string, string[]>
  docker: boolean
}

export interface Recipe {
  id: string
  name: string
  notes?: string
  modules: ProjectModule[]
  createdAt?: string
  updatedAt?: string
}

export interface Deployment {
  projectId: string
  serverId: string
  serverName: string
  applied: boolean
  pending: boolean
  sameRecipe: boolean
}

export interface RecipeView extends Recipe {
  deployments: Deployment[]
}

export interface RecipeDiff {
  recipeId: string
  recipeName: string
  added: string[]
  removed: string[]
  changed: Record<string, string[]>
}

export interface ServerOverviewResult extends RunStart {
  overview?: ServerOverview
}

export interface ServerOverview {
  at: number
  errors: string[]
  docker: boolean
  system?: { hostname: string; os: string; kernel: string; uptime: number; load: number[]; cpus: number; cpu: number; memTotal: number; memAvailable: number; swapTotal: number; swapFree: number }
  disks?: { mount: string; size: number; used: number; free: number }[]
  containers?: { id: string; name: string; image: string; state: string; health: string; started: string; restarts: number; compose: string; draupnode: string; coolify: string; ports: string[]; cpu?: string; mem?: string }[]
  databases?: { container: string; engine: string; image: string; databases: { name: string; size: number }[] }[]
  coolify?: { apps: { kind: string; name: string; urls: string[]; status: string }[]; panel: string } | null
  sites?: { server: string; domain: string; target: string; https: boolean; file: string }[]
  failed?: string[]
  ports?: { proto: string; addr: string; port: number; process: string; public: boolean }[]
  firewall?: { active: boolean; tcp: string[]; udp: string[] }
}

export interface ServerLogsResult extends RunStart {
  text?: string
}

export interface BackupDue {
  projectId: string
  name: string
  mode: 'warn' | 'fetch'
  days: number
  age: number // -1 = nunca
  dest: string
}

export interface DockerLabEvent {
  kind: 'stage' | 'line' | 'done'
  text?: string
  ok?: boolean
  error?: string
  url?: string
  http?: number
  output?: string
}

export interface DockerBuildEvent {
  kind: 'line' | 'done'
  text?: string
  ok?: boolean
  error?: string
  image?: string
  secs?: number
}

interface Backend {
  AppInfo(): Promise<AppInfo>
  SecretsInfo(): Promise<SecretsInfo>
  SetSecretBackend(b: string): Promise<void>
  VaultCreate(master: string): Promise<void>
  VaultUnlock(master: string): Promise<void>
  VaultLock(): Promise<void>
  ListServers(): Promise<Server[]>
  SaveServer(s: Server, secret: string, saveSecret: boolean, storeChoice: string): Promise<Server>
  DeleteServer(id: string): Promise<void>
  InspectKey(path: string): Promise<KeyInfo>
  FindKeys(): Promise<KeyInfo[]>
  SSHConfigHosts(): Promise<ConfigHost[]>
  PickKeyFile(): Promise<string>
  TestConnection(id: string, secret: string, acceptFingerprint: string): Promise<TestResult>
  GetSettings(): Promise<Settings>
  SaveSettings(s: Settings): Promise<void>
  ListModules(): Promise<ModulesInfo>
  ReloadModules(): Promise<ModulesInfo>
  ModuleFile(id: string, file: string): Promise<string>
  OpenModulesDir(): Promise<void>
  ListUserModules(): Promise<UserModule[]>
  ReadUserModuleFile(id: string, rel: string): Promise<string>
  SaveUserModuleFile(id: string, rel: string, content: string): Promise<UserModule>
  DeleteUserModuleFile(id: string, rel: string): Promise<UserModule>
  CreateUserModule(id: string, from: string): Promise<UserModule>
  DeleteUserModule(id: string): Promise<void>
  OpenUserModuleDir(id: string): Promise<void>
  ListProjects(): Promise<Project[]>
  CheckProject(p: Project): Promise<ProjectCheck>
  SaveProject(p: Project): Promise<Project>
  DeleteProject(id: string): Promise<void>
  SetProjectCollapsed(id: string, modules: string[]): Promise<void>
  SetProjectSecret(projectId: string, variable: string, value: string): Promise<void>
  OpenGrafana(projectId: string, secret: string, accept: string): Promise<MonitorResult>
  OpenAppTunnel(projectId: string, moduleId: string, secret: string, accept: string): Promise<MonitorResult>
  MonitorSummary(projectId: string, secret: string, accept: string): Promise<MonitorResult>
  BackupSnapshots(projectId: string, remote: boolean, secret: string, accept: string, sudoPassword: string): Promise<BackupResult>
  BackupNow(projectId: string, secret: string, accept: string, sudoPassword: string): Promise<BackupResult>
  FetchBackups(projectId: string, dest: string, secret: string, accept: string, sudoPassword: string): Promise<BackupResult>
  ChooseBackupFolder(projectId: string): Promise<string>
  BackupLs(projectId: string, snapId: string, dir: string, secret: string, accept: string, sudoPassword: string): Promise<BackupRestoreResult>
  BackupRestore(projectId: string, snapId: string, target: string, paths: string[], secret: string, accept: string, sudoPassword: string): Promise<BackupResult>
  BackupRestoreDB(projectId: string, snapId: string, dumpPath: string, container: string, dbName: string, replace: boolean, secret: string, accept: string, sudoPassword: string): Promise<BackupResult>
  BackupDownload(projectId: string, snapId: string, paths: string[], dest: string, secret: string, accept: string, sudoPassword: string): Promise<BackupResult>
  DefaultBackupFolder(projectId: string): Promise<string>
  CheckUninstall(projectId: string, modules: string[]): Promise<UninstallCheck>
  UninstallModules(projectId: string, modules: string[], purge: boolean, secret: string, accept: string, sudoPassword: string): Promise<RunStart>
  ProjectSecretsInfo(projectId: string): Promise<ProjectSecretsSummary>
  ProjectSecrets(projectId: string, master: string): Promise<ProjectSecret[]>
  BackupStatus(): Promise<{ lastExport?: string | null }>
  TerminalOpen(serverId: string, secret: string, accept: string, cols: number, rows: number): Promise<RunStart & { id?: string }>
  TerminalInput(id: string, data: string): Promise<void>
  TerminalResize(id: string, cols: number, rows: number): Promise<void>
  TerminalClose(id: string): Promise<void>
  ExportBackup(password: string, withKeys: boolean): Promise<string>
  ChooseBackupFile(): Promise<string>
  InspectBackup(path: string, password: string): Promise<BackupManifest>
  ImportBackup(path: string, password: string): Promise<{ notes: string[]; safety: string }>
  FetchProjectSecrets(projectId: string, secret: string, accept: string, sudoPassword: string): Promise<RunStart & { count: number }>
  ExportProject(id: string): Promise<string>
  RunProject(id: string, check: boolean, secret: string, accept: string, sudoPassword: string): Promise<RunStart>
  CancelRun(runId: string): Promise<boolean>
  RunLogs(projectId: string): Promise<string[]>
  RunHistory(serverId: string, projectId: string, limit: number): Promise<RunEntry[]>
  ReadRunLog(projectId: string, name: string): Promise<string>
  LabStatus(): Promise<LabStatus>
  LabAction(action: string): Promise<void>
  LabRegister(): Promise<Server>
  OpenURL(url: string): Promise<void>
  ServerLive(id: string): Promise<ServerLive>
  DockerInfo(): Promise<DockerInfo>
  SetBackupsAuto(projectId: string, mode: string, days: number): Promise<void>
  ListRecipes(): Promise<RecipeView[]>
  CheckRecipe(r: Recipe): Promise<ProjectCheck>
  SaveRecipe(r: Recipe): Promise<Recipe>
  DeleteRecipe(id: string): Promise<void>
  DeployRecipe(recipeId: string, serverId: string): Promise<Project>
  ProjectRecipeDiff(projectId: string): Promise<RecipeDiff>
  PushToRecipe(projectId: string): Promise<Recipe>
  ResetToRecipe(projectId: string): Promise<Project>
  ServerOverview(serverId: string, secret: string, accept: string, sudoPassword: string): Promise<ServerOverviewResult>
  ServerLogs(serverId: string, kind: string, name: string, lines: number, secret: string, accept: string, sudoPassword: string): Promise<ServerLogsResult>
  BackupsDue(): Promise<BackupDue[]>
  SaveTextFile(defaultName: string, content: string): Promise<string>
  AlertsRun(projectId: string, what: string, secret: string, accept: string, sudoPassword: string): Promise<AlertsResult>
  CreateBackupTarget(sourceProjectId: string, targetServerId: string, port: number): Promise<BackupTargetResult>
  ChooseProjectDir(): Promise<string>
  AnalyzeProject(dir: string, stack: string): Promise<DockerAnalysis>
  DefaultDockerSpec(stack: string, name: string): Promise<DockerSpec>
  GenerateDocker(dir: string, spec: DockerSpec): Promise<DockerPreview>
  WriteDockerFiles(dir: string, spec: DockerSpec, overwrite: boolean): Promise<string[]>
  BuildDockerImage(dir: string, spec: DockerSpec): Promise<void>
  CancelDockerBuild(): Promise<boolean>
  DockerLabTest(dir: string, spec: DockerSpec): Promise<void>
  CancelDockerLabTest(): Promise<boolean>
  DockerLabStop(dir: string, spec: DockerSpec): Promise<void>
  OpenProjectDir(dir: string): Promise<void>
}

declare global {
  interface Window {
    go?: { main?: { App?: Backend } }
    runtime?: { EventsOn(name: string, cb: (data: any) => void): () => void }
  }
}

// Escucha eventos del backend. En el navegador (demo) los emite el simulador.
const mockListeners: Record<string, ((d: any) => void)[]> = {}
export function onEvent(name: string, cb: (data: any) => void): () => void {
  if (window.runtime?.EventsOn) return window.runtime.EventsOn(name, cb)
  ;(mockListeners[name] ||= []).push(cb)
  return () => (mockListeners[name] = mockListeners[name].filter((f) => f !== cb))
}
const mockUserMods: Record<string, { id: string; name: string; problems: string[]; notes: string[]; files: Record<string, string> }> = {}
const mockTerms: Record<string, { line: string; out: (t: string) => void; prompt: string }> = {}
function mockEmit(name: string, data: unknown) {
  for (const f of mockListeners[name] ?? []) f(data)
}

export const isDesktop = typeof window !== 'undefined' && !!window.go?.main?.App

// ---- simulador para el navegador ----------------------------------------

function mockBackend(): Backend {
  const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms))
  const load = <T>(k: string, d: T): T => {
    try {
      const v = localStorage.getItem('draupnode-mock2-' + k)
      return v ? (JSON.parse(v) as T) : d
    } catch {
      return d
    }
  }
  const save = (k: string, v: unknown) => {
    try {
      localStorage.setItem('draupnode-mock2-' + k, JSON.stringify(v))
    } catch {
      /* sin almacenamiento: da igual en modo demo */
    }
  }
  const keys: KeyInfo[] = [
    { path: '/home/demo/.ssh/id_ed25519', name: 'id_ed25519', format: 'openssh', keyType: 'ssh-ed25519', encrypted: false, source: 'ssh-dir' },
    { path: '/home/demo/claves/servidor.key', name: 'servidor.key', format: 'pem', keyType: 'ssh-rsa', encrypted: true, source: 'ssh-config' },
    { path: '/home/demo/claves/servidor.ppk', name: 'servidor.ppk', format: 'ppk', keyType: 'ssh-rsa', encrypted: true, comment: 'rsa-key-servidor', source: 'ssh-dir' },
  ]
  let servers: Server[] = load('servers', [
    { id: 'demo1', name: 'Servidor web', host: '203.0.113.10', port: 22, user: 'ubuntu', authMethod: 'key', keyPath: keys[1].path, keyEncrypted: true, secretStore: '', notes: 'Servidor de ejemplo de la demo (la contraseña es «demo»)', createdAt: new Date().toISOString() },
  ] as Server[])
  let settings: Settings = load('settings', { theme: 'draupnir-gold', secretBackend: 'auto' })
  const trusted = new Set<string>(load('trusted', []))
  const stored: Record<string, string> = load('secrets', {})
  // (la demo puede traer una bóveda ya creada en sus datos: clave «vault»)
  let vault = { ...load('vault', { exists: false, master: '' }), unlocked: false }
  const mockTyped: Record<string, string> = {} // datos secretos escritos (demo, solo en memoria)
  // Los datos de ejemplo traen las opciones vacías: se rellenan con sus valores por defecto.
  let projects: Project[] = load<Project[]>('projects', []).map((p) => ({
    ...p,
    modules: p.modules.map((m) => ({ ...m, values: { ...defaults(m.id), ...m.values } })),
    installedValues: p.installedValues ? Object.fromEntries(Object.entries(p.installedValues).map(([id, v]) => [id, { ...defaults(id), ...v }])) : Object.fromEntries(
      (p.installedModules ?? []).map((id) => [id, { ...defaults(id), ...(p.modules.find((m) => m.id === id)?.values ?? {}) }])),
    // (la demo también rellena con valores por defecto lo que traigan los datos de ejemplo)
  }))
  // Recetas: si los datos de ejemplo no traen, cada proyecto pasa a ser una receta (como hace la app).
  let recipes: Recipe[] = load<Recipe[]>('recipes', [])
  for (const p of projects) {
    if (p.recipeId && recipes.some((r) => r.id === p.recipeId)) continue
    const same = recipes.find((r) => r.name === p.name)
    if (same) { p.recipeId = same.id; continue }
    const r: Recipe = { id: 'r' + p.id, name: p.name, modules: JSON.parse(JSON.stringify(p.modules)) }
    recipes.push(r)
    p.recipeId = r.id
  }
  const sameMods = (a: ProjectModule[], b: ProjectModule[]) => JSON.stringify(a.map((m) => [m.id, m.values])) === JSON.stringify(b.map((m) => [m.id, m.values]))
  function mockDiff(p: Project): RecipeDiff {
    const r = recipes.find((x) => x.id === p.recipeId)
    const d: RecipeDiff = { recipeId: r?.id ?? '', recipeName: r?.name ?? '', added: [], removed: [], changed: {} }
    if (!r) return d
    for (const m of p.modules) {
      const rm = r.modules.find((x) => x.id === m.id)
      if (!rm) { d.added.push(m.id); continue }
      const keys = Object.keys(m.values).filter((k) => JSON.stringify(m.values[k]) !== JSON.stringify(rm.values?.[k]))
      if (keys.length) d.changed[m.id] = keys
    }
    for (const m of r.modules) if (!p.modules.some((x) => x.id === m.id)) d.removed.push(m.id)
    return d
  }
  const cancelled = new Set<string>()
  // ?sindocker en la URL simula un equipo sin Docker.
  const lab: LabStatus = {
    docker: location.search.includes('sindocker')
      ? { os: 'linux', installed: false, problem: 'missing', message: 'Docker no está instalado en este equipo.', viaGroup: false, canAutoFix: true, installCommand: 'apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io && systemctl enable --now docker && usermod -aG docker demo' }
      : { os: 'linux', installed: true, version: '27.5.1', problem: '', viaGroup: false, canAutoFix: true, installCommand: '' },
    server: { exists: false, running: false },
    keys: [
      { path: '/home/demo/.config/draupnode/prueba/id_prueba', label: 'Clave sin contraseña' },
      { path: '/home/demo/.config/draupnode/prueba/id_prueba_con_frase', label: 'Clave con contraseña', passphrase: 'draupnode' },
      { path: '/home/demo/.config/draupnode/prueba/id_prueba_con_frase.ppk', label: 'Clave PuTTY (.ppk) con contraseña', passphrase: 'draupnode' },
    ],
    fingerprint: 'SHA256:3vXq0pXb0m2kQ9yJ8a1T5zR7cW4eN6uH2sL0fD9gK1o',
    host: '127.0.0.1', port: 2222, user: 'ubuntu', password: 'draupnode', coolifyUrl: 'http://127.0.0.1:18000', coolifyUp: false,
  }

  const info = (): SecretsInfo => {
    const b = (settings.secretBackend || 'auto') as SecretsInfo['backend']
    return {
      // ?sinllavero en la URL simula un equipo sin llavero del sistema.
      keyring: location.search.includes('sinllavero')
        ? { available: false, name: 'Secret Service (GNOME Keyring / KWallet / KeePassXC)', suggestions: [
            { name: 'GNOME Keyring', description: 'El llavero de Ubuntu, Debian, Fedora y escritorios GNOME, Cinnamon, MATE o XFCE. Se desbloquea al iniciar sesión. Tras instalarlo, cierra sesión y vuelve a entrar.', command: 'sudo apt install -y gnome-keyring libsecret-1-0 seahorse' },
            { name: 'KWallet', description: 'El llavero de KDE Plasma. Actívalo en Preferencias del sistema → Cartera de KDE.', command: 'sudo apt install -y kwalletmanager' },
            { name: 'KeePassXC', description: 'Gestor de contraseñas libre. Activa «Integración con Secret Service» en sus ajustes y Draupnode lo usará como llavero.', command: 'sudo apt install -y keepassxc' },
          ] }
        : { available: true, name: 'GNOME Keyring (simulado)' },
      vault: { exists: vault.exists, unlocked: vault.unlocked, path: '(simulado)/vault.json', entries: 0 },
      backend: b,
      effective: b === 'vault' || location.search.includes('sinllavero') ? 'vault' : 'keyring',
    }
  }
  const needs = (s: Server) => s.authMethod === 'password' || (s.authMethod === 'key' && s.keyEncrypted)

  return {
    async AppInfo() {
      return { version: '0.2.0 (demo navegador)', configDir: '(simulado)', os: 'browser' }
    },
    async SecretsInfo() {
      return info()
    },
    async SetSecretBackend(b) {
      settings = { ...settings, secretBackend: b }
      save('settings', settings)
    },
    async VaultCreate(m) {
      await wait(400)
      if (m.length < 10) throw 'la contraseña maestra debe tener al menos 10 caracteres'
      vault = { exists: true, unlocked: true, master: m }
    },
    async VaultUnlock(m) {
      await wait(400)
      if (m !== vault.master) throw 'la contraseña maestra no es correcta'
      vault.unlocked = true
    },
    async VaultLock() {
      vault.unlocked = false
    },
    async ListServers() {
      return servers.map((s) => ({ ...s, hasSecret: !!stored[s.id] }))
    },
    async SaveServer(s, secret, saveSecret, storeChoice) {
      await wait()
      if (!s.name?.trim()) throw 'el nombre es obligatorio'
      if (!s.host?.trim()) throw 'la IP o el dominio es obligatorio'
      if (!s.user?.trim()) throw 'el usuario es obligatorio'
      if (s.authMethod === 'key' && !s.keyPath) throw 'elige el fichero de clave privada'
      const target = (storeChoice || info().effective) as 'keyring' | 'vault'
      if (saveSecret && secret && needs(s) && target === 'vault') {
        if (!vault.exists) throw 'VAULT_MISSING: la bóveda cifrada aún no se ha creado'
        if (!vault.unlocked) throw 'VAULT_LOCKED: la bóveda está bloqueada'
      }
      const srv: Server = { ...s, port: s.port || 22 }
      if (!srv.id) {
        srv.id = Math.random().toString(16).slice(2, 10)
        srv.createdAt = new Date().toISOString()
      }
      if (!needs(srv) || !saveSecret) {
        delete stored[srv.id]
        srv.secretStore = ''
      } else if (secret) {
        stored[srv.id] = secret
        srv.secretStore = target
      }
      servers = servers.some((x) => x.id === srv.id)
        ? servers.map((x) => (x.id === srv.id ? { ...srv, lastCheck: x.lastCheck } : x))
        : [...servers, srv]
      save('servers', servers)
      save('secrets', stored)
      return { ...srv, hasSecret: !!stored[srv.id] }
    },
    async DeleteServer(id) {
      servers = servers.filter((s) => s.id !== id)
      delete stored[id]
      save('servers', servers)
      save('secrets', stored)
    },
    async InspectKey(path) {
      await wait(100)
      const k = keys.find((x) => x.path === path)
      if (k) return k
      if (path.endsWith('.pub')) return { path, name: path, format: '', encrypted: false, error: 'eso es una clave PÚBLICA (.pub); elige la privada' }
      return { path, name: path.split('/').pop() ?? path, format: path.endsWith('.ppk') ? 'ppk' : 'pem', encrypted: true, keyType: 'ssh-rsa' }
    },
    async FindKeys() {
      return keys
    },
    async SSHConfigHosts() {
      return [{ alias: 'web', hostName: '203.0.113.10', user: 'ubuntu', port: 22, identityFile: keys[1].path }]
    },
    async PickKeyFile() {
      return keys[2].path
    },
    async TestConnection(id, secret, accept) {
      await wait(900)
      const s = servers.find((x) => x.id === id)
      if (!s) return { status: 'error', message: 'servidor no encontrado', durationMs: 0 }
      const kind = s.authMethod === 'password' ? 'password' : 'passphrase'
      if (!secret && s.secretStore === 'vault' && !vault.unlocked) return { status: 'vault_locked', secretKind: kind, message: 'Desbloquea la bóveda', durationMs: 0 }
      const pass = secret || stored[id]
      const k = keys.find((x) => x.path === s.keyPath)
      if (s.authMethod === 'password' || k?.encrypted || s.keyEncrypted) {
        if (!pass) return { status: 'needs_secret', secretKind: kind, message: 'falta la contraseña', durationMs: 5 }
        if (pass !== 'demo') return { status: 'bad_secret', secretKind: kind, message: 'la contraseña no es correcta (en la demo es «demo»)', durationMs: 5 }
      }
      const fp = 'SHA256:q7Xh3N0d4Lr9kZ2mV8pYwE1bT6uC5sA0fG4hJ7kL9nM'
      if (!trusted.has(s.host)) {
        if (accept !== fp) return { status: 'unknown_host', secretKind: kind, message: 'Es la primera vez que te conectas a este servidor. Comprueba que la huella es la suya antes de confiar.', keyType: 'ssh-ed25519', fingerprint: fp, durationMs: 300 }
        trusted.add(s.host)
        save('trusted', [...trusted])
      }
      const facts = {
        os: 'Ubuntu 24.04.3 LTS', os_id: 'ubuntu', hostname: 'srv-' + s.name.toLowerCase().replace(/\W+/g, '-'),
        kernel: '6.8.0-1021-oracle', arch: 'aarch64', cpus: '4', mem_kb: '24557568',
        disk_free_kb: '151234560', disk_total_kb: '198743040', uptime: 'up 12 days, 4 hours',
        sudo: 'yes', has_python3: 'yes', has_docker: 'yes', has_git: 'yes', has_curl: 'yes', has_ansible: 'no',
      }
      servers = servers.map((x) => (x.id === id ? { ...x, lastCheck: { at: new Date().toISOString(), ok: true, facts, durationMs: 840 } } : x))
      save('servers', servers)
      return { status: 'ok', secretKind: kind, message: 'Conexión correcta', facts, durationMs: 840 }
    },
    async GetSettings() {
      return settings
    },
    async SaveSettings(s) {
      settings = { ...s, secretBackend: settings.secretBackend }
      save('settings', settings)
    },
    async ListModules() {
      return { modules: MOCK_MODULES, errors: [], userDir: '(simulado)/modules' }
    },
    async ListUserModules() {
      return Object.values(mockUserMods).map((m) => ({ ...m, files: Object.keys(m.files) }))
    },
    async ReadUserModuleFile(id, rel) {
      return mockUserMods[id]?.files[rel] ?? ''
    },
    async SaveUserModuleFile(id, rel, content) {
      const m = mockUserMods[id]
      if (!m) throw 'no existe'
      if (rel !== 'module.yaml' && !rel.startsWith('role/')) throw 'los ficheros van en module.yaml o dentro de role/'
      m.files[rel] = content
      m.problems = /\[[^\]]*$/m.test(content) ? [rel + ': yaml: línea 1: no se encontró el «]» de cierre'] : []
      return { ...m, files: Object.keys(m.files) }
    },
    async DeleteUserModuleFile(id, rel) {
      delete mockUserMods[id].files[rel]
      return { ...mockUserMods[id], files: Object.keys(mockUserMods[id].files) }
    },
    async CreateUserModule(id, from) {
      if (mockUserMods[id]) throw 'ya tienes un módulo «' + id + '»'
      const v = id.replaceAll('-', '_') + '_'
      mockUserMods[id] = { id, name: from ? 'Copia de ' + from : 'Mi módulo', problems: [], notes: [], files: {
        'module.yaml': `# Módulo propio de Draupnode.\nid: ${id}\nname: "Mi módulo"\nversion: 1.0.0\ncategory: 8 · Mis módulos\ndescription: "Una línea que diga qué hace."\ndepends: [base]\nvariables:\n  - name: ${v}paquetes\n    label: Paquetes que instalar\n    type: list\n    default: [htop, ncdu]\n`,
        'role/tasks/main.yml': `---\n- name: Instalar paquetes\n  ansible.builtin.apt:\n    name: "{{ ${v}paquetes }}"\n    state: present\n`,
        'role/tasks/uninstall.yml': `---\n- name: Quitar paquetes\n  ansible.builtin.apt:\n    name: "{{ ${v}paquetes }}"\n    state: absent\n`,
      } }
      return { ...mockUserMods[id], files: Object.keys(mockUserMods[id].files) }
    },
    async DeleteUserModule(id) {
      delete mockUserMods[id]
    },
    async OpenUserModuleDir() {},
    async ReloadModules() {
      return { modules: MOCK_MODULES, errors: [], userDir: '(simulado)/modules' }
    },
    async ModuleFile(id, file) {
      return `# ${id}/${file}\n# (demo: el contenido real se ve en la app de escritorio)\n---\n- name: Ejemplo\n  ansible.builtin.debug:\n    msg: hola\n`
    },
    async OpenModulesDir() {},
    async ListProjects() {
      return projects
    },
    async CheckProject(p) {
      return mockCheck(p)
    },
    async SaveProject(p) {
      await wait()
      const chk = mockCheck(p)
      if (chk.general.length && p.modules.length) throw chk.general.join('; ')
      if (Object.keys(chk.errors).length) throw 'revisa los campos marcados en rojo'
      if (!p.name.trim()) throw 'el nombre es obligatorio'
      if (!servers.some((x) => x.id === p.serverId)) throw 'elige un servidor'
      const mods = chk.order.map((id) => ({ id, values: { ...defaults(id), ...(p.modules.find((m) => m.id === id)?.values ?? {}) } }))
      const prev = projects.find((x) => x.id === p.id)
      const same = prev && JSON.stringify([prev.name, prev.serverId, prev.modules]) === JSON.stringify([p.name.trim(), p.serverId, mods])
      const np: Project = { ...p, name: p.name.trim(), modules: mods, id: p.id || Math.random().toString(16).slice(2, 10),
        updatedAt: same ? prev!.updatedAt : new Date().toISOString(), lastRun: prev?.lastRun, appliedAt: prev?.appliedAt, collapsed: prev?.collapsed, installedModules: prev?.installedModules }
      projects = prev ? projects.map((x) => (x.id === np.id ? np : x)) : [...projects, np]
      save('projects', projects)
      return np
    },
    async DeleteProject(id) {
      projects = projects.filter((p) => p.id !== id)
      save('projects', projects)
    },
    async OpenAppTunnel() {
      await wait(400)
      return { status: 'ok', url: 'http://127.0.0.1:45678/' }
    },
    async OpenGrafana() {
      await wait(600)
      return { status: 'ok', url: 'https://grafana.com/grafana/dashboards/' }
    },
    async MonitorSummary() {
      await wait(500)
      const j = (n: number) => n + Math.random() * 4
      return { status: 'ok', stats: { cpu: j(11), ram: j(46), ramTotal: 24 * 2 ** 30, disk: 38.4, diskFree: 98 * 2 ** 30, load: 0.42, cpus: 4, uptime: 3 * 86400 + 5 * 3600,
        containers: 9, targets: [{ job: 'prometheus', up: true }, { job: 'node', up: true }, { job: 'cadvisor', up: true }, { job: 'postgres', up: true }], at: new Date().toISOString() } }
    },
    async BackupSnapshots(id, remote) {
      await wait(700)
      const now = Date.now()
      const day = 86_400_000
      const snaps: Snapshot[] = []
      for (let d = 0; d < (remote ? 3 : 6); d++) {
        const t = new Date(now - d * day - 3_600_000).toISOString()
        snaps.push({ id: (0xa1b2c3d4 + d * 7919).toString(16).slice(0, 8), time: t, tags: ['draupnode-' + id, 'postgres'], paths: ['/postgres-pg-compartido.sql'], host: 'srv', bytes: 4_200_000 + d * 1000 })
        snaps.push({ id: (0x5e6f7a8b + d * 104729).toString(16).slice(0, 8), time: t, tags: ['draupnode-' + id, 'archivos'], paths: ['/etc/draupnode/secretos/' + id], host: 'srv', bytes: 18_400 })
      }
      return { status: 'ok', ok: true, snapshots: snaps }
    },
    async BackupNow() {
      await wait(1800)
      return { status: 'ok', ok: true, output: '[2026-11-20 03:30:01] Volcando PostgreSQL (pg-compartido)\n[2026-11-20 03:30:04] Copiando archivos\n[2026-11-20 03:30:05] Borrando copias viejas\n[2026-11-20 03:30:06] Comprobando el repositorio\n[2026-11-20 03:30:09] Copia terminada. 14 copias en total' }
    },
    async BackupLs(_id, _snap, dir) {
      await wait(350)
      const t = new Date().toISOString()
      const tree: Record<string, SnapEntry[]> = {
        '/': [{ name: 'postgres-pg-compartido', path: '/postgres-pg-compartido', type: 'dir', size: 0, mtime: t }, { name: 'etc', path: '/etc', type: 'dir', size: 0, mtime: t }],
        '/postgres-pg-compartido': [
          { name: 'tienda.dump', path: '/postgres-pg-compartido/tienda.dump', type: 'file', size: 2_400_000, mtime: t },
          { name: 'blog.dump', path: '/postgres-pg-compartido/blog.dump', type: 'file', size: 820_000, mtime: t },
          { name: 'usuarios-y-permisos.sql', path: '/postgres-pg-compartido/usuarios-y-permisos.sql', type: 'file', size: 1_900, mtime: t }],
        '/etc': [{ name: 'draupnode', path: '/etc/draupnode', type: 'dir', size: 0, mtime: t }],
        '/etc/draupnode': [{ name: 'secretos', path: '/etc/draupnode/secretos', type: 'dir', size: 0, mtime: t }],
      }
      return { status: 'ok', ok: true, entries: tree[dir] ?? [] }
    },
    async BackupRestore(_id, snap, target, paths) {
      await wait(900)
      return { status: 'ok', ok: true, output: `restoring snapshot ${snap} to ${target}\nSummary: Restored ${paths.length * 3} files/dirs (1.2 MiB) in 0:01` }
    },
    async BackupRestoreDB(_id, snap, _dump, _ctr, db, replace) {
      await wait(1200)
      return { status: 'ok', ok: true, output: (replace ? `Cerrando las conexiones a ${db} y borrándola…\n` : '') + `Base ${db} restaurada desde la copia ${snap}.` }
    },
    async BackupDownload(id, snap, paths, dest) {
      for (let d = 0; d <= 3_000_000; d += 1_000_000) {
        mockEmit('backupfetch', { projectId: id, done: d, total: 0, stage: 'Descargando ' + paths[0] })
        await wait(250)
      }
      return { status: 'ok', ok: true, output: `4 fichero(s), 3220000 bytes, en ${dest}/copia-${snap}`, fetch: { dir: `${dest}/copia-${snap}`, bytes: 3_220_000, files: 4, at: new Date().toISOString() } }
    },
    async ChooseBackupFolder() {
      return '/home/demo/Draupnode-copias/demo'
    },
    async DefaultBackupFolder(id) {
      return projects.find((x) => x.id === id)?.backupsFetched?.dir ?? '/home/demo/Draupnode-copias/' + id
    },
    async FetchBackups(id, dest) {
      const total = 48_000_000
      for (let d = 0; d <= total; d += 6_000_000) {
        mockEmit('backupfetch', { projectId: id, done: d, total, stage: 'Trayendo copias' })
        await wait(250)
      }
      const fetch = { at: new Date().toISOString(), dir: dest, bytes: 52_000_000, files: 37 }
      projects = projects.map((x) => (x.id === id ? { ...x, backupsFetched: fetch } : x))
      save('projects', projects)
      return { status: 'ok', ok: true, fetch }
    },
    async CheckUninstall(id, mods) {
      const p = projects.find((x) => x.id === id)
      const ms = mods.map((m) => MOCK_MODULES.find((x) => x.id === m)!).filter(Boolean)
      const bad = ms.find((m) => m.noUninstall || !m.uninstallable)
      const notInst = mods.find((m) => !(p?.installedModules ?? []).includes(m))
      return { ok: !bad && !notInst, error: bad ? `${bad.name} no se puede desinstalar: ${bad.noUninstall ?? 'no tiene desinstalación'}` : notInst ? 'no está instalado con esta plantilla en este servidor' : undefined,
        modules: ms.map((m) => ({ id: m.id, name: m.name, warning: m.uninstallWarning, data: m.uninstallData })), hasData: ms.some((m) => !!m.uninstallData),
        server: servers.find((s) => s.id === p?.serverId)?.name ?? '', selected: mods.filter((m) => p?.modules.some((x) => x.id === m)) }
    },
    async UninstallModules(id, mods) {
      await wait(500)
      const p = projects.find((x) => x.id === id)
      if (!p) return { status: 'error', message: 'proyecto no encontrado' }
      const runId = Math.random().toString(16).slice(2, 8)
      setTimeout(() => {
        mockEmit('run', { runId, projectId: id, kind: 'ev', ev: { ev: 'stage', name: 'Ejecutando Ansible' } })
        projects = projects.map((x) => (x.id === id ? { ...x, modules: x.modules.filter((m) => !mods.includes(m.id)), installedModules: (x.installedModules ?? []).filter((m) => !mods.includes(m)) } : x))
        save('projects', projects)
        mockEmit('run', { runId, projectId: id, kind: 'ev', ev: { ev: 'notice', msg: 'Desinstalado del servidor (demo).' } })
        mockEmit('run', { runId, projectId: id, kind: 'done', summary: { at: new Date().toISOString(), check: false, ok: true, changed: mods.length, failed: 0, tasks: mods.length, durationMs: 1500, uninstall: true } })
      }, 1200)
      return { status: 'started', runId }
    },
    async SetProjectSecret(id, variable, value) {
      if (!vault.exists) throw 'VAULT_MISSING: no hay bóveda'
      if (!vault.unlocked) throw 'VAULT_LOCKED: la bóveda está bloqueada'
      const k = `${id}:${variable}`
      if (value) mockTyped[k] = value
      else delete mockTyped[k]
    },
    async TerminalOpen(sid) {
      await wait(500)
      const srv = servers.find((x) => x.id === sid)
      const id = 't' + Date.now()
      const out = (t: string) => mockEmit('term', { id, data: btoa(unescape(encodeURIComponent(t))) })
      mockTerms[id] = { line: '', out, prompt: `${srv?.user ?? 'ubuntu'}@srv:~$ ` }
      setTimeout(() => out(`Welcome to Ubuntu 24.04.1 LTS (demo del navegador: no es un servidor de verdad)\r\n\r\n${mockTerms[id].prompt}`), 200)
      return { status: 'ok', id }
    },
    async TerminalInput(id, data) {
      const t = mockTerms[id]
      if (!t) return
      for (const ch of data) {
        if (ch === '\r') {
          const cmd = t.line.trim()
          t.line = ''
          const reply = cmd === '' ? '' : cmd === 'uptime' ? ' 10:21:07 up 3 days,  2:14,  1 user,  load average: 0.08, 0.05, 0.01\r\n' : cmd === 'exit' ? '' : `${cmd.split(' ')[0]}: (demo) aquí verías la salida real\r\n`
          t.out('\r\n' + reply)
          if (cmd === 'exit') { delete mockTerms[id]; mockEmit('term', { id, closed: true, reason: 'Sesión terminada.' }); return }
          t.out(t.prompt)
        } else if (ch === '\u007f') {
          if (t.line) { t.line = t.line.slice(0, -1); t.out('\b \b') }
        } else {
          t.line += ch
          t.out(ch)
        }
      }
    },
    async TerminalResize() {},
    async TerminalClose(id) {
      if (mockTerms[id]) { delete mockTerms[id]; mockEmit('term', { id, closed: true, reason: 'Sesión terminada.' }) }
    },
    async BackupStatus() {
      return { lastExport: load<string | null>('lastExport', null) }
    },
    async ExportBackup(password) {
      await wait(800)
      if (password.length < 10) throw 'la contraseña de la copia debe tener al menos 10 caracteres'
      save('lastExport', new Date().toISOString())
      return '/home/demo/draupnode-copia-' + new Date().toISOString().slice(0, 10) + '.draupnode'
    },
    async ChooseBackupFile() {
      return '/home/demo/draupnode-copia.draupnode'
    },
    async InspectBackup(_p, password) {
      await wait(600)
      if (password !== 'copia-de-prueba') throw 'la contraseña no es correcta o el fichero está dañado'
      return { version: 1, created: new Date().toISOString(), app: '0.39.0', servers: servers.length, templates: 3, deployments: projects.length, vaultEntries: 6, keyring: 1, modules: 0, keys: [] }
    },
    async ImportBackup() {
      await wait(800)
      return { notes: ['La bóveda se abre con la contraseña maestra que tenía cuando hiciste la copia.'], safety: '/home/demo/.config/draupnode/antes-de-importar' }
    },
    async FetchProjectSecrets(id) {
      await wait(900)
      if (!vault.exists) return { status: 'vault_missing', count: 0 }
      if (!vault.unlocked) return { status: 'vault_locked', count: 0 }
      const p = projects.find((x) => x.id === id)
      if (!p?.appliedAt) return { status: 'error', message: 'en el servidor no hay contraseñas de esta plantilla todavía: se generan la primera vez que pulsas Aplicar', count: 0 }
      return { status: 'ok', count: mockGenerated(p).length }
    },
    async ProjectSecretsInfo(id) {
      const p = projects.find((x) => x.id === id)
      const gen = p?.appliedAt ? mockGenerated(p).length : 0
      return { vaultExists: vault.exists, generated: gen, typed: Object.keys(mockTyped).filter((k) => k.startsWith(id + ':')).map((k) => k.slice(id.length + 1)),
        at: gen ? p?.appliedAt ?? undefined : undefined }
    },
    async ProjectSecrets(id, master) {
      await wait(500)
      if (!vault.exists) throw 'no hay bóveda'
      if (master !== vault.master) throw 'la contraseña de la bóveda no es correcta'
      vault.unlocked = true
      const p = projects.find((x) => x.id === id)
      const typed = Object.entries(mockTyped).filter(([k]) => k.startsWith(id + ':'))
        .map(([k, value]) => ({ kind: 'typed' as const, module: '', label: k.slice(id.length + 1), name: k.slice(id.length + 1), value }))
      return [...(p ? mockGenerated(p) : []), ...typed]
    },
    async SetProjectCollapsed(id, modules) {
      projects = projects.map((p) => (p.id === id ? { ...p, collapsed: [...modules].sort() } : p))
      save('projects', projects)
    },
    async ExportProject() {
      await wait(300)
      return '/home/demo/instalar-demo.sh'
    },
    async RunProject(id, check) {
      await wait(500)
      const p = projects.find((x) => x.id === id)
      if (!p) return { status: 'error', message: 'proyecto no encontrado' }
      const runId = Math.random().toString(16).slice(2, 8)
      mockRun(p, runId, check)
      return { status: 'started', runId }
    },
    async CancelRun(runId) {
      cancelled.add(runId)
      return true
    },
    async RunHistory(sid, pid) {
      return projects.filter((p) => p.serverId === sid && (!pid || p.id === pid) && p.lastRun).map((p) => {
        const r = p.lastRun!
        return { projectId: p.id, project: p.name, name: 'demo.log', at: r.at, mode: r.uninstall ? 'desinstalar' : r.check ? 'previsualizar' : 'aplicar', known: true, ok: r.ok, canceled: !!r.canceled, changed: r.changed, failed: r.failed, error: r.error, durationMs: r.durationMs ?? 42000 }
      })
    },
    async RunLogs() {
      return []
    },
    async LabStatus() {
      return { ...lab, server: { ...lab.server }, serverId: servers.find((x) => x.host === '127.0.0.1' && x.port === 2222)?.id }
    },
    async LabAction(action) {
      const say = (text: string) => mockEmit('lab', { action, kind: 'line', text })
      const steps: Record<string, string[]> = {
        'fix-missing': ['Instalando Docker (te pedirá tu contraseña)…', 'Leyendo lista de paquetes…', 'Configurando docker.io…'],
        'fix-permission': ['Añadiendo tu usuario al grupo docker (te pedirá tu contraseña)…'],
        'fix-daemon': ['Arrancando el servicio de Docker…'],
        start: ['==> Construyendo la imagen Ubuntu 24.04 (la primera vez tarda unos minutos)', '#5 [2/6] RUN apt-get update && apt-get install -y systemd openssh-server sudo python3…', '#9 exporting to image', '==> Creando el contenedor', '==> Esperando a que arranque systemd', '==> Instalando las claves SSH', 'Listo: ssh -p 2222 ubuntu@127.0.0.1'],
        stop: ['==> Parando el contenedor'],
        remove: ['==> Borrando el contenedor', '==> Borrando el volumen de Docker interno'],
      }
      ;(steps[action] ?? []).forEach((t, i) => setTimeout(() => say(t), 400 * (i + 1)))
      setTimeout(() => {
        if (action.startsWith('fix-')) lab.docker = { ...lab.docker, installed: true, problem: '', version: '27.5.1', message: undefined }
        if (action === 'start') lab.server = { exists: true, running: true, startedAt: new Date().toISOString() }
        if (action === 'stop') lab.server = { ...lab.server, running: false }
        if (action === 'remove') lab.server = { exists: false, running: false }
        mockEmit('lab', { action, kind: 'done', ok: true })
      }, 400 * ((steps[action]?.length ?? 0) + 1))
    },
    async LabRegister() {
      const existing = servers.find((x) => x.host === '127.0.0.1' && x.port === 2222)
      const srv = { id: existing?.id ?? 'lab', name: 'Servidor de pruebas (Docker)', host: '127.0.0.1', port: 2222, user: 'ubuntu', authMethod: 'key', keyPath: lab.keys[0].path, keyEncrypted: false, secretStore: '', notes: 'Ubuntu 24.04 en un contenedor Docker de este equipo.' } as Server
      servers = existing ? servers.map((x) => (x.id === srv.id ? srv : x)) : [...servers, srv]
      trusted.add('127.0.0.1')
      save('servers', servers)
      return srv
    },
    async AlertsRun(_id, what) {
      await wait(700)
      return what === 'prueba'
        ? { status: 'ok', ok: true, output: 'Aviso de prueba enviado.' }
        : { status: 'ok', ok: true, output: 'Disco / al 91 % (libres 2210 MB).' }
    },
    async SaveTextFile(name) {
      await wait()
      return '/home/demo/' + name
    },
    async CreateBackupTarget(srcId, tgtServerId, port) {
      await wait(500)
      const src = projects.find((p) => p.id === srcId)
      const srv = servers.find((s) => s.id === tgtServerId)
      if (!src || !srv) throw new Error('no encontrado')
      if (srv.host.startsWith('127.')) throw new Error('ese servidor se conecta por ' + srv.host + ', que el servidor de origen no puede alcanzar')
      let tgt = projects.find((p) => p.serverId === tgtServerId && p.modules.some((m) => m.id === 'backup-target'))
      const isNew = !tgt
      if (!tgt) {
        let rec = recipes.find((r) => r.modules.some((m) => m.id === 'backup-target'))
        if (!rec) {
          rec = { id: 'r' + Date.now(), name: 'Servidor de copias', notes: 'Recibe las copias de otros servidores (solo añadir) y borra las viejas.', modules: [{ id: 'base', values: defaults('base') }, { id: 'docker', values: defaults('docker') }, { id: 'firewall', values: defaults('firewall') }, { id: 'backup-target', values: defaults('backup-target') }] }
          recipes.push(rec)
          save('recipes', recipes)
        }
        tgt = { id: 'p' + Date.now(), name: rec.name, recipeId: rec.id, serverId: tgtServerId, modules: [{ id: 'docker', values: {} }, { id: 'firewall', values: { firewall_tcp_ports: ['22', String(port)] } }, { id: 'backup-target', values: { backup_target_port: port } }] } as Project
        projects.push(tgt)
      }
      const slug = src.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const url = `https://${srv.host}:${port}/${slug}`
      const b = src.modules.find((m) => m.id === 'backups')
      if (b) Object.assign(b.values, { backups_remote_type: 'rest-server', backups_remote: url, backups_remote_user: slug, backups_remote_append_only: true })
      save('projects', projects)
      return { targetProjectId: tgt.id, targetProjectName: tgt.name, targetIsNew: isNew, url, notes: [`Aplica primero «${tgt.name}» (en ${srv.name}) y después este servidor.`] }
    },
    async SetBackupsAuto(id, mode, days) {
      projects = projects.map((x) => (x.id === id ? { ...x, backupsAuto: { mode: mode as 'off' | 'warn' | 'fetch', days } } : x))
      save('projects', projects)
    },
    async BackupsDue() {
      const out: BackupDue[] = []
      for (const p of projects) {
        if (!p.installedModules?.includes('backups')) continue
        const auto = p.backupsAuto ?? { mode: 'warn', days: 7 }
        if (auto.mode === 'off') continue
        const age = p.backupsFetched ? Math.floor((Date.now() - new Date(p.backupsFetched.at).getTime()) / 86400000) : -1
        if (age >= 0 && age < auto.days) continue
        out.push({ projectId: p.id, name: p.name, mode: auto.mode, days: auto.days, age, dest: '/home/demo/Draupnode-copias/' + p.id })
      }
      return out
    },
    async ListRecipes() {
      await wait(80)
      return recipes.map((r) => ({ ...r, deployments: projects.filter((p) => p.recipeId === r.id).map((p) => ({
        projectId: p.id, serverId: p.serverId, serverName: servers.find((s) => s.id === p.serverId)?.name ?? '',
        applied: !!p.appliedAt, pending: !p.appliedAt, sameRecipe: sameMods(p.modules, r.modules),
      })) }))
    },
    async CheckRecipe(r) {
      return mockCheck({ id: '', name: r.name, serverId: '', modules: r.modules } as Project)
    },
    async SaveRecipe(r) {
      await wait()
      const saved = { ...r, id: r.id || 'r' + Date.now(), modules: r.modules.map((m) => ({ ...m, values: { ...defaults(m.id), ...m.values } })) }
      const old = recipes.find((x) => x.id === saved.id)
      recipes = old ? recipes.map((x) => (x.id === saved.id ? saved : x)) : [...recipes, saved]
      // Los despliegues reciben los cambios y conservan sus valores propios.
      for (const p of projects.filter((x) => x.recipeId === saved.id)) {
        const own = mockDiff(p)
        p.modules = saved.modules.filter((m) => !own.removed.includes(m.id)).map((m) => {
          const mine = p.modules.find((x) => x.id === m.id)
          const vals = { ...m.values }
          for (const k of own.changed[m.id] ?? []) vals[k] = mine!.values[k]
          return { id: m.id, values: vals }
        }).concat(p.modules.filter((m) => own.added.includes(m.id)))
      }
      save('recipes', recipes)
      save('projects', projects)
      return saved
    },
    async DeleteRecipe(id) {
      if (projects.some((p) => p.recipeId === id)) throw new Error('está en algún servidor: quítalo de ahí antes')
      recipes = recipes.filter((r) => r.id !== id)
      save('recipes', recipes)
    },
    async DeployRecipe(rid, sid) {
      await wait()
      const r = recipes.find((x) => x.id === rid)!
      if (projects.some((p) => p.recipeId === rid && p.serverId === sid)) throw new Error('este servidor ya tiene esa plantilla')
      const p: Project = { id: 'p' + Date.now(), name: r.name, serverId: sid, recipeId: rid, modules: JSON.parse(JSON.stringify(r.modules)) }
      projects.push(p)
      save('projects', projects)
      return p
    },
    async ProjectRecipeDiff(id) {
      return mockDiff(projects.find((p) => p.id === id)!)
    },
    async PushToRecipe(id) {
      const p = projects.find((x) => x.id === id)!
      const r = recipes.find((x) => x.id === p.recipeId)!
      return this.SaveRecipe({ ...r, modules: JSON.parse(JSON.stringify(p.modules)) })
    },
    async ResetToRecipe(id) {
      const p = projects.find((x) => x.id === id)!
      p.modules = JSON.parse(JSON.stringify(recipes.find((x) => x.id === p.recipeId)!.modules))
      save('projects', projects)
      return p
    },
    async ServerOverview(id) {
      await wait(900)
      const gb = 1024 ** 3
      const lab = servers.find((s) => s.id === id)?.port === 2222
      return { status: 'ok', overview: {
        at: Math.floor(Date.now() / 1000), errors: [], docker: true,
        system: { hostname: lab ? 'servidor-prueba' : 'srv-web', os: 'Ubuntu 24.04.1 LTS', kernel: '6.8.0-49-generic', uptime: 3 * 86400 + 5 * 3600, load: [0.42, 0.38, 0.31], cpus: 4, cpu: 12.5, memTotal: 24 * gb, memAvailable: 15.2 * gb, swapTotal: 2 * gb, swapFree: 1.9 * gb },
        disks: [{ mount: '/', size: 194 * gb, used: 61 * gb, free: 133 * gb }],
        containers: [
          { id: 'a1', name: 'coolify', image: 'ghcr.io/coollabsio/coolify:4', state: 'running', health: 'healthy', started: '', restarts: 0, compose: 'source', draupnode: '', coolify: '', ports: ['0.0.0.0:8000->8080/tcp'], cpu: '1.20%', mem: '412MiB' },
          { id: 'a2', name: 'coolify-proxy', image: 'traefik:v3.1', state: 'running', health: '', started: '', restarts: 0, compose: 'coolify-proxy', draupnode: '', coolify: '', ports: ['0.0.0.0:80->80/tcp', '0.0.0.0:443->443/tcp'], cpu: '0.30%', mem: '58MiB' },
          { id: 'a3', name: 'tienda-web-x8k2', image: 'tienda:latest', state: 'running', health: 'healthy', started: '', restarts: 0, compose: '', draupnode: '', coolify: 'tienda', ports: [], cpu: '2.10%', mem: '186MiB' },
          { id: 'a4', name: 'blog-web-p3m1', image: 'blog:latest', state: 'restarting', health: '', started: '', restarts: 14, compose: '', draupnode: '', coolify: 'blog', ports: [], cpu: '0.00%', mem: '0B' },
          { id: 'a5', name: 'pg-compartido', image: 'postgres:16-alpine', state: 'running', health: 'healthy', started: '', restarts: 0, compose: 'draupnode-postgres', draupnode: 'coolify-produccion', coolify: '', ports: [], cpu: '0.80%', mem: '96MiB' },
        ],
        databases: [{ container: 'pg-compartido', engine: 'PostgreSQL', image: 'postgres:16-alpine', databases: [{ name: 'tienda', size: 184 * 1024 ** 2 }, { name: 'blog', size: 23 * 1024 ** 2 }, { name: 'postgres', size: 7.5 * 1024 ** 2 }] }],
        coolify: { panel: 'https://panel.ejemplo.com', apps: [{ kind: 'app', name: 'tienda', urls: ['https://tienda.ejemplo.com'], status: 'running:healthy' }, { kind: 'app', name: 'blog', urls: ['https://blog.ejemplo.com'], status: 'restarting' }] },
        sites: [{ server: 'nginx', domain: 'estado.ejemplo.com', target: 'http://127.0.0.1:3001', https: true, file: '/etc/nginx/sites-enabled/draupnode-estado.ejemplo.com.conf' }],
        failed: ['certbot.service'],
        ports: [{ proto: 'tcp', addr: '0.0.0.0', port: 22, process: 'sshd', public: true }, { proto: 'tcp', addr: '0.0.0.0', port: 80, process: 'docker-proxy', public: true }, { proto: 'tcp', addr: '0.0.0.0', port: 443, process: 'docker-proxy', public: true }, { proto: 'tcp', addr: '0.0.0.0', port: 8000, process: 'docker-proxy', public: true }, { proto: 'tcp', addr: '127.0.0.1', port: 3000, process: 'docker-proxy', public: false }],
        firewall: { active: true, tcp: ['22', '80', '443', '8000'], udp: [] },
      } }
    },
    async ServerLogs(_id, kind, name) {
      await wait(400)
      const now = new Date().toISOString()
      return { status: 'ok', text: Array.from({ length: 12 }, (_, i) => `${now} ${kind === 'container' ? name : 'srv-web ' + (name || 'systemd')}[${100 + i}]: línea de ejemplo ${i + 1} del registro`).join('\n') }
    },
    async DockerInfo() {
      return { versions: MOCK_VERSIONS, docker: true }
    },
    async ChooseProjectDir() {
      await wait()
      return '/home/usuario/proyectos/tienda'
    },
    async AnalyzeProject(dir, stack) {
      await wait(400)
      const st = stack || 'python'
      const spec = mockSpec(st, 'tienda')
      if (st === 'python') {
        Object.assign(spec, { framework: 'django', module: 'config', start: 'gunicorn config.wsgi:application --bind 0.0.0.0:8000', djangoMigrate: true, djangoCollectstatic: true, postgres: true, envKeys: ['SECRET_KEY', 'DB_PASSWORD'] })
      }
      return {
        dir, name: 'tienda', spec,
        evidence: st === 'python' ? ['Hay manage.py: proyecto Django (módulo config).', 'requirements.txt incluye psycopg: usa PostgreSQL.', 'Variables de entorno sacadas de .env.example: SECRET_KEY, DB_PASSWORD.'] : ['Tipo elegido a mano.'],
        warnings: [], existing: [], alternatives: st === 'python' ? ['node'] : ['python'],
      }
    },
    async DefaultDockerSpec(stack, name) {
      return mockSpec(stack, name)
    },
    async GenerateDocker(_dir, spec) {
      await wait(120)
      if (!/^[a-z0-9-]+$/.test(spec.name)) return { files: [], errors: ['el nombre solo puede tener minúsculas, números y guiones'] }
      const files = [
        { name: 'Dockerfile', content: `# Generado por Draupnode (demo)\nFROM ${spec.stack}:${spec.version}-slim\nWORKDIR /app\nCOPY . .\nEXPOSE ${spec.port}\nCMD ${JSON.stringify(spec.start.split(' '))}\n`, exists: false },
        { name: 'docker-compose.yml', content: `services:\n  ${spec.name}:\n    build: .\n    ports:\n      - "${spec.hostPort || spec.port}:${spec.port}"\n`, exists: false },
        { name: '.dockerignore', content: '.git\n.env\n__pycache__\n', exists: false },
        ...(spec.proxy ? [{ name: 'nginx.conf', content: `server {\n    listen 80;\n    server_name ${spec.proxyDomain || '_'};\n    location / {\n        proxy_pass http://${spec.name}:${spec.port};\n    }\n}\n`, exists: false }] : []),
      ]
      return { files, errors: [] }
    },
    async WriteDockerFiles() {
      await wait()
      return ['Dockerfile', 'docker-compose.yml', '.dockerignore']
    },
    async BuildDockerImage(_dir, spec) {
      const lines = ['#1 [internal] load build definition from Dockerfile', '#2 [internal] load metadata', '#5 [2/4] RUN pip install -r requirements.txt', '#8 exporting to image', '#8 naming to draupnode-prueba/' + spec.name + ':latest done']
      lines.forEach((t, i) => setTimeout(() => mockEmit('dockerbuild', { kind: 'line', text: t }), 300 * (i + 1)))
      setTimeout(() => mockEmit('dockerbuild', { kind: 'done', ok: true, image: 'draupnode-prueba/' + spec.name + ':latest', secs: 2 }), 300 * (lines.length + 1))
    },
    async CancelDockerBuild() {
      return false
    },
    async DockerLabTest(_dir, spec) {
      const st = ['Comprobando Docker en este equipo', 'Creando el servidor de pruebas (la primera vez tarda unos minutos)', 'Preparando Docker dentro del servidor de pruebas', 'Subiendo el proyecto', 'Construyendo y arrancando (puede tardar)', 'Comprobando que responde']
      st.forEach((t, i) => setTimeout(() => mockEmit('dockerlab', { kind: 'stage', text: t }), 400 * (i + 1)))
      setTimeout(() => mockEmit('dockerlab', { kind: 'line', text: '#8 naming to docker.io/library/' + spec.name + ':latest done' }), 2300)
      setTimeout(() => mockEmit('dockerlab', { kind: 'done', ok: true, http: 200, url: 'http://127.0.0.1:41234/', output: spec.name + ': Up 3 seconds\nweb: Up 2 seconds' }), 3000)
    },
    async CancelDockerLabTest() {
      return false
    },
    async DockerLabStop() {
      await wait()
    },
    async OpenProjectDir() {},
    async OpenURL(url) {
      window.open(url, '_blank')
    },
    async ServerLive(id) {
      const srv = servers.find((x) => x.id === id)
      if (!srv) throw new Error('servidor no encontrado')
      await new Promise((r) => setTimeout(r, 250))
      if (srv.host === '127.0.0.1' && srv.port === 2222) {
        return lab.server.running
          ? { reachable: true, latencyMs: 1, ...(lab.coolifyUp ? { webUrl: lab.coolifyUrl, webLabel: 'Coolify' } : {}) }
          : { reachable: false, latencyMs: 0, error: 'no responde' }
      }
      return { reachable: true, latencyMs: 38, webUrl: `http://${srv.host}:8000`, webLabel: 'Coolify' }
    },
    async ReadRunLog() {
      return ''
    },
  }

  // --- simulación de proyectos y ejecuciones ---
  function defaults(id: string): Record<string, unknown> {
    const m = MOCK_MODULES.find((x) => x.id === id)
    return Object.fromEntries((m?.variables ?? []).map((v) => [v.name, v.default]))
  }
  // Contraseñas de ejemplo (demo): las que generarían los módulos marcados.
  function mockGenerated(p: Project): ProjectSecret[] {
    const out: ProjectSecret[] = []
    const ids = p.modules.map((m) => m.id)
    if (ids.includes('postgres')) {
      out.push({ kind: 'generated', module: 'PostgreSQL compartido', label: 'Superusuario «postgres»', name: 'postgres_superusuario', value: 'Xr7Qp2LmV9sKdT4wNbHc8ZyF3jAeUg6P' })
      for (const db of (p.modules.find((m) => m.id === 'postgres')?.values.postgres_databases as string[] | undefined) ?? [])
        out.push({ kind: 'generated', module: 'PostgreSQL compartido', label: 'Usuario de la base', name: 'postgres_' + db, value: 'Hm3Ws8KqZ1vPx6DnRt4YbLc9Fj2Ga7Ue' })
    }
    if (ids.includes('alerts')) {
      out.push({ kind: 'generated', module: 'Alertas al móvil', label: 'Tema de ntfy (para suscribirte)', name: 'alerts_ntfy_topic', value: 'demo7k2p9xq4m8w3r5t1z6v0b' })
    }
    if (ids.includes('wireguard')) {
      const v = p.modules.find((m) => m.id === 'wireguard')?.values ?? {}
      ;((v.wireguard_peers as string[] | undefined) ?? ['portatil', 'movil']).forEach((d, i) => out.push({
        kind: 'generated', module: 'WireGuard (VPN)', label: 'Configuración WireGuard del dispositivo', name: `wireguard_${d}.conf`,
        value: `# WireGuard · ${d} (demo)\n[Interface]\nPrivateKey = cDemoNoUsarEstaClave${i}AAAAAAAAAAAAAAAAAAAAAAA=\nAddress = 10.8.0.${i + 2}/32\n\n[Peer]\nPublicKey = sDemoServidorAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\nEndpoint = 203.0.113.10:51820\nAllowedIPs = 10.8.0.0/24\nPersistentKeepalive = 25\n`,
      }))
    }
    if (ids.includes('coolify') && p.modules.find((m) => m.id === 'coolify')?.values.coolify_admin_email)
      out.push({ kind: 'generated', module: 'Coolify', label: 'Administrador de Coolify', name: 'coolify_admin',
        value: `Usuario: admin\nCorreo: ${p.modules.find((m) => m.id === 'coolify')?.values.coolify_admin_email}\nContraseña: Tq5Nv2Bx8KmPz4Wr7Ld3Hs6F-Aa9` })
    return out
  }

  function mockCheck(p: Project): ProjectCheck {
    const want = p.modules.map((m) => m.id)
    const order: string[] = []
    const visit = (id: string) => {
      if (order.includes(id)) return
      for (const d of MOCK_MODULES.find((x) => x.id === id)?.depends ?? []) visit(d)
      order.push(id)
    }
    ;[...want].sort().forEach(visit)
    const errors: ProjectCheck['errors'] = {}
    for (const pm of p.modules) {
      const m = MOCK_MODULES.find((x) => x.id === pm.id)
      for (const v of m?.variables ?? []) {
        const val = pm.values?.[v.name]
        const items = Array.isArray(val) ? val : val == null ? [] : [val]
        if (v.pattern && v.type !== 'bool' && v.type !== 'int') {
          const bad = items.map(String).filter((x) => x && !new RegExp(v.pattern!).test(x))
          if (bad.length) (errors[pm.id] ||= {})[v.name] = `«${bad[0]}»: ${v.patternHelp ?? 'formato no válido'}`
        }
      }
    }
    return { order, added: order.filter((x) => !want.includes(x)), errors, general: want.length ? [] : ['elige al menos un módulo'], warnings: [] }
  }
  function mockRun(p: Project, runId: string, check: boolean) {
    const ev = (e: Partial<RunEvent>) => mockEmit('run', { runId, projectId: p.id, ...e })
    const steps: [number, Partial<RunEvent>][] = []
    let t = 0
    const at = (ms: number, e: Partial<RunEvent>) => steps.push([(t += ms), e])
    at(200, { kind: 'ev', ev: { ev: 'stage', name: 'Preparando Ansible en /opt/draupnode/venv (solo la primera vez, 1-2 minutos)' } })
    at(900, { kind: 'ev', ev: { ev: 'stage', name: 'Desempaquetando el proyecto' } })
    at(300, { kind: 'ev', ev: { ev: 'stage', name: 'Ejecutando Ansible' } })
    at(200, { kind: 'ev', ev: { ev: 'play', name: 'Draupnode · ' + p.name } })
    at(200, { kind: 'ev', ev: { ev: 'task', name: 'Gathering Facts', role: '' } })
    at(500, { kind: 'ev', ev: { ev: 'ok', changed: false } })
    for (const n of ['Comprobar el sistema operativo', 'Comprobar la memoria RAM (mínimo 1800 MB)', 'Carpeta de secretos del proyecto']) {
      at(150, { kind: 'ev', ev: { ev: 'task', name: 'draupnode_preflight : ' + n, role: 'draupnode_preflight' } })
      at(250, { kind: 'ev', ev: { ev: 'ok', changed: false } })
    }
    let changed = 0
    for (const m of p.modules) {
      const names: Record<string, string[]> = {
        base: ['Actualizar el índice de paquetes', 'Instalar paquetes básicos', 'Fijar la zona horaria (Europe/Madrid)', 'Activar el swap'],
        firewall: ['Instalar iptables y netfilter-persistent', 'Abrir puertos TCP'],
        docker: ['¿Está Docker instalado?', 'Ejecutar get-docker.sh (tarda un par de minutos)', 'Desactivar el image store de containerd', 'Usuarios en el grupo docker'],
        coolify: ['Abrir los puertos del panel de Coolify', 'Ejecutar el instalador de Coolify (tarda varios minutos)', 'Nota'],
        postgres: ['Red Docker «apps»', 'docker-compose.yml', 'Arrancar PostgreSQL', 'Crear cada base', 'Nota'],
      }
      for (const n of names[m.id] ?? ['Tarea']) {
        at(200, { kind: 'ev', ev: { ev: 'task', name: `${m.id} : ${n}`, role: m.id } })
        const ch = !n.startsWith('¿') && n !== 'Nota'
        if (ch) changed++
        const e: Record<string, unknown> = { ev: 'ok', changed: ch }
        if (n === 'Nota') e.note = m.id === 'coolify' ? 'Panel de Coolify: http://203.0.113.10:8000 — entra ya y crea tu usuario.' : 'Contraseñas en /etc/draupnode/secretos/' + p.name.toLowerCase() + '/ (solo root).'
        at(n.includes('tarda') ? 1500 : 450, { kind: 'ev', ev: e })
        if (check && ch && n.includes('yml')) at(50, { kind: 'ev', ev: { ev: 'diff', text: '--- before\n+++ after\n@@ -0,0 +1,3 @@\n+name: draupnode-postgres\n+services:\n+  postgres:' } })
      }
    }
    at(300, { kind: 'ev', ev: { ev: 'stats', ok: 30, changed, failures: 0, unreachable: 0, skipped: 2 } })
    const start = Date.now()
    for (const [ms, e] of steps) {
      setTimeout(() => {
        if (!cancelled.has(runId)) ev(e)
      }, ms)
    }
    setTimeout(() => {
      const c = cancelled.has(runId)
      const summary: RunSummary = { at: new Date(start).toISOString(), check, ok: !c, canceled: c, changed, failed: 0, tasks: 20, durationMs: Date.now() - start, error: c ? 'cancelado' : undefined }
      projects = projects.map((x) => (x.id === p.id ? { ...x, lastRun: summary, ...(summary.ok && (!check || summary.changed === 0)
        ? { appliedAt: summary.at, installedModules: [...new Set([...(x.installedModules ?? []), ...x.modules.map((m) => m.id)])].sort() } : {}) } : x))
      save('projects', projects)
      ev({ kind: 'done', summary })
    }, t + 400)
  }
}

const MOCK_VERSIONS: Record<string, string[]> = {
  python: ['3.13', '3.12', '3.11', '3.10'], node: ['22', '20', '24'], java: ['21', '17', '25', '11'],
  php: ['8.3', '8.4', '8.2'], go: ['1.23', '1.24', '1.22'], static: [''],
}
function mockSpec(stack: string, name: string): DockerSpec {
  const port: Record<string, number> = { python: 8000, node: 3000, java: 8080, php: 80, go: 8080, static: 80 }
  return {
    stack, framework: stack === 'node' ? 'server' : '', name, version: MOCK_VERSIONS[stack]?.[0] ?? '', port: port[stack] ?? 8000, hostPort: 0,
    start: stack === 'python' ? 'python main.py' : stack === 'node' ? 'npm run start' : '', pyInstall: 'requirements', module: 'config', extraPip: [],
    djangoMigrate: false, djangoCollectstatic: false, djangoSuperuser: false, nodePm: 'npm', nodeBuild: false, nodeLock: true, staticDir: 'dist',
    javaBuild: 'maven', javaWrapper: false, docRoot: '', laravelMigrate: false, goMain: '.', systemPackages: [], volumes: [], envKeys: [],
    nonRoot: true, healthPath: '', postgres: false, mariadb: false, redis: false, dbMode: 'own', sharedNetwork: 'apps', sharedHost: 'pg-compartido', sideBySide: false,
    proxy: false, proxyDomain: '', proxyPort: 80, maxBodyMb: 50,
  }
}

// Catálogo de la demo: copia de los módulos incluidos (go test con un volcado del catálogo).
const MOCK_MODULES: Module[] = [
  {"id":"firewall","name":"Cortafuegos (iptables)","version":"1.0.0","category":"1 · Sistema","description":"Abre en el cortafuegos del servidor los puertos TCP indicados y guarda las reglas para que sobrevivan a un reinicio.","details":"Usa iptables + netfilter-persistent, que es lo que traen las imágenes de Ubuntu\nde Oracle Cloud (su INPUT acaba en REJECT, así que hay que abrir cada puerto).\nEn Oracle Cloud abre también los mismos puertos en la «Security List» de la VCN:\neso es un cortafuegos aparte, fuera del servidor.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"firewall_tcp_ports","label":"Puertos TCP abiertos","help":"El 22 (SSH) se abre siempre aunque no esté en la lista.","type":"list","default":["22","80","443"],"pattern":"^([1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$","patternHelp":"Número de puerto entre 1 y 65535"}],"links":[{"label":"iptables (netfilter)","url":"https://www.netfilter.org/projects/iptables/"},{"label":"Código fuente","url":"https://git.netfilter.org/iptables/"}],"uninstallable":true,"uninstallWarning":"Quita las reglas que abrió Draupnode en iptables (salvo el SSH, para no perder la conexión). Las demás reglas del servidor no se tocan.","source":"builtin","files":["handlers/main.yml","tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"ssh","name":"SSH seguro + fail2ban","version":"1.0.0","category":"1 · Sistema","description":"Cierra el SSH a lo imprescindible (sin root, sin contraseñas, pocos intentos) y bloquea con fail2ban a quien pruebe contraseñas.","details":"Escribe /etc/ssh/sshd_config.d/01-draupnode.conf (manda sobre el resto, como\nel 50-cloud-init.conf que pone PasswordAuthentication yes) y lo comprueba con\n«sshd -t» antes de recargar: si algo está mal, lo deja como estaba.\nPara que no te quedes fuera, Draupnode no te deja quitar la contraseña si\nentra con ella, ni prohibir root si entra como root, y al aplicar comprueba\nque tu usuario tiene una clave autorizada.\nfail2ban nunca bloquea la IP desde la que te conectas.\nSi cambias el puerto, se abre en el Cortafuegos antes de cambiar el SSH y\nDraupnode actualiza el servidor al terminar. En Oracle Cloud ábrelo también\nen la Security List ANTES de aplicar. El 22 queda abierto en el Cortafuegos\nhasta que lo quites tú.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"ssh_port","label":"Puerto SSH","help":"22 es el habitual. Cambiarlo reduce el ruido de los robots, no es seguridad de verdad.","type":"int","default":22,"min":1,"max":65535},{"name":"ssh_password_auth","label":"Permitir entrar con contraseña","help":"Desmarcado = solo con clave SSH (lo recomendado).","type":"bool","default":false},{"name":"ssh_root_login","label":"Entrar como root","help":"«no» = nadie entra como root (se usa sudo). «solo-con-clave» = root sí, pero nunca con contraseña.","type":"select","default":"no","options":["no","solo-con-clave"]},{"name":"ssh_allow_users","label":"Solo pueden entrar estos usuarios","help":"Uno por línea. Vacío = cualquier usuario con clave.","type":"list","default":[],"pattern":"^[a-z_][a-z0-9_.-]{0,31}$","patternHelp":"Nombre de usuario de Linux (minúsculas, números, _ . -)"},{"name":"ssh_max_auth_tries","label":"Intentos por conexión","type":"int","default":4,"min":2,"max":10},{"name":"ssh_fail2ban","label":"Instalar fail2ban","type":"bool","default":true},{"name":"ssh_fail2ban_maxretry","label":"Fallos antes de bloquear","type":"int","default":5,"min":2,"max":20},{"name":"ssh_fail2ban_bantime","label":"Tiempo de bloqueo","help":"Quien reincide se bloquea una semana (cárcel «recidive»).","type":"select","default":"1h","options":["10m","1h","1d","1w"]},{"name":"ssh_fail2ban_ignore","label":"IPs que nunca se bloquean","help":"Además de la tuya, que se añade sola. Una por línea (IP o red, p. ej. 203.0.113.0/24).","type":"list","default":[],"pattern":"^[0-9A-Fa-f:.]+(/[0-9]{1,3})?$","patternHelp":"Una IP o una red (203.0.113.7 o 203.0.113.0/24)"}],"firewallPortsFrom":["ssh_port"],"links":[{"label":"OpenSSH","url":"https://www.openssh.com"},{"label":"Código fuente de OpenSSH","url":"https://github.com/openssh/openssh-portable"},{"label":"fail2ban","url":"https://github.com/fail2ban/fail2ban"}],"after":["firewall"],"uninstallable":true,"uninstallWarning":"Quita el endurecimiento y fail2ban. El SSH NO se desinstala (es por donde se conecta Draupnode) - vuelve a su configuración de antes; si el servidor la traía así, puede volver a aceptar contraseñas.","source":"builtin","files":["handlers/main.yml","tasks/main.yml","tasks/uninstall.yml","templates/01-draupnode.conf.j2","templates/jail-draupnode.local.j2"]},
  {"id":"base","name":"Sistema base","version":"1.0.0","category":"1 · Sistema","description":"Paquetes básicos, zona horaria, memoria de intercambio (swap) y actualizaciones de seguridad automáticas.","details":"Espera a que apt quede libre (en un servidor recién creado suele estar ocupado\ncon actualizaciones), instala los paquetes indicados, fija la zona horaria,\ncrea /swapfile si se pide y activa unattended-upgrades para los parches de seguridad.\n","depends":null,"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"base_packages","label":"Paquetes a instalar","type":"list","default":["curl","ca-certificates","gnupg","jq","openssl","python3","logrotate","htop","unzip"],"pattern":"^[a-z0-9][a-z0-9.+-]*$","patternHelp":"Nombre de paquete apt (minúsculas, números, . + -)"},{"name":"base_timezone","label":"Zona horaria","type":"string","default":"Europe/Madrid","pattern":"^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$","patternHelp":"Formato Región/Ciudad, p. ej. Europe/Madrid"},{"name":"base_swap_mb","label":"Swap (MB)","help":"Memoria de intercambio en /swapfile. 0 = no crear. Útil en servidores con poca RAM.","type":"int","default":2048,"min":0,"max":65536},{"name":"base_auto_updates","label":"Actualizaciones de seguridad automáticas","type":"bool","default":true}],"links":[{"label":"Ubuntu Server (documentación)","url":"https://ubuntu.com/server/docs"},{"label":"Debian","url":"https://www.debian.org"},{"label":"Actualizaciones automáticas (unattended-upgrades)","url":"https://github.com/mvo5/unattended-upgrades"}],"uninstallable":false,"noUninstall":"son los paquetes y ajustes básicos del sistema (zona horaria, swap, actualizaciones de seguridad); otros programas los usan y quitarlos podría romperlos.","source":"builtin","files":["tasks/main.yml"]},
  {"id":"wireguard","name":"WireGuard (VPN)","version":"1.0.0","category":"1 · Sistema","description":"Tu propia VPN. Con ella entras al servidor como si estuvieras en su red, para ver paneles (Grafana, Cockpit…) sin abrirlos a internet.","details":"WireGuard (GPL-2) del sistema, con la interfaz wg0. Cada nombre de\n«Dispositivos» (portátil, móvil…) tiene su configuración: se genera EN el\nservidor la primera vez, con su propia clave, y Draupnode la trae a tu\nbóveda. En la página de este módulo la ves con su código QR (para la app\nde WireGuard del móvil) o la guardas como .conf (para el ordenador).\nQuitar un nombre de la lista le quita el acceso.\nAbre el puerto UDP elegido en iptables (si lo hay). En Oracle Cloud ábrelo\ntambién en la Security List, como UDP.\nCon «Todo el tráfico por la VPN», el dispositivo sale a internet a través\ndel servidor (útil en una wifi pública); si no, solo va por la VPN lo que\nes para el servidor.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"wireguard_peers","label":"Dispositivos","help":"Uno por línea (portatil, movil…). Cada uno tiene su clave y su dirección en la VPN.","type":"list","default":["portatil","movil"],"pattern":"^[a-z0-9][a-z0-9-]{0,30}$","patternHelp":"Minúsculas, números y guiones"},{"name":"wireguard_port","label":"Puerto UDP","type":"int","default":51820,"min":1024,"max":65535},{"name":"wireguard_network","label":"Red de la VPN","help":"Una red privada /24 que no use tu casa ni el servidor. El servidor es la .1.","type":"string","default":"10.8.0.0/24","pattern":"^(10|172|192)\\.[0-9]{1,3}\\.[0-9]{1,3}\\.0/24$","patternHelp":"Una red /24 privada, p. ej. 10.8.0.0/24"},{"name":"wireguard_endpoint","label":"Dirección pública del servidor","help":"Por la que se conectan los dispositivos. Vacío = la misma con la que entra Draupnode.","type":"string","default":"","pattern":"^[A-Za-z0-9.:-]*$","patternHelp":"IP o nombre, sin puerto"},{"name":"wireguard_route_all","label":"Todo el tráfico por la VPN","help":"El dispositivo sale a internet a través del servidor.","type":"bool","default":false},{"name":"wireguard_dns","label":"DNS para los dispositivos","help":"Vacío = el suyo de siempre. Con AdGuard Home en el proyecto se pone solo (la .1 de la VPN). Ejemplo 9.9.9.9.","type":"string","default":"","pattern":"^([0-9.]+(, *[0-9.]+)*)?$","patternHelp":"IPs separadas por comas"}],"udpPortsFrom":["wireguard_port"],"links":[{"label":"Web oficial","url":"https://www.wireguard.com"},{"label":"Apps para móvil y ordenador","url":"https://www.wireguard.com/install/"},{"label":"Código fuente","url":"https://git.zx2c4.com/wireguard-tools/"}],"secrets":[{"file":"wireguard_*.conf","label":"Configuración WireGuard del dispositivo"}],"uninstallable":true,"uninstallWarning":"Para la VPN y quita la interfaz wg0. Los dispositivos dejan de poder conectarse.","uninstallData":"Borrar también las claves del servidor y de los dispositivos (si lo reinstalas, habrá que volver a configurarlos todos).","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/peer.conf.j2","templates/wg0.conf.j2"]},
  {"id":"docker","name":"Docker","version":"1.0.0","category":"2 · Contenedores","description":"Instala Docker Engine con el script oficial, lo deja arrancado y da permisos a tu usuario.","details":"Si se marca «almacenamiento clásico», desactiva el image store de containerd\nANTES de que se descarguen imágenes. Sin eso cAdvisor no puede medir CPU/RAM\npor contenedor en Grafana. Si Coolify ya está instalado no se toca, porque\ncambiarlo después dejaría sus contenedores sin arrancar.\n","depends":["base"],"requires":{"os":["ubuntu","debian"],"minRamMb":900,"minDiskGb":10},"variables":[{"name":"docker_classic_storage","label":"Almacenamiento clásico overlay2","help":"Necesario para ver CPU/RAM por contenedor en la monitorización.","type":"bool","default":true},{"name":"docker_users","label":"Otros usuarios en el grupo docker","help":"Tu usuario de conexión se añade siempre.","type":"list","default":[],"pattern":"^[a-z_][a-z0-9_-]{0,31}$","patternHelp":"Nombre de usuario de Linux"}],"links":[{"label":"Web oficial","url":"https://www.docker.com"},{"label":"Documentación","url":"https://docs.docker.com"},{"label":"Código fuente (Moby)","url":"https://github.com/moby/moby"}],"uninstallable":true,"uninstallWarning":"Para y desinstala Docker. Se paran TODOS los contenedores del servidor, también los que no instaló Draupnode.","uninstallData":"Borrar también /var/lib/docker y /var/lib/containerd (imágenes, contenedores y volúmenes de TODAS las apps). Sin esto, si reinstalas Docker vuelve a estar todo.","source":"builtin","files":["handlers/main.yml","tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"git-app","name":"App desde Git (Docker Compose)","version":"1.0.0","category":"3 · Plataformas","description":"Despliega tu app desde su repositorio de Git con su docker-compose.yml (por ejemplo, el que genera Docker Creator). Al aplicar, la actualiza.","details":"Clona el repositorio en /srv/draupnode/apps/\u003cnombre\u003e y la arranca con\n«docker compose up -d --build». Cada vez que aplicas, trae lo último de la\nrama y la vuelve a construir (solo se reinicia lo que cambia).\nRepositorio privado: Draupnode crea una «deploy key» en el servidor; la ves\nen «Contraseñas del proyecto» y la añades en tu GitHub/GitLab/Forgejo\n(Settings → Deploy keys, solo lectura). Usa la dirección SSH\n(git@github.com:usuario/repo.git).\nVariables (.env): las normales, una por línea «CLAVE=valor»; las que deben\nser secretas y al azar (SECRET_KEY, DB_PASSWORD…), en «Generar en el\nservidor»: se crean una vez y no cambian.\nDominio: con Caddy o nginx en el proyecto, se añade solo a sus sitios.\nUna app por proyecto: para otra, crea otro proyecto en el mismo servidor.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"git_app_repo","label":"Repositorio","help":"https://github.com/usuario/repo.git (público) o git@github.com:usuario/repo.git (privado, con deploy key).","type":"string","default":null,"required":true,"pattern":"^(https://[A-Za-z0-9._~:/?#@!$\u0026()*+,;=%-]+|[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._/~-]+)$","patternHelp":"Dirección https:// o git@servidor:usuario/repo.git"},{"name":"git_app_branch","label":"Rama","type":"string","default":"main","pattern":"^[A-Za-z0-9._/-]+$","patternHelp":"Nombre de rama"},{"name":"git_app_name","label":"Nombre de la app","help":"Para su carpeta y sus contenedores.","type":"string","default":"app","pattern":"^[a-z][a-z0-9-]{1,30}$","patternHelp":"Minúsculas, números y guiones"},{"name":"git_app_compose","label":"Fichero compose","help":"Dentro del repositorio.","type":"string","default":"docker-compose.yml","pattern":"^[A-Za-z0-9._/-]+\\.ya?ml$","patternHelp":"Ruta a un .yml"},{"name":"git_app_env","label":"Variables (.env)","help":"Una por línea, «CLAVE=valor». No pongas aquí contraseñas (van en el campo de abajo).","type":"list","default":[],"pattern":"^[A-Za-z_][A-Za-z0-9_]*=.*$","patternHelp":"CLAVE=valor"},{"name":"git_app_env_generate","label":"Generar en el servidor (secretos al azar)","help":"Nombres de variables, uno por línea (SECRET_KEY, DB_PASSWORD…). Se crean una vez y se guardan.","type":"list","default":[],"pattern":"^[A-Za-z_][A-Za-z0-9_]*$","patternHelp":"Nombre de variable"},{"name":"git_app_env_secret","label":"Variables secretas con valor tuyo","help":"Tokens o claves que ya tienes: «CLAVE=valor; OTRA=valor». Se guardan cifradas en tu bóveda.","type":"secret","default":null},{"name":"git_app_port","label":"Puerto de la app en el servidor","help":"El que publica tu compose (para el dominio y la comprobación). 0 = no comprobar.","type":"int","default":8000,"min":0,"max":65535},{"name":"git_app_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el proyecto, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (tienda.ejemplo.com) o vacío"},{"name":"git_app_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal con dominio). Si no, se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"git_app_update","label":"Traer lo último de Git al aplicar","type":"bool","default":true}],"firewallPortsFrom":["git_app_public_port"],"proxySite":{"domain":"git_app_domain","port":"git_app_port"},"links":[{"label":"Git","url":"https://git-scm.com"},{"label":"Docker Compose","url":"https://docs.docker.com/compose/"},{"label":"Código de Compose","url":"https://github.com/docker/compose"}],"secrets":[{"file":"git_app_*.pub","label":"Deploy key (añádela al repositorio, solo lectura)"},{"file":"git_app_env_*","label":"Valor generado para el .env"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de la app.","uninstallData":"Borrar también su carpeta, sus volúmenes de Docker (datos de la app y su base de datos) y sus valores generados.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"caddy","name":"Caddy (web y HTTPS automático)","version":"1.0.0","category":"3 · Plataformas","description":"Publica tus apps en tu dominio con HTTPS. Caddy pide y renueva solo los certificados de Let's Encrypt.","details":"Caddy (Apache-2) del repositorio de Ubuntu/Debian, como servicio del sistema.\nCada línea de «Sitios» es «dominio destino»:\n  fotos.ejemplo.com 127.0.0.1:2283      → reenvía a la app de ese puerto\n  blog.ejemplo.com /srv/www/blog        → sirve esa carpeta (web estática)\nEl dominio tiene que apuntar ya a la IP de este servidor (registro A/AAAA)\ny los puertos 80 y 443 tienen que estar abiertos (se añaden al Cortafuegos):\nasí Caddy consigue el certificado él solo. Mientras el DNS no apunte, ese\nsitio no tendrá HTTPS (los demás sí). Un dominio terminado en .localhost\nusa un certificado propio de Caddy (para pruebas).\nAntes de recargar se comprueba la configuración: si tiene un error, se\nqueda la anterior funcionando.\nNo puede ir con Coolify ni con nginx: los tres quieren los puertos 80 y 443.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"caddy_sites","label":"Sitios","help":"Una línea por sitio: «dominio destino». Destino = 127.0.0.1:PUERTO (una app) o /carpeta (web estática).","type":"list","default":[],"pattern":"^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}[ ]+(((https?://)?[A-Za-z0-9.-]+:[0-9]{1,5})|(/[A-Za-z0-9._/-]+))$","patternHelp":"Ejemplo: fotos.ejemplo.com 127.0.0.1:2283","placeholder":"fotos.ejemplo.com 127.0.0.1:2283"},{"name":"caddy_email","label":"Correo para Let's Encrypt","help":"Opcional. Te avisan si un certificado no se puede renovar.","type":"string","default":"","pattern":"^([^@\\s]+@[^@\\s]+\\.[^@\\s]+)?$","patternHelp":"Un correo válido o vacío"},{"name":"caddy_compress","label":"Comprimir las respuestas (gzip/zstd)","type":"bool","default":true},{"name":"caddy_security_headers","label":"Cabeceras de seguridad","help":"HSTS, no dejar meter la web en un marco de otra, no adivinar tipos de fichero…","type":"bool","default":true}],"firewallPorts":[80,443],"links":[{"label":"Web oficial","url":"https://caddyserver.com"},{"label":"Documentación","url":"https://caddyserver.com/docs/"},{"label":"Código fuente","url":"https://github.com/caddyserver/caddy"}],"conflicts":["coolify","nginx"],"uninstallable":true,"uninstallWarning":"Desinstala Caddy. Tus sitios dejan de verse por su dominio; las apps de detrás siguen en marcha.","uninstallData":"Borrar también los certificados que había conseguido Caddy (/var/lib/caddy). Si lo reinstalas, los vuelve a pedir.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/Caddyfile.j2"]},
  {"id":"coolify","name":"Coolify","version":"1.0.0","category":"3 · Plataformas","description":"Panel para desplegar tus apps desde GitHub/GitLab con dominio y HTTPS automáticos (proxy Traefik + Let's Encrypt).","details":"Instala Coolify con su instalador oficial.\nSi pones un correo de administrador, Draupnode crea ese usuario al instalar con\nuna contraseña generada en el propio servidor (se guarda en\n/etc/draupnode/secretos/\u003cproyecto\u003e/coolify_admin, solo root). Si lo dejas vacío,\nentra ENSEGUIDA en http://IP:8000 y crea tu usuario: el primero que entre se\nqueda de administrador (hay 10 minutos).\nEstas dos opciones solo cuentan en la primera instalación; después se cambian\ndesde el panel de Coolify.\nAl marcarlo se añaden a la lista del Cortafuegos los puertos de su panel\n(8000, 6001 y 6002); quítalos de ahí cuando el panel tenga dominio propio.\nEn Oracle Cloud ábrelos también en la Security List.\n","depends":["docker","firewall"],"requires":{"os":["ubuntu","debian"],"minRamMb":1800,"minDiskGb":30},"variables":[{"name":"coolify_admin_email","label":"Correo del administrador","help":"Vacío = el primero que entre al panel crea el administrador.","type":"string","default":"","pattern":"^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$","patternHelp":"Un correo válido (nombre@dominio.ext)","placeholder":"tu@ejemplo.com"},{"name":"coolify_admin_user","label":"Nombre del administrador","type":"string","default":"admin","pattern":"^[A-Za-z0-9._-]{3,40}$","patternHelp":"3 a 40 letras, números, . _ o -"},{"name":"coolify_autoupdate","label":"Actualizaciones automáticas","help":"Coolify se actualiza solo a cada versión nueva. Desactívalo si prefieres actualizar tú desde el panel.","type":"bool","default":true}],"firewallPorts":[8000,6001,6002],"links":[{"label":"Web oficial","url":"https://coolify.io"},{"label":"Documentación","url":"https://coolify.io/docs"},{"label":"Código fuente","url":"https://github.com/coollabsio/coolify"}],"secrets":[{"file":"coolify_admin","label":"Administrador de Coolify"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Coolify (panel, base de datos, proxy). Las apps que desplegaste con Coolify dejan de verse por su dominio, porque su proxy se quita; sus contenedores no se borran.","uninstallData":"Borrar también /data/coolify y sus volúmenes (la configuración del panel, usuarios, claves SSH y copias). Sin esto, si reinstalas Coolify vuelve todo como estaba.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"nginx","name":"nginx (web y proxy)","version":"1.0.0","category":"3 · Plataformas","description":"Publica tus apps en tu dominio con nginx, el servidor web más usado. HTTPS con certbot (Let's Encrypt), que se renueva solo.","details":"nginx (BSD-2) y certbot (Apache-2) de los repositorios de Ubuntu/Debian.\nCada línea de «Sitios» es «dominio destino»:\n  fotos.ejemplo.com 127.0.0.1:2283      → reenvía a la app de ese puerto\n  blog.ejemplo.com /srv/www/blog        → sirve esa carpeta (web estática)\nCada sitio va en su fichero /etc/nginx/sites-available/draupnode-\u003cdominio\u003e.conf;\nlos tuyos (los que no empiezan por draupnode-) no se tocan.\nCon HTTPS, certbot pide el certificado de cada dominio y redirige http→https.\nEl dominio tiene que apuntar ya a la IP de este servidor: si no, ese sitio\nse queda en http y se avisa (al volver a aplicar lo reintenta).\nAntes de recargar se comprueba la configuración (nginx -t): si falla, se\nvuelve a la anterior.\nSi no sabes cuál elegir, Caddy es más sencillo; nginx es el más conocido.\nNo puede ir con Coolify ni con Caddy: los tres quieren los puertos 80 y 443.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"nginx_sites","label":"Sitios","help":"Una línea por sitio: «dominio destino». Destino = 127.0.0.1:PUERTO (una app) o /carpeta (web estática).","type":"list","default":[],"pattern":"^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}[ ]+(((https?://)?[A-Za-z0-9.-]+:[0-9]{1,5})|(/[A-Za-z0-9._/-]+))$","patternHelp":"Ejemplo: fotos.ejemplo.com 127.0.0.1:2283","placeholder":"fotos.ejemplo.com 127.0.0.1:2283"},{"name":"nginx_https","label":"HTTPS con Let's Encrypt (certbot)","type":"bool","default":true},{"name":"nginx_email","label":"Correo para Let's Encrypt","help":"Obligatorio con HTTPS. Te avisan si un certificado no se puede renovar.","type":"string","default":"","pattern":"^([^@\\s]+@[^@\\s]+\\.[^@\\s]+)?$","patternHelp":"Un correo válido o vacío"},{"name":"nginx_max_body_mb","label":"Tamaño máximo de subida (MB)","help":"Lo que se puede subir de una vez (fotos, documentos…).","type":"int","default":50,"min":1,"max":10240},{"name":"nginx_remove_default","label":"Quitar la página «Welcome to nginx»","type":"bool","default":true},{"name":"nginx_security_headers","label":"Cabeceras de seguridad","help":"No dejar meter la web en un marco de otra, no adivinar tipos de fichero, no decir la versión de nginx…","type":"bool","default":true}],"firewallPorts":[80,443],"links":[{"label":"Web oficial","url":"https://nginx.org"},{"label":"Código fuente","url":"https://github.com/nginx/nginx"},{"label":"certbot (Let's Encrypt)","url":"https://certbot.eff.org"}],"conflicts":["coolify","caddy"],"uninstallable":true,"uninstallWarning":"Desinstala nginx y certbot. Tus sitios dejan de verse por su dominio; las apps de detrás siguen en marcha.","uninstallData":"Borrar también los certificados de Let's Encrypt (/etc/letsencrypt) y la configuración de nginx.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/site.conf.j2"]},
  {"id":"mariadb","name":"MariaDB compartido","version":"1.0.0","category":"4 · Bases de datos","description":"Un MariaDB (compatible con MySQL) en Docker para tus apps, con una base y un usuario por app. Las contraseñas se generan en el servidor.","details":"MariaDB (GPL-2) en Docker. Solo es accesible desde la red Docker indicada\n(las apps lo ven por el nombre del contenedor); no se publica ningún puerto.\nLas contraseñas se generan en el propio servidor la primera vez y se\nguardan en /etc/draupnode/secretos/\u003cproyecto\u003e/ (solo root); Draupnode trae\nuna copia a tu bóveda. El módulo Copias vuelca sus bases cada día.\nPuede ir junto al PostgreSQL compartido (cada app usa el que necesite).\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":700},"variables":[{"name":"mariadb_version","label":"Versión de MariaDB","help":"Las LTS (con años de actualizaciones).","type":"select","default":"11.4","options":["11.4","10.11"]},{"name":"mariadb_container","label":"Nombre del contenedor","help":"Es el «host» con el que tus apps se conectan.","type":"string","default":"mariadb-compartido","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"mariadb_network","label":"Red Docker compartida","type":"string","default":"apps","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"mariadb_databases","label":"Bases de datos","help":"Una por línea. Cada una tendrá un usuario con el mismo nombre y su propia contraseña.","type":"list","default":[],"pattern":"^[a-z][a-z0-9_]{0,30}$","patternHelp":"Minúsculas, números y _ (empezando por letra)"},{"name":"mariadb_dir","label":"Carpeta en el servidor","type":"string","default":"/srv/draupnode/mariadb","pattern":"^/[A-Za-z0-9._/-]+$","patternHelp":"Ruta absoluta"}],"links":[{"label":"Web oficial","url":"https://mariadb.org"},{"label":"Documentación","url":"https://mariadb.com/kb/"},{"label":"Código fuente","url":"https://github.com/MariaDB/server"}],"checks":[{"containerFree":"mariadb_container"}],"secrets":[{"file":"mariadb_root","label":"Usuario «root» de MariaDB"},{"file":"mariadb_*","label":"Usuario de la base"}],"uninstallable":true,"uninstallWarning":"Para y quita el contenedor de MariaDB. Las apps que lo usan dejan de tener base de datos.","uninstallData":"Borrar también los DATOS de todas las bases y sus contraseñas. No se puede deshacer.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"postgres","name":"PostgreSQL compartido","version":"1.0.0","category":"4 · Bases de datos","description":"Un PostgreSQL en Docker para todas tus apps, con una base y un usuario por app. Las contraseñas se generan en el servidor.","details":"Solo es accesible desde la red Docker indicada (las apps lo ven por el nombre\ndel contenedor). Las contraseñas se generan en el propio servidor la primera\nvez y se guardan en /etc/draupnode/secretos/\u003cproyecto\u003e/ (solo root); nunca se\npisan al relanzar.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":900},"variables":[{"name":"postgres_version","label":"Versión de PostgreSQL","type":"select","default":"16","options":["15","16","17"]},{"name":"postgres_container","label":"Nombre del contenedor","help":"Es el «host» con el que tus apps se conectan.","type":"string","default":"pg-compartido","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"postgres_network","label":"Red Docker compartida","type":"string","default":"apps","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"postgres_databases","label":"Bases de datos","help":"Una por línea. Cada una tendrá un usuario con el mismo nombre y su propia contraseña.","type":"list","default":[],"pattern":"^[a-z][a-z0-9_]{0,30}$","patternHelp":"Minúsculas, números y _ (empezando por letra)"},{"name":"postgres_dir","label":"Carpeta en el servidor","type":"string","default":"/srv/draupnode/postgres","pattern":"^/[A-Za-z0-9._/-]+$","patternHelp":"Ruta absoluta"}],"links":[{"label":"Web oficial","url":"https://www.postgresql.org"},{"label":"Documentación","url":"https://www.postgresql.org/docs/"},{"label":"Código fuente","url":"https://github.com/postgres/postgres"}],"checks":[{"containerFree":"postgres_container"}],"secrets":[{"file":"postgres_superusuario","label":"Superusuario «postgres»"},{"file":"postgres_*","label":"Usuario de la base"}],"uninstallable":true,"uninstallWarning":"Para y quita el contenedor de PostgreSQL. Las apps que lo usan dejan de tener base de datos.","uninstallData":"Borrar también los DATOS de todas las bases y sus contraseñas. No se puede deshacer.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"backups","name":"Copias de seguridad (restic)","version":"1.0.0","category":"5 · Copias","description":"Copia diaria cifrada con restic de tus bases de datos, Coolify, la carpeta de secretos y las carpetas que elijas. Opcional, una segunda copia fuera del servidor.","details":"restic (código abierto, BSD) guarda las copias cifradas y sin duplicados en\n{carpeta}/\u003cproyecto\u003e/restic-repo. Su contraseña se genera en el servidor y\nDraupnode la trae a tu bóveda: SIN ELLA LAS COPIAS NO SE PUEDEN ABRIR.\nCada día a la hora indicada (systemd): vuelca PostgreSQL y la base de\nCoolify si están, copia la carpeta de secretos del proyecto y tus carpetas,\nborra las copias viejas según lo que conservas y comprueba el repositorio.\nUna copia que solo está en el servidor no te salva si pierdes el servidor:\nusa «Traer copias al equipo» en el proyecto, o un destino remoto propio\n(otro servidor por SFTP, un rest-server de restic o un S3 compatible como\nMinIO o Garage; todos de código abierto).\n","depends":["base"],"requires":{"os":["ubuntu","debian"],"minDiskGb":5},"variables":[{"name":"backups_time","label":"Hora de la copia diaria","help":"Hora del servidor (HH:MM). Se retrasa hasta 10 minutos al azar.","type":"string","default":"03:30","pattern":"^([01][0-9]|2[0-3]):[0-5][0-9]$","patternHelp":"Formato HH:MM (p. ej. 03:30)"},{"name":"backups_paths","label":"Carpetas que copiar","help":"Una por línea. La carpeta de secretos del proyecto se copia siempre.","type":"list","default":[],"pattern":"^/[A-Za-z0-9._/-]+$","patternHelp":"Ruta absoluta (empieza por /)"},{"name":"backups_postgres","label":"Volcar PostgreSQL","help":"Todas las bases del contenedor indicado (pg_dumpall), si existe.","type":"bool","default":true},{"name":"backups_postgres_container","label":"Contenedor de PostgreSQL","type":"string","default":"pg-compartido","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"backups_mariadb","label":"Volcar MariaDB","help":"Cada base del contenedor indicado (mariadb-dump), si existe.","type":"bool","default":true},{"name":"backups_mariadb_container","label":"Contenedor de MariaDB","type":"string","default":"mariadb-compartido","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"backups_apps","label":"Copiar las apps de Draupnode","help":"La carpeta /srv/draupnode/apps (código, .env y datos de las apps instaladas con Draupnode), si existe.","type":"bool","default":true},{"name":"backups_coolify","label":"Copiar Coolify","help":"Su base de datos, su .env y sus claves SSH, si Coolify está instalado.","type":"bool","default":true},{"name":"backups_keep_daily","label":"Copias diarias que se conservan","type":"int","default":7,"min":1,"max":90},{"name":"backups_keep_weekly","label":"Copias semanales que se conservan","type":"int","default":4,"min":0,"max":52},{"name":"backups_keep_monthly","label":"Copias mensuales que se conservan","type":"int","default":6,"min":0,"max":60},{"name":"backups_check","label":"Comprobar el repositorio después de cada copia","type":"bool","default":true},{"name":"backups_run_now","label":"Hacer la primera copia al aplicar","type":"bool","default":true},{"name":"backups_dir","label":"Carpeta de las copias en el servidor","help":"Dentro se crea una carpeta por proyecto.","type":"string","default":"/srv/draupnode/copias","pattern":"^/[A-Za-z0-9._/-]+$","patternHelp":"Ruta absoluta"},{"name":"backups_remote_type","label":"Copia también fuera del servidor","help":"«sftp» = otro servidor tuyo; «rest-server» = el servidor de copias de restic; «s3» = S3 compatible (MinIO, Garage…).","type":"select","default":"no","options":["no","sftp","rest-server","s3"]},{"name":"backups_remote","label":"Destino remoto","help":"sftp: usuario@203.0.113.40:/srv/copias/web · rest-server: https://copias.ejemplo.com:8000/web · s3: https://minio.ejemplo.com/cubo/web","type":"string","default":"","pattern":"^[^\\s]+$","patternHelp":"Sin espacios"},{"name":"backups_remote_port","label":"Puerto SSH del destino (sftp)","type":"int","default":22,"min":1,"max":65535},{"name":"backups_remote_user","label":"Usuario del destino (rest-server) o Access Key (s3)","type":"string","default":""},{"name":"backups_remote_password","label":"Contraseña del destino (rest-server) o Secret Key (s3)","help":"Se guarda cifrada en tu bóveda y solo viaja al servidor al aplicar.","type":"secret","default":null},{"name":"backups_remote_cacert","label":"Certificado del destino (rest-server)","help":"Lo rellena Draupnode cuando el destino es otro servidor tuyo con el módulo «Destino de copias» (certificado propio, en base64). Vacío = certificado normal (Let's Encrypt…).","type":"string","default":"","pattern":"^[A-Za-z0-9+/=]*$","patternHelp":"Lo rellena Draupnode"},{"name":"backups_remote_append_only","label":"El destino solo deja añadir","help":"Las copias viejas del destino no se borran desde aquí (el destino no lo permite). Las de este servidor sí.","type":"bool","default":false}],"links":[{"label":"restic","url":"https://restic.net"},{"label":"Documentación","url":"https://restic.readthedocs.io"},{"label":"Código fuente","url":"https://github.com/restic/restic"}],"after":["docker","postgres","coolify"],"secrets":[{"file":"restic","label":"Contraseña de las copias (restic)"},{"file":"backups_sftp_key.pub","label":"Clave pública para el servidor de copias (SFTP)"}],"uninstallable":true,"uninstallWarning":"Quita la copia diaria (temporizador y script). Las copias ya hechas se conservan.","uninstallData":"Borrar también el repositorio local de copias y su contraseña. Las copias del destino remoto no se tocan.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/copia.service.j2","templates/copia.sh.j2","templates/copia.timer.j2"]},
  {"id":"backup-target","name":"Destino de copias (rest-server)","version":"1.0.0","category":"5 · Copias","description":"Convierte este servidor en el sitio donde OTROS servidores guardan sus copias. Solo deja añadir copias, nunca borrarlas, así que un intruso en el otro servidor no puede destruirlas.","details":"Usa rest-server (de los autores de restic, BSD-2) en Docker, con HTTPS y\nen modo «solo añadir» (--append-only): los servidores de origen pueden\nsubir copias nuevas pero no borrar ni cambiar las que ya hay. Cada proyecto\nde origen tiene su usuario y su carpeta y no ve las de los demás\n(--private-repos). Las copias llegan cifradas: este servidor no puede\nleerlas.\nLo normal es no tocar esto a mano: en la página del módulo «Copias» de\notro proyecto, «Guardar también en otro servidor…» crea este proyecto y\ndeja las dos partes configuradas (usuario, contraseña y certificado).\nRotación: con «Borrar las copias viejas» activado, ESTE servidor borra\ncada día las que pasan de los días indicados (y guarda una al mes si lo\npides). Para eso necesita la contraseña de las copias de cada proyecto:\nDraupnode se la da al aplicar (cuando ya la tiene, es decir, después de\naplicar el proyecto de origen). Así este servidor podría leer las copias;\nsi no quieres eso, desactívalo y aquí no se borrará nunca nada (vigila el\ndisco).\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minDiskGb":10},"variables":[{"name":"backup_target_port","label":"Puerto HTTPS","help":"Por él se conectan los servidores de origen. Se abre en el Cortafuegos.","type":"int","default":8000,"min":1024,"max":65535},{"name":"backup_target_dir","label":"Carpeta de las copias","help":"Dentro, una carpeta por proyecto de origen.","type":"string","default":"/srv/draupnode/destino-copias","pattern":"^/[A-Za-z0-9._/-]+$","patternHelp":"Ruta absoluta"},{"name":"backup_target_container","label":"Nombre del contenedor","type":"string","default":"dn-destino-copias","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"backup_target_clients","label":"Proyectos que guardan aquí","help":"Los rellena Draupnode («proyecto:huella de su contraseña»). Quitar una línea le quita el acceso; sus copias se quedan.","type":"list","default":[],"pattern":"^[a-z0-9][a-z0-9-]{0,62}:\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$","patternHelp":"Lo rellena Draupnode"},{"name":"backup_target_tls_cert","label":"Certificado HTTPS","help":"Lo genera Draupnode (en base64). Los servidores de origen lo usan para comprobar que hablan con este y no con otro.","type":"string","default":"","pattern":"^[A-Za-z0-9+/=]*$","patternHelp":"Lo rellena Draupnode"},{"name":"backup_target_tls_key","label":"Clave privada HTTPS","help":"La genera Draupnode y se guarda cifrada en tu bóveda.","type":"secret","default":null,"required":true},{"name":"backup_target_prune","label":"Borrar las copias viejas (rotación)","help":"Este servidor borra cada día las copias que pasan de los días de abajo. Necesita la contraseña de las copias (Draupnode se la da al aplicar).","type":"bool","default":true},{"name":"backup_target_keep_days","label":"Conservar las copias de los últimos (días)","type":"int","default":30,"min":1,"max":3650},{"name":"backup_target_keep_monthly","label":"Y además una copia al mes durante (meses)","help":"0 = ninguna más.","type":"int","default":12,"min":0,"max":240},{"name":"backup_target_prune_time","label":"Hora de la rotación","help":"Mejor lejos de la hora de las copias (mientras rota, el origen espera para copiar).","type":"string","default":"05:30","pattern":"^([01][0-9]|2[0-3]):[0-5][0-9]$","patternHelp":"Formato HH:MM"},{"name":"backup_target_keys","label":"Contraseñas de las copias (las pone Draupnode)","type":"secret","default":null,"managed":true}],"firewallPortsFrom":["backup_target_port"],"links":[{"label":"rest-server (código fuente)","url":"https://github.com/restic/rest-server"},{"label":"restic","url":"https://restic.net"}],"checks":[{"containerFree":"backup_target_container"}],"uninstallable":true,"uninstallWarning":"Para el rest-server y la rotación. Los otros servidores dejan de poder guardar aquí sus copias (fallará su copia remota hasta que elijas otro destino).","uninstallData":"Borrar también TODAS las copias guardadas aquí. Si el servidor de origen se pierde, ya no habrá de dónde restaurar.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"alerts","name":"Alertas al móvil","version":"1.0.0","category":"6 · Monitorización","description":"Te avisa al móvil cuando algo va mal (disco casi lleno, una copia que ha fallado, un contenedor caído, otro servidor que no responde) y cuando se arregla.","details":"Un pequeño script del servidor (systemd, cada pocos minutos) comprueba lo\nque marques y manda el aviso por ntfy (código abierto: la app ntfy del\nmóvil, con ntfy.sh o tu propio servidor ntfy) o por Telegram.\nAvisa una vez cuando empieza un problema, lo recuerda cada pocas horas si\nsigue, y avisa cuando se arregla.\nCon ntfy, si dejas el tema vacío se genera uno largo y secreto (quien sepa\nel nombre puede leer los avisos). En la página de este módulo tienes el QR\npara suscribirte desde la app y un botón para mandar un aviso de prueba.\nUn servidor no puede avisar de que él mismo se ha caído: para eso, pon su\ndirección en «Vigilar otros servidores» de las alertas de OTRO servidor, o\nmarca el «Aviso diario»: si un día no llega, algo pasa.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"alerts_channel","label":"Por dónde avisar","help":"«ntfy» = app ntfy del móvil (código abierto). «telegram» = un bot de Telegram.","type":"select","default":"ntfy","options":["ntfy","telegram"]},{"name":"alerts_ntfy_server","label":"Servidor ntfy","help":"El público (https://ntfy.sh) o el tuyo.","type":"string","default":"https://ntfy.sh","pattern":"^https?://[A-Za-z0-9.:-]+(/[A-Za-z0-9._/-]*)?$","patternHelp":"Una dirección http(s)://"},{"name":"alerts_ntfy_topic","label":"Tema de ntfy","help":"Vacío = se genera uno secreto en el servidor (recomendado).","type":"string","default":"","pattern":"^[A-Za-z0-9_-]{0,64}$","patternHelp":"Letras, números, - y _"},{"name":"alerts_ntfy_token","label":"Token de ntfy","help":"Solo si tu servidor ntfy pide usuario (token de acceso «tk_…»).","type":"secret","default":null},{"name":"alerts_telegram_token","label":"Token del bot de Telegram","help":"El que te da @BotFather al crear el bot.","type":"secret","default":null},{"name":"alerts_telegram_chat","label":"Chat de Telegram","help":"Tu número de chat (escríbele al bot y míralo con @userinfobot).","type":"string","default":"","pattern":"^-?[0-9]{0,20}$","patternHelp":"Un número"},{"name":"alerts_disk_percent","label":"Avisar si un disco pasa del (%)","help":"0 = no avisar.","type":"int","default":90,"min":0,"max":99},{"name":"alerts_ram_percent","label":"Avisar si la memoria pasa del (%)","help":"Durante dos comprobaciones seguidas. 0 = no avisar.","type":"int","default":95,"min":0,"max":99},{"name":"alerts_backups","label":"Avisar si falla una copia de seguridad","help":"O si la última buena tiene más de 36 horas.","type":"bool","default":true},{"name":"alerts_containers","label":"Avisar si un contenedor se cae","help":"Parado con error, reiniciándose sin parar o «unhealthy».","type":"bool","default":true},{"name":"alerts_services","label":"Avisar si falla un servicio del sistema","help":"Cualquier servicio de systemd en estado «failed».","type":"bool","default":true},{"name":"alerts_watch","label":"Vigilar otros servidores","help":"Uno por línea: dirección:puerto (p. ej. 203.0.113.40:22). Avisa si deja de responder.","type":"list","default":[],"pattern":"^[A-Za-z0-9.-]+:[0-9]{1,5}$","patternHelp":"dirección:puerto"},{"name":"alerts_daily","label":"Aviso diario de que todo va bien","help":"A las 9:00. Si un día no llega, el servidor puede estar caído.","type":"bool","default":false},{"name":"alerts_interval_min","label":"Comprobar cada (minutos)","type":"int","default":5,"min":1,"max":60},{"name":"alerts_repeat_hours","label":"Recordar un problema que sigue cada (horas)","help":"0 = no recordar.","type":"int","default":6,"min":0,"max":168}],"links":[{"label":"ntfy","url":"https://ntfy.sh"},{"label":"Código de ntfy","url":"https://github.com/binwiederhier/ntfy"},{"label":"Bots de Telegram","url":"https://core.telegram.org/bots"}],"after":["backups","docker","monitoring"],"secrets":[{"file":"alerts_ntfy_topic","label":"Tema de ntfy (para suscribirte)"}],"uninstallable":true,"uninstallWarning":"Quita el script y el temporizador de las alertas. Dejarás de recibir avisos de este servidor.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/alertas.py.j2"]},
  {"id":"cockpit","name":"Cockpit (panel del servidor)","version":"1.0.0","category":"6 · Monitorización","description":"Un panel web para ver y manejar el servidor: CPU, memoria, discos, servicios, registros, actualizaciones y una terminal en el navegador.","details":"Cockpit (LGPL-2.1) del sistema. No se publica en internet: solo escucha\nen 127.0.0.1 (y en la VPN si está WireGuard). Se abre con «Abrir» en la\npágina de este módulo (túnel SSH), por la VPN o con dominio (Caddy o nginx\nen el proyecto).\nPara entrar, Draupnode crea un usuario propio con una contraseña generada\nen el servidor (en «Contraseñas del proyecto»); si marcas «Puede\nadministrar», ese usuario tiene sudo.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"cockpit_port","label":"Puerto (solo local)","type":"int","default":9090,"min":1024,"max":65535},{"name":"cockpit_user","label":"Usuario del panel","type":"string","default":"panel","pattern":"^[a-z][a-z0-9_-]{2,30}$","patternHelp":"Minúsculas, números, - y _"},{"name":"cockpit_admin","label":"Puede administrar (sudo)","help":"Sin esto, solo puede mirar.","type":"bool","default":true},{"name":"cockpit_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el proyecto, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio o vacío"}],"proxySite":{"domain":"cockpit_domain","port":"cockpit_port"},"links":[{"label":"Web oficial","url":"https://cockpit-project.org"},{"label":"Código fuente","url":"https://github.com/cockpit-project/cockpit"}],"after":["wireguard"],"secrets":[{"file":"cockpit_usuario","label":"Usuario para entrar en Cockpit"}],"uninstallable":true,"uninstallWarning":"Desinstala Cockpit. El usuario del panel se queda (puedes borrarlo con «borrar datos»).","uninstallData":"Borrar también el usuario del panel y su carpeta.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"monitoring","name":"Monitorización (métricas)","version":"1.0.0","category":"6 · Monitorización","description":"Prometheus y Grafana con paneles listos para la CPU, la RAM y el disco del servidor, cada contenedor y PostgreSQL. Grafana se abre desde Draupnode por un túnel SSH.","details":"Todo en Docker y de código abierto: Prometheus, node-exporter (el servidor),\ncAdvisor (cada contenedor), postgres-exporter (si hay PostgreSQL de este\nproyecto) y Grafana OSS con los paneles «Recursos» y «PostgreSQL».\nGrafana y Prometheus solo escuchan en el propio servidor (127.0.0.1): no se\nabren a internet ni en el Cortafuegos. Draupnode los abre por la misma\nconexión SSH («Abrir Grafana» en la página del módulo). El usuario es admin;\nla contraseña se genera en el servidor y la tienes en sus contraseñas.\nOcupa unos 400-600 MB de RAM.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":1500,"minDiskGb":5},"variables":[{"name":"monitoring_retention_days","label":"Días de métricas que se guardan","type":"int","default":30,"min":1,"max":365},{"name":"monitoring_cadvisor","label":"Métricas de cada contenedor (cAdvisor)","help":"CPU y RAM por contenedor. Necesita el almacenamiento clásico de Docker (opción del módulo Docker).","type":"bool","default":true},{"name":"monitoring_postgres","label":"Métricas de PostgreSQL","help":"Solo si PostgreSQL es de este mismo proyecto (usa su contraseña de superusuario).","type":"bool","default":true},{"name":"monitoring_postgres_container","label":"Contenedor de PostgreSQL","type":"string","default":"pg-compartido","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"monitoring_postgres_network","label":"Red Docker de PostgreSQL","type":"string","default":"apps","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"monitoring_grafana_port","label":"Puerto de Grafana en el servidor","help":"Solo local (127.0.0.1); Draupnode llega a él por SSH.","type":"int","default":3000,"min":1024,"max":65535},{"name":"monitoring_prometheus_port","label":"Puerto de Prometheus en el servidor","help":"Solo local. Draupnode lo usa para el resumen de la página del módulo.","type":"int","default":19090,"min":1024,"max":65535}],"links":[{"label":"Prometheus","url":"https://prometheus.io"},{"label":"Grafana","url":"https://grafana.com/oss/grafana/"},{"label":"Código de Grafana","url":"https://github.com/grafana/grafana"},{"label":"node_exporter","url":"https://github.com/prometheus/node_exporter"},{"label":"cAdvisor","url":"https://github.com/google/cadvisor"}],"after":["postgres"],"secrets":[{"file":"grafana_admin","label":"Acceso a Grafana"}],"uninstallable":true,"uninstallWarning":"Para y quita Prometheus, Grafana y los exportadores. Si están los Registros (Loki), desinstálalos antes.","uninstallData":"Borrar también las métricas guardadas y la configuración de Grafana (paneles que hayas cambiado, usuarios).","source":"builtin","files":["files/dashboards/postgres.json","files/dashboards/recursos.json","files/dashboards.yml","files/datasource-prometheus.yml","tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2","templates/prometheus.yml.j2"]},
  {"id":"logs","name":"Registros (Loki)","version":"1.0.0","category":"6 · Monitorización","description":"Guarda y busca en Grafana los registros de todos los contenedores y del sistema (SSH, sudo, servicios). Loki + Grafana Alloy.","details":"Loki guarda los registros y Grafana Alloy los recoge: la salida de cada\ncontenedor Docker y el diario del sistema (journald). Se buscan en Grafana,\nen el panel «Registros de los contenedores». Todo de código abierto.\nNecesita la Monitorización (usa su Grafana). Ocupa unos 300-500 MB de RAM;\npor eso va aparte.\n","depends":["monitoring"],"requires":{"os":["ubuntu","debian"],"minRamMb":2000,"minDiskGb":5},"variables":[{"name":"logs_retention_days","label":"Días de registros que se guardan","type":"int","default":14,"min":1,"max":180},{"name":"logs_journal","label":"Registros del sistema (journald)","help":"SSH, sudo, servicios, copias de seguridad… además de los contenedores.","type":"bool","default":true}],"links":[{"label":"Loki","url":"https://grafana.com/oss/loki/"},{"label":"Código de Loki","url":"https://github.com/grafana/loki"},{"label":"Grafana Alloy","url":"https://github.com/grafana/alloy"}],"uninstallable":true,"uninstallWarning":"Para y quita Loki y Alloy, y el panel de registros de Grafana.","uninstallData":"Borrar también los registros guardados.","source":"builtin","files":["files/datasource-loki.yml","files/registros.json","tasks/main.yml","tasks/uninstall.yml","templates/config.alloy.j2","templates/docker-compose.yml.j2","templates/loki.yml.j2"]},
  {"id":"adguard","name":"AdGuard Home (sin anuncios en la VPN)","version":"1.0.0","category":"7 · Apps","description":"Bloquea anuncios, rastreadores y webs peligrosas en todos tus dispositivos conectados a la VPN, sin instalar nada en ellos.","details":"AdGuard Home (GPL-3) en Docker. Su DNS solo escucha en la VPN (la .1 de\nWireGuard), nunca en internet: un DNS abierto se usa para atacar a otros.\nDraupnode pone su dirección como DNS de los dispositivos de la VPN (hay\nque volver a escanear el QR o importar su .conf).\nSu panel solo se ve desde el servidor: «Abrir» en la página del módulo\n(túnel SSH), por la VPN o con dominio. Usuario y contraseña generados en\nel servidor (en «Contraseñas del proyecto»).\nLas consultas salen cifradas (DNS sobre HTTPS) a Quad9 y Cloudflare;\npuedes cambiarlo en su panel.\n","depends":["docker","wireguard"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"adguard_port","label":"Puerto del panel (solo local)","type":"int","default":3080,"min":1024,"max":65535},{"name":"adguard_domain","label":"Dominio del panel","help":"Opcional. Con Caddy o nginx en el proyecto, el panel se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio o vacío"},{"name":"adguard_update","label":"Actualizar AdGuard Home al aplicar","type":"bool","default":true}],"proxySite":{"domain":"adguard_domain","port":"adguard_port"},"links":[{"label":"Web oficial","url":"https://adguard.com/adguard-home/overview.html"},{"label":"Código fuente","url":"https://github.com/AdguardTeam/AdGuardHome"}],"secrets":[{"file":"adguard_usuario","label":"Usuario del panel de AdGuard Home"}],"uninstallable":true,"uninstallWarning":"Para AdGuard Home. Los dispositivos de la VPN se quedan sin DNS hasta que quites el DNS de WireGuard y vuelvas a aplicar.","uninstallData":"Borrar también su configuración y estadísticas.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"forgejo","name":"Forgejo (tu GitHub)","version":"1.0.0","category":"7 · Apps","description":"Tu propio GitHub: repositorios Git, incidencias, revisiones de código y paquetes, en tu servidor.","details":"Forgejo 15 en Docker, con su base SQLite (sin servidor de base de\ndatos aparte). Draupnode crea el usuario «administrador» con una contraseña\ngenerada en el servidor (en «Contraseñas del proyecto»).\nGit por SSH en el puerto indicado (se abre en el Cortafuegos):\ngit clone ssh://git@servidor:PUERTO/usuario/repo.git\nEl registro de usuarios nuevos está cerrado salvo que lo abras.\nSus datos están en /srv/draupnode/apps/forgejo (entran en las copias del\nmódulo Copias). Licencia: GPL-3.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":700},"variables":[{"name":"forgejo_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":3000,"min":1024,"max":65535},{"name":"forgejo_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el proyecto, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"forgejo_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"forgejo_ssh_port","label":"Puerto SSH de Git","help":"Para clonar y subir por SSH. No puede ser el del SSH del servidor.","type":"int","default":2222,"min":1024,"max":65535},{"name":"forgejo_registration","label":"Permitir registrarse","help":"Si no, solo el administrador crea usuarios.","type":"bool","default":false},{"name":"forgejo_update","label":"Actualizar Forgejo al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["forgejo_public_port","forgejo_ssh_port"],"proxySite":{"domain":"forgejo_domain","port":"forgejo_port"},"links":[{"label":"Web oficial","url":"https://forgejo.org"},{"label":"Código fuente","url":"https://codeberg.org/forgejo/forgejo"}],"secrets":[{"file":"forgejo_admin","label":"Administrador de Forgejo"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Forgejo.","uninstallData":"Borrar también sus datos (todos los repositorios, usuarios e incidencias). No se puede deshacer.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"immich","name":"Immich (fotos y vídeos)","version":"1.0.0","category":"7 · Apps","description":"Tu propio Google Fotos: copia automática de las fotos del móvil, álbumes, búsqueda por lo que sale en la foto y por caras.","details":"Immich (versión 3) en Docker, como su compose oficial: servidor,\naprendizaje automático (búsqueda y caras), Valkey y su PostgreSQL con\nvectores. Es pesado: pide 4 GB de RAM y la primera vez descarga unos\n3 GB. El primer usuario que entra se queda de administrador: entra\nenseguida después de aplicar.\nEn el móvil, la app de Immich con la dirección del servidor (mejor con\ndominio y HTTPS, o por la VPN).\nLas fotos están en /srv/draupnode/apps/immich/library (entran en las\ncopias: pueden ocupar mucho).\nSus datos están en /srv/draupnode/apps/immich (entran en las copias del\nmódulo Copias). Licencia: AGPL-3.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":4000},"variables":[{"name":"immich_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":2283,"min":1024,"max":65535},{"name":"immich_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el proyecto, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"immich_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"immich_update","label":"Actualizar Immich al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["immich_public_port"],"proxySite":{"domain":"immich_domain","port":"immich_port"},"links":[{"label":"Web oficial","url":"https://immich.app"},{"label":"Código fuente","url":"https://github.com/immich-app/immich"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Immich.","uninstallData":"Borrar también sus datos (todas las fotos y vídeos subidos y su base de datos). No se puede deshacer.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"jellyfin","name":"Jellyfin (películas y series)","version":"1.0.0","category":"7 · Apps","description":"Tu propio Netflix: películas, series y fotos desde el navegador, la tele o el móvil.","details":"Jellyfin en Docker. Lee tus vídeos de la carpeta indicada (solo\nlectura). La primera vez, entra y sigue el asistente (crea el\nadministrador y añade la biblioteca «/media»).\nConvertir vídeo en directo gasta mucha CPU: mejor clientes que lo\nreproduzcan tal cual (la app de Jellyfin, Kodi…).\nSus datos están en /srv/draupnode/apps/jellyfin (entran en las copias del\nmódulo Copias). Licencia: GPL-2.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":1500},"variables":[{"name":"jellyfin_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":8096,"min":1024,"max":65535},{"name":"jellyfin_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el proyecto, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"jellyfin_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"jellyfin_media","label":"Carpeta de los vídeos","type":"string","default":"/srv/media","pattern":"^/[A-Za-z0-9._/ -]+$","patternHelp":"Ruta absoluta"},{"name":"jellyfin_update","label":"Actualizar Jellyfin al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["jellyfin_public_port"],"proxySite":{"domain":"jellyfin_domain","port":"jellyfin_port"},"links":[{"label":"Web oficial","url":"https://jellyfin.org"},{"label":"Código fuente","url":"https://github.com/jellyfin/jellyfin"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Jellyfin.","uninstallData":"Borrar también sus datos (la configuración y la caché de Jellyfin (tus vídeos no se tocan)). No se puede deshacer.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"navidrome","name":"Navidrome (música)","version":"1.0.0","category":"7 · Apps","description":"Tu propio Spotify: escucha tu colección de música desde el navegador o el móvil (apps compatibles con Subsonic).","details":"Navidrome en Docker. Lee la música de la carpeta indicada (solo\nlectura) y la vuelve a mirar sola cada hora. El primer usuario que\nentra se queda de administrador: entra enseguida después de aplicar.\nApps de móvil compatibles (Subsonic): Symfonium, Tempo, Substreamer, play:Sub…\nSus datos están en /srv/draupnode/apps/navidrome (entran en las copias del\nmódulo Copias). Licencia: GPL-3.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"navidrome_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":4533,"min":1024,"max":65535},{"name":"navidrome_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el proyecto, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"navidrome_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"navidrome_music","label":"Carpeta de la música","help":"Donde está tu música en el servidor (súbela con SFTP, Syncthing…).","type":"string","default":"/srv/musica","pattern":"^/[A-Za-z0-9._/ -]+$","patternHelp":"Ruta absoluta"},{"name":"navidrome_update","label":"Actualizar Navidrome al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["navidrome_public_port"],"proxySite":{"domain":"navidrome_domain","port":"navidrome_port"},"links":[{"label":"Web oficial","url":"https://www.navidrome.org"},{"label":"Código fuente","url":"https://github.com/navidrome/navidrome"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Navidrome.","uninstallData":"Borrar también sus datos (la base de datos de Navidrome (usuarios, listas, favoritos; tu música no se toca)). No se puede deshacer.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"paperless","name":"Paperless-ngx (documentos)","version":"1.0.0","category":"7 · Apps","description":"Escanea o sube tus papeles (facturas, contratos, recibos…) y encuéntralos al momento: lee el texto (OCR), los etiqueta y los archiva.","details":"Paperless-ngx en Docker, con su propio PostgreSQL y Redis. Draupnode\ncrea el usuario «admin» con una contraseña generada en el servidor (en\n«Contraseñas del proyecto»). Lo que dejes en la carpeta «consume» (por\nejemplo con Syncthing o desde el escáner) se importa solo.\nLa primera vez tarda unos minutos en arrancar.\nSus datos están en /srv/draupnode/apps/paperless (entran en las copias del\nmódulo Copias). Licencia: GPL-3.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":2000},"variables":[{"name":"paperless_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":8010,"min":1024,"max":65535},{"name":"paperless_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el proyecto, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"paperless_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"paperless_ocr_language","label":"Idioma de los documentos (OCR)","type":"select","default":"spa+eng","options":["spa","spa+eng","eng","cat","spa+cat"]},{"name":"paperless_update","label":"Actualizar Paperless-ngx al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["paperless_public_port"],"proxySite":{"domain":"paperless_domain","port":"paperless_port"},"links":[{"label":"Documentación","url":"https://docs.paperless-ngx.com"},{"label":"Código fuente","url":"https://github.com/paperless-ngx/paperless-ngx"}],"secrets":[{"file":"paperless_admin","label":"Usuario «admin» de Paperless-ngx"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Paperless-ngx.","uninstallData":"Borrar también sus datos (todos los documentos, su base de datos y sus etiquetas). No se puede deshacer.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"samba","name":"Samba (carpetas compartidas)","version":"1.0.0","category":"7 · Apps","description":"Carpetas del servidor como unidades de red en Windows, macOS o Linux (\\\\servidor\\carpeta). Solo por la VPN o la red local, nunca a internet.","details":"Samba (GPL-3) del sistema. Solo escucha en el propio servidor, en la VPN\n(wg0, si está WireGuard) y en las interfaces de red local que indiques\n(por ejemplo eth0 en una Raspberry de casa). No abre nada en el\nCortafuegos: compartir archivos por internet sin VPN es peligroso.\nCada línea de «Carpetas» es «nombre /ruta»; se entra con el usuario del\nmódulo y su contraseña generada en el servidor (en «Contraseñas del\nproyecto»). Desde la VPN: \\\\10.8.0.1\\nombre (Windows) o\nsmb://10.8.0.1/nombre (macOS/Linux).\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"samba_shares","label":"Carpetas","help":"Una por línea: «nombre /ruta» (p. ej. «documentos /srv/compartido/documentos»). Se crean si no existen.","type":"list","default":["compartido /srv/compartido"],"pattern":"^[A-Za-z0-9_-]{1,40} +/[A-Za-z0-9._/-]+$","patternHelp":"nombre /ruta"},{"name":"samba_user","label":"Usuario","type":"string","default":"compartir","pattern":"^[a-z][a-z0-9_-]{2,30}$","patternHelp":"Minúsculas, números, - y _"},{"name":"samba_interfaces","label":"Interfaces de red local","help":"Además de la VPN. Vacío = solo VPN. Ejemplo: eth0 (mira «ip a» en el servidor).","type":"list","default":[],"pattern":"^[a-z0-9.@-]{1,15}$","patternHelp":"Nombre de interfaz (eth0, enp3s0…)"}],"links":[{"label":"Web oficial","url":"https://www.samba.org"},{"label":"Código fuente","url":"https://gitlab.com/samba-team/samba"}],"after":["wireguard"],"secrets":[{"file":"samba_usuario","label":"Usuario de las carpetas compartidas"}],"uninstallable":true,"uninstallWarning":"Desinstala Samba. Las carpetas compartidas dejan de verse en red; su contenido no se toca.","uninstallData":"Borrar también el usuario de Samba (las carpetas y sus archivos NO se borran).","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/smb.conf.j2"]},
  {"id":"syncthing","name":"Syncthing (sincronizar carpetas)","version":"1.0.0","category":"7 · Apps","description":"Sincroniza carpetas entre tus equipos y el servidor, sin nube de nadie. Por ejemplo, para subir tu música o tus fotos.","details":"Syncthing en Docker. Su panel solo se ve desde el servidor («Abrir»\no la VPN): ponle usuario y contraseña la primera vez (Acciones →\nAjustes → GUI). Para sincronizar con tus equipos usa el puerto 22000\n(TCP y UDP), que se abre en el Cortafuegos; en la nube, ábrelo también\nen el cortafuegos del proveedor.\nLas carpetas sincronizadas quedan en /srv/draupnode/apps/syncthing/data.\nSus datos están en /srv/draupnode/apps/syncthing (entran en las copias del\nmódulo Copias). Licencia: MPL-2.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"syncthing_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":8384,"min":1024,"max":65535},{"name":"syncthing_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el proyecto, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"syncthing_update","label":"Actualizar Syncthing al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPorts":[22000],"proxySite":{"domain":"syncthing_domain","port":"syncthing_port"},"links":[{"label":"Web oficial","url":"https://syncthing.net"},{"label":"Código fuente","url":"https://github.com/syncthing/syncthing"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Syncthing.","uninstallData":"Borrar también sus datos (las carpetas sincronizadas en el servidor y la identidad de este Syncthing). No se puede deshacer.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"vaultwarden","name":"Vaultwarden (contraseñas)","version":"1.0.0","category":"7 · Apps","description":"Tu gestor de contraseñas, compatible con las apps y extensiones de Bitwarden. Tus contraseñas, en tu servidor.","details":"Vaultwarden (servidor libre compatible con Bitwarden) en Docker.\nNecesita HTTPS: ponle dominio (con Caddy o nginx en el proyecto) o entra\npor la VPN/«Abrir» (127.0.0.1 también vale como seguro).\nCrea tu cuenta y, cuando estéis todos, desactiva «Permitir registrarse»\ny vuelve a aplicar. El panel /admin usa el «Token de administración»\n(en «Contraseñas del proyecto»).\nSus datos están en /srv/draupnode/apps/vaultwarden (entran en las copias del\nmódulo Copias). Licencia: AGPL-3.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"vaultwarden_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":8222,"min":1024,"max":65535},{"name":"vaultwarden_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el proyecto, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"vaultwarden_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"vaultwarden_signups","label":"Permitir registrarse","help":"Déjalo activado para crear vuestras cuentas; luego desactívalo y aplica.","type":"bool","default":true},{"name":"vaultwarden_update","label":"Actualizar Vaultwarden al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["vaultwarden_public_port"],"proxySite":{"domain":"vaultwarden_domain","port":"vaultwarden_port"},"links":[{"label":"Código fuente y wiki","url":"https://github.com/dani-garcia/vaultwarden"},{"label":"Apps de Bitwarden","url":"https://bitwarden.com/download/"}],"secrets":[{"file":"vaultwarden_admin_token","label":"Token del panel /admin de Vaultwarden"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Vaultwarden.","uninstallData":"Borrar también sus datos (la bóveda cifrada de todos los usuarios). No se puede deshacer.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
]

export const api: Backend = isDesktop ? window.go!.main!.App! : mockBackend()

/** Los errores de Wails llegan como string; los normalizamos. */
export function errorText(e: unknown): string {
  const t = typeof e === 'string' ? e : e instanceof Error ? e.message : String(e)
  return t.replace(/^VAULT_(LOCKED|MISSING): /, '')
}

export function vaultCode(e: unknown): 'locked' | 'missing' | null {
  const t = typeof e === 'string' ? e : e instanceof Error ? e.message : ''
  if (t.startsWith('VAULT_LOCKED: ')) return 'locked'
  if (t.startsWith('VAULT_MISSING: ')) return 'missing'
  return null
}
