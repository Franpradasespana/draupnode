// Saca las capturas de la ayuda (src/assets/ayuda/*.webp) con la demo del
// navegador (datos simulados) y Google Chrome/Chromium sin ventana.
// Uso: make capturas   (o: cd frontend && node scripts/capturas.mjs)
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'src', 'assets', 'ayuda')
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
  { name: 'proyecto', view: 'projects', act: [['click', 'button.proj', 'Coolify producción'], ['wait', 900]] },
  { name: 'catalogo', view: 'catalog', act: [['wait', 1200], ['click', 'button.mod', 'Coolify'], ['wait', 700]] },
  { name: 'pruebas', view: 'lab', act: [['wait', 600], ['click', 'button', 'Crear y arrancar'], ['wait', 4500]] },
  { name: 'docker', view: 'docker', act: [['click', 'button', 'Elegir carpeta'], ['wait', 900]] },
  { name: 'docker-vista', view: 'docker', act: [['click', 'button', 'Elegir carpeta'], ['wait', 900], ['click', 'button', 'Siguiente'], ['click', 'button', 'Siguiente'],
    ['click', 'button', 'Siguiente'], ['click', 'button', 'Siguiente'], ['wait', 500], ['click', 'button', 'Guardar en la carpeta'], ['wait', 600], ['click', 'button', 'Probar a construir'], ['wait', 2600]] },
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
  `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--lang=es', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { browser.kill() } catch {} ; try { vite.kill() } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('exit', cleanup)

async function waitFor(fn, what, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const v = await fn(); if (v) return v } catch {}
    await sleep(250)
  }
  throw new Error('No arranca: ' + what)
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
  if (d.method === 'Runtime.exceptionThrown') jsErrors.push(d.params.exceptionDetails?.exception?.description ?? 'error')
  origOnMessage(m)
}
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })

const seedJS = `localStorage.clear();` + Object.entries(seed).map(([k, v]) => `localStorage.setItem(${JSON.stringify('draupnode-mock2-' + k)}, ${JSON.stringify(JSON.stringify(v))});`).join('') +
  `localStorage.setItem('draupnode.activeServer', 'demo1');`

let loads = 0
async function open(view) {
  await send('Page.navigate', { url: base + '?semilla' })
  await waitFor(() => evaluate(`location.search === '?semilla' && document.readyState === 'complete'`), 'la demo')
  await evaluate(seedJS)
  const q = '?c' + ++loads
  await send('Page.navigate', { url: base + q + '#' + view })
  await waitFor(() => evaluate(`location.search === '${q}' && document.readyState === 'complete' && !!document.querySelector('footer.status') && !document.body.innerText.includes('Comprobando…')`), 'la página ' + view, 40)
  await sleep(500)
}

async function act([kind, a, b]) {
  if (kind === 'wait') return sleep(a)
  if (kind === 'click') {
    const js = `(() => { const el = [...document.querySelectorAll(${JSON.stringify(a)})].find((e) => e.innerText.includes(${JSON.stringify(b)})); if (el) el.click(); return !!el })()`
    await waitFor(() => evaluate(js), `«${b}» (${a})`, 40)
    return sleep(300)
  }
  if (kind === 'fill') {
    const js = `(() => { const el = [...document.querySelectorAll('input')].find((e) => e.placeholder === ${JSON.stringify(a)}); if (!el) return false; el.value = ${JSON.stringify(b)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`
    await waitFor(() => evaluate(js), `el campo «${a}»`, 40)
  }
}

try {
  for (const s of SHOTS) {
    await open(s.view)
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
