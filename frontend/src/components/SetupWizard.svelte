<script lang="ts">
  // Asistente «¿Qué quieres montar?»: eliges objetivos (una web, tu nube,
  // VPN…), propone los módulos (con lo básico de cualquier servidor) y crea
  // una plantilla; si eliges un servidor, se la aplica y, si quieres, la
  // instala ya (con su barra de progreso).
  import { Globe, Rocket, Cloud, KeyRound, Image, Film, Shield, FileText, GitBranch, Activity, Boxes, Check, TriangleAlert, Sparkles } from '@lucide/svelte'
  import { untrack } from 'svelte'
  import Modal from './Modal.svelte'
  import { api, errorText, type Module } from '../lib/api'
  import { ui, toast, refreshProjects, openRecipe, moduleName } from '../lib/state.svelte'
  import { goals, plan, BASICS } from '../lib/goals'
  import { runBulk } from '../lib/bulk.svelte'
  import { t } from '../lib/i18n.svelte'

  let { onclose, serverId = '' }: { onclose: () => void; serverId?: string } = $props()

  const ICONS: Record<string, typeof Globe> = { globe: Globe, rocket: Rocket, cloud: Cloud, key: KeyRound, image: Image, film: Film, shield: Shield, file: FileText, git: GitBranch, activity: Activity, boxes: Boxes }
  const mods = $derived(ui.modules?.modules ?? [])
  const byId = (id: string) => mods.find((m) => m.id === id)

  let step = $state(1)
  let picked = $state<string[]>([])
  let basics = $state<string[]>([...BASICS])
  let removed = $state<string[]>([])
  let name = $state('')
  let target = $state(untrack(() => serverId))
  let installNow = $state(true)
  let busy = $state(false)

  const p = $derived(plan(picked, basics, byId))
  const final = $derived(p.ids.filter((id) => !removed.includes(id)))
  const server = $derived(ui.servers.find((s) => s.id === target))
  const ram = $derived(Number(server?.lastCheck?.facts?.mem_kb ?? 0) / 1024)

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  }
  function defaults(m: Module) {
    return Object.fromEntries((m.variables ?? []).filter((v) => v.type !== 'secret').map((v) => [v.name, JSON.parse(JSON.stringify(v.default ?? null))]))
  }
  function next() {
    if (step === 1 && !name) name = goals().filter((g) => picked.includes(g.id)).map((g) => g.title).join(' + ').slice(0, 60) || t('Mi servidor')
    step++
  }

  async function finish() {
    busy = true
    try {
      // Lo que se quitó a mano no puede dejar a otro sin lo que necesita.
      const keep = final.filter((id) => byId(id))
      for (const id of keep) for (const d of byId(id)?.depends ?? []) if (!keep.includes(d)) keep.unshift(d)
      const r = await api.SaveRecipe({ id: '', name: name.trim(), notes: t('Creada con el asistente.'), modules: keep.map((id) => ({ id, values: defaults(byId(id)!) })) })
      await refreshProjects()
      if (!target) {
        toast(t('Plantilla «{0}» creada: revisa sus opciones y aplícala en un servidor.', r.name))
        onclose()
        openRecipe(r.id)
        return
      }
      const res = await api.ApplyTemplate(target, r.id)
      await refreshProjects()
      onclose()
      if (installNow) await runBulk(t('Instalar «{0}»', r.name), [{ serverId: target, projectId: res.project.id, kind: 'apply' }])
      else toast(t('Módulos añadidos a {0}: revísalos y pulsa Aplicar.', server?.name))
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      busy = false
    }
  }
</script>

<Modal title={t('¿Qué quieres montar?')} {onclose} width={760} height={640}>
  <div class="steps">
    {#each [t('Qué quieres'), t('Módulos'), t('Dónde')] as s, i}<span class:on={step === i + 1} class:done={step > i + 1}>{i + 1} · {s}</span>{/each}
  </div>

  {#if step === 1}
    <p class="muted small">{t('Marca lo que quieras tener. Draupnode elige los módulos (y lo que necesitan); en el siguiente paso puedes quitar o añadir.')}</p>
    <div class="goals">
      {#each goals() as g (g.id)}
        {@const Icon = ICONS[g.icon]}
        <button class="goal" class:on={picked.includes(g.id)} onclick={() => (picked = toggle(picked, g.id))} aria-pressed={picked.includes(g.id)}>
          <span class="gi"><Icon size={18} /></span>
          <span class="gt"><strong>{g.title}</strong><small>{g.text}</small></span>
          {#if picked.includes(g.id)}<Check size={16} class="tick" />{/if}
        </button>
      {/each}
    </div>
  {:else if step === 2}
    <p class="muted small">{t('Se instalan en este orden. Desmarca lo que no quieras.')}</p>
    <ul class="plan">
      {#each p.ids as id (id)}
        {@const m = byId(id)}
        <li>
          <label><input type="checkbox" checked={!removed.includes(id)} onchange={() => (removed = toggle(removed, id))} />
            <strong>{moduleName(id)}</strong>{#if BASICS.includes(id)} <span class="tag">{t('básico')}</span>{/if}</label>
          <small class="muted">{m?.description}</small>
        </li>
      {/each}
    </ul>
    <div class="extra">
      <span class="muted small">{t('Lo básico de cualquier servidor:')}</span>
      {#each BASICS as id}<label class="chip"><input type="checkbox" checked={basics.includes(id)} onchange={() => (basics = toggle(basics, id))} /> {moduleName(id)}</label>{/each}
    </div>
    {#each p.dropped as d}<p class="warn"><TriangleAlert size={14} /> {t('{0} no puede ir con {1}: se deja fuera.', moduleName(d.id), moduleName(d.because))}</p>{/each}
    {#if p.ramMb}<p class="muted small">{t('Necesita un servidor con al menos {0} MB de RAM.', p.ramMb)}</p>{/if}
  {:else}
    <label class="field"><span>{t('Nombre de la plantilla')}</span><input class="input" bind:value={name} /></label>
    <label class="field"><span>{t('Servidor')}</span>
      <select class="input" bind:value={target}>
        <option value="">{t('Ninguno todavía (solo crear la plantilla)')}</option>
        {#each ui.servers as s (s.id)}<option value={s.id}>{s.name} · {s.host}</option>{/each}
      </select>
    </label>
    {#if target}
      <label class="chk"><input type="checkbox" bind:checked={installNow} /> {t('Instalar ahora (Aplicar), con su barra de progreso')}</label>
      {#if ram && p.ramMb && ram < p.ramMb * 0.95}<p class="warn"><TriangleAlert size={14} /> {t('{0} tiene {1} MB de RAM y esto pide {2} MB: puede quedarse corto.', server?.name, Math.round(ram), p.ramMb)}</p>{/if}
    {/if}
    <p class="muted small">{t('Se crea la plantilla «{0}» con {1} módulos. Sus opciones llevan los valores por defecto: puedes cambiarlas antes o después de aplicar.', name, final.length)}</p>
    {#if !ui.servers.length}<p class="muted small">{t('¿Aún no tienes servidor? En «Servidores» puedes darlo de alta o crearlo en la nube (Hetzner o DigitalOcean).')}</p>{/if}
  {/if}

  {#snippet footer()}
    {#if step > 1}<button class="btn" onclick={() => step--} disabled={busy}>{t('Anterior')}</button>{/if}
    <span class="grow"></span>
    {#if step < 3}
      <button class="btn primary" onclick={next} disabled={step === 1 ? !picked.length : !final.length}>{t('Siguiente')}</button>
    {:else}
      <button class="btn primary" onclick={finish} disabled={busy || !name.trim() || !final.length}><Sparkles size={15} /> {target ? (installNow ? t('Crear e instalar') : t('Crear y añadir al servidor')) : t('Crear la plantilla')}</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .steps { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
  .steps span { font-size: 12.5px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border-soft); color: var(--muted); }
  .steps span.on { border-color: var(--accent); color: var(--text); font-weight: 600; }
  .steps span.done { color: var(--success); }
  .goals { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .goal { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--panel-2); color: var(--text); font: inherit; text-align: left; cursor: pointer; position: relative; }
  .goal:hover { border-color: var(--muted); }
  .goal.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .gi { color: var(--accent); padding-top: 2px; }
  .gt { display: flex; flex-direction: column; gap: 2px; padding-right: 18px; }
  .gt small { color: var(--muted); font-size: 12.5px; }
  .goal :global(.tick) { position: absolute; top: 10px; right: 10px; color: var(--accent); }
  .plan { list-style: none; margin: 10px 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .plan li { display: flex; flex-direction: column; gap: 2px; }
  .plan label { display: flex; gap: 8px; align-items: center; font-size: 13.5px; cursor: pointer; }
  .plan small { padding-left: 24px; font-size: 12px; }
  .tag { font-size: 11px; padding: 1px 6px; border-radius: 999px; background: var(--panel-2); color: var(--muted); }
  .extra { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; padding-top: 10px; border-top: 1px solid var(--border-soft); }
  .chip { display: inline-flex; gap: 5px; align-items: center; font-size: 12.5px; cursor: pointer; }
  .warn { display: flex; gap: 6px; align-items: center; color: var(--warning); font-size: 13px; margin: 8px 0 0; }
  .field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; margin-bottom: 12px; }
  .field > span { font-weight: 600; }
  .chk { display: flex; gap: 8px; align-items: center; font-size: 13.5px; margin-bottom: 10px; cursor: pointer; }
  .small { font-size: 12.5px; }
  .grow { flex: 1; }
  @media (max-width: 700px) { .goals { grid-template-columns: 1fr; } }
</style>
