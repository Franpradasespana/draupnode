<script lang="ts">
  // Editor de módulos propios: crearlos (vacíos o copiando uno incluido),
  // editar sus ficheros con resaltado, comprobarlos al guardar y borrarlos.
  import { onMount } from 'svelte'
  import { Plus, Save, Trash2, FolderOpen, FileCode, FilePlus, CircleCheck, TriangleAlert, CircleX, Puzzle, Upload, Download } from '@lucide/svelte'
  import ModuleImportDialog from '../components/ModuleImportDialog.svelte'
  import CodeEditor from '../components/CodeEditor.svelte'
  import Modal from '../components/Modal.svelte'
  import { api, errorText, type ModuleImportReport, type UserModule } from '../lib/api'
  import { ui, toast, confirmDialog, ask, refreshModules } from '../lib/state.svelte'

  let list = $state<UserModule[]>([])
  let cur = $state<UserModule | null>(null)
  let file = $state('')
  let text = $state('')
  let saved = $state('')
  let saving = $state(false)
  let creating = $state<{ id: string; from: string } | null>(null)
  const dirty = $derived(text !== saved)
  const builtins = $derived((ui.modules?.modules ?? []).filter((m) => m.source === 'builtin').sort((a, b) => a.name.localeCompare(b.name, 'es')))

  onMount(load)
  async function load(select?: string) {
    list = await api.ListUserModules()
    const id = select ?? cur?.id ?? list[0]?.id
    const m = list.find((x) => x.id === id)
    if (m) await pick(m, select ? 'module.yaml' : file)
    else cur = null
  }

  async function guard(): Promise<boolean> {
    if (!dirty) return true
    return confirmDialog({ title: 'Cambios sin guardar', message: `«${file}» tiene cambios sin guardar. ¿Descartarlos?`, confirmLabel: 'Descartar', danger: true })
  }

  async function pick(m: UserModule, f = 'module.yaml') {
    if (cur && (cur.id !== m.id || f !== file) && !(await guard())) return
    text = saved
    cur = m
    await openFile(m.files.includes(f) ? f : m.files[0] ?? 'module.yaml')
  }
  async function openFile(f: string) {
    if (f !== file && !(await guard())) return
    try {
      const t = await api.ReadUserModuleFile(cur!.id, f)
      file = f
      text = saved = t
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function save() {
    if (!cur || saving) return
    saving = true
    try {
      cur = await api.SaveUserModuleFile(cur.id, file, text)
      saved = text
      list = list.map((x) => (x.id === cur!.id ? cur! : x))
      await refreshModules()
      toast(cur.problems.length ? 'Guardado, pero hay problemas: míralos abajo' : 'Guardado y comprobado', cur.problems.length ? 'error' : 'ok')
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      saving = false
    }
  }

  async function create() {
    if (!creating) return
    try {
      const m = await api.CreateUserModule(creating.id.trim(), creating.from)
      creating = null
      await refreshModules()
      cur = null
      file = ''
      await load(m.id)
      toast('Módulo creado: ya aparece en el Catálogo')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  // ---- Compartir: exportar a un fichero e importar uno revisándolo antes
  async function exportModule() {
    if (!cur) return
    if (dirty && !(await confirmDialog({ title: 'Cambios sin guardar', message: `«${file}» tiene cambios sin guardar: se exportará lo guardado. ¿Seguir?`, confirmLabel: 'Exportar lo guardado' }))) return
    try {
      const p = await api.ExportUserModule(cur.id)
      if (p) toast('Módulo exportado: ' + p)
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  let importing = $state<ModuleImportReport | null>(null)
  async function inspectImport() {
    if (!(await guard())) return
    try {
      const r = await api.InspectModuleFile()
      if (r.file) importing = r
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  async function doImport(newId: string, overwrite: boolean) {
    if (!importing) return
    try {
      const m = await api.ImportModuleFile(importing.file, newId, overwrite)
      importing = null
      await refreshModules()
      cur = null
      file = ''
      await load(m.id)
      toast(`«${m.name}» importado: ya aparece en el Catálogo`)
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function newFile() {
    if (!cur || !(await guard())) return
    const f = await ask('Fichero nuevo', 'Ruta dentro del módulo, por ejemplo role/templates/config.j2 o role/handlers/main.yml.', 'Ruta', false)
    if (!f) return
    try {
      cur = await api.SaveUserModuleFile(cur.id, f.trim(), '')
      list = list.map((x) => (x.id === cur!.id ? cur! : x))
      saved = text = ''
      file = f.trim()
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function delFile() {
    if (!cur) return
    if (!(await confirmDialog({ title: 'Borrar fichero', message: `¿Borrar «${file}» de ${cur.id}?`, confirmLabel: 'Borrar', danger: true }))) return
    try {
      cur = await api.DeleteUserModuleFile(cur.id, file)
      list = list.map((x) => (x.id === cur!.id ? cur! : x))
      saved = text
      await openFile('module.yaml')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function delModule() {
    if (!cur) return
    if (!(await confirmDialog({ title: 'Borrar módulo', message: `¿Borrar el módulo «${cur.name}» y todos sus ficheros? No se puede deshacer. (Lo que ya instaló en tus servidores no se toca.)`, confirmLabel: 'Borrar módulo', danger: true }))) return
    try {
      await api.DeleteUserModule(cur.id)
      await refreshModules()
      cur = null
      file = text = saved = ''
      await load()
      toast('Módulo borrado')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
</script>

<div class="head">
  <div>
    <h1>Editor de módulos</h1>
    <p class="muted">Tus propios módulos: un formulario (<code>module.yaml</code>) y un rol de Ansible (<code>role/</code>). Empieza con un ejemplo o copiando uno incluido. Al guardar se comprueban y aparecen en el Catálogo y en las plantillas.</p>
  </div>
  <div class="hbtns">
    <button class="btn" onclick={inspectImport} title="Importar un módulo que te han pasado (.draupnode-modulo); se revisa antes"><Upload size={15} /> Importar…</button>
    <button class="btn primary" onclick={() => (creating = { id: '', from: '' })}><Plus size={15} /> Nuevo módulo</button>
  </div>
</div>

<div class="layout">
  <aside class="card mods">
    {#each list as m (m.id)}
      <button class="mod" class:on={cur?.id === m.id} onclick={() => pick(m)}>
        <Puzzle size={15} />
        <span class="mn"><strong>{m.name}</strong><span class="muted mono">{m.id}</span></span>
        {#if m.problems.length}<CircleX size={14} class="bad" />{:else if m.notes.length}<TriangleAlert size={14} class="warn" />{:else}<CircleCheck size={14} class="ok" />{/if}
      </button>
    {:else}
      <p class="muted small">Todavía no tienes módulos propios. Pulsa «Nuevo módulo».</p>
    {/each}
  </aside>

  {#if cur}
    <section class="work">
      <div class="bar">
        <div class="files">
          {#each cur.files as f (f)}
            <button class="file" class:on={file === f} onclick={() => openFile(f)}><FileCode size={13} /> {f}{#if file === f && dirty} •{/if}</button>
          {/each}
          <button class="file add" onclick={newFile} title="Fichero nuevo"><FilePlus size={13} /> Nuevo</button>
        </div>
      </div>
      <div class="ed">
        {#key cur.id}<CodeEditor value={saved} {file} onchange={(v) => (text = v)} onsave={save} />{/key}
      </div>
      <div class="actions">
        <button class="btn primary" onclick={save} disabled={!dirty || saving}><Save size={15} /> {saving ? 'Guardando…' : dirty ? 'Guardar (Ctrl+S)' : 'Guardado'}</button>
        {#if file !== 'module.yaml' && file !== 'role/tasks/main.yml'}<button class="btn sm ghost" onclick={delFile}><Trash2 size={14} /> Borrar fichero</button>{/if}
        <div class="spacer"></div>
        <button class="btn sm ghost" onclick={() => api.OpenUserModuleDir(cur!.id)}><FolderOpen size={14} /> Abrir carpeta</button>
        <button class="btn sm" onclick={exportModule} disabled={cur.problems.length > 0} title={cur.problems.length ? 'Arregla sus problemas antes de exportarlo' : 'Guardarlo en un fichero para pasárselo a otra persona'}><Download size={14} /> Exportar…</button>
        <button class="btn sm danger" onclick={delModule}><Trash2 size={14} /> Borrar módulo</button>
      </div>
      <div class="state">
        {#each cur.problems as p}<p class="bad"><CircleX size={15} /> {p}</p>{/each}
        {#each cur.notes as n}<p class="warn"><TriangleAlert size={15} /> {n}</p>{/each}
        {#if !cur.problems.length}<p class="ok"><CircleCheck size={15} /> Se carga bien: está en el Catálogo{cur.usedBy?.length ? ` y lo usan: ${cur.usedBy.join(', ')}` : ' y lo puedes añadir a una plantilla'}.</p>{/if}
      </div>
    </section>
  {/if}
</div>

{#if importing}
  <ModuleImportDialog report={importing} onimport={doImport} onclose={() => (importing = null)} />
{/if}

{#if creating}
  <Modal title="Nuevo módulo" width={520} onclose={() => (creating = null)}>
    <label class="field"><span>Nombre corto (id)</span>
      <input class="input mono" bind:value={creating.id} placeholder="mi-modulo" />
      <small class="muted">Minúsculas, números y guiones. Es el nombre de la carpeta; las variables empezarán por «{(creating.id || 'mi-modulo').replaceAll('-', '_')}_».</small>
    </label>
    <label class="field"><span>Partir de</span>
      <select class="input" bind:value={creating.from}>
        <option value="">Un ejemplo sencillo (instala paquetes y pone un mensaje)</option>
        {#each builtins as b}<option value={b.id}>Copia de «{b.name}»</option>{/each}
      </select>
      {#if creating.from}<small class="muted">Es una copia: si en un servidor instalas a la vez el original y la copia, usarán las mismas carpetas y contenedores. Cámbialos en la copia.</small>{/if}
    </label>
    <div class="mrow"><button class="btn primary" onclick={create} disabled={!/^[a-z][a-z0-9-]{1,40}$/.test(creating.id.trim())}><Plus size={15} /> Crear</button></div>
  </Modal>
{/if}

<style>
  .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
  .head h1 { margin: 0 0 4px; }
  .hbtns { display: flex; gap: 8px; }
  .head p { max-width: 760px; }
  .layout { display: grid; grid-template-columns: 240px 1fr; gap: 14px; align-items: start; }
  .mods { display: flex; flex-direction: column; gap: 2px; padding: 8px; }
  .mod { display: flex; gap: 8px; align-items: center; padding: 8px; border: 0; border-radius: var(--radius-sm); background: none; font: inherit; color: var(--text); cursor: pointer; text-align: left; }
  .mod:hover { background: var(--panel-2); }
  .mod.on { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .mn { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .mn strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mn span { font-size: 11.5px; }
  .mono { font-family: var(--mono); }
  .small { font-size: 12.5px; }
  .mods :global(.ok), .state .ok { color: var(--success); }
  .mods :global(.warn), .state .warn { color: var(--warning); }
  .mods :global(.bad), .state .bad { color: var(--danger); }
  .work { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .files { display: flex; gap: 4px; flex-wrap: wrap; }
  .file { display: inline-flex; gap: 5px; align-items: center; padding: 5px 10px; border: 1px solid var(--border-soft); border-radius: 999px; background: var(--panel); font: inherit; font-size: 12.5px; font-family: var(--mono); color: var(--text); cursor: pointer; }
  .file.on { border-color: var(--accent); color: var(--accent); }
  .file.add { font-family: inherit; color: var(--muted); border-style: dashed; }
  .ed { height: 58vh; }
  .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .spacer { flex: 1; }
  .state p { display: flex; gap: 8px; align-items: flex-start; margin: 4px 0; font-size: 13px; }
  .state :global(svg) { flex: none; margin-top: 2px; }
  .field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; font-size: 13px; }
  .mrow { display: flex; justify-content: flex-end; }
  @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
</style>
