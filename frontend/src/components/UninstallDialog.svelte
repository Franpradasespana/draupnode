<script lang="ts">
  // Desinstalar módulos del servidor, con confirmación fuerte.
  // allowRemove: viene de desmarcar un módulo instalado → también se ofrece
  // «Solo quitar del proyecto» (no toca el servidor).
  import { TriangleAlert, Trash2 } from '@lucide/svelte'
  import { untrack } from 'svelte'
  import Modal from './Modal.svelte'
  import type { UninstallCheck, UninstallChoice } from '../lib/api'

  // all: «Desinstalar todo» (con la lista de lo que se queda y por qué).
  let { check, allowRemove = false, all, done }: { check: UninstallCheck; allowRemove?: boolean; all?: { keep: { name: string; warning?: string }[]; word: string }; done: (c: UninstallChoice) => void } = $props()

  // «Desinstalar todo» se confirma con el nombre del servidor y borra los datos salvo que se desmarque.
  const WORD = untrack(() => all?.word || 'DESINSTALAR')
  let step = $state<1 | 2>(1)
  let purge = $state(untrack(() => !!all))
  let typed = $state('')
  const names = $derived(check.modules.map((m) => m.name).join(', '))
</script>

<Modal title={all ? `Desinstalar todo de ${check.server || 'el servidor'}` : step === 1 ? `¿Qué hacemos con ${names}?` : `Desinstalar ${names}`} onclose={() => done(null)} width={600}>
  {#if all && step === 1}
    <p>Se desinstala todo lo que puso Draupnode y se puede quitar, para dejar el servidor como recién preparado: <strong>{names}</strong>.
      También se quita el historial de CPU/memoria/disco, si está activado.</p>
    {#if all.keep.length}
      <p class="muted-p">Se quedan:</p>
      <ul class="keep">{#each all.keep as k}<li><strong>{k.name}</strong>{k.warning ? ` — ${k.warning}` : ''}</li>{/each}</ul>
    {/if}
    <p class="muted-p">El sistema y el acceso por SSH no se tocan. Las apps que Draupnode ya no gestiona (huérfanas) se quitan aparte, en Módulos → «Lo que ya hay en el servidor».</p>
    {#if !check.ok}<p class="bad">No se puede: {check.error}</p>{/if}
  {:else if step === 1}
    {#if allowRemove}
      <p><strong>Solo dejar de gestionarlo</strong>: sigue instalado y funcionando en el servidor; Draupnode deja de gestionarlo.</p>
      <p><strong>Desinstalar del servidor</strong>: lo quita de {check.server || 'el servidor'}.</p>
    {/if}
    {#each check.modules as m}
      {#if m.warning}<p class="warn"><TriangleAlert size={15} /> <span><strong>{m.name}:</strong> {m.warning}</span></p>{/if}
    {/each}
    {#if !check.ok}
      <p class="bad">No se puede desinstalar: {check.error}</p>
    {/if}
  {:else}
    <p>Se desinstalará de <strong>{check.server || 'el servidor'}</strong>: {names}.</p>
    {#each check.modules as m}
      {#if m.warning}<p class="warn"><TriangleAlert size={15} /> <span><strong>{m.name}:</strong> {m.warning}</span></p>{/if}
    {/each}
    {#if check.hasData}
      <label class="purge">
        <input type="checkbox" bind:checked={purge} />
        <span>
          <strong>Borrar también los datos</strong> (no se puede deshacer)
          {#each check.modules.filter((m) => m.data) as m}<small>{m.name}: {m.data}</small>{/each}
        </span>
      </label>
    {/if}
    <label class="field">
      <span>Para confirmar, escribe <strong>{WORD}</strong></span>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="input mono" bind:value={typed} autofocus autocomplete="off" spellcheck="false" />
    </label>
  {/if}

  {#snippet footer()}
    <button class="btn" onclick={() => done(null)}>Cancelar</button>
    {#if step === 1}
      {#if allowRemove}<button class="btn" onclick={() => done({ action: 'remove' })}>Solo dejar de gestionarlo</button>{/if}
      <button class="btn solid-danger" onclick={() => (step = 2)} disabled={!check.ok}><Trash2 size={14} /> {all ? 'Seguir…' : 'Desinstalar del servidor…'}</button>
    {:else}
      <button class="btn solid-danger" onclick={() => done({ action: 'uninstall', purge })} disabled={all ? typed.trim() !== WORD : typed.trim().toUpperCase() !== WORD}>
        <Trash2 size={14} /> {purge ? 'Desinstalar y borrar datos' : 'Desinstalar'}
      </button>
    {/if}
  {/snippet}
</Modal>

<style>
  p { margin: 0 0 10px; }
  .warn { display: flex; gap: 8px; align-items: flex-start; font-size: 13.5px; color: var(--text); background: var(--warning-soft); padding: 8px 10px; border-radius: var(--radius-sm); }
  .warn :global(svg) { color: var(--warning); flex: none; margin-top: 2px; }
  .bad { color: var(--danger); font-size: 13.5px; }
  .muted-p { color: var(--muted); font-size: 13.5px; }
  .keep { margin: -4px 0 12px; padding-left: 20px; font-size: 13.5px; display: flex; flex-direction: column; gap: 3px; }
  .purge { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--danger) 45%, var(--border)); border-radius: var(--radius-sm); margin: 6px 0 14px; cursor: pointer; }
  .purge input { accent-color: var(--danger); margin-top: 3px; }
  .purge span { display: flex; flex-direction: column; gap: 4px; font-size: 13.5px; }
  .purge small { color: var(--muted); font-size: 12px; }
</style>
