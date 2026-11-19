<script lang="ts">
  import { untrack } from 'svelte'
  import { Plus, FolderGit2, Server as ServerIcon, CircleCheck, CircleX, LoaderCircle, X } from '@lucide/svelte'
  import ProjectEditor from './ProjectEditor.svelte'
  import { ui, timeAgo, moduleName } from '../lib/state.svelte'

  // El editor se vuelve a montar al abrir otro proyecto, pero no cuando un
  // proyecto nuevo se guarda y recibe su id (para no cortar lo que esté haciendo).
  let editorKey = $state(0)
  let prevId: string | null = ui.projectId
  $effect.pre(() => {
    const id = ui.projectId
    untrack(() => {
      if (!(prevId === '' && id)) editorKey++
      prevId = id
    })
  })

  const filtered = $derived(ui.projectServer ? ui.projects.filter((p) => p.serverId === ui.projectServer) : ui.projects)
  const serverName = (id: string) => ui.servers.find((s) => s.id === id)?.name ?? '(servidor borrado)'
</script>

{#if ui.projectId !== null}
  {#key editorKey}
    <ProjectEditor id={ui.projectId} />
  {/key}
{:else}
  <div class="head">
    <div>
      <h1>Proyectos</h1>
      <p class="muted">Un proyecto es un servidor y los módulos que se le instalan.</p>
    </div>
    <button class="btn primary" onclick={() => (ui.projectId = '')} disabled={!ui.servers.length}><Plus size={16} /> Nuevo proyecto</button>
  </div>

  {#if ui.projectServer && ui.servers.length}
    <div class="filter">
      <span class="muted">Servidor:</span>
      <select class="input" bind:value={ui.projectServer}>
        {#each ui.servers as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
      </select>
      <button class="btn sm ghost" onclick={() => (ui.projectServer = null)}><X size={14} /> Ver todos</button>
    </div>
  {/if}

  {#if !ui.servers.length}
    <div class="empty card">
      <ServerIcon size={34} strokeWidth={1.4} />
      <h2>Primero, un servidor</h2>
      <p class="muted">Para crear un proyecto necesitas al menos un servidor dado de alta.</p>
      <button class="btn primary" onclick={() => (ui.view = 'servers')}>Ir a Servidores</button>
    </div>
  {:else if !filtered.length}
    <div class="empty card">
      <FolderGit2 size={34} strokeWidth={1.4} />
      <h2>{ui.projectServer ? `«${serverName(ui.projectServer)}» no tiene proyectos` : 'Aún no hay proyectos'}</h2>
      <p class="muted">Elige un servidor, marca qué quieres instalar (Docker, Coolify, PostgreSQL…) y rellena los datos.</p>
      <button class="btn primary" onclick={() => (ui.projectId = '')}><Plus size={16} /> Nuevo proyecto</button>
    </div>
  {:else}
    <div class="list">
      {#each filtered as p (p.id)}
        {@const run = ui.runs[p.id]}
        {@const lr = p.lastRun}
        <button class="card proj" onclick={() => (ui.projectId = p.id)}>
          <div class="top">
            <strong>{p.name}</strong>
            {#if run && !run.done}
              <span class="badge accent"><LoaderCircle size={12} class="spin" /> {run.check ? 'Previsualizando' : 'Aplicando'}…</span>
            {:else if lr}
              <span class="badge" class:ok={lr.ok} class:err={!lr.ok}>
                {#if lr.ok}<CircleCheck size={12} />{:else}<CircleX size={12} />{/if}
                {lr.check ? 'Previsualizado' : 'Aplicado'} {timeAgo(lr.at)}{#if !lr.ok} · {lr.canceled ? 'cancelado' : 'con errores'}{/if}
              </span>
            {:else}
              <span class="badge">Sin ejecutar</span>
            {/if}
          </div>
          <span class="muted srv"><ServerIcon size={13} /> {serverName(p.serverId)}</span>
          <div class="mods">
            {#each p.modules as m}<span class="badge">{moduleName(m.id)}</span>{/each}
          </div>
        </button>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
  .head p { margin-top: 4px; }
  .empty { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 48px 24px; color: var(--muted); }
  .empty h2 { color: var(--text); margin-top: 6px; }
  .empty .btn { margin-top: 8px; }
  .filter { display: flex; align-items: center; gap: 10px; margin: -8px 0 18px; font-size: 13.5px; }
  .filter select { width: auto; min-width: 200px; }
  .list { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 14px; }
  .proj { text-align: left; font: inherit; color: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 10px; transition: border-color .15s; }
  .proj:hover { border-color: var(--accent); }
  .top { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .top strong { font-size: 15px; }
  .srv { display: flex; align-items: center; gap: 6px; font-size: 12.5px; }
  .mods { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
