<script lang="ts">
  // Panel: ¿va todo bien y qué hay que mirar? Contadores de verdad (y
  // clicables), lo que necesita atención, una tarjeta por servidor con su
  // última ficha (se refresca sola si la contraseña está guardada) y la
  // actividad reciente de todos los servidores.
  import { onMount } from 'svelte'
  import { Plus, CircleCheck, Circle, Server as ServerIcon, LayoutTemplate, Box, BellRing } from '@lucide/svelte'
  import AlertsList from '../components/AlertsList.svelte'
  import ServerCard from '../components/ServerCard.svelte'
  import RunHistory from '../components/RunHistory.svelte'
  import { api } from '../lib/api'
  import { ui, openServer } from '../lib/state.svelte'
  import { alerts, alertItems, rememberOverview, pendingModules } from '../lib/alerts.svelte'

  const servers = $derived(ui.servers)
  const total = $derived(servers.length)
  const pinged = $derived(servers.filter((s) => alerts.ping[s.id]))
  const up = $derived(pinged.filter((s) => alerts.ping[s.id].reachable).length)
  // El servidor de pruebas parado no cuenta como caído.
  const down = $derived(pinged.filter((s) => !alerts.ping[s.id].reachable && !alerts.ping[s.id].lab).length)
  const labOff = $derived(pinged.length - up - down)

  const usedRecipes = $derived(ui.recipes.filter((r) => r.servers.length).length)
  const usedServers = $derived(new Set(ui.recipes.flatMap((r) => r.servers.map((x) => x.serverId))).size)
  const pendingDeps = $derived(ui.projects.filter((p) => pendingModules(p) > 0).length)

  const ctrs = $derived(servers.flatMap((s) => alerts.fichas[s.id]?.overview.containers ?? []))
  const running = $derived(ctrs.filter((c) => c.state === 'running').length)
  const sickCtrs = $derived(ctrs.filter((c) => ['restarting', 'dead'].includes(c.state) || c.health === 'unhealthy').length)
  const readServers = $derived(servers.filter((s) => alerts.fichas[s.id]).length)

  const items = $derived(alertItems())
  const badItems = $derived(items.filter((a) => a.kind === 'failed' || a.kind === 'down' || (a.kind === 'server' && a.bad)).length)

  function goServers() {
    if (total === 1) return openServer(servers[0].id)
    ui.serverId = null
    ui.projectId = null
    ui.view = 'servers'
  }
  function goTemplates() {
    ui.recipeId = null
    ui.view = 'projects'
  }
  function goContainers() {
    const withSick = servers.find((s) => (alerts.fichas[s.id]?.overview.containers ?? []).some((c) => ['restarting', 'dead'].includes(c.state) || c.health === 'unhealthy'))
    if (withSick) return openServer(withSick.id)
    goServers()
  }

  // Refresco en segundo plano: lee (sin preguntar nada) los servidores que
  // responden y cuya ficha tiene más de STALE minutos. Si hace falta una
  // contraseña que no está guardada, lo dice en su tarjeta.
  const STALE = 5
  let notes = $state<Record<string, string>>({})
  let refreshing = false
  async function refreshStale() {
    if (refreshing || document.hidden || ui.view !== 'dashboard') return
    refreshing = true
    try {
      for (const s of ui.servers) {
        const f = alerts.fichas[s.id]
        const p = alerts.ping[s.id]
        if (p && !p.reachable) continue
        if (f && Date.now() - new Date(f.at).getTime() < STALE * 60000) continue
        if (ui.view !== 'dashboard') break
        try {
          const r = await api.ServerOverview(s.id, '', '', '')
          if (r.status === 'ok' && r.overview) { rememberOverview(s.id, r.overview); delete notes[s.id] }
          else if (['needs_secret', 'vault_locked', 'needs_sudo', 'vault_missing'].includes(r.status)) notes[s.id] = 'para leerlo solo, guarda su contraseña'
          else if (r.status === 'unknown_host') notes[s.id] = 'confirma su huella con ↻'
          else notes[s.id] = r.message || 'no se pudo leer'
        } catch { /* siguiente vuelta */ }
      }
    } finally {
      refreshing = false
    }
  }
  onMount(() => {
    const first = setTimeout(refreshStale, 1500)
    const t = setInterval(refreshStale, STALE * 60000)
    return () => { clearTimeout(first); clearInterval(t) }
  })

  const steps = $derived([
    { done: total > 0, text: 'Añade un servidor con su clave SSH', go: 'servers' as const },
    { done: ui.recipes.length > 0, text: 'Crea una plantilla (módulos y opciones)', go: 'projects' as const },
    { done: ui.projects.some((p) => p.modules.length > 0), text: 'Aplícala a un servidor (o añade módulos en su ficha → Módulos)', go: 'servers' as const },
    { done: ui.projects.some((p) => p.lastRun?.ok && !p.lastRun.check), text: 'Previsualiza y aplica, o exporta un único instalar.sh', go: 'servers' as const },
  ])
  const pad = (n: number) => String(n).padStart(2, '0')
</script>

<div class="head">
  <div>
    <h1>Infraestructura</h1>
    <p class="muted">Cómo están tus servidores y qué conviene mirar.</p>
  </div>
  <button class="btn primary" onclick={() => { ui.serverId = null; ui.view = 'servers' }}><Plus size={16} /> Añadir servidor</button>
</div>

{#if total === 0}
  <section class="card start">
    <h2>Primeros pasos</h2>
    <ol>
      {#each steps as st}
        <li class:done={st.done}>
          {#if st.done}<CircleCheck size={18} />{:else}<Circle size={18} />{/if}
          <span>{st.text}</span>
          {#if !st.done}<button class="btn sm ghost go" onclick={() => (ui.view = st.go)}>Ir</button>{/if}
        </li>
      {/each}
    </ol>
  </section>
{:else}
  <div class="tiles">
    <button class="card tile" onclick={goServers} title={total === 1 ? 'Abrir la ficha del servidor' : 'Ver los servidores'}>
      <span class="ti"><ServerIcon size={15} /> Servidores</span>
      <strong>{pad(total)}</strong>
      <span class="sub">
        {#if !pinged.length}comprobando…{:else if down}<span class="bad-t">{down} no {down === 1 ? 'responde' : 'responden'}</span>{#if up}{' · '}{up} bien{/if}{:else}{up === total ? 'todos responden' : `${up} ${up === 1 ? 'responde' : 'responden'}`}{#if labOff}{' · '}el de pruebas, parado{/if}{/if}
      </span>
    </button>
    <button class="card tile" onclick={goTemplates} title="Ver las plantillas">
      <span class="ti"><LayoutTemplate size={15} /> Plantillas</span>
      <strong>{pad(ui.recipes.length)}</strong>
      <span class="sub">
        {#if !ui.recipes.length}ninguna aún{:else}{usedRecipes} aplicada{usedRecipes === 1 ? '' : 's'} en {usedServers} {usedServers === 1 ? 'servidor' : 'servidores'}{/if}{#if pendingDeps}{' · '}<span class="info-t">{pendingDeps} {pendingDeps === 1 ? 'servidor' : 'servidores'} con módulos sin aplicar</span>{/if}
      </span>
    </button>
    <button class="card tile" onclick={goContainers} title="Ver los servidores">
      <span class="ti"><Box size={15} /> Contenedores</span>
      <strong>{readServers ? pad(running) : '—'}</strong>
      <span class="sub">
        {#if !readServers}sin leer aún{:else}en marcha de {ctrs.length}{#if sickCtrs}{' · '}<span class="bad-t">{sickCtrs} con problemas</span>{/if}{#if readServers < total}{' · '}{readServers}/{total} servidores leídos{/if}{/if}
      </span>
    </button>
    <button class="card tile" onclick={() => (ui.view = 'alerts')} title="Ver los avisos">
      <span class="ti"><BellRing size={15} /> Avisos</span>
      <strong class:bad-t={badItems > 0} class:ok-t={items.length === 0}>{pad(items.length)}</strong>
      <span class="sub">{#if !items.length}todo en orden{:else if badItems}<span class="bad-t">{badItems} {badItems === 1 ? 'importante' : 'importantes'}</span>{:else}nada grave{/if}</span>
    </button>
  </div>

  <section class="attention">
    <h2>Necesita atención</h2>
    {#if items.length}
      <AlertsList compact max={4} />
    {:else}
      <p class="card ok-box"><CircleCheck size={17} /> Todo en orden: los servidores responden y no hay nada pendiente.</p>
    {/if}
  </section>

  <section>
    <h2>Servidores</h2>
    <div class="grid">
      {#each servers as s (s.id)}
        <ServerCard server={s} ficha={alerts.fichas[s.id]} note={notes[s.id] ?? ''} />
      {/each}
    </div>
  </section>

  <div class="recent">
    <RunHistory serverId="" limit={6} title="Actividad reciente" refreshKey={ui.projects.map((p) => p.lastRun?.at ?? '').join()} />
  </div>
{/if}

<style>
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
  .head p { margin-top: 4px; }
  h2 { font-size: 16px; margin: 0 0 10px; }
  section { margin-bottom: 22px; }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 22px; }
  .tile {
    display: flex; flex-direction: column; gap: 2px; padding: 14px 18px; text-align: left;
    font: inherit; color: inherit; cursor: pointer; transition: border-color .15s, transform .05s;
  }
  .tile:hover { border-color: var(--muted); }
  .tile:active { transform: translateY(1px); }
  .ti { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12.5px; }
  .tile strong { font-size: 30px; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; }
  .sub { color: var(--muted); font-size: 12.5px; }
  .bad-t { color: var(--danger); }
  .ok-t { color: var(--success); }
  .info-t { color: var(--info); }
  .attention :global(.alerts.compact) { margin-bottom: 0; }
  .ok-box { display: flex; align-items: center; gap: 10px; margin: 0; padding: 12px 14px; font-size: 13.5px; }
  .ok-box :global(svg) { color: var(--success); flex: none; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; align-items: stretch; }
  .start { max-width: 620px; }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  ol li { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 13.5px; color: var(--muted); }
  ol li :global(svg) { flex: none; }
  ol li.done { color: var(--text); }
  ol li.done :global(svg) { color: var(--success); }
  ol li .go { margin-left: auto; }
  @media (max-width: 1100px) {
    .tiles { grid-template-columns: repeat(2, 1fr); }
  }
</style>
