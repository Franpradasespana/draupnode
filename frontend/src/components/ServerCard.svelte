<script lang="ts">
  // Tarjeta de un servidor en el Panel: si responde ahora, CPU, memoria y
  // disco de su última ficha (guardada en este equipo), contenedores, copias,
  // sus plantillas y accesos directos (ficha, terminal, Grafana, apps).
  import { RefreshCw, SquareTerminal, ArrowRight, ExternalLink, ChartLine, LoaderCircle, FilePen } from '@lucide/svelte'
  import { api, type CachedOverview, type MonitorResult, type Server, type ServerOverviewResult } from '../lib/api'
  import { ui, toast, timeAgo, openServer, openTerminal, openDeployment } from '../lib/state.svelte'
  import { alerts, rememberOverview, serverFindings } from '../lib/alerts.svelte'
  import { withConnection } from '../lib/connect'

  let { server, ficha, note = '' }: { server: Server; ficha?: CachedOverview; note?: string } = $props()

  const ping = $derived(alerts.ping[server.id])
  // El servidor de pruebas puede estar parado a propósito: no es un fallo.
  const isDown = $derived(!!ping && !ping.reachable && !ping.lab)
  const ov = $derived(ficha?.overview)
  const sys = $derived(ov?.system)
  const root = $derived(ov?.disks?.find((d) => d.mount === '/') ?? ov?.disks?.[0])
  const pct = (used: number, total: number) => (total ? Math.round((used / total) * 100) : 0)
  const level = (p: number) => (p >= 90 ? 'bad' : p >= 75 ? 'warn' : 'ok')
  const memPct = $derived(sys ? pct(sys.memTotal - sys.memAvailable, sys.memTotal) : 0)
  const diskPct = $derived(root ? pct(root.used, root.size) : 0)
  const cpuPct = $derived(Math.round(sys?.cpu ?? 0))

  const ctrs = $derived(ov?.containers ?? [])
  const running = $derived(ctrs.filter((c) => c.state === 'running').length)
  const sick = $derived(ctrs.filter((c) => ['restarting', 'dead'].includes(c.state) || c.health === 'unhealthy').length)
  const stopped = $derived(ctrs.length - running - ctrs.filter((c) => c.state === 'restarting').length)
  const backups = $derived(ov?.backups ?? [])
  const findings = $derived(ov ? serverFindings(ov) : [])

  const deployments = $derived(ui.projects.filter((p) => p.serverId === server.id))
  const pending = (projectId: string) => ui.recipes.flatMap((r) => r.deployments).find((d) => d.projectId === projectId)
  const monitoring = $derived(deployments.find((p) => p.installedModules?.includes('monitoring')))

  // Apps con dirección: las de Draupnode (por túnel SSH) y las de Coolify (su URL).
  const apps = $derived([
    ...deployments.flatMap((p) => (p.installedModules ?? []).flatMap((mid) => {
      const m = ui.modules?.modules.find((x) => x.id === mid)
      return m?.proxySite ? [{ key: p.id + mid, name: m.name, open: () => openApp(p.id, mid) }] : []
    })),
    ...(ov?.coolify?.apps ?? []).filter((a) => a.urls?.length).map((a) => ({ key: 'c' + a.name, name: a.name, open: () => api.OpenURL(a.urls[0]) })),
  ])

  let busy = $state('')
  async function refresh() {
    busy = 'ficha'
    try {
      const r = await withConnection<ServerOverviewResult>(server, (s, a, u) => api.ServerOverview(server.id, s, a, u))
      if (r?.status === 'ok' && r.overview) rememberOverview(server.id, r.overview)
      else if (r) toast(r.message || 'No se pudo leer el servidor', 'error')
    } finally {
      busy = ''
    }
  }
  async function openApp(projectId: string, moduleId: string) {
    const r = await withConnection<MonitorResult>(server, (s, a) => api.OpenAppTunnel(projectId, moduleId, s, a))
    if (r?.status === 'ok' && r.url) api.OpenURL(r.url)
    else if (r) toast(r.message || 'No se pudo abrir', 'error')
  }
  async function grafana() {
    if (!monitoring) return
    busy = 'grafana'
    try {
      const r = await withConnection<MonitorResult>(server, (s, a) => api.OpenGrafana(monitoring.id, s, a))
      if (r?.status === 'ok' && r.url) api.OpenURL(r.url)
      else if (r) toast(r.message || 'No se pudo abrir Grafana', 'error')
    } finally {
      busy = ''
    }
  }
  const hours = (s: number) => (s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : s < 172800 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} días`)
</script>

<article class="card srv" class:bad={isDown} class:warn={findings.length > 0}>
  <header>
    <button class="title" onclick={() => openServer(server.id)} title="Abrir la ficha">
      <span class="dot" class:ok={ping?.reachable} class:err={isDown}></span>
      <strong>{server.name}</strong>
      <span class="muted mono small">{server.host}</span>
    </button>
    <span class="small" class:muted={!isDown} class:bad-t={isDown}>
      {#if !ping}comprobando…{:else if ping.reachable}responde · {ping.latencyMs} ms{:else if ping.lab}parado (servidor de pruebas){:else}no responde{/if}
    </span>
  </header>

  {#if ov && sys}
    <div class="meters">
      <div><span class="lbl">CPU</span><div class="meter"><i class={level(cpuPct)} style:width="{cpuPct}%"></i></div><span class="val">{cpuPct} %</span></div>
      <div><span class="lbl">RAM</span><div class="meter"><i class={level(memPct)} style:width="{memPct}%"></i></div><span class="val">{memPct} %</span></div>
      {#if root}<div><span class="lbl">Disco</span><div class="meter"><i class={level(diskPct)} style:width="{diskPct}%"></i></div><span class="val">{diskPct} %</span></div>{/if}
    </div>
    <ul class="facts small">
      {#if ctrs.length}
        <li>Contenedores: <strong>{running}</strong> en marcha{#if sick}, <span class="bad-t">{sick} con problemas</span>{/if}{#if stopped > 0}, <span class="muted">{stopped} parados</span>{/if}</li>
      {/if}
      {#each backups as b (b.slug)}
        <li>Copia «{b.slug}»: {#if b.running}haciéndose ahora{:else if !b.ok}<span class="bad-t">falló</span>{:else if b.ago === null}<span class="warn-t">sin hacer</span>{:else}<span class:warn-t={b.ago > 26 * 3600}>hace {hours(b.ago)}</span>{/if}</li>
      {/each}
      {#each findings.filter((f) => !f.id.startsWith('bk') && !f.id.startsWith('ctr')) as f (f.id)}
        <li class:bad-t={f.bad} class:warn-t={!f.bad}>{f.text}</li>
      {/each}
    </ul>
  {:else}
    <p class="muted small">{busy === 'ficha' ? 'Leyendo el servidor…' : 'Aún no se ha leído su estado.'}</p>
  {/if}

  {#if deployments.length}
    <div class="deps">
      {#each deployments as p (p.id)}
        {@const d = pending(p.id)}
        <button class="chip" onclick={() => openDeployment(p.id)} title="Abrir la plantilla en este servidor">
          {#if d && (!d.applied || d.pending)}<FilePen size={12} class="pend" />{/if}{p.name}
          {#if d && !d.applied}<span class="muted"> · sin aplicar</span>{:else if d?.pending}<span class="muted"> · cambios sin aplicar</span>{/if}
        </button>
      {/each}
    </div>
  {/if}

  <footer>
    <span class="muted small read">
      {#if ficha}Leído {timeAgo(ficha.at)}{/if}{#if note}{ficha ? ' · ' : ''}{note}{/if}
      <button class="btn sm ghost icon" title="Leer ahora" onclick={refresh} disabled={!!busy}>
        {#if busy === 'ficha'}<LoaderCircle size={13} class="spin" />{:else}<RefreshCw size={13} />{/if}
      </button>
    </span>
    <div class="btns">
      {#each apps.slice(0, 3) as a (a.key)}<button class="btn sm ghost" onclick={a.open} title="Abrir {a.name}"><ExternalLink size={13} /> {a.name}</button>{/each}
      {#if monitoring}<button class="btn sm ghost" onclick={grafana} disabled={!!busy}><ChartLine size={13} /> Grafana</button>{/if}
      <button class="btn sm ghost" onclick={() => openTerminal(server.id)}><SquareTerminal size={13} /> Terminal</button>
      <button class="btn sm" onclick={() => openServer(server.id)}>Ficha <ArrowRight size={13} /></button>
    </div>
  </footer>
</article>

<style>
  .srv { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; }
  .srv.warn { border-color: color-mix(in srgb, var(--warning) 45%, var(--border)); }
  .srv.bad { border-color: color-mix(in srgb, var(--danger) 55%, var(--border)); }
  header { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
  .title { display: flex; align-items: center; gap: 8px; background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; text-align: left; min-width: 0; }
  .title strong { font-size: 15px; }
  .title:hover strong { text-decoration: underline; }
  .small { font-size: 12.5px; }
  .meters { display: flex; flex-direction: column; gap: 6px; }
  .meters > div { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; gap: 8px; }
  .lbl { font-size: 12px; color: var(--muted); }
  .val { font-size: 12.5px; text-align: right; font-variant-numeric: tabular-nums; }
  .meter { height: 6px; border-radius: 3px; background: var(--border-soft); overflow: hidden; }
  .meter i { display: block; height: 100%; }
  .meter i.ok { background: var(--success); }
  .meter i.warn { background: var(--warning); }
  .meter i.bad { background: var(--danger); }
  .facts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
  .bad-t { color: var(--danger); }
  .warn-t { color: var(--warning); }
  .deps { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; font: inherit; font-size: 12px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); cursor: pointer; }
  .chip:hover { border-color: var(--muted); }
  .chip :global(.pend) { color: var(--info); }
  footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; border-top: 1px solid var(--border-soft); padding-top: 10px; margin-top: auto; }
  .read { display: inline-flex; align-items: center; gap: 2px; }
  .btns { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
</style>
