<script lang="ts">
  // Recuadro flotante con las tareas en grupo (abajo a la derecha, en
  // cualquier pantalla): una fila por servidor con su estado y, si se está
  // aplicando, su barra de progreso.
  import { LoaderCircle, CircleCheck, CircleX, CircleMinus, Circle, X, Square, ChevronDown, ChevronUp } from '@lucide/svelte'
  import RunProgress from './RunProgress.svelte'
  import { bulk, kindLabel, stopBulk, closeBulk } from '../lib/bulk.svelte'
  import { ui, openDeployment, openServer } from '../lib/state.svelte'
  import { t } from '../lib/i18n.svelte'

  let folded = $state(false)
  const done = $derived(bulk.jobs.filter((j) => j.state !== 'wait' && j.state !== 'run').length)
  const name = (id: string) => ui.servers.find((s) => s.id === id)?.name ?? id
</script>

{#if bulk.jobs.length}
  <aside class="bulk card" aria-live="polite">
    <header>
      {#if bulk.running}<LoaderCircle size={15} class="spin" />{:else}<CircleCheck size={15} class="ok" />{/if}
      <strong>{bulk.title}</strong>
      <span class="muted small">{t('{0} de {1}', done, bulk.jobs.length)}</span>
      <span class="grow"></span>
      <button class="icon-b" onclick={() => (folded = !folded)} aria-label={folded ? t('Desplegar') : t('Plegar')}>{#if folded}<ChevronUp size={15} />{:else}<ChevronDown size={15} />{/if}</button>
      {#if !bulk.running}<button class="icon-b" onclick={closeBulk} aria-label={t('Cerrar')}><X size={15} /></button>{/if}
    </header>
    {#if !folded}
      <ul>
        {#each bulk.jobs as j, i (i)}
          {@const run = j.projectId ? ui.runs[j.projectId] : undefined}
          <li class={j.state}>
            <span class="ic">
              {#if j.state === 'run'}<LoaderCircle size={14} class="spin" />{:else if j.state === 'ok'}<CircleCheck size={14} />{:else if j.state === 'fail'}<CircleX size={14} />{:else if j.state === 'skip'}<CircleMinus size={14} />{:else}<Circle size={14} />{/if}
            </span>
            <div class="body">
              <div class="line">
                <button class="lnk" onclick={() => (j.projectId ? openDeployment(j.projectId) : openServer(j.serverId))}>{name(j.serverId)}</button>
                <span class="muted small">· {kindLabel(j.kind)}</span>
              </div>
              {#if j.state === 'run' && run && (j.kind === 'apply' || j.kind === 'simulate')}<RunProgress {run} />{/if}
              {#if j.detail}<small class:bad={j.state === 'fail'} class="muted">{j.detail}</small>{/if}
            </div>
          </li>
        {/each}
      </ul>
      {#if bulk.running && !bulk.stop}
        <footer><button class="btn sm" onclick={stopBulk}><Square size={12} /> {t('Parar después de este')}</button></footer>
      {/if}
    {/if}
  </aside>
{/if}

<style>
  .bulk { position: fixed; right: 18px; bottom: 44px; width: min(420px, calc(100vw - 36px)); z-index: 40; padding: 12px 14px; box-shadow: var(--shadow); max-height: 60vh; display: flex; flex-direction: column; }
  header { display: flex; align-items: center; gap: 8px; }
  header :global(.ok) { color: var(--success); }
  .grow { flex: 1; }
  .icon-b { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 2px; display: inline-flex; }
  ul { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; overflow: auto; }
  li { display: flex; gap: 8px; align-items: flex-start; }
  .ic { padding-top: 2px; color: var(--muted); }
  li.ok .ic { color: var(--success); }
  li.fail .ic { color: var(--danger); }
  li.run .ic { color: var(--accent); }
  .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .line { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
  .lnk { background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: var(--text); cursor: pointer; }
  .lnk:hover { color: var(--accent); }
  .small, small { font-size: 12px; }
  small.bad { color: var(--danger); }
  footer { margin-top: 10px; display: flex; justify-content: flex-end; }
</style>
