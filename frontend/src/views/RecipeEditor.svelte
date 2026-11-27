<script lang="ts">
  // Editor de una receta (proyecto sin servidor): nombre, módulos y sus
  // opciones. Los datos secretos (tokens, claves) se escriben en cada
  // servidor, no aquí. Al guardar, los servidores que la usan reciben los
  // cambios (sin aplicarlos) y conservan lo suyo.
  import { untrack } from 'svelte'
  import { ArrowLeft, Save, Trash2, Server as ServerIcon, Plus, TriangleAlert, ChevronDown, ChevronRight, CircleCheck, Sparkles, Check, Undo2, Layers, Lightbulb } from '@lucide/svelte'
  import ModuleCard from '../components/ModuleCard.svelte'
  import ConfigHistory from '../components/ConfigHistory.svelte'
  import VarField from '../components/VarField.svelte'
  import Modal from '../components/Modal.svelte'
  import { bulk, runBulk } from '../lib/bulk.svelte'
  import { api, errorText, type Module, type ProjectCheck, type Recipe } from '../lib/api'
  import { ui, toast, refreshProjects, moduleName, confirmDialog, openServerModules } from '../lib/state.svelte'
  import { clashesWith, type CardState } from '../lib/modules'
  import { t as tr, plural } from '../lib/i18n.svelte'

  let { id }: { id: string } = $props()

  const initial = untrack(() => ui.recipes.find((r) => r.id === id))
  let draft = $state<Recipe>(initial ? JSON.parse(JSON.stringify({ id: initial.id, name: initial.name, notes: initial.notes ?? '', modules: initial.modules })) : { id: '', name: '', notes: '', modules: [] })
  const key = (r: Recipe) => JSON.stringify([r.name.trim(), r.notes ?? '', r.modules])
  let savedKey = $state(initial ? untrack(() => key(draft)) : '')
  // Copia de lo último guardado, para «Deshacer».
  let savedDraft = $state(untrack(() => JSON.stringify(draft)))
  const dirty = $derived(key(draft) !== savedKey)
  let check = $state<ProjectCheck | null>(null)
  let saving = $state(false)
  let open = $state<Record<string, boolean>>({})
  let deployTo = $state('')
  // Módulos añadidos (aún sin guardar) con opciones: se marcan «por revisar»
  // hasta que el usuario dice que los valores le valen (o guarda).
  let toReview = $state<string[]>([])
  const reviewable = (mid: string) => (byId(mid)?.variables ?? []).some((v) => v.type !== 'secret' && !v.managed)
  function reviewed(mid: string) {
    toReview = toReview.filter((x) => x !== mid)
    open[mid] = false
  }
  function goTo(mid: string) {
    open[mid] = true
    requestAnimationFrame(() => document.getElementById('cfg-' + mid)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

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
      if (needs.length) return toast(tr('Lo necesita {0}: quita antes ese', needs.join(', ')), 'error')
      draft.modules = draft.modules.filter((x) => x.id !== m.id)
      toReview = toReview.filter((x) => x !== m.id)
      return
    }
    const clash = clashesWith(m.id, selected, byId)
    if (clash.length) return toast(tr('{0} no puede ir con {1}', m.name, clash.map(moduleName).join(', ')), 'error')
    const add = (mid: string) => {
      const mm = byId(mid)
      if (!mm || draft.modules.some((x) => x.id === mid)) return
      for (const d of mm.depends ?? []) add(d)
      draft.modules.push({ id: mid, values: defaults(mm) })
      if (reviewable(mid) && !toReview.includes(mid)) toReview.push(mid)
    }
    add(m.id)
    if (reviewable(m.id)) goTo(m.id)
  }
  function cardState(m: Module): CardState {
    if (selected.has(m.id)) return draft.modules.some((x) => byId(x.id)?.depends?.includes(m.id)) ? 'required' : 'pending'
    return clashesWith(m.id, selected, byId).length ? 'clash' : 'none'
  }

  const sections = $derived.by(() => {
    const by: Record<string, Module[]> = {}
    for (const m of mods) (by[m.category || tr('Otros')] ||= []).push(m)
    return Object.entries(by).sort(([x], [y]) => x.localeCompare(y)).map(([cat, list]) => ({ title: cat.replace(/^\d+\s*·\s*/, ''), list: list.sort((a, b) => a.name.localeCompare(b.name, 'es')) }))
  })
  const ordered = $derived((check?.order?.length ? check.order : draft.modules.map((m) => m.id)).filter((mid) => selected.has(mid)))

  async function save(): Promise<boolean> {
    if (!draft.name.trim()) {
      toast(tr('Ponle un nombre a la plantilla'), 'error')
      return false
    }
    saving = true
    try {
      const r = await api.SaveRecipe($state.snapshot(draft) as Recipe)
      draft.id = r.id
      draft.modules = r.modules
      savedKey = key(draft)
      savedDraft = JSON.stringify($state.snapshot(draft))
      toReview = []
      await refreshProjects()
      if (!id) ui.recipeId = r.id
      toast(stored?.servers.length ? tr('Plantilla guardada. Los servidores en los que ya se aplicó no cambian (para llevarles lo nuevo, vuelve a aplicarla).') : tr('Plantilla guardada'))
      return true
    } catch (e) {
      toast(errorText(e), 'error')
      return false
    } finally {
      saving = false
    }
  }

  // Tras «Volver a esta versión» del historial: el borrador pasa a ser lo guardado.
  async function restored() {
    await refreshProjects()
    const r = ui.recipes.find((x) => x.id === draft.id)
    if (!r) return
    draft = JSON.parse(JSON.stringify({ id: r.id, name: r.name, notes: r.notes ?? '', modules: r.modules }))
    savedKey = key(draft)
    savedDraft = JSON.stringify(draft)
    toReview = []
  }

  // Vuelve a lo último guardado (o a la plantilla vacía si aún no se guardó).
  function undo() {
    draft = JSON.parse(savedDraft)
    toReview = []
    open = {}
    toast(tr('Cambios deshechos: la plantilla está como la guardaste'))
  }

  async function remove() {
    const ok = await confirmDialog({ title: tr('Eliminar plantilla'), message: tr('¿Eliminar «{0}»? Los servidores en los que se aplicó conservan sus módulos.', draft.name), confirmLabel: tr('Eliminar'), danger: true })
    if (!ok) return
    try {
      await api.DeleteRecipe(draft.id)
      await refreshProjects()
      ui.recipeId = null
      toast(tr('Plantilla eliminada'))
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function deploy() {
    if (!deployTo) return
    if (dirty && !(await save())) return
    try {
      const r = await api.ApplyTemplate(deployTo, draft.id)
      await refreshProjects()
      toast(tr('Aplicada en {0}. {1}', ui.servers.find((s) => s.id === deployTo)?.name, r.notes.join(' ')))
      openServerModules(deployTo)
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  const freeServers = $derived(ui.servers)

  // Aplicar en varios servidores a la vez: añade sus módulos a cada uno y,
  // si se marca, los instala uno detrás de otro (con su barra de progreso).
  let multi = $state(false)
  let multiPick = $state<Record<string, boolean>>({})
  let multiNow = $state(true)
  let multiBusy = $state(false)
  const multiSel = $derived(ui.servers.filter((s) => multiPick[s.id]))
  async function deployMany() {
    if (!multiSel.length) return
    if (dirty && !(await save())) return
    multiBusy = true
    const jobs: { serverId: string; projectId: string; kind: 'apply' }[] = []
    const failed: string[] = []
    for (const s of multiSel) {
      try {
        const r = await api.ApplyTemplate(s.id, draft.id)
        jobs.push({ serverId: s.id, projectId: r.project.id, kind: 'apply' })
      } catch (e) {
        failed.push(`${s.name}: ${errorText(e)}`)
      }
    }
    await refreshProjects()
    multiBusy = false
    multi = false
    if (failed.length) toast(failed.join(' · '), 'error')
    if (!jobs.length) return
    if (multiNow) await runBulk(tr('Aplicar «{0}»', draft.name), jobs)
    else toast(tr('Módulos añadidos en {0}: se instalan al pulsar Aplicar en cada uno (o desde el Panel, «Aplicar módulos»).', plural(jobs.length, 'servidor', 'servidores')))
  }
  const secretCount = (m: Module) => (m.variables ?? []).filter((v) => v.type === 'secret' && !v.managed).length
</script>

<div class="bar">
  <button class="btn ghost sm" onclick={() => (ui.recipeId = null)}><ArrowLeft size={15} /> {tr('Plantillas')}</button>
</div>

<div class="top card">
  <div class="name-row">
    <input class="name" bind:value={draft.name} placeholder={tr('Nombre de la plantilla (p. ej. Servidor de copias, Mis apps…)')} />
    {#if draft.id}<button class="btn sm danger" onclick={remove} title={tr('Borra esta plantilla (los servidores en los que se aplicó no cambian)')}><Trash2 size={14} /> {tr('Eliminar plantilla')}</button>{/if}
  </div>
  <textarea class="input notes" rows="2" bind:value={draft.notes} placeholder={tr('Para qué es (opcional)')}></textarea>
  {#if draft.id}
    <div class="deps">
      <span class="muted small">{tr('Aplicada en:')}</span>
      {#each stored?.servers ?? [] as d (d.serverId)}
        <button class="dep" onclick={() => openServerModules(d.serverId)}><ServerIcon size={13} /> {d.serverName}</button>
      {:else}<span class="muted small">{tr('ningún servidor todavía.')}</span>{/each}
      {#if freeServers.length}
        <select class="input" bind:value={deployTo}>
          <option value="">{tr('Aplicar en un servidor…')}</option>
          {#each freeServers as s}<option value={s.id}>{s.name}</option>{/each}
        </select>
        <button class="btn sm" onclick={deploy} disabled={!deployTo} title={tr('Añade sus módulos a ese servidor (no instala nada hasta que pulses Aplicar allí)')}><Plus size={14} /> {tr('Aplicar')}</button>
        {#if freeServers.length > 1}<button class="btn sm ghost" onclick={() => (multi = true)} disabled={bulk.running}><Layers size={14} /> {tr('En varios servidores…')}</button>{/if}
      {/if}
    </div>
  {:else}
    <p class="muted small">{tr('Elige los módulos y sus opciones y pulsa')} <strong>{tr('Guardar')}</strong>{tr('. Después podrás asociarlo a un servidor.')}</p>
  {/if}
</div>

{#if check?.tips?.length}
  <div class="card tips">{#each check.tips as tip}<p><Lightbulb size={15} /> {tip}</p>{/each}</div>
{/if}
{#if check?.general?.length}
  <div class="card warns">{#each check.general as g}<p><TriangleAlert size={15} /> {g}</p>{/each}</div>
{/if}

<h2 class="sec">{tr('Módulos y opciones')} {#if ordered.length}<span class="muted small">{tr('· se instalan en este orden: {0}', ordered.map(moduleName).join(' → '))}</span>{/if}</h2>
{#if !ordered.length}<p class="muted">{tr('Todavía ninguno: márcalos abajo.')}</p>{/if}
<div class="cfgs">
  {#each ordered as mid (mid)}
    {@const m = byId(mid)}
    {@const pm = draft.modules.find((x) => x.id === mid)}
    {@const errs = check?.errors?.[mid] ?? {}}
    {#if m && pm}
      <section class="card cfg" id={'cfg-' + mid} class:bad={Object.keys(errs).length} class:new={toReview.includes(mid)}>
        <button class="cfg-h" onclick={() => (open[mid] = !open[mid])}>
          {#if open[mid]}<ChevronDown size={15} />{:else}<ChevronRight size={15} />{/if}
          <strong>{m.name}</strong>
          {#if Object.keys(errs).length}<span class="bad-t">{tr('{0} por revisar', Object.keys(errs).length)}</span>{:else}<CircleCheck size={14} class="okc" />{/if}
          {#if toReview.includes(mid)}<span class="new-t"><Sparkles size={13} /> {tr('Nuevo: revisa sus opciones')}</span>{/if}
          {#if secretCount(m)}<span class="muted small">{tr('· {0} dato(s) secreto(s): se escriben en cada servidor', secretCount(m))}</span>{/if}
        </button>
        {#if open[mid]}
          <div class="rows">
            {#each (m.variables ?? []).filter((v) => v.type !== 'secret' && !v.managed) as v (v.name)}
              <div class="row" class:bad={!!errs[v.name]}>
                <div class="lbl"><strong>{v.label}</strong>{#if v.help}<small>{v.help}</small>{/if}{#if errs[v.name]}<small class="err">{errs[v.name]}</small>{/if}</div>
                <div class="ctl"><VarField {v} bind:value={pm.values[v.name]} error={errs[v.name]} bare /></div>
              </div>
            {:else}<p class="muted small">{tr('Sin opciones: se instala tal cual.')}</p>{/each}
            {#if toReview.includes(mid)}
              <div class="rev">
                <span class="muted small">{tr('Son los valores predeterminados. Al aplicar la plantilla en un servidor podrás retocarlos otra vez en «Configurar y aplicar…».')}</span>
                <button class="btn sm" onclick={() => reviewed(mid)}><Check size={14} /> {tr('Valores revisados')}</button>
              </div>
            {/if}
          </div>
        {/if}
      </section>
    {/if}
  {/each}
</div>

<h2 class="sec">{tr('Añadir o quitar módulos')} <span class="muted small">{tr('· los que necesitan otros los añaden solos')}</span></h2>
{#each sections as sec (sec.title)}
  <div class="group">{sec.title}</div>
  <div class="grid">
    {#each sec.list as m (m.id)}
      <ModuleCard {m} state={cardState(m)} errors={Object.keys(check?.errors?.[m.id] ?? {}).length} onclick={() => toggle(m)} />
    {/each}
  </div>
{/each}

{#if draft.id}
  <div class="cfg-hist"><ConfigHistory kind="r" id={draft.id} refreshKey={savedKey} {dirty} onrestored={restored} /></div>
{/if}

<!-- Siempre a la vista: estado y botones. Se colorea si hay algo que hacer. -->
<div class="foot" class:dirty={dirty || !draft.id} class:bad={errorCount > 0}>
  <div class="foot-msg">
    {#if errorCount}
      <TriangleAlert size={16} /> <span>{tr('Hay {0} opción(es) con errores: corrígelas para poder guardar.', errorCount)}</span>
    {:else if toReview.length}
      <Sparkles size={16} />
      <span>{tr('Revisa las opciones de:')} {#each toReview as mid, i}{#if i}, {/if}<button class="lnk" onclick={() => goTo(mid)}>{moduleName(mid)}</button>{/each}{#if dirty}{' '}{tr('· y guarda')}{/if}</span>
    {:else if dirty || !draft.id}
      <Save size={16} /> <span>{draft.id ? tr('Tienes cambios sin guardar.') : tr('Plantilla nueva: ponle nombre y guárdala.')}</span>
    {:else}
      <CircleCheck size={16} /> <span>{tr('Todo guardado.')}</span>
    {/if}
  </div>
  <button class="btn" onclick={undo} disabled={saving || !dirty} title={tr('Quita lo que no has guardado y deja la plantilla como estaba')}><Undo2 size={15} /> {tr('Deshacer')}</button>
  <button class="btn primary" onclick={save} disabled={saving || !dirty || !draft.name.trim() || errorCount > 0}><Save size={15} /> {saving ? tr('Guardando…') : dirty || !draft.id ? tr('Guardar') : tr('Guardado')}</button>
</div>

{#if multi}
  <Modal title={tr('Aplicar «{0}» en varios servidores', draft.name)} onclose={() => (multi = false)} width={520}>
    <p class="muted small">{tr('Se añaden sus módulos a cada servidor marcado (los que ya tenga se quedan como están).')}</p>
    <div class="mlist">
      {#each ui.servers as s (s.id)}
        <label class="mrow"><input type="checkbox" bind:checked={multiPick[s.id]} /> <strong>{s.name}</strong> <span class="muted small">{s.user}@{s.host}</span></label>
      {/each}
    </div>
    <label class="mrow now"><input type="checkbox" bind:checked={multiNow} /> {tr('Instalar ahora en cada uno (Aplicar), uno detrás de otro')}</label>
    {#snippet footer()}
      <button class="btn" onclick={() => (multi = false)}>{tr('Cancelar')}</button>
      <button class="btn primary" onclick={deployMany} disabled={!multiSel.length || multiBusy}><Layers size={15} /> {multiNow ? tr('Añadir y aplicar en {0}', plural(multiSel.length, 'servidor', 'servidores')) : tr('Añadir a {0}', plural(multiSel.length, 'servidor', 'servidores'))}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .cfg-hist { margin-top: 18px; }
  .mlist { display: flex; flex-direction: column; gap: 6px; margin: 12px 0; max-height: 40vh; overflow: auto; }
  .mrow { display: flex; gap: 8px; align-items: center; font-size: 13.5px; cursor: pointer; }
  .mrow.now { margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--border-soft); }
  .foot { position: sticky; bottom: -40px; margin: 24px -32px -40px; padding: 12px 32px; display: flex; gap: 10px; align-items: center; background: var(--panel); border-top: 1px solid var(--border); z-index: 5; transition: background .15s; }
  .foot.dirty { background: color-mix(in srgb, var(--accent) 14%, var(--panel)); border-top-color: var(--accent); }
  .foot.bad { background: color-mix(in srgb, var(--danger) 12%, var(--panel)); border-top-color: var(--danger); }
  .foot-msg { flex: 1; display: flex; gap: 8px; align-items: center; font-size: 13.5px; min-width: 0; }
  .foot-msg :global(svg) { flex: none; }
  .foot.dirty .foot-msg :global(svg) { color: var(--accent); }
  .foot.bad .foot-msg :global(svg) { color: var(--danger); }
  .lnk { background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: var(--accent); cursor: pointer; text-decoration: underline; }
  .cfg.new { border-color: var(--accent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent); }
  .new-t { display: inline-flex; gap: 4px; align-items: center; color: var(--accent); font-size: 12.5px; font-weight: 600; }
  .rev { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding-top: 10px; border-top: 1px solid var(--border-soft); flex-wrap: wrap; }
  @media (max-width: 900px) { .foot { margin: 24px -16px -32px; padding: 10px 16px; bottom: -32px; flex-wrap: wrap; } }
  .bar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .top { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
  .name-row { display: flex; gap: 10px; align-items: center; }
  .name-row .name { flex: 1; min-width: 0; }
  .name { font-size: 20px; font-weight: 600; border: 0; border-bottom: 1px solid var(--border); background: none; color: var(--text); padding: 4px 0; outline: none; }
  .name:focus { border-color: var(--accent); }
  .notes { resize: vertical; }
  .deps { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .deps .input { width: auto; min-width: 200px; height: 32px; }
  .dep { display: inline-flex; gap: 5px; align-items: center; background: var(--panel-2); border: 1px solid var(--border-soft); border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12.5px; color: var(--text); cursor: pointer; }
  .dep:hover { border-color: var(--accent); }
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
  .tips { padding: 10px 14px; margin-bottom: 12px; }
  .tips p { display: flex; gap: 8px; align-items: flex-start; margin: 4px 0; font-size: 13px; color: var(--info); }
  .tips :global(svg) { flex: none; margin-top: 2px; }
</style>
