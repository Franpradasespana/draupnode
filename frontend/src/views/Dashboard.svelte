<script lang="ts">
  import { Plus, ArrowRight, CircleCheck, Circle, ChevronRight } from '@lucide/svelte'
  import { ui, timeAgo, kbToGB, openServerProjects } from '../lib/state.svelte'

  const total = $derived(ui.servers.length)
  const ok = $derived(ui.servers.filter((s) => s.lastCheck?.ok).length)
  const failing = $derived(ui.servers.filter((s) => s.lastCheck && !s.lastCheck.ok).length)
  const last = $derived(
    ui.servers.map((s) => s.lastCheck?.at).filter(Boolean).sort().at(-1) as string | undefined,
  )

  const progress = $derived(total === 0 ? 0 : Math.round((ok / total) * 100))

  const steps = $derived([
    { done: total > 0, text: 'Añade un servidor con su clave SSH', go: 'servers' as const },
    { done: ok > 0, text: 'Prueba la conexión y confía en su huella', go: 'servers' as const },
    { done: ui.recipes.length > 0, text: 'Crea un proyecto (la receta: módulos y opciones)', go: 'projects' as const },
    { done: ui.projects.length > 0, text: 'Asócialo a un servidor desde su ficha', go: 'servers' as const },
    { done: ui.projects.some((p) => p.lastRun?.ok && !p.lastRun.check), text: 'Previsualiza y aplica con Ansible, o exporta un único instalar.sh', go: 'projects' as const },
  ])
</script>

<div class="head">
  <div>
    <h1>Infraestructura</h1>
    <p class="muted">Estado de tus servidores y siguientes pasos.</p>
  </div>
  <button class="btn primary" onclick={() => (ui.view = 'servers')}><Plus size={16} /> Añadir servidor</button>
</div>

<div class="tiles">
  <div class="card tile"><strong>{String(total).padStart(2, '0')}</strong><span>Servidores</span></div>
  <div class="card tile"><strong class="a2">{String(ok).padStart(2, '0')}</strong><span>Conectan bien</span></div>
  <div class="card tile"><strong>{String(ui.projects.length).padStart(2, '0')}</strong><span>Proyectos{#if failing > 0} · <span class="bad-t">{failing} servidor(es) con fallos</span>{/if}</span></div>
  <div class="card tile"><strong class="sm">{timeAgo(last)}</strong><span>Última comprobación</span></div>
</div>

<div class="cols">
  <section class="card">
    <div class="sec-head">
      <h2>Servidores</h2>
      <span class="muted">{progress}%</span>
    </div>
    <div class="bar"><div style="width: {progress}%"></div></div>
    {#if total === 0}
      <p class="muted pad">Todavía no has añadido ninguno.</p>
    {:else}
      <ul>
        {#each ui.servers as s (s.id)}
          {@const n = ui.projects.filter((p) => p.serverId === s.id).length}
          <li><button class="srow" onclick={() => openServerProjects(s.id)} title="Ver la ficha del servidor">
            <span class="dot" class:ok={s.lastCheck?.ok} class:err={s.lastCheck && !s.lastCheck.ok}></span>
            <span class="name">{s.name}</span>
            <span class="muted mono host">{s.host}</span>
            {#if s.lastCheck?.ok}
              <span class="st ok">{kbToGB(s.lastCheck.facts?.mem_kb)} · {s.lastCheck.facts?.os_id ?? ''}</span>
            {:else if s.lastCheck}
              <span class="st bad">Falló</span>
            {:else}
              <span class="st muted">Sin probar</span>
            {/if}
            <span class="badge nproj">{n} {n === 1 ? 'proyecto' : 'proyectos'}</span>
            <ChevronRight size={15} class="chev" />
          </button></li>
        {/each}
      </ul>
    {/if}
    <button class="btn sm link" onclick={() => (ui.view = 'servers')}>Ver servidores <ArrowRight size={14} /></button>
  </section>

  <section class="card">
    <div class="sec-head"><h2>Primeros pasos</h2></div>
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
</div>

<style>
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
  .head p { margin-top: 4px; }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 16px; }
  .tile { display: flex; flex-direction: column; gap: 2px; padding: 16px 18px; }
  .tile strong { font-size: 30px; font-weight: 600; line-height: 1.15; font-variant-numeric: tabular-nums; }
  .tile strong.a2 { color: var(--accent-2); }
  .bad-t { color: var(--danger); }
  .tile strong.sm { font-size: 18px; line-height: 1.95; }
  .tile span { color: var(--muted); font-size: 13px; }
  .cols { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; align-items: start; }
  .sec-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
  .bar { height: 6px; border-radius: 6px; background: var(--border-soft); overflow: hidden; margin-bottom: 8px; }
  .bar div { height: 100%; background: var(--accent); border-radius: 6px; transition: width .4s; }
  ul { list-style: none; margin: 0; padding: 0; }
  ul li { border-bottom: 1px solid var(--border-soft); }
  .srow {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 10px 6px; margin: 0; background: none; border: 0; border-radius: 6px;
    font: inherit; font-size: 13.5px; color: inherit; text-align: left; cursor: pointer;
    transition: background .12s;
  }
  .srow:hover { background: var(--border-soft); }
  .srow :global(.chev) { color: var(--muted); flex: none; }
  .nproj { font-size: 11.5px; }
  .name { font-weight: 500; }
  .host { font-size: 12px; }
  .st { margin-left: auto; font-size: 12.5px; }
  .st.ok { color: var(--success); }
  .st.bad { color: var(--danger); }
  .pad { padding: 12px 0; }
  .link { margin-top: 12px; }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  ol li { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 13.5px; color: var(--muted); }
  ol li :global(svg) { flex: none; }
  ol li.done { color: var(--text); }
  ol li.done :global(svg) { color: var(--success); }
  ol li .go { margin-left: auto; }
  @media (max-width: 1100px) {
    .tiles { grid-template-columns: repeat(2, 1fr); }
    .cols { grid-template-columns: 1fr; }
  }
</style>
