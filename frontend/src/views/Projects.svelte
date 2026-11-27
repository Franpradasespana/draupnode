<script lang="ts">
  // Proyectos = recetas: qué módulos y con qué opciones, sin servidor. Se
  // asocian a uno o varios servidores (desde aquí o desde la ficha del servidor).
  import { Plus, FolderGit2, Server as ServerIcon, Sparkles, Package, RotateCcw } from '@lucide/svelte'
  import SetupWizard from '../components/SetupWizard.svelte'
  import RecipeEditor from './RecipeEditor.svelte'
  import { api, type RecipeView } from '../lib/api'
  import { ui, moduleName, openRecipe, openServerModules, refreshProjects, toast } from '../lib/state.svelte'
  import { t, plural } from '../lib/i18n.svelte'

  let wizard = $state(false)

  // Las de serie (las trae Draupnode) van aparte, debajo de las tuyas.
  const mine = $derived(ui.recipes.filter((r) => !r.builtin))
  const builtin = $derived(ui.recipes.filter((r) => r.builtin))
  // La base que llevan todas las de serie: en sus tarjetas se resume en una sola etiqueta.
  const BASE = ['base', 'chrony', 'firewall', 'ssh', 'backups', 'alerts']
  let missing = $state(0)
  $effect(() => {
    void ui.recipes.length
    api.BuiltinMissing().then((n) => (missing = n)).catch(() => {})
  })
  async function restoreBuiltin() {
    const n = await api.RestoreBuiltinTemplates()
    await refreshProjects()
    toast(n ? t('Recuperadas: {0}', plural(n, 'plantilla de serie', 'plantillas de serie')) : t('No faltaba ninguna'))
  }
</script>

{#snippet card(r: RecipeView)}
  <div class="card proj">
    <button class="main" onclick={() => openRecipe(r.id)}>
      <strong>{r.name}</strong>
      {#if r.notes}<span class="muted small">{r.notes}</span>{/if}
      <div class="mods">
        {#if r.builtin && r.builtin !== 'servidor-seguro' && BASE.every((b) => r.modules.some((m) => m.id === b))}
          <span class="badge base" title={BASE.map(moduleName).join(', ')}>{t('Servidor seguro')}</span>
          {#each r.modules.filter((m) => !BASE.includes(m.id)) as m}<span class="badge">{moduleName(m.id)}</span>{/each}
        {:else}
          {#each r.modules as m}<span class="badge">{moduleName(m.id)}</span>{/each}
        {/if}
      </div>
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
{/snippet}

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

  {#if !mine.length && !builtin.length}
    <div class="empty card">
      <FolderGit2 size={34} strokeWidth={1.4} />
      <h2>{t('Aún no hay plantillas')}</h2>
      <p class="muted">{t('Crea una: elige los módulos (Docker, Caddy, copias, apps…) y sus opciones. No hace falta tener servidor todavía.')}</p>
      <div class="acts"><button class="btn" onclick={() => (wizard = true)}><Sparkles size={16} /> {t('¿Qué quieres montar?')}</button>
    <button class="btn primary" onclick={() => openRecipe('')}><Plus size={16} /> {t('Nueva plantilla')}</button></div>
    </div>
  {:else if mine.length}
    <h2 class="sec-t">{t('Tuyas')}</h2>
    <div class="list">
      {#each mine as r (r.id)}{@render card(r)}{/each}
    </div>
  {/if}

  {#if builtin.length || missing}
    <div class="sec">
      <div>
        <h2><Package size={18} /> {t('De serie')}</h2>
        <p class="muted small">{t('Las trae Draupnode con los módulos más habituales. Pulsa en una y «Aplicar en un servidor…» (o añádela desde la ficha del servidor), configura sus opciones allí y pulsa Aplicar. Puedes cambiarlas o borrarlas como las tuyas; si no las tocas, se actualizan con Draupnode.')}</p>
      </div>
      {#if missing}<button class="btn sm" onclick={restoreBuiltin}><RotateCcw size={14} /> {t('Recuperar las borradas ({0})', missing)}</button>{/if}
    </div>
    <div class="list">
      {#each builtin as r (r.id)}{@render card(r)}{/each}
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
  .sec { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin: 30px 0 14px; }
  .sec h2 { display: flex; gap: 8px; align-items: center; margin: 0 0 4px; font-size: 17px; }
  .sec p { margin: 0; max-width: 760px; }
  .badge.base { border-style: dashed; }
  .sec-t { margin: 0 0 12px; font-size: 17px; }
</style>
