<script lang="ts">
  // Restaurar desde una copia: explorar sus carpetas, elegir y descargar a
  // este equipo o restaurar en el servidor; y restaurar una base de
  // PostgreSQL (en una base nueva o sustituyendo la actual).
  import { Folder, File, ChevronRight, Download, RotateCcw, Database, LoaderCircle, CircleCheck, CircleX, ArrowLeft, FolderOpen, TriangleAlert } from '@lucide/svelte'
  import Modal from './Modal.svelte'
  import { api, onEvent, type BackupFetchProgress, type BackupResult, type Project, type Snapshot, type SnapEntry } from '../lib/api'
  import { toast, ui } from '../lib/state.svelte'
  import { withConnection } from '../lib/connect'
  import { onDestroy } from 'svelte'

  let { project, snap, onclose }: { project: Project; snap: Snapshot; onclose: () => void } = $props()

  const server = $derived(ui.servers.find((s) => s.id === project.serverId))
  type View = 'browse' | 'download' | 'restore' | 'db'
  let view = $state<View>('browse')
  let dir = $state('/')
  let entries = $state<SnapEntry[] | null>(null)
  let picked = $state<string[]>([])
  let busy = $state(false)
  let result = $state<{ ok: boolean; text: string } | null>(null)
  let progress = $state<BackupFetchProgress | null>(null)

  // descargar
  let dest = $state('')
  // restaurar en el servidor
  let target = $state('')
  let inPlace = $state(false)
  let confirmWord = $state('')
  // base de datos
  let dbFile = $state<SnapEntry | null>(null)
  let dbMode = $state<'new' | 'replace'>('new')
  let dbNew = $state('')
  let dbConfirm = $state('')

  const today = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const dbOrig = $derived(dbFile ? dbFile.name.replace(/\.dump$/, '') : '')
  const dbContainer = $derived(dbFile ? (dbFile.path.split('/').at(-2) ?? '').replace(/^postgres-/, '') : '')

  $effect(() => {
    api.DefaultBackupFolder(project.id).then((d) => (dest = d.replace(/[\\/][^\\/]*$/, '') + '/restaurado')).catch(() => {})
    target = `/srv/draupnode/restaurado/${snap.id}`
  })
  const off = onEvent('backupfetch', (p: BackupFetchProgress) => {
    if (p.projectId === project.id) progress = p
  })
  onDestroy(off)

  async function call(fn: (s: string, a: string, u: string) => Promise<BackupResult>): Promise<BackupResult | null> {
    busy = true
    try {
      const r = await withConnection(server, fn)
      if (r && r.status !== 'ok') toast(r.message || 'No se pudo', 'error')
      return r && r.status === 'ok' ? r : null
    } finally {
      busy = false
      progress = null
    }
  }

  async function open(d: string) {
    const r = await call((s, a, u) => api.BackupLs(project.id, snap.id, d, s, a, u))
    if (r) {
      dir = d
      entries = (r as { entries?: SnapEntry[] }).entries ?? []
    }
  }
  open('/')

  const crumbs = $derived(dir === '/' ? [] : dir.split('/').slice(1).map((n, i, all) => ({ name: n, path: '/' + all.slice(0, i + 1).join('/') })))
  const isDump = (e: SnapEntry) => e.type === 'file' && e.name.endsWith('.dump') && /\/postgres-[^/]+$/.test(dir)
  function togglePick(p: string) {
    picked = picked.includes(p) ? picked.filter((x) => x !== p) : [...picked, p]
  }

  async function chooseDest() {
    const d = await api.ChooseBackupFolder(project.id)
    if (d) dest = d
  }
  async function doDownload() {
    result = null
    const r = await call((s, a, u) => api.BackupDownload(project.id, snap.id, picked, dest, s, a, u))
    if (r) result = { ok: true, text: r.output ?? '' }
  }
  async function doRestore() {
    result = null
    const r = await call((s, a, u) => api.BackupRestore(project.id, snap.id, inPlace ? '/' : target, picked, s, a, u))
    if (r) result = { ok: true, text: r.output ?? '' }
  }
  function openDb(e: SnapEntry) {
    dbFile = e
    dbMode = 'new'
    dbNew = `${e.name.replace(/\.dump$/, '')}_restaurada_${today}`
    dbConfirm = ''
    result = null
    view = 'db'
  }
  async function doDb() {
    if (!dbFile) return
    result = null
    const name = dbMode === 'new' ? dbNew.trim() : dbOrig
    const r = await call((s, a, u) => api.BackupRestoreDB(project.id, snap.id, dbFile!.path, dbContainer, name, dbMode === 'replace', s, a, u))
    if (r) result = { ok: true, text: r.output ?? '' }
  }

  function size(n: number): string {
    if (!n) return ''
    const u = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = 0
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
    return `${n.toFixed(i ? 1 : 0)} ${u[i]}`
  }
  const when = $derived(new Date(snap.time).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }))
  const dbNameOk = $derived(/^[a-z_][a-z0-9_-]{0,62}$/.test(dbNew.trim()))
</script>

<Modal title={`Restaurar · copia del ${when}`} {onclose} width={820}>
  <div class="where">{server?.name} › {project.name} · copia <code>{snap.id}</code></div>

  {#if view === 'browse'}
    <nav class="crumbs">
      <button onclick={() => open('/')} disabled={busy}>copia</button>
      {#each crumbs as c}<ChevronRight size={13} /><button onclick={() => open(c.path)} disabled={busy}>{c.name}</button>{/each}
      {#if busy}<LoaderCircle size={14} class="spin" />{/if}
    </nav>
    <div class="list">
      {#if entries && !entries.length}<p class="muted empty">Carpeta vacía.</p>{/if}
      {#each entries ?? [] as e (e.path)}
        <div class="row" class:on={picked.includes(e.path)}>
          <input type="checkbox" checked={picked.includes(e.path)} onchange={() => togglePick(e.path)} aria-label={`Elegir ${e.name}`} />
          {#if e.type === 'dir'}
            <button class="name dir" onclick={() => open(e.path)} disabled={busy}><Folder size={15} /> {e.name}</button>
          {:else}
            <span class="name"><File size={15} /> {e.name}</span>
          {/if}
          <span class="muted small sz">{size(e.size)}</span>
          {#if isDump(e)}
            <button class="btn sm" onclick={() => openDb(e)} disabled={busy}><Database size={13} /> Restaurar base…</button>
          {/if}
        </div>
      {/each}
    </div>
    {#if /\/postgres-[^/]+$/.test(dir)}
      <p class="muted small">Cada <code>.dump</code> es una base de datos: «Restaurar base…» la recupera en PostgreSQL. <code>usuarios-y-permisos.sql</code> son los usuarios y permisos de todas.</p>
    {:else if dir === '/'}
      <p class="muted small">Entra en las carpetas y marca lo que quieras recuperar. Las bases de PostgreSQL están en la carpeta <code>postgres-…</code>.</p>
    {/if}

  {:else if view === 'download'}
    <h4>Descargar a este equipo</h4>
    <p class="muted">No toca el servidor. Se guarda en una carpeta <code>copia-{snap.id}</code> dentro de la que elijas, solo para tu usuario.</p>
    <ul class="picked">{#each picked as p}<li><code>{p}</code></li>{/each}</ul>
    <div class="inrow">
      <input class="input mono" bind:value={dest} spellcheck="false" disabled={busy} />
      <button class="btn sm" onclick={chooseDest} disabled={busy}><FolderOpen size={14} /> Elegir…</button>
    </div>
    {#if busy && progress}<p class="muted small">{progress.stage} · {size(progress.done)}</p>{/if}

  {:else if view === 'restore'}
    <h4>Restaurar en {server?.name}</h4>
    <ul class="picked">{#each picked as p}<li><code>{p}</code></li>{/each}</ul>
    <label class="opt"><input type="radio" checked={!inPlace} onchange={() => (inPlace = false)} disabled={busy} />
      <span><span class="t"><strong>En una carpeta aparte</strong> (recomendado): no se toca nada de lo que hay.</span>
        <input class="input mono" bind:value={target} spellcheck="false" disabled={busy || inPlace} /></span></label>
    <label class="opt danger"><input type="radio" checked={inPlace} onchange={() => (inPlace = true)} disabled={busy} />
      <span><span class="t"><strong>En su sitio original</strong>: SOBRESCRIBE los ficheros actuales con los de la copia.</span></span></label>
    {#if inPlace}
      <label class="field"><span>Para confirmar, escribe <strong>RESTAURAR</strong></span><input class="input mono" bind:value={confirmWord} autocomplete="off" /></label>
    {/if}

  {:else if view === 'db' && dbFile}
    <h4><Database size={16} /> Restaurar la base «{dbOrig}»</h4>
    <p class="muted">Desde la copia del {when}, en el PostgreSQL <code>{dbContainer}</code>.</p>
    <label class="opt"><input type="radio" checked={dbMode === 'new'} onchange={() => (dbMode = 'new')} disabled={busy} />
      <span><span class="t"><strong>En una base nueva</strong> (recomendado): la actual no se toca; revisa la nueva y, si está bien, cambia la app a ella.</span>
        <input class="input mono" bind:value={dbNew} spellcheck="false" disabled={busy || dbMode !== 'new'} />
        {#if dbMode === 'new' && !dbNameOk}<small class="bad">Minúsculas, números, _ y - (empezando por letra o _).</small>{/if}</span></label>
    <label class="opt danger"><input type="radio" checked={dbMode === 'replace'} onchange={() => (dbMode = 'replace')} disabled={busy} />
      <span><span class="t"><strong>Sustituir la actual</strong>: corta las conexiones, BORRA «{dbOrig}» y la crea otra vez con los datos de la copia. Lo que se escribió después de la copia se pierde.</span></span></label>
    {#if dbMode === 'replace'}
      <label class="field"><span>Para confirmar, escribe el nombre de la base: <strong>{dbOrig}</strong></span><input class="input mono" bind:value={dbConfirm} autocomplete="off" /></label>
    {/if}
  {/if}

  {#if result}
    <div class="out" class:bad={!result.ok}>
      <div class="out-t">{#if result.ok}<CircleCheck size={14} /> Hecho{:else}<CircleX size={14} /> Falló{/if}</div>
      <pre class="selectable">{result.text}</pre>
    </div>
  {/if}

  {#snippet footer()}
    {#if view === 'browse'}
      <span class="muted small sel">{picked.length ? `${picked.length} elegido(s)` : 'Marca qué recuperar'}</span>
      <button class="btn" onclick={onclose}>Cerrar</button>
      <button class="btn" onclick={() => { result = null; view = 'download' }} disabled={busy || !picked.length}><Download size={15} /> Descargar a este equipo…</button>
      <button class="btn primary" onclick={() => { result = null; confirmWord = ''; view = 'restore' }} disabled={busy || !picked.length}><RotateCcw size={15} /> Restaurar en el servidor…</button>
    {:else}
      <button class="btn" onclick={() => { result = null; view = 'browse' }} disabled={busy}><ArrowLeft size={15} /> Volver</button>
      <div class="sp"></div>
      {#if view === 'download'}
        <button class="btn primary" onclick={doDownload} disabled={busy || !dest.trim()}>{#if busy}<LoaderCircle size={15} class="spin" />{:else}<Download size={15} />{/if} Descargar</button>
      {:else if view === 'restore'}
        <button class="btn" class:primary={!inPlace} class:solid-danger={inPlace} onclick={doRestore}
          disabled={busy || (inPlace ? confirmWord.trim().toUpperCase() !== 'RESTAURAR' : !target.trim().startsWith('/'))}>
          {#if busy}<LoaderCircle size={15} class="spin" />{:else if inPlace}<TriangleAlert size={15} />{:else}<RotateCcw size={15} />{/if} Restaurar
        </button>
      {:else if view === 'db'}
        <button class="btn" class:primary={dbMode === 'new'} class:solid-danger={dbMode === 'replace'} onclick={doDb}
          disabled={busy || (dbMode === 'new' ? !dbNameOk : dbConfirm.trim() !== dbOrig)}>
          {#if busy}<LoaderCircle size={15} class="spin" />{:else}<Database size={15} />{/if} {dbMode === 'new' ? 'Restaurar en la base nueva' : 'Borrar y restaurar'}
        </button>
      {/if}
    {/if}
  {/snippet}
</Modal>

<style>
  .where { font-size: 12.5px; color: var(--muted); }
  code { font-family: var(--mono); font-size: 12px; }
  .crumbs { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; font-size: 13px; padding: 6px 10px; background: var(--panel-2); border-radius: var(--radius-sm); }
  .crumbs button { background: none; border: 0; padding: 0; color: var(--accent); font: inherit; cursor: pointer; font-family: var(--mono); }
  .list { display: flex; flex-direction: column; border: 1px solid var(--border-soft); border-radius: var(--radius-sm); max-height: 340px; overflow: auto; }
  .row { display: grid; grid-template-columns: auto 1fr auto auto; gap: 10px; align-items: center; padding: 6px 10px; border-top: 1px solid var(--border-soft); }
  .row:first-child { border-top: 0; }
  .row.on { background: var(--info-soft); }
  .row input { accent-color: var(--info); }
  .name { display: inline-flex; align-items: center; gap: 7px; font-size: 13.5px; min-width: 0; overflow-wrap: anywhere; }
  .name.dir { background: none; border: 0; padding: 0; color: var(--text); font: inherit; cursor: pointer; text-align: left; }
  .name.dir:hover { color: var(--accent); }
  .name :global(svg) { color: var(--muted); flex: none; }
  .sz { text-align: right; white-space: nowrap; }
  .empty { padding: 10px; font-size: 13px; }
  .small { font-size: 12px; }
  h4 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 15px; }
  .picked { margin: 0; padding-left: 18px; font-size: 13px; max-height: 120px; overflow: auto; }
  .inrow { display: flex; gap: 6px; }
  .inrow .input { flex: 1; }
  .opt { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; font-size: 13.5px; }
  .opt > span { display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .opt .t { display: block; }
  .opt input[type=radio] { margin-top: 3px; accent-color: var(--accent); }
  .opt.danger { border-color: color-mix(in srgb, var(--danger) 40%, var(--border)); }
  .opt.danger input { accent-color: var(--danger); }
  .bad { color: var(--danger); }
  .out { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; }
  .out.bad { border-color: var(--danger); }
  .out-t { display: flex; gap: 6px; align-items: center; font-size: 13px; font-weight: 600; color: var(--success); }
  .out.bad .out-t { color: var(--danger); }
  .out pre { margin: 6px 0 0; font-family: var(--mono); font-size: 12px; white-space: pre-wrap; max-height: 180px; overflow: auto; }
  .sel { flex: 1; }
  .sp { flex: 1; }
</style>
