<script lang="ts">
  // Proyectos = recetas: qué módulos y con qué opciones, sin servidor. Se
  // asocian a uno o varios servidores (desde aquí o desde la ficha del servidor).
  import { Plus, FolderGit2, Server as ServerIcon, CircleCheck, Sparkles } from '@lucide/svelte'
  import SetupWizard from '../components/SetupWizard.svelte'
  import RecipeEditor from './RecipeEditor.svelte'
  import { ui, moduleName, openRecipe, openServerModules } from '../lib/state.svelte'
  import { t } from '../lib/i18n.svelte'

  let wizard = $state(false)
</script>

{#if ui.recipeId !== null}
  {#key ui.recipeId}<RecipeEditor id={ui.recipeId} />{/key}
{:else}
  <div class="head">
    <div>
      <h1>{t('Plantillas')}</h1>
      <p class="muted">{t('Una plantilla es un grupo de módulos con sus opciones, para añadirlos de una vez a un servidor. Al aplicarla, sus módulos pasan a ser del servidor (allí ves de qué plantilla vino cada uno) y se instalan cuando pulsas Aplicar. Editar una plantilla no cambia los servidores en los que ya se aplicó.')}</p>
    </div>
    <div class="acts"><button class="btn" onclick={() => (wizard = true)}><Sparkles size={16} /> {t('¿Qué quieres montar?')}</button>
    <button class="btn primary" onclick={() => openRecipe('')}><Plus size={16} /> {t('Nueva plantilla')}</button></div>
  </div>

  {#if !ui.recipes.length}
    <div class="empty card">
      <FolderGit2 size={34} strokeWidth={1.4} />
      <h2>{t('Aún no hay plantillas')}</h2>
      <p class="muted">{t('Crea una: elige los módulos (Docker, Caddy, copias, apps…) y sus opciones. No hace falta tener servidor todavía.')}</p>
      <div class="acts"><button class="btn" onclick={() => (wizard = true)}><Sparkles size={16} /> {t('¿Qué quieres montar?')}</button>
    <button class="btn primary" onclick={() => openRecipe('')}><Plus size={16} /> {t('Nueva plantilla')}</button></div>
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
            {#each r.servers as d (d.serverId)}
              <button class="dep" onclick={() => openServerModules(d.serverId)} title={t('Ver los módulos de ese servidor')}>
                <ServerIcon size={13} /> {d.serverName}
              </button>
            {:else}
              <span class="muted small">{t('No se ha aplicado en ningún servidor.')}</span>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/if}

{#if wizard}<SetupWizard onclose={() => (wizard = false)} />{/if}

<style>
  .acts { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
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
</style>
