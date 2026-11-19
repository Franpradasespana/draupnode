<script lang="ts">
  // Un campo del formulario de un módulo, generado a partir de su variable.
  import type { ModVariable } from '../lib/api'

  let { v, value = $bindable(), error }: { v: ModVariable; value: unknown; error?: string } = $props()

  // Las listas se editan como texto, un elemento por línea.
  let listText = $state(Array.isArray(value) ? (value as string[]).join('\n') : '')
  function onList(t: string) {
    listText = t
    value = t.split('\n').map((x) => x.trim()).filter(Boolean)
  }
</script>

<div class="vf" class:bad={!!error}>
  {#if v.type === 'bool'}
    <label class="check">
      <input type="checkbox" checked={!!value} onchange={(e) => (value = e.currentTarget.checked)} />
      <span>{v.label}</span>
    </label>
  {:else}
    <label class="field">
      <span>{v.label}{#if v.required} *{/if}</span>
      {#if v.type === 'select'}
        <select class="input" value={String(value ?? '')} onchange={(e) => (value = e.currentTarget.value)}>
          {#each v.options ?? [] as o}<option value={o}>{o}</option>{/each}
        </select>
      {:else if v.type === 'int'}
        <input class="input mono" type="number" min={v.min} max={v.max} value={value ?? ''}
          oninput={(e) => (value = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))} />
      {:else if v.type === 'list'}
        <textarea class="input mono" rows={Math.min(8, Math.max(3, listText.split('\n').length + 1))}
          value={listText} oninput={(e) => onList(e.currentTarget.value)} placeholder="Uno por línea" spellcheck="false"></textarea>
      {:else}
        <input class="input" value={value ?? ''} placeholder={v.placeholder} oninput={(e) => (value = e.currentTarget.value)} spellcheck="false" />
      {/if}
    </label>
  {/if}
  {#if error}<small class="err">{error}</small>{:else if v.help}<small class="muted">{v.help}</small>{/if}
</div>

<style>
  .vf { display: flex; flex-direction: column; gap: 5px; }
  .vf small { font-size: 12px; }
  .bad :global(.input) { border-color: var(--danger); }
  .err { color: var(--danger); }
</style>
