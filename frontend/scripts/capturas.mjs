// Saca las capturas de la ayuda (src/assets/ayuda/*.webp) con la demo del
// navegador (datos simulados) y Google Chrome/Chromium sin ventana.
// Uso: make capturas   (o: cd frontend && node scripts/capturas.mjs)
//      make capturas-en (CAPTURAS_LANG=en: en inglés, en src/assets/ayuda/en/)
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const LANG = process.env.CAPTURAS_LANG === 'en' ? 'en' : 'es'
const outDir = join(here, '..', 'src', 'assets', 'ayuda', ...(LANG === 'en' ? ['en'] : []))
mkdirSync(outDir, { recursive: true })

// En inglés, los textos que se buscan en pantalla (botones, pestañas, módulos)
// y los datos de ejemplo se traducen con el mismo catálogo que la app.
const EN = JSON.parse(readFileSync(join(here, '..', 'src', 'locales', 'en.json'), 'utf8'))
const modNames = (l) => JSON.parse(readFileSync(join(here, '..', 'src', 'lib', 'demo', `modules.${l}.json`), 'utf8'))
const MOD_EN = Object.fromEntries(modNames('es').map((m, i) => [m.name, modNames('en')[i]?.name ?? m.name]))
const SEED_EN = {
  'Servidor web': 'Web server', 'Servidor de pruebas (Docker)': 'Test server (Docker)', 'Coolify producción': 'Coolify production',
  'Base de datos': 'Database', 'Probar Coolify': 'Try Coolify', 'Servidor de copias': 'Backup server', 'Tienda': 'Shop',
  'Blog': 'Blog', 'Alertas': 'Alerts', 'VPN': 'VPN', 'Servidor de la tienda': 'Shop server', 'Copias': 'Backups',
  'Ubuntu 24.04 en un contenedor Docker de este equipo.': 'Ubuntu 24.04 in a Docker container on this computer.',
  'tienda.ejemplo.com': 'shop.example.com', 'portatil': 'laptop', 'movil': 'phone',
}
const L = (s) => (LANG === 'en' && typeof s === 'string' ? SEED_EN[s] ?? MOD_EN[s] ?? EN[s] ?? EN[s + '…']?.replace(/…$/, '') ?? s : s)
const tr = (v) => (Array.isArray(v) ? v.map(tr) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tr(x)])) : L(v))
const VITE_PORT = 5199
const CDP_PORT = 9333
const W = 1280, H = 800
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .find((p) => existsSync(p))
if (!chrome) throw new Error('No encuentro Google Chrome ni Chromium')

// ---- datos de ejemplo ----
const now = Date.now()
const ago = (min) => new Date(now - min * 60_000).toISOString()
const facts = (os, mem, disk) => ({ arch: 'x86_64', cpus: '4', os, os_id: 'ubuntu', os_version: '24.04', mem_kb: String(mem), disk_free_kb: String(disk), disk_total_kb: String(disk * 2), hostname: 'srv', kernel: '6.8.0', sudo: 'yes', has_docker: 'no', has_python3: 'yes', has_curl: 'yes', uptime: 'up 3 days' })
const seed = {
  servers: [
    { id: 'demo1', name: 'Servidor web', host: '203.0.113.10', port: 22, user: 'ubuntu', authMethod: 'key', keyPath: '/home/demo/.ssh/id_ed25519', keyEncrypted: true, secretStore: 'keyring', hasSecret: true, notes: '', createdAt: ago(3000),
      lastCheck: { at: ago(4), ok: true, facts: facts('Ubuntu 24.04.1 LTS', 24_000_000, 160_000_000), durationMs: 310 } },
    { id: 'lab', name: 'Servidor de pruebas (Docker)', host: '127.0.0.1', port: 2222, user: 'ubuntu', authMethod: 'key', keyPath: '/home/demo/.config/draupnode/prueba/id_prueba', keyEncrypted: false, secretStore: '', notes: 'Ubuntu 24.04 en un contenedor Docker de este equipo.', createdAt: ago(600),
      lastCheck: { at: ago(35), ok: true, facts: facts('Ubuntu 24.04.5 LTS', 23_700_000, 780_000_000), durationMs: 120 } },
  ],
  projects: [
    { id: 'p1', name: 'Coolify producción', serverId: 'demo1', modules: [{ id: 'base', values: {} }, { id: 'firewall', values: {} }, { id: 'docker', values: {} }, { id: 'coolify', values: {} }],
      lastRun: { at: ago(90), check: false, ok: true, changed: 23, failed: 0, tasks: 41, durationMs: 412_000 } },
    { id: 'p2', name: 'Base de datos', serverId: 'demo1', modules: [{ id: 'docker', values: {} }, { id: 'postgres', values: {} }],
      lastRun: { at: ago(20), check: true, ok: true, changed: 5, failed: 0, tasks: 12, durationMs: 38_000 } },
    { id: 'p3', name: 'Probar Coolify', serverId: 'lab', modules: [{ id: 'coolify', values: {} }] },
  ],
  settings: { theme: 'sand-slate', secretBackend: 'auto' },
  trusted: ['203.0.113.10', '127.0.0.1'],
}

// ---- capturas: nombre, pantalla, acciones y recorte opcional ----
const ALL_SHOTS = [
  { name: 'panel', view: 'dashboard' },
  { name: 'servidores', view: 'servers' },
  { name: 'servidor-nuevo', view: 'servers', act: [['click', 'button', 'Añadir servidor'], ['wait', 500],
    ['fill', 'Servidor web', 'Servidor de la tienda'], ['fill', '203.0.113.10', '203.0.113.20'], ['fill', 'ubuntu', 'root']] },
  { name: 'proyectos', view: 'projects' },
  { name: 'proyecto', view: 'projects', act: [['click', 'button.main', 'Coolify producción'], ['wait', 900]] },
  { name: 'plantilla-cambios', view: 'projects', act: [['click', 'button.main', 'Coolify producción'], ['wait', 900], ['click', 'button.mc', 'Vaultwarden'], ['wait', 1200]] },
  { name: 'servidor', view: 'servers', act: [['click', 'article.srv', 'Servidor web'], ['wait', 1500], ['click', 'button.tab', 'Resumen'], ['wait', 600]] },
  { name: 'servidor-historial', view: 'servers', act: [['click', 'article.srv', 'Servidor web'], ['wait', 1500], ['click', 'button.tab', 'Resumen'], ['wait', 600],
    ['js', `document.querySelector('.charts')?.closest('section')?.scrollIntoView({ block: 'start' })`], ['wait', 300],
    ['js', `(() => { const p = document.querySelector('.charts .plot'); const r = p.getBoundingClientRect(); p.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width * 0.62, clientY: r.top + 40, bubbles: true })) })()`], ['wait', 300]] },
  { name: 'servidor-desvios', view: 'servers', seed: (d) => {
      d.desvios = { demo1: { at: ago(25), duration: 38000, accepted: [], items: [
        { kind: 'config', module: 'caddy', name: 'Caddyfile (se comprueba antes de ponerlo)', key: 'config:caddy:Caddyfile', diff: '--- before: /etc/caddy/Caddyfile\n+++ after: /etc/caddy/Caddyfile\n@@ -12,4 +12,3 @@\n     reverse_proxy 127.0.0.1:3001\n }\n-# probado a mano\n-tienda.example.com { reverse_proxy 127.0.0.1:9000 }\n' },
        { kind: 'timer', name: 'draupnode-copia-produccion.timer', key: 'timer:draupnode-copia-produccion.timer' },
        { kind: 'container', name: 'dn-uptime-kuma', key: 'container:dn-uptime-kuma' }] } }
    },
    act: [['click', 'article.srv', 'Servidor web'], ['wait', 1500], ['click', 'button.tab', 'Resumen'], ['wait', 600],
      ['js', `document.getElementById('desvios')?.scrollIntoView({ block: 'start' })`], ['click', 'button.exp', 'Caddy'], ['wait', 300]] },
  { name: 'servidor-instantaneas', view: 'servers', seed: (d) => {
      d.servers[0].cloud = { provider: 'hetzner', id: '4815162', name: 'web', snapshotBeforeApply: true, keepSnapshots: 3 }
    },
    act: [['click', 'article.srv', 'Servidor web'], ['wait', 1500], ['click', 'button.tab', 'Resumen'], ['wait', 1200],
      ['js', `[...document.querySelectorAll('h2')].find((h) => /Instant|Snapshot/.test(h.textContent))?.closest('section')?.scrollIntoView({ block: 'start' })`], ['wait', 300]] },
  { name: 'servidor-apps', view: 'servers', act: [['click', 'article.srv', 'Servidor web'], ['wait', 1500], ['click', 'button.tab', 'Apps y bases'], ['wait', 600],
    ['js', `document.querySelector('table.usage')?.closest('section')?.scrollIntoView({ block: 'start' })`], ['wait', 300]] },
  { name: 'servidor-dominios', view: 'servers', act: [['click', 'article.srv', 'Servidor web'], ['wait', 1500], ['click', 'button.tab', 'Dominios'], ['wait', 1800]] },
  { name: 'servidor-red', view: 'servers', act: [['click', 'article.srv', 'Servidor web'], ['wait', 1500], ['click', 'button.tab', 'Red y seguridad'], ['wait', 600], ['js', `document.getElementById('puertos')?.scrollIntoView({ block: 'start' })`], ['wait', 300]] },
  { name: 'servidor-seguridad', view: 'servers', act: [['click', 'article.srv', 'Servidor web'], ['wait', 1500], ['click', 'button.tab', 'Red y seguridad'], ['wait', 600], ['js', `[...document.querySelectorAll('.card.block .lnk.small')].find((b) => /\(\d+\)$/.test(b.textContent.trim()))?.click()`], ['wait', 300]] },
  { name: 'despliegue', view: 'servers', act: [['click', 'article.srv', 'Servidor web'], ['wait', 1500], ['click', 'button.tab', 'Módulos'], ['wait', 1200]] },
  { name: 'catalogo', view: 'catalog', act: [['wait', 1200], ['click', 'button.mod', 'Coolify'], ['wait', 700]] },
  { name: 'pruebas', view: 'lab', act: [['wait', 600], ['click', 'button', 'Crear y arrancar'], ['wait', 4500]] },
  { name: 'docker', view: 'docker', act: [['click', 'button', 'Elegir carpeta'], ['wait', 900]] },
  { name: 'docker-nginx', view: 'docker', act: [['click', 'button', 'Elegir carpeta'], ['wait', 900], ['click', 'button', 'Siguiente'], ['click', 'button', 'Siguiente'],
    ['click', 'button', 'Siguiente'], ['wait', 300], ['click', 'label.check', 'Poner nginx delante'], ['wait', 300], ['type', 'input[placeholder="tienda.ejemplo.com"]', 'tienda.ejemplo.com'], ['wait', 300]] },
  { name: 'docker-vista', view: 'docker', act: [['click', 'button', 'Elegir carpeta'], ['wait', 900], ['click', 'button', 'Siguiente'], ['click', 'button', 'Siguiente'],
    ['click', 'button', 'Siguiente'], ['click', 'button', 'Siguiente'], ['wait', 500], ['click', 'button', 'Guardar en la carpeta'], ['wait', 600], ['click', 'button', 'Probar en el servidor de pruebas'], ['wait', 3600]] },
  { name: 'publicar', view: 'docker', act: [['click', 'button', 'Elegir carpeta'], ['wait', 900], ['click', 'button', 'Siguiente'], ['click', 'button', 'Siguiente'], ['click', 'button', 'Siguiente'], ['click', 'button', 'Siguiente'], ['wait', 500], ['click', 'button', 'Guardar en la carpeta'], ['wait', 600], ['js', "const s=document.querySelector('.publish select'); s.value=s.options[1].value; s.dispatchEvent(new Event('change',{bubbles:true}))"], ['wait', 300], ['click', 'button', 'Publicar en el servidor'], ['wait', 900], ['js', "document.querySelector('.publish')?.scrollIntoView({block:'center'})"], ['wait', 300]] },
  { name: 'publicar-modulo', view: 'servers', seed: (d) => {
      d.projects.push({ id: 'pg', name: 'x', serverId: 'demo1', modules: [{ id: 'base', values: {} }, { id: 'docker', values: {} }, { id: 'git-app', values: { git_app_source: 'carpeta', git_app_local_dir: '/home/usuario/proyectos/tienda', git_app_name: 'tienda', git_app_compose: 'docker-compose.draupnode.yml', git_app_env: ['DB_ENGINE=postgres', 'DJANGO_DEBUG=false', 'DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1', 'EMAIL_HOST='], git_app_env_generate: ['DB_PASSWORD', 'DJANGO_SECRET_KEY', 'FIELD_ENCRYPTION_KEY:fernet'] } }], installedModules: ['base', 'docker'], appliedAt: ago(60) })
    },
    act: [['click', 'article.srv', 'Servidor web'], ['wait', 1500], ['click', 'button.tab', 'Módulos'], ['wait', 1000], ['click', 'button.mmain', 'Tu app'], ['wait', 900], ['js', "document.querySelector('.rows')?.scrollIntoView({block:'start'})"], ['wait', 300]] },
  { name: 'destino-copias', view: 'servers', seed: (d) => {
      d.servers.push({ id: 'demo2', name: 'Servidor de copias', host: '203.0.113.40', port: 22, user: 'ubuntu', authMethod: 'key', keyPath: '/home/demo/.ssh/id_ed25519', keyEncrypted: true, secretStore: 'keyring', hasSecret: true, notes: '', createdAt: ago(100) })
      d.projects.push({ id: 'p4', name: 'Tienda', serverId: 'demo1', slug: 'tienda', modules: [{ id: 'base', values: {} }, { id: 'backups', values: { backups_time: '03:30', backups_remote_type: 'no' } }],
        installedModules: ['base', 'backups'], installedValues: { base: {}, backups: { backups_time: '03:30', backups_remote_type: 'no' } }, appliedAt: ago(60) })
    },
    act: [['click', 'article.srv', 'Servidor web'], ['wait', 1500], ['click', 'button.tab', 'Módulos'], ['wait', 700], ['click', 'button', 'Copias de seguridad'], ['wait', 700], ['click', 'button', 'Guardar también en otro servidor'], ['wait', 600]] },
  { name: 'destino-copias-aplicar', view: 'servers', seed: 'destino-copias',
    act: [['click', 'article.srv', 'Servidor web'], ['wait', 1500], ['click', 'button.tab', 'Módulos'], ['wait', 700], ['click', 'button', 'Copias de seguridad'], ['wait', 700], ['click', 'button', 'Guardar también en otro servidor'], ['wait', 600],
      ['click', 'button', 'Preparar'], ['wait', 1000], ['click', 'button', 'Aplicar los dos ahora'], ['wait', 30000]] },
  { name: 'vpn', view: 'servers', seed: (d) => {
      d.vault = { exists: true, master: 'demo-demo-demo' }
      d.servers[0].lastCheck.facts.cloud = 'oracle'
      d.projects.push({ id: 'p5', name: 'VPN', serverId: 'demo1', slug: 'vpn', modules: [{ id: 'base', values: {} }, { id: 'wireguard', values: { wireguard_peers: ['portatil', 'movil'] } }],
        installedModules: ['base', 'wireguard'], appliedAt: ago(30) })
    },
    act: [['click', 'article.srv', 'Servidor web'], ['wait', 1500], ['click', 'button.tab', 'Módulos'], ['wait', 700], ['click', 'button', 'WireGuard'], ['wait', 700], ['click', 'button', 'Ver configuraciones'], ['wait', 400],
      ['type', '.modal input', 'demo-demo-demo'], ['click', 'button', 'Continuar'], ['wait', 900]] },
  { name: 'alertas', view: 'servers', seed: (d) => {
      d.vault = { exists: true, master: 'demo-demo-demo' }
      d.projects.push({ id: 'p6', name: 'Alertas', serverId: 'demo1', slug: 'alertas', modules: [{ id: 'base', values: {} }, { id: 'alerts', values: {} }],
        installedModules: ['base', 'alerts'], appliedAt: ago(30) })
    },
    act: [['click', 'article.srv', 'Servidor web'], ['wait', 1500], ['click', 'button.tab', 'Módulos'], ['wait', 700], ['click', 'button', 'Alertas al móvil'], ['wait', 700], ['click', 'button', 'Qué ve ahora'], ['wait', 1000],
      ['click', 'button', 'Suscribirse en el móvil'], ['wait', 400], ['type', '.modal input', 'demo-demo-demo'], ['click', 'button', 'Continuar'], ['wait', 900]] },
  { name: 'copias-aviso', view: 'dashboard', seed: (d) => {
      d.projects.push({ id: 'p7', name: 'Tienda', serverId: 'demo1', slug: 'tienda', modules: [{ id: 'base', values: {} }, { id: 'backups', values: {} }],
        installedModules: ['base', 'backups'], appliedAt: ago(3000), backupsFetched: { at: ago(23 * 1440), dir: '/home/demo/Draupnode-copias/tienda', bytes: 48000000, files: 0 } })
      d.projects.push({ id: 'p8', name: 'Blog', serverId: 'demo1', slug: 'blog', modules: [{ id: 'base', values: {} }, { id: 'backups', values: {} }],
        installedModules: ['base', 'backups'], appliedAt: ago(3000), backupsAuto: { mode: 'fetch', days: 3 }, backupsFetched: { at: ago(5 * 1440), dir: '/home/demo/Draupnode-copias/blog', bytes: 9000000, files: 0 } })
    }, act: [['wait', 1500]] },
  { name: 'avisos', view: 'alerts', seed: 'copias-aviso', act: [['wait', 900]] },
  { name: 'avisos-caido', view: 'alerts', seed: (d) => { d.caidos = ['demo1'] }, act: [['wait', 1200]] },
  { name: 'avisos-campana', view: 'catalog', seed: 'copias-aviso', act: [['wait', 900]] },
  { name: 'terminal', view: 'terminal', act: [['click', 'button', 'Abrir terminal'], ['wait', 1200],
    ['js', `(() => { const t = document.querySelector('.xterm-helper-textarea'); t.dispatchEvent(new InputEvent('input', { data: 'uptime', inputType: 'insertText', bubbles: true })); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })) })()`], ['wait', 800]] },
  { name: 'modulos', view: 'modules', act: [['click', 'button', 'Nuevo módulo'], ['wait', 400], ['type', 'input[placeholder="mi-modulo"]', 'mis-paquetes'], ['click', 'button', 'Crear'], ['wait', 1200]] },
  { name: 'modulo-importar', view: 'modules', act: [['click', 'button', 'Importar'], ['wait', 1200]] },
  { name: 'adoptar', view: 'servers', act: [['click', 'article.srv', 'Servidor web'], ['wait', 1500], ['click', 'button.tab', 'Módulos'], ['wait', 800], ['js', `document.querySelector('.adopt')?.scrollIntoView()`], ['wait', 300]] },
  { name: 'pendientes', view: 'dashboard', act: [['wait', 3500], ['js', `document.querySelector('.pend')?.scrollIntoView({ block: 'center' })`], ['wait', 400]] },
  { name: 'asistente', view: 'projects', act: [['click', 'button', '¿Qué quieres montar?'], ['wait', 500], ['click', 'button.goal', 'Mi nube'], ['click', 'button.goal', 'Gestor de contraseñas'], ['click', 'button.goal', 'Vigilar el servidor'], ['wait', 300]] },
  { name: 'asistente-modulos', view: 'projects', act: [['click', 'button', '¿Qué quieres montar?'], ['wait', 500], ['click', 'button.goal', 'Mi nube'], ['click', 'button.goal', 'Gestor de contraseñas'], ['click', 'button', 'Siguiente'], ['wait', 400]] },
  { name: 'nube', view: 'servers', act: [['click', 'button', 'Crear en la nube'], ['wait', 600], ['click', 'button.prov', 'Hetzner Cloud'], ['wait', 1200]] },
  { name: 'aplicando', view: 'servers', act: [['click', 'article.srv', 'Servidor web'], ['wait', 1500], ['click', 'button.tab', 'Módulos'], ['wait', 900], ['click', 'button', 'Simular'], ['wait', 4200]] },
  { name: 'actualizaciones', view: 'updates', act: [['wait', 600], ['click', 'button', 'Buscar en todos'], ['wait', 7000], ['js', `document.querySelectorAll('.srv')[0]?.querySelectorAll('.line .exp')[1]?.click()`], ['wait', 300]] },
  { name: 'ajustes', view: 'settings' },
  { name: 'barra-estado', view: 'dashboard', act: [['wait', 800]], clip: 'footer.status', scale: 1.5 },
]

// CAPTURAS=docker,ajustes rehace solo esas.
const only = (process.env.CAPTURAS ?? '').split(',').filter(Boolean)
const SHOTS = only.length ? ALL_SHOTS.filter((s) => only.includes(s.name)) : ALL_SHOTS

// ---- arranque de vite y chrome ----
const vite = spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], { cwd: join(here, '..'), stdio: 'ignore', shell: process.platform === 'win32' })
const profile = mkdtempSync(join(tmpdir(), 'draupnode-capturas-'))
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', `--lang=${LANG}`, 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { browser.kill() } catch {} ; try { vite.kill() } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('exit', cleanup)

async function waitFor(fn, what, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const v = await fn(); if (v) return v } catch {}
    await sleep(250)
  }
  throw new Error('No arranca: ' + what + (typeof jsErrors !== 'undefined' && jsErrors.length ? '\nErrores de JavaScript:\n' + jsErrors.join('\n') : ''))
}

const base = `http://localhost:${VITE_PORT}/`
await waitFor(() => fetch(base).then((r) => r.ok), 'vite')
const target = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find((t) => t.type === 'page'), 'chrome')

// ---- cliente mínimo de DevTools ----
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0
const waiting = new Map()
ws.onmessage = (m) => {
  const d = JSON.parse(m.data)
  if (d.id && waiting.has(d.id)) {
    const { res, rej } = waiting.get(d.id)
    waiting.delete(d.id)
    d.error ? rej(new Error(d.error.message)) : res(d.result)
  }
}
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'error en la página')
  return r.result.value
}

const jsErrors = []
const origOnMessage = ws.onmessage
ws.onmessage = (m) => {
  const d = JSON.parse(m.data)
  // «Failed to fetch dynamically imported module»: Vite recarga la página al optimizar
  // dependencias la primera vez; no es un fallo de la app.
  if (d.method === 'Runtime.exceptionThrown' && !/dynamically imported module/.test(d.params.exceptionDetails?.exception?.description ?? '')) jsErrors.push(d.params.exceptionDetails?.exception?.description ?? 'error')
  origOnMessage(m)
}
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })

const seedFor = (d) => `localStorage.clear();` + Object.entries(d).map(([k, v]) => `localStorage.setItem(${JSON.stringify('draupnode-mock2-' + k)}, ${JSON.stringify(JSON.stringify(v))});`).join('') +
  `localStorage.setItem('draupnode.activeServer', 'demo1');`

let loads = 0
async function open(view, extra) {
  await send('Page.navigate', { url: base + '?semilla' })
  await waitFor(() => evaluate(`location.search === '?semilla' && document.readyState === 'complete'`), 'la demo')
  const d = structuredClone(seed)
  const fn = typeof extra === 'string' ? ALL_SHOTS.find((x) => x.name === extra)?.seed : extra
  if (fn) fn(d)
  await evaluate(seedFor(LANG === 'en' ? tr(d) : d))
  const q = '?c' + ++loads + (LANG === 'en' ? '&lang=en' : '')
  await send('Page.navigate', { url: base + q + '#' + view })
  try {
    await waitFor(() => evaluate(`location.search === '${q}' && document.readyState === 'complete' && !!document.querySelector('footer.status') && !document.body.innerText.includes(${JSON.stringify(L('Comprobando…'))})`), 'la página ' + view, 40)
  } catch (e) {
    console.error('Texto de la página:', (await evaluate('document.body.innerText')).slice(0, 600))
    throw e
  }
  await sleep(500)
}

async function act([kind, a, b]) {
  if (kind === 'click' || kind === 'fill') b = L(b)
  if (kind === 'fill') a = L(a)
  if (kind === 'type' && typeof b === 'string') b = L(b)
  if (kind === 'wait') return sleep(a)
  if (kind === 'log') return console.log(await evaluate(a))
  if (kind === 'click') {
    const js = `(() => { const el = [...document.querySelectorAll(${JSON.stringify(a)})].find((e) => e.innerText.includes(${JSON.stringify(b)})); if (el) el.click(); return !!el })()`
    await waitFor(() => evaluate(js), `«${b}» (${a})`, 40)
    return sleep(300)
  }
  if (kind === 'js') { // [js, código] (p. ej. teclear en la terminal)
    await evaluate(a)
    return sleep(200)
  }
  if (kind === 'type') { // [type, selector CSS, valor]
    const js = `(() => { const el = document.querySelector(${JSON.stringify(a)}); if (!el) return false; el.value = ${JSON.stringify(b)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`
    await waitFor(() => evaluate(js), `el campo ${a}`, 40)
    return sleep(200)
  }
  if (kind === 'fill') {
    const js = `(() => { const el = [...document.querySelectorAll('input')].find((e) => e.placeholder === ${JSON.stringify(a)}); if (!el) return false; el.value = ${JSON.stringify(b)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`
    await waitFor(() => evaluate(js), `el campo «${a}»`, 40)
  }
}

try {
  for (const s of SHOTS) {
    await open(s.view, s.seed)
    for (const a of s.act ?? []) await act(a)
    let clip
    if (s.clip) {
      const r = await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(s.clip)}).getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height } })()`)
      clip = { ...r, scale: s.scale ?? 1 }
    }
    const { data } = await send('Page.captureScreenshot', { format: 'webp', quality: 82, ...(clip ? { clip } : {}) })
    writeFileSync(join(outDir, s.name + '.webp'), Buffer.from(data, 'base64'))
    console.log('✓', s.name)
  }
  if (jsErrors.length) { console.error('Errores de JavaScript:\n' + jsErrors.join('\n')); process.exitCode = 1 }
} finally {
  ws.close()
  cleanup()
}
process.exit(process.exitCode ?? 0)
