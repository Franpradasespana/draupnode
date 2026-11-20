<script lang="ts">
  // Un campo del formulario de un módulo, generado a partir de su variable.
  import { untrack } from 'svelte'
  import type { ModVariable } from '../lib/api'

  // bare: solo el control (la etiqueta y la ayuda las pone quien lo usa).
  let { v, value = $bindable(), error, bare = false }: { v: ModVariable; value: unknown; error?: string; bare?: boolean } = $props()

  // Las listas se editan como texto, un elemento por línea.
  let listText = $state(Array.isArray(value) ? (value as string[]).join('\n') : '')
  const parse = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean)
  function onList(t: string) {
    listText = t
    value = parse(t)
  }
  // Si la lista cambia desde fuera (p. ej. Coolify añade sus puertos al
  // Cortafuegos), se refleja aquí; lo que se está escribiendo no se toca.
  $effect(() => {
    const ext = Array.isArray(value) ? (value as unknown[]).map(String) : []
    if (ext.join('\n') !== untrack(() => parse(listText)).join('\n')) listText = ext.join('\n')
  })
</script>

{#if bare}
  <div class="bare" class:bad={!!error}>
    {#if v.type === 'bool'}
      <label class="switch" title={value ? 'Sí' : 'No'}>
        <input type="checkbox" checked={!!value} onchange={(e) => (value = e.currentTarget.checked)} />
        <span class="track"><span class="knob"></span></span>
        <span class="st">{value ? 'Sí' : 'No'}</span>
      </label>
    {:else if v.type === 'select'}
      <select class="input" value={String(value ?? '')} onchange={(e) => (value = e.currentTarget.value)}>
        {#each v.options ?? [] as o}<option value={o}>{o}</option>{/each}
      </select>
    {:else if v.type === 'int'}
      <input class="input mono num" type="number" min={v.min} max={v.max} value={value ?? ''}
        oninput={(e) => (value = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))} />
    {:else if v.type === 'list'}
      <textarea class="input mono" rows={Math.min(8, Math.max(3, listText.split('\n').length + 1))}
        value={listText} oninput={(e) => onList(e.currentTarget.value)} placeholder="Uno por línea" spellcheck="false"></textarea>
    {:else}
      <input class="input" value={value ?? ''} placeholder={v.placeholder} oninput={(e) => (value = e.currentTarget.value)} spellcheck="false" />
    {/if}
  </div>
{:else}
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
{/if}

<style>
  .vf { display: flex; flex-direction: column; gap: 5px; }
  .vf small { font-size: 12px; }
  .bad :global(.input) { border-color: var(--danger); }
  .err { color: var(--danger); }
  .bare { width: 100%; }
  .num { max-width: 160px; }
  .switch { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
  .switch input { position: absolute; opacity: 0; width: 0; height: 0; }
  .track { width: 42px; height: 24px; border-radius: 12px; background: var(--border); position: relative; transition: background .15s; flex: none; }
  .knob { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); transition: left .15s; }
  .switch input:checked + .track { background: var(--accent); }
  .switch input:checked + .track .knob { left: 21px; }
  .switch input:focus-visible + .track { box-shadow: 0 0 0 3px var(--accent-soft); }
  .st { font-size: 13px; color: var(--muted); }
</style>
