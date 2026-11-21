<script lang="ts">
  // Proyectos = recetas: qué módulos y con qué opciones, sin servidor. Se
  // asocian a uno o varios servidores (desde aquí o desde la ficha del servidor).
  import { Plus, FolderGit2, Server as ServerIcon, CircleCheck } from '@lucide/svelte'
  import RecipeEditor from './RecipeEditor.svelte'
  import { ui, moduleName, openRecipe, openDeployment } from '../lib/state.svelte'
</script>

{#if ui.recipeId !== null}
  {#key ui.recipeId}<RecipeEditor id={ui.recipeId} />{/key}
{:else}
  <div class="head">
    <div>
      <h1>Plantillas</h1>
      <p class="muted">Una plantilla es lo que quieres instalar y cómo: módulos y opciones. Se prepara sin servidor y no instala nada por sí sola. Cuando la asocias a un servidor (desde aquí o desde su ficha) y pulsas Aplicar, se instala allí. La misma plantilla sirve para varios servidores.</p>
    </div>
    <button class="btn primary" onclick={() => openRecipe('')}><Plus size={16} /> Nueva plantilla</button>
  </div>

  {#if !ui.recipes.length}
    <div class="empty card">
      <FolderGit2 size={34} strokeWidth={1.4} />
      <h2>Aún no hay plantillas</h2>
      <p class="muted">Crea una: elige los módulos (Docker, Caddy, copias, apps…) y sus opciones. No hace falta tener servidor todavía.</p>
      <button class="btn primary" onclick={() => openRecipe('')}><Plus size={16} /> Nueva plantilla</button>
    </div>
  {:else}
    <div class="list">
      {#each ui.recipes as r (r.id)}
        <div class="card proj">
          <button class="main" onclick={() => openRecipe(r.id)}>
            <strong>{r.name}</strong>
            {#if r.notes}<span class="muted small">{r.notes}</span>{/if}
            <div class="mods">{#each r.modules as m}<span class="badge">{moduleName(m.id)}</span>{/each}</div>
          </button>
          <div class="deps">
            {#each r.deployments as d}
              <button class="dep" onclick={() => openDeployment(d.projectId)} title="Abrir esta plantilla en ese servidor">
                <ServerIcon size={13} /> {d.serverName}
                {#if !d.applied}<span class="st warn">sin aplicar</span>{:else if d.pending}<span class="st warn">cambios sin aplicar</span>{:else}<span class="st ok"><CircleCheck size={11} /> aplicado</span>{/if}
                {#if !d.sameRecipe}<span class="st">con datos propios</span>{/if}
              </button>
            {:else}
              <span class="muted small">En ningún servidor todavía.</span>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
  .head p { margin-top: 4px; max-width: 760px; }
  .empty { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 48px 24px; color: var(--muted); }
  .empty h2 { color: var(--text); margin-top: 6px; }
  .list { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 14px; }
  .proj { display: flex; flex-direction: column; gap: 12px; transition: border-color .15s; }
  .proj:hover { border-color: var(--accent); }
  .main { background: none; border: 0; padding: 0; text-align: left; font: inherit; color: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 8px; }
  .main strong { font-size: 15px; }
  .small { font-size: 12.5px; }
  .mods { display: flex; flex-wrap: wrap; gap: 6px; }
  .deps { display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--border-soft); padding-top: 10px; }
  .dep { display: flex; align-items: center; gap: 6px; background: none; border: 0; padding: 3px 0; font: inherit; font-size: 13px; color: var(--text); cursor: pointer; text-align: left; }
  .dep:hover { color: var(--accent); }
  .st { font-size: 11.5px; padding: 1px 7px; border-radius: 999px; background: var(--sidebar-hover); color: var(--muted); display: inline-flex; gap: 3px; align-items: center; }
  .st.ok { background: var(--success-soft); color: var(--success); }
  .st.warn { background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning); }
</style>
