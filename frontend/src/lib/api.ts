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
  | 'started' | 'needs_secret' | 'bad_secret' | 'vault_locked' | 'vault_missing' | 'unknown_host'
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
  let vault = { exists: false, unlocked: false, master: '' }
  const mockTyped: Record<string, string> = {} // datos secretos escritos (demo, solo en memoria)
  let projects: Project[] = load('projects', [])
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
        updatedAt: same ? prev!.updatedAt : new Date().toISOString(), lastRun: prev?.lastRun, appliedAt: prev?.appliedAt, collapsed: prev?.collapsed }
      projects = prev ? projects.map((x) => (x.id === np.id ? np : x)) : [...projects, np]
      save('projects', projects)
      return np
    },
    async DeleteProject(id) {
      projects = projects.filter((p) => p.id !== id)
      save('projects', projects)
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
      projects = projects.map((x) => (x.id === p.id ? { ...x, lastRun: summary, ...(summary.ok && (!check || summary.changed === 0) ? { appliedAt: summary.at } : {}) } : x))
      save('projects', projects)
      ev({ kind: 'done', summary })
    }, t + 400)
  }
}

const MOCK_MODULES: Module[] = [
  { id: 'base', name: 'Sistema base', version: '1.0.0', category: '1 · Sistema', source: 'builtin', depends: [], requires: { os: ['ubuntu', 'debian'] },
    description: 'Paquetes básicos, zona horaria, memoria de intercambio (swap) y actualizaciones de seguridad automáticas.',
    files: ['tasks/main.yml'],
    variables: [
      { name: 'base_packages', label: 'Paquetes a instalar', type: 'list', default: ['curl', 'ca-certificates', 'gnupg', 'jq', 'openssl', 'python3', 'logrotate', 'htop', 'unzip'], pattern: '^[a-z0-9][a-z0-9.+-]*$', patternHelp: 'Nombre de paquete apt' },
      { name: 'base_timezone', label: 'Zona horaria', type: 'string', default: 'Europe/Madrid' },
      { name: 'base_swap_mb', label: 'Swap (MB)', help: 'Memoria de intercambio en /swapfile. 0 = no crear.', type: 'int', default: 2048, min: 0, max: 65536 },
      { name: 'base_auto_updates', label: 'Actualizaciones de seguridad automáticas', type: 'bool', default: true },
    ] },
  { id: 'firewall', name: 'Cortafuegos (iptables)', version: '1.0.0', category: '1 · Sistema', source: 'builtin', depends: ['base'], requires: { os: ['ubuntu', 'debian'] },
    description: 'Abre en el cortafuegos del servidor los puertos TCP indicados y guarda las reglas para que sobrevivan a un reinicio.',
    files: ['tasks/main.yml', 'handlers/main.yml'],
    variables: [{ name: 'firewall_tcp_ports', label: 'Puertos TCP abiertos', help: 'El 22 (SSH) se abre siempre.', type: 'list', default: ['22', '80', '443'], pattern: '^[0-9]{1,5}$', patternHelp: 'Número de puerto entre 1 y 65535' }] },
  { id: 'docker', name: 'Docker', version: '1.0.0', category: '2 · Contenedores', source: 'builtin', depends: ['base'], requires: { os: ['ubuntu', 'debian'], minRamMb: 900, minDiskGb: 10 },
    description: 'Instala Docker Engine con el script oficial, lo deja arrancado y da permisos a tu usuario.',
    files: ['tasks/main.yml', 'handlers/main.yml'],
    variables: [
      { name: 'docker_classic_storage', label: 'Almacenamiento clásico overlay2', help: 'Necesario para ver CPU/RAM por contenedor en la monitorización.', type: 'bool', default: true },
      { name: 'docker_users', label: 'Otros usuarios en el grupo docker', type: 'list', default: [] },
    ] },
  { id: 'coolify', name: 'Coolify', version: '1.0.0', category: '3 · Plataformas', source: 'builtin', depends: ['docker', 'firewall'], requires: { os: ['ubuntu', 'debian'], minRamMb: 1800, minDiskGb: 30 },
    description: "Panel para desplegar tus apps desde GitHub/GitLab con dominio y HTTPS automáticos (proxy Traefik + Let's Encrypt).",
    files: ['tasks/main.yml'],
    firewallPorts: [8000, 6001, 6002], secrets: [{ file: 'coolify_admin', label: 'Administrador de Coolify' }], variables: [
      { name: 'coolify_admin_email', label: 'Correo del administrador', help: 'Vacío = el primero que entre al panel crea el administrador.', type: 'string', default: '', placeholder: 'tu@ejemplo.com', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', patternHelp: 'Un correo válido (nombre@dominio.ext)' },
      { name: 'coolify_admin_user', label: 'Nombre del administrador', type: 'string', default: 'admin', pattern: '^[A-Za-z0-9._-]{3,40}$', patternHelp: '3 a 40 letras, números, . _ o -' },
      { name: 'coolify_autoupdate', label: 'Actualizaciones automáticas', help: 'Coolify se actualiza solo a cada versión nueva. Desactívalo si prefieres actualizar tú desde el panel.', type: 'bool', default: true },
    ] },
  { id: 'ssh', name: 'SSH seguro + fail2ban', version: '1.0.0', category: '1 · Sistema', source: 'builtin', depends: ['base'], after: ['firewall'], firewallPortsFrom: ['ssh_port'], requires: { os: ['ubuntu', 'debian'] },
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
  { id: 'postgres', name: 'PostgreSQL compartido', version: '1.0.0', category: '4 · Bases de datos', source: 'builtin', depends: ['docker'], requires: { os: ['ubuntu', 'debian'], minRamMb: 900 },
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
