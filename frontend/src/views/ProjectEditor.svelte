<script lang="ts">
  import { untrack } from 'svelte'
  import { ArrowLeft, Save, Eye, Hammer, Download, Trash2, TriangleAlert, LoaderCircle, CircleCheck, CircleX, ChevronRight, Server as ServerIcon, ArrowDownUp, Unlink, Pencil } from '@lucide/svelte'
  import RunPanel from '../components/RunPanel.svelte'
  import ProjectSecrets from '../components/ProjectSecrets.svelte'
  import RunHistory from '../components/RunHistory.svelte'
  import UninstallDialog from '../components/UninstallDialog.svelte'
  import ModuleCard from '../components/ModuleCard.svelte'
  import ModuleDetail from '../components/ModuleDetail.svelte'
  import ApplyWizard from '../components/ApplyWizard.svelte'
  import { orderModules, clashesWith, modulePorts, sameValues, type CardState } from '../lib/modules'
  import { withConnection } from '../lib/connect'
  import { api, errorText, type Module, type Project, type RecipeDiff, type ProjectCheck, type RunStart, type UninstallCheck, type UninstallChoice } from '../lib/api'
  import {
    ui, toast, refreshProjects, moduleName, timeAgo, startRun, confirmDialog, openRecipe,
  } from '../lib/state.svelte'

  let { id }: { id: string } = $props()

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
  const available = $derived(mods.filter((m) => !installed.has(m.id)))
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
  // Orden de las tarjetas: por categoría (todo junto) o primero los
  // instalados y luego el resto, cada parte en orden alfabético. Se recuerda.
  const SORT_KEY = 'draupnode.moduleSort'
  let sortMode = $state<'category' | 'installed'>((() => {
    try { return localStorage.getItem(SORT_KEY) === 'installed' ? 'installed' : 'category' } catch { return 'category' }
  })())
  function toggleSort() {
    sortMode = sortMode === 'category' ? 'installed' : 'category'
    try { localStorage.setItem(SORT_KEY, sortMode) } catch { /* sin almacenamiento */ }
  }
  const byName = (x: Module, y: Module) => x.name.localeCompare(y.name, 'es')
  const sections = $derived.by((): { title: string; list: Module[]; empty: string }[] => {
    if (sortMode === 'installed') {
      return [
        { title: `Instalados en ${server?.name ?? 'el servidor'}`, list: [...installedList].sort(byName), empty: 'Todavía no hay nada instalado con esta plantilla.' },
        { title: 'Sin instalar', list: [...available].sort(byName), empty: 'Ya están todos instalados.' },
      ]
    }
    const by: Record<string, Module[]> = {}
    for (const m of mods) (by[m.category || 'Otros'] ||= []).push(m)
    return Object.entries(by).sort(([x], [y]) => x.localeCompare(y))
      .map(([cat, list]) => ({ title: cat.replace(/^\d+\s*·\s*/, ''), list: list.sort(byName), empty: '' }))
  })

  // Instalados cuya configuración ha cambiado desde la última aplicación.
  const changedInstalled = $derived(
    draft.modules.filter((pm) => installed.has(pm.id) && stored?.installedValues?.[pm.id] && !sameValues(pm.values, stored.installedValues[pm.id])).map((pm) => pm.id),
  )

  // ---- página de un módulo ----
  let openMod = $state<string | null>(null)
  const openModule = $derived(openMod ? byId(openMod) : undefined)

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
    if (ok) draft.modules = draft.modules.filter((x) => x.id !== mid)
  }
  function readd(mid: string) {
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

  // Previsualizar, Aplicar y Exportar guardan antes lo pendiente.
  async function ensureSaved(): Promise<boolean> {
    if (!dirty) return true
    return save(true)
  }

  // ---- receta de la que sale ----
  const recipe = $derived(ui.recipes.find((r) => r.id === draft.recipeId))
  let diff = $state<RecipeDiff | null>(null)
  $effect(() => {
    void stored?.updatedAt
    void recipe?.updatedAt
    if (draft.recipeId && draft.id) api.ProjectRecipeDiff(draft.id).then((d) => (diff = d)).catch(() => {})
  })
  const diffText = $derived.by(() => {
    if (!diff) return ''
    const parts: string[] = []
    if (diff.added.length) parts.push('añade ' + diff.added.map(moduleName).join(', '))
    if (diff.removed.length) parts.push('quita ' + diff.removed.map(moduleName).join(', '))
    const ch = Object.keys(diff.changed)
    if (ch.length) parts.push('opciones propias en ' + ch.map(moduleName).join(', '))
    return parts.join(' · ')
  })
  async function pushToRecipe() {
    const ok = await confirmDialog({
      title: 'Llevar a la plantilla',
      message: `Lo que este servidor tiene distinto (${diffText}) pasa a la plantilla «${recipe?.name}». Los demás servidores con esta plantilla lo recibirán (sin aplicarlo todavía) y conservarán lo suyo.`,
      confirmLabel: 'Llevar a la plantilla',
    })
    if (!ok) return
    try {
      await api.PushToRecipe(draft.id)
      await refreshProjects()
      reloadDraft()
      toast('Plantilla actualizada')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  async function resetToRecipe() {
    const ok = await confirmDialog({
      title: 'Volver a la plantilla',
      message: `Se deshace lo propio de este servidor (${diffText}) y queda igual que la plantilla. No desinstala nada: lo instalado no cambia hasta que apliques.`,
      confirmLabel: 'Volver a la plantilla', danger: true,
    })
    if (!ok) return
    try {
      await api.ResetToRecipe(draft.id)
      await refreshProjects()
      reloadDraft()
      toast('Igual que la plantilla')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function remove() {
    const ok = await confirmDialog({
      title: draft.recipeId ? 'Desasociar la plantilla del servidor' : 'Eliminar',
      message: draft.recipeId
        ? `¿Desasociar «${draft.name}» de ${server?.name}? NO desinstala nada: lo instalado sigue funcionando en el servidor (para quitarlo, desinstala antes sus módulos). Draupnode deja de gestionarlo y borra sus registros y sus contraseñas guardadas. La plantilla se conserva y puedes volver a asociarla.`
        : `¿Eliminar «${draft.name}»? Solo se borra de Draupnode (y sus registros); el servidor no se toca.`,
      confirmLabel: draft.recipeId ? 'Desasociar' : 'Eliminar', danger: true,
    })
    if (!ok) return
    try {
      await api.DeleteProject(draft.id)
      await refreshProjects()
      ui.projectId = null
      toast(draft.recipeId ? 'Plantilla desasociada del servidor' : 'Eliminado')
    } catch (e) {
      toast(errorText(e), 'error')
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

  function closeRun() {
    if (draft.id) delete ui.runs[draft.id]
  }
</script>

<div class="bar">
  {#if openModule}
    <button class="btn ghost sm" onclick={() => (openMod = null)}><ArrowLeft size={15} /> {draft.name || 'Plantilla'}</button>
  {:else}
    <button class="btn ghost sm" onclick={() => (ui.projectId = null)}><ArrowLeft size={15} /> {server?.name ?? 'Servidor'}</button>
  {/if}
  <div class="spacer"></div>
  {#if !isNew}
    <span class="save-st">
      {#if saving}<LoaderCircle size={13} class="spin" /> Guardando…
      {:else if dirty && errorCount}<span class="warn"><TriangleAlert size={13} /> No se guarda hasta corregir las opciones en rojo</span>
      {:else if saveError}<span class="bad">{saveError}</span>
      {:else if !dirty}<CircleCheck size={13} /> Cambios guardados{/if}
    </span>
  {/if}
</div>

<!-- Siempre a la vista: en qué servidor y proyecto estás; en la misma fila,
     si sale de un proyecto (receta), cómo está respecto a él y sus botones. -->
<div class="head-row">
<nav class="crumbs" aria-label="Dónde estás">
  <ServerIcon size={14} />
  <button class="crumb" onclick={() => (ui.projectId = null)} title="Ficha del servidor">{server?.name ?? 'Sin servidor'}</button>
  {#if server}<span class="muted mono small">{server.user}@{server.host}</span>{/if}
  <ChevronRight size={14} class="sep" />
  {#if openModule}
    <button class="crumb" onclick={() => (openMod = null)}>{draft.name || 'Nueva'}</button>
    <ChevronRight size={14} class="sep" />
    <strong>{openModule.name}</strong>
  {:else}
    <strong>{draft.name || 'Nueva'}</strong>
  {/if}
</nav>
{#if draft.recipeId && !openModule}
  {#if diffText}
    <span class="pill warn">Distinto de la plantilla: {diffText}</span>
    <button class="btn sm" onclick={pushToRecipe} disabled={running || dirty} title="Lo propio de este servidor pasa a la plantilla (y a los demás servidores que la usan). No instala nada.">Llevar a la plantilla</button>
    <button class="btn sm" onclick={resetToRecipe} disabled={running || dirty} title="Quita lo propio de este servidor y lo deja igual que la plantilla (no desinstala nada)">Volver a la plantilla</button>
  {:else}<span class="pill ok">Igual que la plantilla</span>{/if}
  <div class="spacer"></div>
  <button class="btn sm ghost" onclick={() => openRecipe(draft.recipeId!)} title="La plantilla, para todos los servidores que la usan"><Pencil size={14} /> Editar plantilla</button>
  <button class="btn sm danger" onclick={remove} disabled={running} title="Lo quita de Draupnode; lo instalado en el servidor no se toca"><Unlink size={14} /> Desasociar la plantilla del servidor</button>
{/if}
</div>

{#if run}
  <RunPanel {run} onclose={closeRun} />
{/if}

{#if openModule && stored}
  <ModuleDetail m={openModule} bind:modules={draft.modules} project={stored} errors={check?.errors[openModule.id] ?? {}}
    requiredBy={requiredBy(openModule.id)} {running} onsecret={() => recheck++}
    onapply={() => (pending.length ? openWizard() : start(false))}
    onremove={() => removeFromProject(openModule.id)} onreadd={() => readd(openModule.id)} onuninstall={() => uninstallOne(openModule.id)} onreload={reloadDraft} />
{:else}
  {#if !draft.recipeId}
  <div class="title-row">
    <input class="name" bind:value={draft.name} placeholder="Nombre (p. ej. Servidor web)" disabled={running} />
    <label class="field srv">
      <span>Servidor</span>
      <select class="input" bind:value={draft.serverId} disabled={running}>
        {#each ui.servers as s}<option value={s.id}>{s.name} — {s.user}@{s.host}</option>{/each}
      </select>
    </label>
    {#if isNew}
      <button class="btn primary" onclick={() => save()} disabled={saving || !draft.name.trim() || !draft.serverId}>
        <Save size={15} /> {saving ? 'Guardando…' : 'Guardar'}
      </button>
    {:else}
      <button class="btn danger" onclick={remove} disabled={running}><Trash2 size={15} /> Eliminar</button>
    {/if}
  </div>
  {/if}

  {#if isNew}
    <p class="new-hint muted">Escribe el nombre, elige el servidor y pulsa <strong>Guardar</strong>. Después podrás elegir los módulos.</p>
  {/if}

  <div class="body" class:locked={isNew} inert={isNew}>
    <div class="actions card">
      <div class="act-text">
        {#if pending.length}
          <strong>{pending.length} módulo{pending.length > 1 ? 's' : ''} para instalar:</strong> <span class="muted">{pending.map(moduleName).join(' → ')}</span>
        {:else if changedInstalled.length}
          <strong>Configuración cambiada sin aplicar:</strong> <span class="muted">{changedInstalled.map(moduleName).join(', ')}</span>
        {:else if stored?.appliedAt && !needsApply}
          <span class="applied"><CircleCheck size={15} /> Todo aplicado {timeAgo(stored.appliedAt)}</span>
        {:else if !ordered.length}
          <span class="muted">Elige abajo lo que quieres instalar en {server?.name ?? 'el servidor'}.</span>
        {:else}
          <span class="muted">Cambios sin aplicar.</span>
        {/if}
      </div>
      <div class="act-btns">
        <button class="btn" onclick={exportScript} disabled={saving || running || !ordered.length || !!errorCount}><Download size={15} /> Exportar instalar.sh</button>
        <button class="btn" onclick={() => start(true)} disabled={saving || running || !ordered.length || !!errorCount}><Eye size={15} /> Previsualizar</button>
        {#if needsApply && ordered.length}
          {#if pending.length}
            <button class="btn primary" onclick={openWizard} disabled={saving || running || !!errorCount}><Hammer size={15} /> Configurar y aplicar…</button>
          {:else}
            <button class="btn primary" onclick={() => start(false)} disabled={saving || running || !!errorCount}><Hammer size={15} /> Aplicar cambios</button>
          {/if}
        {/if}
      </div>
    </div>

    {#if errorList.length}
      <div class="card errs">
        <p><strong>Corrige esto para poder previsualizar y aplicar:</strong></p>
        {#each errorList as e}
          <p><CircleX size={15} /> <span><strong>{e.module}</strong> · {e.label}: {e.msg}</span>
            <button class="btn sm" onclick={() => (openMod = e.mid)}>Corregir</button></p>
        {/each}
      </div>
    {/if}
    {#if check?.warnings?.length && !wizard}
      <div class="card warns">
        {#each check.warnings as w}<p><TriangleAlert size={15} /> {w}</p>{/each}
      </div>
    {/if}
    {#if check?.general?.length && draft.modules.length}
      <div class="card warns">{#each check.general as g}<p><TriangleAlert size={15} /> {g}</p>{/each}</div>
    {/if}

    {#if draft.id}
      <ProjectSecrets projectId={draft.id} refreshKey={stored?.lastRun?.at ?? ''} />
    {/if}

    <section class="sec">
      <div class="sec-h">
        <h3>Módulos <span class="muted small">· pulsa uno instalado para verlo y configurarlo; uno sin instalar, para marcarlo</span></h3>
        <button class="btn sm" onclick={toggleSort} title={sortMode === 'category' ? 'Primero los instalados, en orden alfabético' : 'Agrupados por categoría'}>
          <ArrowDownUp size={14} /> {sortMode === 'category' ? 'Instalados' : 'Por categoría'}
        </button>
      </div>
      {#each sections as sec (sec.title)}
        <div class="cat">{sec.title}</div>
        {#if sec.list.length}
          <div class="grid">
            {#each sec.list as m (m.id)}
              <ModuleCard {m} state={cardState(m)} note={cardNote(m)} errors={selected.has(m.id) ? Object.keys(check?.errors[m.id] ?? {}).length : 0}
                onclick={() => (installed.has(m.id) ? (openMod = m.id) : toggleCard(m.id))} disabled={running && !installed.has(m.id)} />
            {/each}
          </div>
        {:else}
          <p class="muted empty">{sec.empty}</p>
        {/if}
      {/each}
    </section>

    {#if draft.id && draft.serverId}
      <RunHistory serverId={draft.serverId} projectId={draft.id} refreshKey={stored?.lastRun?.at ?? ''} />
    {/if}
  </div>
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

<style>
  .bar { display: flex; align-items: center; gap: 8px; margin: -8px 0 8px; }
  .spacer { flex: 1; }
  .save-st { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); }
  .save-st .bad { color: var(--danger); }
  .warn { display: inline-flex; gap: 7px; align-items: center; color: var(--warning); }
  .head-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .head-row .spacer { flex: 1; }
  .head-row .pill { display: inline-flex; padding: 3px 9px; border-radius: 999px; font-size: 12px; }
  .head-row .pill.ok { background: var(--success-soft); color: var(--success); }
  .head-row .pill.warn { background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning); }
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
  .actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; margin-bottom: 14px; flex-wrap: wrap; position: sticky; top: 0; z-index: 2; }
  .act-text { font-size: 13.5px; min-width: 0; flex: 1; }
  .act-btns { display: flex; gap: 8px; flex-wrap: wrap; }
  .applied { display: inline-flex; align-items: center; gap: 7px; color: var(--success); }
  .warns { display: flex; flex-direction: column; gap: 6px; margin: 0 0 14px; border-color: color-mix(in srgb, var(--warning) 45%, var(--border)); padding: 12px 16px; }
  .errs { display: flex; flex-direction: column; gap: 6px; margin: 0 0 14px; border-color: color-mix(in srgb, var(--danger) 45%, var(--border)); padding: 12px 16px; }
  .errs p { display: flex; gap: 8px; align-items: center; font-size: 13px; margin: 0; }
  .errs p span { flex: 1; }
  .errs :global(svg) { color: var(--danger); flex: none; }
  .warns p { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; margin: 0; }
  .warns :global(svg) { color: var(--warning); flex: none; margin-top: 2px; }
  .sec { margin-top: 22px; }
  .sec-h { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .sec h3 { margin: 0; font-size: 15px; }
  .cat { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 600; margin: 14px 0 8px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
  .empty { font-size: 13.5px; }
  @media (max-width: 1100px) {
    .title-row { grid-template-columns: 1fr auto; grid-template-areas: "name btn" "srv srv"; align-items: center; }
    .title-row .name { grid-area: name; min-width: 0; }
    .title-row .srv { grid-area: srv; }
    .title-row > .btn { grid-area: btn; }
  }
</style>
