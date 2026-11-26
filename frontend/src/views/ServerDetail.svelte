<script lang="ts">
  // Ficha de un servidor: la pieza principal. Su estado al momento (CPU,
  // memoria, discos), su proyecto, las apps con sus direcciones, bases de
  // datos y lo que pesan, contenedores, servicios, puertos abiertos,
  // contraseñas y registros. Lee el servidor por SSH al abrirla (solo lee).
  import { onMount } from 'svelte'
  import {
    ArrowLeft, RefreshCw, Pencil, SquareTerminal, LoaderCircle, Cpu, MemoryStick, HardDrive, Clock, FolderGit2, Plus, ExternalLink,
    Database, Box, ScrollText, TriangleAlert, Globe, Network, CircleCheck, CircleAlert, KeyRound,
    LayoutDashboard, DatabaseBackup, ArrowRight, History, Blocks, Play, Square, RotateCw, Eraser, ShieldExclamationPoint, PackageCheck, Power, ClockExclamationPoint, LockKeyhole, Gauge, Earth, ShieldCheck, FolderOpen,
  } from '@lucide/svelte'
  import Modal from '../components/Modal.svelte'
  import ProjectEditor from './ProjectEditor.svelte'
  import RunHistory from '../components/RunHistory.svelte'
  import AdoptSection from '../components/AdoptSection.svelte'
  import ServerForm from './ServerForm.svelte'
  import { api, errorText, type DockerResult, type MonitorResult, type ServerLogsResult, type ServerOverview, type ServerOverviewResult } from '../lib/api'
  import { ui, toast, timeAgo, refreshProjects, openRecipe, moduleName, openTerminal, confirmDialog } from '../lib/state.svelte'
  import { sameValues } from '../lib/modules'
  import { withConnection } from '../lib/connect'
  import BackupsPanel from '../components/BackupsPanel.svelte'
  import HistoryPanel from '../components/HistoryPanel.svelte'
  import DriftPanel from '../components/DriftPanel.svelte'
  import SnapshotsPanel from '../components/SnapshotsPanel.svelte'
  import DomainsPanel from '../components/DomainsPanel.svelte'
  import FilesPanel from '../components/FilesPanel.svelte'
  import SecurityPanel from '../components/SecurityPanel.svelte'
  import { securityChecks, securityScore, scoreLevel } from '../lib/security'
  import Sparkline from '../components/Sparkline.svelte'
  import { alerts, rememberOverview, serverFindings, driftOpen, domainProblem } from '../lib/alerts.svelte'
  import { t as tr, agoText } from '../lib/i18n.svelte'

  let { id }: { id: string } = $props()

  const server = $derived(ui.servers.find((s) => s.id === id))
  // Los módulos del servidor (desde la 0.50, uno por servidor). «deployments»
  // es una lista de 0 o 1 para el código que recorre módulos instalados.
  const deployments = $derived(ui.projects.filter((p) => p.serverId === id))
  const project = $derived(deployments[0])
  const recipeName = (rid?: string) => ui.recipes.find((r) => r.id === rid)?.name
  const applied = $derived((project?.templates ?? []).map((t) => ({ id: t, name: recipeName(t) })).filter((t) => t.name))
  // Módulos por instalar o con la configuración cambiada desde la última vez.
  const pendingMods = $derived(project ? project.modules.filter((m) => !(project.installedModules ?? []).includes(m.id) || !sameValues(m.values, project.installedValues?.[m.id] ?? {})).length : 0)
  let ov = $state<ServerOverview | null>(null)
  let loading = $state(false)
  let error = $state('')
  let editing = $state(false)
  let logs = $state<{ title: string; kind: string; name: string; text: string; loading: boolean } | null>(null)

  async function load() {
    loading = true
    error = ''
    try {
      const r = await withConnection<ServerOverviewResult>(server, (s, a, u) => api.ServerOverview(id, s, a, u))
      if (!r) return
      if (r.status !== 'ok' || !r.overview) error = r.message || tr('No se pudo leer el servidor')
      else { ov = r.overview; rememberOverview(id, r.overview) }
    } catch (e) {
      error = errorText(e)
    } finally {
      loading = false
    }
  }
  onMount(load)

  // Actualizar sola: cada cierto tiempo, sin pedir nada (si hace falta una
  // contraseña que no está guardada, lo dice y espera a «Actualizar»).
  const AUTO_OPTS = [[0, 'No'], [30, '30 s'], [60, tr('1 min')], [300, tr('5 min')]] as const
  let auto = $state(readAuto())
  let autoNote = $state('')
  function readAuto(): number {
    try { return Number(localStorage.getItem('dn-ficha-auto') ?? 60) || 0 } catch { return 60 }
  }
  function setAuto(v: number) {
    auto = v
    autoNote = ''
    try { localStorage.setItem('dn-ficha-auto', String(v)) } catch { /* sin almacenamiento */ }
  }
  async function silent() {
    if (loading || !ov || document.hidden || ui.view !== 'servers' || ui.serverId !== id) return
    try {
      const r = await api.ServerOverview(id, '', '', '')
      if (r.status === 'ok' && r.overview) { ov = r.overview; autoNote = ''; rememberOverview(id, r.overview) }
      else if (['needs_secret', 'vault_locked', 'needs_sudo'].includes(r.status)) autoNote = tr('para actualizar sola necesita la contraseña guardada (o la bóveda abierta)')
    } catch { /* siguiente vuelta */ }
  }
  $effect(() => {
    if (!auto) return
    const t = setInterval(silent, auto * 1000)
    return () => clearInterval(t)
  })

  async function showLogs(kind: string, name: string, title: string) {
    logs = { title, kind, name, text: '', loading: true }
    const r = await withConnection<ServerLogsResult>(server, (s, a, u) => api.ServerLogs(id, kind, name, 400, s, a, u))
    if (!logs) return
    logs.loading = false
    logs.text = r?.status === 'ok' ? r.text || tr('(vacío)') : r?.message || tr('No se pudo leer')
  }

  // La primera vez, el servidor recibe su conjunto de módulos (vacío).
  onMount(() => {
    if (!ui.projects.some((p) => p.serverId === id)) api.ServerModules(id).then(refreshProjects).catch(() => {})
  })

  // Apps de Draupnode con dirección (módulos con proxy_site instalados).
  const draupnodeApps = $derived(deployments.flatMap((p) => (p.installedModules ?? []).flatMap((mid) => {
    const m = ui.modules?.modules.find((x) => x.id === mid)
    if (!m?.proxySite) return []
    const v = p.installedValues?.[mid] ?? {}
    return [{ project: p, module: m, domain: String(v[m.proxySite.domain] ?? ''), port: Number(v[m.proxySite.port] ?? 0) }]
  })))

  // Grafana (módulo Monitorización): no tiene dominio, se abre por túnel SSH.
  const grafanaDeps = $derived(deployments.filter((p) => p.installedModules?.includes('monitoring')))
  const grafanaPort = (p: (typeof deployments)[number]) => Number(p.installedValues?.monitoring?.monitoring_grafana_port ?? 3000)
  async function openGrafana(projectId: string) {
    const r = await withConnection<MonitorResult>(server, (s, a) => api.OpenGrafana(projectId, s, a))
    if (r?.status === 'ok' && r.url) api.OpenURL(r.url)
    else if (r) toast(r.message || tr('No se pudo abrir Grafana'), 'error')
  }

  async function openApp(projectId: string, moduleId: string) {
    const r = await withConnection<MonitorResult>(server, (s, a) => api.OpenAppTunnel(projectId, moduleId, s, a))
    if (r?.status === 'ok' && r.url) api.OpenURL(r.url)
    else if (r) toast(r.message || tr('No se pudo abrir'), 'error')
  }

  const fmt = (n: number) => {
    const u = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = 0
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
    return `${n.toFixed(i > 1 ? 1 : 0)} ${u[i]}`
  }
  const pct = (used: number, total: number) => (total ? Math.round((used / total) * 100) : 0)
  const uptime = (s: number) => {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600)
    return d ? `${d} d ${h} h` : tr('{0} h {1} min', h, Math.floor((s % 3600) / 60))
  }
  const level = (p: number) => (p >= 90 ? 'bad' : p >= 75 ? 'warn' : 'ok')
  const url = (u: string) => (u.startsWith('http') ? u : 'https://' + u)
  const sys = $derived(ov?.system)
  const memUsed = $derived(sys ? sys.memTotal - sys.memAvailable : 0)
  const publicPorts = $derived((ov?.ports ?? []).filter((p) => p.public))
  const inRange = (spec: string, n: number) => {
    const [a, b] = spec.split('-').map(Number)
    return b ? n >= a && n <= b : n === a
  }
  const listening = (proto: string, spec: string) => publicPorts.some((p) => p.proto === proto && inRange(spec, p.port))
  const idlePorts = $derived(ov?.firewall?.active ? [...ov.firewall.tcp.filter((p) => !listening('tcp', p)).map((p) => p + '/tcp'), ...ov.firewall.udp.filter((p) => !listening('udp', p)).map((p) => p + '/udp')] : [])
  // Lo que publica Docker no pasa por la cadena INPUT: se salta el cortafuegos.
  const dockerPorts = $derived(publicPorts.filter((p) => p.process === 'docker-proxy').map((p) => `${p.port}/${p.proto}`))
  const blockedPorts = $derived(publicPorts.filter((p) => p.process !== 'docker-proxy' && !(p.proto === 'tcp' ? ov?.firewall?.tcp : ov?.firewall?.udp)?.some((s) => inRange(s, p.port))).map((p) => `${p.port}/${p.proto}`))
  // ---- Uso por app: los contenedores sumados por app (la misma clave que el historial)
  const MODULE_OF: Record<string, string> = { 'draupnode-monitor': 'monitoring', 'draupnode-logs': 'logs', 'draupnode-postgres': 'postgres', 'draupnode-mariadb': 'mariadb', 'draupnode-destino-copias': 'backup-target' }
  function appLabel(k: string): { name: string; via: string } {
    if (k.startsWith('coolify:')) return { name: k.slice(8), via: tr('Coolify') }
    if (MODULE_OF[k]) return { name: moduleName(MODULE_OF[k]), via: tr('Draupnode') }
    if (k.startsWith('dn-')) {
      const x = k.slice(3)
      if (ui.modules?.modules.some((m) => m.id === x)) return { name: moduleName(x), via: tr('Draupnode') }
      return { name: x, via: tr('Tu app') }
    }
    return { name: k, via: (ov?.containers ?? []).some((c) => c.compose === k) ? tr('Docker Compose') : 'contenedor' }
  }
  const appUsage = $derived.by(() => {
    const by = new Map<string, { key: string; name: string; via: string; total: number; running: number; cpu: number; mem: number }>()
    for (const c of ov?.containers ?? []) {
      const key = c.app || (c.coolify ? 'coolify:' + c.coolify : c.compose || c.name)
      let a = by.get(key)
      if (!a) { a = { key, ...appLabel(key), total: 0, running: 0, cpu: 0, mem: 0 }; by.set(key, a) }
      a.total++
      if (c.state === 'running') a.running++
      a.cpu += c.cpuP ?? (parseFloat(c.cpu ?? '') || 0)
      a.mem += c.memB ?? 0
    }
    return [...by.values()].sort((x, y) => y.mem - x.mem)
  })
  const appMemTop = $derived(Math.max(1, ...Object.values(ov?.history?.apps ?? {}).map((a) => a.memMax)))
  const appCpuTop = $derived(Math.max(5, ...Object.values(ov?.history?.apps ?? {}).map((a) => a.cpuMax)))
  const badContainers = $derived((ov?.containers ?? []).filter((c) => c.state !== 'running' || c.health === 'unhealthy'))

  // ---- Pestañas (se recuerda la última abierta)
  type Tab = 'resumen' | 'modulos' | 'apps' | 'dominios' | 'contenedores' | 'copias' | 'red' | 'ficheros' | 'registros'
  const ping = $derived(alerts.ping[id])
  const isDown = $derived(!!ping && !ping.reachable && !ping.lab)
  const findings = $derived(ov ? serverFindings(ov) : [])
  const sickContainers = $derived((ov?.containers ?? []).filter((c) => ['restarting', 'dead'].includes(c.state) || c.health === 'unhealthy'))
  const runningContainers = $derived((ov?.containers ?? []).filter((c) => c.state === 'running').length)
  const backupDeps = $derived(deployments.filter((p) => p.installedModules?.includes('backups')))
  const backupFindings = $derived(findings.filter((f) => f.id.startsWith('bk')))
  const appCount = $derived(draupnodeApps.length + grafanaDeps.length + (ov?.coolify ? 1 + ov.coolify.apps.length : 0) + (ov?.sites?.length ?? 0))
  const rootDisk = $derived(ov?.disks?.find((d) => d.mount === '/') ?? ov?.disks?.[0])
  // Lo mismo que lista «Necesita atención» en el Resumen.
  const drifted = $derived(driftOpen(alerts.drifts[id]).length)
  const secScore = $derived(ov ? securityScore(securityChecks(ov, project?.installedModules ?? [])) : null)
  const domainIssues = $derived((alerts.domains[id]?.domains ?? []).map(domainProblem).filter((p) => !!p))
  // Avisos del sistema (reinicio, actualizaciones de seguridad, certificados, hora, SSH).
  const sysFindings = $derived(findings.filter((f) => /^(reboot|secupd|cert|clock|ssh|clamav)/.test(f.id)))
  const attention = $derived((isDown ? 1 : 0) + sickContainers.length + (ov?.failed?.length ?? 0) + findings.filter((f) => f.id.startsWith('disk') || f.id.startsWith('bk')).length + sysFindings.length + (pendingMods ? 1 : 0) + (drifted ? 1 : 0))
  const tabs = $derived([
    { id: 'resumen' as Tab, label: tr('Resumen'), icon: LayoutDashboard, badge: attention, bad: isDown || findings.some((f) => f.bad) },
    { id: 'modulos' as Tab, label: tr('Módulos'), icon: Blocks, count: project?.modules.length ?? 0, badge: pendingMods, bad: false },
    { id: 'apps' as Tab, label: tr('Apps y bases'), icon: Globe, count: appCount + (ov?.databases?.reduce((t, d) => t + d.databases.length, 0) ?? 0), badge: 0, bad: false },
    { id: 'dominios' as Tab, label: tr('Dominios'), icon: Earth, count: alerts.domains[id]?.domains.length ?? 0, badge: domainIssues.length, bad: domainIssues.some((p) => p.bad) },
    { id: 'contenedores' as Tab, label: tr('Contenedores'), icon: Box, count: ov?.containers?.length ?? 0, badge: sickContainers.length, bad: true },
    ...(backupDeps.length || ov?.backups?.length ? [{ id: 'copias' as Tab, label: tr('Copias'), icon: DatabaseBackup, count: 0, badge: backupFindings.length, bad: backupFindings.some((f) => f.bad) }] : []),
    { id: 'red' as Tab, label: tr('Red y seguridad'), icon: Network, count: 0, badge: 0, bad: false },
    { id: 'ficheros' as Tab, label: tr('Ficheros'), icon: FolderOpen, count: 0, badge: 0, bad: false },
    { id: 'registros' as Tab, label: tr('Registros'), icon: ScrollText, count: 0, badge: ov?.failed?.length ?? 0, bad: true },
  ])
  let tab = $state<Tab>(readTab())
  function readTab(): Tab {
    try {
      const t = localStorage.getItem('dn-ficha-tab')
      return (t === 'plantillas' ? 'modulos' : (t as Tab)) || 'resumen'
    } catch { return 'resumen' }
  }
  // Otra pantalla pide abrir una pestaña (p. ej. «Abrir» en un aviso → Módulos).
  $effect(() => {
    const want = ui.serverTab
    if (want) { setTab(want as Tab); ui.serverTab = null }
  })
  function setTab(t: Tab) {
    tab = t
    try { localStorage.setItem('dn-ficha-tab', t) } catch { /* sin almacenamiento */ }
  }
  // Si la pestaña recordada no existe en este servidor (Copias), al Resumen.
  const current = $derived(tabs.some((t) => t.id === tab) ? tab : 'resumen')
  let onlySick = $state(false)

  // ---- Utilidades del sistema: instalar actualizaciones y reiniciar
  let sysBusy = $state<'' | 'upgrade' | 'reboot'>('')
  let sysOutput = $state('')
  async function upgrade() {
    const ok = await confirmDialog({ title: tr('Instalar actualizaciones en {0}', server?.name), message: tr('Se instalan ahora los paquetes pendientes del sistema (apt upgrade). Tarda unos minutos; las apps siguen funcionando.'), confirmLabel: tr('Instalar') })
    if (!ok) return
    sysBusy = 'upgrade'
    sysOutput = ''
    try {
      const r = await withConnection<DockerResult>(server, (s, a, u) => api.ServerUpgrade(id, s, a, u))
      if (r?.status === 'ok') { sysOutput = r.output || tr('Hecho.'); toast(tr('Actualizaciones instaladas')); await load() }
      else if (r) toast(r.message || tr('No se pudo'), 'error')
    } finally {
      sysBusy = ''
    }
  }
  async function reboot() {
    const ok = await confirmDialog({ title: tr('Reiniciar {0}', server?.name), message: tr('El servidor se reinicia ahora: durante uno o dos minutos no responderá y sus apps estarán paradas. Las que tengan reinicio «unless-stopped» vuelven solas.'), confirmLabel: tr('Reiniciar'), danger: true })
    if (!ok) return
    sysBusy = 'reboot'
    try {
      const r = await withConnection<DockerResult>(server, (s, a, u) => api.ServerReboot(id, s, a, u))
      if (r?.status === 'ok') toast(tr('{0} se está reiniciando: vuelve en un par de minutos (pulsa «Actualizar» entonces)', server?.name))
      else if (r) toast(r.message || tr('No se pudo'), 'error')
    } finally {
      sysBusy = ''
    }
  }

  // ---- Controles de Docker: parar / arrancar / reiniciar y limpiar
  let ctrBusy = $state('')
  async function containerAction(name: string, action: 'start' | 'stop' | 'restart') {
    if (action === 'stop') {
      const ok = await confirmDialog({ title: tr('Parar {0}', name), message: tr('El contenedor se para hasta que lo arranques (o hasta que vuelvas a aplicar sus módulos). Lo que sirva dejará de funcionar mientras tanto.'), confirmLabel: tr('Parar'), danger: true })
      if (!ok) return
    }
    ctrBusy = name + ':' + action
    try {
      const r = await withConnection<DockerResult>(server, (s, a, u) => api.ContainerAction(id, name, action, s, a, u))
      if (r?.status === 'ok') { toast(tr(action === 'start' ? '{0}: arrancado' : action === 'stop' ? '{0}: parado' : '{0}: reiniciado', name)); await load() }
      else if (r) toast(r.message || tr('No se pudo'), 'error')
    } finally {
      ctrBusy = ''
    }
  }
  let cleaning = $state<{ usage: DockerResult['usage']; what: string[]; busy: boolean; output: string } | null>(null)
  async function openClean() {
    const r = await withConnection<DockerResult>(server, (s, a, u) => api.DockerDiskUsage(id, s, a, u))
    if (r?.status !== 'ok') { if (r) toast(r.message || tr('No se pudo leer Docker'), 'error'); return }
    cleaning = { usage: r.usage ?? [], what: ['images', 'build'], busy: false, output: '' }
  }
  async function doClean() {
    if (!cleaning) return
    cleaning.busy = true
    const r = await withConnection<DockerResult>(server, (s, a, u) => api.DockerPrune(id, cleaning!.what, s, a, u))
    if (!cleaning) return
    cleaning.busy = false
    if (r?.status === 'ok') { cleaning.output = r.output || tr('Hecho.'); load() }
    else if (r) toast(r.message || tr('No se pudo limpiar'), 'error')
  }
  const usageOf = (t: string) => cleaning?.usage?.find((u) => u.type === t)
  let moduleOpen = $state(false)
</script>


{#if server}
  <div class="bar">
    <button class="btn ghost sm" onclick={() => (ui.serverId = null)}><ArrowLeft size={15} /> {tr('Servidores')}</button>
    <div class="actions">
      {#if ov}<span class="muted small" title={autoNote}>{tr('Leído {0}{1}', timeAgo(new Date(ov.at * 1000).toISOString()), autoNote ? ' · ' + autoNote : '')}</span>{/if}
      <label class="auto muted small" title={tr('Volver a leer el servidor solo mientras la ficha está a la vista')}>{tr('Actualizar sola')}
        <select class="input" value={auto} onchange={(e) => setAuto(Number((e.currentTarget as HTMLSelectElement).value))}>
          {#each AUTO_OPTS as [v, l]}<option value={v}>{l}</option>{/each}
        </select>
      </label>
      <button class="btn sm" onclick={load} disabled={loading}>{#if loading}<LoaderCircle size={14} class="spin" />{:else}<RefreshCw size={14} />{/if} {tr('Actualizar')}</button>
      <button class="btn sm" onclick={() => (editing = true)}><Pencil size={14} /> {tr('Editar conexión')}</button>
      <button class="btn sm primary" onclick={() => server && openTerminal(server.id)}><SquareTerminal size={14} /> {tr('Terminal')}</button>
    </div>
  </div>

  <header class="top">
    <div class="ident">
      <div class="title">
        <span class="dot" class:ok={ping?.reachable} class:err={isDown}></span>
        <h1>{server.name}</h1>
        <span class="small" class:muted={!isDown} class:bad-t={isDown}>
          {#if !ping}{tr('comprobando…')}{:else if ping.reachable}{tr('responde · {0} ms', ping.latencyMs)}{:else if ping.lab}{tr('parado (servidor de pruebas)')}{:else}{tr('no responde')}{/if}
        </span>
      </div>
      <div class="sub muted">
        <span class="mono selectable">{server.user}@{server.host}{server.port !== 22 ? ':' + server.port : ''}</span>
        {#if sys}<span>· {sys.os}</span><span>· {sys.hostname}</span><span>{tr('· encendido {0}', uptime(sys.uptime))}</span>{/if}
      </div>
      {#if server.notes}<p class="muted notes">{server.notes}</p>{/if}
    </div>
  </header>

  {#if error}
    <div class="card err"><CircleAlert size={18} /> <div><strong>{tr('No se pudo leer el servidor.')}</strong> {error}</div></div>
  {/if}

  <div class="tabs" role="tablist">
    {#each tabs as t (t.id)}
      <button role="tab" class="tab" class:on={current === t.id} aria-selected={current === t.id} onclick={() => setTab(t.id)}>
        <t.icon size={15} /> {t.label}
        {#if t.badge}<span class="badge-n" class:bad={t.bad}>{t.badge}</span>{:else if t.count}<span class="count">{t.count}</span>{/if}
      </button>
    {/each}
  </div>

  {#if current === 'resumen'}
    <section class="stats">
      <div class="card stat">
        <div class="st-h"><Cpu size={16} /> CPU</div>
        {#if sys}<div class="big">{Math.round(sys.cpu)} %</div><div class="meter"><i class={level(sys.cpu)} style:width="{Math.min(100, sys.cpu)}%"></i></div><div class="muted small">{tr('{0} núcleos · carga {1}', sys.cpus, sys.load.map((l) => l.toFixed(2)).join(' / '))}</div>
        {:else}<div class="muted">{loading ? tr('Leyendo…') : '—'}</div>{/if}
      </div>
      <div class="card stat">
        <div class="st-h"><MemoryStick size={16} /> {tr('Memoria')}</div>
        {#if sys}<div class="big">{pct(memUsed, sys.memTotal)} %</div><div class="meter"><i class={level(pct(memUsed, sys.memTotal))} style:width="{pct(memUsed, sys.memTotal)}%"></i></div><div class="muted small">{tr('{0} de {1}', fmt(memUsed), fmt(sys.memTotal))}{sys.swapTotal ? tr(' · swap {0}', fmt(sys.swapTotal - sys.swapFree)) : ''}</div>
        {:else}<div class="muted">{loading ? tr('Leyendo…') : '—'}</div>{/if}
      </div>
      <div class="card stat">
        <div class="st-h"><HardDrive size={16} /> {tr('Disco')} {#if rootDisk}<span class="mono">{rootDisk.mount}</span>{/if}</div>
        {#if rootDisk}<div class="big">{pct(rootDisk.used, rootDisk.size)} %</div><div class="meter"><i class={level(pct(rootDisk.used, rootDisk.size))} style:width="{pct(rootDisk.used, rootDisk.size)}%"></i></div><div class="muted small">{tr('{0} libres de {1}', fmt(rootDisk.free), fmt(rootDisk.size))}</div>
          {#each (ov?.disks ?? []).filter((d) => d !== rootDisk) as d}<div class="muted small"><span class="mono">{d.mount}</span> {tr('· {0} % · {1} libres', pct(d.used, d.size), fmt(d.free))}</div>{/each}
        {:else}<div class="muted">{loading ? tr('Leyendo…') : '—'}</div>{/if}
      </div>
      <button class="card stat click" onclick={() => setTab('contenedores')} title={tr('Ver los contenedores')}>
        <div class="st-h"><Box size={16} /> {tr('Contenedores')}</div>
        {#if ov && !ov.docker}<div class="muted">{tr('Sin Docker')}</div>
        {:else if ov}<div class="big">{runningContainers}<span class="of">{' / '}{ov.containers?.length ?? 0}</span></div><div class="muted small">{tr('en marcha')}{#if sickContainers.length}{' · '}<span class="bad-t">{tr('{0} con problemas', sickContainers.length)}</span>{/if}</div>
        {:else}<div class="muted">{loading ? tr('Leyendo…') : '—'}</div>{/if}
      </button>
    </section>

    {#if ov?.updates || ov?.security || ov?.clock}
      <section class="card sysrow">
        <div class="si">
          <PackageCheck size={16} />
          <div><span class="muted small">{tr('Actualizaciones')}</span>
            <strong>{#if !ov.updates}—{:else if !ov.updates.total}{tr('al día')}{:else}{tr('{0} pendientes', ov.updates.total)}{#if ov.updates.security}{' · '}<span class="warn-t">{tr('{0} de seguridad', ov.updates.security)}</span>{/if}{/if}</strong>
            {#if ov.updates?.total}<button class="lnk small" onclick={upgrade} disabled={!!sysBusy}>{sysBusy === 'upgrade' ? tr('instalando…') : tr('Instalar…')}</button>{/if}</div>
        </div>
        <div class="si">
          <Power size={16} />
          <div><span class="muted small">{tr('Reinicio')}</span>
            <strong class:warn-t={ov.updates?.reboot}>{ov.updates?.reboot ? tr('pendiente') : tr('no hace falta')}</strong>
            <button class="lnk small" onclick={reboot} disabled={!!sysBusy}>{sysBusy === 'reboot' ? tr('reiniciando…') : tr('Reiniciar…')}</button></div>
        </div>
        <div class="si">
          <LockKeyhole size={16} />
          <div><span class="muted small">{tr('Intentos de SSH (24 h)')}</span>
            <strong class:warn-t={(ov.security?.failed24h ?? 0) >= 50 && !ov.security?.fail2ban}>{ov.security ? ov.security.failed24h : '—'}{#if ov.security?.ips}<span class="muted small">{' '}{tr('de {0} IP{1}', ov.security.ips, ov.security.ips === 1 ? '' : 's')}</span>{/if}</strong>
            <span class="muted small">{ov.security?.fail2ban ? tr('fail2ban: {0} bloqueadas ahora', ov.security.fail2ban.banned) : tr('sin fail2ban')}</span></div>
        </div>
        <div class="si">
          <ClockExclamationPoint size={16} />
          <div><span class="muted small">{tr('Hora')}</span>
            <strong class:warn-t={ov.clock?.known && !ov.clock.synced}>{!ov.clock?.known ? '—' : ov.clock.synced ? tr('sincronizada') : tr('sin sincronizar')}</strong>
            <span class="muted small">{ov.clock?.timezone ?? ''}</span></div>
        </div>
        {#if secScore !== null}
          <button class="si click" onclick={() => setTab('red')} title={tr('Ver la seguridad del servidor')}>
            <ShieldCheck size={16} />
            <div><span class="muted small">{tr('Seguridad')}</span>
              <strong class:ok-t={scoreLevel(secScore) === 'ok'} class:warn-t={scoreLevel(secScore) === 'warn'} class:bad-t={scoreLevel(secScore) === 'bad'}>{secScore}/100</strong>
              <span class="muted small">{tr('ver qué arreglar')}</span></div>
          </button>
        {/if}
        {#if ov.certs?.length}
          {@const next = [...ov.certs].filter((c) => c.days !== undefined).sort((a, b) => a.days! - b.days!)[0]}
          <div class="si">
            <ShieldExclamationPoint size={16} />
            <div><span class="muted small">{tr('Certificados HTTPS')}</span>
              <strong class:warn-t={next && next.days! < 21} class:bad-t={next && next.days! < 7}>{next ? tr('{0} días', next.days) : tr('con problemas')}</strong>
              <span class="muted small">{next ? next.domain : ''}</span></div>
          </div>
        {/if}
      </section>
    {/if}

    {#if attention}
    <section class="card block">
      <h2><TriangleAlert size={17} /> {tr('Necesita atención')}</h2>
        <ul class="att">
          {#if isDown}<li class="bad-t">{tr('No responde por SSH. Puede estar apagado, sin red o con el puerto cerrado.')}</li>{/if}
          {#each sickContainers as c}<li class="bad-t">{tr('Contenedor')} <strong>{c.name}</strong>: {c.state}{c.health ? ` (${c.health})` : ''}{c.restarts ? tr(' · {0} reinicios', c.restarts) : ''} <button class="lnk" onclick={() => showLogs('container', c.name, c.name)}>{tr('ver registro')}</button></li>{/each}
          {#each ov?.failed ?? [] as u}<li class="bad-t">{tr('Servicio')} <strong>{u}</strong> {tr('ha fallado')} <button class="lnk" onclick={() => showLogs('unit', u, u)}>{tr('ver registro')}</button></li>{/each}
          {#each findings.filter((f) => f.id.startsWith('disk')) as f}<li class:bad-t={f.bad} class:warn-t={!f.bad}>{f.text}</li>{/each}
          {#each backupFindings as f}<li class:bad-t={f.bad} class:warn-t={!f.bad}>{f.text} <button class="lnk" onclick={() => setTab('copias')}>{tr('ver copias')}</button></li>{/each}
          {#each sysFindings as f}<li class:bad-t={f.bad} class:warn-t={!f.bad}>{f.text}{' '}{#if f.id === 'reboot'}<button class="lnk" onclick={reboot}>{tr('reiniciar…')}</button>{:else if f.id.startsWith('secupd')}<button class="lnk" onclick={upgrade}>{tr('instalar…')}</button>{:else}<button class="lnk" onclick={() => setTab('red')}>{tr('ver')}</button>{/if}</li>{/each}
          {#if drifted}<li class="warn-t">{tr(drifted === 1 ? '1 cosa ha cambiado fuera de Draupnode' : '{0} cosas han cambiado fuera de Draupnode', drifted)} <button class="lnk" onclick={() => document.getElementById('desvios')?.scrollIntoView({ behavior: 'smooth' })}>{tr('ver qué')}</button></li>{/if}
          {#if pendingMods}<li class="info-t">{tr('{0} sin aplicar', pendingMods === 1 ? tr('Hay 1 módulo') : tr('Hay {0} módulos', pendingMods))} <button class="lnk" onclick={() => setTab('modulos')}>{tr('ver módulos')}</button></li>{/if}
        </ul>
    </section>
    {/if}

    {#if server}<div id="desvios"><DriftPanel {server} onfix={() => setTab('modulos')} /></div>{/if}
    {#if server}<SnapshotsPanel {server} onrestored={() => { ov = null; load() }} />{/if}

    {#if ov}<HistoryPanel {server} history={ov.history} {loading} onchange={load} />{/if}

    <div class="two">
      <section class="card block">
        <div class="h2row"><h2><Blocks size={17} /> {tr('Módulos')}</h2><button class="btn sm ghost" onclick={() => setTab('modulos')}>{tr('Gestionar')} <ArrowRight size={13} /></button></div>
        {#if !project?.modules.length}
          <p class="muted">{tr('Ninguno todavía.')} <button class="lnk" onclick={() => setTab('modulos')}>{tr('Añade módulos o aplica una plantilla')}</button>.</p>
        {:else}
          <p class="small">
            <strong>{project.modules.length}</strong> {tr(project.modules.length === 1 ? 'módulo' : 'módulos')}
            {#if pendingMods}<span class="pill warn">{tr('{0} sin aplicar', pendingMods)}</span>{:else if project.appliedAt}<span class="pill ok"><CircleCheck size={12} /> {tr('Aplicados {0}', timeAgo(project.appliedAt))}</span>{/if}
          </p>
          <p class="mods">{project.modules.map((m) => moduleName(m.id)).join(' · ')}</p>
        {/if}
        <div class="tpl">
          <span class="muted small">{tr('Plantillas aplicadas:')}</span>
          {#each applied as t (t.id)}
            <button class="chip" onclick={() => openRecipe(t.id)} title={tr('Editar la plantilla «{0}»', t.name)}><FolderGit2 size={12} /> {t.name}</button>
          {:else}
            <span class="muted small">{tr('ninguna')}</span>
          {/each}
        </div>
      </section>
      <section class="card block">
        <div class="h2row"><h2><Globe size={17} /> {tr('Apps')}</h2>{#if appCount}<button class="btn sm ghost" onclick={() => setTab('apps')}>{tr('Todas')} <ArrowRight size={13} /></button>{/if}</div>
        {#if !appCount}<p class="muted">{loading ? tr('Leyendo…') : tr('No hay apps publicadas que se puedan ver desde aquí.')}</p>{/if}
        <ul class="applist">
          {#each draupnodeApps as a}<li><span><strong>{a.module.name}</strong> <span class="muted small">{a.domain || tr('sin dominio')}</span></span><button class="btn sm ghost" onclick={() => openApp(a.project.id, a.module.id)}><ExternalLink size={13} /> {tr('Abrir')}</button></li>{/each}
          {#each grafanaDeps as p}<li><span><strong>{tr('Grafana')}</strong> <span class="muted small">{tr('monitorización · por túnel SSH')}</span></span><button class="btn sm ghost" onclick={() => openGrafana(p.id)}><ExternalLink size={13} /> {tr('Abrir')}</button></li>{/each}
          {#if ov?.coolify}<li><span><strong>{tr('Panel de Coolify')}</strong></span><button class="btn sm ghost" onclick={() => api.OpenURL(ov?.coolify?.panel ? url(ov.coolify.panel) : `http://${server!.host}:8000`)}><ExternalLink size={13} /> {tr('Abrir')}</button></li>{/if}
          {#each (ov?.coolify?.apps ?? []).filter((c) => c.urls[0]) as c}<li><span><strong>{c.name}</strong> <span class="muted small">{c.urls[0]}</span></span><button class="btn sm ghost" onclick={() => api.OpenURL(url(c.urls[0]))}><ExternalLink size={13} /> {tr('Abrir')}</button></li>{/each}
          {#each ov?.sites ?? [] as st}<li><span><strong>{st.domain}</strong> <span class="muted small">{st.server}</span></span><button class="btn sm ghost" onclick={() => api.OpenURL((st.https ? 'https://' : 'http://') + st.domain)}><ExternalLink size={13} /> {tr('Abrir')}</button></li>{/each}
        </ul>
      </section>
    </div>

    <RunHistory serverId={id} limit={5} title={tr('Actividad reciente')} refreshKey={deployments.map((p) => p.lastRun?.at ?? '').join()} />
  {/if}

  {#if current === 'modulos'}
    {#if project}
      {#key project.id}
        <ProjectEditor id={project.id} embedded bind:moduleOpen>
          {#snippet after()}
            {#if ov}<div class="adopt-gap"><AdoptSection serverId={id} {ov} {deployments} /></div>{/if}
          {/snippet}
        </ProjectEditor>
      {/key}
    {:else}
      <p class="muted"><LoaderCircle size={14} class="spin" /> {tr('Preparando los módulos del servidor…')}</p>
    {/if}
  {/if}

  {#if current === 'apps'}
    <section class="card block">
      <h2><Globe size={17} /> {tr('Apps y direcciones')}</h2>
      {#if !appCount}
        <p class="muted">{loading ? tr('Leyendo…') : tr('No hay apps publicadas que se puedan ver desde aquí.')}</p>
      {/if}
      <table class="tbl">
        <tbody>
          {#each draupnodeApps as a}
            <tr>
              <td><strong>{a.module.name}</strong><br /><span class="muted small">Draupnode{#if a.project.modules.find((x) => x.id === a.module.id)?.from}{tr(' · de «{0}»', recipeName(a.project.modules.find((x) => x.id === a.module.id)?.from) ?? '')}{/if}</span></td>
              <td>{#if a.domain}<button class="lnk" onclick={() => api.OpenURL('https://' + a.domain)}>https://{a.domain}</button>{:else}<span class="muted small">{tr('sin dominio · 127.0.0.1:{0}', a.port)}</span>{/if}</td>
              <td class="r"><button class="btn sm" onclick={() => openApp(a.project.id, a.module.id)}><ExternalLink size={13} /> {tr('Abrir')}</button></td>
            </tr>
          {/each}
          {#each grafanaDeps as p}
            <tr>
              <td><strong>{tr('Grafana')}</strong><br /><span class="muted small">{tr('Draupnode · Monitorización')}</span></td>
              <td><span class="muted small">{tr('127.0.0.1:{0} en el servidor · se abre por túnel SSH (usuario admin; contraseña en Plantillas → Contraseñas)', grafanaPort(p))}</span></td>
              <td class="r"><button class="btn sm" onclick={() => openGrafana(p.id)}><ExternalLink size={13} /> {tr('Abrir')}</button></td>
            </tr>
          {/each}
          {#if ov?.coolify}
            <tr>
              <td><strong>{tr('Panel de Coolify')}</strong><br /><span class="muted small">{tr('Coolify')}</span></td>
              <td>{#if ov.coolify.panel}<button class="lnk" onclick={() => api.OpenURL(url(ov!.coolify!.panel))}>{ov.coolify.panel}</button>{:else}<span class="muted small">http://{server.host}:8000</span>{/if}</td>
              <td class="r"><button class="btn sm" onclick={() => api.OpenURL(ov?.coolify?.panel ? url(ov.coolify.panel) : `http://${server!.host}:8000`)}><ExternalLink size={13} /> {tr('Abrir')}</button></td>
            </tr>
            {#each ov.coolify.apps as c}
              <tr>
                <td><strong>{c.name}</strong><br /><span class="muted small">{tr('Coolify · {0}{1}', c.kind, c.status ? ' · ' + c.status : '')}</span></td>
                <td>{#each c.urls as u}<button class="lnk block-l" onclick={() => api.OpenURL(url(u))}>{u}</button>{:else}<span class="muted small">{tr('sin dominio')}</span>{/each}</td>
                <td class="r">{#if c.urls[0]}<button class="btn sm" onclick={() => api.OpenURL(url(c.urls[0]))}><ExternalLink size={13} /> {tr('Abrir')}</button>{/if}</td>
              </tr>
            {/each}
          {/if}
          {#each ov?.sites ?? [] as st}
            <tr>
              <td><strong>{st.domain}</strong><br /><span class="muted small">{st.server} · {st.target || '—'}</span></td>
              <td><button class="lnk" onclick={() => api.OpenURL((st.https ? 'https://' : 'http://') + st.domain)}>{st.https ? 'https' : 'http'}://{st.domain}</button></td>
              <td class="r"><button class="btn sm" onclick={() => api.OpenURL((st.https ? 'https://' : 'http://') + st.domain)}><ExternalLink size={13} /> {tr('Abrir')}</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section class="card block">
      <h2><Gauge size={17} /> {tr('Uso por app')} {#if ov?.history?.hasData}<span class="muted small">{tr('· ahora y en las últimas 24 h')}</span>{/if}</h2>
      {#if !ov}<p class="muted">{loading ? tr('Leyendo…') : '—'}</p>
      {:else if !ov.docker || !appUsage.length}<p class="muted">{tr('No hay apps en contenedores.')}</p>
      {:else}
        <table class="tbl usage">
          <thead><tr><th>{tr('App')}</th><th class="r">{tr('CPU ahora')}</th><th class="r">{tr('Memoria ahora')}</th>{#if ov.history?.hasData}<th>{tr('CPU 24 h')}</th><th>{tr('Memoria 24 h')}</th>{/if}</tr></thead>
          <tbody>
            {#each appUsage as a (a.key)}
              {@const h = ov.history?.apps?.[a.key]}
              <tr>
                <td><strong>{a.name}</strong><br /><span class="muted small">{a.via} · {a.running === a.total ? tr(a.total === 1 ? '{0} contenedor' : '{0} contenedores', a.total) : tr('{0} de {1} en marcha', a.running, a.total)}</span></td>
                <td class="r mono small">{a.running ? `${a.cpu.toFixed(a.cpu < 10 ? 1 : 0)} %` : '—'}</td>
                <td class="r mono small">{a.running ? fmt(a.mem) : '—'}{#if sys && a.mem}<br /><span class="muted">{tr('{0} % del total', ((a.mem / sys.memTotal) * 100).toFixed(1))}</span>{/if}</td>
                {#if ov.history?.hasData}
                  <td>{#if h}<Sparkline values={h.series.map((p) => p[1])} times={h.series.map((p) => p[0])} top={appCpuTop} format={(v) => `${v.toFixed(1)} %`} label={tr('CPU de {0} en 24 h', a.name)} /><br /><span class="muted small">{tr('media {0} % · máx. {1} %', h.cpuAvg.toFixed(1), h.cpuMax.toFixed(1))}</span>{:else}<span class="muted small">{tr('sin datos aún')}</span>{/if}</td>
                  <td>{#if h}<Sparkline values={h.series.map((p) => p[2])} times={h.series.map((p) => p[0])} top={appMemTop} format={fmt} label={tr('Memoria de {0} en 24 h', a.name)} /><br /><span class="muted small">máx. {fmt(h.memMax)}</span>{:else}<span class="muted small">{tr('sin datos aún')}</span>{/if}</td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
        {#if !ov.history?.hasData}<p class="muted small">{tr('Para ver cómo ha ido cada app en las últimas 24 h, activa el historial en el Resumen.')}</p>{/if}
      {/if}
    </section>

    <section class="card block">
      <h2><Database size={17} /> {tr('Bases de datos')}</h2>
      {#each ov?.databases ?? [] as d}
        <div class="db">
          <div class="db-h"><strong>{d.engine}</strong> <span class="mono small muted">{d.container} · {d.image}</span>
            <span class="muted small">{tr('· {0} en total', fmt(d.databases.reduce((t, x) => t + x.size, 0)))}</span>
            <button class="lnk small" onclick={() => showLogs('container', d.container, d.container)}>{tr('registro')}</button></div>
          <table class="tbl">
            <tbody>
              {#each d.databases as b}<tr><td class="mono">{b.name}</td><td class="r">{fmt(b.size)}</td></tr>{:else}<tr><td class="muted small">{tr('No se pudieron leer sus bases.')}</td></tr>{/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="muted">{loading ? tr('Leyendo…') : tr('No hay bases de datos en contenedores (PostgreSQL, MariaDB/MySQL).')}</p>
      {/each}
    </section>
  {/if}

  {#if current === 'dominios' && server}
    <DomainsPanel {server} />
  {/if}

  {#if current === 'contenedores'}
    <section class="card block">
      <div class="h2row">
        <h2><Box size={17} /> {tr('Contenedores')} {#if ov?.docker}<span class="muted small">{tr('· {0} en marcha de {1}', runningContainers, ov.containers?.length ?? 0)}</span>{/if}</h2>
        <div class="row">
          {#if ov?.docker && (ov.containers?.length ?? 0) > 0}<label class="chk small"><input type="checkbox" bind:checked={onlySick} /> {tr('Solo los que no están en marcha o fallan')}</label>{/if}
          {#if ov?.docker}<button class="btn sm" onclick={openClean} title={tr('Ver cuánto ocupa Docker y borrar lo que no se usa (nunca los volúmenes)')}><Eraser size={14} /> {tr('Limpiar Docker…')}</button>{/if}
        </div>
      </div>
      {#if !ov}<p class="muted">{loading ? tr('Leyendo…') : '—'}</p>
      {:else if !ov.docker}<p class="muted">{tr('Este servidor no tiene Docker.')}</p>
      {:else}
        <table class="tbl">
          <thead><tr><th>{tr('Nombre')}</th><th>{tr('Estado')}</th><th>CPU</th><th>{tr('Memoria')}</th><th>{tr('Puertos')}</th><th></th></tr></thead>
          <tbody>
            {#each (ov.containers ?? []).filter((c) => !onlySick || badContainers.includes(c)) as c}
              <tr>
                <td><strong>{c.name}</strong><br /><span class="muted small mono">{c.image}</span>
                  {#if c.draupnode || c.coolify || c.compose}<br /><span class="muted small">{c.draupnode ? tr('Draupnode · ') + c.draupnode : c.coolify ? tr('Coolify · ') + c.coolify : tr('compose · ') + c.compose}</span>{/if}</td>
                <td><span class="pill {c.state === 'running' && c.health !== 'unhealthy' ? 'ok' : 'bad'}">{c.state}{c.health ? ' · ' + c.health : ''}</span>{#if c.restarts}<br /><span class="muted small">{c.restarts} reinicios</span>{/if}</td>
                <td class="mono small">{c.cpu ?? ''}</td>
                <td class="mono small">{c.mem ?? ''}</td>
                <td class="mono small">{c.ports.join(', ')}</td>
                <td class="r"><div class="acts">
                  {#if c.state === 'running' || c.state === 'restarting'}
                    <button class="btn sm ghost icon" title={tr('Reiniciar')} disabled={!!ctrBusy} onclick={() => containerAction(c.name, 'restart')}>{#if ctrBusy === c.name + ':restart'}<LoaderCircle size={13} class="spin" />{:else}<RotateCw size={13} />{/if}</button>
                    <button class="btn sm ghost icon" title={tr('Parar')} disabled={!!ctrBusy} onclick={() => containerAction(c.name, 'stop')}>{#if ctrBusy === c.name + ':stop'}<LoaderCircle size={13} class="spin" />{:else}<Square size={13} />{/if}</button>
                  {:else}
                    <button class="btn sm ghost icon" title={tr('Arrancar')} disabled={!!ctrBusy} onclick={() => containerAction(c.name, 'start')}>{#if ctrBusy === c.name + ':start'}<LoaderCircle size={13} class="spin" />{:else}<Play size={13} />{/if}</button>
                  {/if}
                  <button class="btn sm ghost" onclick={() => showLogs('container', c.name, c.name)}><ScrollText size={13} /> {tr('Registro')}</button>
                </div></td>
              </tr>
            {:else}
              <tr><td colspan="6" class="muted">{onlySick ? tr('Todos en marcha y sanos.') : tr('No hay contenedores.')}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  {/if}

  {#if current === 'copias'}
    <section class="card block">
      <h2><DatabaseBackup size={17} /> {tr('Estado de las copias en el servidor')}</h2>
      {#if !ov}<p class="muted">{loading ? tr('Leyendo…') : tr('Pulsa «Actualizar» para leer el servidor.')}</p>
      {:else if !ov.backups?.length}<p class="muted">{tr('El servidor no tiene ninguna copia programada por Draupnode todavía (se crea al aplicar el módulo Copias).')}</p>
      {:else}
        <table class="tbl">
          <thead><tr><th>{tr('Copia')}</th><th>De</th><th>{tr('Última')}</th><th></th></tr></thead>
          <tbody>
            {#each ov.backups as b (b.slug)}
              {@const p = deployments.find((d) => d.slug === b.slug)}
              <tr>
                <td class="mono">{b.slug}</td>
                <td>{#if p}{tr('este servidor')}{:else}<span class="muted small">{tr('no la conoce este Draupnode ·')} <button class="lnk" onclick={() => setTab('modulos')}>recuperar</button></span>{/if}</td>
                <td>
                  {#if b.running}<strong>{tr('haciéndose ahora')}</strong>
                  {:else if !b.ok}<strong class="bad-t">{tr('falló')}</strong>
                  {:else if b.ago === null}<span class="warn-t">{tr('no consta ninguna')}</span>
                  {:else}<span class:warn-t={b.ago > 26 * 3600}>{agoText(b.ago)}</span>{#if b.ago <= 26 * 3600} <CircleCheck size={13} class="ok-i" />{/if}{/if}
                </td>
                <td class="r"><button class="btn sm ghost" onclick={() => showLogs('unit', 'draupnode-copia-' + b.slug, tr('Copias · ') + b.slug)}><ScrollText size={13} /> {tr('Registro')}</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
    {#each backupDeps as p (p.id)}
      <section class="card block">
        <h2><DatabaseBackup size={17} /> {tr('Copias de seguridad')}</h2>
        <BackupsPanel project={p} />
      </section>
    {/each}
  {/if}

  {#if current === 'red' && ov}
    <SecurityPanel {ov} installed={project?.installedModules ?? []} onmodules={() => setTab('modulos')} onupgrade={upgrade} onreboot={reboot}
      onports={() => document.getElementById('puertos')?.scrollIntoView({ behavior: 'smooth' })} />
  {/if}

  {#if current === 'red'}
    <section class="card block" id="puertos">
      <h2><Network size={17} /> {tr('Puertos y cortafuegos')}</h2>
      {#if !ov}<p class="muted">{loading ? tr('Leyendo…') : '—'}</p>
      {:else}
        <h3>{tr('El cortafuegos deja pasar')}</h3>
        {#if !ov.firewall}<p class="muted">{tr('No se pudo leer.')}</p>
        {:else if !ov.firewall.active}<p class="muted">{tr('No hay cortafuegos activo: se llega a cualquier puerto en el que algo escuche.')}</p>
        {:else if ov.firewall.tcp.length || ov.firewall.udp.length}
          <div class="ports">
            {#each ov.firewall.tcp as p}<span class="pill mono" class:idle={!listening('tcp', p)}>{p}/tcp</span>{/each}
            {#each ov.firewall.udp as p}<span class="pill mono" class:idle={!listening('udp', p)}>{p}/udp</span>{/each}
          </div>
          {#if idlePorts.length}<p class="muted small">{tr('{0}: abierto{1}, pero ahora no hay nada escuchando (se usará cuando instales algo que lo necesite, como Caddy o nginx en el 80/443).', idlePorts.join(', '), idlePorts.length > 1 ? 's' : '')}</p>{/if}
        {:else}<p class="muted">{tr('Nada: todo cerrado.')}</p>{/if}
        <h3>{tr('Programas escuchando hacia fuera')}</h3>
        {#if publicPorts.length}
          <div class="ports">{#each publicPorts as p}<span class="pill mono">{p.port}/{p.proto} · {p.process || '?'}</span>{/each}</div>
        {:else}<p class="muted">{tr('Ninguno aparte de los locales.')}</p>{/if}
        {#if ov.firewall?.active && dockerPorts.length}<p class="muted small">{tr('{0}: {1} Docker, que se salta este cortafuegos: se llega desde fuera aunque no esté en la lista de arriba.', dockerPorts.join(', '), dockerPorts.length > 1 ? tr('los publica') : tr('lo publica'))}</p>{/if}
        {#if ov.firewall?.active && blockedPorts.length}<p class="muted small">{tr('{0}: escucha{1}, pero el cortafuegos no {2} deja pasar desde fuera.', blockedPorts.join(', '), blockedPorts.length > 1 ? 'n' : '', blockedPorts.length > 1 ? 'los' : 'lo')}</p>{/if}
        {@const local = (ov.ports ?? []).filter((p) => !p.public)}
        {#if local.length}
          <h3>{tr('Solo dentro del servidor')}</h3>
          <div class="ports">{#each local as p}<span class="pill mono idle">{p.addr}:{p.port}/{p.proto} · {p.process || '?'}</span>{/each}</div>
          <p class="muted small">{tr('No se llega desde fuera; se abren con un túnel SSH (como Grafana o las apps sin dominio).')}</p>
        {/if}
      {/if}
    </section>
  {/if}

  {#if current === 'red' && ov}
    <section class="card block">
      <h2><LockKeyhole size={17} /> {tr('Intentos de entrar por SSH (últimas 24 h)')}</h2>
      {#if !ov.security}<p class="muted">{tr('No se pudo leer.')}</p>
      {:else}
        <p class="small"><strong>{ov.security.failed24h}</strong> {tr('intentos fallidos desde')} <strong>{ov.security.ips}</strong> {tr(ov.security.ips === 1 ? 'IP.' : 'IPs.')}
          {#if ov.security.fail2ban}{tr('fail2ban tiene')} <strong>{ov.security.fail2ban.banned}</strong> {tr('bloqueadas ahora ({0} en total).', ov.security.fail2ban.total)}{:else}<span class="warn-t">{tr('Sin fail2ban: el módulo «SSH seguro» bloquea a quien insiste y quita la entrada con contraseña.')}</span>{/if}</p>
        {#if ov.security.top.length}<div class="ports">{#each ov.security.top as t}<span class="pill mono">{t.ip} · {t.count}</span>{/each}</div>{/if}
        <p class="muted small">{tr('Es normal ver intentos en un servidor con el SSH abierto a internet: son robots probando contraseñas. Lo que importa es que no puedan entrar (solo con clave) y que se les bloquee.')}</p>
      {/if}
    </section>
    <section class="card block">
      <h2><ShieldExclamationPoint size={17} /> {tr('Certificados HTTPS')}</h2>
      {#each ov.certs ?? [] as c}
        <p class="small"><span class="mono">{c.domain}</span> · {#if c.error}<span class="warn-t">{c.error}</span>{:else}<span class:warn-t={c.days! < 21} class:bad-t={c.days! < 7}>{tr('caduca en {0} días', c.days)}</span>{c.issuer ? ` · ${c.issuer}` : ''}{/if}</p>
      {:else}
        <p class="muted small">{tr('Ningún dominio con HTTPS en nginx o Caddy en este servidor.')}</p>
      {/each}
      <p class="muted small">{tr('Caddy y certbot (nginx) los renuevan solos unos 30 días antes; si uno baja de 21 días, algo falla en la renovación (el dominio ya no apunta aquí, el puerto 80 cerrado…).')}</p>
    </section>
    <section class="card block">
      <h2><PackageCheck size={17} /> {tr('Actualizaciones del sistema')}</h2>
      {#if !ov.updates}<p class="muted">{tr('No se pudo leer.')}</p>
      {:else if !ov.updates.total}<p class="small">{tr('Al día.{0}', ov.updates.reboot ? tr(' Pero falta reiniciar para terminar las últimas.') : '')}</p>
      {:else}
        <p class="small"><strong>{ov.updates.total}</strong> {tr('paquetes por actualizar')}{#if ov.updates.security}, <span class="warn-t">{tr('{0} de seguridad', ov.updates.security)}</span>{/if}: <span class="mono">{ov.updates.packages.join(', ')}{ov.updates.total > ov.updates.packages.length ? '…' : ''}</span></p>
      {/if}
      <div class="row">
        <button class="btn sm" onclick={upgrade} disabled={!!sysBusy || !ov.updates?.total}>{#if sysBusy === 'upgrade'}<LoaderCircle size={14} class="spin" />{:else}<PackageCheck size={14} />{/if} {tr('Instalar actualizaciones…')}</button>
        <button class="btn sm danger" onclick={reboot} disabled={!!sysBusy}><Power size={14} /> {tr('Reiniciar el servidor…')}</button>
      </div>
      <p class="muted small">{tr('El módulo «Sistema base» ya instala solo las de seguridad cada día; esto es para hacerlo ahora. Si hace falta reiniciar, tus apps vuelven solas (si su reinicio es «unless-stopped»).')}</p>
      {#if sysOutput}<pre class="log selectable">{sysOutput}</pre>{/if}
    </section>
  {/if}

  {#if current === 'ficheros' && server}
    <FilesPanel {server} />
  {/if}

  {#if current === 'registros'}
    <section class="card block">
      <h2><ScrollText size={17} /> {tr('Registros del servidor')}</h2>
      <div class="row">
        <button class="btn sm" onclick={() => showLogs('system', '', tr('Registro del sistema'))}><ScrollText size={14} /> {tr('Registro del sistema')}</button>
        <button class="btn sm" onclick={() => showLogs('unit', 'ssh', 'SSH')}><ScrollText size={14} /> {tr('Registro de SSH')}</button>
        {#each ov?.failed ?? [] as u}<button class="btn sm danger" onclick={() => showLogs('unit', u, u)}><ScrollText size={14} /> {tr('{0} (falló)', u)}</button>{/each}
      </div>
      <p class="muted small">{tr('Los de cada contenedor están en la pestaña')} <button class="lnk" onclick={() => setTab('contenedores')}>{tr('Contenedores')}</button>.</p>
    </section>
    <RunHistory serverId={id} refreshKey={deployments.map((p) => p.lastRun?.at ?? '').join()} />
  {/if}

  {#if ov?.errors?.length}<p class="muted small">{tr('No se pudo leer todo: {0}', ov.errors.join(' · '))}</p>{/if}
{/if}

{#if cleaning}
  <Modal title={tr('Limpiar Docker')} width={620} onclose={() => (cleaning = null)}>
    {#if cleaning.output}
      <pre class="log selectable">{cleaning.output}</pre>
      <p class="muted small">{tr('Listo. Los volúmenes (los datos) no se han tocado.')}</p>
    {:else}
      <p class="muted small">{tr('Borra lo que no usa ningún contenedor para liberar disco.')} <strong>{tr('Los volúmenes (donde están los datos de tus apps y bases de datos) nunca se tocan.')}</strong></p>
      <label class="chk"><input type="checkbox" checked={cleaning.what.includes('images')} onchange={(e) => cleaning && (cleaning.what = (e.currentTarget as HTMLInputElement).checked ? [...cleaning.what, 'images'] : cleaning.what.filter((x) => x !== 'images'))} />
        <span><strong>{tr('Imágenes que no usa ningún contenedor')}</strong> <span class="muted small">{tr('· se pueden recuperar {0} · se vuelven a bajar o construir si hacen falta', usageOf('Images')?.reclaimable ?? '—')}</span></span></label>
      <label class="chk"><input type="checkbox" checked={cleaning.what.includes('build')} onchange={(e) => cleaning && (cleaning.what = (e.currentTarget as HTMLInputElement).checked ? [...cleaning.what, 'build'] : cleaning.what.filter((x) => x !== 'build'))} />
        <span><strong>{tr('Caché de construcción')}</strong> <span class="muted small">{tr('· {0} · la próxima construcción tardará más', usageOf('Build Cache')?.reclaimable ?? '—')}</span></span></label>
      <label class="chk"><input type="checkbox" checked={cleaning.what.includes('containers')} onchange={(e) => cleaning && (cleaning.what = (e.currentTarget as HTMLInputElement).checked ? [...cleaning.what, 'containers'] : cleaning.what.filter((x) => x !== 'containers'))} />
        <span><strong>{tr('Contenedores parados')}</strong> <span class="muted small">{tr('· {0} · se borran; los de tus apps se vuelven a crear al aplicar', usageOf('Containers')?.reclaimable ?? '—')}</span></span></label>
      <p class="muted small">{tr('Ocupa ahora: imágenes {0}, caché {1}, volúmenes {2} (no se tocan).', usageOf('Images')?.size ?? '—', usageOf('Build Cache')?.size ?? '—', usageOf('Local Volumes')?.size ?? '—')}</p>
    {/if}
    {#snippet footer()}
      <button class="btn" onclick={() => (cleaning = null)}>{cleaning!.output ? tr('Cerrar') : tr('Cancelar')}</button>
      {#if !cleaning!.output}<button class="btn primary" onclick={doClean} disabled={cleaning!.busy || !cleaning!.what.length}>{#if cleaning!.busy}<LoaderCircle size={14} class="spin" /> {tr('Limpiando…')}{:else}<Eraser size={14} /> {tr('Limpiar')}{/if}</button>{/if}
    {/snippet}
  </Modal>
{/if}

{#if editing && server}
  <ServerForm {server} onclose={() => (editing = false)} onsaved={() => (editing = false)} />
{/if}

{#if logs}
  <Modal title={tr('Registro · ') + logs.title} width={980} onclose={() => (logs = null)}>
    {#if logs.loading}<p class="muted"><LoaderCircle size={15} class="spin" /> {tr('Leyendo…')}</p>
    {:else}
      <pre class="log selectable">{logs.text}</pre>
      <div class="row"><button class="btn sm" onclick={() => showLogs(logs!.kind, logs!.name, logs!.title)}><RefreshCw size={13} /> {tr('Volver a leer')}</button><span class="muted small">{tr('Últimas 400 líneas.')}</span></div>
    {/if}
  </Modal>
{/if}

<style>
  .bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
  .ident { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .title h1 { margin: 0; }
  .sub { display: flex; gap: 6px; flex-wrap: wrap; font-size: 13px; }
  .notes { margin: 2px 0 0; font-size: 13px; }
  .actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .auto { display: inline-flex; gap: 6px; align-items: center; }
  .auto .input { height: 28px; padding: 0 6px; width: auto; font-size: 12.5px; }
  .small { font-size: 12px; }
  .bad-t { color: var(--danger); }
  .warn-t { color: var(--warning); }
  .info-t { color: var(--info); }
  .err { display: flex; gap: 10px; align-items: flex-start; margin: 0 0 12px; border-color: var(--danger); }
  .err :global(svg) { color: var(--danger); flex: none; }
  .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 16px; overflow-x: auto; }
  .tab { display: inline-flex; align-items: center; gap: 6px; padding: 9px 9px; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; background: none; font: inherit; font-size: 13px; color: var(--muted); cursor: pointer; white-space: nowrap; }
  .tab:hover { color: var(--text); }
  .tab.on { color: var(--text); border-bottom-color: var(--accent); font-weight: 600; }
  .tab.on :global(svg) { color: var(--accent); }
  .count { font-size: 11.5px; color: var(--muted); font-weight: 400; }
  .badge-n { font-size: 11px; font-weight: 600; min-width: 18px; padding: 0 5px; line-height: 18px; text-align: center; border-radius: 9px; background: var(--warning); color: #fff; }
  .badge-n.bad { background: var(--danger); }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
  .stat { display: flex; flex-direction: column; gap: 6px; }
  .stat.click { font: inherit; color: inherit; text-align: left; cursor: pointer; }
  .stat.click:hover { border-color: var(--muted); }
  .st-h { display: flex; gap: 6px; align-items: center; color: var(--muted); font-size: 12.5px; font-weight: 600; }
  .big { font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .of { font-size: 15px; color: var(--muted); font-weight: 500; }
  .meter { height: 6px; border-radius: 3px; background: var(--border-soft); overflow: hidden; }
  .meter i { display: block; height: 100%; }
  .meter i.ok { background: var(--success); }
  .meter i.warn { background: var(--warning); }
  .meter i.bad { background: var(--danger); }
  .block { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
  .block h2 { display: flex; gap: 8px; align-items: center; font-size: 15px; margin: 0; }
  .block h2 :global(svg) { color: var(--accent); }
  .h2row { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
  .okline { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 13.5px; }
  .okline :global(svg), :global(.ok-i) { color: var(--success); vertical-align: -2px; }
  .att { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .two .block { margin-bottom: 14px; }
  .applist { list-style: none; margin: 0; padding: 0; }
  .applist li { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 5px 0; border-top: 1px solid var(--border-soft); font-size: 13px; }
  .applist li > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .adopt-gap { margin-top: 16px; }
  .sysrow { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 14px; padding: 12px 16px; }
  .si { display: flex; gap: 10px; align-items: flex-start; }
  .si > :global(svg) { color: var(--accent); flex: none; margin-top: 2px; }
  .si > div { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .si strong { font-size: 14px; }
  .si.click { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
  .si.click:hover strong { text-decoration: underline; }
  .ok-t { color: var(--success); }
  .tpl { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; gap: 5px; font: inherit; font-size: 12px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); cursor: pointer; }
  .chip:hover { border-color: var(--muted); }
  .dep { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 10px 12px; }
  .dep.slim { padding: 8px 10px; }
  .dep-main { background: none; border: 0; padding: 0; text-align: left; cursor: pointer; color: inherit; font: inherit; display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
  .mods { font-size: 12.5px; color: var(--muted); }
  .dep-st { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11.5px; background: var(--sidebar-hover); color: var(--muted); white-space: nowrap; }
  .pill.ok { background: var(--success-soft); color: var(--success); }
  .pill.warn { background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning); }
  .pill.bad { background: var(--danger-soft); color: var(--danger); }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .chk { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); cursor: pointer; }
  .secrets { display: flex; flex-direction: column; gap: 8px; }
  .secrets :global(.card) { box-shadow: none; margin: 0; }
  .tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
  .tbl th { text-align: left; font-size: 11.5px; color: var(--muted); font-weight: 600; padding: 4px 8px; border-bottom: 1px solid var(--border); }
  .tbl td { padding: 7px 8px; border-bottom: 1px solid var(--border-soft); vertical-align: top; }
  .tbl td.r { text-align: right; white-space: nowrap; }
  .tbl th.r { text-align: right; }
  .usage td { vertical-align: top; }
  .acts { display: flex; gap: 2px; justify-content: flex-end; align-items: center; }
  .lnk { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-align: left; }
  .lnk:hover { text-decoration: underline; }
  .block-l { display: block; }
  .db { display: flex; flex-direction: column; gap: 4px; }
  .db-h { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
  .ports { display: flex; flex-wrap: wrap; gap: 6px; }
  .pill.idle { opacity: 0.6; border: 1px dashed var(--border); }
  h3 { font-size: 0.9rem; margin: 6px 0 0; font-weight: 600; }
  .log { margin: 0; max-height: 60vh; overflow: auto; padding: 10px 12px; background: var(--panel-2); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); font-family: var(--mono); font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
  @media (max-width: 1100px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
    .two { grid-template-columns: 1fr; }
  }
</style>
