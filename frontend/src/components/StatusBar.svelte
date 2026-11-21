<script lang="ts">
  import { ExternalLink, RefreshCw, LoaderCircle, Server as ServerIcon, Activity, ChevronDown } from '@lucide/svelte'
  import { api, errorText, type ServerLive } from '../lib/api'
  import { ui, timeAgo, contextServerId, setActiveServer, openServerProjects, openDeployment } from '../lib/state.svelte'

  const id = $derived(contextServerId())
  const srv = $derived(ui.servers.find((s) => s.id === id))
  const lc = $derived(srv?.lastCheck)
  const nProj = $derived(ui.projects.filter((p) => p.serverId === id).length)

  let live = $state<ServerLive | null>(null)
  let liveFor = $state<string | null>(null)
  let checking = $state(false)

  async function refresh() {
    const sid = id
    if (!sid) return
    checking = true
    try {
      const r = await api.ServerLive(sid)
      if (sid === id) { live = r; liveFor = sid }
    } catch (e) {
      if (sid === id) { live = { reachable: false, latencyMs: 0, error: errorText(e) }; liveFor = sid }
    } finally {
      checking = false
    }
  }

  // Al cambiar de servidor, y cada 30 s, se vuelve a mirar.
  $effect(() => {
    if (!id) return
    if (liveFor !== id) live = null
    refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  })

  // Ejecuciones en marcha (de cualquier proyecto).
  const running = $derived(Object.values(ui.runs).filter((r) => !r.done))
  const projName = (pid: string) => ui.projects.find((p) => p.id === pid)?.name ?? 'plantilla'

  function pick(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value
    setActiveServer(v)
    if (ui.view === 'servers' && ui.serverId && !ui.projectId) ui.serverId = v
  }
</script>

<footer class="status">
  {#if !srv}
    <span class="muted"><ServerIcon size={13} /> Sin servidores</span>
  {:else}
    <span class="dot" class:ok={live?.reachable} class:err={live && !live.reachable} class:wait={!live}></span>
    <label class="pick" title="Servidor que se muestra en esta barra">
      <span>{srv.name}</span><ChevronDown size={12} />
      <select value={srv.id} onchange={pick} aria-label="Servidor de la barra de estado">
        {#each ui.servers as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
      </select>
    </label>
    <span class="mono muted selectable hide-sm">{srv.user}@{srv.host}{srv.port !== 22 ? ':' + srv.port : ''}</span>

    <span class="sep"></span>
    {#if !live}
      <span class="muted">Comprobando…</span>
    {:else if live.reachable}
      <span class="ok-t" title="El puerto SSH responde">En línea · {live.latencyMs} ms</span>
    {:else}
      <span class="bad-t" title={live.error}>No responde</span>
    {/if}

    <span class="sep hide-md"></span>
    {#if lc?.ok}
      <span class="muted hide-md">Conexión SSH comprobada {timeAgo(lc.at)}{lc.facts?.os ? ' · ' + lc.facts.os : ''}</span>
    {:else if lc}
      <span class="bad-t hide-md" title={lc.error}>La última prueba de conexión falló</span>
    {:else}
      <button class="lnk hide-md" onclick={() => (ui.view = 'servers')}>Sin probar la conexión</button>
    {/if}

    {#if running.length}
      <span class="sep"></span>
      {#each running as r (r.runId)}
        <button class="lnk run" onclick={() => openDeployment(r.projectId)}>
          <LoaderCircle size={12} class="spin" /> {r.check ? 'Previsualizando' : 'Aplicando'} «{projName(r.projectId)}»: {r.stage}
        </button>
      {/each}
    {/if}

    <span class="grow"></span>
    <button class="lnk hide-sm" onclick={() => openServerProjects(srv.id)} title="Ficha de este servidor">
      <Activity size={12} /> {nProj} {nProj === 1 ? 'plantilla' : 'plantillas'}
    </button>
    <button class="icon-b" onclick={refresh} disabled={checking} title="Volver a comprobar" aria-label="Volver a comprobar">
      <RefreshCw size={12} class={checking ? 'spin' : ''} />
    </button>
    {#if live?.webUrl}
      <button class="web" onclick={() => api.OpenURL(live!.webUrl!)} title={live.webUrl}>
        <ExternalLink size={12} /> Abrir {live.webLabel === 'Coolify' ? 'Coolify' : 'la web'}
      </button>
    {:else if live}
      <span class="muted" title="Ni Coolify (puerto 8000) ni una web (80/443) responden en este servidor">Sin web</span>
    {/if}
  {/if}
</footer>

<style>
  .status {
    grid-column: 1 / -1;
    display: flex; align-items: center; gap: 10px;
    padding: 0 12px 0 14px; min-width: 0;
    background: var(--sidebar); color: var(--sidebar-muted);
    border-top: 1px solid var(--border);
    font-size: 12px; white-space: nowrap; overflow: hidden;
  }
  .status :global(svg) { vertical-align: -2px; }
  .muted { color: var(--sidebar-muted); }
  .mono { font-family: var(--mono); font-size: 11.5px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--sidebar-muted); flex: none; }
  .dot.ok { background: var(--success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 25%, transparent); }
  .dot.err { background: var(--danger); }
  .dot.wait { opacity: .5; }
  .pick {
    position: relative; display: inline-flex; align-items: center; gap: 4px;
    color: var(--sidebar-text); font-weight: 500; padding: 3px 6px; border-radius: 5px; cursor: pointer;
    max-width: 260px;
  }
  .pick span { overflow: hidden; text-overflow: ellipsis; }
  .pick:hover { background: var(--sidebar-hover); }
  .pick select { position: absolute; inset: 0; opacity: 0; cursor: pointer; font: inherit; }
  .pick option { background: var(--panel); color: var(--text); }
  .sep { width: 1px; height: 14px; background: var(--border); flex: none; }
  .grow { flex: 1; }
  @media (max-width: 1100px) { .hide-md { display: none; } }
  @media (max-width: 700px) { .hide-sm { display: none; } .run { max-width: 180px; } }
  .ok-t { color: var(--success); }
  .bad-t { color: var(--danger); }
  .lnk, .icon-b, .web {
    background: none; border: 0; font: inherit; color: var(--sidebar-muted); cursor: pointer;
    display: inline-flex; align-items: center; gap: 5px; padding: 3px 6px; border-radius: 5px;
  }
  .lnk:hover, .icon-b:hover:not(:disabled) { color: var(--sidebar-text); background: var(--sidebar-hover); }
  .run { color: var(--accent); overflow: hidden; text-overflow: ellipsis; max-width: 420px; }
  .web { color: var(--accent); font-weight: 500; }
  .web:hover { background: var(--sidebar-hover); }
  .icon-b:disabled { cursor: default; opacity: .6; }
</style>
