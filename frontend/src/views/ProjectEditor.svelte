<script lang="ts">
  import { untrack } from 'svelte'
  import { ArrowLeft, Save, Eye, Hammer, Download, Trash2, TriangleAlert, ChevronDown, ChevronRight, Package, Lock, LoaderCircle, CircleCheck } from '@lucide/svelte'
  import VarField from '../components/VarField.svelte'
  import SecretField from '../components/SecretField.svelte'
  import RunPanel from '../components/RunPanel.svelte'
  import ProjectSecrets from '../components/ProjectSecrets.svelte'
  import { orderModules, clashesWith, modulePorts } from '../lib/modules'
  import { api, errorText, type Module, type Project, type ProjectCheck } from '../lib/api'
  import {
    ui, toast, refreshProjects, moduleName, timeAgo, startRun, ask, confirmDialog, requestVault,
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
  // Ventanas plegadas: se recuerdan por proyecto y módulo.
  let collapsed = $state<Record<string, boolean>>(Object.fromEntries((initial?.collapsed ?? []).map((m) => [m, true])))
  function toggleCollapsed(mid: string) {
    collapsed[mid] = !collapsed[mid]
    if (!draft.id) return
    const list = Object.keys(collapsed).filter((k) => collapsed[k])
    api.SetProjectCollapsed(draft.id, list).catch(() => { /* no es grave: solo es la vista */ })
    const p = ui.projects.find((x) => x.id === draft.id)
    if (p) p.collapsed = list
  }

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

  const groups = $derived.by(() => {
    const by: Record<string, Module[]> = {}
    for (const m of mods) (by[m.category || 'Otros'] ||= []).push(m)
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b))
  })

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

  async function toggle(e: Event, mid: string) {
    const box = e.currentTarget as HTMLInputElement
    if (selected.has(mid)) {
      const users = requiredBy(mid)
      if (users.length) {
        box.checked = true // la casilla no debe quedarse desmarcada
        return toast(`No se puede quitar: lo necesita ${users.join(', ')}`, 'error')
      }
      if (installed.has(mid)) {
        box.checked = true
        const ok = await confirmDialog({
          title: `Quitar ${moduleName(mid)} del proyecto`,
          message: `Quitarlo NO lo desinstala: ${moduleName(mid)} seguirá instalado y funcionando en el servidor. Draupnode solo dejará de gestionarlo (no lo comprobará ni lo actualizará al aplicar). Si quieres desinstalarlo, hay que hacerlo en el servidor.`,
          confirmLabel: 'Quitar del proyecto',
        })
        if (!ok) return
      }
      draft.modules = draft.modules.filter((x) => x.id !== mid)
      return
    }
    const clash = clashesWith(mid, selected, byId)
    if (clash.length) {
      ;(e.currentTarget as HTMLInputElement).checked = false
      return toast(`${moduleName(mid)} no puede ir con ${clash.map(moduleName).join(', ')}: quita antes ${clash.length > 1 ? 'esos' : 'ese'}`, 'error')
    }
    const added = add(mid).filter((x) => x !== mid)
    if (added.length) toast(`También se añade ${added.map(moduleName).join(', ')} (lo necesita ${moduleName(mid)})`)
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
      toast('Ponle un nombre al proyecto', 'error')
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
      if (!quiet) toast('Proyecto guardado')
      return true
    } catch (e) {
      saveError = errorText(e)
      if (!quiet) toast(saveError, 'error')
      return false
    } finally {
      saving = false
    }
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

  async function remove() {
    const ok = await confirmDialog({
      title: 'Eliminar proyecto',
      message: `¿Eliminar «${draft.name}»? Solo se borra de Draupnode (y sus registros); el servidor no se toca.`,
      confirmLabel: 'Eliminar', danger: true,
    })
    if (!ok) return
    try {
      await api.DeleteProject(draft.id)
      await refreshProjects()
      ui.projectId = null
      toast('Proyecto eliminado')
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

  async function start(dry: boolean) {
    if (!(await ensureSaved())) return
    if (!dry) {
      const ok = await confirmDialog({
        title: `Aplicar en ${server?.name ?? 'el servidor'}`,
        message: `Se instalará y configurará en ${server?.user}@${server?.host}: ${ordered.map(moduleName).join(' → ')}. Lo que ya esté bien no se toca. ¿Seguimos?`,
        confirmLabel: 'Aplicar',
      })
      if (!ok) return
    }
    let secret = '', accept = '', sudo = ''
    for (let i = 0; i < 6; i++) {
      const r = await api.RunProject(draft.id, dry, secret, accept, sudo)
      switch (r.status) {
        case 'started':
          startRun(draft.id, r.runId!, dry)
          return
        case 'needs_secret':
        case 'bad_secret': {
          const isPw = r.secretKind === 'password'
          const v = await ask(isPw ? 'Contraseña del usuario' : 'Contraseña de la clave',
            (r.status === 'bad_secret' ? 'No es correcta. ' : '') + (isPw ? `Contraseña de ${server?.user} en ${server?.name}.` : `La clave SSH de ${server?.name} está protegida.`))
          if (v === null) return
          secret = v
          break
        }
        case 'vault_locked':
          if (!(await requestVault('unlock', r.message || 'La contraseña de este servidor está en la bóveda.'))) return
          break
        case 'vault_missing':
          if (!(await requestVault('create', r.message || 'Las contraseñas de este proyecto se guardan en la bóveda cifrada.'))) return
          break
        case 'unknown_host': {
          const ok = await confirmDialog({
            title: 'Servidor nuevo: confirma su huella',
            message: 'Es la primera vez que te conectas a este servidor. Comprueba que la huella es la suya antes de confiar.',
            detail: `${server?.host}:${server?.port}\n${r.keyType}\n${r.fingerprint}`,
            confirmLabel: 'Confiar y seguir',
          })
          if (!ok) return
          accept = r.fingerprint!
          break
        }
        case 'needs_sudo':
        case 'bad_sudo': {
          const v = await ask('Contraseña de sudo',
            (r.status === 'bad_sudo' ? 'No es correcta. ' : '') + `El usuario ${server?.user} necesita su contraseña para hacerse administrador (sudo). No se guarda.`)
          if (v === null) return
          sudo = v
          break
        }
        default:
          return toast(r.message || 'No se pudo lanzar', 'error')
      }
    }
  }

  function closeRun() {
    if (draft.id) delete ui.runs[draft.id]
  }
</script>

<div class="bar">
  <button class="btn ghost sm" onclick={() => (ui.projectId = null)}><ArrowLeft size={15} /> Proyectos</button>
  <div class="spacer"></div>
  {#if !isNew}
    <span class="save-st">
      {#if saving}<LoaderCircle size={13} class="spin" /> Guardando…
      {:else if dirty && errorCount}<span class="warn"><TriangleAlert size={13} /> No se guarda hasta corregir los campos en rojo</span>
      {:else if saveError}<span class="bad">{saveError}</span>
      {:else if !dirty}<CircleCheck size={13} /> Cambios guardados{/if}
    </span>
  {/if}
</div>

<div class="title-row">
  <input class="name" bind:value={draft.name} placeholder="Nombre del proyecto (p. ej. Servidor web)" disabled={running} />
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

{#if isNew}
  <p class="new-hint muted">Escribe el nombre, elige el servidor y pulsa <strong>Guardar</strong>. Después podrás elegir los módulos.</p>
{/if}

<div class="body" class:locked={isNew} inert={isNew}>
<div class="actions card">
  <div class="act-text">
    {#if !ordered.length}
      <span class="muted">Marca a la izquierda los módulos que quieres instalar.</span>
    {:else if errorCount}
      <span class="warn"><TriangleAlert size={15} /> Hay {errorCount} campo(s) con errores.</span>
    {:else}
      <span class="muted">Orden: {ordered.map(moduleName).join(' → ')}</span>
    {/if}
  </div>
  <div class="act-btns">
    <button class="btn" onclick={exportScript} disabled={saving || running || !ordered.length || !!errorCount}><Download size={15} /> Exportar instalar.sh</button>
    <button class="btn" onclick={() => start(true)} disabled={saving || running || !ordered.length || !!errorCount}><Eye size={15} /> Previsualizar</button>
    {#if needsApply}
      <button class="btn primary" onclick={() => start(false)} disabled={saving || running || !ordered.length || !!errorCount}><Hammer size={15} /> Aplicar</button>
    {:else if stored?.appliedAt}
      <span class="applied"><CircleCheck size={15} /> Aplicado {timeAgo(stored.appliedAt)}, sin cambios desde entonces</span>
    {/if}
  </div>
</div>

{#if run}
  <RunPanel {run} onclose={closeRun} />
{/if}

{#if draft.id}
  <ProjectSecrets projectId={draft.id} refreshKey={stored?.lastRun?.at ?? ''} />
{/if}

{#if check?.warnings?.length}
  <div class="card warns">
    {#each check.warnings as w}<p><TriangleAlert size={15} /> {w}</p>{/each}
    <p class="muted small">Según la última comprobación del servidor. La ejecución vuelve a comprobarlo y se detiene si no se cumple.</p>
  </div>
{/if}
{#if check?.general?.length && draft.modules.length}
  <div class="card warns">{#each check.general as g}<p><TriangleAlert size={15} /> {g}</p>{/each}</div>
{/if}

<div class="cols">
  <aside class="card picker">
    <h3>Módulos</h3>
    <div class="legend">
      <span><i class="dot ok"></i> instalado</span>
      <span><i class="dot new"></i> se instalará al aplicar</span>
      <span><i class="dot req"></i> lo necesita otro</span>
    </div>
    {#each groups as [cat, list]}
      <div class="cat">{cat.replace(/^\d+\s*·\s*/, '')}</div>
      {#each list as m (m.id)}
        {@const users = requiredBy(m.id)}
        {@const isDep = users.length > 0}
        {@const clash = selected.has(m.id) ? [] : clashesWith(m.id, selected, byId)}
        {@const sel = selected.has(m.id)}
        {@const inst = installed.has(m.id)}
        <label class="pick" class:clash={clash.length > 0}
          class:st-ok={sel && inst} class:st-req={sel && !inst && isDep} class:st-new={sel && !inst && !isDep} class:st-left={!sel && inst}>
          <input type="checkbox" checked={selected.has(m.id)} onchange={(e) => toggle(e, m.id)} disabled={running || (isDep && selected.has(m.id)) || clash.length > 0}
            title={isDep && selected.has(m.id) ? `Lo necesita ${users.join(', ')}: desmárcalo antes` : clash.length ? `Choca con ${clash.map(moduleName).join(', ')}` : ''} />
          <div>
            <strong>{m.name}</strong>
            <span>{m.description}</span>
            {#if sel && inst}<em class="ok"><CircleCheck size={11} /> instalado en el servidor</em>
            {:else if sel}<em class="new">se instalará al aplicar</em>
            {:else if inst}<em class="left">sigue instalado en el servidor (ya no lo gestiona este proyecto)</em>{/if}
            {#if isDep && sel}<em class="req"><Lock size={11} /> lo necesita {users.join(', ')}</em>{/if}
            {#if clash.length}<em><Lock size={11} /> choca con {clash.map(moduleName).join(', ')}</em>{/if}
            {#if m.firewallPorts?.length}<em class="ports">abre los puertos {m.firewallPorts.join(', ')} en el Cortafuegos</em>{/if}
            {#if m.firewallPortsFrom?.length}<em class="ports">abre su puerto en el Cortafuegos</em>{/if}
          </div>
        </label>
      {/each}
    {/each}
  </aside>

  <div class="forms">
    {#if !ordered.length}
      <div class="card empty">
        <Package size={30} strokeWidth={1.4} />
        <p class="muted">Marca a la izquierda lo que quieres instalar. Las dependencias se añaden solas.</p>
      </div>
    {/if}
    {#each ordered as mid, i (mid)}
      {@const m = byId(mid)}
      {@const pm = draft.modules.find((x) => x.id === mid)}
      {@const errs = check?.errors[mid] ?? {}}
      {#if m && pm}
        <section class="card mod">
          <button class="mod-head" onclick={() => toggleCollapsed(mid)}>
            {#if collapsed[mid]}<ChevronRight size={16} />{:else}<ChevronDown size={16} />{/if}
            <span class="num">{i + 1}</span>
            <strong>{m.name}</strong>
            {#if Object.keys(errs).length}<span class="badge err">{Object.keys(errs).length} error(es)</span>{/if}
            {#if !m.variables?.length}<span class="muted small">sin opciones</span>{/if}
          </button>
          {#if !collapsed[mid] && m.variables?.length}
            <div class="vars">
              {#each m.variables as v (v.name)}
                {#if v.type === 'secret'}
                  <SecretField {v} projectId={draft.id} error={errs[v.name]} onchange={() => recheck++} />
                {:else}
                  <VarField {v} bind:value={pm.values[v.name]} error={errs[v.name]} />
                {/if}
              {/each}
            </div>
          {/if}
        </section>
      {/if}
    {/each}
  </div>
</div>
</div>

<style>
  .bar { display: flex; align-items: center; gap: 8px; margin: -8px 0 12px; }
  .spacer { flex: 1; }
  .title-row { display: grid; grid-template-columns: 1fr 340px auto; gap: 16px; align-items: end; margin-bottom: 14px; }
  .save-st { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); }
  .save-st .bad { color: var(--danger); }
  .new-hint { margin: -4px 0 14px; font-size: 13.5px; }
  .body.locked { opacity: .45; filter: grayscale(.4); pointer-events: none; user-select: none; }
  .applied { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; color: var(--success); padding: 0 6px; }
  .name { font-size: 22px; font-weight: 600; background: none; border: 0; border-bottom: 1px solid transparent; padding: 4px 0; outline: none; color: var(--text); }
  .name:focus, .name:hover { border-bottom-color: var(--border); }
  .actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; margin-bottom: 14px; flex-wrap: wrap; }
  .act-text { font-size: 13px; min-width: 0; }
  .warn { display: inline-flex; gap: 7px; align-items: center; color: var(--accent); }
  .act-btns { display: flex; gap: 8px; }
  .warns { display: flex; flex-direction: column; gap: 6px; margin: 14px 0; border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); padding: 12px 16px; }
  .warns p { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
  .warns :global(svg) { color: var(--accent); flex: none; margin-top: 2px; }
  .small { font-size: 12px; }
  .cols { display: grid; grid-template-columns: 300px 1fr; gap: 16px; align-items: start; margin-top: 14px; }
  .picker { padding: 14px; display: flex; flex-direction: column; gap: 4px; position: sticky; top: 0; max-height: calc(100vh - 140px); overflow-y: auto; }
  .picker h3 { margin-bottom: 6px; }
  .cat { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 600; margin: 10px 0 4px; }
  .pick { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border-radius: var(--radius-sm); cursor: pointer; border: 1px solid transparent; }
  .pick:hover { background: var(--sidebar-hover); }
  .pick.st-ok { border-color: color-mix(in srgb, var(--success) 55%, transparent); background: var(--success-soft); }
  .pick.st-new { border-color: color-mix(in srgb, var(--info) 55%, transparent); background: var(--info-soft); }
  .pick.st-req { border-color: color-mix(in srgb, var(--warning) 55%, transparent); background: var(--warning-soft); }
  .pick.st-left { border: 1px dashed color-mix(in srgb, var(--success) 50%, transparent); }
  .pick input { accent-color: var(--info); }
  .pick.st-ok input { accent-color: var(--success); }
  .pick.st-req input { accent-color: var(--warning); }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11.5px; color: var(--muted); margin-bottom: 4px; }
  .legend span { display: inline-flex; align-items: center; gap: 5px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
  .dot.ok { background: var(--success); }
  .dot.new { background: var(--info); }
  .dot.req { background: var(--warning); }
  .pick.clash { opacity: .6; cursor: not-allowed; }
  .pick input { margin-top: 3px; }
  .pick div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .pick strong { font-size: 13.5px; }
  .pick span { font-size: 12px; color: var(--muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .pick em { font-style: normal; font-size: 11.5px; color: var(--accent); display: flex; gap: 4px; align-items: center; }
  .pick em.ok, .pick em.left { color: var(--success); }
  .pick em.new { color: var(--info); }
  .pick em.req { color: var(--warning); }
  .pick em.ports { color: var(--muted); }
  .forms { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 40px; text-align: center; color: var(--muted); }
  .mod { padding: 0; }
  .mod-head { display: flex; align-items: center; gap: 10px; width: 100%; padding: 14px 16px; background: none; border: 0; cursor: pointer; color: var(--text); font: inherit; text-align: left; }
  .num { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 600; background: var(--accent-soft); color: var(--accent); }
  .vars { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; padding: 4px 18px 18px; }
  @media (max-width: 1100px) {
    .cols { grid-template-columns: 1fr; }
    .picker { position: static; max-height: none; }
    .title-row { grid-template-columns: 1fr auto; grid-template-areas: "name btn" "srv srv"; align-items: center; }
    .title-row .name { grid-area: name; min-width: 0; }
    .title-row .srv { grid-area: srv; }
    .title-row > .btn { grid-area: btn; }
  }
</style>
