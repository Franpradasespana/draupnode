<script lang="ts">
  import { untrack, tick } from 'svelte'
  import { ArrowLeft, Save, Eye, Hammer, Download, Trash2, TriangleAlert, LoaderCircle, CircleCheck, CircleX, ChevronRight, Server as ServerIcon, Unlink, Pencil, Plus, Search, X, Upload, Undo2 } from '@lucide/svelte'
  import Modal from '../components/Modal.svelte'
  import { moduleIcon } from '../lib/icons'
  import RunPanel from '../components/RunPanel.svelte'
  import ProjectSecrets from '../components/ProjectSecrets.svelte'
  import RunHistory from '../components/RunHistory.svelte'
  import UninstallDialog from '../components/UninstallDialog.svelte'
  import ModuleCard from '../components/ModuleCard.svelte'
  import ModuleDetail from '../components/ModuleDetail.svelte'
  import ApplyWizard from '../components/ApplyWizard.svelte'
  import { orderModules, clashesWith, modulePorts, sameValues, type CardState } from '../lib/modules'
  import { withConnection } from '../lib/connect'
  import { api, errorText, type Module, type Project, type ProjectCheck, type RunStart, type UninstallCheck, type UninstallChoice } from '../lib/api'
  import {
    ui, toast, refreshProjects, moduleName, timeAgo, startRun, confirmDialog, openRecipe,
  } from '../lib/state.svelte'

  // embedded: dentro de la ficha del servidor (pestaña Módulos), sin su propia barra de volver.
  // moduleOpen: avisa a la ficha de que hay un módulo abierto (para no enseñar debajo lo que no es de él).
  let { id, embedded = false, moduleOpen = $bindable(false) }: { id: string; embedded?: boolean; moduleOpen?: boolean } = $props()

  const initial = untrack(() => ui.projects.find((p) => p.id === id))
  let draft = $state<Project>(
    initial
      ? structuredClone($state.snapshot(initial)) as Project
      : { id: '', name: '', serverId: ui.projectServer ?? ui.servers[0]?.id ?? '', modules: [] },
  )
  // Lo que se guarda (nombre, servidor y módulos), para saber si hay cambios.
  const contentKey = (p: Project) => JSON.stringify([p.name.trim(), p.serverId, p.modules])
  let savedKey = $state(initial ? contentKey(initial) : '')
  let saveError = $state('')
  // «Cambios guardados» (en verde, unos segundos) solo cuando se guarda algo
  // que has cambiado tú: escribir o marcar algo (eventos input/change que suben
  // hasta aquí) o los botones que cambian módulos. Lo que se normaliza solo al
  // abrir no cuenta.
  let touched = false
  let justSaved = $state(false)
  let savedTimer: ReturnType<typeof setTimeout> | undefined
  function touch() { touched = true }
  let check = $state<ProjectCheck | null>(null)
  let saving = $state(false)
  const mods = $derived(ui.modules?.modules ?? [])
  const byId = (mid: string) => mods.find((m) => m.id === mid)
  const selected = $derived(new Set(draft.modules.map((m) => m.id)))
  const dirty = $derived(contentKey(draft) !== savedKey)
  const isNew = $derived(!draft.id)
  // Datos guardados (fechas de modificación y de la última aplicación).
  const stored = $derived(ui.projects.find((p) => p.id === draft.id))
  const needsApply = $derived(dirty || !stored?.appliedAt || new Date(stored.updatedAt ?? 0) > new Date(stored.appliedAt))
  const run = $derived(draft.id ? ui.runs[draft.id] : undefined)
  const running = $derived(!!run && !run.done)
  const server = $derived(ui.servers.find((s) => s.id === draft.serverId))
  // Orden de ejecución calculado aquí mismo (igual que Catalog.Resolve en Go:
  // ids ordenados y, antes de cada uno, sus dependencias), para que una ventana
  // nueva aparezca ya en su sitio sin esperar al backend.
  const ordered = $derived(orderModules(selected, byId).filter((mid) => selected.has(mid)))
  const errorCount = $derived(Object.values(check?.errors ?? {}).reduce((n, e) => n + Object.keys(e).length, 0))
  // Lista legible de los errores: módulo, opción y qué le pasa.
  const errorList = $derived(
    Object.entries(check?.errors ?? {}).flatMap(([mid, errs]) =>
      Object.entries(errs).map(([v, msg]) => ({
        mid, module: moduleName(mid),
        label: byId(mid)?.variables?.find((x) => x.name === v)?.label ?? v,
        msg: String(msg),
      })),
    ),
  )



  function defaults(m: Module) {
    return Object.fromEntries((m.variables ?? []).map((v) => [v.name, $state.snapshot(v.default)]))
  }

  // Puertos que un módulo necesita abiertos: se añaden a (o quitan de) la
  // lista del Cortafuegos, para que lo que se ve sea lo que se abre.
  const FW_VAR = 'firewall_tcp_ports'
  function fwList(): string[] | null {
    const fw = draft.modules.find((x) => x.id === 'firewall')
    if (!fw) return null
    if (!Array.isArray(fw.values[FW_VAR])) fw.values[FW_VAR] = []
    return fw.values[FW_VAR] as string[]
  }
  // Se vigila qué puertos necesita cada módulo (fijos o de una variable, como
  // el puerto de SSH): al marcar/desmarcar un módulo o cambiar ese valor, la
  // lista del Cortafuegos se ajusta sola. El 22 no se quita nunca.
  let lastPorts: Record<string, string[]> | null = null
  let hadFw = false
  $effect(() => {
    const now: Record<string, string[]> = {}
    for (const x of draft.modules) now[x.id] = modulePorts(byId(x.id), x.values)
    const hasFw = draft.modules.some((x) => x.id === 'firewall')
    untrack(() => {
      const before = lastPorts
      lastPorts = now
      const wasFw = hadFw
      hadFw = hasFw
      if (before === null || !hasFw) return // al abrir el editor no se cambia nada
      const list = fwList()!
      const needed = new Set(Object.values(now).flat())
      const old = new Set(wasFw ? Object.values(before).flat() : [])
      for (const p of needed) if (!old.has(p) && !list.includes(p)) list.push(p)
      const drop = [...old].filter((p) => !needed.has(p) && p !== '22')
      if (drop.length) draft.modules.find((x) => x.id === 'firewall')!.values[FW_VAR] = list.filter((p) => !drop.includes(String(p)))
    })
  })

  // Al marcar un módulo se añaden también sus dependencias.
  function add(mid: string, added: string[] = []) {
    const m = byId(mid)
    if (!m || selected.has(mid)) return added
    for (const d of m.depends ?? []) add(d, added)
    if (!draft.modules.some((x) => x.id === mid)) {
      draft.modules.push({ id: mid, values: defaults(m) })
      added.push(mid)
    }
    return added
  }

  // Instalados en el servidor por este proyecto (aunque ya no estén marcados).
  const installed = $derived(new Set(stored?.installedModules ?? []))

  // Módulos que no se pueden desmarcar porque los necesita otro marcado.
  const requiredBy = (mid: string) => draft.modules.filter((x) => byId(x.id)?.depends?.includes(mid)).map((x) => moduleName(x.id))

  // Pulsar una tarjeta del catálogo: marca o desmarca un módulo que aún no
  // está instalado (los instalados se gestionan en su propia página).
  function toggleCard(mid: string) {
    touched = true
    if (selected.has(mid)) {
      const users = requiredBy(mid)
      if (users.length) return toast(`No se puede quitar: lo necesita ${users.join(', ')}`, 'error')
      draft.modules = draft.modules.filter((x) => x.id !== mid)
      return
    }
    const clash = clashesWith(mid, selected, byId)
    if (clash.length) return toast(`${moduleName(mid)} no puede ir con ${clash.map(moduleName).join(', ')}`, 'error')
    const added = add(mid).filter((x) => x !== mid)
    if (added.length) toast(`También se añade ${added.map(moduleName).join(', ')} (lo necesita ${moduleName(mid)})`)
  }

  // ---- estados de las tarjetas ----
  const pending = $derived(ordered.filter((mid) => !installed.has(mid)))
  // Instalados (marcados o ya fuera del proyecto), en el orden del catálogo.
  const installedList = $derived(mods.filter((m) => installed.has(m.id)))
  function cardState(m: Module): CardState {
    if (installed.has(m.id)) return selected.has(m.id) ? 'installed' : 'left'
    if (selected.has(m.id)) return requiredBy(m.id).length ? 'required' : 'pending'
    return clashesWith(m.id, selected, byId).length ? 'clash' : 'none'
  }
  function cardNote(m: Module): string {
    const st = cardState(m)
    if (st === 'required') return `La necesita ${requiredBy(m.id).join(', ')}`
    if (st === 'clash') return `No puede ir con ${clashesWith(m.id, selected, byId).map(moduleName).join(', ')}`
    if (st === 'left') return 'Instalado, pero Draupnode ya no lo gestiona'
    return ''
  }
  // ---- catálogo «Añadir módulos» (ventana aparte, con buscador) ----
  let catalogOpen = $state(false)
  let query = $state('')
  const byName = (x: Module, y: Module) => x.name.localeCompare(y.name, 'es')
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const sections = $derived.by((): { title: string; list: Module[] }[] => {
    const q = norm(query.trim())
    const by: Record<string, Module[]> = {}
    for (const m of mods) {
      if (q && !norm(`${m.name} ${m.description ?? ''} ${m.id}`).includes(q)) continue
      ;(by[m.category || 'Otros'] ||= []).push(m)
    }
    return Object.entries(by).sort(([x], [y]) => x.localeCompare(y))
      .map(([cat, list]) => ({ title: cat.replace(/^\d+\s*·\s*/, ''), list: list.sort(byName) }))
  })
  function catalogClick(m: Module) {
    if (installed.has(m.id)) {
      catalogOpen = false
      openMod = m.id
      return
    }
    toggleCard(m.id)
  }

  // Instalados cuya configuración ha cambiado desde la última aplicación.
  const changedInstalled = $derived(
    draft.modules.filter((pm) => installed.has(pm.id) && stored?.installedValues?.[pm.id] && !sameValues(pm.values, stored.installedValues[pm.id])).map((pm) => pm.id),
  )

  // ---- lista «Módulos de esta plantilla»: los suyos en orden de instalación y, al final, los que siguen
  // instalados pero ya no gestiona. Estado de cada uno en palabras.
  const rows = $derived([...ordered, ...installedList.filter((m) => !selected.has(m.id)).map((m) => m.id)])
  function rowState(mid: string): { text: string; kind: 'ok' | 'info' | 'warn' | 'bad' | 'muted' } {
    const errs = Object.keys(check?.errors[mid] ?? {}).length
    if (errs && selected.has(mid)) return { text: errs === 1 ? 'Falta un dato' : `Faltan ${errs} datos`, kind: 'bad' }
    if (installed.has(mid) && !selected.has(mid)) return { text: 'Instalado, sin gestionar', kind: 'muted' }
    if (installed.has(mid)) return changedInstalled.includes(mid) ? { text: 'Cambios sin aplicar', kind: 'warn' } : { text: 'Instalado', kind: 'ok' }
    const by = requiredBy(mid)
    return { text: by.length ? `Se instalará · lo necesita ${by.join(', ')}` : 'Se instalará', kind: 'info' }
  }
  // De qué plantilla vino cada módulo ('' = añadido en el servidor).
  const originOf = (mid: string) => recipeName(draft.modules.find((x) => x.id === mid)?.from)
  const leftList = $derived(installedList.filter((m) => !selected.has(m.id)))
  const lastFailed = $derived(!!stored?.lastRun && !stored.lastRun.ok && !stored.lastRun.check && !stored.lastRun.canceled)
  const status = $derived.by((): { text: string; kind: 'ok' | 'warn' | 'bad' } => {
    if (lastFailed) return { text: 'Falló la última vez', kind: 'bad' }
    if (!stored?.appliedAt) return { text: 'Sin aplicar', kind: 'warn' }
    if (needsApply) return { text: 'Cambios sin aplicar', kind: 'warn' }
    return { text: `Aplicada ${timeAgo(stored.appliedAt)}`, kind: 'ok' }
  })

  // ---- página de un módulo ----
  let openMod = $state<string | null>(null)
  const openModule = $derived(openMod ? byId(openMod) : undefined)
  $effect(() => { moduleOpen = !!openModule })

  // ---- asistente ----
  let wizard = $state(false)
  async function openWizard() {
    if (!(await ensureSaved())) return
    wizard = true
  }
  async function wizardRun(dry: boolean) {
    wizard = false
    await start(dry, true)
  }

  async function removeFromProject(mid: string) {
    const ok = await confirmDialog({
      title: `Dejar de gestionar ${moduleName(mid)}`,
      message: `${moduleName(mid)} seguirá instalado y funcionando en el servidor; Draupnode solo dejará de gestionarlo. Podrás volver a añadirlo o desinstalarlo desde su página.`,
      confirmLabel: 'Dejar de gestionarlo',
    })
    if (ok) { touched = true; draft.modules = draft.modules.filter((x) => x.id !== mid) }
  }
  function readd(mid: string) {
    touched = true
    const m = byId(mid)
    if (!m || selected.has(mid)) return
    for (const d of m.depends ?? []) add(d)
    draft.modules.push({ id: mid, values: structuredClone($state.snapshot(stored?.installedValues?.[mid] ?? defaults(m))) as Record<string, unknown> })
  }
  async function uninstallOne(mid: string) {
    const c = await askUninstall([mid], false)
    if (c?.action === 'uninstall') await uninstall([mid], c.purge)
  }

  // Validación en vivo (con un pequeño retardo mientras se escribe).
  // recheck: vuelve a comprobar aunque el borrador no cambie (p. ej. al
  // guardar un dato secreto, que va a la bóveda y no al proyecto).
  let recheck = $state(0)
  $effect(() => {
    void recheck
    const snap = JSON.stringify(draft)
    const t = setTimeout(async () => {
      try {
        check = await api.CheckProject(JSON.parse(snap))
      } catch {
        /* se reintenta en el siguiente cambio */
      }
    }, 300)
    return () => clearTimeout(t)
  })

  async function save(quiet = false): Promise<boolean> {
    if (!draft.name.trim()) {
      toast('Ponle un nombre', 'error')
      return false
    }
    saving = true
    const snap = $state.snapshot(draft) as Project
    try {
      const saved = await api.SaveProject(snap)
      const wasNew = !snap.id
      // No se sustituye el borrador: se puede seguir escribiendo mientras se guarda.
      draft.id = saved.id
      savedKey = contentKey(snap)
      saveError = ''
      if (touched) {
        touched = false
        justSaved = true
        clearTimeout(savedTimer)
        savedTimer = setTimeout(() => (justSaved = false), 5000)
      }
      await refreshProjects()
      if (wasNew) {
        draft.modules = saved.modules
        savedKey = contentKey(saved)
        ui.projectId = saved.id
      }
      if (!quiet) toast('Guardado')
      return true
    } catch (e) {
      saveError = errorText(e)
      if (!quiet) toast(saveError, 'error')
      return false
    } finally {
      saving = false
    }
  }

  // El backend ha cambiado el proyecto (p. ej. «Guardar también en otro
  // servidor»): el borrador se sustituye por lo guardado.
  function reloadDraft() {
    const s = ui.projects.find((p) => p.id === draft.id)
    if (!s) return
    draft = structuredClone($state.snapshot(s)) as Project
    savedKey = contentKey(s)
    recheck++
  }

  // Una vez creado, cada cambio se guarda solo (con un pequeño retardo).
  $effect(() => {
    if (isNew || !dirty || running || !draft.name.trim()) return
    if (errorCount) {
      saveError = ''
      return
    }
    contentKey(draft) // depende de cualquier cambio
    const t = setTimeout(() => save(true), 700)
    return () => clearTimeout(t)
  })

  // Simular, Aplicar y Exportar guardan antes lo pendiente.
  async function ensureSaved(): Promise<boolean> {
    if (!dirty) return true
    return save(true)
  }

  // ---- plantillas: aplicar una (añade sus módulos) o guardar módulos en una ----
  const recipeName = (rid?: string) => ui.recipes.find((r) => r.id === rid)?.name ?? ''
  const appliedTemplates = $derived((draft.templates ?? []).filter((t) => recipeName(t)))
  let applyPick = $state('')
  async function applyTemplate() {
    if (!applyPick || !(await ensureSaved())) return
    try {
      const r = await api.ApplyTemplate(draft.serverId, applyPick)
      await refreshProjects()
      reloadDraft()
      applyPick = ''
      toast(`Plantilla «${r.recipe.name}» aplicada. ${r.notes.join(' ')}`)
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  // Ventana «Guardar en una plantilla»: qué módulos y a cuál (o una nueva).
  let saveTpl = $state<{ ids: string[]; target: string; name: string; busy: boolean } | null>(null)
  function openSaveTpl() {
    // Por defecto, la plantilla de la que vienen más módulos.
    const counts: Record<string, number> = {}
    for (const m of draft.modules) if (m.from && recipeName(m.from)) counts[m.from] = (counts[m.from] ?? 0) + 1
    const best = Object.entries(counts).sort((x, y) => y[1] - x[1])[0]?.[0] ?? ''
    saveTpl = { ids: draft.modules.map((m) => m.id), target: best, name: '', busy: false }
  }
  async function doSaveTpl() {
    if (!saveTpl || !(await ensureSaved())) return
    saveTpl.busy = true
    try {
      const r = await api.ModulesToTemplate(draft.serverId, saveTpl.ids, saveTpl.target, saveTpl.name)
      await refreshProjects()
      reloadDraft()
      saveTpl = null
      toast(r.notes.join(' '))
    } catch (e) {
      toast(errorText(e), 'error')
      if (saveTpl) saveTpl.busy = false
    }
  }

  async function exportScript() {
    if (!(await ensureSaved())) return
    try {
      const path = await api.ExportProject(draft.id)
      if (path) toast(`Guardado en ${path}. En el servidor: sudo bash ${path.split(/[\\/]/).pop()}`)
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function start(dry: boolean, confirmed = false) {
    if (!(await ensureSaved())) return
    if (!dry && !confirmed) {
      const ok = await confirmDialog({
        title: `Aplicar en ${server?.name ?? 'el servidor'}`,
        message: `Se instalará y configurará en ${server?.user}@${server?.host}: ${ordered.map(moduleName).join(' → ')}. Lo que ya esté bien no se toca. ¿Seguimos?`,
        confirmLabel: 'Aplicar',
      })
      if (!ok) return
    }
    await launch((s, a, u) => api.RunProject(draft.id, dry, s, a, u), (runId) => startRun(draft.id, runId, dry))
  }

  // ---- desinstalar ----
  let uninstallPrompt = $state<{ check: UninstallCheck; allowRemove: boolean; resolve: (c: UninstallChoice) => void } | null>(null)
  async function askUninstall(mods: string[], allowRemove: boolean): Promise<UninstallChoice> {
    const check = await api.CheckUninstall(draft.id, mods)
    return new Promise((resolve) => {
      uninstallPrompt = { check, allowRemove, resolve: (c) => { uninstallPrompt = null; resolve(c) } }
    })
  }
  async function uninstall(mods: string[], purge: boolean) {
    if (!(await ensureSaved())) return
    await launch((s, a, u) => api.UninstallModules(draft.id, mods, purge, s, a, u), (runId) => startRun(draft.id, runId, false, mods))
  }
  // Al terminar bien una desinstalación, esos módulos salen del borrador
  // (el backend ya los quitó del proyecto; así no se vuelven a guardar).
  let handledRun = ''
  $effect(() => {
    const r = run
    if (!r?.done || !r.summary?.ok || !r.uninstall?.length || handledRun === r.runId) return
    handledRun = r.runId
    untrack(() => {
      draft.modules = draft.modules.filter((m) => !r.uninstall!.includes(m.id))
      savedKey = contentKey(draft)
      if (openMod && r.uninstall!.includes(openMod)) openMod = null
    })
  })

  // Lanza una ejecución pidiendo lo que haga falta (contraseña, huella, sudo, bóveda).
  async function launch(call: (secret: string, accept: string, sudo: string) => Promise<RunStart>, started: (runId: string) => void) {
    const r = await withConnection(server, call)
    if (!r) return
    if (r.status === 'started') started(r.runId!)
    else toast(r.message || 'No se pudo lanzar', 'error')
  }

  // Al pulsar Aplicar o Simular, la vista baja al recuadro «Aplicación en curso».
  let runEl = $state<HTMLDivElement | undefined>()
  let shownRun = ''
  $effect(() => {
    const r = run
    if (!r || r.done || r.runId === shownRun) return
    shownRun = r.runId
    tick().then(() => runEl?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  })

  function closeRun() {
    if (draft.id) delete ui.runs[draft.id]
  }
</script>

<div class="pe" oninput={touch} onchange={touch}>
<div class="bar" class:emb={embedded}>
  {#if openModule}
    <button class="btn ghost sm" onclick={() => (openMod = null)}><ArrowLeft size={15} /> Módulos de {server?.name ?? 'este servidor'}</button>
  {:else if !embedded}
    <button class="btn ghost sm" onclick={() => (ui.projectId = null)}><ArrowLeft size={15} /> {server?.name ?? 'Servidor'}</button>
  {/if}
  <div class="spacer"></div>
  {#if !isNew}
    <span class="save-st">
      {#if saving}<LoaderCircle size={13} class="spin" /> Guardando…
      {:else if dirty && errorCount}<span class="warn"><TriangleAlert size={13} /> No se guarda hasta corregir las opciones en rojo</span>
      {:else if saveError}<span class="bad">{saveError}</span>
      {:else if !dirty && justSaved}<span class="ok"><CircleCheck size={13} /> Cambios guardados</span>{/if}
    </span>
  {/if}
</div>

{#if run}
  <div class="run-anchor" bind:this={runEl}><RunPanel {run} onclose={closeRun} /></div>
{/if}

{#if openModule && stored}
  <nav class="crumbs" aria-label="Dónde estás">
    <ServerIcon size={14} />
    <button class="crumb" onclick={() => (openMod = null)} title="Módulos del servidor">{server?.name ?? 'Sin servidor'} · Módulos</button>
    <ChevronRight size={14} class="sep" />
    <strong>{openModule.name}</strong>
  </nav>
  <ModuleDetail m={openModule} bind:modules={draft.modules} project={stored} errors={check?.errors[openModule.id] ?? {}}
    requiredBy={requiredBy(openModule.id)} {running} onsecret={() => recheck++}
    onapply={() => (pending.length ? openWizard() : start(false))}
    onremove={() => removeFromProject(openModule.id)} onreadd={() => readd(openModule.id)} onuninstall={() => uninstallOne(openModule.id)} onreload={reloadDraft} />
{:else}
  {#if isNew}
  <div class="title-row">
    <input class="name" bind:value={draft.name} placeholder="Nombre (p. ej. Servidor web)" disabled={running} />
    <label class="field srv">
      <span>Servidor</span>
      <select class="input" bind:value={draft.serverId} disabled={running}>
        {#each ui.servers as s}<option value={s.id}>{s.name} — {s.user}@{s.host}</option>{/each}
      </select>
    </label>
    <button class="btn primary" onclick={() => save()} disabled={saving || !draft.name.trim() || !draft.serverId}>
      <Save size={15} /> {saving ? 'Guardando…' : 'Guardar'}
    </button>
  </div>
  {/if}

  {#if isNew}
    <p class="new-hint muted">Escribe el nombre, elige el servidor y pulsa <strong>Guardar</strong>. Después podrás elegir los módulos.</p>
  {/if}

  <div class="body" class:locked={isNew} inert={isNew}>
    {#if !isNew}
      <header class="top">
        <div class="ident">
          <div class="title">
            {#if embedded}<h2 class="h1s">Módulos del servidor</h2>{:else}<h1>Módulos de {server?.name ?? draft.name}</h1>{/if}
            <span class="pill {status.kind}">{#if status.kind === 'ok'}<CircleCheck size={12} />{/if}{status.text}</span>
          </div>
          <div class="sub muted">Lo que Draupnode instala y gestiona en {server?.name ?? 'este servidor'}. Las plantillas solo sirven para añadir varios de una vez.</div>
        </div>
        <div class="act-btns">
          <button class="btn" onclick={() => start(true)} disabled={saving || running || !ordered.length || !!errorCount} title="Muestra qué cambiaría en el servidor sin tocar nada"><Eye size={15} /> Simular</button>
          {#if pending.length}
            <button class="btn primary" onclick={openWizard} disabled={saving || running || !!errorCount || !needsApply}><Hammer size={15} /> Configurar y aplicar…</button>
          {:else}
            <button class="btn primary" onclick={() => start(false)} disabled={saving || running || !!errorCount || !ordered.length || !needsApply}><Hammer size={15} /> Aplicar</button>
          {/if}
        </div>
      </header>

      <div class="two">
        <section class="card block">
          <h2>Plantillas</h2>
          <div class="row">
            <select class="input tsel" bind:value={applyPick} disabled={running || !ui.recipes.length}>
              <option value="">{ui.recipes.length ? 'Elige una plantilla…' : 'Aún no hay plantillas'}</option>
              {#each ui.recipes as r (r.id)}<option value={r.id}>{r.name} · {r.modules.length} módulos</option>{/each}
            </select>
            <button class="btn sm primary" onclick={applyTemplate} disabled={running || !applyPick}><Plus size={14} /> Aplicar plantilla</button>
          </div>
          <p class="muted small">Añade sus módulos a este servidor (los que ya tiene se quedan como están). No instala nada hasta que pulses Aplicar.</p>
          <div class="row">
            <span class="muted small">Aplicadas:</span>
            {#each appliedTemplates as t (t)}
              <button class="chip" onclick={() => openRecipe(t)} title="Editar la plantilla «{recipeName(t)}» (no cambia este servidor)"><Pencil size={11} /> {recipeName(t)}</button>
            {:else}<span class="muted small">ninguna</span>{/each}
          </div>
          <div class="row">
            <button class="btn sm" onclick={openSaveTpl} disabled={running || !draft.modules.length} title="Llevar módulos de este servidor a una plantilla existente o a una nueva"><Upload size={14} /> Guardar módulos en una plantilla…</button>
            <button class="btn sm" onclick={exportScript} disabled={saving || running || !ordered.length || !!errorCount} title="Un único instalar.sh para ejecutarlo tú en el servidor"><Download size={14} /> Exportar instalar.sh</button>
          </div>
        </section>
        {#if draft.id}
          <div class="sec-col"><ProjectSecrets projectId={draft.id} title="Contraseñas" refreshKey={stored?.lastRun?.at ?? ''} /></div>
        {/if}
      </div>

      <section class="card plan" class:done={!needsApply && !!stored?.appliedAt && !errorList.length}>
        <h2>Qué pasará al aplicar</h2>
        {#if errorList.length}
          <div class="errs">
            <p><strong>Antes hay que corregir esto:</strong></p>
            {#each errorList as e}
              <p><CircleX size={15} /> <span><strong>{e.module}</strong> · {e.label}: {e.msg}</span>
                <button class="btn sm" onclick={() => (openMod = e.mid)}>Corregir</button></p>
            {/each}
          </div>
        {/if}
        {#if !ordered.length && !leftList.length}
          <p class="muted">Nada todavía: pulsa <strong>«Añadir módulos»</strong> para elegir qué instalar en {server?.name ?? 'el servidor'}.</p>
        {:else if !needsApply && stored?.appliedAt}
          <p class="okline"><CircleCheck size={16} /> Todo aplicado {timeAgo(stored.appliedAt)}. No hay nada pendiente.</p>
        {:else}
          <ul class="plan-list">
            {#if pending.length}<li><span class="tag info">Instalar</span> {pending.map(moduleName).join(' → ')}</li>{/if}
            {#if changedInstalled.length}<li><span class="tag warn">Cambiar la configuración de</span> {changedInstalled.map(moduleName).join(', ')}</li>{/if}
            {#if !pending.length && !changedInstalled.length}<li><span class="tag warn">Volver a aplicar</span> {ordered.map(moduleName).join(' → ')} <span class="muted small">(la plantilla ha cambiado; lo que ya esté bien no se toca)</span></li>{/if}
            {#if leftList.length}<li><span class="tag">Se quedan como están</span> {leftList.map((m) => m.name).join(', ')} <span class="muted small">(instalados, pero ya no los gestiona; para quitarlos, ábrelos y «Desinstalar»)</span></li>{/if}
          </ul>
        {/if}
        {#if lastFailed && stored?.lastRun}
          <p class="bad-t small"><CircleX size={13} /> La última aplicación falló ({timeAgo(stored.lastRun.at)}){stored.lastRun.error ? ': ' + stored.lastRun.error : ''}. Mira su registro abajo, en el historial.</p>
        {/if}
        {#each [...(check?.general ?? []), ...(wizard ? [] : check?.warnings ?? [])] as w}<p class="warn-l small"><TriangleAlert size={13} /> {w}</p>{/each}
      </section>
    {/if}

    <section class="card block">
      <div class="h2row">
        <h2>Módulos {#if rows.length}<span class="muted small">· {rows.length}</span>{/if}</h2>
        <button class="btn sm primary" onclick={() => { query = ''; catalogOpen = true }} disabled={running}><Plus size={14} /> Añadir módulos</button>
      </div>
      {#if !rows.length}
        <p class="muted">Ninguno todavía.</p>
      {:else}
        <ul class="mods">
          {#each rows as mid, i (mid)}
            {@const m = byId(mid)}
            {@const st = rowState(mid)}
            {@const Icon = moduleIcon(mid)}
            <li class="mrow" class:left={st.kind === 'muted'}>
              <button class="mmain" onclick={() => (openMod = mid)} title="Ver y configurar {m?.name ?? mid}">
                <span class="num">{selected.has(mid) ? i + 1 : '–'}</span>
                <span class="ic"><Icon size={18} /></span>
                <span class="txt"><strong>{m?.name ?? mid}</strong><span class="muted desc">{#if originOf(mid)}<span class="from">de «{originOf(mid)}»</span> · {/if}{m?.description ?? ''}</span></span>
                <span class="tag {st.kind}">{st.text}</span>
                <ChevronRight size={16} class="chev" />
              </button>
              {#if selected.has(mid) && !installed.has(mid) && !requiredBy(mid).length}
                <button class="btn sm ghost icon" title="Quitar de la plantilla (aún no está instalado)" onclick={() => toggleCard(mid)} disabled={running}><X size={14} /></button>
              {:else}
                <span class="icon-sp"></span>
              {/if}
            </li>
          {/each}
        </ul>
        <p class="muted small">Se instalan en este orden. Pulsa uno para ver sus opciones, sus datos o desinstalarlo.</p>
      {/if}
    </section>


    {#if draft.id && draft.serverId}
      <div class="hist-gap"><RunHistory serverId={draft.serverId} projectId={draft.id} refreshKey={stored?.lastRun?.at ?? ''} /></div>
    {/if}




  </div>
{/if}

{#if saveTpl}
  <Modal title="Guardar módulos en una plantilla" width={620} onclose={() => (saveTpl = null)}>
    <p class="muted small">Copia los módulos que marques, con sus opciones (sin contraseñas), a una plantilla. Este servidor no cambia. Los demás servidores en los que se aplicó esa plantilla tampoco: les llegará si la vuelves a aplicar.</p>
    <div class="chk-list">
      {#each draft.modules as m (m.id)}
        <label class="chk"><input type="checkbox" checked={saveTpl.ids.includes(m.id)} onchange={(e) => { if (!saveTpl) return; saveTpl.ids = (e.currentTarget as HTMLInputElement).checked ? [...saveTpl.ids, m.id] : saveTpl.ids.filter((x) => x !== m.id) }} />
          <strong>{moduleName(m.id)}</strong>{#if originOf(m.id)} <span class="muted small">de «{originOf(m.id)}»</span>{/if}</label>
      {/each}
    </div>
    <div class="dest">
      <label class="chk"><input type="radio" name="dest" checked={saveTpl.target !== ''} disabled={!ui.recipes.length} onchange={() => saveTpl && (saveTpl.target = saveTpl.target || ui.recipes[0]?.id || '')} /> En una plantilla existente</label>
      {#if saveTpl.target !== ''}
        <select class="input" bind:value={saveTpl.target}>{#each ui.recipes as r (r.id)}<option value={r.id}>{r.name}</option>{/each}</select>
        <span class="muted small">Los módulos marcados sustituyen a los que ya tenga con el mismo nombre; los demás de la plantilla se quedan.</span>
      {/if}
      <label class="chk"><input type="radio" name="dest" checked={saveTpl.target === ''} onchange={() => saveTpl && (saveTpl.target = '')} /> En una plantilla nueva</label>
      {#if saveTpl.target === ''}<input class="input" placeholder="Nombre de la plantilla" bind:value={saveTpl.name} />{/if}
    </div>
    {#snippet footer()}
      <button class="btn" onclick={() => (saveTpl = null)}>Cancelar</button>
      <button class="btn primary" onclick={doSaveTpl} disabled={saveTpl!.busy || !saveTpl!.ids.length || (saveTpl!.target === '' && !saveTpl!.name.trim())}><Upload size={15} /> {saveTpl!.busy ? 'Guardando…' : 'Guardar en la plantilla'}</button>
    {/snippet}
  </Modal>
{/if}

{#if catalogOpen}
  <Modal title="Añadir módulos a «{draft.name}»" width={980} onclose={() => (catalogOpen = false)}>
    <div class="cat-search">
      <Search size={15} />
      <!-- svelte-ignore a11y_autofocus -->
      <input class="input" placeholder="Buscar (p. ej. copias, vpn, postgres…)" bind:value={query} autofocus />
    </div>
    <p class="muted small">Pulsa uno para añadirlo (sus dependencias se añaden solas) o para quitarlo si aún no está instalado. No se instala nada hasta que pulses Aplicar.</p>
    {#each sections as sec (sec.title)}
      <div class="cat">{sec.title}</div>
      <div class="grid">
        {#each sec.list as m (m.id)}
          <ModuleCard {m} state={cardState(m)} note={cardNote(m)} errors={0} onclick={() => catalogClick(m)} disabled={running && !installed.has(m.id)} />
        {/each}
      </div>
    {:else}
      <p class="muted">No hay ningún módulo con «{query}».</p>
    {/each}
    {#snippet footer()}
      <span class="muted small">{pending.length ? `${pending.length} para instalar` : 'Nada nuevo para instalar'}</span>
      <button class="btn primary" onclick={() => (catalogOpen = false)}>Hecho</button>
    {/snippet}
  </Modal>
{/if}

{#if wizard && draft.id}
  <ApplyWizard bind:modules={draft.modules}
    steps={pending.map(byId).filter((m): m is Module => !!m?.variables?.some((v) => !v.managed))}
    install={pending.map(byId).filter((m): m is Module => !!m)}
    changed={changedInstalled.map(byId).filter((m): m is Module => !!m)}
    errors={check?.errors ?? {}} warnings={[...(check?.general ?? []), ...(check?.warnings ?? [])]}
    projectId={draft.id} where={`${server?.name ?? ''} › ${draft.name}`} busy={saving || running}
    onsecret={() => recheck++} onpreview={() => wizardRun(true)} onapply={() => wizardRun(false)} onclose={() => (wizard = false)} />
{/if}

{#if uninstallPrompt}
  <UninstallDialog check={uninstallPrompt.check} allowRemove={uninstallPrompt.allowRemove} done={uninstallPrompt.resolve} />
{/if}
  {#if !isNew && needsApply && ordered.length && !running}
    <div class="apply-bar" role="region" aria-label="Cambios sin aplicar">
      <div class="ab-text">
        {#if errorList.length}<span class="bad-t"><CircleX size={15} /> {errorList.length === 1 ? 'Falta 1 dato' : `Faltan ${errorList.length} datos`} antes de aplicar</span>
        {:else}<Hammer size={15} />
          <span><strong>Cambios sin aplicar</strong>{#if pending.length}{' · '}instalar {pending.map(moduleName).join(', ')}{/if}{#if changedInstalled.length}{' · '}configuración de {changedInstalled.map(moduleName).join(', ')}{/if}{#if !pending.length && !changedInstalled.length}{' · '}volver a aplicar{/if}</span>
        {/if}
      </div>
      <div class="ab-btns">
        <button class="btn" onclick={() => start(true)} disabled={saving || !!errorCount} title="Muestra qué cambiaría en el servidor sin tocar nada"><Eye size={15} /> Simular</button>
        {#if pending.length}
          <button class="btn primary" onclick={openWizard} disabled={saving || !!errorCount}><Hammer size={15} /> Configurar y aplicar…</button>
        {:else}
          <button class="btn primary" onclick={() => start(false)} disabled={saving || !!errorCount}><Hammer size={15} /> Aplicar</button>
        {/if}
      </div>
    </div>
  {/if}

</div>

<style>
  .bar { display: flex; align-items: center; gap: 8px; margin: -8px 0 8px; }
  .spacer { flex: 1; }
  .save-st { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); }
  .save-st .bad { color: var(--danger); }
  .run-anchor { scroll-margin-top: 12px; }
  .apply-bar {
    position: sticky; bottom: -40px; z-index: 5; margin: 18px -32px -40px; padding: 12px 32px;
    display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
    background: var(--panel); border-top: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
    box-shadow: 0 -6px 18px rgba(0, 0, 0, .10);
  }
  .ab-text { display: flex; align-items: center; gap: 8px; font-size: 13.5px; min-width: 0; flex: 1; }
  .ab-text > :global(svg) { color: var(--accent); flex: none; }
  .ab-text span { overflow: hidden; text-overflow: ellipsis; }
  .ab-btns { display: flex; gap: 8px; flex: none; }
  .save-st .ok { display: inline-flex; align-items: center; gap: 6px; color: var(--success); }
  .warn { display: inline-flex; gap: 7px; align-items: center; color: var(--warning); }
  .crumbs { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 13px; color: var(--muted); padding: 8px 12px; border-radius: var(--radius-sm); background: var(--panel-2); border: 1px solid var(--border-soft); }
  .crumbs strong { color: var(--text); }
  .crumb { background: none; border: 0; padding: 0; font: inherit; color: var(--accent); cursor: pointer; }
  .crumb:hover { text-decoration: underline; }
  .crumbs :global(.sep) { opacity: .6; }
  .mono { font-family: var(--mono); }
  .small { font-size: 12px; }
  .small { font-size: 12px; }
  .title-row { display: grid; grid-template-columns: 1fr 340px auto; gap: 16px; align-items: end; margin-bottom: 14px; }
  .name { font-size: 22px; font-weight: 600; background: none; border: 0; border-bottom: 1px solid transparent; padding: 4px 0; outline: none; color: var(--text); }
  .name:focus, .name:hover { border-bottom-color: var(--border); }
  .new-hint { margin: -4px 0 14px; font-size: 13.5px; }
  .body.locked { opacity: .45; filter: grayscale(.4); pointer-events: none; user-select: none; }
  .act-btns { display: flex; gap: 8px; flex-wrap: wrap; }
  .errs { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--danger) 45%, var(--border)); border-radius: var(--radius-sm); }
  .errs p { display: flex; gap: 8px; align-items: center; font-size: 13px; margin: 0; }
  .errs p span { flex: 1; }
  .errs :global(svg) { color: var(--danger); flex: none; }
  .cat { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 600; margin: 14px 0 8px; }
  .hist-gap { margin: 0 0 14px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; align-items: stretch; }
  .two > .block { margin: 0; }
  .sec-col { display: flex; }
  .sec-col :global(.sec) { margin: 0; flex: 1; }
  .h1s { margin: 0; font-size: 18px; }
  .tsel { width: auto; min-width: 220px; height: 32px; flex: 1; }
  .chip { display: inline-flex; align-items: center; gap: 5px; font: inherit; font-size: 12px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); cursor: pointer; }
  .chip:hover { border-color: var(--muted); }
  .from { color: var(--info); }
  .chk-list { display: flex; flex-direction: column; gap: 6px; max-height: 280px; overflow: auto; padding: 6px 2px; }
  .chk { display: flex; gap: 8px; align-items: center; font-size: 13.5px; cursor: pointer; }
  .dest { display: flex; flex-direction: column; gap: 8px; padding-top: 6px; border-top: 1px solid var(--border-soft); }
  .bar.emb:not(:has(button)) { display: flex; justify-content: flex-end; }
  .difflist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; }
  @media (max-width: 1100px) { .two { grid-template-columns: 1fr; } }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
  .ident { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .title h1 { margin: 0; }
  .sub { display: flex; gap: 6px; flex-wrap: wrap; align-items: baseline; font-size: 13px; }
  .pill { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 999px; font-size: 12px; background: var(--sidebar-hover); color: var(--muted); }
  .pill.ok { background: var(--success-soft); color: var(--success); }
  .pill.warn { background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning); }
  .pill.bad { background: var(--danger-soft); color: var(--danger); }
  .block { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
  .block h2, .plan h2 { font-size: 15px; margin: 0; }
  .h2row { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .plan { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; border-color: color-mix(in srgb, var(--info) 40%, var(--border)); }
  .plan.done { border-color: color-mix(in srgb, var(--success) 40%, var(--border)); }
  .plan-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; font-size: 13.5px; }
  .okline { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--success); font-size: 13.5px; }
  .bad-t { color: var(--danger); display: flex; gap: 6px; align-items: center; margin: 0; }
  .warn-l { color: var(--warning); display: flex; gap: 6px; align-items: flex-start; margin: 0; }
  .tag { display: inline-block; font-size: 11.5px; padding: 2px 8px; border-radius: 999px; background: var(--sidebar-hover); color: var(--muted); white-space: nowrap; margin-right: 4px; }
  .tag.ok { background: var(--success-soft); color: var(--success); }
  .tag.info { background: color-mix(in srgb, var(--info) 14%, transparent); color: var(--info); }
  .tag.warn { background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning); }
  .tag.bad { background: var(--danger-soft); color: var(--danger); }
  .mods { list-style: none; margin: 0; padding: 0; }
  .mrow { display: flex; align-items: center; gap: 4px; border-top: 1px solid var(--border-soft); }
  .mrow:first-child { border-top: 0; }
  .mrow.left { opacity: .7; }
  .mmain { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 9px 6px; background: none; border: 0; border-radius: var(--radius-sm); font: inherit; color: inherit; text-align: left; cursor: pointer; }
  .mmain:hover { background: var(--panel-2); }
  .mmain :global(.chev) { color: var(--muted); flex: none; }
  .num { width: 18px; text-align: right; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; flex: none; }
  .ic { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; background: var(--panel-2); color: var(--accent); flex: none; }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; font-size: 13.5px; }
  .desc { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .icon-sp { width: 34px; flex: none; }
  .cat-search { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .cat-search .input { flex: 1; }
  .crumbs { margin-bottom: 14px; width: fit-content; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
  .empty { font-size: 13.5px; }
  @media (max-width: 1100px) {
    .title-row { grid-template-columns: 1fr auto; grid-template-areas: "name btn" "srv srv"; align-items: center; }
    .title-row .name { grid-area: name; min-width: 0; }
    .title-row .srv { grid-area: srv; }
    .title-row > .btn { grid-area: btn; }
  }
</style>
