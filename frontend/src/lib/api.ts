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
  ListProjects(): Promise<Project[]>
  CheckProject(p: Project): Promise<ProjectCheck>
  SaveProject(p: Project): Promise<Project>
  DeleteProject(id: string): Promise<void>
  SetProjectCollapsed(id: string, modules: string[]): Promise<void>
  SetProjectSecret(projectId: string, variable: string, value: string): Promise<void>
  OpenGrafana(projectId: string, secret: string, accept: string): Promise<MonitorResult>
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
  ExportProject(id: string): Promise<string>
  RunProject(id: string, check: boolean, secret: string, accept: string, sudoPassword: string): Promise<RunStart>
  CancelRun(runId: string): Promise<boolean>
  RunLogs(projectId: string): Promise<string[]>
  ReadRunLog(projectId: string, name: string): Promise<string>
  LabStatus(): Promise<LabStatus>
  LabAction(action: string): Promise<void>
  LabRegister(): Promise<Server>
  OpenURL(url: string): Promise<void>
  ServerLive(id: string): Promise<ServerLive>
  DockerInfo(): Promise<DockerInfo>
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
      if (!p.name.trim()) throw 'el nombre del proyecto es obligatorio'
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
      return { ok: !bad && !notInst, error: bad ? `${bad.name} no se puede desinstalar: ${bad.noUninstall ?? 'no tiene desinstalación'}` : notInst ? 'no está instalado por este proyecto' : undefined,
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
        tgt = { id: 'p' + Date.now(), name: 'Destino de copias · ' + srv.name, serverId: tgtServerId, modules: [{ id: 'docker', values: {} }, { id: 'firewall', values: { firewall_tcp_ports: ['22', String(port)] } }, { id: 'backup-target', values: { backup_target_port: port } }] } as Project
        projects.push(tgt)
      }
      const slug = src.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const url = `https://${srv.host}:${port}/${slug}`
      const b = src.modules.find((m) => m.id === 'backups')
      if (b) Object.assign(b.values, { backups_remote_type: 'rest-server', backups_remote: url, backups_remote_user: slug, backups_remote_append_only: true })
      save('projects', projects)
      return { targetProjectId: tgt.id, targetProjectName: tgt.name, targetIsNew: isNew, url, notes: [`Aplica primero «${tgt.name}» (en ${srv.name}) y después este proyecto.`] }
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

const MOCK_MODULES: Module[] = [
  { id: 'base', name: 'Sistema base', version: '1.0.0', category: '1 · Sistema', noUninstall: "son los paquetes y ajustes básicos del sistema (zona horaria, swap, actualizaciones de seguridad); otros programas los usan y quitarlos podría romperlos.", source: 'builtin', depends: [], requires: { os: ['ubuntu', 'debian'] },
    description: 'Paquetes básicos, zona horaria, memoria de intercambio (swap) y actualizaciones de seguridad automáticas.',
    files: ['tasks/main.yml'],
    variables: [
      { name: 'base_packages', label: 'Paquetes a instalar', type: 'list', default: ['curl', 'ca-certificates', 'gnupg', 'jq', 'openssl', 'python3', 'logrotate', 'htop', 'unzip'], pattern: '^[a-z0-9][a-z0-9.+-]*$', patternHelp: 'Nombre de paquete apt' },
      { name: 'base_timezone', label: 'Zona horaria', type: 'string', default: 'Europe/Madrid' },
      { name: 'base_swap_mb', label: 'Swap (MB)', help: 'Memoria de intercambio en /swapfile. 0 = no crear.', type: 'int', default: 2048, min: 0, max: 65536 },
      { name: 'base_auto_updates', label: 'Actualizaciones de seguridad automáticas', type: 'bool', default: true },
    ] },
  { id: 'firewall', name: 'Cortafuegos (iptables)', version: '1.0.0', category: '1 · Sistema', uninstallable: true, uninstallWarning: "Quita las reglas que abrió Draupnode en iptables (salvo el SSH, para no perder la conexión). Las demás reglas del servidor no se tocan.", source: 'builtin', depends: ['base'], requires: { os: ['ubuntu', 'debian'] },
    description: 'Abre en el cortafuegos del servidor los puertos TCP indicados y guarda las reglas para que sobrevivan a un reinicio.',
    files: ['tasks/main.yml', 'handlers/main.yml'],
    variables: [{ name: 'firewall_tcp_ports', label: 'Puertos TCP abiertos', help: 'El 22 (SSH) se abre siempre.', type: 'list', default: ['22', '80', '443'], pattern: '^[0-9]{1,5}$', patternHelp: 'Número de puerto entre 1 y 65535' }] },
  { id: 'docker', name: 'Docker', version: '1.0.0', category: '2 · Contenedores', uninstallable: true, uninstallWarning: "Para y desinstala Docker. Se paran TODOS los contenedores del servidor, también los que no instaló Draupnode.", uninstallData: "Borrar también /var/lib/docker y /var/lib/containerd (imágenes, contenedores y volúmenes de TODAS las apps). Sin esto, si reinstalas Docker vuelve a estar todo.", source: 'builtin', depends: ['base'], requires: { os: ['ubuntu', 'debian'], minRamMb: 900, minDiskGb: 10 },
    description: 'Instala Docker Engine con el script oficial, lo deja arrancado y da permisos a tu usuario.',
    files: ['tasks/main.yml', 'handlers/main.yml'],
    variables: [
      { name: 'docker_classic_storage', label: 'Almacenamiento clásico overlay2', help: 'Necesario para ver CPU/RAM por contenedor en la monitorización.', type: 'bool', default: true },
      { name: 'docker_users', label: 'Otros usuarios en el grupo docker', type: 'list', default: [] },
    ] },
  { id: 'coolify', name: 'Coolify', version: '1.0.0', category: '3 · Plataformas', uninstallable: true, uninstallWarning: "Para y quita los contenedores de Coolify (panel, base de datos, proxy). Las apps que desplegaste con Coolify dejan de verse por su dominio, porque su proxy se quita; sus contenedores no se borran.", uninstallData: "Borrar también /data/coolify y sus volúmenes (la configuración del panel, usuarios, claves SSH y copias). Sin esto, si reinstalas Coolify vuelve todo como estaba.", source: 'builtin', depends: ['docker', 'firewall'], requires: { os: ['ubuntu', 'debian'], minRamMb: 1800, minDiskGb: 30 },
    description: "Panel para desplegar tus apps desde GitHub/GitLab con dominio y HTTPS automáticos (proxy Traefik + Let's Encrypt).",
    files: ['tasks/main.yml'],
    firewallPorts: [8000, 6001, 6002], secrets: [{ file: 'coolify_admin', label: 'Administrador de Coolify' }], variables: [
      { name: 'coolify_admin_email', label: 'Correo del administrador', help: 'Vacío = el primero que entre al panel crea el administrador.', type: 'string', default: '', placeholder: 'tu@ejemplo.com', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', patternHelp: 'Un correo válido (nombre@dominio.ext)' },
      { name: 'coolify_admin_user', label: 'Nombre del administrador', type: 'string', default: 'admin', pattern: '^[A-Za-z0-9._-]{3,40}$', patternHelp: '3 a 40 letras, números, . _ o -' },
      { name: 'coolify_autoupdate', label: 'Actualizaciones automáticas', help: 'Coolify se actualiza solo a cada versión nueva. Desactívalo si prefieres actualizar tú desde el panel.', type: 'bool', default: true },
    ] },
  { id: 'ssh', name: 'SSH seguro + fail2ban', version: '1.0.0', category: '1 · Sistema', uninstallable: true, uninstallWarning: "Quita el endurecimiento y fail2ban. El SSH NO se desinstala (es por donde se conecta Draupnode) - vuelve a su configuración de antes; si el servidor la traía así, puede volver a aceptar contraseñas.", source: 'builtin', depends: ['base'], after: ['firewall'], firewallPortsFrom: ['ssh_port'], requires: { os: ['ubuntu', 'debian'] },
    description: 'Cierra el SSH a lo imprescindible (sin root, sin contraseñas, pocos intentos) y bloquea con fail2ban a quien pruebe contraseñas.',
    files: ['tasks/main.yml', 'handlers/main.yml', 'templates/01-draupnode.conf.j2', 'templates/jail-draupnode.local.j2'],
    variables: [
      { name: 'ssh_port', label: 'Puerto SSH', help: '22 es el habitual. Cambiarlo reduce el ruido de los robots, no es seguridad de verdad.', type: 'int', default: 22, min: 1, max: 65535 },
      { name: 'ssh_password_auth', label: 'Permitir entrar con contraseña', help: 'Desmarcado = solo con clave SSH (lo recomendado).', type: 'bool', default: false },
      { name: 'ssh_root_login', label: 'Entrar como root', help: '«no» = nadie entra como root (se usa sudo). «solo-con-clave» = root sí, pero nunca con contraseña.', type: 'select', options: ['no', 'solo-con-clave'], default: 'no' },
      { name: 'ssh_allow_users', label: 'Solo pueden entrar estos usuarios', help: 'Uno por línea. Vacío = cualquier usuario con clave.', type: 'list', default: [] },
      { name: 'ssh_max_auth_tries', label: 'Intentos por conexión', type: 'int', default: 4, min: 2, max: 10 },
      { name: 'ssh_fail2ban', label: 'Instalar fail2ban', type: 'bool', default: true },
      { name: 'ssh_fail2ban_maxretry', label: 'Fallos antes de bloquear', type: 'int', default: 5, min: 2, max: 20 },
      { name: 'ssh_fail2ban_bantime', label: 'Tiempo de bloqueo', help: 'Quien reincide se bloquea una semana (cárcel «recidive»).', type: 'select', options: ['10m', '1h', '1d', '1w'], default: '1h' },
      { name: 'ssh_fail2ban_ignore', label: 'IPs que nunca se bloquean', help: 'Además de la tuya, que se añade sola. Una por línea (IP o red, p. ej. 203.0.113.0/24).', type: 'list', default: [] },
    ] },
  {"id": "backups", "name": "Copias de seguridad (restic)", "version": "1.0.0", "category": "5 · Copias", "description": "Copia diaria cifrada con restic de tus bases de datos, Coolify, la carpeta de secretos y las carpetas que elijas. Opcional, una segunda copia fuera del servidor.", "uninstallable": true, "uninstallWarning": "Quita la copia diaria (temporizador y script). Las copias ya hechas se conservan.", "uninstallData": "Borrar también el repositorio local de copias y su contraseña. Las copias del destino remoto no se tocan.", "source": "builtin", "depends": ["base"], "after": ["docker", "postgres", "coolify"], "requires": {"os": ["ubuntu", "debian"], "minDiskGb": 5}, "secrets": [{"file": "restic", "label": "Contraseña de las copias (restic)"}, {"file": "backups_sftp_key.pub", "label": "Clave pública para el servidor de copias (SFTP)"}], "files": ["tasks/main.yml", "tasks/uninstall.yml", "templates/copia.sh.j2", "templates/copia.service.j2", "templates/copia.timer.j2"], "variables": [{"name": "backups_time", "label": "Hora de la copia diaria", "type": "string", "default": "03:30", "help": "Hora del servidor (HH:MM). Se retrasa hasta 10 minutos al azar.", "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$", "patternHelp": "Formato HH:MM (p. ej. 03:30)"}, {"name": "backups_paths", "label": "Carpetas que copiar", "type": "list", "default": [], "help": "Una por línea. La carpeta de secretos del proyecto se copia siempre.", "pattern": "^/[A-Za-z0-9._/-]+$", "patternHelp": "Ruta absoluta (empieza por /)"}, {"name": "backups_postgres", "label": "Volcar PostgreSQL", "type": "bool", "default": true, "help": "Todas las bases del contenedor indicado (pg_dumpall), si existe."}, {"name": "backups_postgres_container", "label": "Contenedor de PostgreSQL", "type": "string", "default": "pg-compartido", "pattern": "^[a-z][a-z0-9_-]{1,40}$", "patternHelp": "Minúsculas, números, - y _"}, {"name": "backups_coolify", "label": "Copiar Coolify", "type": "bool", "default": true, "help": "Su base de datos, su .env y sus claves SSH, si Coolify está instalado."}, {"name": "backups_keep_daily", "label": "Copias diarias que se conservan", "type": "int", "default": 7, "min": 1, "max": 90}, {"name": "backups_keep_weekly", "label": "Copias semanales que se conservan", "type": "int", "default": 4, "min": 0, "max": 52}, {"name": "backups_keep_monthly", "label": "Copias mensuales que se conservan", "type": "int", "default": 6, "min": 0, "max": 60}, {"name": "backups_check", "label": "Comprobar el repositorio después de cada copia", "type": "bool", "default": true}, {"name": "backups_run_now", "label": "Hacer la primera copia al aplicar", "type": "bool", "default": true}, {"name": "backups_dir", "label": "Carpeta de las copias en el servidor", "type": "string", "default": "/srv/draupnode/copias", "help": "Dentro se crea una carpeta por proyecto.", "pattern": "^/[A-Za-z0-9._/-]+$", "patternHelp": "Ruta absoluta"}, {"name": "backups_remote_type", "label": "Copia también fuera del servidor", "type": "select", "default": "no", "help": "«sftp» = otro servidor tuyo; «rest-server» = el servidor de copias de restic; «s3» = S3 compatible (MinIO, Garage…).", "options": ["no", "sftp", "rest-server", "s3"]}, {"name": "backups_remote", "label": "Destino remoto", "type": "string", "default": "", "help": "sftp: usuario@203.0.113.40:/srv/copias/web · rest-server: https://copias.ejemplo.com:8000/web · s3: https://minio.ejemplo.com/cubo/web", "pattern": "^[^\\s]+$", "patternHelp": "Sin espacios"}, {"name": "backups_remote_port", "label": "Puerto SSH del destino (sftp)", "type": "int", "default": 22, "min": 1, "max": 65535}, {"name": "backups_remote_user", "label": "Usuario del destino (rest-server) o Access Key (s3)", "type": "string", "default": ""}, {"name": "backups_remote_password", "label": "Contraseña del destino (rest-server) o Secret Key (s3)", "type": "secret", "default": null, "help": "Se guarda cifrada en tu bóveda y solo viaja al servidor al aplicar."}, {"name": "backups_remote_cacert", "label": "Certificado del destino (rest-server)", "type": "string", "default": "", "pattern": "^[A-Za-z0-9+/=]*$", "patternHelp": "Lo rellena Draupnode"}, {"name": "backups_remote_append_only", "label": "El destino solo deja añadir", "type": "bool", "default": false}]},
  {"id": "monitoring", "name": "Monitorización (métricas)", "version": "1.0.0", "category": "6 · Monitorización", "description": "Prometheus y Grafana con paneles listos para la CPU, la RAM y el disco del servidor, cada contenedor y PostgreSQL. Grafana se abre desde Draupnode por un túnel SSH.", "details": "Todo en Docker y de código abierto: Prometheus, node-exporter (el servidor),\ncAdvisor (cada contenedor), postgres-exporter (si hay PostgreSQL de este\nproyecto) y Grafana OSS con los paneles «Recursos» y «PostgreSQL».\nGrafana y Prometheus solo escuchan en el propio servidor (127.0.0.1): no se\nabren a internet ni en el Cortafuegos. Draupnode los abre por la misma\nconexión SSH («Abrir Grafana» en la página del módulo). El usuario es admin;\nla contraseña se genera en el servidor y la tienes en sus contraseñas.\nOcupa unos 400-600 MB de RAM.\n", "uninstallable": true, "uninstallWarning": "Para y quita Prometheus, Grafana y los exportadores. Si están los Registros (Loki), desinstálalos antes.", "uninstallData": "Borrar también las métricas guardadas y la configuración de Grafana (paneles que hayas cambiado, usuarios).", "source": "builtin", "depends": ["docker"], "after": ["postgres"], "requires": {"os": ["ubuntu", "debian"], "minRamMb": 1500, "minDiskGb": 5}, "secrets": [{"file": "grafana_admin", "label": "Acceso a Grafana"}], "files": ["files/dashboards.yml", "files/dashboards/postgres.json", "files/dashboards/recursos.json", "files/datasource-prometheus.yml", "tasks/main.yml", "tasks/uninstall.yml", "templates/docker-compose.yml.j2", "templates/prometheus.yml.j2"], "variables": [{"name": "monitoring_retention_days", "label": "Días de métricas que se guardan", "type": "int", "default": 30, "min": 1, "max": 365}, {"name": "monitoring_cadvisor", "label": "Métricas de cada contenedor (cAdvisor)", "type": "bool", "default": true, "help": "CPU y RAM por contenedor. Necesita el almacenamiento clásico de Docker (opción del módulo Docker)."}, {"name": "monitoring_postgres", "label": "Métricas de PostgreSQL", "type": "bool", "default": true, "help": "Solo si PostgreSQL es de este mismo proyecto (usa su contraseña de superusuario)."}, {"name": "monitoring_postgres_container", "label": "Contenedor de PostgreSQL", "type": "string", "default": "pg-compartido", "pattern": "^[a-z][a-z0-9_-]{1,40}$", "patternHelp": "Minúsculas, números, - y _"}, {"name": "monitoring_postgres_network", "label": "Red Docker de PostgreSQL", "type": "string", "default": "apps", "pattern": "^[a-z][a-z0-9_-]{1,40}$", "patternHelp": "Minúsculas, números, - y _"}, {"name": "monitoring_grafana_port", "label": "Puerto de Grafana en el servidor", "type": "int", "default": 3000, "help": "Solo local (127.0.0.1); Draupnode llega a él por SSH.", "min": 1024, "max": 65535}, {"name": "monitoring_prometheus_port", "label": "Puerto de Prometheus en el servidor", "type": "int", "default": 19090, "help": "Solo local. Draupnode lo usa para el resumen de la página del módulo.", "min": 1024, "max": 65535}]},
  {"id": "logs", "name": "Registros (Loki)", "version": "1.0.0", "category": "6 · Monitorización", "description": "Guarda y busca en Grafana los registros de todos los contenedores y del sistema (SSH, sudo, servicios). Loki + Grafana Alloy.", "details": "Loki guarda los registros y Grafana Alloy los recoge: la salida de cada\ncontenedor Docker y el diario del sistema (journald). Se buscan en Grafana,\nen el panel «Registros de los contenedores». Todo de código abierto.\nNecesita la Monitorización (usa su Grafana). Ocupa unos 300-500 MB de RAM;\npor eso va aparte.\n", "uninstallable": true, "uninstallWarning": "Para y quita Loki y Alloy, y el panel de registros de Grafana.", "uninstallData": "Borrar también los registros guardados.", "source": "builtin", "depends": ["monitoring"], "after": null, "requires": {"os": ["ubuntu", "debian"], "minRamMb": 2000, "minDiskGb": 5}, "secrets": null, "files": ["files/datasource-loki.yml", "files/registros.json", "tasks/main.yml", "tasks/uninstall.yml", "templates/config.alloy.j2", "templates/docker-compose.yml.j2", "templates/loki.yml.j2"], "variables": [{"name": "logs_retention_days", "label": "Días de registros que se guardan", "type": "int", "default": 14, "min": 1, "max": 180}, {"name": "logs_journal", "label": "Registros del sistema (journald)", "type": "bool", "default": true, "help": "SSH, sudo, servicios, copias de seguridad… además de los contenedores."}]},
  { id: 'postgres', name: 'PostgreSQL compartido', version: '1.0.0', category: '4 · Bases de datos', uninstallable: true, uninstallWarning: "Para y quita el contenedor de PostgreSQL. Las apps que lo usan dejan de tener base de datos.", uninstallData: "Borrar también los DATOS de todas las bases y sus contraseñas. No se puede deshacer.", source: 'builtin', depends: ['docker'], requires: { os: ['ubuntu', 'debian'], minRamMb: 900 },
    description: 'Un PostgreSQL en Docker para todas tus apps, con una base y un usuario por app. Las contraseñas se generan en el servidor.',
    files: ['tasks/main.yml', 'templates/docker-compose.yml.j2'], checks: [{ containerFree: 'postgres_container' }],
    secrets: [{ file: 'postgres_superusuario', label: 'Superusuario «postgres»' }, { file: 'postgres_*', label: 'Usuario de la base' }],
    variables: [
      { name: 'postgres_version', label: 'Versión de PostgreSQL', type: 'select', options: ['15', '16', '17'], default: '16' },
      { name: 'postgres_container', label: 'Nombre del contenedor', type: 'string', default: 'pg-compartido', pattern: '^[a-z][a-z0-9_-]{1,40}$', patternHelp: 'Minúsculas, números, - y _' },
      { name: 'postgres_network', label: 'Red Docker compartida', type: 'string', default: 'apps' },
      { name: 'postgres_databases', label: 'Bases de datos', help: 'Una por línea. Cada una tendrá un usuario con el mismo nombre.', type: 'list', default: [], pattern: '^[a-z][a-z0-9_]{0,30}$', patternHelp: 'Minúsculas, números y _ (empezando por letra)' },
      { name: 'postgres_dir', label: 'Carpeta en el servidor', type: 'string', default: '/srv/draupnode/postgres' },
    ] },
  {"id":"backup-target","name":"Destino de copias (rest-server)","version":"1.0.0","category":"5 · Copias","description":"Convierte este servidor en el sitio donde OTROS servidores guardan sus copias. Solo deja añadir copias, nunca borrarlas, así que un intruso en el otro servidor no puede destruirlas.","details":"Usa rest-server (de los autores de restic, BSD-2) en Docker, con HTTPS y\nen modo «solo añadir» (--append-only): los servidores de origen pueden\nsubir copias nuevas pero no borrar ni cambiar las que ya hay. Cada proyecto\nde origen tiene su usuario y su carpeta y no ve las de los demás\n(--private-repos). Las copias llegan cifradas: este servidor no puede\nleerlas.\nLo normal es no tocar esto a mano: en la página del módulo «Copias» de\notro proyecto, «Guardar también en otro servidor…» crea este proyecto y\ndeja las dos partes configuradas (usuario, contraseña y certificado).\nRotación: con «Borrar las copias viejas» activado, ESTE servidor borra\ncada día las que pasan de los días indicados (y guarda una al mes si lo\npides). Para eso necesita la contraseña de las copias de cada proyecto:\nDraupnode se la da al aplicar (cuando ya la tiene, es decir, después de\naplicar el proyecto de origen). Así este servidor podría leer las copias;\nsi no quieres eso, desactívalo y aquí no se borrará nunca nada (vigila el\ndisco).\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minDiskGb":10},"variables":[{"name":"backup_target_port","label":"Puerto HTTPS","help":"Por él se conectan los servidores de origen. Se abre en el Cortafuegos.","type":"int","default":8000,"min":1024,"max":65535},{"name":"backup_target_dir","label":"Carpeta de las copias","help":"Dentro, una carpeta por proyecto de origen.","type":"string","default":"/srv/draupnode/destino-copias","pattern":"^/[A-Za-z0-9._/-]+$","patternHelp":"Ruta absoluta"},{"name":"backup_target_container","label":"Nombre del contenedor","type":"string","default":"dn-destino-copias","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"backup_target_clients","label":"Proyectos que guardan aquí","help":"Los rellena Draupnode («proyecto:huella de su contraseña»). Quitar una línea le quita el acceso; sus copias se quedan.","type":"list","default":[],"pattern":"^[a-z0-9][a-z0-9-]{0,62}:\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$","patternHelp":"Lo rellena Draupnode"},{"name":"backup_target_tls_cert","label":"Certificado HTTPS","help":"Lo genera Draupnode (en base64). Los servidores de origen lo usan para comprobar que hablan con este y no con otro.","type":"string","default":"","pattern":"^[A-Za-z0-9+/=]*$","patternHelp":"Lo rellena Draupnode"},{"name":"backup_target_tls_key","label":"Clave privada HTTPS","help":"La genera Draupnode y se guarda cifrada en tu bóveda.","type":"secret","default":null,"required":true},{"name":"backup_target_prune","label":"Borrar las copias viejas (rotación)","help":"Este servidor borra cada día las copias que pasan de los días de abajo. Necesita la contraseña de las copias (Draupnode se la da al aplicar).","type":"bool","default":true},{"name":"backup_target_keep_days","label":"Conservar las copias de los últimos (días)","type":"int","default":30,"min":1,"max":3650},{"name":"backup_target_keep_monthly","label":"Y además una copia al mes durante (meses)","help":"0 = ninguna más.","type":"int","default":12,"min":0,"max":240},{"name":"backup_target_prune_time","label":"Hora de la rotación","help":"Mejor lejos de la hora de las copias (mientras rota, el origen espera para copiar).","type":"string","default":"05:30","pattern":"^([01][0-9]|2[0-3]):[0-5][0-9]$","patternHelp":"Formato HH:MM"},{"name":"backup_target_keys","label":"Contraseñas de las copias (las pone Draupnode)","type":"secret","default":null,"managed":true}],"firewallPortsFrom":["backup_target_port"],"checks":[{"containerFree":"backup_target_container"}],"uninstallable":true,"uninstallWarning":"Para el rest-server y la rotación. Los otros servidores dejan de poder guardar aquí sus copias (fallará su copia remota hasta que elijas otro destino).","uninstallData":"Borrar también TODAS las copias guardadas aquí. Si el servidor de origen se pierde, ya no habrá de dónde restaurar.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"caddy","name":"Caddy (web y HTTPS automático)","version":"1.0.0","category":"3 · Plataformas","description":"Publica tus apps en tu dominio con HTTPS. Caddy pide y renueva solo los certificados de Let's Encrypt.","details":"Caddy (Apache-2) del repositorio de Ubuntu/Debian, como servicio del sistema.\nCada línea de «Sitios» es «dominio destino»:\n  fotos.ejemplo.com 127.0.0.1:2283      → reenvía a la app de ese puerto\n  blog.ejemplo.com /srv/www/blog        → sirve esa carpeta (web estática)\nEl dominio tiene que apuntar ya a la IP de este servidor (registro A/AAAA)\ny los puertos 80 y 443 tienen que estar abiertos (se añaden al Cortafuegos):\nasí Caddy consigue el certificado él solo. Mientras el DNS no apunte, ese\nsitio no tendrá HTTPS (los demás sí). Un dominio terminado en .localhost\nusa un certificado propio de Caddy (para pruebas).\nAntes de recargar se comprueba la configuración: si tiene un error, se\nqueda la anterior funcionando.\nNo puede ir con Coolify ni con nginx: los tres quieren los puertos 80 y 443.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"caddy_sites","label":"Sitios","help":"Una línea por sitio: «dominio destino». Destino = 127.0.0.1:PUERTO (una app) o /carpeta (web estática).","type":"list","default":[],"pattern":"^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}[ ]+(((https?://)?[A-Za-z0-9.-]+:[0-9]{1,5})|(/[A-Za-z0-9._/-]+))$","patternHelp":"Ejemplo: fotos.ejemplo.com 127.0.0.1:2283","placeholder":"fotos.ejemplo.com 127.0.0.1:2283"},{"name":"caddy_email","label":"Correo para Let's Encrypt","help":"Opcional. Te avisan si un certificado no se puede renovar.","type":"string","default":"","pattern":"^([^@\\s]+@[^@\\s]+\\.[^@\\s]+)?$","patternHelp":"Un correo válido o vacío"},{"name":"caddy_compress","label":"Comprimir las respuestas (gzip/zstd)","type":"bool","default":true},{"name":"caddy_security_headers","label":"Cabeceras de seguridad","help":"HSTS, no dejar meter la web en un marco de otra, no adivinar tipos de fichero…","type":"bool","default":true}],"firewallPorts":[80,443],"conflicts":["coolify","nginx"],"uninstallable":true,"uninstallWarning":"Desinstala Caddy. Tus sitios dejan de verse por su dominio; las apps de detrás siguen en marcha.","uninstallData":"Borrar también los certificados que había conseguido Caddy (/var/lib/caddy). Si lo reinstalas, los vuelve a pedir.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/Caddyfile.j2"]},
  {"id":"nginx","name":"nginx (web y proxy)","version":"1.0.0","category":"3 · Plataformas","description":"Publica tus apps en tu dominio con nginx, el servidor web más usado. HTTPS con certbot (Let's Encrypt), que se renueva solo.","details":"nginx (BSD-2) y certbot (Apache-2) de los repositorios de Ubuntu/Debian.\nCada línea de «Sitios» es «dominio destino»:\n  fotos.ejemplo.com 127.0.0.1:2283      → reenvía a la app de ese puerto\n  blog.ejemplo.com /srv/www/blog        → sirve esa carpeta (web estática)\nCada sitio va en su fichero /etc/nginx/sites-available/draupnode-\u003cdominio\u003e.conf;\nlos tuyos (los que no empiezan por draupnode-) no se tocan.\nCon HTTPS, certbot pide el certificado de cada dominio y redirige http→https.\nEl dominio tiene que apuntar ya a la IP de este servidor: si no, ese sitio\nse queda en http y se avisa (al volver a aplicar lo reintenta).\nAntes de recargar se comprueba la configuración (nginx -t): si falla, se\nvuelve a la anterior.\nSi no sabes cuál elegir, Caddy es más sencillo; nginx es el más conocido.\nNo puede ir con Coolify ni con Caddy: los tres quieren los puertos 80 y 443.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"nginx_sites","label":"Sitios","help":"Una línea por sitio: «dominio destino». Destino = 127.0.0.1:PUERTO (una app) o /carpeta (web estática).","type":"list","default":[],"pattern":"^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}[ ]+(((https?://)?[A-Za-z0-9.-]+:[0-9]{1,5})|(/[A-Za-z0-9._/-]+))$","patternHelp":"Ejemplo: fotos.ejemplo.com 127.0.0.1:2283","placeholder":"fotos.ejemplo.com 127.0.0.1:2283"},{"name":"nginx_https","label":"HTTPS con Let's Encrypt (certbot)","type":"bool","default":true},{"name":"nginx_email","label":"Correo para Let's Encrypt","help":"Obligatorio con HTTPS. Te avisan si un certificado no se puede renovar.","type":"string","default":"","pattern":"^([^@\\s]+@[^@\\s]+\\.[^@\\s]+)?$","patternHelp":"Un correo válido o vacío"},{"name":"nginx_max_body_mb","label":"Tamaño máximo de subida (MB)","help":"Lo que se puede subir de una vez (fotos, documentos…).","type":"int","default":50,"min":1,"max":10240},{"name":"nginx_remove_default","label":"Quitar la página «Welcome to nginx»","type":"bool","default":true},{"name":"nginx_security_headers","label":"Cabeceras de seguridad","help":"No dejar meter la web en un marco de otra, no adivinar tipos de fichero, no decir la versión de nginx…","type":"bool","default":true}],"firewallPorts":[80,443],"conflicts":["coolify","caddy"],"uninstallable":true,"uninstallWarning":"Desinstala nginx y certbot. Tus sitios dejan de verse por su dominio; las apps de detrás siguen en marcha.","uninstallData":"Borrar también los certificados de Let's Encrypt (/etc/letsencrypt) y la configuración de nginx.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/site.conf.j2"]},
  {"id":"wireguard","name":"WireGuard (VPN)","version":"1.0.0","category":"1 · Sistema","description":"Tu propia VPN. Con ella entras al servidor como si estuvieras en su red, para ver paneles (Grafana, Cockpit…) sin abrirlos a internet.","details":"WireGuard (GPL-2) del sistema, con la interfaz wg0. Cada nombre de\n«Dispositivos» (portátil, móvil…) tiene su configuración: se genera EN el\nservidor la primera vez, con su propia clave, y Draupnode la trae a tu\nbóveda. En la página de este módulo la ves con su código QR (para la app\nde WireGuard del móvil) o la guardas como .conf (para el ordenador).\nQuitar un nombre de la lista le quita el acceso.\nAbre el puerto UDP elegido en iptables (si lo hay). En Oracle Cloud ábrelo\ntambién en la Security List, como UDP.\nCon «Todo el tráfico por la VPN», el dispositivo sale a internet a través\ndel servidor (útil en una wifi pública); si no, solo va por la VPN lo que\nes para el servidor.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"wireguard_peers","label":"Dispositivos","help":"Uno por línea (portatil, movil…). Cada uno tiene su clave y su dirección en la VPN.","type":"list","default":["portatil","movil"],"pattern":"^[a-z0-9][a-z0-9-]{0,30}$","patternHelp":"Minúsculas, números y guiones"},{"name":"wireguard_port","label":"Puerto UDP","type":"int","default":51820,"min":1024,"max":65535},{"name":"wireguard_network","label":"Red de la VPN","help":"Una red privada /24 que no use tu casa ni el servidor. El servidor es la .1.","type":"string","default":"10.8.0.0/24","pattern":"^(10|172|192)\\.[0-9]{1,3}\\.[0-9]{1,3}\\.0/24$","patternHelp":"Una red /24 privada, p. ej. 10.8.0.0/24"},{"name":"wireguard_endpoint","label":"Dirección pública del servidor","help":"Por la que se conectan los dispositivos. Vacío = la misma con la que entra Draupnode.","type":"string","default":"","pattern":"^[A-Za-z0-9.:-]*$","patternHelp":"IP o nombre, sin puerto"},{"name":"wireguard_route_all","label":"Todo el tráfico por la VPN","help":"El dispositivo sale a internet a través del servidor.","type":"bool","default":false},{"name":"wireguard_dns","label":"DNS para los dispositivos","help":"Solo con «Todo el tráfico». Vacío = el suyo de siempre. Ejemplo 9.9.9.9.","type":"string","default":"","pattern":"^([0-9.]+(, *[0-9.]+)*)?$","patternHelp":"IPs separadas por comas"}],"secrets":[{"file":"wireguard_*.conf","label":"Configuración WireGuard del dispositivo"}],"uninstallable":true,"uninstallWarning":"Para la VPN y quita la interfaz wg0. Los dispositivos dejan de poder conectarse.","uninstallData":"Borrar también las claves del servidor y de los dispositivos (si lo reinstalas, habrá que volver a configurarlos todos).","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/peer.conf.j2","templates/wg0.conf.j2"]},
  {"id":"alerts","name":"Alertas al móvil","version":"1.0.0","category":"6 · Monitorización","description":"Te avisa al móvil cuando algo va mal (disco casi lleno, una copia que ha fallado, un contenedor caído, otro servidor que no responde) y cuando se arregla.","details":"Un pequeño script del servidor (systemd, cada pocos minutos) comprueba lo\nque marques y manda el aviso por ntfy (código abierto: la app ntfy del\nmóvil, con ntfy.sh o tu propio servidor ntfy) o por Telegram.\nAvisa una vez cuando empieza un problema, lo recuerda cada pocas horas si\nsigue, y avisa cuando se arregla.\nCon ntfy, si dejas el tema vacío se genera uno largo y secreto (quien sepa\nel nombre puede leer los avisos). En la página de este módulo tienes el QR\npara suscribirte desde la app y un botón para mandar un aviso de prueba.\nUn servidor no puede avisar de que él mismo se ha caído: para eso, pon su\ndirección en «Vigilar otros servidores» de las alertas de OTRO servidor, o\nmarca el «Aviso diario»: si un día no llega, algo pasa.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"alerts_channel","label":"Por dónde avisar","help":"«ntfy» = app ntfy del móvil (código abierto). «telegram» = un bot de Telegram.","type":"select","default":"ntfy","options":["ntfy","telegram"]},{"name":"alerts_ntfy_server","label":"Servidor ntfy","help":"El público (https://ntfy.sh) o el tuyo.","type":"string","default":"https://ntfy.sh","pattern":"^https?://[A-Za-z0-9.:-]+(/[A-Za-z0-9._/-]*)?$","patternHelp":"Una dirección http(s)://"},{"name":"alerts_ntfy_topic","label":"Tema de ntfy","help":"Vacío = se genera uno secreto en el servidor (recomendado).","type":"string","default":"","pattern":"^[A-Za-z0-9_-]{0,64}$","patternHelp":"Letras, números, - y _"},{"name":"alerts_ntfy_token","label":"Token de ntfy","help":"Solo si tu servidor ntfy pide usuario (token de acceso «tk_…»).","type":"secret","default":null},{"name":"alerts_telegram_token","label":"Token del bot de Telegram","help":"El que te da @BotFather al crear el bot.","type":"secret","default":null},{"name":"alerts_telegram_chat","label":"Chat de Telegram","help":"Tu número de chat (escríbele al bot y míralo con @userinfobot).","type":"string","default":"","pattern":"^-?[0-9]{0,20}$","patternHelp":"Un número"},{"name":"alerts_disk_percent","label":"Avisar si un disco pasa del (%)","help":"0 = no avisar.","type":"int","default":90,"min":0,"max":99},{"name":"alerts_ram_percent","label":"Avisar si la memoria pasa del (%)","help":"Durante dos comprobaciones seguidas. 0 = no avisar.","type":"int","default":95,"min":0,"max":99},{"name":"alerts_backups","label":"Avisar si falla una copia de seguridad","help":"O si la última buena tiene más de 36 horas.","type":"bool","default":true},{"name":"alerts_containers","label":"Avisar si un contenedor se cae","help":"Parado con error, reiniciándose sin parar o «unhealthy».","type":"bool","default":true},{"name":"alerts_services","label":"Avisar si falla un servicio del sistema","help":"Cualquier servicio de systemd en estado «failed».","type":"bool","default":true},{"name":"alerts_watch","label":"Vigilar otros servidores","help":"Uno por línea: dirección:puerto (p. ej. 203.0.113.40:22). Avisa si deja de responder.","type":"list","default":[],"pattern":"^[A-Za-z0-9.-]+:[0-9]{1,5}$","patternHelp":"dirección:puerto"},{"name":"alerts_daily","label":"Aviso diario de que todo va bien","help":"A las 9:00. Si un día no llega, el servidor puede estar caído.","type":"bool","default":false},{"name":"alerts_interval_min","label":"Comprobar cada (minutos)","type":"int","default":5,"min":1,"max":60},{"name":"alerts_repeat_hours","label":"Recordar un problema que sigue cada (horas)","help":"0 = no recordar.","type":"int","default":6,"min":0,"max":168}],"after":["backups","docker","monitoring"],"secrets":[{"file":"alerts_ntfy_topic","label":"Tema de ntfy (para suscribirte)"}],"uninstallable":true,"uninstallWarning":"Quita el script y el temporizador de las alertas. Dejarás de recibir avisos de este servidor.","source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/alertas.py.j2"]}
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
