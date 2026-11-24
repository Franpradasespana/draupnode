// Puente con el backend Go (Wails expone los métodos en window.go.app.App).
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
  author: string
  year: string
  license: string
  project: string
}

export interface Legal {
  notice: string
  license: string
  thirdParty: string
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
  noUpdateCheck?: boolean
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
  /** Cómo probarlo en el servidor de pruebas y qué debería verse (Ayuda → Catálogo). */
  prueba?: { lab?: string; pasos: string[]; comprobar: string[]; necesita?: string[]; problemas?: string[] }
  links?: { label: string; url: string }[]
  proxySite?: { domain: string; port: string }
  /** Puede estar varias veces en un servidor (otra copia = «id@nombre»). */
  repeatable?: boolean
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
  /** Plantilla de la que vino al servidor ('' = añadido en el propio servidor). */
  from?: string
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

/** «Desinstalar todo»: qué se desinstala, qué se queda (con el motivo en warning) y qué solo sale de la lista. */
export interface UninstallAllPlan {
  ok: boolean
  error?: string
  remove: string[]
  keep: { id: string; name: string; warning?: string }[]
  unmark: string[]
  /** La comprobación de la desinstalación, ya sin los de unmark. */
  check: UninstallCheck
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
  /** Plantillas aplicadas a este servidor (los módulos son del servidor; la plantilla solo los añade). */
  templates?: string[] | null
  /** Solo en datos de antes de la 0.50 (la demo los convierte al cargar). */
  recipeId?: string
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

/** Revisión de un módulo (.draupnode-modulo) antes de importarlo. */
export interface ModuleImportReport {
  file: string
  ok: boolean
  id: string
  name: string
  version: string
  description: string
  draupnode: string
  exported: string
  integrity: boolean
  files: { path: string; size: number; text?: string }[]
  problems: string[]
  warnings: string[]
  tasks: string[]
  commands: string[]
  hosts: string[]
  images: string[]
  depends: string[]
  conflict: '' | 'user' | 'builtin'
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
  serverId: string
  server: string
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

export interface RecipeServer {
  serverId: string
  serverName: string
  projectId: string
}

export interface RecipeView extends Recipe {
  /** Servidores en los que se ha aplicado. */
  servers: RecipeServer[]
}

export interface TemplateResult {
  project: Project
  recipe: Recipe
  notes: string[]
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
  containers?: { id: string; name: string; image: string; state: string; health: string; started: string; restarts: number; compose: string; draupnode: string; coolify: string; ports: string[]; cpu?: string; mem?: string; app?: string; cpuP?: number; memB?: number }[]
  databases?: { container: string; engine: string; image: string; databases: { name: string; size: number }[] }[]
  coolify?: { apps: { kind: string; name: string; urls: string[]; status: string }[]; panel: string } | null
  sites?: { server: string; domain: string; target: string; https: boolean; file: string }[]
  failed?: string[]
  ports?: { proto: string; addr: string; port: number; process: string; public: boolean }[]
  firewall?: { active: boolean; tcp: string[]; udp: string[] }
  draupnode?: { markers: ServerMarker[]; secretDirs: string[]; appDirs: string[] }
  software?: { module: string; active: boolean }[]
  backups?: { slug: string; ok: boolean; running: boolean; ago: number | null }[]
  updates?: { total: number; security: number; reboot: boolean; packages: string[]; rebootFor?: string[] }
  clock?: { synced: boolean; known: boolean; timezone: string }
  security?: { failed24h: number; ips: number; top: { ip: string; count: number }[]; fail2ban: { banned: number; total: number } | null }
  certs?: { domain: string; days?: number; issuer?: string; error?: string }[]
  history?: ServerHistory
}

/** Historial que guarda el temporizador draupnode-historial (historial.py). */
export interface ServerHistory {
  /** El recolector está instalado en el servidor. */
  installed: boolean
  hasData?: boolean
  timer?: boolean
  version?: number
  /** El del servidor es anterior al de esta Draupnode. */
  outdated?: boolean
  step?: number
  since?: number | null
  last?: number | null
  memT?: number
  diskT?: number
  /** Últimas 24 h cada 5 min: [t, cpu %, memoria usada, disco usado]. */
  day?: [number, number, number, number][]
  /** Últimos 30 días por horas: [t, cpu media, cpu máx, memoria media, memoria máx, disco]. */
  month?: [number, number, number, number, number, number][]
  /** Disco: ritmo de los últimos días (bytes/día) y días hasta llenarse (si crece). */
  forecast?: { enough: boolean; hours: number; free?: number; perDay?: number; days?: number }
  /** Por app (clave = la de containers[].app): últimas 24 h de 15 en 15 min [t, cpu %, memoria]. */
  apps?: Record<string, { cpuAvg: number; memAvg: number; cpuMax: number; memMax: number; series: [number, number, number][] }>
}

export interface GitEnvVar {
  key: string
  example?: string
  inExample: boolean
  inCompose: boolean
  /** La lee el código del proyecto. */
  inCode?: boolean
  hasDefault: boolean
  secret: boolean
  external: boolean
  hint?: string
  /** Perfil del tipo de app: valor de servidor típico, o generarla (con su formato). */
  suggest?: string
  generate?: boolean
  format?: string
}

export interface GitInspectResult extends RunStart {
  /** Orden para preparar la base de datos según el tipo de app, y dónde ejecutarla. */
  postCommand?: string
  postService?: string
  framework?: string
  commit?: string
  composeFound: boolean
  exampleFile?: string
  vars: GitEnvVar[]
}

export interface EnvImportResult extends RunStart {
  env: string[]
  secretKeys: string[]
  skipped: string[]
}

export interface DockerUsage {
  type: string
  total: string
  active: string
  size: string
  reclaimable: string
}

export interface DockerResult extends RunStart {
  output?: string
  usage?: DockerUsage[]
}

export interface PublishResult {
  projectId: string
  serverId: string
  moduleId: string
  notes: string[]
  review: string[]
}

export interface CachedOverview {
  at: string
  overview: ServerOverview
}

export interface ServerMarker {
  draupnode?: string
  at?: string
  nombre?: string
  plantilla?: string
  slug: string
  modulos: { id: string; values?: Record<string, unknown> }[]
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
  Legal(): Promise<Legal>
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
  ExportUserModule(id: string): Promise<string>
  InspectModuleFile(): Promise<ModuleImportReport>
  ImportModuleFile(path: string, newId: string, overwrite: boolean): Promise<UserModule>
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
  PlanUninstallAll(projectId: string): Promise<UninstallAllPlan>
  UninstallAll(projectId: string, purge: boolean, secret: string, accept: string, sudoPassword: string): Promise<RunStart>
  UninstallModules(projectId: string, modules: string[], purge: boolean, secret: string, accept: string, sudoPassword: string): Promise<RunStart>
  ProjectSecretsInfo(projectId: string): Promise<ProjectSecretsSummary>
  ProjectSecrets(projectId: string, master: string): Promise<ProjectSecret[]>
  BackupStatus(): Promise<{ lastExport?: string | null }>
  PingServers(): Promise<{ id: string; reachable: boolean; latencyMs: number; lab: boolean }[]>
  CheckUpdate(): Promise<{ current: string; latest: string; newer: boolean; url: string; notes?: string; enabled: boolean }>
  SetUpdateCheck(enabled: boolean): Promise<void>
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
  RecoverFromServer(serverId: string, markerJson: string): Promise<{ project: Project; notes: string[] }>
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
  ServerModules(serverId: string): Promise<Project>
  ApplyTemplate(serverId: string, recipeId: string): Promise<TemplateResult>
  ModulesToTemplate(serverId: string, moduleIds: string[], recipeId: string, newName: string): Promise<TemplateResult>
  ForgetTemplate(serverId: string, recipeId: string): Promise<Project>
  ServerOverview(serverId: string, secret: string, accept: string, sudoPassword: string): Promise<ServerOverviewResult>
  LastOverviews(): Promise<Record<string, CachedOverview>>
  PublishDockerApp(dir: string, spec: DockerSpec, serverId: string): Promise<PublishResult>
  ServerUpgrade(serverId: string, secret: string, accept: string, sudoPassword: string): Promise<DockerResult>
  ServerReboot(serverId: string, secret: string, accept: string, sudoPassword: string): Promise<DockerResult>
  ServerHistory(serverId: string, enable: boolean, keepData: boolean, secret: string, accept: string, sudoPassword: string): Promise<DockerResult>
  RemoveOrphanApp(serverId: string, name: string, purge: boolean, secret: string, accept: string, sudoPassword: string): Promise<DockerResult>
  ContainerAction(serverId: string, name: string, action: string, secret: string, accept: string, sudoPassword: string): Promise<DockerResult>
  DockerDiskUsage(serverId: string, secret: string, accept: string, sudoPassword: string): Promise<DockerResult>
  DockerPrune(serverId: string, what: string[], secret: string, accept: string, sudoPassword: string): Promise<DockerResult>
  ChooseEnvFile(): Promise<string>
  GitAppImportEnv(projectId: string, moduleId: string, path: string): Promise<EnvImportResult>
  GitAppInspect(projectId: string, moduleId: string, repo: string, branch: string, compose: string, appName: string, secret: string, accept: string, sudoPassword: string): Promise<GitInspectResult>
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
    go?: { app?: { App?: Backend } }
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

export const isDesktop = typeof window !== 'undefined' && !!window.go?.app?.App

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
    if (p.templates) continue // ya en el modelo de la 0.50 (módulos del servidor)
    if (p.recipeId && recipes.some((r) => r.id === p.recipeId)) continue
    const same = recipes.find((r) => r.name === p.name)
    if (same) { p.recipeId = same.id; continue }
    const r: Recipe = { id: 'r' + p.id, name: p.name, modules: JSON.parse(JSON.stringify(p.modules)) }
    recipes.push(r)
    p.recipeId = r.id
  }
  // Desde la 0.50 cada servidor tiene un solo conjunto de módulos (como hace la app al convertir los datos).
  {
    const merged: Project[] = []
    for (const p of projects) {
      const main = merged.find((x) => x.serverId === p.serverId)
      const mods = p.modules.map((m) => ({ ...m, from: m.from ?? p.recipeId }))
      if (!main) {
        merged.push({ ...p, name: servers.find((sv) => sv.id === p.serverId)?.name ?? p.name, modules: mods, templates: [...(p.templates ?? []), ...(p.recipeId ? [p.recipeId] : [])], recipeId: undefined })
        continue
      }
      for (const m of mods) if (!main.modules.some((x) => x.id === m.id)) main.modules.push(m)
      if (p.recipeId && !main.templates!.includes(p.recipeId)) main.templates!.push(p.recipeId)
      main.installedModules = [...new Set([...(main.installedModules ?? []), ...(p.installedModules ?? [])])]
      main.installedValues = { ...(p.installedValues ?? {}), ...(main.installedValues ?? {}) }
      if (!main.appliedAt || (p.appliedAt && p.appliedAt < main.appliedAt)) main.appliedAt = p.appliedAt ?? main.appliedAt
    }
    projects = merged
  }
  function serverProject(sid: string): Project {
    let p = projects.find((x) => x.serverId === sid)
    if (!p) {
      p = { id: 'p' + Date.now(), name: servers.find((s) => s.id === sid)?.name ?? '', serverId: sid, slug: 'srv' + Date.now(), modules: [], templates: [] }
      projects.push(p)
    }
    return p
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
      return { version: 'demo navegador', configDir: '(simulado)', os: 'browser', author: 'Francisco Javier Pradas', year: '2026', license: 'GPL-3.0-or-later', project: 'https://github.com/Franpradasespana/draupnode' }
    },
    async Legal() {
      return {
        notice: 'Draupnode\nCopyright © 2026 Francisco Javier Pradas\n\n(En la demo del navegador solo se ve un resumen: la app de escritorio trae los textos completos.)',
        license: 'GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n…',
        thirdParty: 'Resumen\n=======\n- github.com/wailsapp/wails/v2 · MIT\n- svelte · MIT\n…',
      }
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
    async ExportUserModule(id) {
      await wait(300)
      return '/home/usuario/' + id + '.draupnode-modulo'
    },
    async InspectModuleFile() {
      await wait(500)
      const yamlTxt = 'id: monitor-web\nname: "Vigilar una web"\nversion: 1.2.0\ncategory: 8 · Mis módulos\ndescription: "Comprueba cada 5 minutos que una web responde y avisa si no."\ndepends: [base]\nvariables:\n  - name: monitor_web_url\n    label: Dirección\n    type: string\n    default: https://ejemplo.com\n'
      const tasksTxt = '---\n- name: Instalar curl\n  ansible.builtin.apt:\n    name: curl\n- name: Script\n  ansible.builtin.template:\n    src: vigilar.sh.j2\n    dest: /usr/local/bin/vigilar-web\n    mode: "0755"\n- name: Cada 5 minutos\n  ansible.builtin.cron:\n    name: vigilar-web\n    minute: "*/5"\n    job: /usr/local/bin/vigilar-web\n'
      return { file: '/home/usuario/Descargas/monitor-web.draupnode-modulo', ok: true, id: 'monitor-web', name: 'Vigilar una web', version: '1.2.0', description: 'Comprueba cada 5 minutos que una web responde y avisa si no.',
        draupnode: '0.58.2', exported: '23/11/2026 18:40', integrity: true,
        files: [{ path: 'module.yaml', size: yamlTxt.length, text: yamlTxt }, { path: 'role/tasks/main.yml', size: tasksTxt.length, text: tasksTxt }, { path: 'role/templates/vigilar.sh.j2', size: 120, text: '#!/bin/sh\ncurl -fsS -m 10 "{{ monitor_web_url }}" >/dev/null || logger -t vigilar-web "{{ monitor_web_url }} no responde"\n' }],
        problems: [], warnings: ['programa tareas periódicas (role/tasks/main.yml)'], tasks: ['apt × 1', 'cron × 1', 'template × 1'], commands: [], hosts: ['ejemplo.com'], images: [], depends: ['base'], conflict: mockUserMods['monitor-web'] ? 'user' : '' }
    },
    async ImportModuleFile(_p, newId) {
      await wait(300)
      return this.CreateUserModule(newId || 'monitor-web', '')
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
    async PlanUninstallAll(id) {
      const p = projects.find((x) => x.id === id)
      const inst = p?.installedModules ?? []
      const mod = (m: string) => MOCK_MODULES.find((x) => x.id === m)
      const stays = inst.filter((m) => mod(m)?.noUninstall || !mod(m)?.uninstallable)
      const remove = inst.filter((m) => !stays.includes(m))
      return { ok: true, remove, unmark: (p?.modules ?? []).map((m) => m.id).filter((m) => !inst.includes(m)),
        keep: stays.map((m) => ({ id: m, name: mod(m)?.name ?? m, warning: mod(m)?.noUninstall ?? 'todavía no tiene desinstalación' })),
        check: { ok: remove.length > 0, error: remove.length ? undefined : 'no hay nada que desinstalar', modules: remove.map((m) => ({ id: m, name: mod(m)?.name ?? m, warning: mod(m)?.uninstallWarning, data: mod(m)?.uninstallData })),
          hasData: remove.some((m) => !!mod(m)?.uninstallData), server: servers.find((s) => s.id === p?.serverId)?.name ?? '', selected: remove } }
    },
    async UninstallAll(id, purge, s, a, u) {
      const plan = await this.PlanUninstallAll(id)
      const p = projects.find((x) => x.id === id)
      if (p) p.modules = p.modules.filter((m) => !plan.unmark.includes(m.id))
      return this.UninstallModules(id, plan.remove, purge, s, a, u)
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
    async PingServers() {
      return servers.map((x) => ({ id: x.id, reachable: !load<string[]>('caidos', []).includes(x.id), latencyMs: 38, lab: x.id === 'lab' }))
    },
    async CheckUpdate() {
      const enabled = !load('noUpdateCheck', false)
      return { current: '0.2.0', latest: '0.43.0', newer: enabled, url: 'https://github.com/Franpradasespana/draupnode/releases', enabled }
    },
    async SetUpdateCheck(en) {
      save('noUpdateCheck', !en)
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
    async RecoverFromServer(sid, mj) {
      await wait(400)
      const m = JSON.parse(mj)
      const rid = 'r' + Date.now()
      const mods = m.modulos.map((x: { id: string }) => ({ id: x.id, values: {} }))
      recipes.push({ id: rid, name: m.plantilla || m.nombre || m.slug, notes: '', modules: mods, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as Recipe)
      save('recipes', recipes)
      const p = serverProject(sid)
      Object.assign(p, { slug: m.slug, templates: [rid], modules: mods.map((x: ProjectModule) => ({ ...x, from: rid })), installedModules: mods.map((x: { id: string }) => x.id), appliedAt: m.at, updatedAt: m.at })
      save('projects', projects)
      return { project: p, notes: ['Se ha creado la plantilla «' + (m.plantilla || m.nombre) + '».'] }
    },
    async RunHistory(sid, pid, limit) {
      const l = projects.filter((p) => (!sid || p.serverId === sid) && (!pid || p.id === pid) && p.lastRun).map((p) => {
        const r = p.lastRun!
        return { projectId: p.id, project: p.name, serverId: p.serverId, server: servers.find((x) => x.id === p.serverId)?.name ?? '', name: 'demo.log', at: r.at, mode: r.uninstall ? 'desinstalar' : r.check ? 'previsualizar' : 'aplicar', known: true, ok: r.ok, canceled: !!r.canceled, changed: r.changed, failed: r.failed, error: r.error, durationMs: r.durationMs ?? 42000 }
      }).sort((a, b) => b.at.localeCompare(a.at))
      return limit > 0 ? l.slice(0, limit) : l
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
        tgt = serverProject(tgtServerId)
        for (const m of [{ id: 'docker', values: {} }, { id: 'firewall', values: { firewall_tcp_ports: ['22', String(port)] } }, { id: 'backup-target', values: { backup_target_port: port } }]) {
          if (!tgt.modules.some((x) => x.id === m.id)) tgt.modules.push({ ...m, from: rec.id })
        }
        tgt.templates = [...new Set([...(tgt.templates ?? []), rec.id])]
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
      return recipes.map((r) => ({ ...r, servers: projects.filter((p) => p.templates?.includes(r.id)).map((p) => ({
        projectId: p.id, serverId: p.serverId, serverName: servers.find((s) => s.id === p.serverId)?.name ?? '',
      })) }))
    },
    async CheckRecipe(r) {
      return mockCheck({ id: '', name: r.name, serverId: '', modules: r.modules } as Project)
    },
    async SaveRecipe(r) {
      await wait()
      const saved = { ...r, id: r.id || 'r' + Date.now(), modules: r.modules.map((m) => ({ id: m.id, values: { ...defaults(m.id), ...m.values } })) }
      const old = recipes.find((x) => x.id === saved.id)
      recipes = old ? recipes.map((x) => (x.id === saved.id ? saved : x)) : [...recipes, saved]
      save('recipes', recipes)
      return saved
    },
    async DeleteRecipe(id) {
      recipes = recipes.filter((r) => r.id !== id)
      for (const p of projects) {
        p.templates = (p.templates ?? []).filter((t) => t !== id)
        for (const m of p.modules) if (m.from === id) m.from = ''
      }
      save('recipes', recipes)
      save('projects', projects)
    },
    async ServerModules(sid) {
      const p = serverProject(sid)
      save('projects', projects)
      return p
    },
    async ApplyTemplate(sid, rid) {
      await wait()
      const r = recipes.find((x) => x.id === rid)!
      const p = serverProject(sid)
      const added: string[] = [], kept: string[] = []
      for (const m of r.modules) {
        if (p.modules.some((x) => x.id === m.id)) { kept.push(m.id); continue }
        p.modules.push({ id: m.id, values: JSON.parse(JSON.stringify(m.values ?? {})), from: rid })
        added.push(m.id)
      }
      p.templates = [...new Set([...(p.templates ?? []), rid])]
      p.updatedAt = new Date().toISOString()
      save('projects', projects)
      const notes = [added.length ? `Añadidos: ${added.length} módulo(s). Se instalan al pulsar Aplicar.` : 'El servidor ya tenía todos sus módulos: no se ha añadido ninguno.']
      if (kept.length) notes.push(`Ya estaban (se mantiene su configuración): ${kept.length} módulo(s).`)
      return { project: p, recipe: r, notes }
    },
    async ModulesToTemplate(sid, ids, rid, name) {
      await wait()
      const p = serverProject(sid)
      let r: Recipe
      if (rid) r = recipes.find((x) => x.id === rid)!
      else {
        if (!name.trim()) throw new Error('ponle un nombre a la plantilla nueva')
        if (recipes.some((x) => x.name.toLowerCase() === name.trim().toLowerCase())) throw new Error(`ya hay una plantilla «${name.trim()}»: elígela en «añadir a una existente»`)
        r = { id: 'r' + Date.now(), name: name.trim(), modules: [] }
      }
      r = { ...r, modules: [...r.modules.filter((m) => !ids.includes(m.id)), ...p.modules.filter((m) => ids.includes(m.id)).map((m) => ({ id: m.id, values: JSON.parse(JSON.stringify(m.values)) }))] }
      recipes = recipes.some((x) => x.id === r.id) ? recipes.map((x) => (x.id === r.id ? r : x)) : [...recipes, r]
      for (const m of p.modules) if (ids.includes(m.id)) m.from = r.id
      p.templates = [...new Set([...(p.templates ?? []), r.id])]
      save('recipes', recipes)
      save('projects', projects)
      return { project: p, recipe: r, notes: [rid ? `Plantilla «${r.name}» actualizada. Los demás servidores en los que se aplicó no cambian.` : `Plantilla «${r.name}» creada con ${ids.length} módulo(s).`] }
    },
    async ForgetTemplate(sid, rid) {
      const p = serverProject(sid)
      p.templates = (p.templates ?? []).filter((t) => t !== rid)
      for (const m of p.modules) if (m.from === rid) m.from = ''
      save('projects', projects)
      return p
    },
    async ChooseEnvFile() {
      return '/home/demo/mi-app/.env'
    },
    async GitAppImportEnv() {
      await wait(300)
      return { status: 'ok', env: ['DEBUG=False', 'ALLOWED_HOSTS=mi-app.ejemplo.com', 'DATABASE_URL=postgres://app@db:5432/app'], secretKeys: ['SECRET_KEY', 'POSTGRES_PASSWORD', 'STRIPE_API_KEY'], skipped: [] }
    },
    async GitAppInspect(_p, _m, repo) {
      await wait(900)
      if (!repo) return { status: 'error', message: 'Escribe primero la dirección del repositorio (https://… o git@…).', composeFound: false, vars: [] }
      if (/bootstrap/.test(repo)) return { status: 'ok', commit: 'ac35207 feat(collapse): add .collapse-instant', composeFound: false, vars: [] }
      const v = (key: string, o: Partial<GitEnvVar>): GitEnvVar => ({ key, inExample: true, inCompose: false, hasDefault: false, secret: false, external: false, ...o })
      return { status: 'ok', commit: 'a1b2c3d Primera versión', composeFound: true, exampleFile: '.env.example', postCommand: 'python3 manage.py migrate', postService: 'web', vars: [
        v('ALLOWED_HOSTS', { example: 'localhost' }), v('DATABASE_URL', { example: 'postgres://app:pass@db:5432/app', hint: 'dirección: si lleva usuario y contraseña, escríbela entera' }),
        v('DEBUG', { example: 'False' }), v('PORT', { inExample: false, inCompose: true, hasDefault: true }),
        v('POSTGRES_PASSWORD', { inCompose: true, secret: true, hint: 'contraseña o clave de la app: se puede generar al azar' }),
        v('SECRET_KEY', { inCompose: true, secret: true, hint: 'contraseña o clave de la app: se puede generar al azar' }),
        v('STRIPE_API_KEY', { inExample: false, inCompose: true, external: true, hint: 'clave de otro servicio: solo la tienes tú' }),
      ] }
    },
    async ContainerAction() {
      await wait(600)
      return { status: 'ok' }
    },
    async DockerDiskUsage() {
      await wait(500)
      return { status: 'ok', usage: [
        { type: 'Images', total: '15', active: '8', size: '3.1GB', reclaimable: '1.66GB (53%)' },
        { type: 'Containers', total: '8', active: '7', size: '68B', reclaimable: '0B (0%)' },
        { type: 'Local Volumes', total: '6', active: '4', size: '154.5MB', reclaimable: '73.3MB (47%)' },
        { type: 'Build Cache', total: '52', active: '0', size: '1.07GB', reclaimable: '888.4MB' },
      ] }
    },
    async DockerPrune(_s, what) {
      await wait(900)
      return { status: 'ok', output: what.map((w: string) => (w === 'images' ? '== Imágenes sin usar\nTotal reclaimed space: 1.66GB' : w === 'build' ? '== Caché de construcción\nTotal reclaimed space: 888.4MB' : '== Contenedores parados\nTotal reclaimed space: 0B')).join('\n') }
    },
    async ServerUpgrade() {
      await wait(1500)
      return { status: 'ok', output: '12 actualizados, 0 nuevos se instalarán, 0 para eliminar y 0 no actualizados.\n== Hace falta reiniciar el servidor para terminar.' }
    },
    async ServerReboot() {
      await wait(400)
      return { status: 'ok', output: 'reiniciando' }
    },
    async ServerHistory(_s, enable) {
      await wait(800)
      mockHistoryOn = enable
      return { status: 'ok', output: enable ? 'Historial activado: una muestra cada 5 minutos.' : 'Historial desactivado.' }
    },
    async RemoveOrphanApp(_s, name, purge) {
      await wait(700)
      return { status: 'ok', output: `== Contenedores\nContainer dn-${name}-1 Removed${purge ? '\nVolume dn-' + name + '_db_data Removed' : ''}\n== Carpeta\nborrada /srv/draupnode/apps/${name}` }
    },
    async PublishDockerApp(dir, spec, sid) {
      await wait(500)
      const p = serverProject(sid)
      const id = p.modules.some((m) => m.id === 'git-app') ? 'git-app@' + spec.name.replace(/[^a-z0-9]/g, '') : 'git-app'
      p.modules.push({ id, values: { ...defaults('git-app'), git_app_source: 'carpeta', git_app_local_dir: dir, git_app_name: spec.name, git_app_compose: 'docker-compose.yml', git_app_port: 8000, git_app_env: ['DJANGO_DEBUG=false', 'DB_ENGINE=postgres'], git_app_env_generate: ['DB_PASSWORD', 'DJANGO_SECRET_KEY'] } })
      p.updatedAt = new Date().toISOString()
      save('projects', projects)
      return { projectId: p.id, serverId: sid, moduleId: id, notes: [`«${spec.name}» añadida a los módulos del servidor: sale de ${dir}; Draupnode la sube al aplicar.`], review: ['EMAIL_HOST: clave de otro servicio, solo la tienes tú'] }
    },
    async LastOverviews() {
      const out: Record<string, CachedOverview> = {}
      for (const s of servers) {
        const r = await (this.ServerOverview as (...a: unknown[]) => Promise<ServerOverviewResult>)(s.id, '', '', '', true)
        if (r.overview) out[s.id] = { at: new Date(Date.now() - 4 * 60000).toISOString(), overview: r.overview }
      }
      return out
    },
    async ServerOverview(id, _s, _a, _u, fast?: boolean) {
      if (!fast) await wait(900)
      const gb = 1024 ** 3
      const lab = servers.find((s) => s.id === id)?.port === 2222
      return { status: 'ok', overview: {
        at: Math.floor(Date.now() / 1000), errors: [], docker: true,
        system: { hostname: lab ? 'servidor-prueba' : 'srv-web', os: 'Ubuntu 24.04.1 LTS', kernel: '6.8.0-49-generic', uptime: 3 * 86400 + 5 * 3600, load: [0.42, 0.38, 0.31], cpus: 4, cpu: 12.5, memTotal: 24 * gb, memAvailable: 15.2 * gb, swapTotal: 2 * gb, swapFree: 1.9 * gb },
        disks: [{ mount: '/', size: 194 * gb, used: 61 * gb, free: 133 * gb }],
        containers: [
          { id: 'a1', name: 'coolify', image: 'ghcr.io/coollabsio/coolify:4', state: 'running', health: 'healthy', started: '', restarts: 0, compose: 'source', draupnode: '', coolify: '', ports: ['0.0.0.0:8000->8080/tcp'], cpu: '1.20%', mem: '412MiB', app: 'source', cpuP: 1.20, memB: 432013312 },
          { id: 'a2', name: 'coolify-proxy', image: 'traefik:v3.1', state: 'running', health: '', started: '', restarts: 0, compose: 'coolify-proxy', draupnode: '', coolify: '', ports: ['0.0.0.0:80->80/tcp', '0.0.0.0:443->443/tcp'], cpu: '0.30%', mem: '58MiB', app: 'coolify-proxy', cpuP: 0.30, memB: 60817408 },
          { id: 'a3', name: 'tienda-web-x8k2', image: 'tienda:latest', state: 'running', health: 'healthy', started: '', restarts: 0, compose: '', draupnode: '', coolify: 'tienda', ports: [], cpu: '2.10%', mem: '186MiB', app: 'coolify:tienda', cpuP: 2.10, memB: 195035136 },
          { id: 'a4', name: 'blog-web-p3m1', image: 'blog:latest', state: 'restarting', health: '', started: '', restarts: 14, compose: '', draupnode: '', coolify: 'blog', ports: [], cpu: '0.00%', mem: '0B', app: 'coolify:blog', cpuP: 0.00, memB: 0 },
          { id: 'a5', name: 'pg-compartido', image: 'postgres:16-alpine', state: 'running', health: 'healthy', started: '', restarts: 0, compose: 'draupnode-postgres', draupnode: 'coolify-produccion', coolify: '', ports: [], cpu: '0.80%', mem: '96MiB', app: 'draupnode-postgres', cpuP: 0.80, memB: 100663296 },
        ],
        databases: [{ container: 'pg-compartido', engine: 'PostgreSQL', image: 'postgres:16-alpine', databases: [{ name: 'tienda', size: 184 * 1024 ** 2 }, { name: 'blog', size: 23 * 1024 ** 2 }, { name: 'postgres', size: 7.5 * 1024 ** 2 }] }],
        coolify: { panel: 'https://panel.ejemplo.com', apps: [{ kind: 'app', name: 'tienda', urls: ['https://tienda.ejemplo.com'], status: 'running:healthy' }, { kind: 'app', name: 'blog', urls: ['https://blog.ejemplo.com'], status: 'restarting' }] },
        sites: [{ server: 'nginx', domain: 'estado.ejemplo.com', target: 'http://127.0.0.1:3001', https: true, file: '/etc/nginx/sites-enabled/draupnode-estado.ejemplo.com.conf' }],
        failed: ['certbot.service'],
        ports: [{ proto: 'tcp', addr: '0.0.0.0', port: 22, process: 'sshd', public: true }, { proto: 'tcp', addr: '0.0.0.0', port: 80, process: 'docker-proxy', public: true }, { proto: 'tcp', addr: '0.0.0.0', port: 443, process: 'docker-proxy', public: true }, { proto: 'tcp', addr: '0.0.0.0', port: 8000, process: 'docker-proxy', public: true }, { proto: 'tcp', addr: '127.0.0.1', port: 3000, process: 'docker-proxy', public: false }],
        firewall: { active: true, tcp: ['22', '80', '443', '8000'], udp: [] },
        draupnode: { markers: [{ draupnode: '0.41.0', at: new Date(Date.now() - 40 * 86400000).toISOString(), nombre: 'Copias', plantilla: 'Copias diarias', slug: 'copias', modulos: [{ id: 'docker', values: {} }, { id: 'backups', values: {} }] }], secretDirs: ['copias'], appDirs: [] },
        software: [{ module: 'docker', active: true }, { module: 'nginx', active: true }, { module: 'coolify', active: true }, { module: 'backups', active: true }],
        backups: [{ slug: 'copias', ok: true, running: false, ago: lab ? 3 * 3600 : 30 * 3600 }],
        updates: lab ? { total: 0, security: 0, reboot: false, packages: [] } : { total: 12, security: 3, reboot: true, packages: ['openssl', 'libssl3', 'linux-image-generic', 'curl'], rebootFor: ['linux-image-6.8.0-52-generic'] },
        clock: { synced: true, known: true, timezone: 'Europe/Madrid' },
        security: lab ? { failed24h: 0, ips: 0, top: [], fail2ban: null } : { failed24h: 412, ips: 37, top: [{ ip: '198.51.100.23', count: 96 }, { ip: '203.0.113.77', count: 41 }], fail2ban: { banned: 6, total: 58 } },
        certs: lab ? [] : [{ domain: 'estado.ejemplo.com', days: 12, issuer: "Let's Encrypt" }],
        history: mockHistory(lab),
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
      for (const d of MOCK_MODULES.find((x) => x.id === id.split('@')[0])?.depends ?? []) visit(d)
      order.push(id)
    }
    ;[...want].sort().forEach(visit)
    const errors: ProjectCheck['errors'] = {}
    for (const pm of p.modules) {
      const m = MOCK_MODULES.find((x) => x.id === pm.id.split('@')[0])
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
  {"id":"firewall","name":"Cortafuegos (iptables)","version":"1.0.0","category":"1 · Sistema","description":"Abre en el cortafuegos del servidor los puertos TCP indicados y guarda las reglas para que sobrevivan a un reinicio.","details":"Usa iptables + netfilter-persistent, que es lo que traen las imágenes de Ubuntu\nde Oracle Cloud (su INPUT acaba en REJECT, así que hay que abrir cada puerto).\nEn Oracle Cloud abre también los mismos puertos en la «Security List» de la VCN:\neso es un cortafuegos aparte, fuera del servidor.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"firewall_tcp_ports","label":"Puertos TCP abiertos","help":"El 22 (SSH) se abre siempre aunque no esté en la lista.","type":"list","default":["22","80","443"],"pattern":"^([1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$","patternHelp":"Número de puerto entre 1 y 65535"}],"links":[{"label":"iptables (netfilter)","url":"https://www.netfilter.org/projects/iptables/"},{"label":"Código fuente","url":"https://git.netfilter.org/iptables/"}],"uninstallable":true,"uninstallWarning":"Quita las reglas que abrió Draupnode en iptables (salvo el SSH, para no perder la conexión). Las demás reglas del servidor no se tocan.","prueba":{"lab":"Sí (el contenedor de pruebas tiene iptables).","pasos":["Añade «Cortafuegos» con los puertos 22, 80 y 443 y aplica.","Añade después otro puerto (por ejemplo 8080), aplica, y luego quítalo y aplica otra vez."],"comprobar":["Ficha → Red y seguridad: «El cortafuegos deja pasar» enseña 22/tcp, 80/tcp y 443/tcp.","En «Terminal»: «sudo iptables -S INPUT» tiene las reglas con la etiqueta draupnode y «/etc/iptables/rules.v4» las guarda.","El SSH sigue funcionando (la ficha se sigue leyendo) y el 8080 aparece y desaparece al añadirlo y quitarlo."],"necesita":["Los puertos TCP que quieres abiertos, uno por línea. Los que necesitan otros módulos (80/443 de Caddy o nginx, 8000 de Coolify…) se añaden solos al marcarlos.","Deja siempre el del SSH (22 o el que pongas en «SSH seguro»): Draupnode no te deja quitarlo."],"problemas":["Un puerto abierto aquí no se ve desde fuera → el proveedor de nube (Oracle, AWS…) tiene su propio cortafuegos: ábrelo también en su panel (la ficha avisa si lo detecta).","Un puerto de Docker se ve desde fuera aunque no esté en la lista → lo que publica Docker se salta iptables; publica las apps solo en 127.0.0.1 (los módulos ya lo hacen) y entra por Caddy/nginx o el túnel."]},"source":"builtin","files":["handlers/main.yml","tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"chrony","name":"Hora exacta (chrony)","version":"1.0.0","category":"1 · Sistema","description":"Mantiene la hora del servidor exacta al segundo. Importa para los certificados, los registros, las copias y el doble factor (códigos TOTP).","details":"Instala chrony (GPL-2.0), el cliente de hora de Red Hat, Debian y las\nUbuntu nuevas: sustituye a systemd-timesyncd y corrige la hora poco a\npoco, sin saltos. Usa los servidores de hora indicados además de los\nque trae el sistema.\nOpcional: cambia la zona horaria del servidor (vacío = no la toca).\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"chrony_servers","label":"Servidores de hora","help":"Uno por línea. Los «pool» de ntp.org reparten entre muchos servidores voluntarios.","type":"list","default":["es.pool.ntp.org","pool.ntp.org"],"pattern":"^[A-Za-z0-9.-]+$","patternHelp":"Un nombre de servidor (time.ejemplo.com)"}],"links":[{"label":"Web oficial","url":"https://chrony-project.org"},{"label":"Código fuente","url":"https://gitlab.com/chrony/chrony"}],"uninstallable":true,"uninstallWarning":"Quita chrony y vuelve a dejar systemd-timesyncd (el de serie de Ubuntu) para que la hora se siga ajustando.","prueba":{"lab":"No: dentro del contenedor de pruebas chrony cambiaría la hora de TU equipo (comparten reloj). Pruébalo en una máquina virtual o en un servidor.","pasos":["Añade «Hora exacta» con los servidores de serie y aplica.","Cambia los servidores de hora (por ejemplo time.cloudflare.com) y aplica otra vez."],"comprobar":["Ficha → Resumen → Sistema: la hora sale sincronizada.","En «Terminal»: «chronyc sources» enseña los servidores elegidos, alguno con «*» o «+»."],"necesita":["Nada: los servidores de hora de serie valen."],"problemas":["«chronyc sources» sin ningún «*» → el proveedor bloquea la salida al puerto 123/UDP: usa el servidor de hora del proveedor (por ejemplo 169.254.169.254 en algunas nubes)."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"ssh","name":"SSH seguro + fail2ban","version":"1.0.0","category":"1 · Sistema","description":"Cierra el SSH a lo imprescindible (sin root, sin contraseñas, pocos intentos) y bloquea con fail2ban a quien pruebe contraseñas.","details":"Escribe /etc/ssh/sshd_config.d/01-draupnode.conf (manda sobre el resto, como\nel 50-cloud-init.conf que pone PasswordAuthentication yes) y lo comprueba con\n«sshd -t» antes de recargar: si algo está mal, lo deja como estaba.\nPara que no te quedes fuera, Draupnode no te deja quitar la contraseña si\nentra con ella, ni prohibir root si entra como root, y al aplicar comprueba\nque tu usuario tiene una clave autorizada.\nfail2ban nunca bloquea la IP desde la que te conectas.\nSi cambias el puerto, se abre en el Cortafuegos antes de cambiar el SSH y\nDraupnode actualiza el servidor al terminar. En Oracle Cloud ábrelo también\nen la Security List ANTES de aplicar. El 22 queda abierto en el Cortafuegos\nhasta que lo quites tú.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"ssh_port","label":"Puerto SSH","help":"22 es el habitual. Cambiarlo reduce el ruido de los robots, no es seguridad de verdad.","type":"int","default":22,"min":1,"max":65535},{"name":"ssh_password_auth","label":"Permitir entrar con contraseña","help":"Desmarcado = solo con clave SSH (lo recomendado).","type":"bool","default":false},{"name":"ssh_root_login","label":"Entrar como root","help":"«no» = nadie entra como root (se usa sudo). «solo-con-clave» = root sí, pero nunca con contraseña.","type":"select","default":"no","options":["no","solo-con-clave"]},{"name":"ssh_allow_users","label":"Solo pueden entrar estos usuarios","help":"Uno por línea. Vacío = cualquier usuario con clave.","type":"list","default":[],"pattern":"^[a-z_][a-z0-9_.-]{0,31}$","patternHelp":"Nombre de usuario de Linux (minúsculas, números, _ . -)"},{"name":"ssh_max_auth_tries","label":"Intentos por conexión","type":"int","default":4,"min":2,"max":10},{"name":"ssh_fail2ban","label":"Instalar fail2ban","type":"bool","default":true},{"name":"ssh_fail2ban_maxretry","label":"Fallos antes de bloquear","type":"int","default":5,"min":2,"max":20},{"name":"ssh_fail2ban_bantime","label":"Tiempo de bloqueo","help":"Quien reincide se bloquea una semana (cárcel «recidive»).","type":"select","default":"1h","options":["10m","1h","1d","1w"]},{"name":"ssh_fail2ban_ignore","label":"IPs que nunca se bloquean","help":"Además de la tuya, que se añade sola. Una por línea (IP o red, p. ej. 203.0.113.0/24).","type":"list","default":[],"pattern":"^[0-9A-Fa-f:.]+(/[0-9]{1,3})?$","patternHelp":"Una IP o una red (203.0.113.7 o 203.0.113.0/24)"}],"firewallPortsFrom":["ssh_port"],"links":[{"label":"OpenSSH","url":"https://www.openssh.com"},{"label":"Código fuente de OpenSSH","url":"https://github.com/openssh/openssh-portable"},{"label":"fail2ban","url":"https://github.com/fail2ban/fail2ban"}],"after":["firewall"],"uninstallable":true,"uninstallWarning":"Quita el endurecimiento y fail2ban. El SSH NO se desinstala (es por donde se conecta Draupnode) - vuelve a su configuración de antes; si el servidor la traía así, puede volver a aceptar contraseñas.","prueba":{"lab":"Sí. Déjalo en el puerto 22 en el servidor de pruebas para no perder la conexión.","pasos":["Añade «SSH seguro + fail2ban» con el puerto 22, sin contraseñas y sin root, y aplica.","Desde una terminal de tu equipo, intenta entrar con contraseña: «ssh -p 2222 -o PubkeyAuthentication=no ubuntu@127.0.0.1»."],"comprobar":["Draupnode sigue entrando con la clave (la ficha se lee).","El intento con contraseña se rechaza («Permission denied (publickey)»).","Ficha → Red y seguridad: sale fail2ban activo; en «Terminal», «sudo fail2ban-client status sshd» lo confirma."],"necesita":["Nada para empezar: sin contraseñas, sin root y fail2ban activado.","Si cambias el puerto: ábrelo antes en el cortafuegos del proveedor de nube. «Solo pueden entrar estos usuarios», uno por línea; vacío = cualquiera con clave."],"problemas":["Después de aplicar no entra nadie con contraseña → es lo esperado: entra con tu clave SSH.","Cambiaste el puerto y Draupnode ya no conecta → el proveedor de nube lo tiene cerrado; ábrelo en su panel o vuelve al 22 desde su consola.","fail2ban te ha bloqueado tu propia IP → pon tu IP en «IPs que nunca se bloquean»; mientras, entra desde otra red o espera al tiempo de bloqueo (1 h)."]},"source":"builtin","files":["handlers/main.yml","tasks/main.yml","tasks/uninstall.yml","templates/01-draupnode.conf.j2","templates/jail-draupnode.local.j2"]},
  {"id":"base","name":"Sistema base","version":"1.0.0","category":"1 · Sistema","description":"Paquetes básicos, zona horaria, memoria de intercambio (swap) y actualizaciones de seguridad automáticas.","details":"Espera a que apt quede libre (en un servidor recién creado suele estar ocupado\ncon actualizaciones), instala los paquetes indicados, fija la zona horaria,\ncrea /swapfile si se pide y activa unattended-upgrades para los parches de seguridad.\n","depends":null,"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"base_packages","label":"Paquetes a instalar","type":"list","default":["curl","ca-certificates","gnupg","jq","openssl","python3","logrotate","htop","unzip"],"pattern":"^[a-z0-9][a-z0-9.+-]*$","patternHelp":"Nombre de paquete apt (minúsculas, números, . + -)"},{"name":"base_timezone","label":"Zona horaria","type":"string","default":"Europe/Madrid","pattern":"^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$","patternHelp":"Formato Región/Ciudad, p. ej. Europe/Madrid"},{"name":"base_swap_mb","label":"Swap (MB)","help":"Memoria de intercambio en /swapfile. 0 = no crear. Útil en servidores con poca RAM.","type":"int","default":2048,"min":0,"max":65536},{"name":"base_auto_updates","label":"Actualizaciones de seguridad automáticas","type":"bool","default":true}],"links":[{"label":"Ubuntu Server (documentación)","url":"https://ubuntu.com/server/docs"},{"label":"Debian","url":"https://www.debian.org"},{"label":"Actualizaciones automáticas (unattended-upgrades)","url":"https://github.com/mvo5/unattended-upgrades"}],"uninstallable":false,"noUninstall":"son los paquetes y ajustes básicos del sistema (zona horaria, swap, actualizaciones de seguridad); otros programas los usan y quitarlos podría romperlos.","prueba":{"lab":"Sí. En un contenedor no se crea el swap (usa el del equipo) y lo dice en una nota.","pasos":["En «Servidor de pruebas», «Crear y arrancar» y «Dar de alta en Draupnode». Abre su ficha → Módulos.","Añade «Sistema base» (Europe/Madrid, paquetes por defecto) y pulsa «Simular»: deben salir cambios y 0 fallos.","Pulsa «Aplicar». Después, «Simular» otra vez."],"comprobar":["La aplicación termina con 0 fallos y la segunda simulación dice 0 cambios (todo está como se pidió).","En «Terminal»: «timedatectl» enseña Europe/Madrid y «htop --version» responde.","«systemctl status unattended-upgrades» está activo (actualizaciones de seguridad automáticas)."],"necesita":["Nada: funciona con los valores por defecto. Revisa la zona horaria (formato Región/Ciudad, p. ej. Europe/Madrid).","Swap: 2048 MB por defecto; en servidores con poca RAM (1 GB) súbelo. 0 = no crear."],"problemas":["Tarda o se queda en «Esperar a que apt quede libre» → un servidor recién creado se está actualizando solo; espera unos minutos y vuelve a aplicar.","«Swap omitido: el servidor es un contenedor» → normal en el servidor de pruebas; en un VPS de verdad sí se crea."]},"source":"builtin","files":["tasks/main.yml"]},
  {"id":"wireguard","name":"WireGuard (VPN)","version":"1.0.0","category":"1 · Sistema","description":"Tu propia VPN. Con ella entras al servidor como si estuvieras en su red, para ver paneles (Grafana, Cockpit…) sin abrirlos a internet.","details":"WireGuard (GPL-2) del sistema, con la interfaz wg0. Cada nombre de\n«Dispositivos» (portátil, móvil…) tiene su configuración: se genera EN el\nservidor la primera vez, con su propia clave, y Draupnode la trae a tu\nbóveda. En la página de este módulo la ves con su código QR (para la app\nde WireGuard del móvil) o la guardas como .conf (para el ordenador).\nQuitar un nombre de la lista le quita el acceso.\nAbre el puerto UDP elegido en iptables (si lo hay). En Oracle Cloud ábrelo\ntambién en la Security List, como UDP.\nCon «Todo el tráfico por la VPN», el dispositivo sale a internet a través\ndel servidor (útil en una wifi pública); si no, solo va por la VPN lo que\nes para el servidor.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"wireguard_peers","label":"Dispositivos","help":"Uno por línea (portatil, movil…). Cada uno tiene su clave y su dirección en la VPN.","type":"list","default":["portatil","movil"],"pattern":"^[a-z0-9][a-z0-9-]{0,30}$","patternHelp":"Minúsculas, números y guiones"},{"name":"wireguard_port","label":"Puerto UDP","type":"int","default":51820,"min":1024,"max":65535},{"name":"wireguard_network","label":"Red de la VPN","help":"Una red privada /24 que no use tu casa ni el servidor. El servidor es la .1.","type":"string","default":"10.8.0.0/24","pattern":"^(10|172|192)\\.[0-9]{1,3}\\.[0-9]{1,3}\\.0/24$","patternHelp":"Una red /24 privada, p. ej. 10.8.0.0/24"},{"name":"wireguard_endpoint","label":"Dirección pública del servidor","help":"Por la que se conectan los dispositivos. Vacío = la misma con la que entra Draupnode.","type":"string","default":"","pattern":"^[A-Za-z0-9.:-]*$","patternHelp":"IP o nombre, sin puerto"},{"name":"wireguard_route_all","label":"Todo el tráfico por la VPN","help":"El dispositivo sale a internet a través del servidor.","type":"bool","default":false},{"name":"wireguard_dns","label":"DNS para los dispositivos","help":"Vacío = el suyo de siempre. Con AdGuard Home en el servidor se pone solo (la .1 de la VPN). Ejemplo 9.9.9.9.","type":"string","default":"","pattern":"^([0-9.]+(, *[0-9.]+)*)?$","patternHelp":"IPs separadas por comas"}],"udpPortsFrom":["wireguard_port"],"links":[{"label":"Web oficial","url":"https://www.wireguard.com"},{"label":"Apps para móvil y ordenador","url":"https://www.wireguard.com/install/"},{"label":"Código fuente","url":"https://git.zx2c4.com/wireguard-tools/"}],"secrets":[{"file":"wireguard_*.conf","label":"Configuración WireGuard del dispositivo"}],"uninstallable":true,"uninstallWarning":"Para la VPN y quita la interfaz wg0. Los dispositivos dejan de poder conectarse.","uninstallData":"Borrar también las claves del servidor y de los dispositivos (si lo reinstalas, habrá que volver a configurarlos todos).","prueba":{"lab":"Sí: el contenedor de pruebas usa el núcleo de tu equipo, que trae WireGuard. Para conectar de verdad desde un dispositivo hace falta un servidor accesible desde fuera (puerto UDP 51820).","pasos":["Añade «WireGuard (VPN)» con los dispositivos portatil y movil y aplica.","En la página del módulo, «Ver configuraciones»: está la de cada dispositivo y su código QR.","En «Terminal»: «sudo wg show»."],"comprobar":["wg show enseña la interfaz wg0 con 10.8.0.1 y un peer por dispositivo.","En un servidor público: con la app WireGuard del móvil y el QR, conectas y «ping 10.8.0.1» responde."],"necesita":["Los dispositivos, uno por línea (portatil, movil…): cada uno tendrá su configuración y su QR en «Ver configuraciones».","El puerto UDP 51820 abierto en el cortafuegos del proveedor de nube (el de Draupnode solo maneja TCP).","«Dirección pública del servidor»: vacía = la que usa Draupnode para entrar; si entras por una IP privada o un túnel, pon la pública."],"problemas":["El móvil conecta pero no hay tráfico («handshake» que no llega) → el 51820/UDP está cerrado en el proveedor de nube, o la dirección pública no es la buena.","Sin internet con la VPN puesta → «Todo el tráfico por la VPN» necesita que el servidor salga a internet; desactívalo si solo quieres llegar a los paneles."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/peer.conf.j2","templates/wg0.conf.j2"]},
  {"id":"docker","name":"Docker","version":"1.0.0","category":"2 · Contenedores","description":"Instala Docker Engine con el script oficial, lo deja arrancado y da permisos a tu usuario.","details":"Si se marca «almacenamiento clásico», desactiva el image store de containerd\nANTES de que se descarguen imágenes. Sin eso cAdvisor no puede medir CPU/RAM\npor contenedor en Grafana. Si Coolify ya está instalado no se toca, porque\ncambiarlo después dejaría sus contenedores sin arrancar.\n","depends":["base"],"requires":{"os":["ubuntu","debian"],"minRamMb":900,"minDiskGb":10},"variables":[{"name":"docker_classic_storage","label":"Almacenamiento clásico overlay2","help":"Necesario para ver CPU/RAM por contenedor en la monitorización.","type":"bool","default":true},{"name":"docker_users","label":"Otros usuarios en el grupo docker","help":"Tu usuario de conexión se añade siempre.","type":"list","default":[],"pattern":"^[a-z_][a-z0-9_-]{0,31}$","patternHelp":"Nombre de usuario de Linux"}],"links":[{"label":"Web oficial","url":"https://www.docker.com"},{"label":"Documentación","url":"https://docs.docker.com"},{"label":"Código fuente (Moby)","url":"https://github.com/moby/moby"}],"uninstallable":true,"uninstallWarning":"Para y desinstala Docker. Se paran TODOS los contenedores del servidor, también los que no instaló Draupnode.","uninstallData":"Borrar también /var/lib/docker y /var/lib/containerd (imágenes, contenedores y volúmenes de TODAS las apps). Sin esto, si reinstalas Docker vuelve a estar todo.","prueba":{"lab":"Sí (Docker dentro de Docker, con sus datos en un volumen aparte).","pasos":["Añade «Docker» y aplica.","En «Terminal»: «docker run --rm hello-world»."],"comprobar":["El contenedor de prueba dice «Hello from Docker!» sin usar sudo (tu usuario está en el grupo docker).","La ficha enseña la pestaña Contenedores con su contador y «Limpiar Docker…»."],"necesita":["Nada. Tu usuario de conexión se añade al grupo docker; añade otros en «Otros usuarios en el grupo docker».","Deja activado «Almacenamiento clásico overlay2» si vas a usar Monitorización (si no, no se ve la CPU/RAM de cada contenedor)."],"problemas":["«permission denied … docker.sock» al usar docker en la Terminal → abre una Terminal nueva (el grupo se aplica al entrar de nuevo).","«no space left on device» → Ficha → Contenedores → «Limpiar Docker…»."]},"source":"builtin","files":["handlers/main.yml","tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"portainer","name":"Portainer (panel de Docker)","version":"1.0.0","category":"2 · Contenedores","description":"Un panel web para ver y manejar Docker: contenedores, imágenes, volúmenes, redes, registros y stacks de Compose.","details":"Portainer Community Edition (la libre) en Docker. Draupnode crea el\nusuario «admin» con una contraseña generada en el servidor (en\n«Contraseñas»).\nOJO: Portainer maneja Docker entero, que equivale a ser root en el\nservidor. Mejor sin dominio: entra con «Abrir» (túnel SSH) o por la VPN.\nSus datos están en /srv/draupnode/apps/portainer (entran en las copias del\nmódulo Copias). Licencia: zlib (edición Community).\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"portainer_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":9010,"min":1024,"max":65535},{"name":"portainer_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"portainer_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"portainer_update","label":"Actualizar Portainer al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["portainer_public_port"],"proxySite":{"domain":"portainer_domain","port":"portainer_port"},"links":[{"label":"Documentación","url":"https://docs.portainer.io"},{"label":"Código fuente","url":"https://github.com/portainer/portainer"}],"secrets":[{"file":"portainer_admin","label":"Usuario «admin» de Portainer"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Portainer.","uninstallData":"Borrar también sus datos (su configuración, usuarios y stacks guardados (tus contenedores no se tocan)). No se puede deshacer.","prueba":{"lab":"Sí.","pasos":["Añade «Portainer» y aplica.","Pulsa «Abrir (túnel SSH)» y entra con «admin» y la contraseña de «Contraseñas»."],"comprobar":["El panel enseña el entorno «local» con los contenedores del servidor (los dn-…).","Desde Portainer puedes ver los registros de un contenedor y reiniciarlo."],"necesita":["Nada: el usuario «admin» y su contraseña los crea Draupnode."],"problemas":["Pide crear el administrador o dice que ha caducado → Portainer solo lee la contraseña la primera vez: desinstálalo con «borrar también los datos» y vuelve a aplicar.","Maneja todo Docker (es como ser root): no le pongas dominio sin necesidad; entra por el túnel o la VPN."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"registry","name":"Registro de imágenes Docker","version":"1.0.0","category":"2 · Contenedores","description":"Tu propio Docker Hub privado: guarda tus imágenes en el servidor y descárgalas desde tus equipos o tu CI con usuario y contraseña.","details":"El registro oficial de Docker (CNCF Distribution 3) con usuario y\ncontraseña (generada en el servidor, en «Contraseñas»).\nPara usarlo desde otros equipos ponle dominio (Caddy o nginx) y haz\n«docker login tu-dominio»: Docker solo habla con registros con HTTPS\n(salvo 127.0.0.1). Las imágenes se guardan en\n/srv/draupnode/apps/registry/data (pueden ocupar mucho).\nSus datos están en /srv/draupnode/apps/registry (entran en las copias del\nmódulo Copias). Licencia: Apache-2.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"registry_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":5000,"min":1024,"max":65535},{"name":"registry_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"registry_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"registry_user","label":"Usuario","help":"Con este usuario y la contraseña generada se hace «docker login».","type":"string","default":"draupnode","pattern":"^[a-z][a-z0-9_-]{2,30}$","patternHelp":"Minúsculas, números, - y _"},{"name":"registry_update","label":"Actualizar el registro al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["registry_public_port"],"proxySite":{"domain":"registry_domain","port":"registry_port"},"links":[{"label":"Documentación","url":"https://distribution.github.io/distribution/"},{"label":"Código fuente","url":"https://github.com/distribution/distribution"}],"secrets":[{"file":"registry_usuario","label":"Usuario del registro de imágenes"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Registro de Docker.","uninstallData":"Borrar también sus datos (todas las imágenes subidas). No se puede deshacer.","prueba":{"lab":"Sí.","pasos":["Añade «Registro de imágenes Docker» y aplica.","En «Terminal»: «sudo docker login 127.0.0.1:5000 -u draupnode» (contraseña en «Contraseñas»), «sudo docker pull busybox», «sudo docker tag busybox 127.0.0.1:5000/prueba/busybox:1» y «sudo docker push 127.0.0.1:5000/prueba/busybox:1»."],"comprobar":["«docker login» dice «Login Succeeded» y el push termina.","«curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/v2/_catalog» sin usuario devuelve 401."],"necesita":["Nada para probarlo en el servidor. Para usarlo desde otros equipos, un dominio con Caddy o nginx (Docker exige HTTPS)."],"problemas":["«http: server gave HTTP response to HTTPS client» desde otro equipo → ponle dominio (Caddy/nginx) y usa «docker login tu-dominio».","Al subir imágenes grandes por nginx falla con «413» → sube el tamaño máximo de petición en nginx."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"caddy","name":"Caddy (web y HTTPS automático)","version":"1.0.0","category":"3 · Plataformas","description":"Publica tus apps en tu dominio con HTTPS. Caddy pide y renueva solo los certificados de Let's Encrypt.","details":"Caddy (Apache-2) del repositorio de Ubuntu/Debian, como servicio del sistema.\nCada línea de «Sitios» es «dominio destino»:\n  fotos.ejemplo.com 127.0.0.1:2283      → reenvía a la app de ese puerto\n  blog.ejemplo.com /srv/www/blog        → sirve esa carpeta (web estática)\nEl dominio tiene que apuntar ya a la IP de este servidor (registro A/AAAA)\ny los puertos 80 y 443 tienen que estar abiertos (se añaden al Cortafuegos):\nasí Caddy consigue el certificado él solo. Mientras el DNS no apunte, ese\nsitio no tendrá HTTPS (los demás sí). Un dominio terminado en .localhost\nusa un certificado propio de Caddy (para pruebas).\nAntes de recargar se comprueba la configuración: si tiene un error, se\nqueda la anterior funcionando.\nNo puede ir con Coolify ni con nginx: los tres quieren los puertos 80 y 443.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"caddy_sites","label":"Sitios","help":"Una línea por sitio: «dominio destino». Destino = 127.0.0.1:PUERTO (una app) o /carpeta (web estática).","type":"list","default":[],"pattern":"^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}[ ]+(((https?://)?[A-Za-z0-9.-]+:[0-9]{1,5})|(/[A-Za-z0-9._/-]+))$","patternHelp":"Ejemplo: fotos.ejemplo.com 127.0.0.1:2283","placeholder":"fotos.ejemplo.com 127.0.0.1:2283"},{"name":"caddy_email","label":"Correo para Let's Encrypt","help":"Opcional. Te avisan si un certificado no se puede renovar.","type":"string","default":"","pattern":"^([^@\\s]+@[^@\\s]+\\.[^@\\s]+)?$","patternHelp":"Un correo válido o vacío"},{"name":"caddy_compress","label":"Comprimir las respuestas (gzip/zstd)","type":"bool","default":true},{"name":"caddy_security_headers","label":"Cabeceras de seguridad","help":"HSTS, no dejar meter la web en un marco de otra, no adivinar tipos de fichero…","type":"bool","default":true}],"firewallPorts":[80,443],"links":[{"label":"Web oficial","url":"https://caddyserver.com"},{"label":"Documentación","url":"https://caddyserver.com/docs/"},{"label":"Código fuente","url":"https://github.com/caddyserver/caddy"}],"conflicts":["coolify","nginx"],"uninstallable":true,"uninstallWarning":"Desinstala Caddy. Tus sitios dejan de verse por su dominio; las apps de detrás siguen en marcha.","uninstallData":"Borrar también los certificados que había conseguido Caddy (/var/lib/caddy). Si lo reinstalas, los vuelve a pedir.","prueba":{"lab":"Sí, pero sin Let's Encrypt (el servidor de pruebas no es accesible desde internet): usa un dominio .localhost y Caddy firma su propio certificado. Con un dominio real, el certificado de verdad se prueba en un servidor público.","pasos":["Instala antes algo que escuche, por ejemplo «Vaultwarden» (puerto 8222).","Añade «Caddy» con el sitio «vault.localhost 127.0.0.1:8222» y aplica.","En «Terminal»: «curl -sk --resolve vault.localhost:443:127.0.0.1 https://vault.localhost -o /dev/null -w '%{http_code}\\n'»."],"comprobar":["La orden devuelve 200: Caddy sirve la app por HTTPS.","Ficha → Apps y bases: sale el sitio vault.localhost (Caddy).","Un segundo «Aplicar» no cambia nada."],"necesita":["Los sitios, uno por línea: «dominio destino». Destino = 127.0.0.1:PUERTO (una app) o /carpeta (web estática). Los módulos de apps con dominio se añaden solos.","Para HTTPS de verdad: el dominio tiene que apuntar a la IP del servidor y los puertos 80 y 443 abiertos (también en el cortafuegos del proveedor). Correo opcional, para avisos de renovación."],"problemas":["El certificado no sale («obtaining certificate» / «challenge failed») → el dominio no apunta a este servidor todavía, o el 80/443 están cerrados en el proveedor de nube.","«Caddy y nginx no pueden ir juntos» → elige uno de los dos.","Responde 502 → la app de destino no está escuchando en ese puerto (míralo en Apps y bases → Uso por app)."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/Caddyfile.j2"]},
  {"id":"coolify","name":"Coolify","version":"1.0.0","category":"3 · Plataformas","description":"Panel para desplegar tus apps desde GitHub/GitLab con dominio y HTTPS automáticos (proxy Traefik + Let's Encrypt).","details":"Instala Coolify con su instalador oficial.\nSi pones un correo de administrador, Draupnode crea ese usuario al instalar con\nuna contraseña generada en el propio servidor (se guarda en\n/etc/draupnode/secretos/\u003cproyecto\u003e/coolify_admin, solo root). Si lo dejas vacío,\nentra ENSEGUIDA en http://IP:8000 y crea tu usuario: el primero que entre se\nqueda de administrador (hay 10 minutos).\nEstas dos opciones solo cuentan en la primera instalación; después se cambian\ndesde el panel de Coolify.\nAl marcarlo se añaden a la lista del Cortafuegos los puertos de su panel\n(8000, 6001 y 6002); quítalos de ahí cuando el panel tenga dominio propio.\nEn Oracle Cloud ábrelos también en la Security List.\n","depends":["docker","firewall"],"requires":{"os":["ubuntu","debian"],"minRamMb":1800,"minDiskGb":30},"variables":[{"name":"coolify_admin_email","label":"Correo del administrador","help":"Vacío = el primero que entre al panel crea el administrador.","type":"string","default":"","pattern":"^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$","patternHelp":"Un correo válido (nombre@dominio.ext)","placeholder":"tu@ejemplo.com"},{"name":"coolify_admin_user","label":"Nombre del administrador","type":"string","default":"admin","pattern":"^[A-Za-z0-9._-]{3,40}$","patternHelp":"3 a 40 letras, números, . _ o -"},{"name":"coolify_autoupdate","label":"Actualizaciones automáticas","help":"Coolify se actualiza solo a cada versión nueva. Desactívalo si prefieres actualizar tú desde el panel.","type":"bool","default":true}],"firewallPorts":[8000,6001,6002],"links":[{"label":"Web oficial","url":"https://coolify.io"},{"label":"Documentación","url":"https://coolify.io/docs"},{"label":"Código fuente","url":"https://github.com/coollabsio/coolify"}],"secrets":[{"file":"coolify_admin","label":"Administrador de Coolify"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Coolify (panel, base de datos, proxy). Las apps que desplegaste con Coolify dejan de verse por su dominio, porque su proxy se quita; sus contenedores no se borran.","uninstallData":"Borrar también /data/coolify y sus volúmenes (la configuración del panel, usuarios, claves SSH y copias). Sin esto, si reinstalas Coolify vuelve todo como estaba.","prueba":{"lab":"Sí. Necesita 2 GB de RAM y 30 GB de disco; en el servidor de pruebas su panel está en http://127.0.0.1:18000.","pasos":["Añade «Coolify» (trae Docker y el Cortafuegos), pon tu correo como administrador y aplica (tarda unos minutos).","Mira la contraseña del administrador en la página del módulo → Contraseñas.","Abre http://127.0.0.1:18000 desde tu navegador."],"comprobar":["El panel de Coolify carga y entras con tu correo y esa contraseña.","Ficha → Apps y bases: sale «Panel de Coolify»; las apps que publiques en Coolify aparecen ahí con su dirección."],"necesita":["Pon tu correo en «Correo del administrador»: si lo dejas vacío, el primero que abra el panel (puerto 8000, abierto a internet) se queda con la cuenta de administrador.","2 GB de RAM y 30 GB de disco como mínimo. No puede ir con Caddy ni nginx (los tres quieren los puertos 80 y 443)."],"problemas":["«Hacen falta 1800 MB de RAM…» → el servidor es pequeño para Coolify.","El panel no carga desde fuera → abre el 8000 en el cortafuegos del proveedor de nube (el Cortafuegos de Draupnode ya lo abre).","«Caddy y Coolify no pueden ir juntos» → quita Caddy/nginx: Coolify trae su propio proxy (Traefik)."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"git-app","name":"Tu app (Git o carpeta)","version":"1.0.0","category":"3 · Plataformas","description":"Despliega tu app con su docker-compose.yml (por ejemplo, el que genera Docker Creator), desde un repositorio de Git o desde una carpeta de este equipo. Al aplicar, la actualiza.","details":"Clona el repositorio en /srv/draupnode/apps/\u003cnombre\u003e y la arranca con\n«docker compose up -d --build». Cada vez que aplicas, trae lo último de la\nrama y la vuelve a construir (solo se reinicia lo que cambia).\nRepositorio privado, dos formas:\n- Con la dirección https:// y un «Token de acceso» de solo lectura (GitHub:\n  Fine-grained token con «Contents: Read-only» solo para ese repositorio).\n  Se guarda cifrado en tu bóveda; en el servidor no queda escrito.\n- Con la dirección SSH (git@github.com:usuario/repo.git): Draupnode crea una\n  «deploy key» en el servidor; la ves en «Contraseñas» y la añades en tu\n  GitHub/GitLab/Forgejo (Settings → Deploy keys, solo lectura).\nVariables (.env): las normales, una por línea «CLAVE=valor»; las que deben\nser secretas y al azar (SECRET_KEY, DB_PASSWORD…), en «Generar en el\nservidor»: se crean una vez y no cambian.\nDominio: con Caddy o nginx en el servidor, se añade solo a sus sitios.\nUna app por plantilla: para otra, asocia otra plantilla al mismo servidor.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"git_app_source","label":"De dónde sale el código","help":"«git» = de un repositorio (GitHub, GitLab, Forgejo…). «carpeta» = de una carpeta de este equipo: Draupnode la sube al servidor cada vez que aplicas (no hace falta saber git).","type":"select","default":"git","options":["git","carpeta"]},{"name":"git_app_local_dir","label":"Carpeta en este equipo","help":"Solo con «carpeta»: la del proyecto, con su docker-compose (Docker Creator lo genera). Se sube sin .git, .env, entornos virtuales ni node_modules (ni lo que diga su .dockerignore).","type":"string","default":""},{"name":"git_app_repo","label":"Repositorio","help":"Solo con «git»: https://github.com/usuario/repo.git (público, o privado con el token de abajo) o git@github.com:usuario/repo.git (privado, con deploy key).","type":"string","default":null,"pattern":"^(https://[A-Za-z0-9._~:/?#@!$\u0026()*+,;=%-]+|[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._/~-]+)$","patternHelp":"Dirección https:// o git@servidor:usuario/repo.git"},{"name":"git_app_token","label":"Token de acceso (solo si el repositorio es privado)","help":"Para una dirección https:// de un repositorio privado. En GitHub: Settings → Developer settings → Personal access tokens → Fine-grained tokens, solo este repositorio y permiso «Contents: Read-only» (en GitLab/Forgejo, un token con lectura del repositorio). Se guarda cifrado en tu bóveda y no se queda escrito en el servidor. Si es público, déjalo vacío. Sin token: usa la dirección git@… y la deploy key.","type":"secret","default":null},{"name":"git_app_branch","label":"Rama","type":"string","default":"main","pattern":"^[A-Za-z0-9._/-]+$","patternHelp":"Nombre de rama"},{"name":"git_app_name","label":"Nombre de la app","help":"Para su carpeta y sus contenedores.","type":"string","default":"app","pattern":"^[a-z][a-z0-9-]{1,30}$","patternHelp":"Minúsculas, números y guiones"},{"name":"git_app_compose","label":"Fichero compose","help":"Dentro del repositorio.","type":"string","default":"docker-compose.yml","pattern":"^[A-Za-z0-9._/-]+\\.ya?ml$","patternHelp":"Ruta a un .yml"},{"name":"git_app_env","label":"Variables (.env)","help":"Las de tu app que no son secretas, una por fila (nombre y valor). Las resaltadas hay que completarlas o revisarlas antes de aplicar. Las contraseñas no van aquí: en «Generar en el servidor (secretos al azar)» o en «Variables secretas».","type":"list","default":[],"pattern":"^[A-Za-z_][A-Za-z0-9_]*=.*$","patternHelp":"CLAVE=valor"},{"name":"git_app_env_generate","label":"Generar en el servidor (secretos al azar)","help":"Nombres de variables, uno por línea (SECRET_KEY, DB_PASSWORD…). Se crean una vez y se guardan. Si la app exige un formato, añádelo con «:»: NOMBRE:fernet (clave de cryptography.Fernet), NOMBRE:base64-32 (32 bytes en Base64), NOMBRE:hex-32, NOMBRE:hex-64 (p. ej. SECRET_KEY_BASE de Rails), NOMBRE:laravel (APP_KEY de Laravel, «base64:…»). Sin nada: 40 letras y números.","type":"list","default":[],"pattern":"^[A-Za-z_][A-Za-z0-9_]*(:(fernet|base64-32|hex-32|hex-64|laravel))?$","patternHelp":"NOMBRE o NOMBRE:fernet / :base64-32 / :hex-32 / :hex-64 / :laravel"},{"name":"git_app_env_secret","label":"Variables secretas con valor tuyo","help":"Tokens o claves que ya tienes: «CLAVE=valor; OTRA=valor». Se guardan cifradas en tu bóveda.","type":"secret","default":null},{"name":"git_app_post_command","label":"Orden después de arrancar","help":"Se ejecuta cada vez que aplicas, dentro del servicio de abajo, con la app ya en marcha. Para preparar la base de datos: «./manage.py migrate» (Django), «php artisan migrate --force» (Laravel), «npx prisma migrate deploy»… Vacío = nada.","type":"string","default":""},{"name":"git_app_post_service","label":"Servicio donde se ejecuta la orden","help":"El nombre del servicio en el docker-compose (p. ej. web, app).","type":"string","default":"web","pattern":"^[A-Za-z0-9][A-Za-z0-9_.-]*$","patternHelp":"Nombre de un servicio del compose"},{"name":"git_app_owner","label":"Dueño de la carpeta de la app","help":"Si la app corre en el contenedor con un usuario que no es root y necesita escribir en su carpeta (error «Permission denied»), pon aquí su UID:GID, p. ej. 1000:1000. Vacío = la deja como está (de root).","type":"string","default":"","pattern":"^([0-9]{1,6}(:[0-9]{1,6})?)?$","patternHelp":"UID o UID:GID (números), o vacío"},{"name":"git_app_build_minutes","label":"Tiempo máximo para construir (minutos)","help":"Si la construcción tarda más, se para. También se para si pasa 10 minutos sin avanzar (sin escribir nada).","type":"int","default":30,"min":5,"max":240},{"name":"git_app_db","label":"Base de datos","help":"«propia» = la que traiga el docker-compose (o ninguna). «postgres-compartido» = el PostgreSQL compartido de este servidor: Draupnode lo añade si falta, crea una base y un usuario con el nombre de la app, conecta la app a su red y le pasa los datos (DATABASE_URL, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, POSTGRES_*, DB_DATABASE/DB_USERNAME de Laravel). Las que pongas tú en «Variables (.env)» mandan.","type":"select","default":"propia","options":["propia","postgres-compartido"]},{"name":"git_app_db_host","label":"Servidor del PostgreSQL compartido","type":"string","default":"pg-compartido","managed":true},{"name":"git_app_db_network","label":"Red del PostgreSQL compartido","type":"string","default":"apps","managed":true},{"name":"git_app_port","label":"Puerto de la app en el servidor","help":"El que publica tu compose (para el dominio y la comprobación). 0 = no comprobar.","type":"int","default":8000,"min":0,"max":65535},{"name":"git_app_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (tienda.ejemplo.com) o vacío"},{"name":"git_app_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal con dominio). Si no, se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"git_app_update","label":"Traer lo último de Git al aplicar","type":"bool","default":true}],"firewallPortsFrom":["git_app_public_port"],"proxySite":{"domain":"git_app_domain","port":"git_app_port"},"links":[{"label":"Git","url":"https://git-scm.com"},{"label":"Docker Compose","url":"https://docs.docker.com/compose/"},{"label":"Código de Compose","url":"https://github.com/docker/compose"}],"after":["postgres"],"secrets":[{"file":"git_app_*.pub","label":"Deploy key (añádela al repositorio, solo lectura)"},{"file":"git_app_env_*","label":"Valor generado para el .env"},{"file":"git_app_*_env_*","label":"Valor generado para el .env (otra app)"}],"uninstallable":true,"repeatable":true,"uninstallWarning":"Para y quita los contenedores de la app.","uninstallData":"Borrar también su carpeta, sus volúmenes de Docker (datos de la app y su base de datos) y sus valores generados.","prueba":{"lab":"Sí: es justo para lo que está el servidor de pruebas. Prueba con un repositorio público o con una carpeta de tu equipo.","pasos":["Con una carpeta de tu equipo: en Docker Creator elige la carpeta, «Guardar en la carpeta» y «Publicar en el servidor» con el servidor de pruebas; «Tu app» queda añadida con sus variables (la guía «Publicar tu app paso a paso» lo cuenta entero).","Con Git: añade «Tu app (Git o carpeta)» con «git» y un repositorio público, y pulsa «Leer el repositorio» para rellenar sus variables.","Revisa las variables resaltadas y pulsa «Simular» (comprueba el compose, las variables y los puertos sin tocar la app).","Pulsa «Aplicar» y luego «Abrir (túnel SSH)»."],"comprobar":["La app responde en el navegador y, si tiene base de datos, ha hecho sus migraciones.","Ficha → Apps y bases → Uso por app: sale con su CPU y memoria.","Cambia algo en tu proyecto, vuelve a aplicar y se actualiza."],"necesita":["De dónde sale el código: «git» con la dirección del repositorio (y un token de solo lectura o una deploy key si es privado) o «carpeta» con la de tu equipo. Tiene que tener un docker-compose.yml.","«Nombre de la app» (su carpeta y sus contenedores) y «Puerto de la app en el servidor»: el que publica tu compose en 127.0.0.1 (0 = no comprobar). Cada app del servidor, con un nombre y un puerto distintos.","Las variables de su .env («Leer el repositorio» o Docker Creator las rellenan); las contraseñas, en «Generar en el servidor (secretos al azar)». Si usa base de datos, «postgres-compartido» o la suya del compose."],"problemas":["«Permission denied» → la imagen no corre como root: pon su UID:GID en «Dueño de la carpeta de la app».","Responde pero da errores de base de datos → falta preparar la base: pon «Orden después de arrancar» (./manage.py migrate, php artisan migrate --force…).","«port is already allocated» o el puerto en rojo → otra app usa ese puerto: cambia el del compose y «Puerto de la app en el servidor».","La construcción se corta → tarda más de «Tiempo máximo para construir (minutos)» o pasa 10 minutos sin escribir nada (modo desarrollo o watch en el Dockerfile).","Debajo de un error de la app sale «Qué significa» con la causa más probable (falta una librería, una variable, la extensión de la base de datos…)."]},"source":"builtin","files":["files/revisar.py","tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"nginx","name":"nginx (web y proxy)","version":"1.0.0","category":"3 · Plataformas","description":"Publica tus apps en tu dominio con nginx, el servidor web más usado. HTTPS con certbot (Let's Encrypt), que se renueva solo.","details":"nginx (BSD-2) y certbot (Apache-2) de los repositorios de Ubuntu/Debian.\nCada línea de «Sitios» es «dominio destino»:\n  fotos.ejemplo.com 127.0.0.1:2283      → reenvía a la app de ese puerto\n  blog.ejemplo.com /srv/www/blog        → sirve esa carpeta (web estática)\nCada sitio va en su fichero /etc/nginx/sites-available/draupnode-\u003cdominio\u003e.conf;\nlos tuyos (los que no empiezan por draupnode-) no se tocan.\nCon HTTPS, certbot pide el certificado de cada dominio y redirige http→https.\nEl dominio tiene que apuntar ya a la IP de este servidor: si no, ese sitio\nse queda en http y se avisa (al volver a aplicar lo reintenta).\nAntes de recargar se comprueba la configuración (nginx -t): si falla, se\nvuelve a la anterior.\nSi no sabes cuál elegir, Caddy es más sencillo; nginx es el más conocido.\nNo puede ir con Coolify ni con Caddy: los tres quieren los puertos 80 y 443.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"nginx_sites","label":"Sitios","help":"Una línea por sitio: «dominio destino». Destino = 127.0.0.1:PUERTO (una app) o /carpeta (web estática).","type":"list","default":[],"pattern":"^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}[ ]+(((https?://)?[A-Za-z0-9.-]+:[0-9]{1,5})|(/[A-Za-z0-9._/-]+))$","patternHelp":"Ejemplo: fotos.ejemplo.com 127.0.0.1:2283","placeholder":"fotos.ejemplo.com 127.0.0.1:2283"},{"name":"nginx_https","label":"HTTPS con Let's Encrypt (certbot)","type":"bool","default":true},{"name":"nginx_email","label":"Correo para Let's Encrypt","help":"Obligatorio con HTTPS. Te avisan si un certificado no se puede renovar.","type":"string","default":"","pattern":"^([^@\\s]+@[^@\\s]+\\.[^@\\s]+)?$","patternHelp":"Un correo válido o vacío"},{"name":"nginx_max_body_mb","label":"Tamaño máximo de subida (MB)","help":"Lo que se puede subir de una vez (fotos, documentos…).","type":"int","default":50,"min":1,"max":10240},{"name":"nginx_remove_default","label":"Quitar la página «Welcome to nginx»","type":"bool","default":true},{"name":"nginx_security_headers","label":"Cabeceras de seguridad","help":"No dejar meter la web en un marco de otra, no adivinar tipos de fichero, no decir la versión de nginx…","type":"bool","default":true}],"firewallPorts":[80,443],"links":[{"label":"Web oficial","url":"https://nginx.org"},{"label":"Código fuente","url":"https://github.com/nginx/nginx"},{"label":"certbot (Let's Encrypt)","url":"https://certbot.eff.org"}],"conflicts":["coolify","caddy"],"uninstallable":true,"uninstallWarning":"Desinstala nginx y certbot. Tus sitios dejan de verse por su dominio; las apps de detrás siguen en marcha.","uninstallData":"Borrar también los certificados de Let's Encrypt (/etc/letsencrypt) y la configuración de nginx.","prueba":{"lab":"Sí, pero sin certbot (el servidor de pruebas no es accesible desde internet): desactiva HTTPS para la prueba. Con un dominio real se prueba en un servidor público.","pasos":["Instala antes algo que escuche, por ejemplo «Vaultwarden» (puerto 8222).","Añade «nginx» con el sitio «vault.localhost 127.0.0.1:8222», HTTPS desactivado, y aplica.","En «Terminal»: «curl -s -H 'Host: vault.localhost' http://127.0.0.1 -o /dev/null -w '%{http_code}\\n'» y lo mismo con otro dominio."],"comprobar":["Con vault.localhost devuelve 200; con un dominio que no conoce, nginx corta la conexión (000).","«curl -sI -H 'Host: vault.localhost' http://127.0.0.1» no enseña la versión de nginx y trae las cabeceras de seguridad."],"necesita":["Los sitios, uno por línea: «dominio destino» (127.0.0.1:PUERTO o /carpeta).","Con HTTPS activado, el correo es obligatorio (certbot) y el dominio tiene que apuntar al servidor con el 80 y el 443 abiertos."],"problemas":["certbot falla («Challenge failed», «DNS problem») → el dominio aún no apunta aquí o el 80 está cerrado en el proveedor; para probar sin dominio, desactiva HTTPS.","Un dominio que no está en la lista no responde → es a propósito: nginx corta las conexiones a dominios que no conoce.","Subir ficheros grandes da «413» → sube «Tamaño máximo de subida (MB)»."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/site.conf.j2"]},
  {"id":"adminer","name":"Adminer (ver y editar bases de datos)","version":"1.0.0","category":"4 · Bases de datos","description":"Una página para ver y editar tus bases de datos PostgreSQL y MariaDB: tablas, datos, consultas SQL, importar y exportar.","details":"Adminer (un solo fichero PHP) en Docker, en la red de las bases de\ndatos compartidas. Al entrar elige el sistema y escribe el servidor\n(«pg-compartido» o «mariadb-compartido», o el nombre del contenedor\nde tu app) con su usuario y contraseña (en «Contraseñas»).\nNo guarda nada. Mejor sin dominio: entra con «Abrir» (túnel SSH).\nSus datos están en /srv/draupnode/apps/adminer (entran en las copias del\nmódulo Copias). Licencia: Apache-2.0 o GPL-2.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"adminer_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":8085,"min":1024,"max":65535},{"name":"adminer_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"adminer_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"adminer_network","label":"Red de Docker","help":"La misma que la de PostgreSQL/MariaDB compartidos («apps» si no la has cambiado). Las apps de esa red llegan a este contenedor por su nombre.","type":"string","default":"apps","pattern":"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$","patternHelp":"Letras, números, punto, guion y guion bajo"},{"name":"adminer_update","label":"Actualizar Adminer al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["adminer_public_port"],"proxySite":{"domain":"adminer_domain","port":"adminer_port"},"links":[{"label":"Web oficial","url":"https://www.adminer.org"},{"label":"Código fuente","url":"https://github.com/vrana/adminer"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Adminer.","uninstallData":"Borrar también sus datos (nada (Adminer no guarda datos)). No se puede deshacer.","prueba":{"lab":"Sí (con «PostgreSQL compartido» o «MariaDB compartido» para tener a qué conectarse).","pasos":["Añade «PostgreSQL compartido» y «Adminer», y aplica.","Pulsa «Abrir (túnel SSH)» en Adminer y entra: sistema PostgreSQL, servidor «pg-compartido», usuario y contraseña de «Contraseñas»."],"comprobar":["Enseña las bases de datos y deja abrir tablas y lanzar consultas SQL."],"necesita":["Nada en Adminer. Para entrar, el usuario y la contraseña de la base de datos (en «Contraseñas»)."],"problemas":["«No such host» al entrar → la base de datos no está en la misma red de Docker: pon en «Red de Docker» la de tu base («apps» por defecto)."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"mariadb","name":"MariaDB compartido","version":"1.0.0","category":"4 · Bases de datos","description":"Un MariaDB (compatible con MySQL) en Docker para tus apps, con una base y un usuario por app. Las contraseñas se generan en el servidor.","details":"MariaDB (GPL-2) en Docker. Solo es accesible desde la red Docker indicada\n(las apps lo ven por el nombre del contenedor); no se publica ningún puerto.\nLas contraseñas se generan en el propio servidor la primera vez y se\nguardan en /etc/draupnode/secretos/\u003cproyecto\u003e/ (solo root); Draupnode trae\nuna copia a tu bóveda. El módulo Copias vuelca sus bases cada día.\nPuede ir junto al PostgreSQL compartido (cada app usa el que necesite).\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":700},"variables":[{"name":"mariadb_version","label":"Versión de MariaDB","help":"Las LTS (con años de actualizaciones).","type":"select","default":"11.4","options":["11.4","10.11"]},{"name":"mariadb_container","label":"Nombre del contenedor","help":"Es el «host» con el que tus apps se conectan.","type":"string","default":"mariadb-compartido","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"mariadb_network","label":"Red Docker compartida","type":"string","default":"apps","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"mariadb_databases","label":"Bases de datos","help":"Una por línea. Cada una tendrá un usuario con el mismo nombre y su propia contraseña.","type":"list","default":[],"pattern":"^[a-z][a-z0-9_]{0,30}$","patternHelp":"Minúsculas, números y _ (empezando por letra)"},{"name":"mariadb_dir","label":"Carpeta en el servidor","type":"string","default":"/srv/draupnode/mariadb","pattern":"^/[A-Za-z0-9._/-]+$","patternHelp":"Ruta absoluta"}],"links":[{"label":"Web oficial","url":"https://mariadb.org"},{"label":"Documentación","url":"https://mariadb.com/kb/"},{"label":"Código fuente","url":"https://github.com/MariaDB/server"}],"checks":[{"containerFree":"mariadb_container"}],"secrets":[{"file":"mariadb_root","label":"Usuario «root» de MariaDB"},{"file":"mariadb_*","label":"Usuario de la base"}],"uninstallable":true,"uninstallWarning":"Para y quita el contenedor de MariaDB. Las apps que lo usan dejan de tener base de datos.","uninstallData":"Borrar también los DATOS de todas las bases y sus contraseñas. No se puede deshacer.","prueba":{"lab":"Sí.","pasos":["Añade «MariaDB compartido» con una base, por ejemplo «blog», y aplica.","Mira su usuario y contraseña en la página del módulo → Contraseñas.","En «Terminal»: «docker exec -it mariadb-compartido mariadb -u blog -p blog -e 'select 1'» (pega la contraseña)."],"comprobar":["La consulta devuelve 1.","Ficha → Apps y bases → Bases de datos: sale MariaDB con la base «blog»."],"necesita":["Las bases que quieres, una por línea (minúsculas, números y _). Cada una con su usuario y contraseña (en Contraseñas)."],"problemas":["Una app no conecta → tiene que estar en la red «apps» y usar el host mariadb-compartido.","«Access denied» con root → la contraseña de root está en Contraseñas (Usuario «root» de MariaDB)."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"postgres","name":"PostgreSQL compartido","version":"1.0.0","category":"4 · Bases de datos","description":"Un PostgreSQL en Docker para todas tus apps, con una base y un usuario por app. Las contraseñas se generan en el servidor.","details":"Solo es accesible desde la red Docker indicada (las apps lo ven por el nombre\ndel contenedor). Las contraseñas se generan en el propio servidor la primera\nvez y se guardan en /etc/draupnode/secretos/\u003cproyecto\u003e/ (solo root); nunca se\npisan al relanzar.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":900},"variables":[{"name":"postgres_version","label":"Versión de PostgreSQL","type":"select","default":"16","options":["15","16","17"]},{"name":"postgres_container","label":"Nombre del contenedor","help":"Es el «host» con el que tus apps se conectan.","type":"string","default":"pg-compartido","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"postgres_network","label":"Red Docker compartida","type":"string","default":"apps","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"postgres_databases","label":"Bases de datos","help":"Una por línea. Cada una tendrá un usuario con el mismo nombre y su propia contraseña.","type":"list","default":[],"pattern":"^[a-z][a-z0-9_]{0,30}$","patternHelp":"Minúsculas, números y _ (empezando por letra)"},{"name":"postgres_dir","label":"Carpeta en el servidor","type":"string","default":"/srv/draupnode/postgres","pattern":"^/[A-Za-z0-9._/-]+$","patternHelp":"Ruta absoluta"}],"links":[{"label":"Web oficial","url":"https://www.postgresql.org"},{"label":"Documentación","url":"https://www.postgresql.org/docs/"},{"label":"Código fuente","url":"https://github.com/postgres/postgres"}],"checks":[{"containerFree":"postgres_container"}],"secrets":[{"file":"postgres_superusuario","label":"Superusuario «postgres»"},{"file":"postgres_*","label":"Usuario de la base"}],"uninstallable":true,"uninstallWarning":"Para y quita el contenedor de PostgreSQL. Las apps que lo usan dejan de tener base de datos.","uninstallData":"Borrar también los DATOS de todas las bases y sus contraseñas. No se puede deshacer.","prueba":{"lab":"Sí.","pasos":["Añade «PostgreSQL compartido» con una base, por ejemplo «tienda», y aplica.","Mira el usuario y la contraseña de «tienda» en la página del módulo → Contraseñas.","En «Terminal»: «docker exec -it pg-compartido psql -U tienda -d tienda -c 'select 1'»."],"comprobar":["La consulta devuelve 1.","Ficha → Apps y bases → Bases de datos: sale pg-compartido con la base «tienda» y lo que pesa.","Si desinstalas sin «borrar datos» y vuelves a instalar, la base y su contraseña siguen ahí."],"necesita":["Las bases que quieres, una por línea (minúsculas, números y _; empezando por letra). Cada una tendrá un usuario con su nombre y su contraseña (en Contraseñas)."],"problemas":["Una app no conecta → tiene que estar en la red «apps» y usar el host pg-compartido (con «Tu app», elige «postgres-compartido» y lo hace solo).","Quitaste una base de la lista y sigue ahí → no se borran bases para no perder datos; bórrala a mano si quieres."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"valkey","name":"Valkey (caché compatible con Redis)","version":"1.0.0","category":"4 · Bases de datos","description":"Caché y colas en memoria, compatible con Redis, para tus apps. Es la continuación libre de Redis (que dejó de ser software libre en la 7.4).","details":"Valkey 9 en Docker, compartido por tus apps: escucha en 127.0.0.1 y,\ndentro de Docker, como «valkey-compartido» en la red indicada (la de\nPostgreSQL y MariaDB compartidos). Con contraseña (en «Contraseñas»).\nEn tus apps: redis://:CONTRASEÑA@valkey-compartido:6379/0\nGuarda los datos en disco (appendonly) para no perderlos al reiniciar.\nSus datos están en /srv/draupnode/apps/valkey (entran en las copias del\nmódulo Copias). Licencia: BSD-3-Clause.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"valkey_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":6379,"min":1024,"max":65535},{"name":"valkey_network","label":"Red de Docker","help":"La misma que la de PostgreSQL/MariaDB compartidos («apps» si no la has cambiado). Las apps de esa red llegan a este contenedor por su nombre.","type":"string","default":"apps","pattern":"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$","patternHelp":"Letras, números, punto, guion y guion bajo"},{"name":"valkey_maxmemory_mb","label":"Memoria máxima (MB)","help":"0 = sin límite. Si se llena, borra las claves menos usadas (modo caché).","type":"int","default":0,"min":0,"max":65536},{"name":"valkey_update","label":"Actualizar Valkey al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"links":[{"label":"Web oficial","url":"https://valkey.io"},{"label":"Código fuente","url":"https://github.com/valkey-io/valkey"}],"secrets":[{"file":"valkey_password","label":"Contraseña de Valkey"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Valkey.","uninstallData":"Borrar también sus datos (lo que tus apps guardan en Valkey). No se puede deshacer.","prueba":{"lab":"Sí.","pasos":["Añade «Valkey» y aplica.","En «Terminal»: «sudo docker run --rm --network apps valkey/valkey:9 valkey-cli -h valkey-compartido -a CONTRASEÑA ping» (la contraseña está en «Contraseñas»)."],"comprobar":["La orden de prueba responde «PONG»; sin contraseña responde «NOAUTH».","Solo escucha en 127.0.0.1:6379 y en la red de Docker «apps»: desde fuera no se ve."],"necesita":["Nada. En tus apps: redis://:CONTRASEÑA@valkey-compartido:6379/0, conectando su contenedor a la red «apps»."],"problemas":["Tu app no lo encuentra → su contenedor tiene que estar en la red «apps» (la misma que «Red de Docker»).","Aviso «Memory overcommit must be enabled» en sus registros → es solo un aviso; si quieres quitarlo: «vm.overcommit_memory = 1» en /etc/sysctl.d/."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"backups","name":"Copias de seguridad (restic)","version":"1.0.0","category":"5 · Copias","description":"Copia diaria cifrada con restic de tus bases de datos, Coolify, la carpeta de secretos y las carpetas que elijas. Opcional, una segunda copia fuera del servidor.","details":"restic (código abierto, BSD) guarda las copias cifradas y sin duplicados en\n{carpeta}/\u003cproyecto\u003e/restic-repo. Su contraseña se genera en el servidor y\nDraupnode la trae a tu bóveda: SIN ELLA LAS COPIAS NO SE PUEDEN ABRIR.\nCada día a la hora indicada (systemd): vuelca PostgreSQL y la base de\nCoolify si están, copia la carpeta de secretos de Draupnode y tus carpetas,\nborra las copias viejas según lo que conservas y comprueba el repositorio.\nUna copia que solo está en el servidor no te salva si pierdes el servidor:\nusa «Traer copias al equipo», o un destino remoto propio\n(otro servidor por SFTP, un rest-server de restic o un S3 compatible como\nMinIO o Garage; todos de código abierto).\n","depends":["base"],"requires":{"os":["ubuntu","debian"],"minDiskGb":5},"variables":[{"name":"backups_time","label":"Hora de la copia diaria","help":"Hora del servidor (HH:MM). Se retrasa hasta 10 minutos al azar.","type":"string","default":"03:30","pattern":"^([01][0-9]|2[0-3]):[0-5][0-9]$","patternHelp":"Formato HH:MM (p. ej. 03:30)"},{"name":"backups_paths","label":"Carpetas que copiar","help":"Una por línea. La carpeta de secretos de Draupnode se copia siempre.","type":"list","default":[],"pattern":"^/[A-Za-z0-9._/-]+$","patternHelp":"Ruta absoluta (empieza por /)"},{"name":"backups_postgres","label":"Volcar PostgreSQL","help":"Todas las bases del contenedor indicado (pg_dumpall), si existe.","type":"bool","default":true},{"name":"backups_postgres_container","label":"Contenedor de PostgreSQL","type":"string","default":"pg-compartido","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"backups_mariadb","label":"Volcar MariaDB","help":"Cada base del contenedor indicado (mariadb-dump), si existe.","type":"bool","default":true},{"name":"backups_mariadb_container","label":"Contenedor de MariaDB","type":"string","default":"mariadb-compartido","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"backups_apps","label":"Copiar las apps de Draupnode","help":"La carpeta /srv/draupnode/apps (código, .env y datos de las apps instaladas con Draupnode), si existe.","type":"bool","default":true},{"name":"backups_coolify","label":"Copiar Coolify","help":"Su base de datos, su .env y sus claves SSH, si Coolify está instalado.","type":"bool","default":true},{"name":"backups_keep_daily","label":"Copias diarias que se conservan","type":"int","default":7,"min":1,"max":90},{"name":"backups_keep_weekly","label":"Copias semanales que se conservan","type":"int","default":4,"min":0,"max":52},{"name":"backups_keep_monthly","label":"Copias mensuales que se conservan","type":"int","default":6,"min":0,"max":60},{"name":"backups_check","label":"Comprobar el repositorio después de cada copia","type":"bool","default":true},{"name":"backups_run_now","label":"Hacer la primera copia al aplicar","type":"bool","default":true},{"name":"backups_dir","label":"Carpeta de las copias en el servidor","help":"Dentro se crea una carpeta por servidor.","type":"string","default":"/srv/draupnode/copias","pattern":"^/[A-Za-z0-9._/-]+$","patternHelp":"Ruta absoluta"},{"name":"backups_remote_type","label":"Copia también fuera del servidor","help":"«sftp» = otro servidor tuyo; «rest-server» = el servidor de copias de restic; «s3» = S3 compatible (MinIO, Garage…).","type":"select","default":"no","options":["no","sftp","rest-server","s3"]},{"name":"backups_remote","label":"Destino remoto","help":"sftp: usuario@203.0.113.40:/srv/copias/web · rest-server: https://copias.ejemplo.com:8000/web · s3: https://minio.ejemplo.com/cubo/web","type":"string","default":"","pattern":"^[^\\s]+$","patternHelp":"Sin espacios"},{"name":"backups_remote_port","label":"Puerto SSH del destino (sftp)","type":"int","default":22,"min":1,"max":65535},{"name":"backups_remote_user","label":"Usuario del destino (rest-server) o Access Key (s3)","type":"string","default":""},{"name":"backups_remote_password","label":"Contraseña del destino (rest-server) o Secret Key (s3)","help":"Se guarda cifrada en tu bóveda y solo viaja al servidor al aplicar.","type":"secret","default":null},{"name":"backups_remote_cacert","label":"Certificado del destino (rest-server)","help":"Lo rellena Draupnode cuando el destino es otro servidor tuyo con el módulo «Destino de copias» (certificado propio, en base64). Vacío = certificado normal (Let's Encrypt…).","type":"string","default":"","pattern":"^[A-Za-z0-9+/=]*$","patternHelp":"Lo rellena Draupnode"},{"name":"backups_remote_append_only","label":"El destino solo deja añadir","help":"Las copias viejas del destino no se borran desde aquí (el destino no lo permite). Las de este servidor sí.","type":"bool","default":false}],"links":[{"label":"restic","url":"https://restic.net"},{"label":"Documentación","url":"https://restic.readthedocs.io"},{"label":"Código fuente","url":"https://github.com/restic/restic"}],"after":["docker","postgres","coolify"],"secrets":[{"file":"restic","label":"Contraseña de las copias (restic)"},{"file":"backups_sftp_key.pub","label":"Clave pública para el servidor de copias (SFTP)"}],"uninstallable":true,"uninstallWarning":"Quita la copia diaria (temporizador y script). Las copias ya hechas se conservan.","uninstallData":"Borrar también el repositorio local de copias y su contraseña. Las copias del destino remoto no se tocan.","prueba":{"lab":"Sí.","pasos":["Con «PostgreSQL compartido» instalado, añade «Copias de seguridad» con «Hacer la primera copia al aplicar» y aplica.","Ficha → pestaña Copias: pulsa «Ver copias» y luego «Hacer copia ahora».","Prueba a restaurar: en una copia, «Restaurar base…» → «Restaurar en la base nueva» (no en su sitio)."],"comprobar":["Salen las copias con su fecha y tamaño, y el volcado de cada base (postgres-…/tienda.dump).","La base restaurada tiene los mismos datos que la original.","«Traer copias al equipo» descarga la copia a tu equipo."],"necesita":["Nada para la copia local diaria (bases de datos, apps, Coolify y la carpeta de secretos). Añade en «Carpetas que copiar» las tuyas (rutas absolutas).","Para guardar también fuera: el tipo (sftp, rest-server o s3) y la dirección (p. ej. sftp: usuario@203.0.113.40:/srv/copias/web). Lo más fácil: «Guardar también en otro servidor» desde la pestaña Copias.","5 GB libres como mínimo."],"problemas":["La copia remota por SFTP falla con «Permission denied (publickey)» → añade en el otro servidor la clave pública que sale en Contraseñas («Clave pública para el servidor de copias (SFTP)»).","Aviso «La última copia es de hace más de 26 h» → mira el registro de la copia (pestaña Copias) y que el servidor tenga la hora sincronizada.","Sin la contraseña de las copias (restic) no se pueden restaurar: haz «Exportar copia…» (Ajustes) de Draupnode y guárdala fuera del equipo."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/copia.service.j2","templates/copia.sh.j2","templates/copia.timer.j2"]},
  {"id":"backup-target","name":"Destino de copias (rest-server)","version":"1.0.0","category":"5 · Copias","description":"Convierte este servidor en el sitio donde OTROS servidores guardan sus copias. Solo deja añadir copias, nunca borrarlas, así que un intruso en el otro servidor no puede destruirlas.","details":"Usa rest-server (de los autores de restic, BSD-2) en Docker, con HTTPS y\nen modo «solo añadir» (--append-only): los servidores de origen pueden\nsubir copias nuevas pero no borrar ni cambiar las que ya hay. Cada servidor\nde origen tiene su usuario y su carpeta y no ve las de los demás\n(--private-repos). Las copias llegan cifradas: este servidor no puede\nleerlas.\nLo normal es no tocar esto a mano: en la página del módulo «Copias» de\notro servidor, «Guardar también en otro servidor…» crea esta plantilla y\ndeja las dos partes configuradas (usuario, contraseña y certificado).\nRotación: con «Borrar las copias viejas» activado, ESTE servidor borra\ncada día las que pasan de los días indicados (y guarda una al mes si lo\npides). Para eso necesita la contraseña de las copias de cada servidor:\nDraupnode se la da al aplicar (cuando ya la tiene, es decir, después de\naplicar en el servidor de origen). Así este servidor podría leer las copias;\nsi no quieres eso, desactívalo y aquí no se borrará nunca nada (vigila el\ndisco).\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minDiskGb":10},"variables":[{"name":"backup_target_port","label":"Puerto HTTPS","help":"Por él se conectan los servidores de origen. Se abre en el Cortafuegos.","type":"int","default":8000,"min":1024,"max":65535},{"name":"backup_target_dir","label":"Carpeta de las copias","help":"Dentro, una carpeta por servidor de origen.","type":"string","default":"/srv/draupnode/destino-copias","pattern":"^/[A-Za-z0-9._/-]+$","patternHelp":"Ruta absoluta"},{"name":"backup_target_container","label":"Nombre del contenedor","type":"string","default":"dn-destino-copias","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"backup_target_clients","label":"Servidores que guardan aquí","help":"Los rellena Draupnode («nombre:huella de su contraseña»). Quitar una línea le quita el acceso; sus copias se quedan.","type":"list","default":[],"pattern":"^[a-z0-9][a-z0-9-]{0,62}:\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$","patternHelp":"Lo rellena Draupnode"},{"name":"backup_target_tls_cert","label":"Certificado HTTPS","help":"Lo genera Draupnode (en base64). Los servidores de origen lo usan para comprobar que hablan con este y no con otro.","type":"string","default":"","pattern":"^[A-Za-z0-9+/=]*$","patternHelp":"Lo rellena Draupnode"},{"name":"backup_target_tls_key","label":"Clave privada HTTPS","help":"La genera Draupnode y se guarda cifrada en tu bóveda.","type":"secret","default":null,"required":true},{"name":"backup_target_prune","label":"Borrar las copias viejas (rotación)","help":"Este servidor borra cada día las copias que pasan de los días de abajo. Necesita la contraseña de las copias (Draupnode se la da al aplicar).","type":"bool","default":true},{"name":"backup_target_keep_days","label":"Conservar las copias de los últimos (días)","type":"int","default":30,"min":1,"max":3650},{"name":"backup_target_keep_monthly","label":"Y además una copia al mes durante (meses)","help":"0 = ninguna más.","type":"int","default":12,"min":0,"max":240},{"name":"backup_target_prune_time","label":"Hora de la rotación","help":"Mejor lejos de la hora de las copias (mientras rota, el origen espera para copiar).","type":"string","default":"05:30","pattern":"^([01][0-9]|2[0-3]):[0-5][0-9]$","patternHelp":"Formato HH:MM"},{"name":"backup_target_keys","label":"Contraseñas de las copias (las pone Draupnode)","type":"secret","default":null,"managed":true}],"firewallPortsFrom":["backup_target_port"],"links":[{"label":"rest-server (código fuente)","url":"https://github.com/restic/rest-server"},{"label":"restic","url":"https://restic.net"}],"checks":[{"containerFree":"backup_target_container"}],"uninstallable":true,"uninstallWarning":"Para el rest-server y la rotación. Los otros servidores dejan de poder guardar aquí sus copias (fallará su copia remota hasta que elijas otro destino).","uninstallData":"Borrar también TODAS las copias guardadas aquí. Si el servidor de origen se pierde, ya no habrá de dónde restaurar.","prueba":{"lab":"Hacen falta dos servidores: el de pruebas como destino y otro (un segundo Ubuntu, o un VPS) como origen. Con uno solo, comprueba solo que el destino arranca.","pasos":["No se añade a mano: en el servidor de origen (con «Copias de seguridad»), pestaña Copias → «Guardar también en otro servidor» y elige el destino.","Draupnode añade este módulo al destino con su certificado y configura las copias del origen; pulsa «Aplicar los dos ahora».","En el origen, «Hacer copia ahora» y luego «Ver copias remotas»."],"comprobar":["Las copias del origen aparecen en el destino.","Desde el origen no se pueden borrar las del destino (modo solo añadir): un intruso en el origen no las destruye."],"necesita":["Nada a mano: se configura desde el servidor que hace las copias (Copias → «Guardar también en otro servidor»), que pone el certificado y las contraseñas.","10 GB libres como mínimo, y el puerto (8000 por defecto) abierto en el cortafuegos del proveedor para el servidor de origen."],"problemas":["«Clave privada HTTPS: lo pone Draupnode…» en rojo → no lo añadas a mano, usa «Guardar también en otro servidor».","El origen no llega («connection refused», «timeout») → el puerto está cerrado en el proveedor de nube del destino.","Cambió la IP del destino → vuelve a usar «Guardar también en otro servidor»: el certificado va ligado a la dirección.","Choca con Coolify en el 8000 → cambia el puerto del destino."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"alerts","name":"Alertas al móvil","version":"1.0.0","category":"6 · Monitorización","description":"Te avisa al móvil cuando algo va mal (disco casi lleno, una copia que ha fallado, un contenedor caído, otro servidor que no responde) y cuando se arregla.","details":"Un pequeño script del servidor (systemd, cada pocos minutos) comprueba lo\nque marques y manda el aviso por ntfy (código abierto: la app ntfy del\nmóvil, con ntfy.sh o tu propio servidor ntfy) o por Telegram.\nAvisa una vez cuando empieza un problema, lo recuerda cada pocas horas si\nsigue, y avisa cuando se arregla.\nCon ntfy, si dejas el tema vacío se genera uno largo y secreto (quien sepa\nel nombre puede leer los avisos). En la página de este módulo tienes el QR\npara suscribirte desde la app y un botón para mandar un aviso de prueba.\nUn servidor no puede avisar de que él mismo se ha caído: para eso, pon su\ndirección en «Vigilar otros servidores» de las alertas de OTRO servidor, o\nmarca el «Aviso diario»: si un día no llega, algo pasa.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"alerts_channel","label":"Por dónde avisar","help":"«ntfy» = app ntfy del móvil (código abierto). «telegram» = un bot de Telegram.","type":"select","default":"ntfy","options":["ntfy","telegram"]},{"name":"alerts_ntfy_server","label":"Servidor ntfy","help":"El público (https://ntfy.sh) o el tuyo.","type":"string","default":"https://ntfy.sh","pattern":"^https?://[A-Za-z0-9.:-]+(/[A-Za-z0-9._/-]*)?$","patternHelp":"Una dirección http(s)://"},{"name":"alerts_ntfy_topic","label":"Tema de ntfy","help":"Vacío = se genera uno secreto en el servidor (recomendado).","type":"string","default":"","pattern":"^[A-Za-z0-9_-]{0,64}$","patternHelp":"Letras, números, - y _"},{"name":"alerts_ntfy_token","label":"Token de ntfy","help":"Solo si tu servidor ntfy pide usuario (token de acceso «tk_…»).","type":"secret","default":null},{"name":"alerts_telegram_token","label":"Token del bot de Telegram","help":"El que te da @BotFather al crear el bot.","type":"secret","default":null},{"name":"alerts_telegram_chat","label":"Chat de Telegram","help":"Tu número de chat (escríbele al bot y míralo con @userinfobot).","type":"string","default":"","pattern":"^-?[0-9]{0,20}$","patternHelp":"Un número"},{"name":"alerts_disk_percent","label":"Avisar si un disco pasa del (%)","help":"0 = no avisar.","type":"int","default":90,"min":0,"max":99},{"name":"alerts_ram_percent","label":"Avisar si la memoria pasa del (%)","help":"Durante dos comprobaciones seguidas. 0 = no avisar.","type":"int","default":95,"min":0,"max":99},{"name":"alerts_backups","label":"Avisar si falla una copia de seguridad","help":"O si la última buena tiene más de 36 horas.","type":"bool","default":true},{"name":"alerts_containers","label":"Avisar si un contenedor se cae","help":"Parado con error, reiniciándose sin parar o «unhealthy».","type":"bool","default":true},{"name":"alerts_services","label":"Avisar si falla un servicio del sistema","help":"Cualquier servicio de systemd en estado «failed».","type":"bool","default":true},{"name":"alerts_watch","label":"Vigilar otros servidores","help":"Uno por línea: dirección:puerto (p. ej. 203.0.113.40:22). Avisa si deja de responder.","type":"list","default":[],"pattern":"^[A-Za-z0-9.-]+:[0-9]{1,5}$","patternHelp":"dirección:puerto"},{"name":"alerts_daily","label":"Aviso diario de que todo va bien","help":"A las 9:00. Si un día no llega, el servidor puede estar caído.","type":"bool","default":false},{"name":"alerts_interval_min","label":"Comprobar cada (minutos)","type":"int","default":5,"min":1,"max":60},{"name":"alerts_repeat_hours","label":"Recordar un problema que sigue cada (horas)","help":"0 = no recordar.","type":"int","default":6,"min":0,"max":168}],"links":[{"label":"ntfy","url":"https://ntfy.sh"},{"label":"Código de ntfy","url":"https://github.com/binwiederhier/ntfy"},{"label":"Bots de Telegram","url":"https://core.telegram.org/bots"}],"after":["backups","docker","monitoring"],"secrets":[{"file":"alerts_ntfy_topic","label":"Tema de ntfy (para suscribirte)"}],"uninstallable":true,"uninstallWarning":"Quita el script y el temporizador de las alertas. Dejarás de recibir avisos de este servidor.","prueba":{"lab":"Sí, con ntfy (sin cuenta): el aviso llega al móvil aunque el servidor sea el de pruebas, porque es él quien llama a ntfy.sh. Telegram necesita un bot (@BotFather) y tu chat id.","pasos":["Añade «Alertas al móvil» con el canal ntfy y aplica.","En la página del módulo: «Suscribirse en el móvil» (código QR para la app ntfy) y «Enviar aviso de prueba».","Pulsa «Qué ve ahora». Para forzar un aviso, para un contenedor en la pestaña Contenedores y espera 5 minutos."],"comprobar":["El aviso de prueba llega al móvil.","«Qué ve ahora» enseña disco, memoria, copias y contenedores con su estado.","Al parar el contenedor llega un aviso, y otro cuando lo vuelves a arrancar."],"necesita":["Con ntfy: nada (el tema secreto se genera solo). Luego «Suscribirse en el móvil» con la app ntfy.","Con Telegram: el token del bot (te lo da @BotFather) y tu número de chat (escríbele al bot y míralo con @userinfobot).","Opcional: umbrales de disco y RAM, y otros servidores que vigilar («IP:puerto», uno por línea)."],"problemas":["No llega nada → pulsa «Enviar aviso de prueba»; si tampoco llega, el servidor no sale a internet o el tema/token está mal.","En Telegram no llega → escríbele antes /start a tu bot (los bots no pueden escribir a quien no les ha hablado).","Llegan avisos repetidos → se repiten cada «Recordar un problema que sigue cada (horas)» mientras siga mal; súbelo si molesta."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/alertas.py.j2"]},
  {"id":"cockpit","name":"Cockpit (panel del servidor)","version":"1.0.0","category":"6 · Monitorización","description":"Un panel web para ver y manejar el servidor: CPU, memoria, discos, servicios, registros, actualizaciones y una terminal en el navegador.","details":"Cockpit (LGPL-2.1) del sistema. No se publica en internet: solo escucha\nen 127.0.0.1 (y en la VPN si está WireGuard). Se abre con «Abrir» en la\npágina de este módulo (túnel SSH), por la VPN o con dominio (Caddy o nginx\nen el servidor).\nPara entrar, Draupnode crea un usuario propio con una contraseña generada\nen el servidor (en «Contraseñas»); si marcas «Puede\nadministrar», ese usuario tiene sudo.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"cockpit_port","label":"Puerto (solo local)","type":"int","default":9090,"min":1024,"max":65535},{"name":"cockpit_user","label":"Usuario del panel","type":"string","default":"panel","pattern":"^[a-z][a-z0-9_-]{2,30}$","patternHelp":"Minúsculas, números, - y _"},{"name":"cockpit_admin","label":"Puede administrar (sudo)","help":"Sin esto, solo puede mirar.","type":"bool","default":true},{"name":"cockpit_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio o vacío"}],"proxySite":{"domain":"cockpit_domain","port":"cockpit_port"},"links":[{"label":"Web oficial","url":"https://cockpit-project.org"},{"label":"Código fuente","url":"https://github.com/cockpit-project/cockpit"}],"after":["wireguard"],"secrets":[{"file":"cockpit_usuario","label":"Usuario para entrar en Cockpit"}],"uninstallable":true,"uninstallWarning":"Desinstala Cockpit. El usuario del panel se queda (puedes borrarlo con «borrar datos»).","uninstallData":"Borrar también el usuario del panel y su carpeta.","prueba":{"lab":"Sí.","pasos":["Añade «Cockpit» y aplica.","Pulsa «Abrir (túnel SSH)» y entra con el usuario de Contraseñas."],"comprobar":["El panel enseña CPU, memoria, servicios y registros, y su terminal funciona.","Solo escucha en 127.0.0.1 (y en la VPN si la hay): desde fuera no se ve."],"necesita":["Nada: se abre con «Abrir (túnel SSH)» y el usuario de Contraseñas. Dominio opcional (con Caddy o nginx)."],"problemas":["No deja administrar → activa «Puede administrar (sudo)» y aplica.","Choca con otra app en el 9090 → cambia su puerto."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"dozzle","name":"Dozzle (registros de Docker)","version":"1.0.0","category":"6 · Monitorización","description":"Mira en directo, desde el navegador, lo que escriben todos los contenedores (sus registros), con buscador. Muy ligero.","details":"Dozzle en Docker. Solo lee: no guarda nada ni toca los contenedores.\nPide usuario y contraseña («admin», contraseña en «Contraseñas»):\nlos registros pueden llevar datos delicados.\nPara guardar los registros y buscarlos días después, mejor el módulo\n«Registros» (Loki + Grafana).\nSus datos están en /srv/draupnode/apps/dozzle (entran en las copias del\nmódulo Copias). Licencia: MIT.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"dozzle_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":8888,"min":1024,"max":65535},{"name":"dozzle_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"dozzle_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"dozzle_update","label":"Actualizar Dozzle al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["dozzle_public_port"],"proxySite":{"domain":"dozzle_domain","port":"dozzle_port"},"links":[{"label":"Web oficial","url":"https://dozzle.dev"},{"label":"Código fuente","url":"https://github.com/amir20/dozzle"}],"secrets":[{"file":"dozzle_admin","label":"Usuario «admin» de Dozzle"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Dozzle.","uninstallData":"Borrar también sus datos (su usuario y ajustes). No se puede deshacer.","prueba":{"lab":"Sí.","pasos":["Añade «Dozzle» y aplica.","Pulsa «Abrir (túnel SSH)» y entra con «admin» y la contraseña de «Contraseñas»."],"comprobar":["Sin usuario no deja ver nada; con él, enseña todos los contenedores y sus registros en directo."],"necesita":["Nada."],"problemas":["No sale un contenedor → Dozzle enseña los que están en marcha; marca «Mostrar los parados» en su menú."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"healthchecks","name":"Healthchecks (¿se han ejecutado mis tareas?)","version":"1.0.0","category":"6 · Monitorización","description":"Te avisa cuando una tarea programada NO se ejecuta: copias, cron, scripts. Cada tarea hace ping a una dirección al terminar; si un día no llega, te enteras.","details":"Healthchecks en Docker, con su base SQLite. Draupnode crea el usuario\nadministrador (correo admin@localhost, contraseña en «Contraseñas»).\nCrea una comprobación por tarea y añade al final de la tarea:\ncurl -fsS -m 10 --retry 5 https://tu-dominio/ping/\u003ccódigo\u003e\nMejor en un servidor DISTINTO del de las tareas, y con dominio para\nque lleguen los pings de otros servidores.\nSus datos están en /srv/draupnode/apps/healthchecks (entran en las copias del\nmódulo Copias). Licencia: BSD-3-Clause.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"healthchecks_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":8020,"min":1024,"max":65535},{"name":"healthchecks_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"healthchecks_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"healthchecks_registration","label":"Permitir registrarse","help":"Si no, solo el administrador entra (y puede invitar a otros a sus proyectos).","type":"bool","default":false},{"name":"healthchecks_update","label":"Actualizar Healthchecks al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["healthchecks_public_port"],"proxySite":{"domain":"healthchecks_domain","port":"healthchecks_port"},"links":[{"label":"Web oficial","url":"https://healthchecks.io"},{"label":"Documentación","url":"https://healthchecks.io/docs/self_hosted_docker/"},{"label":"Código fuente","url":"https://github.com/healthchecks/healthchecks"}],"secrets":[{"file":"healthchecks_admin","label":"Administrador de Healthchecks"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Healthchecks.","uninstallData":"Borrar también sus datos (las comprobaciones, su historial y los avisos). No se puede deshacer.","prueba":{"lab":"Sí.","pasos":["Añade «Healthchecks» y aplica.","Pulsa «Abrir (túnel SSH)», entra con admin@localhost y la contraseña de «Contraseñas», y crea una comprobación con periodo de 1 minuto."],"comprobar":["Al hacer ping a su dirección («curl http://127.0.0.1:8020/ping/\u003ccódigo\u003e» en la Terminal) pasa a verde.","Si dejas de hacer ping, al pasar el periodo y el margen pasa a rojo."],"necesita":["Nada al instalarlo. Para que lleguen pings de otros servidores, un dominio con Caddy o nginx."],"problemas":["Los avisos por correo no salen → Healthchecks necesita un servidor de correo (SMTP); usa mejor ntfy, Telegram u otra integración."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"monitoring","name":"Monitorización (métricas)","version":"1.0.0","category":"6 · Monitorización","description":"Prometheus y Grafana con paneles listos para la CPU, la RAM y el disco del servidor, cada contenedor y PostgreSQL. Grafana se abre desde Draupnode por un túnel SSH.","details":"Todo en Docker y de código abierto: Prometheus, node-exporter (el servidor),\ncAdvisor (cada contenedor), postgres-exporter (si hay PostgreSQL en esta\nmisma plantilla) y Grafana OSS con los paneles «Recursos» y «PostgreSQL».\nGrafana y Prometheus solo escuchan en el propio servidor (127.0.0.1): no se\nabren a internet ni en el Cortafuegos. Draupnode los abre por la misma\nconexión SSH («Abrir Grafana» en la página del módulo). El usuario es admin;\nla contraseña se genera en el servidor y la tienes en sus contraseñas.\nOcupa unos 400-600 MB de RAM.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":1500,"minDiskGb":5},"variables":[{"name":"monitoring_retention_days","label":"Días de métricas que se guardan","type":"int","default":30,"min":1,"max":365},{"name":"monitoring_cadvisor","label":"Métricas de cada contenedor (cAdvisor)","help":"CPU y RAM por contenedor. Necesita el almacenamiento clásico de Docker (opción del módulo Docker).","type":"bool","default":true},{"name":"monitoring_postgres","label":"Métricas de PostgreSQL","help":"Solo si PostgreSQL está en esta misma plantilla (usa su contraseña de superusuario).","type":"bool","default":true},{"name":"monitoring_postgres_container","label":"Contenedor de PostgreSQL","type":"string","default":"pg-compartido","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"monitoring_postgres_network","label":"Red Docker de PostgreSQL","type":"string","default":"apps","pattern":"^[a-z][a-z0-9_-]{1,40}$","patternHelp":"Minúsculas, números, - y _"},{"name":"monitoring_grafana_port","label":"Puerto de Grafana en el servidor","help":"Solo local (127.0.0.1); Draupnode llega a él por SSH.","type":"int","default":3000,"min":1024,"max":65535},{"name":"monitoring_prometheus_port","label":"Puerto de Prometheus en el servidor","help":"Solo local. Draupnode lo usa para el resumen de la página del módulo.","type":"int","default":19090,"min":1024,"max":65535}],"links":[{"label":"Prometheus","url":"https://prometheus.io"},{"label":"Grafana","url":"https://grafana.com/oss/grafana/"},{"label":"Código de Grafana","url":"https://github.com/grafana/grafana"},{"label":"node_exporter","url":"https://github.com/prometheus/node_exporter"},{"label":"cAdvisor","url":"https://github.com/google/cadvisor"}],"after":["postgres"],"secrets":[{"file":"grafana_admin","label":"Acceso a Grafana"}],"uninstallable":true,"uninstallWarning":"Para y quita Prometheus, Grafana y los exportadores. Si están los Registros (Loki), desinstálalos antes.","uninstallData":"Borrar también las métricas guardadas y la configuración de Grafana (paneles que hayas cambiado, usuarios).","prueba":{"lab":"Sí (necesita 1,5 GB de RAM).","pasos":["Añade «Monitorización (métricas)» y aplica.","Pulsa «Abrir Grafana» (en la página del módulo o en Apps y bases): se abre por un túnel SSH.","Entra con el usuario admin y la contraseña de Contraseñas."],"comprobar":["Grafana carga y los paneles «Recursos» (CPU, RAM, disco), contenedores y PostgreSQL tienen datos.","Grafana no se ve desde fuera: solo escucha en 127.0.0.1 del servidor."],"necesita":["Nada. 1,5 GB de RAM y 5 GB de disco. Para ver PostgreSQL, el PostgreSQL compartido instalado."],"problemas":["Los paneles de contenedores están vacíos → activa «Almacenamiento clásico overlay2» en Docker y aplica (con el almacenamiento nuevo de containerd, cAdvisor no ve los contenedores).","Choca con otra app en el 3000 → cambia «Puerto de Grafana en el servidor» (Draupnode avisa de puertos repetidos).","«Abrir Grafana» no carga → el túnel SSH necesita la contraseña de la conexión guardada o la bóveda abierta."]},"source":"builtin","files":["files/dashboards/postgres.json","files/dashboards/recursos.json","files/dashboards.yml","files/datasource-prometheus.yml","tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2","templates/prometheus.yml.j2"]},
  {"id":"logs","name":"Registros (Loki)","version":"1.0.0","category":"6 · Monitorización","description":"Guarda y busca en Grafana los registros de todos los contenedores y del sistema (SSH, sudo, servicios). Loki + Grafana Alloy.","details":"Loki guarda los registros y Grafana Alloy los recoge: la salida de cada\ncontenedor Docker y el diario del sistema (journald). Se buscan en Grafana,\nen el panel «Registros de los contenedores». Todo de código abierto.\nNecesita la Monitorización (usa su Grafana). Ocupa unos 300-500 MB de RAM;\npor eso va aparte.\n","depends":["monitoring"],"requires":{"os":["ubuntu","debian"],"minRamMb":2000,"minDiskGb":5},"variables":[{"name":"logs_retention_days","label":"Días de registros que se guardan","type":"int","default":14,"min":1,"max":180},{"name":"logs_journal","label":"Registros del sistema (journald)","help":"SSH, sudo, servicios, copias de seguridad… además de los contenedores.","type":"bool","default":true}],"links":[{"label":"Loki","url":"https://grafana.com/oss/loki/"},{"label":"Código de Loki","url":"https://github.com/grafana/loki"},{"label":"Grafana Alloy","url":"https://github.com/grafana/alloy"}],"uninstallable":true,"uninstallWarning":"Para y quita Loki y Alloy, y el panel de registros de Grafana.","uninstallData":"Borrar también los registros guardados.","prueba":{"lab":"Sí (necesita Monitorización y 2 GB de RAM).","pasos":["Con Monitorización instalada, añade «Registros (Loki)» y aplica.","En Grafana, abre el panel «Registros» o Explore → Loki.","En «Terminal», haz algo que deje rastro (por ejemplo «sudo true» o reiniciar un contenedor)."],"comprobar":["Salen los registros de los contenedores y del sistema (SSH, sudo, servicios), y lo que hiciste aparece al momento."],"necesita":["Nada (necesita Monitorización). 2 GB de RAM; guarda 14 días por defecto."],"problemas":["No salen registros del sistema → activa «Registros del sistema (journald)».","El disco se llena → baja «Días de registros que se guardan»."]},"source":"builtin","files":["files/datasource-loki.yml","files/registros.json","tasks/main.yml","tasks/uninstall.yml","templates/config.alloy.j2","templates/docker-compose.yml.j2","templates/loki.yml.j2"]},
  {"id":"uptime-kuma","name":"Uptime Kuma (¿están vivas mis webs?)","version":"1.0.0","category":"6 · Monitorización","description":"Comprueba cada minuto que tus webs, puertos y servicios responden, te avisa (Telegram, ntfy, correo…) y hace una página de estado pública.","details":"Uptime Kuma 2 en Docker. El primer usuario que entra se queda de\nadministrador: entra enseguida después de aplicar.\nMejor en un servidor DISTINTO del que vigila: si se cae ese servidor,\neste sigue avisando.\nSus datos están en /srv/draupnode/apps/uptime-kuma (entran en las copias del\nmódulo Copias). Licencia: MIT.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":300},"variables":[{"name":"uptime_kuma_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":3002,"min":1024,"max":65535},{"name":"uptime_kuma_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"uptime_kuma_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"uptime_kuma_update","label":"Actualizar Uptime Kuma al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["uptime_kuma_public_port"],"proxySite":{"domain":"uptime_kuma_domain","port":"uptime_kuma_port"},"links":[{"label":"Web oficial","url":"https://uptime.kuma.pet"},{"label":"Código fuente","url":"https://github.com/louislam/uptime-kuma"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Uptime Kuma.","uninstallData":"Borrar también sus datos (las comprobaciones, su historial y los avisos configurados). No se puede deshacer.","prueba":{"lab":"Sí.","pasos":["Añade «Uptime Kuma» y aplica.","Pulsa «Abrir (túnel SSH)», crea el administrador y añade una comprobación HTTP (por ejemplo https://ejemplo.com)."],"comprobar":["La comprobación sale en verde con su tiempo de respuesta y se repite cada minuto.","Si pones una dirección que no existe, sale en rojo y avisa (si has configurado un aviso)."],"necesita":["Nada al instalarlo. Dentro: qué vigilar y por dónde avisar (Telegram, ntfy, correo…)."],"problemas":["Vigila webs de este mismo servidor y no avisa cuando se cae → instálalo en OTRO servidor."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"ntfy","name":"ntfy (tu servidor de avisos)","version":"1.0.0","category":"6 · Monitorización","description":"Tu propio servidor de notificaciones push: manda avisos al móvil (app ntfy) con una simple petición HTTP. Lo pueden usar las Alertas.","details":"ntfy en Docker, cerrado: nadie lee ni publica sin usuario. Draupnode\ncrea el usuario «admin» y un token (en «Contraseñas»).\nPara las Alertas de Draupnode: en el módulo Alertas pon como servidor\nhttps://tu-dominio y el token. En la app ntfy del móvil, añade tu\nservidor con el usuario y la contraseña.\nNecesita dominio con HTTPS para usarlo desde el móvil.\nSus datos están en /srv/draupnode/apps/ntfy (entran en las copias del\nmódulo Copias). Licencia: Apache-2.0 o GPL-2.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"ntfy_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":2586,"min":1024,"max":65535},{"name":"ntfy_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"ntfy_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"ntfy_ios_push","label":"Avisos instantáneos en iPhone","help":"En iPhone los avisos llegan al momento solo si tu servidor pide a ntfy.sh que despierte la app (manda un identificador, nunca el mensaje).","type":"bool","default":false},{"name":"ntfy_update","label":"Actualizar ntfy al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["ntfy_public_port"],"proxySite":{"domain":"ntfy_domain","port":"ntfy_port"},"links":[{"label":"Web oficial","url":"https://ntfy.sh"},{"label":"Documentación","url":"https://docs.ntfy.sh"},{"label":"Código fuente","url":"https://github.com/binwiederhier/ntfy"}],"secrets":[{"file":"ntfy_admin","label":"Usuario «admin» y token de ntfy"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de ntfy.","uninstallData":"Borrar también sus datos (usuarios, tokens y mensajes guardados). No se puede deshacer.","prueba":{"lab":"Sí (para el móvil hace falta dominio con HTTPS).","pasos":["Añade «ntfy» y aplica.","En «Terminal»: «curl -H 'Authorization: Bearer TOKEN' -d hola http://127.0.0.1:2586/prueba» (el token está en «Contraseñas») y lo mismo sin la cabecera."],"comprobar":["Con el token responde 200; sin él, 403 (está cerrado).","Con dominio, la app ntfy del móvil (servidor https://tu-dominio, usuario «admin») recibe el «hola» del tema «prueba»."],"necesita":["Nada para instalarlo. Para el móvil, un dominio con Caddy o nginx."],"problemas":["En iPhone los avisos llegan tarde → activa «Avisos instantáneos en iPhone».","Las Alertas no llegan → en el módulo Alertas pon tu servidor https://tu-dominio y el token de «Contraseñas»."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"adguard","name":"AdGuard Home (sin anuncios en la VPN)","version":"1.0.0","category":"7 · Apps","description":"Bloquea anuncios, rastreadores y webs peligrosas en todos tus dispositivos conectados a la VPN, sin instalar nada en ellos.","details":"AdGuard Home (GPL-3) en Docker. Su DNS solo escucha en la VPN (la .1 de\nWireGuard), nunca en internet: un DNS abierto se usa para atacar a otros.\nDraupnode pone su dirección como DNS de los dispositivos de la VPN (hay\nque volver a escanear el QR o importar su .conf).\nSu panel solo se ve desde el servidor: «Abrir» en la página del módulo\n(túnel SSH), por la VPN o con dominio. Usuario y contraseña generados en\nel servidor (en «Contraseñas»).\nLas consultas salen cifradas (DNS sobre HTTPS) a Quad9 y Cloudflare;\npuedes cambiarlo en su panel.\n","depends":["docker","wireguard"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"adguard_port","label":"Puerto del panel (solo local)","type":"int","default":3080,"min":1024,"max":65535},{"name":"adguard_domain","label":"Dominio del panel","help":"Opcional. Con Caddy o nginx en el servidor, el panel se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio o vacío"},{"name":"adguard_update","label":"Actualizar AdGuard Home al aplicar","type":"bool","default":true}],"proxySite":{"domain":"adguard_domain","port":"adguard_port"},"links":[{"label":"Web oficial","url":"https://adguard.com/adguard-home/overview.html"},{"label":"Código fuente","url":"https://github.com/AdguardTeam/AdGuardHome"}],"secrets":[{"file":"adguard_usuario","label":"Usuario del panel de AdGuard Home"}],"uninstallable":true,"uninstallWarning":"Para AdGuard Home. Los dispositivos de la VPN se quedan sin DNS hasta que quites el DNS de WireGuard y vuelvas a aplicar.","uninstallData":"Borrar también su configuración y estadísticas.","prueba":{"lab":"Sí (necesita WireGuard).","pasos":["Con WireGuard instalado, añade «AdGuard Home» y aplica.","En «Terminal»: «sudo apt-get install -y dnsutils», luego «dig +short @10.8.0.1 doubleclick.net» y «dig +short @10.8.0.1 example.com».","Pulsa «Abrir (túnel SSH)» y entra con el usuario de Contraseñas."],"comprobar":["doubleclick.net devuelve 0.0.0.0 (bloqueado) y example.com su IP real.","El panel de AdGuard carga y cuenta las consultas; las configuraciones de WireGuard llevan DNS = 10.8.0.1."],"necesita":["Nada (necesita WireGuard): los dispositivos de la VPN usan su DNS solos. El usuario del panel está en Contraseñas."],"problemas":["No bloquea anuncios → el dispositivo no está usando la VPN, o su configuración es anterior a AdGuard: vuelve a importar la de «Ver configuraciones» (lleva DNS = 10.8.0.1).","Una web legítima no carga → añádela a la lista blanca en el panel de AdGuard."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"forgejo","name":"Forgejo (tu GitHub)","version":"1.0.0","category":"7 · Apps","description":"Tu propio GitHub: repositorios Git, incidencias, revisiones de código y paquetes, en tu servidor.","details":"Forgejo 15 en Docker, con su base SQLite (sin servidor de base de\ndatos aparte). Draupnode crea el usuario «administrador» con una contraseña\ngenerada en el servidor (en «Contraseñas»).\nGit por SSH en el puerto indicado (se abre en el Cortafuegos):\ngit clone ssh://git@servidor:PUERTO/usuario/repo.git\nEl registro de usuarios nuevos está cerrado salvo que lo abras.\nSus datos están en /srv/draupnode/apps/forgejo (entran en las copias del\nmódulo Copias). Licencia: GPL-3.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":700},"variables":[{"name":"forgejo_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":3001,"min":1024,"max":65535},{"name":"forgejo_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"forgejo_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"forgejo_ssh_port","label":"Puerto SSH de Git","help":"Para clonar y subir por SSH. No puede ser el del SSH del servidor.","type":"int","default":2222,"min":1024,"max":65535},{"name":"forgejo_registration","label":"Permitir registrarse","help":"Si no, solo el administrador crea usuarios.","type":"bool","default":false},{"name":"forgejo_update","label":"Actualizar Forgejo al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["forgejo_public_port","forgejo_ssh_port"],"proxySite":{"domain":"forgejo_domain","port":"forgejo_port"},"links":[{"label":"Web oficial","url":"https://forgejo.org"},{"label":"Código fuente","url":"https://codeberg.org/forgejo/forgejo"}],"secrets":[{"file":"forgejo_admin","label":"Administrador de Forgejo"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Forgejo.","uninstallData":"Borrar también sus datos (todos los repositorios, usuarios e incidencias). No se puede deshacer.","prueba":{"lab":"Sí.","pasos":["Añade «Forgejo» y aplica.","Pulsa «Abrir (túnel SSH)» y entra con el administrador de Contraseñas.","Crea un repositorio y súbele algo con git."],"comprobar":["Forgejo carga, entras como administrador y el repositorio guarda tus commits.","El registro de usuarios está cerrado (solo el administrador crea cuentas)."],"necesita":["Nada: el administrador se crea solo (en Contraseñas). Dominio opcional; el puerto SSH para git (2222) se abre en el Cortafuegos."],"problemas":["Falla con «Bind for 127.0.0.1:3000 failed: port is already allocated» → chocaba con Grafana; desde la 0.60 su puerto por defecto es el 3001 y Draupnode avisa de puertos repetidos. Cambia «Puerto en el servidor (solo local)».","git push por SSH no funciona → usa el puerto SSH de Forgejo (2222 por defecto) y ábrelo en el proveedor de nube."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"immich","name":"Immich (fotos y vídeos)","version":"1.0.0","category":"7 · Apps","description":"Tu propio Google Fotos: copia automática de las fotos del móvil, álbumes, búsqueda por lo que sale en la foto y por caras.","details":"Immich (versión 3) en Docker, como su compose oficial: servidor,\naprendizaje automático (búsqueda y caras), Valkey y su PostgreSQL con\nvectores. Es pesado: pide 4 GB de RAM y la primera vez descarga unos\n3 GB. El primer usuario que entra se queda de administrador: entra\nenseguida después de aplicar.\nEn el móvil, la app de Immich con la dirección del servidor (mejor con\ndominio y HTTPS, o por la VPN).\nLas fotos están en /srv/draupnode/apps/immich/library (entran en las\ncopias: pueden ocupar mucho).\nSus datos están en /srv/draupnode/apps/immich (entran en las copias del\nmódulo Copias). Licencia: AGPL-3.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":4000},"variables":[{"name":"immich_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":2283,"min":1024,"max":65535},{"name":"immich_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"immich_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"immich_update","label":"Actualizar Immich al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["immich_public_port"],"proxySite":{"domain":"immich_domain","port":"immich_port"},"links":[{"label":"Web oficial","url":"https://immich.app"},{"label":"Código fuente","url":"https://github.com/immich-app/immich"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Immich.","uninstallData":"Borrar también sus datos (todas las fotos y vídeos subidos y su base de datos). No se puede deshacer.","prueba":{"lab":"Sí, si el servidor de pruebas tiene 4 GB de RAM libres. Sus imágenes son grandes: la primera vez tarda.","pasos":["Añade «Immich» y aplica.","Pulsa «Abrir (túnel SSH)» y crea el administrador (el primero que entra).","Sube unas fotos desde el navegador."],"comprobar":["Las fotos se ven en la línea de tiempo y, al rato, la búsqueda encuentra cosas por lo que sale en ellas."],"necesita":["Nada: el primero que entra crea el administrador. 4 GB de RAM libres (el reconocimiento de caras y objetos usa bastante)."],"problemas":["Falla con «toomanyrequests» de ghcr.io → el registro de imágenes de GitHub limita las descargas; espera unos minutos y vuelve a aplicar.","«Hacen falta 4000 MB de RAM…» → el servidor es pequeño para Immich.","La búsqueda no encuentra nada → el análisis de las fotos tarda; míralo en Administración → Trabajos."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"jellyfin","name":"Jellyfin (películas y series)","version":"1.0.0","category":"7 · Apps","description":"Tu propio Netflix: películas, series y fotos desde el navegador, la tele o el móvil.","details":"Jellyfin en Docker. Lee tus vídeos de la carpeta indicada (solo\nlectura). La primera vez, entra y sigue el asistente (crea el\nadministrador y añade la biblioteca «/media»).\nConvertir vídeo en directo gasta mucha CPU: mejor clientes que lo\nreproduzcan tal cual (la app de Jellyfin, Kodi…).\nSus datos están en /srv/draupnode/apps/jellyfin (entran en las copias del\nmódulo Copias). Licencia: GPL-2.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":1500},"variables":[{"name":"jellyfin_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":8096,"min":1024,"max":65535},{"name":"jellyfin_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"jellyfin_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"jellyfin_media","label":"Carpeta de los vídeos","type":"string","default":"/srv/media","pattern":"^/[A-Za-z0-9._/ -]+$","patternHelp":"Ruta absoluta"},{"name":"jellyfin_update","label":"Actualizar Jellyfin al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["jellyfin_public_port"],"proxySite":{"domain":"jellyfin_domain","port":"jellyfin_port"},"links":[{"label":"Web oficial","url":"https://jellyfin.org"},{"label":"Código fuente","url":"https://github.com/jellyfin/jellyfin"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Jellyfin.","uninstallData":"Borrar también sus datos (la configuración y la caché de Jellyfin (tus vídeos no se tocan)). No se puede deshacer.","prueba":{"lab":"Sí (necesita 1,5 GB de RAM).","pasos":["Añade «Jellyfin» con la carpeta de vídeos por defecto (/srv/media) y aplica.","En «Terminal», copia un vídeo corto a /srv/media.","Pulsa «Abrir (túnel SSH)», sigue el asistente y añade la biblioteca /media."],"comprobar":["El vídeo aparece en la biblioteca y se reproduce en el navegador."],"necesita":["Nada: la carpeta de vídeos es /srv/media (dentro de Jellyfin, /media). 1,5 GB de RAM."],"problemas":["No ve los vídeos → están en otra carpeta: cambia «Carpeta de los vídeos», o cópialos a /srv/media, y añade la biblioteca /media en Jellyfin.","Los vídeos van a saltos → el servidor no da para convertirlos al vuelo; usa formatos que el dispositivo reproduzca directamente."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"navidrome","name":"Navidrome (música)","version":"1.0.0","category":"7 · Apps","description":"Tu propio Spotify: escucha tu colección de música desde el navegador o el móvil (apps compatibles con Subsonic).","details":"Navidrome en Docker. Lee la música de la carpeta indicada (solo\nlectura) y la vuelve a mirar sola cada hora. El primer usuario que\nentra se queda de administrador: entra enseguida después de aplicar.\nApps de móvil compatibles (Subsonic): Symfonium, Tempo, Substreamer, play:Sub…\nSus datos están en /srv/draupnode/apps/navidrome (entran en las copias del\nmódulo Copias). Licencia: GPL-3.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"navidrome_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":4533,"min":1024,"max":65535},{"name":"navidrome_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"navidrome_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"navidrome_music","label":"Carpeta de la música","help":"Donde está tu música en el servidor (súbela con SFTP, Syncthing…).","type":"string","default":"/srv/musica","pattern":"^/[A-Za-z0-9._/ -]+$","patternHelp":"Ruta absoluta"},{"name":"navidrome_update","label":"Actualizar Navidrome al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["navidrome_public_port"],"proxySite":{"domain":"navidrome_domain","port":"navidrome_port"},"links":[{"label":"Web oficial","url":"https://www.navidrome.org"},{"label":"Código fuente","url":"https://github.com/navidrome/navidrome"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Navidrome.","uninstallData":"Borrar también sus datos (la base de datos de Navidrome (usuarios, listas, favoritos; tu música no se toca)). No se puede deshacer.","prueba":{"lab":"Sí.","pasos":["Añade «Navidrome» con la carpeta de música por defecto (/srv/musica) y aplica.","En «Terminal», copia un MP3 a /srv/musica.","Pulsa «Abrir (túnel SSH)» y crea el administrador (el primero que entra)."],"comprobar":["La canción aparece y se escucha en el navegador (Navidrome revisa la carpeta cada hora; para no esperar, reinicia su contenedor en la pestaña Contenedores)."],"necesita":["Nada: la carpeta de música es /srv/musica. El primero que entra crea el administrador."],"problemas":["No sale la música nueva → revisa la carpeta cada hora; para no esperar, reinicia su contenedor en la pestaña Contenedores.","No ve la música → está en otra carpeta: cambia «Carpeta de la música»."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"nextcloud","name":"Nextcloud (tu nube)","version":"1.0.0","category":"7 · Apps","description":"Tu propio Google Drive: archivos sincronizados con tus equipos y el móvil, calendario, contactos, documentos compartidos y cientos de apps.","details":"Nextcloud (versión estable) en Docker, con su propio PostgreSQL,\nValkey para la caché y las tareas en segundo plano (cron). Draupnode\ncrea el usuario «admin» con una contraseña generada en el servidor\n(en «Contraseñas»). La primera vez tarda unos minutos en instalarse.\nPara las apps de escritorio y del móvil, mejor con dominio y HTTPS.\nLos archivos están en /srv/draupnode/apps/nextcloud/html/data (entran\nen las copias: pueden ocupar mucho).\nSus datos están en /srv/draupnode/apps/nextcloud (entran en las copias del\nmódulo Copias). Licencia: AGPL-3.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":1500},"variables":[{"name":"nextcloud_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":8090,"min":1024,"max":65535},{"name":"nextcloud_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"nextcloud_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"nextcloud_update","label":"Actualizar Nextcloud al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["nextcloud_public_port"],"proxySite":{"domain":"nextcloud_domain","port":"nextcloud_port"},"links":[{"label":"Web oficial","url":"https://nextcloud.com"},{"label":"Código fuente","url":"https://github.com/nextcloud/server"}],"secrets":[{"file":"nextcloud_admin","label":"Usuario «admin» de Nextcloud"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Nextcloud.","uninstallData":"Borrar también sus datos (todos los archivos, calendarios, contactos y su base de datos). No se puede deshacer.","prueba":{"lab":"Sí, si el servidor de pruebas tiene 2 GB libres (la primera vez tarda unos minutos).","pasos":["Añade «Nextcloud» y aplica.","Pulsa «Abrir (túnel SSH)», entra con «admin» y la contraseña de «Contraseñas» y sube un fichero."],"comprobar":["El fichero se ve en la web y en /srv/draupnode/apps/nextcloud/html/data/admin/files.","En «Terminal»: «sudo docker exec -u www-data dn-nextcloud php occ status» dice installed: true y «… occ config:app:get core backgroundjobs_mode» dice cron."],"necesita":["Nada para probarlo. Para las apps de escritorio y móvil, un dominio con Caddy o nginx."],"problemas":["«Acceso mediante un dominio no fiable» → aplica con el dominio puesto (Draupnode lo añade a los dominios de confianza).","La primera aplicación dice que aún se está instalando → espera unos minutos y vuelve a aplicar."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"paperless","name":"Paperless-ngx (documentos)","version":"1.0.0","category":"7 · Apps","description":"Escanea o sube tus papeles (facturas, contratos, recibos…) y encuéntralos al momento: lee el texto (OCR), los etiqueta y los archiva.","details":"Paperless-ngx en Docker, con su propio PostgreSQL y Valkey (compatible con Redis). Draupnode\ncrea el usuario «admin» con una contraseña generada en el servidor (en\n«Contraseñas»). Lo que dejes en la carpeta «consume» (por\nejemplo con Syncthing o desde el escáner) se importa solo.\nLa primera vez tarda unos minutos en arrancar.\nSus datos están en /srv/draupnode/apps/paperless (entran en las copias del\nmódulo Copias). Licencia: GPL-3.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":2000},"variables":[{"name":"paperless_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":8010,"min":1024,"max":65535},{"name":"paperless_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"paperless_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"paperless_ocr_language","label":"Idioma de los documentos (OCR)","type":"select","default":"spa+eng","options":["spa","spa+eng","eng","cat","spa+cat"]},{"name":"paperless_update","label":"Actualizar Paperless-ngx al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["paperless_public_port"],"proxySite":{"domain":"paperless_domain","port":"paperless_port"},"links":[{"label":"Documentación","url":"https://docs.paperless-ngx.com"},{"label":"Código fuente","url":"https://github.com/paperless-ngx/paperless-ngx"}],"secrets":[{"file":"paperless_admin","label":"Usuario «admin» de Paperless-ngx"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Paperless-ngx.","uninstallData":"Borrar también sus datos (todos los documentos, su base de datos y sus etiquetas). No se puede deshacer.","prueba":{"lab":"Sí (necesita 2 GB de RAM).","pasos":["Añade «Paperless-ngx» y aplica.","Pulsa «Abrir (túnel SSH)», entra con admin (contraseña en Contraseñas) y sube un PDF."],"comprobar":["El documento aparece y, tras unos segundos, se puede buscar por el texto que contiene (OCR en español e inglés)."],"necesita":["Nada: el usuario admin está en Contraseñas. 2 GB de RAM. Idioma del OCR: spa+eng por defecto."],"problemas":["No encuentra el texto de un documento → espera a que termine el OCR (Tareas en su panel) o cambia el idioma del OCR.","Se queda sin memoria → necesita 2 GB; con menos, sube el swap en Sistema base."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"samba","name":"Samba (carpetas compartidas)","version":"1.0.0","category":"7 · Apps","description":"Carpetas del servidor como unidades de red en Windows, macOS o Linux (\\\\servidor\\carpeta). Solo por la VPN o la red local, nunca a internet.","details":"Samba (GPL-3) del sistema. Solo escucha en el propio servidor, en la VPN\n(wg0, si está WireGuard) y en las interfaces de red local que indiques\n(por ejemplo eth0 en una Raspberry de casa). No abre nada en el\nCortafuegos: compartir archivos por internet sin VPN es peligroso.\nCada línea de «Carpetas» es «nombre /ruta»; se entra con el usuario del\nmódulo y su contraseña generada en el servidor (en «Contraseñas»). Desde la VPN: \\\\10.8.0.1\\nombre (Windows) o\nsmb://10.8.0.1/nombre (macOS/Linux).\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"samba_shares","label":"Carpetas","help":"Una por línea: «nombre /ruta» (p. ej. «documentos /srv/compartido/documentos»). Se crean si no existen.","type":"list","default":["compartido /srv/compartido"],"pattern":"^[A-Za-z0-9_-]{1,40} +/[A-Za-z0-9._/-]+$","patternHelp":"nombre /ruta"},{"name":"samba_user","label":"Usuario","type":"string","default":"compartir","pattern":"^[a-z][a-z0-9_-]{2,30}$","patternHelp":"Minúsculas, números, - y _"},{"name":"samba_interfaces","label":"Interfaces de red local","help":"Además de la VPN. Vacío = solo VPN. Ejemplo: eth0 (mira «ip a» en el servidor).","type":"list","default":[],"pattern":"^[a-z0-9.@-]{1,15}$","patternHelp":"Nombre de interfaz (eth0, enp3s0…)"}],"links":[{"label":"Web oficial","url":"https://www.samba.org"},{"label":"Código fuente","url":"https://gitlab.com/samba-team/samba"}],"after":["wireguard"],"secrets":[{"file":"samba_usuario","label":"Usuario de las carpetas compartidas"}],"uninstallable":true,"uninstallWarning":"Desinstala Samba. Las carpetas compartidas dejan de verse en red; su contenido no se toca.","uninstallData":"Borrar también el usuario de Samba (las carpetas y sus archivos NO se borran).","prueba":{"lab":"Sí (necesita WireGuard, o una interfaz de red en «Interfaces de red local»).","pasos":["Con WireGuard instalado, añade «Samba» con la carpeta «compartido /srv/compartido» y aplica.","En «Terminal»: «sudo apt-get install -y smbclient» y «smbclient //10.8.0.1/compartido -U compartir» (contraseña de Contraseñas); dentro, «put /etc/hostname prueba.txt» y «ls»."],"comprobar":["Sube y lista el fichero; con otro usuario da LOGON_FAILURE.","Escucha en 10.8.0.1 y 127.0.0.1, nunca en la IP pública."],"necesita":["Las carpetas, una por línea: «nombre /ruta» (se crean si no existen). El usuario y su contraseña están en Contraseñas.","WireGuard (solo escucha en la VPN) o una interfaz de red local en «Interfaces de red local» (p. ej. eth0). Nunca se abre a internet."],"problemas":["No se ve la carpeta → conéctate antes a la VPN y usa \\\\10.8.0.1\\nombre (Windows) o smb://10.8.0.1/nombre (macOS/Linux).","«LOGON_FAILURE» → usuario o contraseña: usa los de Contraseñas.","No puedes escribir → la carpeta en el servidor es de otro usuario; la que crea Draupnode sí deja."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/smb.conf.j2"]},
  {"id":"syncthing","name":"Syncthing (sincronizar carpetas)","version":"1.0.0","category":"7 · Apps","description":"Sincroniza carpetas entre tus equipos y el servidor, sin nube de nadie. Por ejemplo, para subir tu música o tus fotos.","details":"Syncthing en Docker. Su panel solo se ve desde el servidor («Abrir»\no la VPN): ponle usuario y contraseña la primera vez (Acciones →\nAjustes → GUI). Para sincronizar con tus equipos usa el puerto 22000\n(TCP y UDP), que se abre en el Cortafuegos; en la nube, ábrelo también\nen el cortafuegos del proveedor.\nLas carpetas sincronizadas quedan en /srv/draupnode/apps/syncthing/data.\nSus datos están en /srv/draupnode/apps/syncthing (entran en las copias del\nmódulo Copias). Licencia: MPL-2.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"syncthing_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":8384,"min":1024,"max":65535},{"name":"syncthing_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"syncthing_update","label":"Actualizar Syncthing al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPorts":[22000],"proxySite":{"domain":"syncthing_domain","port":"syncthing_port"},"links":[{"label":"Web oficial","url":"https://syncthing.net"},{"label":"Código fuente","url":"https://github.com/syncthing/syncthing"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Syncthing.","uninstallData":"Borrar también sus datos (las carpetas sincronizadas en el servidor y la identidad de este Syncthing). No se puede deshacer.","prueba":{"lab":"Sí. Para sincronizar de verdad con tu equipo, el servidor tiene que ser accesible (puerto 22000).","pasos":["Añade «Syncthing» y aplica.","Pulsa «Abrir (túnel SSH)»: es el panel de Syncthing del servidor."],"comprobar":["El panel carga y enseña el ID de este dispositivo, para añadirlo en el Syncthing de tu equipo.","En un servidor público, al añadirlo en tu equipo y compartir una carpeta, los ficheros aparecen en el servidor."],"necesita":["Nada: «Abrir (túnel SSH)» para su panel. Para sincronizar, el puerto 22000 (TCP y UDP) abierto en el proveedor de nube."],"problemas":["Los equipos no se conectan → el 22000 está cerrado en el proveedor de nube (el Cortafuegos de Draupnode solo abre el TCP).","No puede escribir en una carpeta → usa carpetas dentro de las que crea el módulo (son del usuario 1000)."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"umami","name":"Umami (estadísticas de tus webs)","version":"1.0.0","category":"7 · Apps","description":"Cuántas visitas tienen tus webs, desde dónde y qué páginas, sin cookies ni rastrear a nadie. Una alternativa libre y respetuosa a Google Analytics.","details":"Umami en Docker, con su propio PostgreSQL. Draupnode cambia la\ncontraseña del usuario «admin» (de serie es «umami») por una generada\nen el servidor (en «Contraseñas»).\nAñade tu web en Umami y pega su etiqueta \u003cscript\u003e en tus páginas. Para\nrecibir visitas de internet necesita dominio con HTTPS.\nSus datos están en /srv/draupnode/apps/umami (entran en las copias del\nmódulo Copias). Licencia: MIT.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":400},"variables":[{"name":"umami_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":3004,"min":1024,"max":65535},{"name":"umami_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"umami_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"umami_update","label":"Actualizar Umami al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["umami_public_port"],"proxySite":{"domain":"umami_domain","port":"umami_port"},"links":[{"label":"Web oficial","url":"https://umami.is"},{"label":"Código fuente","url":"https://github.com/umami-software/umami"}],"secrets":[{"file":"umami_admin","label":"Usuario «admin» de Umami"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Umami.","uninstallData":"Borrar también sus datos (todas las estadísticas y su base de datos). No se puede deshacer.","prueba":{"lab":"Sí.","pasos":["Añade «Umami» y aplica.","Pulsa «Abrir (túnel SSH)» y entra con «admin» y la contraseña de «Contraseñas»; añade una web."],"comprobar":["La contraseña de serie («umami») ya no vale; la de «Contraseñas», sí.","Umami te da la etiqueta \u003cscript\u003e para tu web."],"necesita":["Nada para probarlo. Para contar visitas reales, un dominio con Caddy o nginx."],"problemas":["No cuenta visitas → tu web debe cargar el script desde https://tu-dominio-de-umami (sin HTTPS los navegadores lo bloquean).","Los bloqueadores de anuncios lo bloquean → es normal en parte de los visitantes."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"vaultwarden","name":"Vaultwarden (contraseñas)","version":"1.0.0","category":"7 · Apps","description":"Tu gestor de contraseñas, compatible con las apps y extensiones de Bitwarden. Tus contraseñas, en tu servidor.","details":"Vaultwarden (servidor libre compatible con Bitwarden) en Docker.\nNecesita HTTPS: ponle dominio (con Caddy o nginx en el servidor) o entra\npor la VPN/«Abrir» (127.0.0.1 también vale como seguro).\nCrea tu cuenta y, cuando estéis todos, desactiva «Permitir registrarse»\ny vuelve a aplicar. El panel /admin usa el «Token de administración»\n(en «Contraseñas»).\nSus datos están en /srv/draupnode/apps/vaultwarden (entran en las copias del\nmódulo Copias). Licencia: AGPL-3.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"vaultwarden_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":8222,"min":1024,"max":65535},{"name":"vaultwarden_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"vaultwarden_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"vaultwarden_signups","label":"Permitir registrarse","help":"Déjalo activado para crear vuestras cuentas; luego desactívalo y aplica.","type":"bool","default":true},{"name":"vaultwarden_update","label":"Actualizar Vaultwarden al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["vaultwarden_public_port"],"proxySite":{"domain":"vaultwarden_domain","port":"vaultwarden_port"},"links":[{"label":"Código fuente y wiki","url":"https://github.com/dani-garcia/vaultwarden"},{"label":"Apps de Bitwarden","url":"https://bitwarden.com/download/"}],"secrets":[{"file":"vaultwarden_admin_token","label":"Token del panel /admin de Vaultwarden"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Vaultwarden.","uninstallData":"Borrar también sus datos (la bóveda cifrada de todos los usuarios). No se puede deshacer.","prueba":{"lab":"Sí.","pasos":["Añade «Vaultwarden» (registro de cuentas abierto) y aplica.","Pulsa «Abrir (túnel SSH)», crea tu cuenta y guarda una contraseña.","Si quieres el panel /admin, su token está en Contraseñas."],"comprobar":["La web de Bitwarden carga, te registras y la contraseña se guarda.","Con un dominio (Caddy o nginx), las apps y extensiones de Bitwarden conectan a https://tu-dominio."],"necesita":["Nada para probarlo: «Abrir (túnel SSH)». Para usarlo de verdad con las apps y extensiones de Bitwarden: un dominio con Caddy o nginx (HTTPS).","Deja «Permitir registrarse» activado hasta crear vuestras cuentas; luego desactívalo y aplica."],"problemas":["Se reinicia sin parar con «DOMAIN variable needs to contain the protocol» → era un fallo de Draupnode anterior a la 0.60 (mandaba el dominio vacío): actualiza y vuelve a aplicar.","Las apps de Bitwarden no conectan → necesitan https://tu-dominio; por el túnel solo funciona la web.","El panel /admin pide un token → está en Contraseñas."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"vikunja","name":"Vikunja (tareas y proyectos)","version":"1.0.0","category":"7 · Apps","description":"Listas de tareas y proyectos (lista, tablero Kanban, Gantt y tabla), compartidas con tu familia o tu equipo. Como Todoist o Trello, pero tuyo.","details":"Vikunja en Docker, con su base SQLite (sin servidor de base de datos\naparte). Crea tu cuenta y, cuando estéis todos, desactiva «Permitir\nregistrarse» y vuelve a aplicar.\nSus datos están en /srv/draupnode/apps/vikunja (entran en las copias del\nmódulo Copias). Licencia: AGPL-3.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"vikunja_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":3456,"min":1024,"max":65535},{"name":"vikunja_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"vikunja_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"vikunja_registration","label":"Permitir registrarse","help":"Déjalo activado para crear vuestras cuentas; luego desactívalo y aplica.","type":"bool","default":true},{"name":"vikunja_update","label":"Actualizar Vikunja al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["vikunja_public_port"],"proxySite":{"domain":"vikunja_domain","port":"vikunja_port"},"links":[{"label":"Web oficial","url":"https://vikunja.io"},{"label":"Código fuente","url":"https://github.com/go-vikunja/vikunja"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Vikunja.","uninstallData":"Borrar también sus datos (todas las tareas, proyectos, adjuntos y usuarios). No se puede deshacer.","prueba":{"lab":"Sí.","pasos":["Añade «Vikunja» y aplica.","Pulsa «Abrir (túnel SSH)», regístrate, crea un proyecto y una tarea. Después desactiva «Permitir registrarse» y aplica."],"comprobar":["La tarea se guarda y se ve en lista y en tablero.","Con el registro cerrado, la página ya no deja crear cuentas nuevas."],"necesita":["Nada."],"problemas":["Las apps del móvil no conectan → ponle dominio con HTTPS (así Vikunja sabe su dirección pública)."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"wikijs","name":"Wiki.js (wiki y documentación)","version":"1.0.0","category":"7 · Apps","description":"Una wiki bonita y rápida para la documentación de tu equipo o tus notas: editor visual o Markdown, búsqueda, permisos e historial.","details":"Wiki.js 2 en Docker, con su propio PostgreSQL. La primera vez,\nentra y rellena el asistente: crea el administrador y pon la dirección\ndel sitio (https://tu-dominio o la que te dé «Abrir»).\nSus datos están en /srv/draupnode/apps/wikijs (entran en las copias del\nmódulo Copias). Licencia: AGPL-3.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":500},"variables":[{"name":"wikijs_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":3003,"min":1024,"max":65535},{"name":"wikijs_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"wikijs_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"wikijs_update","label":"Actualizar Wiki.js al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["wikijs_public_port"],"proxySite":{"domain":"wikijs_domain","port":"wikijs_port"},"links":[{"label":"Web oficial","url":"https://js.wiki"},{"label":"Código fuente","url":"https://github.com/requarks/wiki"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Wiki.js.","uninstallData":"Borrar también sus datos (todas las páginas, usuarios y su base de datos). No se puede deshacer.","prueba":{"lab":"Sí.","pasos":["Añade «Wiki.js» y aplica.","Pulsa «Abrir (túnel SSH)» y sigue el asistente: crea el administrador y pon la dirección del sitio."],"comprobar":["Tras el asistente puedes crear una página y buscarla."],"necesita":["Nada: la base de datos la crea Draupnode. El administrador se crea en el asistente."],"problemas":["Los enlaces apuntan a otra dirección → cambia «Site URL» en Administración → General a tu dominio."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"aide","name":"AIDE (vigilar ficheros del sistema)","version":"1.0.0","category":"8 · Seguridad","description":"Guarda una «foto» de los ficheros importantes del sistema (programas, configuración) y cada día te dice si alguno ha cambiado sin que tú lo hayas hecho.","details":"AIDE (GPL-2.0), el vigilante de integridad de ficheros de Debian/Ubuntu.\nAl aplicar toma la foto (la primera vez tarda unos minutos). Cada día\nla compara y deja el resultado en /var/log/aide/aide.log.\nLos cambios que hagas tú con Draupnode no deberían saltar: con «Tomar\nla foto al aplicar», después de cada aplicación la foto se rehace.\nNo vigila lo que cambia solo: datos de las apps, Docker, registros.\nTras actualizar el sistema verás cambios en programas: es normal.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"aide_rebase_on_apply","label":"Tomar la foto al aplicar","help":"Después de aplicar (cambios que has hecho tú) rehace la foto, para que solo te avise de lo que no has hecho tú.","type":"bool","default":true},{"name":"aide_exclude","label":"Carpetas que no se vigilan","help":"Además de las de serie (datos de apps, Docker, registros). Una por línea.","type":"list","default":[],"pattern":"^/[A-Za-z0-9._/-]*$","patternHelp":"Ruta absoluta"}],"links":[{"label":"Web oficial","url":"https://aide.github.io"},{"label":"Código fuente","url":"https://github.com/aide/aide"}],"after":["adguard","adminer","alerts","argocd","auditd","backup-target","backups","base","caddy","chrony","clamav","cockpit","coolify","crowdsec","docker","dozzle","firewall","forgejo","git-app","healthchecks","immich","jellyfin","k3s","keycloak","logs","lynis","mariadb","monitoring","navidrome","nextcloud","nginx","ntfy","openbao","opentofu","paperless","portainer","postgres","registry","samba","ssh","syncthing","trivy","umami","uptime-kuma","valkey","vaultwarden","vikunja","wikijs","wireguard"],"uninstallable":true,"uninstallWarning":"Quita AIDE y su revisión diaria.","uninstallData":"Borrar también la foto guardada y los registros.","prueba":{"lab":"Sí (la primera foto tarda unos minutos).","pasos":["Añade «AIDE» y aplica.","En «Terminal», cambia un fichero vigilado: «echo '# prueba' | sudo tee -a /etc/hosts» y lanza la comprobación: «sudo systemctl start dailyaidecheck»."],"comprobar":["«ls -lh /var/lib/aide/aide.db» existe.","Tras la prueba, «sudo tail -n 40 /var/log/aide/aide.log» enseña /etc/hosts como cambiado. Si vuelves a aplicar AIDE, deja de salir (foto nueva)."],"necesita":["Nada. Opcional: carpetas tuyas que cambian solas y no quieres vigilar."],"problemas":["Avisa de muchos cambios tras actualizar el sistema → es normal: aplica AIDE otra vez para tomar la foto nueva.","La primera aplicación tarda mucho → en discos lentos la foto puede tardar 10-20 minutos; espera."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"clamav","name":"ClamAV (antivirus)","version":"1.0.0","category":"8 · Seguridad","description":"Busca virus y programas maliciosos cada noche en las carpetas que digas (por ejemplo, lo que suben los usuarios a tus apps), con la base de firmas siempre al día.","details":"ClamAV (GPL-2.0), el antivirus libre de Cisco Talos. freshclam\nactualiza las firmas varias veces al día; la revisión es una orden\naparte, a la hora indicada y con prioridad baja para no molestar.\nSolo avisa: no borra ni mueve nada. Lo encontrado queda en\n/var/lib/draupnode/clamav/encontrado.txt y en la nota de la revisión.\nDurante la revisión usa ~1,5 GB de RAM (carga todas las firmas).\n","depends":["base"],"requires":{"os":["ubuntu","debian"],"minRamMb":2000},"variables":[{"name":"clamav_paths","label":"Carpetas a revisar","help":"Una por línea. Las de los datos de tus apps y las de los usuarios. No pongas «/» entera (tardaría horas).","type":"list","default":["/srv","/home"],"pattern":"^/[A-Za-z0-9._/ -]*$","patternHelp":"Ruta absoluta"},{"name":"clamav_hour","label":"Hora de la revisión diaria","type":"int","default":3,"min":0,"max":23}],"links":[{"label":"Web oficial","url":"https://www.clamav.net"},{"label":"Código fuente","url":"https://github.com/Cisco-Talos/clamav"}],"uninstallable":true,"uninstallWarning":"Quita ClamAV y su revisión diaria.","uninstallData":"Borrar también la base de firmas (~300 MB) y los informes.","prueba":{"lab":"Sí, si el servidor de pruebas tiene 2 GB libres. La primera descarga de firmas (~300 MB) tarda unos minutos.","pasos":["Añade «ClamAV» con las carpetas de serie y aplica.","En «Terminal», deja el fichero de prueba EICAR (inofensivo): «echo 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' | sudo tee /srv/eicar.txt» y lanza «sudo systemctl start draupnode-clamav»."],"comprobar":["«systemctl status clamav-freshclam» está activo y «ls /var/lib/clamav» tiene main, daily y bytecode.","Tras la prueba, «sudo cat /var/lib/draupnode/clamav/encontrado.txt» lista /srv/eicar.txt (bórralo después)."],"necesita":["Las carpetas a revisar (las de serie valen) y la hora."],"problemas":["La revisión falla por memoria → el servidor necesita 2 GB de RAM; añade «Memoria de intercambio» o quita el módulo.","freshclam no descarga («403» o «cool-down») → la red de tu proveedor está bloqueada por el servidor de firmas: espera unas horas."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"crowdsec","name":"CrowdSec (bloqueo de ataques)","version":"1.0.0","category":"8 · Seguridad","description":"Lee los registros del servidor, detecta ataques (fuerza bruta al SSH, escaneos, bots contra tus webs) y bloquea esas IPs en el cortafuegos. Además usa la lista de IPs maliciosas que comparte la comunidad.","details":"CrowdSec (MIT) desde su repositorio oficial, con el bloqueador de\niptables. Vigila el SSH y el sistema, y nginx o Caddy si están. Si hay\nDocker, también protege los puertos que publican los contenedores.\nTu IP (desde la que aplicas) y las de «IPs que nunca se bloquean» no se\nbloquean nunca.\nPuede ir junto a fail2ban (módulo SSH seguro): se complementan.\n«Lista de la comunidad»: CrowdSec manda las IPs que te atacan (nada más)\ny recibe a cambio las que atacan a todos.\nConsultas en la Terminal: sudo cscli decisions list (IPs bloqueadas),\nsudo cscli alerts list, sudo cscli metrics.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"crowdsec_whitelist","label":"IPs que nunca se bloquean","help":"Una IP o red por línea (203.0.113.10 o 203.0.113.0/24). Tu IP al aplicar ya se añade sola.","type":"list","default":[],"pattern":"^[0-9A-Fa-f:.]+(/[0-9]{1,3})?$","patternHelp":"Una IP o una red (IP/máscara)"},{"name":"crowdsec_community","label":"Lista de la comunidad","help":"Comparte las IPs que te atacan y recibe las que atacan a los demás (gratis). Sin esto, solo bloquea lo que ve en este servidor.","type":"bool","default":true}],"links":[{"label":"Web oficial","url":"https://www.crowdsec.net"},{"label":"Documentación","url":"https://docs.crowdsec.net"},{"label":"Código fuente","url":"https://github.com/crowdsecurity/crowdsec"}],"after":["docker","caddy","nginx","ssh"],"uninstallable":true,"uninstallWarning":"Quita CrowdSec y su bloqueador; las IPs que tenía bloqueadas vuelven a poder entrar.","uninstallData":"Borrar también su configuración y su base de datos de alertas.","prueba":{"lab":"Sí.","pasos":["Añade «CrowdSec» y aplica.","En «Terminal», simula un ataque: «sudo cscli decisions add --ip 203.0.113.50 --duration 5m»."],"comprobar":["«sudo cscli metrics» enseña que lee el registro del SSH (auth.log o journald) y «sudo cscli bouncers list» tiene el bloqueador de iptables.","Tras la prueba, «sudo cscli decisions list» enseña 203.0.113.50 y «sudo iptables -S | grep -i crowdsec» tiene sus reglas; «sudo cscli decisions delete --ip 203.0.113.50» la quita.","Tu propia conexión sigue funcionando (tu IP está en la lista blanca)."],"necesita":["Nada. Opcional: las IPs desde las que entras siempre (tu casa, tu oficina, la VPN) en «IPs que nunca se bloquean»."],"problemas":["Te has quedado fuera → entra por la consola del proveedor y ejecuta «sudo cscli decisions delete --ip TU_IP»; después añade tu IP a la lista blanca.","No vigila nginx/Caddy → instala esos módulos antes y vuelve a aplicar CrowdSec (detecta lo que hay al aplicar)."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"keycloak","name":"Keycloak (inicio de sesión único)","version":"1.0.0","category":"8 · Seguridad","description":"Un solo usuario y contraseña (con doble factor) para todas tus apps: inicio de sesión único con OpenID Connect y SAML, como «Entrar con Google» pero tuyo.","details":"Keycloak 26 en Docker, con su propio PostgreSQL. Draupnode crea el\nadministrador temporal «admin» (en «Contraseñas»): entra, crea tu\npropio usuario administrador en el realm «master» y borra «admin»\n(Keycloak te lo recuerda).\nPara que tus apps lo usen necesita dominio con HTTPS (Caddy o nginx).\nEs pesado: pide 1,2 GB de RAM y tarda un minuto en arrancar.\nSus datos están en /srv/draupnode/apps/keycloak (entran en las copias del\nmódulo Copias). Licencia: Apache-2.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minRamMb":1200},"variables":[{"name":"keycloak_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":8180,"min":1024,"max":65535},{"name":"keycloak_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"keycloak_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"keycloak_update","label":"Actualizar Keycloak al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["keycloak_public_port"],"proxySite":{"domain":"keycloak_domain","port":"keycloak_port"},"links":[{"label":"Web oficial","url":"https://www.keycloak.org"},{"label":"Código fuente","url":"https://github.com/keycloak/keycloak"}],"secrets":[{"file":"keycloak_admin","label":"Administrador temporal de Keycloak"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de Keycloak.","uninstallData":"Borrar también sus datos (usuarios, realms, clientes y su base de datos). No se puede deshacer.","prueba":{"lab":"Sí, si el servidor de pruebas tiene 1,5 GB libres (tarda un minuto en arrancar).","pasos":["Añade «Keycloak» y aplica.","Pulsa «Abrir (túnel SSH)», entra en la consola con «admin» y la contraseña de «Contraseñas», y crea un realm y un usuario."],"comprobar":["La consola de administración abre y deja crear realms, usuarios y clientes.","En «Terminal», el token responde 200: «curl -s -o /dev/null -w '%{http_code}' -d grant_type=password -d client_id=admin-cli -d username=admin -d password=CONTRASEÑA http://127.0.0.1:8180/realms/master/protocol/openid-connect/token»."],"necesita":["Nada para probarlo. Para que tus apps lo usen, un dominio con Caddy o nginx."],"problemas":["Avisa de que «admin» es temporal → es lo esperado: crea tu propio administrador en el realm master y borra «admin».","Las apps dicen «invalid redirect_uri» o «HTTPS required» → ponle dominio con HTTPS y usa esa dirección en los clientes."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"lynis","name":"Lynis (revisión de seguridad)","version":"1.0.0","category":"8 · Seguridad","description":"Revisa la seguridad del servidor (cientos de comprobaciones) y te da una nota de 0 a 100 con consejos concretos para mejorarla. Cada semana, sola.","details":"Lynis (GPL-3.0) de CISOfy, el auditor de seguridad libre de referencia.\nSolo mira: no cambia nada. Al aplicar hace una revisión (1-2 minutos)\ny, si quieres, otra cada semana.\nEl informe queda en /var/lib/draupnode/lynis/informe.txt; los consejos\n(«Suggestions») y avisos («Warnings») son lo que hay que mirar.\nMuchos consejos los resuelven otros módulos: SSH seguro, Cortafuegos,\nActualizaciones automáticas, auditd, AIDE…\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"lynis_weekly","label":"Revisar cada semana","help":"Los domingos de madrugada. El informe de la última revisión queda en el servidor.","type":"bool","default":true},{"name":"lynis_run_now","label":"Revisar al aplicar","help":"Tarda 1-2 minutos. Así ves la nota en la nota de la aplicación.","type":"bool","default":true}],"links":[{"label":"Web oficial","url":"https://cisofy.com/lynis/"},{"label":"Código fuente","url":"https://github.com/CISOfy/lynis"}],"uninstallable":true,"uninstallWarning":"Quita Lynis y su revisión semanal.","uninstallData":"Borrar también los informes guardados.","prueba":{"lab":"Sí (la nota sale más baja que en un servidor de verdad: un contenedor no tiene núcleo propio).","pasos":["Añade «Lynis» con «Revisar al aplicar» y aplica.","Añade después «SSH seguro» o «Actualizaciones automáticas», aplica y vuelve a aplicar Lynis."],"comprobar":["La nota de la aplicación dice «Índice de seguridad: N/100» y cuántos avisos y consejos hay.","En «Terminal»: «sudo less /var/lib/draupnode/lynis/informe.txt» tiene el informe y «systemctl list-timers draupnode-lynis.timer» la próxima revisión.","Tras añadir otros módulos de seguridad, la nota sube."],"necesita":["Nada."],"problemas":["La nota parece baja → es normal la primera vez: mira los consejos, muchos se arreglan con otros módulos de Seguridad. No hace falta llegar a 100."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"openbao","name":"OpenBao (caja fuerte de secretos)","version":"1.0.0","category":"8 · Seguridad","description":"Guarda y reparte las contraseñas, claves y certificados de tus apps de forma segura, con permisos y registro de quién lee qué. La continuación libre de HashiCorp Vault.","details":"OpenBao 2 en Docker (Vault dejó de ser software libre en 2023).\nDraupnode lo inicia la primera vez con una sola clave de desbloqueo y\nguarda la clave y el token raíz en «Contraseñas»: CÓPIALOS a tu gestor\nde contraseñas; sin la clave, los datos no se pueden recuperar.\nAl reiniciarse, OpenBao arranca bloqueado. Con «Desbloquear solo»,\nel servidor lo desbloquea al arrancar usando la clave guardada en él\n(cómodo, pero quien entre como root al servidor puede leerlo todo).\nPanel web en /ui (entra con el token raíz).\nSus datos están en /srv/draupnode/apps/openbao (entran en las copias del\nmódulo Copias). Licencia: MPL-2.0.\n","depends":["docker"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"openbao_port","label":"Puerto en el servidor (solo local)","help":"La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":8200,"min":1024,"max":65535},{"name":"openbao_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"openbao_public_port","label":"Abrir un puerto a internet","help":"0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos.","type":"int","default":0,"min":0,"max":65535},{"name":"openbao_auto_unseal","label":"Desbloquear solo","help":"Al arrancar el servidor (y al aplicar) lo desbloquea con la clave guardada en el servidor. Sin esto, lo desbloqueas tú en /ui con la clave.","type":"bool","default":true},{"name":"openbao_update","label":"Actualizar OpenBao al aplicar","help":"Descarga la última versión de la imagen cada vez que aplicas.","type":"bool","default":true}],"firewallPortsFrom":["openbao_public_port"],"proxySite":{"domain":"openbao_domain","port":"openbao_port"},"links":[{"label":"Web oficial","url":"https://openbao.org"},{"label":"Código fuente","url":"https://github.com/openbao/openbao"}],"secrets":[{"file":"openbao_claves","label":"Clave de desbloqueo y token raíz de OpenBao"}],"uninstallable":true,"uninstallWarning":"Para y quita los contenedores de OpenBao.","uninstallData":"Borrar también sus datos (todos los secretos guardados (cifrados)). No se puede deshacer.","prueba":{"lab":"Sí.","pasos":["Añade «OpenBao» (con «Desbloquear solo») y aplica.","En «Terminal»: «sudo docker restart dn-openbao» y luego «sudo systemctl start draupnode-openbao» (lo mismo que hace al arrancar el servidor)."],"comprobar":["«Contraseñas» tiene la clave de desbloqueo y el token raíz; con «Abrir (túnel SSH)», /ui deja entrar con el token.","Tras reiniciar el contenedor queda bloqueado («curl -s http://127.0.0.1:8200/v1/sys/seal-status» dice sealed true) y el servicio lo desbloquea."],"necesita":["Nada. Copia la clave de desbloqueo y el token raíz a tu gestor de contraseñas."],"problemas":["Después de reiniciar el servidor está bloqueado → sin «Desbloquear solo» hay que desbloquearlo a mano en /ui con la clave.","Has perdido la clave de desbloqueo → los datos no se pueden recuperar: por eso hay que copiarla fuera del servidor."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml","templates/docker-compose.yml.j2"]},
  {"id":"trivy","name":"Trivy (vulnerabilidades en tus contenedores)","version":"1.0.0","category":"8 · Seguridad","description":"Revisa cada semana las imágenes de los contenedores que tienes en marcha y te dice cuáles tienen fallos de seguridad conocidos (CVE) y si ya hay versión arreglada.","details":"Trivy (Apache-2.0) de Aqua Security, desde su repositorio oficial.\nRevisa las imágenes de todos los contenedores en marcha (también los de\nCoolify y tus apps). Solo informa: actualizar es cosa tuya (en cada app,\n«Actualizar al aplicar» y aplicar; en las tuyas, reconstruir la imagen).\nEl informe queda en /var/lib/draupnode/trivy/informe.txt.\nLa primera vez descarga su base de vulnerabilidades (~1 GB en disco).\n","depends":["docker"],"requires":{"os":["ubuntu","debian"],"minDiskGb":3},"variables":[{"name":"trivy_severity","label":"Gravedad mínima","help":"Qué fallos se cuentan. Con «CRITICAL» solo los más graves.","type":"select","default":"HIGH,CRITICAL","options":["CRITICAL","HIGH,CRITICAL","MEDIUM,HIGH,CRITICAL"]},{"name":"trivy_ignore_unfixed","label":"Solo los que ya tienen arreglo","help":"Oculta los fallos para los que aún no hay versión corregida (no puedes hacer nada con ellos).","type":"bool","default":true},{"name":"trivy_run_now","label":"Revisar al aplicar","help":"La primera vez tarda varios minutos (descarga la base de vulnerabilidades).","type":"bool","default":true}],"links":[{"label":"Web oficial","url":"https://trivy.dev"},{"label":"Código fuente","url":"https://github.com/aquasecurity/trivy"}],"after":["adguard","adminer","alerts","argocd","auditd","backup-target","backups","base","caddy","chrony","clamav","cockpit","coolify","crowdsec","docker","dozzle","firewall","forgejo","git-app","healthchecks","immich","jellyfin","k3s","keycloak","logs","lynis","mariadb","monitoring","navidrome","nextcloud","nginx","ntfy","openbao","opentofu","paperless","portainer","postgres","registry","samba","ssh","syncthing","umami","uptime-kuma","valkey","vaultwarden","vikunja","wikijs","wireguard"],"uninstallable":true,"uninstallWarning":"Quita Trivy y su revisión semanal.","uninstallData":"Borrar también su base de vulnerabilidades (~1 GB) y los informes.","prueba":{"lab":"Sí (con algún contenedor en marcha, por ejemplo una app del catálogo).","pasos":["Añade una app (por ejemplo «Uptime Kuma») y «Trivy» con «Revisar al aplicar», y aplica.","Cambia la gravedad a «CRITICAL» y aplica otra vez."],"comprobar":["La nota de la aplicación dice cuántas imágenes ha revisado y cuántos fallos hay por imagen.","En «Terminal»: «sudo less /var/lib/draupnode/trivy/informe.txt» tiene la tabla de fallos y «systemctl list-timers draupnode-trivy.timer» la próxima revisión."],"necesita":["Nada: lo de serie (graves y críticos, solo con arreglo) es lo útil."],"problemas":["Falla al descargar la base («TOOMANYREQUESTS» de ghcr.io) → espera un rato y vuelve a aplicar.","Salen muchos fallos → actualiza las apps (en cada una, «Actualizar al aplicar») y vuelve a revisar."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"auditd","name":"auditd (registro de auditoría)","version":"1.0.0","category":"8 · Seguridad","description":"Apunta quién toca lo importante del servidor (usuarios, sudo, SSH, la hora, módulos del núcleo, Docker) para poder investigar después si pasa algo.","details":"El sistema de auditoría del núcleo de Linux (auditd, GPL-2.0) con un\njuego de reglas razonable para un servidor: cambios en usuarios y\ncontraseñas, sudoers, configuración del SSH, cron, hora del sistema,\nmódulos del núcleo y Docker, y cada uso de sudo.\nBuscar en la Terminal: sudo ausearch -k draupnode-usuarios -i\n(claves: draupnode-usuarios, -sudo, -ssh, -cron, -hora, -modulos,\n-docker) o un resumen con sudo aureport --summary.\nCon «Bloquear las reglas» nadie (ni root) puede cambiarlas sin\nreiniciar: más seguro, pero para quitar el módulo hay que reiniciar.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"auditd_immutable","label":"Bloquear las reglas","help":"Nadie puede cambiarlas ni apagar la auditoría sin reiniciar el servidor.","type":"bool","default":false},{"name":"auditd_log_mb","label":"Tamaño de cada registro (MB)","help":"Se guardan 5; al llenarse, se rota.","type":"int","default":50,"min":8,"max":1024}],"links":[{"label":"Documentación","url":"https://github.com/linux-audit/audit-documentation/wiki"},{"label":"Código fuente","url":"https://github.com/linux-audit/audit-userspace"}],"uninstallable":true,"uninstallWarning":"Quita auditd y sus reglas. Si las reglas estaban bloqueadas, se quitan del todo al reiniciar.","uninstallData":"Borrar también los registros de auditoría (/var/log/audit).","prueba":{"lab":"No: un contenedor no puede usar la auditoría del núcleo. Pruébalo en una máquina virtual o en un servidor.","pasos":["Añade «auditd» y aplica.","En «Terminal», haz algo vigilado: «sudo useradd prueba-audit \u0026\u0026 sudo userdel prueba-audit»."],"comprobar":["«sudo auditctl -l» enseña las reglas con las claves draupnode-…","«sudo ausearch -k draupnode-usuarios -i | tail» enseña el alta y la baja del usuario de prueba."],"necesita":["Nada."],"problemas":["Falla al cargar las reglas («Operation not permitted») → estaban bloqueadas: reinicia el servidor y vuelve a aplicar.","Falla en un contenedor o en VPS antiguas (OpenVZ/LXC) → ahí no hay auditoría del núcleo: quita el módulo."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"argocd","name":"Argo CD (despliegue continuo en Kubernetes)","version":"1.0.0","category":"9 · Kubernetes e IaC","description":"GitOps: le dices qué repositorio Git describe tus aplicaciones de Kubernetes y Argo CD mantiene el clúster igual que el repositorio, con un panel para verlo todo.","details":"Argo CD (Apache-2.0, CNCF) con su instalación oficial en el espacio de\nnombres «argocd» del Kubernetes de este servidor (módulo k3s).\nEl panel se abre con «Abrir» (túnel SSH), por la VPN o con dominio\n(Caddy o nginx): un servicio del servidor lo deja en 127.0.0.1.\nUsuario «admin»; su contraseña inicial está en «Contraseñas».\nPide ~1 GB de RAM además de k3s.\n","depends":["k3s"],"requires":{"os":["ubuntu","debian"],"minRamMb":2500},"variables":[{"name":"argocd_port","label":"Puerto en el servidor (solo local)","help":"El panel escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH).","type":"int","default":8081,"min":1024,"max":65535},{"name":"argocd_domain","label":"Dominio","help":"Opcional. Con Caddy o nginx en el servidor, se publica en https://dominio.","type":"string","default":"","pattern":"^(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,})?$","patternHelp":"Un dominio (app.ejemplo.com) o vacío"},{"name":"argocd_version","label":"Versión","help":"«stable» = la última estable. O una concreta, como v3.2.0.","type":"string","default":"stable","pattern":"^(stable|v[0-9]+\\.[0-9]+\\.[0-9]+)$","patternHelp":"stable o vX.Y.Z"}],"proxySite":{"domain":"argocd_domain","port":"argocd_port"},"links":[{"label":"Web oficial","url":"https://argo-cd.readthedocs.io"},{"label":"Código fuente","url":"https://github.com/argoproj/argo-cd"}],"secrets":[{"file":"argocd_admin","label":"Usuario «admin» de Argo CD"}],"uninstallable":true,"uninstallWarning":"Quita Argo CD del clúster. Las aplicaciones que haya desplegado se quedan en Kubernetes (ya sin vigilar).","prueba":{"lab":"Sí, si el servidor de pruebas tiene 3 GB de RAM libres (k3s + Argo CD).","pasos":["Añade «Argo CD» (añade k3s solo) y aplica; tarda unos minutos.","Pulsa «Abrir (túnel SSH)», entra con «admin» y crea una aplicación de ejemplo: repositorio https://github.com/argoproj/argocd-example-apps.git, ruta «guestbook», clúster «in-cluster», espacio «default»."],"comprobar":["El panel abre y deja entrar con la contraseña de «Contraseñas».","La aplicación «guestbook» llega a «Synced» y «Healthy», y «kubectl get pods» enseña sus pods."],"necesita":["Nada: se instala con lo de serie. Dominio opcional (con Caddy o nginx)."],"problemas":["El panel no abre → mira «systemctl status draupnode-argocd» (el servicio que lo deja en 127.0.0.1) y «kubectl -n argocd get pods».","Se queda sin memoria → el servidor necesita unos 3 GB: añade «Memoria de intercambio» o usa uno más grande."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"k3s","name":"Kubernetes (k3s)","version":"1.0.0","category":"9 · Kubernetes e IaC","description":"Kubernetes completo y ligero en tu servidor (k3s, certificado por la CNCF), con Helm para instalar aplicaciones de Kubernetes con una orden.","details":"k3s (Apache-2.0) de SUSE/Rancher: un Kubernetes de un solo binario,\npensado para servidores pequeños (pide ~1 GB de RAM). Se instala con su\ninstalador oficial y su configuración en /etc/rancher/k3s/config.yaml.\nPor defecto SIN su Traefik ni su balanceador, para que no ocupen los\npuertos 80/443 de Caddy, nginx o Coolify: publica tus servicios con un\ndominio en Caddy/nginx apuntando a un NodePort, o activa Traefik si el\nservidor es solo para Kubernetes.\nHelm (Apache-2.0) se instala desde get.helm.sh comprobando su suma SHA-256.\nEn la Terminal: kubectl get pods -A (con sudo, o como tu usuario si\nmarcas «kubectl para tu usuario»).\nPuede ir junto a Docker: cada uno tiene sus propios contenedores.\n","depends":["base"],"requires":{"os":["ubuntu","debian"],"minRamMb":1000},"variables":[{"name":"k3s_channel","label":"Versión","help":"«stable» = la recomendada por k3s. «latest» = la última.","type":"select","default":"stable","options":["stable","latest"]},{"name":"k3s_update","label":"Actualizar k3s al aplicar","help":"Vuelve a pasar el instalador oficial, que lo lleva a la última versión del canal elegido.","type":"bool","default":false},{"name":"k3s_traefik","label":"Usar Traefik y el balanceador de k3s","help":"Ocupan los puertos 80 y 443. Solo si el servidor es solo para Kubernetes (no con Caddy, nginx ni Coolify).","type":"bool","default":false},{"name":"k3s_public_api","label":"Abrir la API (6443) a internet","help":"Para usar kubectl desde tu equipo sin túnel. Mejor no: usa la VPN o un túnel SSH (ssh -L 6443:127.0.0.1:6443).","type":"bool","default":false},{"name":"k3s_helm","label":"Instalar Helm","type":"bool","default":true},{"name":"k3s_user_kubeconfig","label":"kubectl para tu usuario","help":"Copia el acceso al clúster a ~/.kube/config de tu usuario SSH (si no es root), para usar kubectl sin sudo.","type":"bool","default":true}],"links":[{"label":"Web oficial","url":"https://k3s.io"},{"label":"Código fuente","url":"https://github.com/k3s-io/k3s"},{"label":"Helm","url":"https://helm.sh"}],"after":["docker","firewall","wireguard"],"uninstallable":true,"uninstallWarning":"Desinstala k3s con su propio desinstalador. SE BORRA TODO lo que haya en el clúster (pods, volúmenes, secretos). Helm y tu kubeconfig también se quitan.","prueba":{"lab":"Sí (en el contenedor de pruebas k3s usa un almacenamiento más lento, «native»: es normal).","pasos":["Añade «Kubernetes (k3s)» con Helm y aplica (unos 2 minutos).","En «Terminal»: «kubectl create deployment hola --image=nginx --port=80» y, al rato, «kubectl get pods»."],"comprobar":["La nota de la aplicación dice que el nodo está «Ready» con su versión.","«kubectl get nodes» y «kubectl get pods -A» funcionan como tu usuario (sin sudo) y «helm version» responde.","El pod «hola-…» llega a «Running» (bórralo con «kubectl delete deployment hola»)."],"necesita":["Nada: lo de serie (sin Traefik, API cerrada, con Helm) vale junto a Caddy, nginx o Coolify."],"problemas":["Los pods no llegan a otros servicios o a la API (CrashLoop en coredns) → el cortafuegos bloquea la red de los pods: vuelve a aplicar k3s, que abre cni0 y las redes 10.42/10.43.","Traefik no arranca → los puertos 80/443 están ocupados por Caddy, nginx o Coolify: desactiva «Usar Traefik»."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml"]},
  {"id":"opentofu","name":"OpenTofu (infraestructura como código)","version":"1.0.0","category":"9 · Kubernetes e IaC","description":"La alternativa libre a Terraform. Describe en ficheros tu infraestructura (DNS, servidores en la nube, buckets, cuentas…) y OpenTofu la crea y la mantiene igual. Lee los mismos ficheros .tf.","details":"OpenTofu (MPL-2.0, Linux Foundation) desde su repositorio oficial.\nTerraform dejó de ser software libre en 2023 (licencia BUSL); OpenTofu\nes su continuación libre y usa los mismos ficheros y proveedores.\nSolo instala la orden «tofu», o además, con un repositorio Git, prepara\nuna carpeta de trabajo: al aplicar trae el código, hace «tofu init» y\n«tofu plan» y te enseña el resumen del plan. Con «Aplicar el plan» lo\nejecuta («tofu apply»); si no, lo aplicas tú en la Terminal.\nEl estado (terraform.tfstate) queda en /srv/draupnode/apps/opentofu y\nentra en las copias del módulo Copias.\nLas claves de los proveedores (API de tu DNS, de tu nube…) van en\n«Variables secretas»: se guardan cifradas en tu bóveda.\n","depends":["base"],"requires":{"os":["ubuntu","debian"]},"variables":[{"name":"opentofu_repo","label":"Repositorio Git con tus ficheros .tf","help":"Opcional. https://… (público o con token), o file:///ruta para una carpeta Git del propio servidor. Vacío = solo instala «tofu».","type":"string","default":"","pattern":"^((https://|file:///)[A-Za-z0-9._~:/?#@!$\u0026()*+,;=%-]+)?$","patternHelp":"https://… o file:///… o vacío"},{"name":"opentofu_token","label":"Token de acceso (repositorio privado)","help":"Para un repositorio privado por https (con permiso de solo lectura). Vacío si es público.","type":"secret","default":null},{"name":"opentofu_branch","label":"Rama","type":"string","default":"main","pattern":"^[A-Za-z0-9._/-]+$","patternHelp":"Nombre de rama"},{"name":"opentofu_subdir","label":"Carpeta dentro del repositorio","help":"Donde están los .tf. Vacío = la raíz.","type":"string","default":"","pattern":"^([A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*)?$","patternHelp":"Ruta relativa, sin «..»"},{"name":"opentofu_env","label":"Variables secretas","help":"Las que piden tus proveedores, separadas por «;»: CLOUDFLARE_API_TOKEN=xxx; TF_VAR_clave=yyy","type":"secret","default":null},{"name":"opentofu_apply","label":"Aplicar el plan","help":"Además de planear, ejecuta «tofu apply» (crea, cambia o BORRA lo que diga el plan). Mira antes el plan con esto desmarcado.","type":"bool","default":false}],"links":[{"label":"Web oficial","url":"https://opentofu.org"},{"label":"Código fuente","url":"https://github.com/opentofu/opentofu"}],"uninstallable":true,"uninstallWarning":"Quita la orden «tofu». La infraestructura que haya creado NO se borra (para eso, «tofu destroy» antes).","uninstallData":"Borrar también la carpeta de trabajo con el estado (terraform.tfstate). Sin el estado, OpenTofu ya no sabe qué creó.","prueba":{"lab":"Sí.","pasos":["Añade «OpenTofu» sin repositorio y aplica: solo instala «tofu».","En «Terminal» crea un repositorio de prueba: «sudo mkdir -p /srv/tf \u0026\u0026 cd /srv/tf \u0026\u0026 sudo git init -q -b main \u0026\u0026 echo 'resource \"terraform_data\" \"hola\" { input = \"mundo\" }' | sudo tee main.tf \u0026\u0026 sudo git add . \u0026\u0026 sudo git -c user.email=a@b -c user.name=prueba commit -qm uno». Pon «file:///srv/tf» como repositorio y aplica; luego marca «Aplicar el plan» y aplica otra vez."],"comprobar":["«tofu version» responde en la Terminal.","La primera aplicación con repositorio dice «Plan: 1 to add»; con «Aplicar el plan», «Apply complete! Resources: 1 added», y la siguiente «No changes».","El estado está en /srv/draupnode/apps/opentofu/trabajo (terraform.tfstate)."],"necesita":["Nada para tener solo «tofu». Para la carpeta de trabajo: el repositorio con tus .tf y, si tus proveedores las piden, sus claves en «Variables secretas»."],"problemas":["«tofu init» falla al descargar un proveedor → el registro de OpenTofu (registry.opentofu.org) no responde o el proveedor no existe con ese nombre: revisa el bloque required_providers.","El plan pide variables → ponlas como TF_VAR_nombre=valor en «Variables secretas», o con valor por defecto en tus .tf."]},"source":"builtin","files":["tasks/main.yml","tasks/uninstall.yml"]},
]

// ---- Historial de ejemplo (demo y capturas): ondas suaves y deterministas.
let mockHistoryOn = true
function mockHistory(lab: boolean): ServerHistory {
  if (!mockHistoryOn) return { installed: false, hasData: false }
  const gb = 1024 ** 3
  const now = Math.floor(Date.now() / 1000)
  const t5 = now - (now % 300), th = now - (now % 3600)
  const wave = (t: number, base: number, amp: number, k = 0) => base + amp * (Math.sin(t / 7200 + k) * 0.6 + Math.sin(t / 1900 + k * 2) * 0.4)
  // Día laborable: más carga de 9 a 21 h.
  const busy = (t: number) => { const h = new Date(t * 1000).getHours(); return h >= 9 && h <= 21 ? 1 : 0.35 }
  const diskAt = (t: number) => (lab ? 18 : 61) * gb - (now - t) * ((lab ? 0.05 : 1.6) * gb / 86400)
  const day = Array.from({ length: 288 }, (_, i) => {
    const t = t5 - (287 - i) * 300
    return [t, +Math.max(1, wave(t, 14, 8) * busy(t)).toFixed(1), Math.round((8.6 + wave(t, 0, 0.6, 1)) * gb), Math.round(diskAt(t))] as [number, number, number, number]
  })
  const month = Array.from({ length: 30 * 24 }, (_, i) => {
    const t = th - (30 * 24 - 1 - i) * 3600
    const c = Math.max(1, wave(t, 13, 7) * busy(t))
    const m = (8.4 + wave(t, 0, 0.5, 1)) * gb
    return [t, +c.toFixed(1), +(c * 2.2).toFixed(1), Math.round(m), Math.round(m * 1.08), Math.round(diskAt(t))] as [number, number, number, number, number, number]
  })
  const app = (cpu: number, mem: number, k: number) => {
    const series = Array.from({ length: 96 }, (_, i) => { const t = now - (now % 900) - (95 - i) * 900; return [t, +Math.max(0, wave(t, cpu, cpu * 0.6, k) * busy(t)).toFixed(2), Math.round(wave(t, mem, mem * 0.08, k))] as [number, number, number] })
    return { cpuAvg: cpu * 0.8, memAvg: mem, cpuMax: +(cpu * 2.4).toFixed(2), memMax: Math.round(mem * 1.15), series }
  }
  return {
    installed: true, hasData: true, timer: true, version: 1, step: 300, since: month[0][0], last: day[287][0], memT: 24 * gb, diskT: 194 * gb,
    day, month,
    forecast: lab ? { enough: true, hours: 168, free: 176 * gb, perDay: 0.05 * gb } : { enough: true, hours: 168, free: 133 * gb, perDay: 1.6 * gb, days: 83 },
    apps: { source: app(1.2, 412 * 1024 ** 2, 0), 'coolify-proxy': app(0.3, 58 * 1024 ** 2, 1), 'coolify:tienda': app(2.1, 186 * 1024 ** 2, 2), 'coolify:blog': app(0.4, 120 * 1024 ** 2, 3), 'draupnode-postgres': app(0.8, 96 * 1024 ** 2, 4) },
  }
}

export const api: Backend = isDesktop ? window.go!.app!.App! : mockBackend()

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
