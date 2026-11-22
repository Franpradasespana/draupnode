<script lang="ts">
  // Ficha de un servidor: la pieza principal. Su estado al momento (CPU,
  // memoria, discos), su proyecto, las apps con sus direcciones, bases de
  // datos y lo que pesan, contenedores, servicios, puertos abiertos,
  // contraseñas y registros. Lee el servidor por SSH al abrirla (solo lee).
  import { onMount } from 'svelte'
  import {
    ArrowLeft, RefreshCw, Pencil, SquareTerminal, LoaderCircle, Cpu, MemoryStick, HardDrive, Clock, FolderGit2, Plus, ExternalLink,
    Database, Box, ScrollText, TriangleAlert, Globe, Network, CircleCheck, CircleAlert, KeyRound,
    LayoutDashboard, DatabaseBackup, ArrowRight, History, Blocks, Play, Square, RotateCw, Eraser,
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
  import { alerts, rememberOverview, serverFindings } from '../lib/alerts.svelte'

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
      if (r.status !== 'ok' || !r.overview) error = r.message || 'No se pudo leer el servidor'
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
  const AUTO_OPTS = [[0, 'No'], [30, '30 s'], [60, '1 min'], [300, '5 min']] as const
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
      else if (['needs_secret', 'vault_locked', 'needs_sudo'].includes(r.status)) autoNote = 'para actualizar sola necesita la contraseña guardada (o la bóveda abierta)'
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
    logs.text = r?.status === 'ok' ? r.text || '(vacío)' : r?.message || 'No se pudo leer'
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
    else if (r) toast(r.message || 'No se pudo abrir Grafana', 'error')
  }

  async function openApp(projectId: string, moduleId: string) {
    const r = await withConnection<MonitorResult>(server, (s, a) => api.OpenAppTunnel(projectId, moduleId, s, a))
    if (r?.status === 'ok' && r.url) api.OpenURL(r.url)
    else if (r) toast(r.message || 'No se pudo abrir', 'error')
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
    return d ? `${d} d ${h} h` : `${h} h ${Math.floor((s % 3600) / 60)} min`
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
  const badContainers = $derived((ov?.containers ?? []).filter((c) => c.state !== 'running' || c.health === 'unhealthy'))

  // ---- Pestañas (se recuerda la última abierta)
  type Tab = 'resumen' | 'modulos' | 'apps' | 'contenedores' | 'copias' | 'red' | 'registros'
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
  const attention = $derived((isDown ? 1 : 0) + sickContainers.length + (ov?.failed?.length ?? 0) + findings.filter((f) => f.id.startsWith('disk') || f.id.startsWith('bk')).length + (pendingMods ? 1 : 0))
  const tabs = $derived([
    { id: 'resumen' as Tab, label: 'Resumen', icon: LayoutDashboard, badge: attention, bad: isDown || findings.some((f) => f.bad) },
    { id: 'modulos' as Tab, label: 'Módulos', icon: Blocks, count: project?.modules.length ?? 0, badge: pendingMods, bad: false },
    { id: 'apps' as Tab, label: 'Apps y bases', icon: Globe, count: appCount + (ov?.databases?.reduce((t, d) => t + d.databases.length, 0) ?? 0), badge: 0, bad: false },
    { id: 'contenedores' as Tab, label: 'Contenedores', icon: Box, count: ov?.containers?.length ?? 0, badge: sickContainers.length, bad: true },
    ...(backupDeps.length || ov?.backups?.length ? [{ id: 'copias' as Tab, label: 'Copias', icon: DatabaseBackup, count: 0, badge: backupFindings.length, bad: backupFindings.some((f) => f.bad) }] : []),
    { id: 'red' as Tab, label: 'Red y seguridad', icon: Network, count: 0, badge: 0, bad: false },
    { id: 'registros' as Tab, label: 'Registros', icon: ScrollText, count: 0, badge: ov?.failed?.length ?? 0, bad: true },
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

  // ---- Controles de Docker: parar / arrancar / reiniciar y limpiar
  let ctrBusy = $state('')
  async function containerAction(name: string, action: 'start' | 'stop' | 'restart') {
    if (action === 'stop') {
      const ok = await confirmDialog({ title: `Parar ${name}`, message: 'El contenedor se para hasta que lo arranques (o hasta que vuelvas a aplicar sus módulos). Lo que sirva dejará de funcionar mientras tanto.', confirmLabel: 'Parar', danger: true })
      if (!ok) return
    }
    ctrBusy = name + ':' + action
    try {
      const r = await withConnection<DockerResult>(server, (s, a, u) => api.ContainerAction(id, name, action, s, a, u))
      if (r?.status === 'ok') { toast(`${name}: ${action === 'start' ? 'arrancado' : action === 'stop' ? 'parado' : 'reiniciado'}`); await load() }
      else if (r) toast(r.message || 'No se pudo', 'error')
    } finally {
      ctrBusy = ''
    }
  }
  let cleaning = $state<{ usage: DockerResult['usage']; what: string[]; busy: boolean; output: string } | null>(null)
  async function openClean() {
    const r = await withConnection<DockerResult>(server, (s, a, u) => api.DockerDiskUsage(id, s, a, u))
    if (r?.status !== 'ok') { if (r) toast(r.message || 'No se pudo leer Docker', 'error'); return }
    cleaning = { usage: r.usage ?? [], what: ['images', 'build'], busy: false, output: '' }
  }
  async function doClean() {
    if (!cleaning) return
    cleaning.busy = true
    const r = await withConnection<DockerResult>(server, (s, a, u) => api.DockerPrune(id, cleaning!.what, s, a, u))
    if (!cleaning) return
    cleaning.busy = false
    if (r?.status === 'ok') { cleaning.output = r.output || 'Hecho.'; load() }
    else if (r) toast(r.message || 'No se pudo limpiar', 'error')
  }
  const usageOf = (t: string) => cleaning?.usage?.find((u) => u.type === t)
  let moduleOpen = $state(false)
</script>


{#if server}
  <div class="bar">
    <button class="btn ghost sm" onclick={() => (ui.serverId = null)}><ArrowLeft size={15} /> Servidores</button>
    <div class="actions">
      {#if ov}<span class="muted small" title={autoNote}>Leído {timeAgo(new Date(ov.at * 1000).toISOString())}{autoNote ? ' · ' + autoNote : ''}</span>{/if}
      <label class="auto muted small" title="Volver a leer el servidor solo mientras la ficha está a la vista">Actualizar sola
        <select class="input" value={auto} onchange={(e) => setAuto(Number((e.currentTarget as HTMLSelectElement).value))}>
          {#each AUTO_OPTS as [v, l]}<option value={v}>{l}</option>{/each}
        </select>
      </label>
      <button class="btn sm" onclick={load} disabled={loading}>{#if loading}<LoaderCircle size={14} class="spin" />{:else}<RefreshCw size={14} />{/if} Actualizar</button>
      <button class="btn sm" onclick={() => (editing = true)}><Pencil size={14} /> Editar conexión</button>
      <button class="btn sm primary" onclick={() => server && openTerminal(server.id)}><SquareTerminal size={14} /> Terminal</button>
    </div>
  </div>

  <header class="top">
    <div class="ident">
      <div class="title">
        <span class="dot" class:ok={ping?.reachable} class:err={isDown}></span>
        <h1>{server.name}</h1>
        <span class="small" class:muted={!isDown} class:bad-t={isDown}>
          {#if !ping}comprobando…{:else if ping.reachable}responde · {ping.latencyMs} ms{:else if ping.lab}parado (servidor de pruebas){:else}no responde{/if}
        </span>
      </div>
      <div class="sub muted">
        <span class="mono selectable">{server.user}@{server.host}{server.port !== 22 ? ':' + server.port : ''}</span>
        {#if sys}<span>· {sys.os}</span><span>· {sys.hostname}</span><span>· encendido {uptime(sys.uptime)}</span>{/if}
      </div>
      {#if server.notes}<p class="muted notes">{server.notes}</p>{/if}
    </div>
  </header>

  {#if error}
    <div class="card err"><CircleAlert size={18} /> <div><strong>No se pudo leer el servidor.</strong> {error}</div></div>
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
        {#if sys}<div class="big">{Math.round(sys.cpu)} %</div><div class="meter"><i class={level(sys.cpu)} style:width="{Math.min(100, sys.cpu)}%"></i></div><div class="muted small">{sys.cpus} núcleos · carga {sys.load.map((l) => l.toFixed(2)).join(' / ')}</div>
        {:else}<div class="muted">{loading ? 'Leyendo…' : '—'}</div>{/if}
      </div>
      <div class="card stat">
        <div class="st-h"><MemoryStick size={16} /> Memoria</div>
        {#if sys}<div class="big">{pct(memUsed, sys.memTotal)} %</div><div class="meter"><i class={level(pct(memUsed, sys.memTotal))} style:width="{pct(memUsed, sys.memTotal)}%"></i></div><div class="muted small">{fmt(memUsed)} de {fmt(sys.memTotal)}{sys.swapTotal ? ` · swap ${fmt(sys.swapTotal - sys.swapFree)}` : ''}</div>
        {:else}<div class="muted">{loading ? 'Leyendo…' : '—'}</div>{/if}
      </div>
      <div class="card stat">
        <div class="st-h"><HardDrive size={16} /> Disco {#if rootDisk}<span class="mono">{rootDisk.mount}</span>{/if}</div>
        {#if rootDisk}<div class="big">{pct(rootDisk.used, rootDisk.size)} %</div><div class="meter"><i class={level(pct(rootDisk.used, rootDisk.size))} style:width="{pct(rootDisk.used, rootDisk.size)}%"></i></div><div class="muted small">{fmt(rootDisk.free)} libres de {fmt(rootDisk.size)}</div>
          {#each (ov?.disks ?? []).filter((d) => d !== rootDisk) as d}<div class="muted small"><span class="mono">{d.mount}</span> · {pct(d.used, d.size)} % · {fmt(d.free)} libres</div>{/each}
        {:else}<div class="muted">{loading ? 'Leyendo…' : '—'}</div>{/if}
      </div>
      <button class="card stat click" onclick={() => setTab('contenedores')} title="Ver los contenedores">
        <div class="st-h"><Box size={16} /> Contenedores</div>
        {#if ov && !ov.docker}<div class="muted">Sin Docker</div>
        {:else if ov}<div class="big">{runningContainers}<span class="of">{' / '}{ov.containers?.length ?? 0}</span></div><div class="muted small">en marcha{#if sickContainers.length}{' · '}<span class="bad-t">{sickContainers.length} con problemas</span>{/if}</div>
        {:else}<div class="muted">{loading ? 'Leyendo…' : '—'}</div>{/if}
      </button>
    </section>

    {#if attention}
    <section class="card block">
      <h2><TriangleAlert size={17} /> Necesita atención</h2>
        <ul class="att">
          {#if isDown}<li class="bad-t">No responde por SSH. Puede estar apagado, sin red o con el puerto cerrado.</li>{/if}
          {#each sickContainers as c}<li class="bad-t">Contenedor <strong>{c.name}</strong>: {c.state}{c.health ? ` (${c.health})` : ''}{c.restarts ? ` · ${c.restarts} reinicios` : ''} <button class="lnk" onclick={() => showLogs('container', c.name, c.name)}>ver registro</button></li>{/each}
          {#each ov?.failed ?? [] as u}<li class="bad-t">Servicio <strong>{u}</strong> ha fallado <button class="lnk" onclick={() => showLogs('unit', u, u)}>ver registro</button></li>{/each}
          {#each findings.filter((f) => f.id.startsWith('disk')) as f}<li class:bad-t={f.bad} class:warn-t={!f.bad}>{f.text}</li>{/each}
          {#each backupFindings as f}<li class:bad-t={f.bad} class:warn-t={!f.bad}>{f.text} <button class="lnk" onclick={() => setTab('copias')}>ver copias</button></li>{/each}
          {#if pendingMods}<li class="info-t">{pendingMods === 1 ? 'Hay 1 módulo' : `Hay ${pendingMods} módulos`} sin aplicar <button class="lnk" onclick={() => setTab('modulos')}>ver módulos</button></li>{/if}
        </ul>
    </section>
    {/if}

    <div class="two">
      <section class="card block">
        <div class="h2row"><h2><Blocks size={17} /> Módulos</h2><button class="btn sm ghost" onclick={() => setTab('modulos')}>Gestionar <ArrowRight size={13} /></button></div>
        {#if !project?.modules.length}
          <p class="muted">Ninguno todavía. <button class="lnk" onclick={() => setTab('modulos')}>Añade módulos o aplica una plantilla</button>.</p>
        {:else}
          <p class="small">
            <strong>{project.modules.length}</strong> {project.modules.length === 1 ? 'módulo' : 'módulos'}
            {#if pendingMods}<span class="pill warn">{pendingMods} sin aplicar</span>{:else if project.appliedAt}<span class="pill ok"><CircleCheck size={12} /> Aplicados {timeAgo(project.appliedAt)}</span>{/if}
          </p>
          <p class="mods">{project.modules.map((m) => moduleName(m.id)).join(' · ')}</p>
        {/if}
        <div class="tpl">
          <span class="muted small">Plantillas aplicadas:</span>
          {#each applied as t (t.id)}
            <button class="chip" onclick={() => openRecipe(t.id)} title="Editar la plantilla «{t.name}»"><FolderGit2 size={12} /> {t.name}</button>
          {:else}
            <span class="muted small">ninguna</span>
          {/each}
        </div>
      </section>
      <section class="card block">
        <div class="h2row"><h2><Globe size={17} /> Apps</h2>{#if appCount}<button class="btn sm ghost" onclick={() => setTab('apps')}>Todas <ArrowRight size={13} /></button>{/if}</div>
        {#if !appCount}<p class="muted">{loading ? 'Leyendo…' : 'No hay apps publicadas que se puedan ver desde aquí.'}</p>{/if}
        <ul class="applist">
          {#each draupnodeApps as a}<li><span><strong>{a.module.name}</strong> <span class="muted small">{a.domain || 'sin dominio'}</span></span><button class="btn sm ghost" onclick={() => openApp(a.project.id, a.module.id)}><ExternalLink size={13} /> Abrir</button></li>{/each}
          {#each grafanaDeps as p}<li><span><strong>Grafana</strong> <span class="muted small">monitorización · por túnel SSH</span></span><button class="btn sm ghost" onclick={() => openGrafana(p.id)}><ExternalLink size={13} /> Abrir</button></li>{/each}
          {#if ov?.coolify}<li><span><strong>Panel de Coolify</strong></span><button class="btn sm ghost" onclick={() => api.OpenURL(ov?.coolify?.panel ? url(ov.coolify.panel) : `http://${server!.host}:8000`)}><ExternalLink size={13} /> Abrir</button></li>{/if}
          {#each (ov?.coolify?.apps ?? []).filter((c) => c.urls[0]) as c}<li><span><strong>{c.name}</strong> <span class="muted small">{c.urls[0]}</span></span><button class="btn sm ghost" onclick={() => api.OpenURL(url(c.urls[0]))}><ExternalLink size={13} /> Abrir</button></li>{/each}
          {#each ov?.sites ?? [] as st}<li><span><strong>{st.domain}</strong> <span class="muted small">{st.server}</span></span><button class="btn sm ghost" onclick={() => api.OpenURL((st.https ? 'https://' : 'http://') + st.domain)}><ExternalLink size={13} /> Abrir</button></li>{/each}
        </ul>
      </section>
    </div>

    <RunHistory serverId={id} limit={5} title="Actividad reciente" refreshKey={deployments.map((p) => p.lastRun?.at ?? '').join()} />
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
      <p class="muted"><LoaderCircle size={14} class="spin" /> Preparando los módulos del servidor…</p>
    {/if}
  {/if}

  {#if current === 'apps'}
    <section class="card block">
      <h2><Globe size={17} /> Apps y direcciones</h2>
      {#if !appCount}
        <p class="muted">{loading ? 'Leyendo…' : 'No hay apps publicadas que se puedan ver desde aquí.'}</p>
      {/if}
      <table class="tbl">
        <tbody>
          {#each draupnodeApps as a}
            <tr>
              <td><strong>{a.module.name}</strong><br /><span class="muted small">Draupnode{a.project.modules.find((x) => x.id === a.module.id)?.from ? ' · de «' + (recipeName(a.project.modules.find((x) => x.id === a.module.id)?.from) ?? '') + '»' : ''}</span></td>
              <td>{#if a.domain}<button class="lnk" onclick={() => api.OpenURL('https://' + a.domain)}>https://{a.domain}</button>{:else}<span class="muted small">sin dominio · 127.0.0.1:{a.port}</span>{/if}</td>
              <td class="r"><button class="btn sm" onclick={() => openApp(a.project.id, a.module.id)}><ExternalLink size={13} /> Abrir</button></td>
            </tr>
          {/each}
          {#each grafanaDeps as p}
            <tr>
              <td><strong>Grafana</strong><br /><span class="muted small">Draupnode · Monitorización</span></td>
              <td><span class="muted small">127.0.0.1:{grafanaPort(p)} en el servidor · se abre por túnel SSH (usuario admin; contraseña en Plantillas → Contraseñas)</span></td>
              <td class="r"><button class="btn sm" onclick={() => openGrafana(p.id)}><ExternalLink size={13} /> Abrir</button></td>
            </tr>
          {/each}
          {#if ov?.coolify}
            <tr>
              <td><strong>Panel de Coolify</strong><br /><span class="muted small">Coolify</span></td>
              <td>{#if ov.coolify.panel}<button class="lnk" onclick={() => api.OpenURL(url(ov!.coolify!.panel))}>{ov.coolify.panel}</button>{:else}<span class="muted small">http://{server.host}:8000</span>{/if}</td>
              <td class="r"><button class="btn sm" onclick={() => api.OpenURL(ov?.coolify?.panel ? url(ov.coolify.panel) : `http://${server!.host}:8000`)}><ExternalLink size={13} /> Abrir</button></td>
            </tr>
            {#each ov.coolify.apps as c}
              <tr>
                <td><strong>{c.name}</strong><br /><span class="muted small">Coolify · {c.kind}{c.status ? ' · ' + c.status : ''}</span></td>
                <td>{#each c.urls as u}<button class="lnk block-l" onclick={() => api.OpenURL(url(u))}>{u}</button>{:else}<span class="muted small">sin dominio</span>{/each}</td>
                <td class="r">{#if c.urls[0]}<button class="btn sm" onclick={() => api.OpenURL(url(c.urls[0]))}><ExternalLink size={13} /> Abrir</button>{/if}</td>
              </tr>
            {/each}
          {/if}
          {#each ov?.sites ?? [] as st}
            <tr>
              <td><strong>{st.domain}</strong><br /><span class="muted small">{st.server} · {st.target || '—'}</span></td>
              <td><button class="lnk" onclick={() => api.OpenURL((st.https ? 'https://' : 'http://') + st.domain)}>{st.https ? 'https' : 'http'}://{st.domain}</button></td>
              <td class="r"><button class="btn sm" onclick={() => api.OpenURL((st.https ? 'https://' : 'http://') + st.domain)}><ExternalLink size={13} /> Abrir</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section class="card block">
      <h2><Database size={17} /> Bases de datos</h2>
      {#each ov?.databases ?? [] as d}
        <div class="db">
          <div class="db-h"><strong>{d.engine}</strong> <span class="mono small muted">{d.container} · {d.image}</span>
            <span class="muted small">· {fmt(d.databases.reduce((t, x) => t + x.size, 0))} en total</span>
            <button class="lnk small" onclick={() => showLogs('container', d.container, d.container)}>registro</button></div>
          <table class="tbl">
            <tbody>
              {#each d.databases as b}<tr><td class="mono">{b.name}</td><td class="r">{fmt(b.size)}</td></tr>{:else}<tr><td class="muted small">No se pudieron leer sus bases.</td></tr>{/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="muted">{loading ? 'Leyendo…' : 'No hay bases de datos en contenedores (PostgreSQL, MariaDB/MySQL).'}</p>
      {/each}
    </section>
  {/if}

  {#if current === 'contenedores'}
    <section class="card block">
      <div class="h2row">
        <h2><Box size={17} /> Contenedores {#if ov?.docker}<span class="muted small">· {runningContainers} en marcha de {ov.containers?.length ?? 0}</span>{/if}</h2>
        <div class="row">
          {#if ov?.docker && (ov.containers?.length ?? 0) > 0}<label class="chk small"><input type="checkbox" bind:checked={onlySick} /> Solo los que no están en marcha o fallan</label>{/if}
          {#if ov?.docker}<button class="btn sm" onclick={openClean} title="Ver cuánto ocupa Docker y borrar lo que no se usa (nunca los volúmenes)"><Eraser size={14} /> Limpiar Docker…</button>{/if}
        </div>
      </div>
      {#if !ov}<p class="muted">{loading ? 'Leyendo…' : '—'}</p>
      {:else if !ov.docker}<p class="muted">Este servidor no tiene Docker.</p>
      {:else}
        <table class="tbl">
          <thead><tr><th>Nombre</th><th>Estado</th><th>CPU</th><th>Memoria</th><th>Puertos</th><th></th></tr></thead>
          <tbody>
            {#each (ov.containers ?? []).filter((c) => !onlySick || badContainers.includes(c)) as c}
              <tr>
                <td><strong>{c.name}</strong><br /><span class="muted small mono">{c.image}</span>
                  {#if c.draupnode || c.coolify || c.compose}<br /><span class="muted small">{c.draupnode ? 'Draupnode · ' + c.draupnode : c.coolify ? 'Coolify · ' + c.coolify : 'compose · ' + c.compose}</span>{/if}</td>
                <td><span class="pill {c.state === 'running' && c.health !== 'unhealthy' ? 'ok' : 'bad'}">{c.state}{c.health ? ' · ' + c.health : ''}</span>{#if c.restarts}<br /><span class="muted small">{c.restarts} reinicios</span>{/if}</td>
                <td class="mono small">{c.cpu ?? ''}</td>
                <td class="mono small">{c.mem ?? ''}</td>
                <td class="mono small">{c.ports.join(', ')}</td>
                <td class="r"><div class="acts">
                  {#if c.state === 'running' || c.state === 'restarting'}
                    <button class="btn sm ghost icon" title="Reiniciar" disabled={!!ctrBusy} onclick={() => containerAction(c.name, 'restart')}>{#if ctrBusy === c.name + ':restart'}<LoaderCircle size={13} class="spin" />{:else}<RotateCw size={13} />{/if}</button>
                    <button class="btn sm ghost icon" title="Parar" disabled={!!ctrBusy} onclick={() => containerAction(c.name, 'stop')}>{#if ctrBusy === c.name + ':stop'}<LoaderCircle size={13} class="spin" />{:else}<Square size={13} />{/if}</button>
                  {:else}
                    <button class="btn sm ghost icon" title="Arrancar" disabled={!!ctrBusy} onclick={() => containerAction(c.name, 'start')}>{#if ctrBusy === c.name + ':start'}<LoaderCircle size={13} class="spin" />{:else}<Play size={13} />{/if}</button>
                  {/if}
                  <button class="btn sm ghost" onclick={() => showLogs('container', c.name, c.name)}><ScrollText size={13} /> Registro</button>
                </div></td>
              </tr>
            {:else}
              <tr><td colspan="6" class="muted">{onlySick ? 'Todos en marcha y sanos.' : 'No hay contenedores.'}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  {/if}

  {#if current === 'copias'}
    <section class="card block">
      <h2><DatabaseBackup size={17} /> Estado de las copias en el servidor</h2>
      {#if !ov}<p class="muted">{loading ? 'Leyendo…' : 'Pulsa «Actualizar» para leer el servidor.'}</p>
      {:else if !ov.backups?.length}<p class="muted">El servidor no tiene ninguna copia programada por Draupnode todavía (se crea al aplicar el módulo Copias).</p>
      {:else}
        <table class="tbl">
          <thead><tr><th>Copia</th><th>De</th><th>Última</th><th></th></tr></thead>
          <tbody>
            {#each ov.backups as b (b.slug)}
              {@const p = deployments.find((d) => d.slug === b.slug)}
              <tr>
                <td class="mono">{b.slug}</td>
                <td>{#if p}este servidor{:else}<span class="muted small">no la conoce este Draupnode · <button class="lnk" onclick={() => setTab('modulos')}>recuperar</button></span>{/if}</td>
                <td>
                  {#if b.running}<strong>haciéndose ahora</strong>
                  {:else if !b.ok}<strong class="bad-t">falló</strong>
                  {:else if b.ago === null}<span class="warn-t">no consta ninguna</span>
                  {:else}<span class:warn-t={b.ago > 26 * 3600}>hace {b.ago < 3600 ? Math.max(1, Math.round(b.ago / 60)) + ' min' : b.ago < 172800 ? Math.round(b.ago / 3600) + ' h' : Math.round(b.ago / 86400) + ' días'}</span>{#if b.ago <= 26 * 3600} <CircleCheck size={13} class="ok-i" />{/if}{/if}
                </td>
                <td class="r"><button class="btn sm ghost" onclick={() => showLogs('unit', 'draupnode-copia-' + b.slug, 'Copias · ' + b.slug)}><ScrollText size={13} /> Registro</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
    {#each backupDeps as p (p.id)}
      <section class="card block">
        <h2><DatabaseBackup size={17} /> Copias de seguridad</h2>
        <BackupsPanel project={p} />
      </section>
    {/each}
  {/if}

  {#if current === 'red'}
    <section class="card block">
      <h2><Network size={17} /> Puertos y cortafuegos</h2>
      {#if !ov}<p class="muted">{loading ? 'Leyendo…' : '—'}</p>
      {:else}
        <h3>El cortafuegos deja pasar</h3>
        {#if !ov.firewall}<p class="muted">No se pudo leer.</p>
        {:else if !ov.firewall.active}<p class="muted">No hay cortafuegos activo: se llega a cualquier puerto en el que algo escuche.</p>
        {:else if ov.firewall.tcp.length || ov.firewall.udp.length}
          <div class="ports">
            {#each ov.firewall.tcp as p}<span class="pill mono" class:idle={!listening('tcp', p)}>{p}/tcp</span>{/each}
            {#each ov.firewall.udp as p}<span class="pill mono" class:idle={!listening('udp', p)}>{p}/udp</span>{/each}
          </div>
          {#if idlePorts.length}<p class="muted small">{idlePorts.join(', ')}: abierto{idlePorts.length > 1 ? 's' : ''}, pero ahora no hay nada escuchando (se usará cuando instales algo que lo necesite, como Caddy o nginx en el 80/443).</p>{/if}
        {:else}<p class="muted">Nada: todo cerrado.</p>{/if}
        <h3>Programas escuchando hacia fuera</h3>
        {#if publicPorts.length}
          <div class="ports">{#each publicPorts as p}<span class="pill mono">{p.port}/{p.proto} · {p.process || '?'}</span>{/each}</div>
        {:else}<p class="muted">Ninguno aparte de los locales.</p>{/if}
        {#if ov.firewall?.active && dockerPorts.length}<p class="muted small">{dockerPorts.join(', ')}: {dockerPorts.length > 1 ? 'los publica' : 'lo publica'} Docker, que se salta este cortafuegos: se llega desde fuera aunque no esté en la lista de arriba.</p>{/if}
        {#if ov.firewall?.active && blockedPorts.length}<p class="muted small">{blockedPorts.join(', ')}: escucha{blockedPorts.length > 1 ? 'n' : ''}, pero el cortafuegos no {blockedPorts.length > 1 ? 'los' : 'lo'} deja pasar desde fuera.</p>{/if}
        {@const local = (ov.ports ?? []).filter((p) => !p.public)}
        {#if local.length}
          <h3>Solo dentro del servidor</h3>
          <div class="ports">{#each local as p}<span class="pill mono idle">{p.addr}:{p.port}/{p.proto} · {p.process || '?'}</span>{/each}</div>
          <p class="muted small">No se llega desde fuera; se abren con un túnel SSH (como Grafana o las apps sin dominio).</p>
        {/if}
      {/if}
    </section>
  {/if}

  {#if current === 'registros'}
    <section class="card block">
      <h2><ScrollText size={17} /> Registros del servidor</h2>
      <div class="row">
        <button class="btn sm" onclick={() => showLogs('system', '', 'Registro del sistema')}><ScrollText size={14} /> Registro del sistema</button>
        <button class="btn sm" onclick={() => showLogs('unit', 'ssh', 'SSH')}><ScrollText size={14} /> Registro de SSH</button>
        {#each ov?.failed ?? [] as u}<button class="btn sm danger" onclick={() => showLogs('unit', u, u)}><ScrollText size={14} /> {u} (falló)</button>{/each}
      </div>
      <p class="muted small">Los de cada contenedor están en la pestaña <button class="lnk" onclick={() => setTab('contenedores')}>Contenedores</button>.</p>
    </section>
    <RunHistory serverId={id} refreshKey={deployments.map((p) => p.lastRun?.at ?? '').join()} />
  {/if}

  {#if ov?.errors?.length}<p class="muted small">No se pudo leer todo: {ov.errors.join(' · ')}</p>{/if}
{/if}

{#if cleaning}
  <Modal title="Limpiar Docker" width={620} onclose={() => (cleaning = null)}>
    {#if cleaning.output}
      <pre class="log selectable">{cleaning.output}</pre>
      <p class="muted small">Listo. Los volúmenes (los datos) no se han tocado.</p>
    {:else}
      <p class="muted small">Borra lo que no usa ningún contenedor para liberar disco. <strong>Los volúmenes (donde están los datos de tus apps y bases de datos) nunca se tocan.</strong></p>
      <label class="chk"><input type="checkbox" checked={cleaning.what.includes('images')} onchange={(e) => cleaning && (cleaning.what = (e.currentTarget as HTMLInputElement).checked ? [...cleaning.what, 'images'] : cleaning.what.filter((x) => x !== 'images'))} />
        <span><strong>Imágenes que no usa ningún contenedor</strong> <span class="muted small">· se pueden recuperar {usageOf('Images')?.reclaimable ?? '—'} · se vuelven a bajar o construir si hacen falta</span></span></label>
      <label class="chk"><input type="checkbox" checked={cleaning.what.includes('build')} onchange={(e) => cleaning && (cleaning.what = (e.currentTarget as HTMLInputElement).checked ? [...cleaning.what, 'build'] : cleaning.what.filter((x) => x !== 'build'))} />
        <span><strong>Caché de construcción</strong> <span class="muted small">· {usageOf('Build Cache')?.reclaimable ?? '—'} · la próxima construcción tardará más</span></span></label>
      <label class="chk"><input type="checkbox" checked={cleaning.what.includes('containers')} onchange={(e) => cleaning && (cleaning.what = (e.currentTarget as HTMLInputElement).checked ? [...cleaning.what, 'containers'] : cleaning.what.filter((x) => x !== 'containers'))} />
        <span><strong>Contenedores parados</strong> <span class="muted small">· {usageOf('Containers')?.reclaimable ?? '—'} · se borran; los de tus apps se vuelven a crear al aplicar</span></span></label>
      <p class="muted small">Ocupa ahora: imágenes {usageOf('Images')?.size ?? '—'}, caché {usageOf('Build Cache')?.size ?? '—'}, volúmenes {usageOf('Local Volumes')?.size ?? '—'} (no se tocan).</p>
    {/if}
    {#snippet footer()}
      <button class="btn" onclick={() => (cleaning = null)}>{cleaning!.output ? 'Cerrar' : 'Cancelar'}</button>
      {#if !cleaning!.output}<button class="btn primary" onclick={doClean} disabled={cleaning!.busy || !cleaning!.what.length}>{#if cleaning!.busy}<LoaderCircle size={14} class="spin" /> Limpiando…{:else}<Eraser size={14} /> Limpiar{/if}</button>{/if}
    {/snippet}
  </Modal>
{/if}

{#if editing && server}
  <ServerForm {server} onclose={() => (editing = false)} onsaved={() => (editing = false)} />
{/if}

{#if logs}
  <Modal title={'Registro · ' + logs.title} width={980} onclose={() => (logs = null)}>
    {#if logs.loading}<p class="muted"><LoaderCircle size={15} class="spin" /> Leyendo…</p>
    {:else}
      <pre class="log selectable">{logs.text}</pre>
      <div class="row"><button class="btn sm" onclick={() => showLogs(logs!.kind, logs!.name, logs!.title)}><RefreshCw size={13} /> Volver a leer</button><span class="muted small">Últimas 400 líneas.</span></div>
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
  .tab { display: inline-flex; align-items: center; gap: 7px; padding: 9px 12px; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; background: none; font: inherit; font-size: 13.5px; color: var(--muted); cursor: pointer; white-space: nowrap; }
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
