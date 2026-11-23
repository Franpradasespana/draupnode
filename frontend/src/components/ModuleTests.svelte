<script lang="ts">
  // Ayuda → «Probar cada módulo»: un desplegable por módulo (agrupados por
  // categoría) con cómo probarlo en el servidor de pruebas y qué debería verse.
  // «Probado: funciona» se recuerda en este equipo, para ir repasándolos todos.
  import { FlaskConical, CircleCheck, ListOrdered, Eye, SlidersHorizontal, ClipboardList, LifeBuoy } from '@lucide/svelte'
  import ModuleForm from './ModuleForm.svelte'
  import { ui } from '../lib/state.svelte'
  import type { Module } from '../lib/api'

  const KEY = 'dn-modulos-probados'
  let done = $state<Record<string, string>>(read())
  function read(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {} } catch { return {} }
  }
  function toggle(id: string, on: boolean) {
    const next = { ...done }
    if (on) next[id] = new Date().toISOString()
    else delete next[id]
    done = next
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* sin almacenamiento */ }
  }

  const mods = $derived((ui.modules?.modules ?? []).filter((m) => m.prueba?.pasos?.length))
  const without = $derived((ui.modules?.modules ?? []).filter((m) => !m.prueba?.pasos?.length))
  const groups = $derived.by(() => {
    const by = new Map<string, Module[]>()
    for (const m of [...mods].sort((a, b) => a.category.localeCompare(b.category, 'es') || a.name.localeCompare(b.name, 'es'))) {
      const c = m.category.replace(/^\d+\s*·\s*/, '')
      by.set(c, [...(by.get(c) ?? []), m])
    }
    return [...by.entries()]
  })
  // Su configuración (el formulario de verdad, solo para ver), al abrir el desplegable.
  let open = $state<Record<string, boolean>>({})
  const defaults = (m: Module) => Object.fromEntries((m.variables ?? []).map((v) => [v.name, structuredClone($state.snapshot(v.default))]))
  const forms = $state<Record<string, Record<string, unknown>>>({})
  function toggled(m: Module, isOpen: boolean) {
    if (isOpen && !forms[m.id]) forms[m.id] = defaults(m)
    open[m.id] = isOpen
  }
  const count = $derived(mods.filter((m) => done[m.id]).length)
  const when = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
</script>

<div class="mt">
  <div class="progress">
    <strong>{count} de {mods.length}</strong> probados en este equipo
    <span class="bar"><i style:width="{mods.length ? (count / mods.length) * 100 : 0}%"></i></span>
  </div>

  {#each groups as [cat, list] (cat)}
    <h3 class="cat">{cat}</h3>
    {#each list as m (m.id)}
      <details class:done={!!done[m.id]} ontoggle={(e) => toggled(m, (e.currentTarget as HTMLDetailsElement).open)}>
        <summary>
          <span class="name">{m.name}</span>
          {#if m.source === 'user'}<span class="tag">propio</span>{/if}
          {#if done[m.id]}<span class="okt"><CircleCheck size={14} /> probado el {when(done[m.id])}</span>{/if}
        </summary>
        <div class="body">
          {#if m.prueba?.necesita?.length}
            <h4><ClipboardList size={14} /> Qué tienes que rellenar</h4>
            <ul>{#each m.prueba.necesita as n}<li>{n}</li>{/each}</ul>
          {/if}
          {#if m.prueba?.lab}<p class="lab"><FlaskConical size={14} /> <span><strong>En el servidor de pruebas:</strong> {m.prueba.lab}</span></p>{/if}
          <h4><ListOrdered size={14} /> Pasos</h4>
          <ol>{#each m.prueba?.pasos ?? [] as p}<li>{p}</li>{/each}</ol>
          {#if m.prueba?.comprobar?.length}
            <h4><Eye size={14} /> Cómo queda y qué comprobar</h4>
            <ul>{#each m.prueba.comprobar as c}<li>{c}</li>{/each}</ul>
          {/if}
          {#if m.prueba?.problemas?.length}
            <h4><LifeBuoy size={14} /> Si falla</h4>
            <ul class="probs">{#each m.prueba.problemas as p}{@const [sin, sol] = p.split(' → ')}<li>{#if sol}<strong>{sin}</strong> → {sol}{:else}{p}{/if}</li>{/each}</ul>
          {/if}
          {#if open[m.id] && forms[m.id]}
            <h4><SlidersHorizontal size={14} /> Su configuración (con los valores por defecto)</h4>
            <div class="form" inert><ModuleForm {m} bind:values={forms[m.id]} projectId="" /></div>
          {/if}
          <label class="chk"><input type="checkbox" checked={!!done[m.id]} onchange={(e) => toggle(m.id, (e.currentTarget as HTMLInputElement).checked)} /> Probado: funciona</label>
        </div>
      </details>
    {/each}
  {/each}

  {#if without.length}
    <p class="muted small">Sin guía de prueba: {without.map((m) => m.name).join(', ')}. En tus módulos puedes añadirla con <code>prueba:</code> en su module.yaml (lab, pasos y comprobar).</p>
  {/if}
</div>

<style>
  .mt { margin-top: 22px; }
  .progress { display: flex; align-items: center; gap: 10px; font-size: 13.5px; margin-bottom: 6px; flex-wrap: wrap; }
  .bar { flex: 1; min-width: 120px; height: 6px; border-radius: 99px; background: var(--border-soft); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--success); border-radius: 99px; }
  .cat { font-size: 11.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 18px 0 6px; }
  details { border: 1px solid var(--border-soft); border-radius: 9px; margin-bottom: 6px; background: var(--panel); }
  details.done { border-color: color-mix(in srgb, var(--success) 45%, var(--border-soft)); }
  summary { cursor: pointer; padding: 9px 12px; display: flex; align-items: center; gap: 8px; font-size: 14px; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: '▸'; color: var(--muted); font-size: 11px; transition: transform .15s; }
  details[open] summary::before { transform: rotate(90deg); }
  .name { font-weight: 500; }
  .tag { font-size: 11px; padding: 1px 7px; border-radius: 99px; background: var(--accent-soft); }
  .okt { margin-left: auto; display: inline-flex; gap: 4px; align-items: center; font-size: 12px; color: var(--success); }
  .body { padding: 2px 14px 12px 30px; font-size: 13.5px; line-height: 1.55; }
  .lab { display: flex; gap: 8px; align-items: flex-start; background: var(--panel-2); border-radius: 7px; padding: 7px 10px; margin: 0 0 8px; }
  .lab :global(svg) { flex: none; margin-top: 3px; color: var(--accent); }
  h4 { display: flex; gap: 6px; align-items: center; font-size: 12.5px; margin: 10px 0 4px; color: var(--muted); }
  ol, ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 3px; }
  .form { border: 1px solid var(--border-soft); border-radius: 8px; padding: 10px 12px; background: var(--panel-2); }
  .lab { margin-top: 10px; }
  .probs li strong { font-weight: 600; }
  .chk { display: inline-flex; gap: 8px; align-items: center; margin-top: 10px; font-weight: 500; cursor: pointer; }
  .muted { color: var(--muted); }
  .small { font-size: 12.5px; margin-top: 14px; }
</style>
