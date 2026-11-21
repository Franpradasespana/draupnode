<script lang="ts">
  // Ficha de un servidor: la pieza principal. Su estado al momento (CPU,
  // memoria, discos), su proyecto, las apps con sus direcciones, bases de
  // datos y lo que pesan, contenedores, servicios, puertos abiertos,
  // contraseñas y registros. Lee el servidor por SSH al abrirla (solo lee).
  import { onMount } from 'svelte'
  import {
    ArrowLeft, RefreshCw, Pencil, SquareTerminal, LoaderCircle, Cpu, MemoryStick, HardDrive, Clock, FolderGit2, Plus, ExternalLink,
    Database, Box, ScrollText, TriangleAlert, Globe, Network, CircleCheck, CircleAlert, KeyRound,
  } from '@lucide/svelte'
  import Modal from '../components/Modal.svelte'
  import ProjectSecrets from '../components/ProjectSecrets.svelte'
  import RunHistory from '../components/RunHistory.svelte'
  import AdoptSection from '../components/AdoptSection.svelte'
  import ServerForm from './ServerForm.svelte'
  import { api, errorText, type MonitorResult, type ServerLogsResult, type ServerOverview, type ServerOverviewResult } from '../lib/api'
  import { ui, toast, timeAgo, refreshProjects, openDeployment, openRecipe, moduleName, openTerminal } from '../lib/state.svelte'
  import { withConnection } from '../lib/connect'

  let { id }: { id: string } = $props()

  const server = $derived(ui.servers.find((s) => s.id === id))
  const deployments = $derived(ui.projects.filter((p) => p.serverId === id))
  const recipeName = (rid?: string) => ui.recipes.find((r) => r.id === rid)?.name
  let ov = $state<ServerOverview | null>(null)
  let loading = $state(false)
  let error = $state('')
  let editing = $state(false)
  let deployPick = $state('')
  let logs = $state<{ title: string; kind: string; name: string; text: string; loading: boolean } | null>(null)

  async function load() {
    loading = true
    error = ''
    try {
      const r = await withConnection<ServerOverviewResult>(server, (s, a, u) => api.ServerOverview(id, s, a, u))
      if (!r) return
      if (r.status !== 'ok' || !r.overview) error = r.message || 'No se pudo leer el servidor'
      else ov = r.overview
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
      if (r.status === 'ok' && r.overview) { ov = r.overview; autoNote = '' }
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

  async function deploy() {
    if (!deployPick) return
    try {
      const p = await api.DeployRecipe(deployPick, id)
      await refreshProjects()
      deployPick = ''
      toast('Plantilla asociada. Revísala y pulsa Aplicar cuando quieras.')
      openDeployment(p.id)
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  // Apps de Draupnode con dirección (módulos con proxy_site instalados).
  const draupnodeApps = $derived(deployments.flatMap((p) => (p.installedModules ?? []).flatMap((mid) => {
    const m = ui.modules?.modules.find((x) => x.id === mid)
    if (!m?.proxySite) return []
    const v = p.installedValues?.[mid] ?? {}
    return [{ project: p, module: m, domain: String(v[m.proxySite.domain] ?? ''), port: Number(v[m.proxySite.port] ?? 0) }]
  })))

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
  const others = $derived(ui.recipes.filter((r) => !deployments.some((d) => d.recipeId === r.id)))
</script>

{#if server}
  <div class="bar">
    <button class="btn ghost sm" onclick={() => (ui.serverId = null)}><ArrowLeft size={15} /> Servidores</button>
    <div class="spacer"></div>
    {#if ov}<span class="muted small" title={autoNote}>Leído {timeAgo(new Date(ov.at * 1000).toISOString())}{autoNote ? ' · ' + autoNote : ''}</span>{/if}
    <label class="auto muted small" title="Volver a leer el servidor solo">Actualizar sola
      <select class="input" value={auto} onchange={(e) => setAuto(Number((e.currentTarget as HTMLSelectElement).value))}>
        {#each AUTO_OPTS as [v, l]}<option value={v}>{l}</option>{/each}
      </select>
    </label>
    <button class="btn sm" onclick={() => server && openTerminal(server.id)}><SquareTerminal size={14} /> Terminal</button>
    <button class="btn sm" onclick={load} disabled={loading}>{#if loading}<LoaderCircle size={14} class="spin" />{:else}<RefreshCw size={14} />{/if} Actualizar</button>
    <button class="btn sm" onclick={() => (editing = true)}><Pencil size={14} /> Editar conexión</button>
  </div>

  <div class="head">
    <h1>{server.name}</h1>
    <span class="mono muted selectable">{server.user}@{server.host}{server.port !== 22 ? ':' + server.port : ''}</span>
    {#if sys}<span class="muted">· {sys.os} · {sys.hostname}</span>{/if}
  </div>
  {#if server.notes}<p class="muted notes">{server.notes}</p>{/if}

  {#if error}
    <div class="card err"><CircleAlert size={18} /> <div><strong>No se pudo leer el servidor.</strong> {error}</div></div>
  {/if}

  <!-- Estado -->
  <section class="stats">
    <div class="card stat">
      <div class="st-h"><Cpu size={16} /> CPU</div>
      {#if sys}<div class="big">{sys.cpu} %</div><div class="muted small">{sys.cpus} núcleos · carga {sys.load.map((l) => l.toFixed(2)).join(' / ')}</div>
      {:else}<div class="muted">{loading ? 'Leyendo…' : '—'}</div>{/if}
    </div>
    <div class="card stat">
      <div class="st-h"><MemoryStick size={16} /> Memoria</div>
      {#if sys}<div class="big">{pct(memUsed, sys.memTotal)} %</div><div class="meter"><i class={level(pct(memUsed, sys.memTotal))} style:width="{pct(memUsed, sys.memTotal)}%"></i></div><div class="muted small">{fmt(memUsed)} de {fmt(sys.memTotal)}{sys.swapTotal ? ` · swap ${fmt(sys.swapTotal - sys.swapFree)} de ${fmt(sys.swapTotal)}` : ''}</div>
      {:else}<div class="muted">{loading ? 'Leyendo…' : '—'}</div>{/if}
    </div>
    <div class="card stat">
      <div class="st-h"><HardDrive size={16} /> Disco</div>
      {#if ov?.disks?.length}
        {#each ov.disks as d}
          <div class="disk"><span class="mono small">{d.mount}</span><div class="meter"><i class={level(pct(d.used, d.size))} style:width="{pct(d.used, d.size)}%"></i></div><span class="small">{fmt(d.free)} libres de {fmt(d.size)}</span></div>
        {/each}
      {:else}<div class="muted">{loading ? 'Leyendo…' : '—'}</div>{/if}
    </div>
    <div class="card stat">
      <div class="st-h"><Clock size={16} /> Encendido</div>
      {#if sys}<div class="big">{uptime(sys.uptime)}</div><div class="muted small">kernel {sys.kernel}</div>
      {:else}<div class="muted">{loading ? 'Leyendo…' : '—'}</div>{/if}
    </div>
  </section>

  {#if ov && (badContainers.length || ov.failed?.length)}
    <div class="card warnbox">
      <TriangleAlert size={18} />
      <div>
        {#each badContainers as c}<p>Contenedor <strong>{c.name}</strong>: {c.state}{c.health ? ` (${c.health})` : ''}{c.restarts ? ` · ${c.restarts} reinicios` : ''} — <button class="lnk" onclick={() => showLogs('container', c.name, c.name)}>ver registro</button></p>{/each}
        {#each ov.failed ?? [] as u}<p>Servicio <strong>{u}</strong> ha fallado — <button class="lnk" onclick={() => showLogs('unit', u, u)}>ver registro</button></p>{/each}
      </div>
    </div>
  {/if}

  <!-- Proyecto -->
  <section class="card block">
    <h2><FolderGit2 size={17} /> Plantillas aplicadas</h2>
    {#each deployments as p (p.id)}
      {@const pending = !p.appliedAt || (p.updatedAt && p.appliedAt && p.updatedAt > p.appliedAt)}
      <div class="dep">
        <button class="dep-main" onclick={() => openDeployment(p.id)}>
          <strong>{recipeName(p.recipeId) ?? p.name}</strong>
          <span class="mods">{p.modules.map((m) => moduleName(m.id)).join(' · ')}</span>
        </button>
        <div class="dep-st">
          {#if p.lastRun && !p.lastRun.ok && !p.lastRun.check}<span class="pill bad">Falló la última vez</span>
          {:else if !p.appliedAt}<span class="pill warn">Sin aplicar</span>
          {:else if pending}<span class="pill warn">Cambios sin aplicar</span>
          {:else}<span class="pill ok"><CircleCheck size={12} /> Aplicado {timeAgo(p.appliedAt)}</span>{/if}
          {#if p.overrides && ((p.overrides.added?.length ?? 0) + (p.overrides.removed?.length ?? 0) + Object.keys(p.overrides.values ?? {}).length)}<span class="pill">Con datos propios de este servidor</span>{/if}
          <button class="btn sm primary" onclick={() => openDeployment(p.id)}>Abrir</button>
        </div>
      </div>
    {:else}
      <p class="muted">Este servidor aún no tiene ninguna plantilla. Asóciale una; después la revisas y la aplicas.</p>
    {/each}
    <div class="assoc">
      {#if others.length}
        <select class="input" bind:value={deployPick}>
          <option value="">{deployments.length ? 'Añadir otra plantilla…' : 'Elige una plantilla…'}</option>
          {#each others as r}<option value={r.id}>{r.name}</option>{/each}
        </select>
        <button class="btn sm" onclick={deploy} disabled={!deployPick}><Plus size={14} /> Asociar</button>
      {/if}
      <button class="btn sm ghost" onclick={() => openRecipe('')}><Plus size={14} /> Crear una plantilla nueva</button>
    </div>
  </section>

  {#if ov}<AdoptSection serverId={id} {ov} {deployments} />{/if}

  <!-- Apps y direcciones -->
  <section class="card block">
    <h2><Globe size={17} /> Apps y direcciones</h2>
    {#if !draupnodeApps.length && !ov?.coolify?.apps.length && !ov?.sites?.length && !ov?.coolify}
      <p class="muted">{loading ? 'Leyendo…' : 'No hay apps publicadas que se puedan ver desde aquí.'}</p>
    {/if}
    <table class="tbl">
      <tbody>
        {#each draupnodeApps as a}
          <tr>
            <td><strong>{a.module.name}</strong><br /><span class="muted small">Draupnode · {recipeName(a.project.recipeId) ?? a.project.name}</span></td>
            <td>{#if a.domain}<button class="lnk" onclick={() => api.OpenURL('https://' + a.domain)}>https://{a.domain}</button>{:else}<span class="muted small">sin dominio · 127.0.0.1:{a.port}</span>{/if}</td>
            <td class="r"><button class="btn sm" onclick={() => openApp(a.project.id, a.module.id)}><ExternalLink size={13} /> Abrir</button></td>
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
        {#each ov?.sites ?? [] as s}
          <tr>
            <td><strong>{s.domain}</strong><br /><span class="muted small">{s.server} · {s.target || '—'}</span></td>
            <td><button class="lnk" onclick={() => api.OpenURL((s.https ? 'https://' : 'http://') + s.domain)}>{s.https ? 'https' : 'http'}://{s.domain}</button></td>
            <td class="r"><button class="btn sm" onclick={() => api.OpenURL((s.https ? 'https://' : 'http://') + s.domain)}><ExternalLink size={13} /> Abrir</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <!-- Bases de datos -->
  {#if ov?.databases?.length}
    <section class="card block">
      <h2><Database size={17} /> Bases de datos</h2>
      {#each ov.databases as d}
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
      {/each}
    </section>
  {/if}

  <!-- Contenedores -->
  {#if ov}
    <section class="card block">
      <h2><Box size={17} /> Contenedores {#if ov.docker}<span class="muted small">· {ov.containers?.length ?? 0}</span>{/if}</h2>
      {#if !ov.docker}<p class="muted">Este servidor no tiene Docker.</p>
      {:else}
        <table class="tbl">
          <thead><tr><th>Nombre</th><th>Estado</th><th>CPU</th><th>Memoria</th><th>Puertos</th><th></th></tr></thead>
          <tbody>
            {#each ov.containers ?? [] as c}
              <tr>
                <td><strong>{c.name}</strong><br /><span class="muted small mono">{c.image}</span>
                  {#if c.draupnode || c.coolify || c.compose}<br /><span class="muted small">{c.draupnode ? 'Draupnode · ' + c.draupnode : c.coolify ? 'Coolify · ' + c.coolify : 'compose · ' + c.compose}</span>{/if}</td>
                <td><span class="pill {c.state === 'running' && c.health !== 'unhealthy' ? 'ok' : 'bad'}">{c.state}{c.health ? ' · ' + c.health : ''}</span>{#if c.restarts}<br /><span class="muted small">{c.restarts} reinicios</span>{/if}</td>
                <td class="mono small">{c.cpu ?? ''}</td>
                <td class="mono small">{c.mem ?? ''}</td>
                <td class="mono small">{c.ports.join(', ')}</td>
                <td class="r"><button class="btn sm ghost" onclick={() => showLogs('container', c.name, c.name)}><ScrollText size={13} /> Registro</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    <!-- Puertos y registros del sistema -->
    <section class="card block">
      <h2><Network size={17} /> Puertos</h2>
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
      <div class="row">
        <button class="btn sm" onclick={() => showLogs('system', '', 'Registro del sistema')}><ScrollText size={14} /> Registro del sistema</button>
        <button class="btn sm" onclick={() => showLogs('unit', 'ssh', 'SSH')}><ScrollText size={14} /> Registro de SSH</button>
      </div>
    </section>
    {#if ov.errors?.length}<p class="muted small">No se pudo leer todo: {ov.errors.join(' · ')}</p>{/if}
  {/if}

  <RunHistory serverId={id} refreshKey={deployments.map((p) => p.lastRun?.at ?? '').join()} />

  <!-- Contraseñas -->
  {#each deployments as p (p.id)}
    <div class="secrets"><KeyRound size={15} /> <strong>{recipeName(p.recipeId) ?? p.name}</strong></div>
    <ProjectSecrets projectId={p.id} refreshKey={p.lastRun?.at ?? ''} />
  {/each}
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
  .bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .spacer { flex: 1; }
  .auto { display: inline-flex; gap: 6px; align-items: center; }
  .auto .input { height: 28px; padding: 0 6px; width: auto; font-size: 12.5px; }
  .head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
  .head h1 { margin: 0; }
  .notes { margin: 0 0 12px; }
  .small { font-size: 12px; }
  .err, .warnbox { display: flex; gap: 10px; align-items: flex-start; margin: 12px 0; }
  .err { border-color: var(--danger); }
  .err :global(svg) { color: var(--danger); flex: none; }
  .warnbox { border-color: color-mix(in srgb, var(--warning) 50%, var(--border)); }
  .warnbox :global(svg) { color: var(--warning); flex: none; }
  .warnbox p { margin: 2px 0; font-size: 13px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin: 14px 0; }
  .stat { display: flex; flex-direction: column; gap: 6px; }
  .st-h { display: flex; gap: 6px; align-items: center; color: var(--muted); font-size: 12.5px; font-weight: 600; }
  .big { font-size: 24px; font-weight: 600; }
  .meter { height: 6px; border-radius: 3px; background: var(--border-soft); overflow: hidden; }
  .meter i { display: block; height: 100%; }
  .meter i.ok { background: var(--success); }
  .meter i.warn { background: var(--warning); }
  .meter i.bad { background: var(--danger); }
  .disk { display: grid; grid-template-columns: 50px 1fr; gap: 2px 8px; align-items: center; }
  .disk span:last-child { grid-column: 1 / -1; color: var(--muted); }
  .block { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
  .block h2 { display: flex; gap: 8px; align-items: center; font-size: 15px; margin: 0; }
  .block h2 :global(svg) { color: var(--accent); }
  .dep { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 10px 12px; }
  .dep-main { background: none; border: 0; padding: 0; text-align: left; cursor: pointer; color: inherit; font: inherit; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .mods { font-size: 12.5px; color: var(--muted); }
  .dep-st { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11.5px; background: var(--sidebar-hover); color: var(--muted); }
  .pill.ok { background: var(--success-soft); color: var(--success); }
  .pill.warn { background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning); }
  .pill.bad { background: var(--danger-soft); color: var(--danger); }
  .assoc, .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .assoc .input { width: auto; min-width: 220px; height: 32px; }
  .tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
  .tbl th { text-align: left; font-size: 11.5px; color: var(--muted); font-weight: 600; padding: 4px 8px; border-bottom: 1px solid var(--border); }
  .tbl td { padding: 7px 8px; border-bottom: 1px solid var(--border-soft); vertical-align: top; }
  .tbl td.r { text-align: right; white-space: nowrap; }
  .lnk { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-align: left; }
  .lnk:hover { text-decoration: underline; }
  .block-l { display: block; }
  .db { display: flex; flex-direction: column; gap: 4px; }
  .db-h { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
  .ports { display: flex; flex-wrap: wrap; gap: 6px; }
  .pill.idle { opacity: 0.55; border-style: dashed; }
  h3 { font-size: 0.9rem; margin: 10px 0 6px; font-weight: 600; }
  .secrets { display: flex; gap: 6px; align-items: center; margin: 18px 0 -6px; font-size: 13px; color: var(--muted); }
  .log { margin: 0; max-height: 60vh; overflow: auto; padding: 10px 12px; background: var(--panel-2); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); font-family: var(--mono); font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
</style>
