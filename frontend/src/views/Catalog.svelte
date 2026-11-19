<script lang="ts">
  import { FolderOpen, RefreshCw, MemoryStick, HardDrive, Monitor, ArrowRight, FileCode, TriangleAlert, Package } from '@lucide/svelte'
  import Modal from '../components/Modal.svelte'
  import { api, errorText, type Module } from '../lib/api'
  import { ui, refreshModules, toast, moduleName } from '../lib/state.svelte'

  let open = $state<Module | null>(null)
  let file = $state<{ name: string; text: string } | null>(null)

  const groups = $derived.by(() => {
    const by: Record<string, Module[]> = {}
    for (const m of ui.modules?.modules ?? []) (by[m.category || 'Otros'] ||= []).push(m)
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b))
  })

  async function reload() {
    await refreshModules(true)
    toast('Catálogo recargado')
  }

  async function openDir() {
    try {
      await api.OpenModulesDir()
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function showFile(m: Module, f: string) {
    try {
      file = { name: `${m.id}/${f}`, text: await api.ModuleFile(m.id, f) }
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  function fmtDefault(v: unknown) {
    if (Array.isArray(v)) return v.length ? v.join(', ') : '(vacía)'
    if (typeof v === 'boolean') return v ? 'sí' : 'no'
    return v === null || v === undefined || v === '' ? '—' : String(v)
  }
  const typeName: Record<string, string> = { string: 'texto', int: 'número', bool: 'sí/no', select: 'opción', list: 'lista' }
</script>

<div class="head">
  <div>
    <h1>Catálogo</h1>
    <p class="muted">Lo que Draupnode sabe instalar. Cada módulo es un rol de Ansible con su formulario.</p>
  </div>
  <div class="row">
    <button class="btn" onclick={openDir}><FolderOpen size={15} /> Mis módulos</button>
    <button class="btn" onclick={reload}><RefreshCw size={15} /> Recargar</button>
  </div>
</div>

{#if ui.modules?.errors.length}
  <div class="card errs">
    <TriangleAlert size={17} />
    <div>
      <strong>Hay módulos que no se pudieron cargar</strong>
      <ul>{#each ui.modules.errors as e}<li class="mono">{e}</li>{/each}</ul>
    </div>
  </div>
{/if}

{#each groups as [cat, mods]}
  <h3 class="group">{cat.replace(/^\d+\s*·\s*/, '')}</h3>
  <div class="grid">
    {#each mods as m (m.id)}
      <button class="card mod" onclick={() => (open = m)}>
        <div class="top">
          <div class="ico"><Package size={18} /></div>
          <div class="title">
            <strong>{m.name}</strong>
            <span class="muted mono">{m.id} · v{m.version}</span>
          </div>
          {#if m.source === 'user'}<span class="badge accent">tuyo</span>{/if}
        </div>
        <p class="desc">{m.description}</p>
        <div class="meta">
          {#if m.depends?.length}
            <span class="badge" title="Depende de"><ArrowRight size={12} /> {m.depends.map(moduleName).join(', ')}</span>
          {/if}
          {#if m.requires.minRamMb}<span class="badge"><MemoryStick size={12} /> {m.requires.minRamMb >= 1024 ? (m.requires.minRamMb / 1024).toFixed(1).replace('.0', '') + ' GB' : m.requires.minRamMb + ' MB'}</span>{/if}
          {#if m.requires.minDiskGb}<span class="badge"><HardDrive size={12} /> {m.requires.minDiskGb} GB</span>{/if}
          {#if m.requires.os?.length}<span class="badge"><Monitor size={12} /> {m.requires.os.join(', ')}</span>{/if}
        </div>
      </button>
    {/each}
  </div>
{/each}

<p class="muted foot">
  Para añadir tus propios módulos, pulsa <strong>Mis módulos</strong> y crea una carpeta con un <code>module.yaml</code> y un rol de Ansible en <code>role/</code>
  (puedes copiar uno de los incluidos como ejemplo). Luego pulsa <strong>Recargar</strong>.
  <br />Carpeta: <code class="selectable">{ui.modules?.userDir}</code>
</p>

{#if open}
  {@const m = open}
  <Modal title={m.name} onclose={() => (open = null)} width={760}>
    <p>{m.description}</p>
    {#if m.details}<p class="muted details">{m.details}</p>{/if}
    <div class="meta">
      <span class="badge mono">{m.id} · v{m.version}</span>
      <span class="badge">{m.source === 'user' ? 'Módulo tuyo' : 'Incluido en Draupnode'}</span>
      {#if m.depends?.length}<span class="badge">Necesita: {m.depends.map(moduleName).join(', ')}</span>{/if}
    </div>
    {#if m.variables?.length}
      <h3>Lo que se puede configurar</h3>
      <table>
        <thead><tr><th>Campo</th><th>Tipo</th><th>Por defecto</th></tr></thead>
        <tbody>
          {#each m.variables as v}
            <tr>
              <td><strong>{v.label}</strong>{#if v.help}<br /><span class="muted small">{v.help}</span>{/if}<br /><code class="small">{v.name}</code></td>
              <td>{typeName[v.type] ?? v.type}{#if v.options} ({v.options.join(' / ')}){/if}</td>
              <td class="mono small">{fmtDefault(v.default)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    <h3>Ficheros del rol de Ansible</h3>
    <div class="files">
      {#each m.files ?? [] as f}
        <button class="btn sm" onclick={() => showFile(m, f)}><FileCode size={14} /> {f}</button>
      {/each}
    </div>
  </Modal>
{/if}

{#if file}
  <Modal title={file.name} onclose={() => (file = null)} width={820}>
    <pre class="code selectable">{file.text}</pre>
    <p class="muted small">Solo lectura. El editor llegará en la fase 3.</p>
  </Modal>
{/if}

<style>
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
  .head p { margin-top: 4px; }
  .row { display: flex; gap: 8px; }
  .group { font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin: 22px 0 10px; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
  .mod { text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 10px; transition: border-color .15s, transform .1s; font: inherit; color: inherit; }
  .mod:hover { border-color: var(--accent); }
  .top { display: flex; align-items: center; gap: 12px; }
  .ico { width: 36px; height: 36px; border-radius: 9px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); flex: none; }
  .title { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .title span { font-size: 11.5px; }
  .desc { font-size: 13px; color: var(--muted); line-height: 1.5; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px; }
  .errs { display: flex; gap: 12px; border-color: var(--danger); margin: 14px 0; }
  .errs :global(svg) { color: var(--danger); flex: none; }
  .errs ul { margin: 6px 0 0; padding-left: 18px; font-size: 12.5px; }
  .foot { margin-top: 26px; font-size: 12.5px; line-height: 1.7; }
  .details { white-space: pre-line; font-size: 13px; }
  h3 { margin-top: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-weight: 600; color: var(--muted); font-size: 12px; padding: 6px 8px; border-bottom: 1px solid var(--border); }
  td { padding: 9px 8px; border-bottom: 1px solid var(--border-soft); vertical-align: top; }
  .small { font-size: 12px; }
  .files { display: flex; flex-wrap: wrap; gap: 6px; }
  .code { margin: 0; padding: 14px; background: var(--panel-2); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); font-family: var(--mono); font-size: 12.5px; line-height: 1.55; overflow: auto; max-height: 60vh; white-space: pre; }
</style>
