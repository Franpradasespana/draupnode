<script lang="ts">
  // Editor de una receta (proyecto sin servidor): nombre, módulos y sus
  // opciones. Los datos secretos (tokens, claves) se escriben en cada
  // servidor, no aquí. Al guardar, los servidores que la usan reciben los
  // cambios (sin aplicarlos) y conservan lo suyo.
  import { untrack } from 'svelte'
  import { ArrowLeft, Save, Trash2, Server as ServerIcon, Plus, TriangleAlert, ChevronDown, ChevronRight, CircleCheck } from '@lucide/svelte'
  import ModuleCard from '../components/ModuleCard.svelte'
  import VarField from '../components/VarField.svelte'
  import { api, errorText, type Module, type ProjectCheck, type Recipe } from '../lib/api'
  import { ui, toast, refreshProjects, moduleName, confirmDialog, openDeployment } from '../lib/state.svelte'
  import { clashesWith, type CardState } from '../lib/modules'

  let { id }: { id: string } = $props()

  const initial = untrack(() => ui.recipes.find((r) => r.id === id))
  let draft = $state<Recipe>(initial ? JSON.parse(JSON.stringify({ id: initial.id, name: initial.name, notes: initial.notes ?? '', modules: initial.modules })) : { id: '', name: '', notes: '', modules: [] })
  const key = (r: Recipe) => JSON.stringify([r.name.trim(), r.notes ?? '', r.modules])
  let savedKey = $state(initial ? key(draft) : '')
  const dirty = $derived(key(draft) !== savedKey)
  let check = $state<ProjectCheck | null>(null)
  let saving = $state(false)
  let open = $state<Record<string, boolean>>({})
  let deployTo = $state('')

  const mods = $derived(ui.modules?.modules ?? [])
  const byId = (mid: string) => mods.find((m) => m.id === mid)
  const selected = $derived(new Set(draft.modules.map((m) => m.id)))
  const stored = $derived(ui.recipes.find((r) => r.id === draft.id))
  const errorCount = $derived(Object.values(check?.errors ?? {}).reduce((n, e) => n + Object.keys(e).length, 0))

  $effect(() => {
    const snap = JSON.stringify(draft)
    const t = setTimeout(async () => {
      try { check = await api.CheckRecipe(JSON.parse(snap)) } catch { /* siguiente cambio */ }
    }, 300)
    return () => clearTimeout(t)
  })

  function defaults(m: Module) {
    return Object.fromEntries((m.variables ?? []).filter((v) => v.type !== 'secret').map((v) => [v.name, JSON.parse(JSON.stringify(v.default ?? null))]))
  }
  function toggle(m: Module) {
    if (selected.has(m.id)) {
      const needs = draft.modules.filter((x) => byId(x.id)?.depends?.includes(m.id)).map((x) => moduleName(x.id))
      if (needs.length) return toast(`Lo necesita ${needs.join(', ')}: quita antes ese`, 'error')
      draft.modules = draft.modules.filter((x) => x.id !== m.id)
      return
    }
    const clash = clashesWith(m.id, selected, byId)
    if (clash.length) return toast(`${m.name} no puede ir con ${clash.map(moduleName).join(', ')}`, 'error')
    const add = (mid: string) => {
      const mm = byId(mid)
      if (!mm || draft.modules.some((x) => x.id === mid)) return
      for (const d of mm.depends ?? []) add(d)
      draft.modules.push({ id: mid, values: defaults(mm) })
    }
    add(m.id)
    open[m.id] = true
  }
  function cardState(m: Module): CardState {
    if (selected.has(m.id)) return draft.modules.some((x) => byId(x.id)?.depends?.includes(m.id)) ? 'required' : 'pending'
    return clashesWith(m.id, selected, byId).length ? 'clash' : 'none'
  }

  const sections = $derived.by(() => {
    const by: Record<string, Module[]> = {}
    for (const m of mods) (by[m.category || 'Otros'] ||= []).push(m)
    return Object.entries(by).sort(([x], [y]) => x.localeCompare(y)).map(([cat, list]) => ({ title: cat.replace(/^\d+\s*·\s*/, ''), list: list.sort((a, b) => a.name.localeCompare(b.name, 'es')) }))
  })
  const ordered = $derived((check?.order?.length ? check.order : draft.modules.map((m) => m.id)).filter((mid) => selected.has(mid)))

  async function save(): Promise<boolean> {
    if (!draft.name.trim()) {
      toast('Ponle un nombre a la plantilla', 'error')
      return false
    }
    saving = true
    try {
      const r = await api.SaveRecipe($state.snapshot(draft) as Recipe)
      draft.id = r.id
      draft.modules = r.modules
      savedKey = key(draft)
      await refreshProjects()
      if (!id) ui.recipeId = r.id
      toast(stored?.deployments.length ? 'Guardado. Los servidores que lo usan tienen «cambios sin aplicar».' : 'Plantilla guardada')
      return true
    } catch (e) {
      toast(errorText(e), 'error')
      return false
    } finally {
      saving = false
    }
  }

  async function remove() {
    const ok = await confirmDialog({ title: 'Eliminar plantilla', message: `¿Eliminar «${draft.name}»? Solo se puede si no está en ningún servidor.`, confirmLabel: 'Eliminar', danger: true })
    if (!ok) return
    try {
      await api.DeleteRecipe(draft.id)
      await refreshProjects()
      ui.recipeId = null
      toast('Plantilla eliminada')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function deploy() {
    if (!deployTo) return
    if (dirty && !(await save())) return
    try {
      const p = await api.DeployRecipe(draft.id, deployTo)
      await refreshProjects()
      toast('Asociado. Revísalo y pulsa Aplicar cuando quieras.')
      openDeployment(p.id)
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  const freeServers = $derived(ui.servers.filter((s) => !stored?.deployments.some((d) => d.serverId === s.id)))
  const secretCount = (m: Module) => (m.variables ?? []).filter((v) => v.type === 'secret' && !v.managed).length
</script>

<div class="bar">
  <button class="btn ghost sm" onclick={() => (ui.recipeId = null)}><ArrowLeft size={15} /> Plantillas</button>
  <div class="spacer"></div>
  {#if draft.id}<button class="btn sm danger" onclick={remove}><Trash2 size={14} /> Eliminar</button>{/if}
  <button class="btn primary" onclick={save} disabled={saving || !dirty || !draft.name.trim()}><Save size={15} /> {saving ? 'Guardando…' : dirty || !draft.id ? 'Guardar' : 'Guardado'}</button>
</div>

<div class="top card">
  <input class="name" bind:value={draft.name} placeholder="Nombre de la plantilla (p. ej. Servidor de copias, Mis apps…)" />
  <textarea class="input notes" rows="2" bind:value={draft.notes} placeholder="Para qué es (opcional)"></textarea>
  {#if draft.id}
    <div class="deps">
      <span class="muted small">Está en:</span>
      {#each stored?.deployments ?? [] as d}
        <button class="dep" onclick={() => openDeployment(d.projectId)}><ServerIcon size={13} /> {d.serverName}{#if !d.sameRecipe} <em>(con datos propios)</em>{/if}</button>
      {:else}<span class="muted small">ningún servidor todavía.</span>{/each}
      {#if freeServers.length}
        <select class="input" bind:value={deployTo}>
          <option value="">Asociar a un servidor…</option>
          {#each freeServers as s}<option value={s.id}>{s.name}</option>{/each}
        </select>
        <button class="btn sm" onclick={deploy} disabled={!deployTo}><Plus size={14} /> Asociar</button>
      {/if}
    </div>
  {:else}
    <p class="muted small">Elige los módulos y sus opciones y pulsa <strong>Guardar</strong>. Después podrás asociarlo a un servidor.</p>
  {/if}
</div>

{#if check?.general?.length}
  <div class="card warns">{#each check.general as g}<p><TriangleAlert size={15} /> {g}</p>{/each}</div>
{/if}

<h2 class="sec">Módulos y opciones {#if ordered.length}<span class="muted small">· se instalan en este orden: {ordered.map(moduleName).join(' → ')}</span>{/if}</h2>
{#if !ordered.length}<p class="muted">Todavía ninguno: márcalos abajo.</p>{/if}
<div class="cfgs">
  {#each ordered as mid (mid)}
    {@const m = byId(mid)}
    {@const pm = draft.modules.find((x) => x.id === mid)}
    {@const errs = check?.errors?.[mid] ?? {}}
    {#if m && pm}
      <section class="card cfg" class:bad={Object.keys(errs).length}>
        <button class="cfg-h" onclick={() => (open[mid] = !open[mid])}>
          {#if open[mid]}<ChevronDown size={15} />{:else}<ChevronRight size={15} />{/if}
          <strong>{m.name}</strong>
          {#if Object.keys(errs).length}<span class="bad-t">{Object.keys(errs).length} por revisar</span>{:else}<CircleCheck size={14} class="okc" />{/if}
          {#if secretCount(m)}<span class="muted small">· {secretCount(m)} dato(s) secreto(s): se escriben en cada servidor</span>{/if}
        </button>
        {#if open[mid]}
          <div class="rows">
            {#each (m.variables ?? []).filter((v) => v.type !== 'secret' && !v.managed) as v (v.name)}
              <div class="row" class:bad={!!errs[v.name]}>
                <div class="lbl"><strong>{v.label}</strong>{#if v.help}<small>{v.help}</small>{/if}{#if errs[v.name]}<small class="err">{errs[v.name]}</small>{/if}</div>
                <div class="ctl"><VarField {v} bind:value={pm.values[v.name]} error={errs[v.name]} bare /></div>
              </div>
            {:else}<p class="muted small">Sin opciones: se instala tal cual.</p>{/each}
          </div>
        {/if}
      </section>
    {/if}
  {/each}
</div>

<h2 class="sec">Añadir o quitar módulos <span class="muted small">· los que necesitan otros los añaden solos</span></h2>
{#each sections as sec (sec.title)}
  <div class="group">{sec.title}</div>
  <div class="grid">
    {#each sec.list as m (m.id)}
      <ModuleCard {m} state={cardState(m)} errors={Object.keys(check?.errors?.[m.id] ?? {}).length} onclick={() => toggle(m)} />
    {/each}
  </div>
{/each}
{#if errorCount}<p class="muted small">Hay {errorCount} opción(es) por revisar: no se puede guardar hasta corregirlas.</p>{/if}

<style>
  .bar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .spacer { flex: 1; }
  .top { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
  .name { font-size: 20px; font-weight: 600; border: 0; border-bottom: 1px solid var(--border); background: none; color: var(--text); padding: 4px 0; outline: none; }
  .name:focus { border-color: var(--accent); }
  .notes { resize: vertical; }
  .deps { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .deps .input { width: auto; min-width: 200px; height: 32px; }
  .dep { display: inline-flex; gap: 5px; align-items: center; background: var(--panel-2); border: 1px solid var(--border-soft); border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12.5px; color: var(--text); cursor: pointer; }
  .dep:hover { border-color: var(--accent); }
  .dep em { font-style: normal; color: var(--muted); }
  .small { font-size: 12.5px; }
  .warns p { display: flex; gap: 8px; margin: 2px 0; }
  .sec { font-size: 15px; margin: 18px 0 10px; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .cfgs { display: flex; flex-direction: column; gap: 8px; }
  .cfg { padding: 10px 14px; }
  .cfg.bad { border-color: color-mix(in srgb, var(--danger) 50%, var(--border)); }
  .cfg-h { display: flex; gap: 8px; align-items: center; background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; width: 100%; text-align: left; flex-wrap: wrap; }
  .cfg-h :global(.okc) { color: var(--success); }
  .bad-t { color: var(--danger); font-size: 12.5px; }
  .rows { display: flex; flex-direction: column; margin-top: 10px; }
  .row { display: grid; grid-template-columns: minmax(200px, 1fr) minmax(220px, 1.2fr); gap: 14px; padding: 10px 0; border-top: 1px solid var(--border-soft); }
  .lbl { display: flex; flex-direction: column; gap: 3px; font-size: 13px; }
  .lbl small { color: var(--muted); font-size: 12px; }
  .lbl .err { color: var(--danger); }
  .group { font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin: 18px 0 8px; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
  @media (max-width: 760px) { .row { grid-template-columns: 1fr; } }
</style>
