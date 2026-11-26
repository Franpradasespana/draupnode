<script lang="ts">
  // Pestaña «Ficheros» de la ficha: explorar las carpetas del servidor, ver y
  // editar ficheros de texto, subir, descargar, crear carpetas, renombrar y
  // borrar. Todo por SSH con sudo.
  import { onMount } from 'svelte'
  import { Folder, File, FileSymlink, ArrowUp, RefreshCw, Upload, FolderPlus, Download, Pencil, Trash2, LoaderCircle, Home, Save } from '@lucide/svelte'
  import Modal from './Modal.svelte'
  import CodeEditor from './CodeEditor.svelte'
  import { api, errorText, type FileEntry, type FilesResult, type Server } from '../lib/api'
  import { withConnection } from '../lib/connect'
  import { toast, confirmDialog } from '../lib/state.svelte'
  import { t, locale } from '../lib/i18n.svelte'

  let { server }: { server: Server } = $props()

  const START = '/srv/draupnode/apps'
  let dir = $state(readDir())
  let entries = $state<FileEntry[]>([])
  let loading = $state(false)
  let error = $state('')
  let goto = $state('')
  let busy = $state('')

  function readDir() {
    try { return localStorage.getItem('dn-ficheros-' + server.id) || START } catch { return START }
  }
  const call = (fn: (s: string, a: string, u: string) => Promise<FilesResult>) => withConnection<FilesResult>(server, fn)
  const join = (d: string, n: string) => (d === '/' ? '/' + n : d + '/' + n)
  const parent = (d: string) => (d === '/' ? '/' : d.replace(/\/[^/]+$/, '') || '/')

  async function open(d: string) {
    loading = true
    error = ''
    try {
      const r = await call((s, a, u) => api.FilesList(server.id, d, s, a, u))
      if (!r) return
      if (r.status !== 'ok') {
        // La carpeta de inicio puede no existir aún: se va a la raíz.
        if (d === START && r.message === t('no existe')) return open('/')
        error = r.message || t('No se pudo leer')
        return
      }
      dir = r.path!
      goto = dir
      entries = [...(r.entries ?? [])].sort((x, y) => Number(y.dir) - Number(x.dir) || x.name.localeCompare(y.name))
      try { localStorage.setItem('dn-ficheros-' + server.id, dir) } catch { /* sin almacenamiento */ }
    } catch (e) {
      error = errorText(e)
    } finally {
      loading = false
    }
  }
  onMount(() => open(dir))

  // Migas de pan: /srv/draupnode/apps → [/, srv, draupnode, apps]
  const crumbs = $derived(dir === '/' ? [] : dir.slice(1).split('/').map((n, i, all) => ({ name: n, path: '/' + all.slice(0, i + 1).join('/') })))

  // ---- Editar
  let editing = $state<{ path: string; content: string; orig: string; binary?: boolean; msg?: string } | null>(null)
  async function edit(e: FileEntry) {
    const p = join(dir, e.name)
    busy = p
    try {
      const r = await call((s, a, u) => api.FilesRead(server.id, p, s, a, u))
      if (!r) return
      if (r.status !== 'ok') return toast(r.message || t('No se pudo leer'), 'error')
      if (r.binary) return toast(r.message || t('no es un fichero de texto: descárgalo'), 'error')
      editing = { path: p, content: r.content ?? '', orig: r.content ?? '' }
    } finally {
      busy = ''
    }
  }
  async function save() {
    if (!editing) return
    const ed = editing
    busy = 'save'
    try {
      const r = await call((s, a, u) => api.FilesWrite(server.id, ed.path, ed.content, s, a, u))
      if (r?.status === 'ok') { toast(t('Guardado {0}', ed.path)); ed.orig = ed.content; open(dir) }
      else if (r) toast(r.message || t('No se pudo guardar'), 'error')
    } finally {
      busy = ''
    }
  }
  async function closeEditor() {
    if (editing && editing.content !== editing.orig) {
      const ok = await confirmDialog({ title: t('Cerrar sin guardar'), message: t('Hay cambios sin guardar en {0}.', editing.path), confirmLabel: t('Cerrar sin guardar'), danger: true })
      if (!ok) return
    }
    editing = null
  }

  // ---- Resto de acciones
  async function download(e: FileEntry) {
    const p = join(dir, e.name)
    busy = p
    try {
      const r = await call((s, a, u) => api.FilesDownload(server.id, p, e.dir, s, a, u))
      if (r?.status === 'ok') toast(t('Descargado en {0} ({1})', r.saved ?? '', size(r.size ?? 0)))
      else if (r && r.status !== 'canceled') toast(r.message || t('No se pudo descargar'), 'error')
    } finally {
      busy = ''
    }
  }
  async function upload() {
    busy = 'upload'
    try {
      const r = await call((s, a, u) => api.FilesUpload(server.id, dir, s, a, u))
      if (r?.status === 'ok') toast(t(r.count === 1 ? '1 fichero subido' : '{0} ficheros subidos', r.count ?? 0))
      else if (r && r.status !== 'canceled') toast(r.message || t('No se pudo subir'), 'error')
      if (r && r.status !== 'canceled') open(dir)
    } finally {
      busy = ''
    }
  }
  let naming = $state<{ kind: 'mkdir' | 'rename'; from?: FileEntry; value: string } | null>(null)
  async function doName() {
    if (!naming) return
    const n = naming.value.trim()
    if (!n || n.includes('/')) return toast(t('Escribe un nombre sin «/»'), 'error')
    const nm = naming
    naming = null
    const r = nm.kind === 'mkdir'
      ? await call((s, a, u) => api.FilesMkdir(server.id, join(dir, n), s, a, u))
      : await call((s, a, u) => api.FilesRename(server.id, join(dir, nm.from!.name), join(dir, n), s, a, u))
    if (r && r.status !== 'ok') toast(r.message || t('No se pudo'), 'error')
    open(dir)
  }
  async function remove(e: FileEntry) {
    const p = join(dir, e.name)
    const ok = await confirmDialog({ title: t('Borrar {0}', e.name), message: e.dir && e.type === 'dir' ? t('Se borra la carpeta {0} con todo lo que tiene dentro. No se puede deshacer.', p) : t('Se borra {0}. No se puede deshacer.', p), confirmLabel: t('Borrar'), danger: true })
    if (!ok) return
    const r = await call((s, a, u) => api.FilesDelete(server.id, p, s, a, u))
    if (r && r.status !== 'ok') toast(r.message || t('No se pudo borrar'), 'error')
    open(dir)
  }

  function size(n: number) {
    const u = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = 0
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
    return `${n.toFixed(i ? 1 : 0)} ${u[i]}`
  }
  const when = (s: number) => new Date(s * 1000).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })
</script>

<section class="card block">
  <div class="bar">
    <button class="btn sm ghost icon" title={t('Subir un nivel')} aria-label={t('Subir un nivel')} onclick={() => open(parent(dir))} disabled={dir === '/' || loading}><ArrowUp size={15} /></button>
    <button class="btn sm ghost icon" title={t('Carpeta de las apps')} aria-label={t('Carpeta de las apps')} onclick={() => open(START)} disabled={loading}><Home size={15} /></button>
    <nav class="crumbs" aria-label={t('Ruta')}>
      <button class="lnk mono" onclick={() => open('/')}>/</button>
      {#each crumbs as c, i}<button class="lnk mono" onclick={() => open(c.path)}>{c.name}</button>{#if i < crumbs.length - 1}<span class="muted">/</span>{/if}{/each}
    </nav>
    <form class="goto" onsubmit={(e) => { e.preventDefault(); open(goto.trim()) }}>
      <input class="input sm mono" bind:value={goto} spellcheck="false" aria-label={t('Ir a la ruta')} />
    </form>
    <button class="btn sm ghost icon" title={t('Recargar')} aria-label={t('Recargar')} onclick={() => open(dir)} disabled={loading}>{#if loading}<LoaderCircle size={15} class="spin" />{:else}<RefreshCw size={15} />{/if}</button>
    <button class="btn sm" onclick={() => (naming = { kind: 'mkdir', value: '' })}><FolderPlus size={14} /> {t('Nueva carpeta')}</button>
    <button class="btn sm" onclick={upload} disabled={busy === 'upload'}>{#if busy === 'upload'}<LoaderCircle size={14} class="spin" />{:else}<Upload size={14} />{/if} {t('Subir…')}</button>
  </div>

  {#if error}<p class="bad-t small">{error}</p>{/if}

  <div class="tbl">
    <table>
      <thead><tr><th>{t('Nombre')}</th><th class="r">{t('Tamaño')}</th><th>{t('Modificado')}</th><th>{t('Permisos')}</th><th>{t('Dueño')}</th><th></th></tr></thead>
      <tbody>
        {#each entries as e (e.name)}
          <tr class:dim={loading}>
            <td class="nm">
              {#if e.dir}
                <button class="lnk" onclick={() => open(join(dir, e.name))}><Folder size={15} class="ic-d" /> {e.name}</button>
              {:else if e.type === 'link'}
                <button class="lnk plain" onclick={() => edit(e)} title={e.target}><FileSymlink size={15} class="ic-f" /> {e.name} <span class="muted small">→ {e.target}</span></button>
              {:else}
                <button class="lnk plain" onclick={() => edit(e)}><File size={15} class="ic-f" /> {e.name}</button>
              {/if}
            </td>
            <td class="r muted small">{e.dir ? '' : size(e.size)}</td>
            <td class="muted small">{when(e.mtime)}</td>
            <td class="mono small muted">{e.mode}</td>
            <td class="small muted">{e.owner}</td>
            <td class="acts">
              {#if busy === join(dir, e.name)}<LoaderCircle size={14} class="spin" />{/if}
              {#if !e.dir}<button class="btn sm ghost icon" title={t('Ver o editar')} aria-label={t('Ver o editar')} onclick={() => edit(e)}><Pencil size={14} /></button>{/if}
              <button class="btn sm ghost icon" title={e.dir ? t('Descargar (.tar.gz)') : t('Descargar')} aria-label={t('Descargar')} onclick={() => download(e)}><Download size={14} /></button>
              <button class="btn sm ghost" onclick={() => (naming = { kind: 'rename', from: e, value: e.name })}>{t('Renombrar')}</button>
              <button class="btn sm ghost icon" title={t('Borrar')} aria-label={t('Borrar')} onclick={() => remove(e)}><Trash2 size={14} /></button>
            </td>
          </tr>
        {:else}
          {#if !loading && !error}<tr><td colspan="6" class="muted">{t('Carpeta vacía.')}</td></tr>{/if}
        {/each}
      </tbody>
    </table>
  </div>
  <p class="muted small">{t('Se entra como root (con sudo): cuidado con lo que cambias fuera de /srv/draupnode. Lo que gestiona Draupnode (configuraciones de los módulos) se vuelve a escribir al aplicar: cámbialo en las opciones del módulo.')}</p>
</section>

{#if naming}
  <Modal title={naming.kind === 'mkdir' ? t('Nueva carpeta en {0}', dir) : t('Renombrar {0}', naming.from?.name ?? '')} onclose={() => (naming = null)} width={460}>
    <form onsubmit={(e) => { e.preventDefault(); doName() }}>
      <input class="input mono" bind:value={naming.value} autocomplete="off" spellcheck="false" />
    </form>
    {#snippet footer()}
      <button class="btn ghost" onclick={() => (naming = null)}>{t('Cancelar')}</button>
      <button class="btn primary" onclick={doName} disabled={!naming?.value.trim()}>{naming?.kind === 'mkdir' ? t('Crear') : t('Renombrar')}</button>
    {/snippet}
  </Modal>
{/if}

{#if editing}
  <Modal title={editing.path} onclose={closeEditor} width={980} height={640}>
    <div class="ed"><CodeEditor value={editing.content} file={editing.path} onchange={(v) => { if (editing) editing.content = v }} onsave={save} /></div>
    {#snippet footer()}
      <span class="muted small grow">{editing?.content !== editing?.orig ? t('Cambios sin guardar') : t('Guardado')} · Ctrl+S</span>
      <button class="btn ghost" onclick={closeEditor}>{t('Cerrar')}</button>
      <button class="btn primary" onclick={save} disabled={busy === 'save' || editing?.content === editing?.orig}><Save size={14} /> {busy === 'save' ? t('Guardando…') : t('Guardar')}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .block { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
  .bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .crumbs { display: flex; align-items: center; gap: 3px; flex-wrap: wrap; min-width: 0; }
  .goto { flex: 1; min-width: 180px; }
  .goto .input { width: 100%; }
  .tbl { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 12px; color: var(--muted); font-weight: 600; padding: 6px 8px; border-bottom: 1px solid var(--border); white-space: nowrap; }
  td { padding: 4px 8px; border-bottom: 1px solid var(--border-soft, var(--border)); white-space: nowrap; }
  tr.dim { opacity: .5; }
  .r { text-align: right; }
  .nm { max-width: 420px; overflow: hidden; text-overflow: ellipsis; }
  .acts { text-align: right; display: flex; gap: 2px; justify-content: flex-end; align-items: center; }
  .lnk { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-align: left; display: inline-flex; align-items: center; gap: 6px; }
  .lnk.plain { color: var(--text); }
  .lnk:hover { text-decoration: underline; }
  .small { font-size: 12px; }
  .bad-t { color: var(--danger); }
  .ed { height: 100%; min-height: 480px; display: flex; flex-direction: column; }
  .grow { margin-right: auto; }
  :global(.ic-d) { color: var(--accent); flex: none; }
  :global(.ic-f) { color: var(--muted); flex: none; }
</style>
