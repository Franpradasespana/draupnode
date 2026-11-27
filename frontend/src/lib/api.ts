// Puente con el backend Go (Wails expone los métodos en window.go.app.App).
// Si se abre la interfaz en un navegador normal (npm run dev) se usa un
// simulador en memoria para poder diseñar sin el backend.
import { i18n } from './i18n.svelte'
import demoModulesES from './demo/modules.es.json'
import demoModulesEN from './demo/modules.en.json'
import { t as tr } from './i18n.svelte'

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
  /** Su máquina en el proveedor de nube (para las instantáneas). */
  cloud?: CloudLink | null
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
  language?: string
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

/** Crear servidores en la nube (Hetzner Cloud, DigitalOcean). */
export interface CloudLink {
  provider: string
  id: string
  name?: string
  snapshotBeforeApply?: boolean
  keepSnapshots?: number
}
export interface CloudSnapshot {
  id: string
  name: string
  created: string
  sizeGb: number
  draupnode: boolean
}
export interface SnapshotInfo {
  snapshots: CloudSnapshot[]
  pricePerGb: number
  currency: string
}

export interface CloudProvider {
  id: string
  name: string
  tokenUrl: string
  tokenHelp: string
  user: string
  image: string
  hasToken: boolean
}
export interface CloudOption {
  id: string
  label: string
  detail?: string
  priceMonth?: number
  currency?: string
  regions?: string[]
  ramMb?: number
}
export interface CloudCatalog {
  regions: CloudOption[]
  sizes: CloudOption[]
}
export interface CloudCreateRequest {
  provider: string
  name: string
  region: string
  size: string
  keyPath: string
  newKey: boolean
  passphrase: string
  savePassphrase: boolean
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

/** Prueba de restaurar la última copia en una carpeta aparte. */
export interface BackupVerify {
  at: number
  duration: number
  ok: boolean
  check: boolean
  partial: boolean
  files: number
  bytes: number
  dumps: number
  dumpsBad: string[]
  error: string
}

export interface BackupResult extends RunStart {
  verify?: BackupVerify
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

// Una versión guardada de la configuración (módulos y opciones) de un servidor o una plantilla.
export interface ConfigVersion {
  id: string
  at: string
  reason?: string
  changes: string[]
  modules: ProjectModule[]
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
  /** Consejos por cómo se combinan los módulos (no son problemas). */
  tips?: string[]
}

export type RunStatus =
  | 'started' | 'ok' | 'needs_secret' | 'bad_secret' | 'vault_locked' | 'vault_missing' | 'unknown_host'
  | 'host_changed' | 'needs_sudo' | 'bad_sudo' | 'busy' | 'error' | 'canceled'

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
  // Plantilla de serie de la que salió (vacío si es del usuario).
  builtin?: string
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

// Explorador de ficheros del servidor.
export interface FileEntry { name: string; type: 'dir' | 'file' | 'link' | 'other'; size: number; mode: string; owner: string; mtime: number; target?: string; dir: boolean }
export interface FilesResult extends RunStart { path?: string; entries?: FileEntry[]; content?: string; size?: number; binary?: boolean; saved?: string; count?: number }

// Dominios vistos desde fuera (CheckDomains).
export interface DomainCheck {
  domain: string
  source: string
  ips: string[]
  pointsHere: boolean
  dnsError?: string
  status?: number
  timeMs?: number
  webError?: string
  certDays?: number
  certIssuer?: string
  certValid: boolean
  certError?: string
  redirect: boolean
  httpStatus?: number
}
export interface DNSProvider { id: string; name: string; hasToken: boolean; tokenUrl: string; tokenHelp: string }
export interface PointDomainResult { zone: string; action: 'created' | 'updated' | 'same'; before?: string; ip: string }
export interface DomainReport { at: string; serverIp: string; domains: DomainCheck[]; extra?: string[] }

// Imágenes Docker con versión nueva (CheckImages).
export interface ImageCompose { project: string; dir: string; files: string }
export interface ImageInfo {
  image: string
  containers: string[]
  compose: ImageCompose[]
  coolify: boolean
  status: 'new' | 'same' | 'local' | 'pinned' | 'unknown'
  error?: string
}
export interface ImageReport { at: string; images: ImageInfo[] }
export interface ImagesResult extends RunStart { report?: ImageReport; output?: string }

// «¿Ha cambiado algo a mano?» (CheckDrift).
export interface DriftItem {
  kind: 'config' | 'timer' | 'container'
  module?: string
  name: string
  diff?: string
  key: string
}
export interface DriftReport {
  at: string
  skipped?: 'pending' | 'never'
  error?: string
  items: DriftItem[]
  accepted?: string[]
  duration: number
  baseline?: string[]
  baselineAt?: string
}
export interface DriftResult extends RunStart {
  report?: DriftReport
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
  autoupdate?: { slug: string; next: number | null; active: boolean; last: { at: number; ok: boolean; updated: string[]; same: string[]; rolledBack: string[]; failed: string[]; backup: boolean | null; duration?: number } | null }[]
  hardening?: {
    ssh?: { password: boolean; kbd: boolean; root: string; port: number }
    autoUpdates?: boolean
    lynis?: { index: number | null; warnings: number; suggestions: number; ago: number | null }
    trivy?: { vulns: number; images: number; failed: number; ago: number | null }
    clamav?: { found: number; files: string[]; ago: number | null }
    aide?: { differences: boolean | null; ago: number | null }
    crowdsec?: { active: boolean; decisions: number }
    auditd?: boolean
  }
  failed?: string[]
  ports?: { proto: string; addr: string; port: number; process: string; public: boolean }[]
  firewall?: { active: boolean; tcp: string[]; udp: string[] }
  draupnode?: { markers: ServerMarker[]; secretDirs: string[]; appDirs: string[] }
  software?: { module: string; active: boolean }[]
  backups?: { slug: string; ok: boolean; running: boolean; ago: number | null; verify?: BackupVerify | null; verifyTimer?: boolean; verifyRunning?: boolean }[]
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
  SetLanguage(lang: string): Promise<void>
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
  BackupVerify(projectId: string, secret: string, accept: string, sudoPassword: string): Promise<BackupResult>
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
  ConfigHistory(kind: string, id: string): Promise<ConfigVersion[]>
  RestoreConfigVersion(kind: string, id: string, versionId: string): Promise<void>
  LabStatus(): Promise<LabStatus>
  LabAction(action: string): Promise<void>
  LabRegister(): Promise<Server>
  OpenURL(url: string): Promise<void>
  ServerLive(id: string): Promise<ServerLive>
  DockerInfo(): Promise<DockerInfo>
  SetBackupsAuto(projectId: string, mode: string, days: number): Promise<void>
  ListRecipes(): Promise<RecipeView[]>
  BuiltinMissing(): Promise<number>
  RestoreBuiltinTemplates(): Promise<number>
  CheckRecipe(r: Recipe): Promise<ProjectCheck>
  SaveRecipe(r: Recipe): Promise<Recipe>
  DeleteRecipe(id: string): Promise<void>
  ServerModules(serverId: string): Promise<Project>
  ApplyTemplate(serverId: string, recipeId: string): Promise<TemplateResult>
  ModulesToTemplate(serverId: string, moduleIds: string[], recipeId: string, newName: string): Promise<TemplateResult>
  ForgetTemplate(serverId: string, recipeId: string): Promise<Project>
  ServerOverview(serverId: string, secret: string, accept: string, sudoPassword: string): Promise<ServerOverviewResult>
  LastOverviews(): Promise<Record<string, CachedOverview>>
  CheckDrift(serverId: string, secret: string, accept: string, sudoPassword: string): Promise<DriftResult>
  CheckImages(serverId: string, secret: string, accept: string, sudoPassword: string): Promise<ImagesResult>
  CheckDomains(serverId: string): Promise<DomainReport>
  FilesList(serverId: string, dir: string, secret: string, accept: string, sudoPassword: string): Promise<FilesResult>
  FilesRead(serverId: string, file: string, secret: string, accept: string, sudoPassword: string): Promise<FilesResult>
  FilesWrite(serverId: string, file: string, content: string, secret: string, accept: string, sudoPassword: string): Promise<FilesResult>
  FilesMkdir(serverId: string, dir: string, secret: string, accept: string, sudoPassword: string): Promise<FilesResult>
  FilesRename(serverId: string, from: string, to: string, secret: string, accept: string, sudoPassword: string): Promise<FilesResult>
  FilesDelete(serverId: string, target: string, secret: string, accept: string, sudoPassword: string): Promise<FilesResult>
  FilesDownload(serverId: string, target: string, isDir: boolean, secret: string, accept: string, sudoPassword: string): Promise<FilesResult>
  FilesUpload(serverId: string, dir: string, secret: string, accept: string, sudoPassword: string): Promise<FilesResult>
  LastDomainChecks(): Promise<Record<string, DomainReport>>
  SetExtraDomains(serverId: string, domains: string[]): Promise<DomainReport>
  DNSProviders(): Promise<DNSProvider[]>
  SetDNSToken(provider: string, token: string): Promise<void>
  PointDomain(serverId: string, domain: string, provider: string): Promise<PointDomainResult>
  LastImageChecks(): Promise<Record<string, ImageReport>>
  UpdateImages(serverId: string, projects: string[], secret: string, accept: string, sudoPassword: string): Promise<ImagesResult>
  LastDrifts(): Promise<Record<string, DriftReport>>
  AcceptDrift(serverId: string, keys: string[]): Promise<DriftReport>
  ForgetAcceptedDrift(serverId: string): Promise<DriftReport>
  PublishDockerApp(dir: string, spec: DockerSpec, serverId: string): Promise<PublishResult>
  ServerUpgrade(serverId: string, secret: string, accept: string, sudoPassword: string): Promise<DockerResult>
  CloudProviders(): Promise<CloudProvider[]>
  CloudSetToken(provider: string, token: string): Promise<void>
  CloudForgetToken(provider: string): Promise<void>
  CloudCatalog(provider: string): Promise<CloudCatalog>
  CloudCreateServer(req: CloudCreateRequest): Promise<Server>
  LinkServerCloud(serverId: string, provider: string): Promise<Server>
  UnlinkServerCloud(serverId: string): Promise<Server>
  SetSnapshotOptions(serverId: string, before: boolean, keep: number): Promise<Server>
  ServerSnapshots(serverId: string): Promise<SnapshotInfo>
  TakeServerSnapshot(serverId: string): Promise<string>
  RestoreServerSnapshot(serverId: string, snapshotId: string): Promise<void>
  DeleteServerSnapshot(serverId: string, snapshotId: string): Promise<void>
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
    { id: 'demo1', name: tr('Servidor web'), host: '203.0.113.10', port: 22, user: 'ubuntu', authMethod: 'key', keyPath: keys[1].path, keyEncrypted: true, secretStore: '', notes: tr('Servidor de ejemplo de la demo (la contraseña es «demo»)'), createdAt: new Date().toISOString() },
  ] as Server[])
  const cloudTokens: Record<string, string> = { hetzner: 'demo' } // la demo ya tiene el de Hetzner
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
  // Unas cuantas plantillas de serie de ejemplo (las de verdad las crea la app al abrirse).
  const demoBase = ['base', 'chrony', 'firewall', 'ssh', 'backups', 'alerts']
  const demoBuiltin = (id: string, name: string, notes: string, extra: string[]): Recipe => ({ id: 'serie-' + id, builtin: id, name, notes, modules: [...demoBase, ...extra].map((m) => ({ id: m, values: defaults(m) })) })
  let recipes: Recipe[] = load<Recipe[]>('recipes', [
    demoBuiltin('servidor-seguro', tr('Servidor seguro'), tr('El punto de partida para cualquier servidor: sistema al día, hora exacta, cortafuegos, SSH seguro con fail2ban, copias diarias cifradas y alertas al móvil. Todas las demás plantillas ya lo llevan. Servidor mínimo: 1 GB de RAM.'), []),
    demoBuiltin('webs-https', tr('Webs con HTTPS'), tr('Para publicar tu web o tu app desde Git con dominio y HTTPS automático (Caddy), con PostgreSQL compartido, gráficas del servidor (Grafana), aviso si la web cae (Uptime Kuma) y estadísticas de visitas (Umami). En el servidor tendrás que poner el repositorio y el dominio. Servidor mínimo: 3 GB de RAM.'), ['docker', 'caddy', 'git-app', 'postgres', 'monitoring', 'uptime-kuma', 'umami']),
    demoBuiltin('familia', tr('Familia: contraseñas, fotos y archivos'), tr('Gestor de contraseñas (Vaultwarden), fotos y vídeos del móvil (Immich) y tu nube de archivos (Nextcloud), con HTTPS. Servidor mínimo: 4 GB de RAM (6-8 GB si Immich reconoce caras y objetos).'), ['docker', 'caddy', 'vaultwarden', 'immich', 'nextcloud']),
  ])
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
      ? { os: 'linux', installed: false, problem: 'missing', message: tr('Docker no está instalado en este equipo.'), viaGroup: false, canAutoFix: true, installCommand: 'apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io && systemctl enable --now docker && usermod -aG docker demo' }
      : { os: 'linux', installed: true, version: '27.5.1', problem: '', viaGroup: false, canAutoFix: true, installCommand: '' },
    server: { exists: false, running: false },
    keys: [
      { path: '/home/demo/.config/draupnode/prueba/id_prueba', label: tr('Clave sin contraseña') },
      { path: '/home/demo/.config/draupnode/prueba/id_prueba_con_frase', label: tr('Clave con contraseña'), passphrase: 'draupnode' },
      { path: '/home/demo/.config/draupnode/prueba/id_prueba_con_frase.ppk', label: tr('Clave PuTTY (.ppk) con contraseña'), passphrase: 'draupnode' },
    ],
    fingerprint: 'SHA256:3vXq0pXb0m2kQ9yJ8a1T5zR7cW4eN6uH2sL0fD9gK1o',
    host: '127.0.0.1', port: 2222, user: 'ubuntu', password: 'draupnode', coolifyUrl: 'http://127.0.0.1:18000', coolifyUp: false,
  }

  const info = (): SecretsInfo => {
    const b = (settings.secretBackend || 'auto') as SecretsInfo['backend']
    return {
      // ?sinllavero en la URL simula un equipo sin llavero del sistema.
      keyring: location.search.includes('sinllavero')
        ? { available: false, name: tr('Secret Service (GNOME Keyring / KWallet / KeePassXC)'), suggestions: [
            { name: tr('GNOME Keyring'), description: tr('El llavero de Ubuntu, Debian, Fedora y escritorios GNOME, Cinnamon, MATE o XFCE. Se desbloquea al iniciar sesión. Tras instalarlo, cierra sesión y vuelve a entrar.'), command: 'sudo apt install -y gnome-keyring libsecret-1-0 seahorse' },
            { name: 'KWallet', description: tr('El llavero de KDE Plasma. Actívalo en Preferencias del sistema → Cartera de KDE.'), command: 'sudo apt install -y kwalletmanager' },
            { name: 'KeePassXC', description: tr('Gestor de contraseñas libre. Activa «Integración con Secret Service» en sus ajustes y Draupnode lo usará como llavero.'), command: 'sudo apt install -y keepassxc' },
          ] }
        : { available: true, name: tr('GNOME Keyring (simulado)') },
      vault: { exists: vault.exists, unlocked: vault.unlocked, path: '(simulado)/vault.json', entries: 0 },
      backend: b,
      effective: b === 'vault' || location.search.includes('sinllavero') ? 'vault' : 'keyring',
    }
  }
  const needs = (s: Server) => s.authMethod === 'password' || (s.authMethod === 'key' && s.keyEncrypted)

  return {
    async AppInfo() {
      return { version: tr('demo navegador'), configDir: '(simulado)', os: 'browser', author: tr('Francisco Javier Pradas'), year: '2026', license: 'GPL-3.0-or-later', project: 'https://github.com/Franpradasespana/draupnode' }
    },
    async Legal() {
      return {
        notice: tr('Draupnode\nCopyright © 2026 Francisco Javier Pradas\n\n(En la demo del navegador solo se ve un resumen: la app de escritorio trae los textos completos.)'),
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
      if (m.length < 10) throw tr('la contraseña maestra debe tener al menos 10 caracteres')
      vault = { exists: true, unlocked: true, master: m }
    },
    async VaultUnlock(m) {
      await wait(400)
      if (m !== vault.master) throw tr('la contraseña maestra no es correcta')
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
      if (!s.name?.trim()) throw tr('el nombre es obligatorio')
      if (!s.host?.trim()) throw tr('la IP o el dominio es obligatorio')
      if (!s.user?.trim()) throw tr('el usuario es obligatorio')
      if (s.authMethod === 'key' && !s.keyPath) throw tr('elige el fichero de clave privada')
      const target = (storeChoice || info().effective) as 'keyring' | 'vault'
      if (saveSecret && secret && needs(s) && target === 'vault') {
        if (!vault.exists) throw tr('VAULT_MISSING: la bóveda cifrada aún no se ha creado')
        if (!vault.unlocked) throw tr('VAULT_LOCKED: la bóveda está bloqueada')
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
      if (path.endsWith('.pub')) return { path, name: path, format: '', encrypted: false, error: tr('eso es una clave PÚBLICA (.pub); elige la privada') }
      return { path, name: path.split('/').pop() ?? path, format: path.endsWith('.ppk') ? 'ppk' : 'pem', encrypted: true, keyType: 'ssh-rsa' }
    },
    async FindKeys() {
      return keys
    },
    async CloudProviders() {
      return [
        { id: 'hetzner', name: 'Hetzner Cloud', tokenUrl: 'https://console.hetzner.cloud/projects', tokenHelp: tr('En la consola de Hetzner: tu proyecto → Security → API tokens → Generate API token, con permiso «Read & Write».'), user: 'root', image: 'Ubuntu 24.04', hasToken: !!cloudTokens.hetzner },
        { id: 'digitalocean', name: 'DigitalOcean', tokenUrl: 'https://cloud.digitalocean.com/account/api/tokens', tokenHelp: tr('En DigitalOcean: API → Tokens → Generate New Token, con permisos de escritura (o los de droplet, ssh_key, regions y sizes).'), user: 'root', image: 'Ubuntu 24.04', hasToken: !!cloudTokens.digitalocean },
      ]
    },
    async CloudSetToken(provider, token) {
      await wait(600)
      if (!vault.exists) throw tr('VAULT_MISSING: no hay bóveda')
      if (!vault.unlocked) throw tr('VAULT_LOCKED: la bóveda está bloqueada')
      if (token.trim().length < 8) throw tr('el proveedor no acepta el token (401): comprueba que es correcto y que tiene permiso de escritura')
      cloudTokens[provider] = token
    },
    async CloudForgetToken(provider) {
      delete cloudTokens[provider]
    },
    async CloudCatalog(provider) {
      await wait(500)
      if (provider === 'hetzner') return {
        regions: [{ id: 'fsn1', label: 'Falkenstein (DE)', detail: 'fsn1' }, { id: 'hel1', label: 'Helsinki (FI)', detail: 'hel1' }, { id: 'nbg1', label: 'Nuremberg (DE)', detail: 'nbg1' }],
        sizes: [
          { id: 'cx22', label: 'CX22 · 2 vCPU · 4 GB RAM · 40 GB', priceMonth: 4.59, currency: 'EUR', ramMb: 4096 },
          { id: 'cx32', label: 'CX32 · 4 vCPU · 8 GB RAM · 80 GB', priceMonth: 7.59, currency: 'EUR', ramMb: 8192 },
          { id: 'cx42', label: 'CX42 · 8 vCPU · 16 GB RAM · 160 GB', priceMonth: 18.59, currency: 'EUR', ramMb: 16384 },
        ],
      }
      return {
        regions: [{ id: 'ams3', label: 'Amsterdam 3', detail: 'ams3' }, { id: 'fra1', label: 'Frankfurt 1', detail: 'fra1' }],
        sizes: [
          { id: 's-1vcpu-1gb', label: 's-1vcpu-1gb · 1 vCPU · 1 GB RAM · 25 GB', priceMonth: 6, currency: 'USD', ramMb: 1024 },
          { id: 's-2vcpu-4gb', label: 's-2vcpu-4gb · 2 vCPU · 4 GB RAM · 80 GB', priceMonth: 24, currency: 'USD', ramMb: 4096 },
        ],
      }
    },
    async CloudCreateServer(req) {
      if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(req.name)) throw tr('el nombre solo puede tener minúsculas, números y guiones (sin empezar ni acabar en guion)')
      const st = (stage: string) => mockEmit('cloud', { stage })
      st(tr('Preparando la clave SSH')); await wait(500)
      st(tr('Pidiendo el servidor al proveedor')); await wait(800)
      st(tr('El proveedor está creando el servidor…')); await wait(1500)
      st(tr('Esperando a que arranque su SSH ({0})…', '203.0.113.50')); await wait(1000)
      const srv: Server = { id: Math.random().toString(16).slice(2, 10), name: req.name, host: '203.0.113.50', port: 22, user: 'root', authMethod: 'key',
        keyPath: req.newKey ? '/home/demo/.config/draupnode/claves/' + req.provider + '-' + req.name : req.keyPath, keyEncrypted: false, secretStore: '', notes: '', createdAt: new Date().toISOString(),
        cloud: { provider: req.provider, id: '5' + Math.floor(Math.random() * 1e6), name: req.name, snapshotBeforeApply: true, keepSnapshots: 3 } } as Server
      servers = [...servers, srv]
      save('servers', servers)
      return srv
    },
    async LinkServerCloud(sid, provider) {
      await wait(700)
      const s = servers.find((x) => x.id === sid)!
      if (!cloudTokens[provider]) throw tr('falta el token de la API')
      s.cloud = { provider, id: '4' + Math.floor(Math.random() * 1e6), name: s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), snapshotBeforeApply: true, keepSnapshots: 3 }
      save('servers', servers)
      return s
    },
    async UnlinkServerCloud(sid) {
      const s = servers.find((x) => x.id === sid)!
      s.cloud = null
      save('servers', servers)
      return s
    },
    async SetSnapshotOptions(sid, before, keep) {
      const s = servers.find((x) => x.id === sid)!
      s.cloud = { ...s.cloud!, snapshotBeforeApply: before, keepSnapshots: keep }
      save('servers', servers)
      return s
    },
    async ServerSnapshots(sid) {
      await wait(500)
      const s = servers.find((x) => x.id === sid)!
      if (!s.cloud) throw tr('este servidor no está vinculado con su proveedor de nube')
      const snaps = load<Record<string, CloudSnapshot[]>>('instantaneas', {})[sid] ?? [
        { id: '901', name: 'draupnode-' + (s.cloud.name || 'web') + '-20261124-181205', created: new Date(Date.now() - 2 * 86400000).toISOString(), sizeGb: 3.2, draupnode: true },
        { id: '880', name: tr('antes de cambiar de Ubuntu'), created: new Date(Date.now() - 40 * 86400000).toISOString(), sizeGb: 2.1, draupnode: false },
      ]
      return { snapshots: snaps, pricePerGb: s.cloud.provider === 'hetzner' ? 0.0119 : 0.06, currency: s.cloud.provider === 'hetzner' ? 'EUR' : 'USD' }
    },
    async TakeServerSnapshot(sid) {
      const s = servers.find((x) => x.id === sid)!
      const st = (stage: string) => mockEmit('snapshot', { serverId: sid, stage })
      for (const p of [10, 45, 80]) { st(tr('{0} en el proveedor ({1} %, {2})…', tr('Haciendo la instantánea'), p, p / 5 + 's')); await wait(700) }
      const all = load<Record<string, CloudSnapshot[]>>('instantaneas', {})
      const cur = all[sid] ?? (await (this.ServerSnapshots as (id: string) => Promise<SnapshotInfo>)(sid)).snapshots
      const now = new Date()
      cur.unshift({ id: String(Date.now()), name: 'draupnode-' + (s.cloud?.name || 'web') + '-' + now.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-'), created: now.toISOString(), sizeGb: 3.3, draupnode: true })
      let n = 0
      all[sid] = cur.filter((x) => !x.draupnode || ++n <= (s.cloud?.keepSnapshots ?? 3))
      save('instantaneas', all)
      return ''
    },
    async RestoreServerSnapshot(sid) {
      for (const p of [20, 60, 95]) { mockEmit('snapshot', { serverId: sid, stage: tr('{0} en el proveedor ({1} %, {2})…', tr('Volviendo a la instantánea'), p, p / 5 + 's') }); await wait(700) }
    },
    async DeleteServerSnapshot(sid, id) {
      await wait(400)
      const all = load<Record<string, CloudSnapshot[]>>('instantaneas', {})
      const cur = all[sid] ?? (await (this.ServerSnapshots as (id: string) => Promise<SnapshotInfo>)(sid)).snapshots
      all[sid] = cur.filter((x) => x.id !== id)
      save('instantaneas', all)
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
      if (!s) return { status: 'error', message: tr('servidor no encontrado'), durationMs: 0 }
      const kind = s.authMethod === 'password' ? 'password' : 'passphrase'
      if (!secret && s.secretStore === 'vault' && !vault.unlocked) return { status: 'vault_locked', secretKind: kind, message: tr('Desbloquea la bóveda'), durationMs: 0 }
      const pass = secret || stored[id]
      const k = keys.find((x) => x.path === s.keyPath)
      if (s.authMethod === 'password' || k?.encrypted || s.keyEncrypted) {
        if (!pass) return { status: 'needs_secret', secretKind: kind, message: tr('falta la contraseña'), durationMs: 5 }
        if (pass !== 'demo') return { status: 'bad_secret', secretKind: kind, message: tr('la contraseña no es correcta (en la demo es «demo»)'), durationMs: 5 }
      }
      const fp = 'SHA256:q7Xh3N0d4Lr9kZ2mV8pYwE1bT6uC5sA0fG4hJ7kL9nM'
      if (!trusted.has(s.host)) {
        if (accept !== fp) return { status: 'unknown_host', secretKind: kind, message: tr('Es la primera vez que te conectas a este servidor. Comprueba que la huella es la suya antes de confiar.'), keyType: 'ssh-ed25519', fingerprint: fp, durationMs: 300 }
        trusted.add(s.host)
        save('trusted', [...trusted])
      }
      const facts = {
        os: tr('Ubuntu 24.04.3 LTS'), os_id: 'ubuntu', hostname: 'srv-' + s.name.toLowerCase().replace(/\W+/g, '-'),
        kernel: '6.8.0-1021-oracle', arch: 'aarch64', cpus: '4', mem_kb: '24557568',
        disk_free_kb: '151234560', disk_total_kb: '198743040', uptime: tr('up 12 days, 4 hours'),
        sudo: 'yes', has_python3: 'yes', has_docker: 'yes', has_git: 'yes', has_curl: 'yes', has_ansible: 'no',
      }
      servers = servers.map((x) => (x.id === id ? { ...x, lastCheck: { at: new Date().toISOString(), ok: true, facts, durationMs: 840 } } : x))
      save('servers', servers)
      return { status: 'ok', secretKind: kind, message: tr('Conexión correcta'), facts, durationMs: 840 }
    },
    async GetSettings() {
      // ?lang=en en la dirección de la demo manda (para las capturas en inglés).
      const q = new URLSearchParams(location.search).get('lang')
      return q ? { ...settings, language: q } : settings
    },
    async SaveSettings(s) {
      settings = { ...s, secretBackend: settings.secretBackend, language: settings.language }
      save('settings', settings)
    },
    async SetLanguage(lang) {
      settings = { ...settings, language: lang }
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
      if (!m) throw tr('no existe')
      if (rel !== 'module.yaml' && !rel.startsWith('role/')) throw tr('los ficheros van en module.yaml o dentro de role/')
      m.files[rel] = content
      m.problems = /\[[^\]]*$/m.test(content) ? [rel + tr(': yaml: línea 1: no se encontró el «]» de cierre')] : []
      return { ...m, files: Object.keys(m.files) }
    },
    async DeleteUserModuleFile(id, rel) {
      delete mockUserMods[id].files[rel]
      return { ...mockUserMods[id], files: Object.keys(mockUserMods[id].files) }
    },
    async CreateUserModule(id, from) {
      if (mockUserMods[id]) throw tr('ya tienes un módulo «{0}»', id)
      const v = id.replaceAll('-', '_') + '_'
      mockUserMods[id] = { id, name: from ? tr('Copia de ') + from : tr('Mi módulo'), problems: [], notes: [], files: {
        'module.yaml': `# Módulo propio de Draupnode.\nid: ${id}\nname: "Mi módulo"\nversion: 1.0.0\ncategory: 8 · Mis módulos\ndescription: "Una línea que diga qué hace."\ndepends: [base]\nvariables:\n  - name: ${v}paquetes\n    label: Paquetes que instalar\n    type: list\n    default: [htop, ncdu]\n`,
        'role/tasks/main.yml': `---
- name: Instalar paquetes
  ansible.builtin.apt:
    name: "{{ ${v}paquetes }}"
    state: present
`,
        'role/tasks/uninstall.yml': `---
- name: Quitar paquetes
  ansible.builtin.apt:
    name: "{{ ${v}paquetes }}"
    state: absent
`,
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
      return { file: '/home/usuario/Descargas/monitor-web.draupnode-modulo', ok: true, id: 'monitor-web', name: tr('Vigilar una web'), version: '1.2.0', description: tr('Comprueba cada 5 minutos que una web responde y avisa si no.'),
        draupnode: '0.58.2', exported: '23/11/2026 18:40', integrity: true,
        files: [{ path: 'module.yaml', size: yamlTxt.length, text: yamlTxt }, { path: 'role/tasks/main.yml', size: tasksTxt.length, text: tasksTxt }, { path: 'role/templates/vigilar.sh.j2', size: 120, text: '#!/bin/sh\ncurl -fsS -m 10 "{{ monitor_web_url }}" >/dev/null || logger -t vigilar-web "{{ monitor_web_url }} no responde"\n' }],
        problems: [], warnings: [tr('programa tareas periódicas (role/tasks/main.yml)')], tasks: [tr('apt × 1'), tr('cron × 1'), tr('template × 1')], commands: [], hosts: ['ejemplo.com'], images: [], depends: ['base'], conflict: mockUserMods['monitor-web'] ? 'user' : '' }
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
      if (Object.keys(chk.errors).length) throw tr('revisa los campos marcados en rojo')
      if (!p.name.trim()) throw tr('el nombre es obligatorio')
      if (!servers.some((x) => x.id === p.serverId)) throw tr('elige un servidor')
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
    async BackupVerify() {
      await wait(2500)
      return { status: 'ok', ok: true, verify: { at: Math.floor(Date.now() / 1000), duration: 42, ok: true, check: true, partial: false, files: 1834, bytes: 812 * 1024 ** 2, dumps: 3, dumpsBad: [], error: '' } }
    },
    async BackupNow() {
      await wait(1800)
      return { status: 'ok', ok: true, output: tr('[2026-11-20 03:30:01] Volcando PostgreSQL (pg-compartido)\n[2026-11-20 03:30:04] Copiando archivos\n[2026-11-20 03:30:05] Borrando copias viejas\n[2026-11-20 03:30:06] Comprobando el repositorio\n[2026-11-20 03:30:09] Copia terminada. 14 copias en total') }
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
      return { status: 'ok', ok: true, output: (replace ? tr('Cerrando las conexiones a {0} y borrándola…\n', db) : '') + tr('Base {0} restaurada desde la copia {1}.', db, snap) }
    },
    async BackupDownload(id, snap, paths, dest) {
      for (let d = 0; d <= 3_000_000; d += 1_000_000) {
        mockEmit('backupfetch', { projectId: id, done: d, total: 0, stage: tr('Descargando ') + paths[0] })
        await wait(250)
      }
      return { status: 'ok', ok: true, output: tr('4 fichero(s), 3220000 bytes, en {0}/copia-{1}', dest, snap), fetch: { dir: `${dest}/copia-${snap}`, bytes: 3_220_000, files: 4, at: new Date().toISOString() } }
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
        mockEmit('backupfetch', { projectId: id, done: d, total, stage: tr('Trayendo copias') })
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
      return { ok: !bad && !notInst, error: bad ? tr('{0} no se puede desinstalar: {1}', bad.name, bad.noUninstall ?? tr('no tiene desinstalación')) : notInst ? tr('no está instalado con esta plantilla en este servidor') : undefined,
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
        keep: stays.map((m) => ({ id: m, name: mod(m)?.name ?? m, warning: mod(m)?.noUninstall ?? tr('todavía no tiene desinstalación') })),
        check: { ok: remove.length > 0, error: remove.length ? undefined : tr('no hay nada que desinstalar'), modules: remove.map((m) => ({ id: m, name: mod(m)?.name ?? m, warning: mod(m)?.uninstallWarning, data: mod(m)?.uninstallData })),
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
      if (!p) return { status: 'error', message: tr('proyecto no encontrado') }
      const runId = Math.random().toString(16).slice(2, 8)
      setTimeout(() => {
        mockEmit('run', { runId, projectId: id, kind: 'ev', ev: { ev: 'stage', name: tr('Ejecutando Ansible') } })
        projects = projects.map((x) => (x.id === id ? { ...x, modules: x.modules.filter((m) => !mods.includes(m.id)), installedModules: (x.installedModules ?? []).filter((m) => !mods.includes(m)) } : x))
        save('projects', projects)
        mockEmit('run', { runId, projectId: id, kind: 'ev', ev: { ev: 'notice', msg: tr('Desinstalado del servidor (demo).') } })
        mockEmit('run', { runId, projectId: id, kind: 'done', summary: { at: new Date().toISOString(), check: false, ok: true, changed: mods.length, failed: 0, tasks: mods.length, durationMs: 1500, uninstall: true } })
      }, 1200)
      return { status: 'started', runId }
    },
    async SetProjectSecret(id, variable, value) {
      if (!vault.exists) throw tr('VAULT_MISSING: no hay bóveda')
      if (!vault.unlocked) throw tr('VAULT_LOCKED: la bóveda está bloqueada')
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
      setTimeout(() => out(tr('Welcome to Ubuntu 24.04.1 LTS (demo del navegador: no es un servidor de verdad)') + '\r\n\r\n' + mockTerms[id].prompt), 200)
      return { status: 'ok', id }
    },
    async TerminalInput(id, data) {
      const t = mockTerms[id]
      if (!t) return
      for (const ch of data) {
        if (ch === '\r') {
          const cmd = t.line.trim()
          t.line = ''
          const reply = cmd === '' ? '' : cmd === 'uptime' ? ' 10:21:07 up 3 days,  2:14,  1 user,  load average: 0.08, 0.05, 0.01\r\n' : cmd === 'exit' ? '' : tr('{0}: (demo) aquí verías la salida real', cmd.split(' ')[0]) + '\r\n'
          t.out('\r\n' + reply)
          if (cmd === 'exit') { delete mockTerms[id]; mockEmit('term', { id, closed: true, reason: tr('Sesión terminada.') }); return }
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
      if (mockTerms[id]) { delete mockTerms[id]; mockEmit('term', { id, closed: true, reason: tr('Sesión terminada.') }) }
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
      if (password.length < 10) throw tr('la contraseña de la copia debe tener al menos 10 caracteres')
      save('lastExport', new Date().toISOString())
      return '/home/demo/draupnode-copia-' + new Date().toISOString().slice(0, 10) + '.draupnode'
    },
    async ChooseBackupFile() {
      return '/home/demo/draupnode-copia.draupnode'
    },
    async InspectBackup(_p, password) {
      await wait(600)
      if (password !== 'copia-de-prueba') throw tr('la contraseña no es correcta o el fichero está dañado')
      return { version: 1, created: new Date().toISOString(), app: '0.39.0', servers: servers.length, templates: 3, deployments: projects.length, vaultEntries: 6, keyring: 1, modules: 0, keys: [] }
    },
    async ImportBackup() {
      await wait(800)
      return { notes: [tr('La bóveda se abre con la contraseña maestra que tenía cuando hiciste la copia.')], safety: '/home/demo/.config/draupnode/antes-de-importar' }
    },
    async FetchProjectSecrets(id) {
      await wait(900)
      if (!vault.exists) return { status: 'vault_missing', count: 0 }
      if (!vault.unlocked) return { status: 'vault_locked', count: 0 }
      const p = projects.find((x) => x.id === id)
      if (!p?.appliedAt) return { status: 'error', message: tr('en el servidor no hay contraseñas de esta plantilla todavía: se generan la primera vez que pulsas Aplicar'), count: 0 }
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
      if (!vault.exists) throw tr('no hay bóveda')
      if (master !== vault.master) throw tr('la contraseña de la bóveda no es correcta')
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
      if (!p) return { status: 'error', message: tr('proyecto no encontrado') }
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
      return { project: p, notes: [tr('Se ha creado la plantilla «{0}».', m.plantilla || m.nombre)] }
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
        'fix-missing': [tr('Instalando Docker (te pedirá tu contraseña)…'), tr('Leyendo lista de paquetes…'), tr('Configurando docker.io…')],
        'fix-permission': [tr('Añadiendo tu usuario al grupo docker (te pedirá tu contraseña)…')],
        'fix-daemon': [tr('Arrancando el servicio de Docker…')],
        start: ['==> Construyendo la imagen Ubuntu 24.04 (la primera vez tarda unos minutos)', '#5 [2/6] RUN apt-get update && apt-get install -y systemd openssh-server sudo python3…', tr('#9 exporting to image'), '==> Creando el contenedor', '==> Esperando a que arranque systemd', '==> Instalando las claves SSH', tr('Listo: ssh -p 2222 ubuntu@127.0.0.1')],
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
      const srv = { id: existing?.id ?? 'lab', name: tr('Servidor de pruebas (Docker)'), host: '127.0.0.1', port: 2222, user: 'ubuntu', authMethod: 'key', keyPath: lab.keys[0].path, keyEncrypted: false, secretStore: '', notes: tr('Ubuntu 24.04 en un contenedor Docker de este equipo.') } as Server
      servers = existing ? servers.map((x) => (x.id === srv.id ? srv : x)) : [...servers, srv]
      trusted.add('127.0.0.1')
      save('servers', servers)
      return srv
    },
    async AlertsRun(_id, what) {
      await wait(700)
      return what === 'prueba'
        ? { status: 'ok', ok: true, output: tr('Aviso de prueba enviado.') }
        : { status: 'ok', ok: true, output: tr('Disco / al 91 % (libres 2210 MB).') }
    },
    async SaveTextFile(name) {
      await wait()
      return '/home/demo/' + name
    },
    async CreateBackupTarget(srcId, tgtServerId, port) {
      await wait(500)
      const src = projects.find((p) => p.id === srcId)
      const srv = servers.find((s) => s.id === tgtServerId)
      if (!src || !srv) throw new Error(tr('no encontrado'))
      if (srv.host.startsWith('127.')) throw new Error(tr('ese servidor se conecta por ') + srv.host + tr(', que el servidor de origen no puede alcanzar'))
      let tgt = projects.find((p) => p.serverId === tgtServerId && p.modules.some((m) => m.id === 'backup-target'))
      const isNew = !tgt
      if (!tgt) {
        let rec = recipes.find((r) => r.modules.some((m) => m.id === 'backup-target'))
        if (!rec) {
          rec = { id: 'r' + Date.now(), name: tr('Servidor de copias'), notes: tr('Recibe las copias de otros servidores (solo añadir) y borra las viejas.'), modules: [{ id: 'base', values: defaults('base') }, { id: 'docker', values: defaults('docker') }, { id: 'firewall', values: defaults('firewall') }, { id: 'backup-target', values: defaults('backup-target') }] }
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
      return { targetProjectId: tgt.id, targetProjectName: tgt.name, targetIsNew: isNew, url, notes: [tr('Aplica primero «{0}» (en {1}) y después este servidor.', tgt.name, srv.name)] }
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
    async BuiltinMissing() {
      return 0
    },
    async RestoreBuiltinTemplates() {
      return 0
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
      const notes = [added.length ? tr('Añadidos: {0} módulo(s). Se instalan al pulsar Aplicar.', added.length) : tr('El servidor ya tenía todos sus módulos: no se ha añadido ninguno.')]
      if (kept.length) notes.push(tr('Ya estaban (se mantiene su configuración): {0} módulo(s).', kept.length))
      return { project: p, recipe: r, notes }
    },
    async ModulesToTemplate(sid, ids, rid, name) {
      await wait()
      const p = serverProject(sid)
      let r: Recipe
      if (rid) r = recipes.find((x) => x.id === rid)!
      else {
        if (!name.trim()) throw new Error(tr('ponle un nombre a la plantilla nueva'))
        if (recipes.some((x) => x.name.toLowerCase() === name.trim().toLowerCase())) throw new Error(tr('ya hay una plantilla «{0}»: elígela en «añadir a una existente»', name.trim()))
        r = { id: 'r' + Date.now(), name: name.trim(), modules: [] }
      }
      r = { ...r, modules: [...r.modules.filter((m) => !ids.includes(m.id)), ...p.modules.filter((m) => ids.includes(m.id)).map((m) => ({ id: m.id, values: JSON.parse(JSON.stringify(m.values)) }))] }
      recipes = recipes.some((x) => x.id === r.id) ? recipes.map((x) => (x.id === r.id ? r : x)) : [...recipes, r]
      for (const m of p.modules) if (ids.includes(m.id)) m.from = r.id
      p.templates = [...new Set([...(p.templates ?? []), r.id])]
      save('recipes', recipes)
      save('projects', projects)
      return { project: p, recipe: r, notes: [rid ? tr('Plantilla «{0}» actualizada. Los demás servidores en los que se aplicó no cambian.', r.name) : tr('Plantilla «{0}» creada con {1} módulo(s).', r.name, ids.length)] }
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
      if (!repo) return { status: 'error', message: tr('Escribe primero la dirección del repositorio (https://… o git@…).'), composeFound: false, vars: [] }
      if (/bootstrap/.test(repo)) return { status: 'ok', commit: tr('ac35207 feat(collapse): add .collapse-instant'), composeFound: false, vars: [] }
      const v = (key: string, o: Partial<GitEnvVar>): GitEnvVar => ({ key, inExample: true, inCompose: false, hasDefault: false, secret: false, external: false, ...o })
      return { status: 'ok', commit: tr('a1b2c3d Primera versión'), composeFound: true, exampleFile: '.env.example', postCommand: tr('python3 manage.py migrate'), postService: 'web', vars: [
        v('ALLOWED_HOSTS', { example: 'localhost' }), v('DATABASE_URL', { example: 'postgres://app:pass@db:5432/app', hint: tr('dirección: si lleva usuario y contraseña, escríbela entera') }),
        v('DEBUG', { example: 'False' }), v('PORT', { inExample: false, inCompose: true, hasDefault: true }),
        v('POSTGRES_PASSWORD', { inCompose: true, secret: true, hint: tr('contraseña o clave de la app: se puede generar al azar') }),
        v('SECRET_KEY', { inCompose: true, secret: true, hint: tr('contraseña o clave de la app: se puede generar al azar') }),
        v('STRIPE_API_KEY', { inExample: false, inCompose: true, external: true, hint: tr('clave de otro servicio: solo la tienes tú') }),
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
        { type: 'Local Volumes', total: '6', active: '4', size: '154.5MB', reclaimable: tr('73.3MB (47%)') },
        { type: 'Build Cache', total: '52', active: '0', size: '1.07GB', reclaimable: '888.4MB' },
      ] }
    },
    async DockerPrune(_s, what) {
      await wait(900)
      return { status: 'ok', output: what.map((w: string) => (w === 'images' ? tr('== Imágenes sin usar\nTotal reclaimed space: 1.66GB') : w === 'build' ? tr('== Caché de construcción\nTotal reclaimed space: 888.4MB') : tr('== Contenedores parados\nTotal reclaimed space: 0B'))).join('\n') }
    },
    async ServerUpgrade() {
      await wait(1500)
      return { status: 'ok', output: tr('12 actualizados, 0 nuevos se instalarán, 0 para eliminar y 0 no actualizados.\n== Hace falta reiniciar el servidor para terminar.') }
    },
    async ServerReboot() {
      await wait(400)
      return { status: 'ok', output: 'reiniciando' }
    },
    async ServerHistory(_s, enable) {
      await wait(800)
      mockHistoryOn = enable
      return { status: 'ok', output: enable ? tr('Historial activado: una muestra cada 5 minutos.') : tr('Historial desactivado.') }
    },
    async RemoveOrphanApp(_s, name, purge) {
      await wait(700)
      return { status: 'ok', output: tr('== Contenedores\nContainer dn-{0}-1 Removed{1}\n== Carpeta\nborrada /srv/draupnode/apps/{2}', name, purge ? tr('\nVolume dn-') + name + tr('_db_data Removed') : '', name) }
    },
    async PublishDockerApp(dir, spec, sid) {
      await wait(500)
      const p = serverProject(sid)
      const id = p.modules.some((m) => m.id === 'git-app') ? 'git-app@' + spec.name.replace(/[^a-z0-9]/g, '') : 'git-app'
      p.modules.push({ id, values: { ...defaults('git-app'), git_app_source: 'carpeta', git_app_local_dir: dir, git_app_name: spec.name, git_app_compose: 'docker-compose.yml', git_app_port: 8000, git_app_env: ['DJANGO_DEBUG=false', 'DB_ENGINE=postgres'], git_app_env_generate: ['DB_PASSWORD', 'DJANGO_SECRET_KEY'] } })
      p.updatedAt = new Date().toISOString()
      save('projects', projects)
      return { projectId: p.id, serverId: sid, moduleId: id, notes: [tr('«{0}» añadida a los módulos del servidor: sale de {1}; Draupnode la sube al aplicar.', spec.name, dir)], review: [tr('EMAIL_HOST: clave de otro servicio, solo la tienes tú')] }
    },
    async CheckDrift(sid) {
      await wait(1800)
      const p = serverProject(sid)
      const prev = load<Record<string, DriftReport>>('desvios', {})[sid]
      const rep: DriftReport = { at: new Date().toISOString(), items: [], accepted: prev?.accepted ?? [], duration: 41000 }
      if (!p.installedModules?.length) rep.skipped = 'never'
      else if (p.modules.some((m) => !(p.installedModules ?? []).includes(m.id))) rep.skipped = 'pending'
      else if (sid !== 'lab') {
        rep.items = [
          { kind: 'config', module: 'caddy', name: 'Caddyfile (se comprueba antes de ponerlo)', key: 'config:caddy:Caddyfile', diff: '--- before: /etc/caddy/Caddyfile\n+++ after: /etc/caddy/Caddyfile\n@@ -12,4 +12,3 @@\n     reverse_proxy 127.0.0.1:3001\n }\n-# probado a mano\n-tienda.example.com { reverse_proxy 127.0.0.1:9000 }\n' },
          { kind: 'timer', name: 'draupnode-copia-produccion.timer', key: 'timer:draupnode-copia-produccion.timer' },
        ]
      }
      const all = load<Record<string, DriftReport>>('desvios', {})
      all[sid] = rep
      save('desvios', all)
      return { status: 'ok', report: rep }
    },
    async CheckImages(sid) {
      await wait(1500)
      const all = load<Record<string, ImageReport>>('imagenes', {})
      const done = load<string[]>('imagenes-actualizadas', [])
      const ci = (image: string, containers: string[], project: string, dir: string, status: ImageInfo['status'], coolify = false): ImageInfo =>
        ({ image, containers, compose: project ? [{ project, dir, files: dir + '/docker-compose.yml' }] : [], coolify, status: status === 'new' && done.includes(sid + ':' + project) ? 'same' : status })
      const rep: ImageReport = { at: new Date().toISOString(), images: sid === 'lab'
        ? [ci('louislam/uptime-kuma:2', ['dn-uptime-kuma'], 'dn-uptime-kuma', '/srv/draupnode/apps/uptime-kuma', 'same')]
        : [
          ci('ghcr.io/coollabsio/coolify:4', ['coolify'], 'source', '/data/coolify/source', 'new', true),
          ci('grafana/grafana-oss:11.3.1', ['dn-grafana'], 'draupnode-monitor', '/srv/draupnode/monitor', 'same'),
          ci('prom/prometheus:v2.55.1', ['dn-prometheus'], 'draupnode-monitor', '/srv/draupnode/monitor', 'same'),
          ci('vaultwarden/server:latest', ['dn-vaultwarden'], 'dn-vaultwarden', '/srv/draupnode/apps/vaultwarden', 'new'),
          ci('postgres:16-alpine', ['pg-compartido'], 'draupnode-postgres', '/srv/draupnode/postgres', 'new'),
          ci('tienda-web', ['dn-tienda-web-1'], 'dn-tienda', '/srv/draupnode/apps/tienda', 'local'),
        ] }
      all[sid] = rep
      save('imagenes', all)
      return { status: 'ok', report: rep }
    },
    async FilesList(_sid, dir) {
      await wait(250)
      const fs = demoFS()
      const d = fs[dir]
      if (!d) return { status: 'error', message: tr('no existe') }
      return { status: 'ok', path: dir, entries: d }
    },
    async FilesRead(_sid, file) {
      await wait(250)
      const c = demoFiles[file]
      if (c === undefined) return { status: 'ok', path: file, binary: true, message: tr('no es un fichero de texto: descárgalo') }
      return { status: 'ok', path: file, content: c, size: c.length }
    },
    async FilesWrite(_sid, file, content) {
      await wait(400)
      demoFiles[file] = content
      return { status: 'ok', path: file }
    },
    async FilesMkdir(_sid, dir) { await wait(200); return { status: 'ok', path: dir } },
    async FilesRename(_sid, _f, to) { await wait(200); return { status: 'ok', path: to } },
    async FilesDelete(_sid, target) { await wait(200); return { status: 'ok', path: target } },
    async FilesDownload(_sid, target, isDir) { await wait(700); return { status: 'ok', path: target, saved: '/home/demo/Descargas/' + target.split('/').pop() + (isDir ? '.tar.gz' : ''), size: 48213 } },
    async FilesUpload(_sid, dir) { await wait(700); return { status: 'ok', path: dir, count: 2 } },
    async CheckDomains(sid) {
      await wait(900)
      const all = load<Record<string, DomainReport>>('dominios', {})
      const extra = all[sid]?.extra ?? []
      const ip = servers.find((x) => x.id === sid)?.host ?? ''
      const ok = (domain: string, source: string, days: number, ms: number): DomainCheck => ({ domain, source, ips: [ip], pointsHere: true, status: 200, timeMs: ms, certDays: days, certIssuer: "Let's Encrypt", certValid: true, redirect: true, httpStatus: 308 })
      const doms: DomainCheck[] = sid === 'lab' ? [] : [
        ok('coolify.example.com', 'Coolify', 61, 182),
        ok('tienda.example.com', 'Coolify', 12, 240),
        { domain: 'blog.example.com', source: 'Coolify', ips: ['198.51.100.23'], pointsHere: false, webError: tr('no contesta (tiempo agotado)'), certValid: false, certError: tr('no contesta (tiempo agotado)'), redirect: false },
        ok('grafana.example.com', 'Caddy', 74, 95),
      ]
      for (const d of extra) doms.push({ domain: d, source: 'manual', ips: [], pointsHere: false, dnsError: tr('el dominio no existe en el DNS'), certValid: false, redirect: false })
      all[sid] = { at: new Date().toISOString(), serverIp: ip, domains: doms.sort((a, b) => a.domain.localeCompare(b.domain)), extra }
      save('dominios', all)
      return all[sid]
    },
    async DNSProviders() {
      return [
        { id: 'cloudflare', name: 'Cloudflare', hasToken: !!cloudTokens['dns:cloudflare'], tokenUrl: 'https://dash.cloudflare.com/profile/api-tokens', tokenHelp: tr('En Cloudflare: Mi perfil → API Tokens → Create Token → plantilla «Edit zone DNS», con tu dominio en «Zone Resources».') },
        { id: 'digitalocean', name: 'DigitalOcean', hasToken: !!cloudTokens.digitalocean, tokenUrl: 'https://cloud.digitalocean.com/account/api/tokens', tokenHelp: tr('En DigitalOcean: API → Tokens → Generate New Token, con permiso de escritura (o el de «domain»). Es el mismo token que para crear servidores.') },
      ]
    },
    async SetDNSToken(provider, token) {
      await wait(500)
      if (!vault.exists) throw tr('VAULT_MISSING: no hay bóveda')
      if (!vault.unlocked) throw tr('VAULT_LOCKED: la bóveda está bloqueada')
      if (token.trim().length < 8) throw tr('el proveedor no acepta el token (403): comprueba que es correcto y que puede editar el DNS')
      cloudTokens[provider === 'digitalocean' ? provider : 'dns:' + provider] = token
    },
    async PointDomain(sid, domain) {
      await wait(900)
      const ip = servers.find((x) => x.id === sid)?.host ?? ''
      const all = load<Record<string, DomainReport>>('dominios', {})
      const d = all[sid]?.domains.find((x) => x.domain === domain)
      const before = d?.ips[0]
      if (d) { d.ips = [ip]; d.pointsHere = true; delete d.dnsError; save('dominios', all) }
      return { zone: domain.split('.').slice(-2).join('.'), action: before ? 'updated' : 'created', before, ip }
    },
    async LastDomainChecks() {
      return load<Record<string, DomainReport>>('dominios', {})
    },
    async SetExtraDomains(sid, domains) {
      const all = load<Record<string, DomainReport>>('dominios', {})
      const bad = domains.find((d) => !/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]+$/i.test(d.trim()))
      if (bad) throw tr('«{0}» no es un dominio válido', bad)
      all[sid] = { ...(all[sid] ?? { at: new Date().toISOString(), serverIp: '', domains: [] }), extra: domains.map((d) => d.trim().toLowerCase()) }
      save('dominios', all)
      return all[sid]
    },
    async LastImageChecks() {
      return load<Record<string, ImageReport>>('imagenes', {})
    },
    async UpdateImages(sid, projects) {
      await wait(2200)
      save('imagenes-actualizadas', [...load<string[]>('imagenes-actualizadas', []), ...projects.map((p) => sid + ':' + p)])
      const r = await (this.CheckImages as (id: string) => Promise<ImagesResult>)(sid)
      return { ...r, output: projects.map((p) => `== ${p}\n Image Pulled\n Container Recreated\n Container Started`).join('\n') }
    },
    async LastDrifts() {
      return load<Record<string, DriftReport>>('desvios', {})
    },
    async AcceptDrift(sid, keys) {
      const all = load<Record<string, DriftReport>>('desvios', {})
      const r = all[sid]
      r.accepted = [...new Set([...(r.accepted ?? []), ...(keys.length ? keys : r.items.map((i) => i.key))])]
      save('desvios', all)
      return r
    },
    async ForgetAcceptedDrift(sid) {
      const all = load<Record<string, DriftReport>>('desvios', {})
      all[sid].accepted = []
      save('desvios', all)
      return all[sid]
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
        system: { hostname: lab ? 'servidor-prueba' : 'srv-web', os: tr('Ubuntu 24.04.1 LTS'), kernel: '6.8.0-49-generic', uptime: 3 * 86400 + 5 * 3600, load: [0.42, 0.38, 0.31], cpus: 4, cpu: 12.5, memTotal: 24 * gb, memAvailable: 15.2 * gb, swapTotal: 2 * gb, swapFree: 1.9 * gb },
        disks: [{ mount: '/', size: 194 * gb, used: 61 * gb, free: 133 * gb }],
        containers: [
          { id: 'a1', name: 'coolify', image: 'ghcr.io/coollabsio/coolify:4', state: 'running', health: 'healthy', started: '', restarts: 0, compose: 'source', draupnode: '', coolify: '', ports: [tr('0.0.0.0:8000->8080/tcp')], cpu: '1.20%', mem: '412MiB', app: 'source', cpuP: 1.20, memB: 432013312 },
          { id: 'a2', name: 'coolify-proxy', image: 'traefik:v3.1', state: 'running', health: '', started: '', restarts: 0, compose: 'coolify-proxy', draupnode: '', coolify: '', ports: [tr('0.0.0.0:80->80/tcp'), tr('0.0.0.0:443->443/tcp')], cpu: '0.30%', mem: '58MiB', app: 'coolify-proxy', cpuP: 0.30, memB: 60817408 },
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
        draupnode: { markers: [{ draupnode: '0.41.0', at: new Date(Date.now() - 40 * 86400000).toISOString(), nombre: tr('Copias'), plantilla: tr('Copias diarias'), slug: 'copias', modulos: [{ id: 'docker', values: {} }, { id: 'backups', values: {} }] }], secretDirs: ['copias'], appDirs: [] },
        software: [{ module: 'docker', active: true }, { module: 'nginx', active: true }, { module: 'coolify', active: true }, { module: 'backups', active: true }],
        backups: [{ slug: 'copias', ok: true, running: false, ago: lab ? 3 * 3600 : 30 * 3600, verifyTimer: true, verify: { at: Math.floor(Date.now() / 1000) - 3 * 86400, duration: 41, ok: true, check: true, partial: false, files: 1834, bytes: 812 * 1024 ** 2, dumps: 3, dumpsBad: [], error: '' } }],
        updates: lab ? { total: 0, security: 0, reboot: false, packages: [] } : { total: 12, security: 3, reboot: true, packages: ['openssl', 'libssl3', 'linux-image-generic', 'curl'], rebootFor: ['linux-image-6.8.0-52-generic'] },
        clock: { synced: true, known: true, timezone: 'Europe/Madrid' },
        security: lab ? { failed24h: 0, ips: 0, top: [], fail2ban: null } : { failed24h: 412, ips: 37, top: [{ ip: '198.51.100.23', count: 96 }, { ip: '203.0.113.77', count: 41 }], fail2ban: { banned: 6, total: 58 } },
        autoupdate: lab ? [] : [{ slug: 'produccion', active: true, next: Math.floor(Date.now() / 1000) + 9 * 3600, last: { at: Math.floor(Date.now() / 1000) - 15 * 3600, ok: true, updated: ['dn-vaultwarden'], same: ['draupnode-monitor', 'dn-uptime-kuma'], rolledBack: [], failed: [], backup: true, duration: 312 } }],
        hardening: lab ? { ssh: { password: true, kbd: false, root: 'no', port: 22 }, autoUpdates: true, auditd: false }
          : { ssh: { password: false, kbd: false, root: 'prohibit-password', port: 22 }, autoUpdates: true, lynis: { index: 66, warnings: 1, suggestions: 31, ago: 2 * 86400 }, trivy: { vulns: 14, images: 5, failed: 0, ago: 3 * 86400 }, auditd: false },
        certs: lab ? [] : [{ domain: 'estado.ejemplo.com', days: 12, issuer: tr('Let\'s Encrypt') }],
        history: mockHistory(lab),
      } }
    },
    async ServerLogs(_id, kind, name) {
      await wait(400)
      const now = new Date().toISOString()
      return { status: 'ok', text: Array.from({ length: 12 }, (_, i) => tr('{0} {1}[{2}]: línea de ejemplo {3} del registro', now, kind === 'container' ? name : 'srv-web ' + (name || 'systemd'), 100 + i, i + 1)).join('\n') }
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
        evidence: st === 'python' ? [tr('Hay manage.py: proyecto Django (módulo config).'), tr('requirements.txt incluye psycopg: usa PostgreSQL.'), tr('Variables de entorno sacadas de .env.example: SECRET_KEY, DB_PASSWORD.')] : [tr('Tipo elegido a mano.')],
        warnings: [], existing: [], alternatives: st === 'python' ? ['node'] : ['python'],
      }
    },
    async DefaultDockerSpec(stack, name) {
      return mockSpec(stack, name)
    },
    async GenerateDocker(_dir, spec) {
      await wait(120)
      if (!/^[a-z0-9-]+$/.test(spec.name)) return { files: [], errors: [tr('el nombre solo puede tener minúsculas, números y guiones')] }
      const files = [
        { name: 'Dockerfile', content: `# Generado por Draupnode (demo)\nFROM ${spec.stack}:${spec.version}-slim\nWORKDIR /app\nCOPY . .\nEXPOSE ${spec.port}\nCMD ${JSON.stringify(spec.start.split(' '))}\n`, exists: false },
        { name: 'docker-compose.yml', content: `services:\n  ${spec.name}:\n    build: .\n    ports:\n      - "${spec.hostPort || spec.port}:${spec.port}"\n`, exists: false },
        { name: '.dockerignore', content: '.git\n.env\n__pycache__\n', exists: false },
        ...(spec.proxy ? [{ name: 'nginx.conf', content: `server {
    listen 80;
    server_name ${spec.proxyDomain || '_'};
    location / {
        proxy_pass http://${spec.name}:${spec.port};
    }
}
`, exists: false }] : []),
      ]
      return { files, errors: [] }
    },
    async WriteDockerFiles() {
      await wait()
      return ['Dockerfile', 'docker-compose.yml', '.dockerignore']
    },
    async BuildDockerImage(_dir, spec) {
      const lines = [tr('#1 [internal] load build definition from Dockerfile'), tr('#2 [internal] load metadata'), tr('#5 [2/4] RUN pip install -r requirements.txt'), tr('#8 exporting to image'), tr('#8 naming to draupnode-prueba/') + spec.name + tr(':latest done')]
      lines.forEach((t, i) => setTimeout(() => mockEmit('dockerbuild', { kind: 'line', text: t }), 300 * (i + 1)))
      setTimeout(() => mockEmit('dockerbuild', { kind: 'done', ok: true, image: 'draupnode-prueba/' + spec.name + ':latest', secs: 2 }), 300 * (lines.length + 1))
    },
    async CancelDockerBuild() {
      return false
    },
    async DockerLabTest(_dir, spec) {
      const st = [tr('Comprobando Docker en este equipo'), tr('Creando el servidor de pruebas (la primera vez tarda unos minutos)'), tr('Preparando Docker dentro del servidor de pruebas'), tr('Subiendo el proyecto'), tr('Construyendo y arrancando (puede tardar)'), tr('Comprobando que responde')]
      st.forEach((t, i) => setTimeout(() => mockEmit('dockerlab', { kind: 'stage', text: t }), 400 * (i + 1)))
      setTimeout(() => mockEmit('dockerlab', { kind: 'line', text: tr('#8 naming to docker.io/library/') + spec.name + tr(':latest done') }), 2300)
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
      if (!srv) throw new Error(tr('servidor no encontrado'))
      await new Promise((r) => setTimeout(r, 250))
      if (srv.host === '127.0.0.1' && srv.port === 2222) {
        return lab.server.running
          ? { reachable: true, latencyMs: 1, ...(lab.coolifyUp ? { webUrl: lab.coolifyUrl, webLabel: tr('Coolify') } : {}) }
          : { reachable: false, latencyMs: 0, error: tr('no responde') }
      }
      return { reachable: true, latencyMs: 38, webUrl: `http://${srv.host}:8000`, webLabel: tr('Coolify') }
    },
    async ConfigHistory() {
      return []
    },
    async RestoreConfigVersion() {},
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
      out.push({ kind: 'generated', module: tr('PostgreSQL compartido'), label: tr('Superusuario «postgres»'), name: 'postgres_superusuario', value: 'Xr7Qp2LmV9sKdT4wNbHc8ZyF3jAeUg6P' })
      for (const db of (p.modules.find((m) => m.id === 'postgres')?.values.postgres_databases as string[] | undefined) ?? [])
        out.push({ kind: 'generated', module: tr('PostgreSQL compartido'), label: tr('Usuario de la base'), name: 'postgres_' + db, value: 'Hm3Ws8KqZ1vPx6DnRt4YbLc9Fj2Ga7Ue' })
    }
    if (ids.includes('alerts')) {
      out.push({ kind: 'generated', module: tr('Alertas al móvil'), label: tr('Tema de ntfy (para suscribirte)'), name: 'alerts_ntfy_topic', value: 'demo7k2p9xq4m8w3r5t1z6v0b' })
    }
    if (ids.includes('wireguard')) {
      const v = p.modules.find((m) => m.id === 'wireguard')?.values ?? {}
      ;((v.wireguard_peers as string[] | undefined) ?? ['portatil', 'movil']).forEach((d, i) => out.push({
        kind: 'generated', module: tr('WireGuard (VPN)'), label: tr('Configuración WireGuard del dispositivo'), name: `wireguard_${d}.conf`,
        value: `# WireGuard · ${d} (demo)\n[Interface]\nPrivateKey = cDemoNoUsarEstaClave${i}AAAAAAAAAAAAAAAAAAAAAAA=\nAddress = 10.8.0.${i + 2}/32\n\n[Peer]\nPublicKey = sDemoServidorAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\nEndpoint = 203.0.113.10:51820\nAllowedIPs = 10.8.0.0/24\nPersistentKeepalive = 25\n`,
      }))
    }
    if (ids.includes('coolify') && p.modules.find((m) => m.id === 'coolify')?.values.coolify_admin_email)
      out.push({ kind: 'generated', module: tr('Coolify'), label: tr('Administrador de Coolify'), name: 'coolify_admin',
        value: tr('Usuario: admin\nCorreo: {0}\nContraseña: Tq5Nv2Bx8KmPz4Wr7Ld3Hs6F-Aa9', p.modules.find((m) => m.id === 'coolify')?.values.coolify_admin_email) })
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
          if (bad.length) (errors[pm.id] ||= {})[v.name] = `«${bad[0]}»: ${v.patternHelp ?? tr('formato no válido')}`
        }
      }
    }
    const has = (id: string) => order.includes(id)
    const tips: string[] = []
    if (has('authelia') && has('keycloak')) tips.push(tr('Authelia y Keycloak llevan cada uno sus propios usuarios: Authelia no puede usar los de Keycloak. Si quieres un único sitio de usuarios, quita Authelia y pon «Inicio de sesión con Keycloak» (oauth2-proxy) delante de las apps sin inicio de sesión propio; las que admiten OIDC o SAML (Nextcloud, Forgejo, Grafana, Immich…), conéctalas a Keycloak directamente.'))
    if (has('keycloak') && !has('authelia') && !has('oauth2-proxy')) tips.push(tr('Con «Inicio de sesión con Keycloak» (oauth2-proxy) puedes proteger con tus usuarios de Keycloak también las apps que no tienen inicio de sesión propio.'))
    if (has('beszel') && has('monitoring')) tips.push(tr('Beszel y «Monitorización» (Prometheus + Grafana) vigilan lo mismo: con uno basta. Beszel gasta mucho menos; Grafana da más detalle y paneles propios.'))
    if (has('stalwart') && has('msmtp')) tips.push(tr('El correo del servidor (msmtp) puede salir por tu propio Stalwart: en «Correo saliente», servidor 127.0.0.1, puerto 587 y un buzón de Stalwart como usuario.'))
    if (has('listmonk') && !has('stalwart') && !has('msmtp')) tips.push(tr('Listmonk necesita un servidor SMTP para enviar: ponlo en su web (Settings → SMTP), o añade Stalwart para tener el tuyo.'))
    return { order, added: order.filter((x) => !want.includes(x)), errors, general: want.length ? [] : [tr('elige al menos un módulo')], warnings: [], tips }
  }
  function mockRun(p: Project, runId: string, check: boolean) {
    const ev = (e: Partial<RunEvent>) => mockEmit('run', { runId, projectId: p.id, ...e })
    const steps: [number, Partial<RunEvent>][] = []
    let t = 0
    const at = (ms: number, e: Partial<RunEvent>) => steps.push([(t += ms), e])
    at(200, { kind: 'ev', ev: { ev: 'stage', name: tr('Preparando Ansible en /opt/draupnode/venv (solo la primera vez, 1-2 minutos)') } })
    at(900, { kind: 'ev', ev: { ev: 'stage', name: tr('Desempaquetando el proyecto') } })
    at(300, { kind: 'ev', ev: { ev: 'stage', name: tr('Ejecutando Ansible') } })
    at(200, { kind: 'ev', ev: { ev: 'play', name: tr('Draupnode · ') + p.name } })
    at(200, { kind: 'ev', ev: { ev: 'task', name: tr('Gathering Facts'), role: '' } })
    at(500, { kind: 'ev', ev: { ev: 'ok', changed: false } })
    for (const n of [tr('Comprobar el sistema operativo'), tr('Comprobar la memoria RAM (mínimo 1800 MB)'), tr('Carpeta de secretos del proyecto')]) {
      at(150, { kind: 'ev', ev: { ev: 'task', name: tr('draupnode_preflight : ') + n, role: 'draupnode_preflight' } })
      at(250, { kind: 'ev', ev: { ev: 'ok', changed: false } })
    }
    let changed = 0
    for (const m of p.modules) {
      const names: Record<string, string[]> = {
        base: [tr('Actualizar el índice de paquetes'), tr('Instalar paquetes básicos'), tr('Fijar la zona horaria (Europe/Madrid)'), tr('Activar el swap')],
        firewall: [tr('Instalar iptables y netfilter-persistent'), tr('Abrir puertos TCP')],
        docker: [tr('¿Está Docker instalado?'), tr('Ejecutar get-docker.sh (tarda un par de minutos)'), tr('Desactivar el image store de containerd'), tr('Usuarios en el grupo docker')],
        coolify: [tr('Abrir los puertos del panel de Coolify'), tr('Ejecutar el instalador de Coolify (tarda varios minutos)'), tr('Nota')],
        postgres: [tr('Red Docker «apps»'), 'docker-compose.yml', tr('Arrancar PostgreSQL'), tr('Crear cada base'), tr('Nota')],
      }
      for (const n of names[m.id] ?? [tr('Tarea')]) {
        at(200, { kind: 'ev', ev: { ev: 'task', name: `${m.id} : ${n}`, role: m.id } })
        const ch = !n.startsWith('¿') && n !== tr('Nota')
        if (ch) changed++
        const e: Record<string, unknown> = { ev: 'ok', changed: ch }
        if (n === tr('Nota')) e.note = m.id === 'coolify' ? tr('Panel de Coolify: http://203.0.113.10:8000 — entra ya y crea tu usuario.') : tr('Contraseñas en /etc/draupnode/secretos/') + p.name.toLowerCase() + tr('/ (solo root).')
        at(n.includes('tarda') ? 1500 : 450, { kind: 'ev', ev: e })
        if (check && ch && n.includes('yml')) at(50, { kind: 'ev', ev: { ev: 'diff', text: '--- before\n+++ after\n@@ -0,0 +1,3 @@\n+name: draupnode-postgres\n+services:\n+  postgres:' } })
      }
    }
    at(300, { kind: 'ev', ev: { ev: 'stats', ok: 30, changed, failures: 0, unreachable: 0, skipped: 2 } })
    // Como el plugin de Ansible: al empezar la obra dice cuántas tareas tiene.
    const play = steps.findIndex(([, e]) => (e.ev as { ev?: string })?.ev === 'play')
    steps.splice(play + 1, 0, [steps[play][0], { kind: 'ev', ev: { ev: 'plan', total: steps.filter(([, e]) => (e.ev as { ev?: string })?.ev === 'task').length } }])
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
    start: stack === 'python' ? tr('python main.py') : stack === 'node' ? tr('npm run start') : '', pyInstall: 'requirements', module: 'config', extraPip: [],
    djangoMigrate: false, djangoCollectstatic: false, djangoSuperuser: false, nodePm: 'npm', nodeBuild: false, nodeLock: true, staticDir: 'dist',
    javaBuild: 'maven', javaWrapper: false, docRoot: '', laravelMigrate: false, goMain: '.', systemPackages: [], volumes: [], envKeys: [],
    nonRoot: true, healthPath: '', postgres: false, mariadb: false, redis: false, dbMode: 'own', sharedNetwork: 'apps', sharedHost: 'pg-compartido', sideBySide: false,
    proxy: false, proxyDomain: '', proxyPort: 80, maxBodyMb: 50,
  }
}

// Catálogo de la demo: volcado del real en cada idioma (make demo-catalogo).
const MOCK_MODULES: Module[] = (i18n.lang === 'en' ? demoModulesEN : demoModulesES) as unknown as Module[]

// ---- Historial de ejemplo (demo y capturas): ondas suaves y deterministas.
let mockHistoryOn = true
// Ficheros de la demo (explorador de ficheros).
const demoFiles: Record<string, string> = {
  '/srv/draupnode/apps/vaultwarden/docker-compose.yml': '# Generado por Draupnode (módulo vaultwarden). No lo edites a mano: se reescribe al aplicar.\nname: dn-vaultwarden\n\nservices:\n  vaultwarden:\n    image: vaultwarden/server:latest\n    container_name: dn-vaultwarden\n    restart: unless-stopped\n    ports:\n      - "127.0.0.1:8222:80"\n',
  '/etc/caddy/Caddyfile': 'tienda.example.com {\n\treverse_proxy 127.0.0.1:3000\n}\n',
  '/srv/draupnode/apps/tienda/.env': 'DB_ENGINE=postgres\nDJANGO_DEBUG=false\n',
}
function demoFS(): Record<string, FileEntry[]> {
  const t0 = Math.floor(Date.now() / 1000)
  const d = (name: string, ago = 3600): FileEntry => ({ name, type: 'dir', size: 4096, mode: 'drwxr-x---', owner: 'root', mtime: t0 - ago, dir: true })
  const f = (name: string, size: number, ago = 7200, mode = '-rw-------'): FileEntry => ({ name, type: 'file', size, mode, owner: 'root', mtime: t0 - ago, dir: false })
  return {
    '/': [d('bin', 9e6), d('etc', 600), d('home', 9e6), d('opt', 9e6), d('root', 9e5), d('srv', 3e5), d('usr', 9e6), d('var', 600)],
    '/srv': [d('draupnode', 3e5)],
    '/srv/draupnode': [d('apps', 7200), d('monitor', 9e4)],
    '/srv/draupnode/apps': [d('tienda', 600), d('uptime-kuma', 9e4), d('vaultwarden', 3e5)],
    '/srv/draupnode/apps/vaultwarden': [d('data', 120), f('docker-compose.yml', 402, 3e5)],
    '/srv/draupnode/apps/tienda': [d('media', 600), f('.env', 38, 600), f('docker-compose.draupnode.yml', 1290, 600), f('Dockerfile', 811, 600, '-rw-r--r--')],
    '/etc': [d('caddy', 600), d('draupnode', 3e5), f('hostname', 8, 9e6, '-rw-r--r--')],
    '/etc/caddy': [f('Caddyfile', 52, 600, '-rw-r--r--')],
  }
}

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
