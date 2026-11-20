<script lang="ts">
  // Copias de seguridad del proyecto (módulo «backups»): hacer una ahora,
  // verlas y traerlas a este equipo.
  import { onDestroy } from 'svelte'
  import { DatabaseBackup, Play, List, Download, FolderOpen, LoaderCircle, CircleCheck, CircleX, Cloud } from '@lucide/svelte'
  import { api, onEvent, type BackupFetchProgress, type BackupResult, type Project, type Snapshot } from '../lib/api'
  import { toast, timeAgo, ui, refreshProjects } from '../lib/state.svelte'
  import { withConnection } from '../lib/connect'

  let { project, disabled = false }: { project: Project; disabled?: boolean } = $props()

  const server = $derived(ui.servers.find((s) => s.id === project.serverId))
  const vals = $derived(project.installedValues?.backups ?? {})
  const remoteType = $derived(String(vals.backups_remote_type ?? 'no'))

  let busy = $state<'' | 'now' | 'list' | 'remote' | 'fetch'>('')
  let snaps = $state<Snapshot[] | null>(null)
  let snapsRemote = $state(false)
  let output = $state<{ ok: boolean; text: string } | null>(null)
  let dest = $state('')
  let progress = $state<BackupFetchProgress | null>(null)

  $effect(() => {
    void project.id
    api.DefaultBackupFolder(project.id).then((d) => (dest = d)).catch(() => {})
  })
  const off = onEvent('backupfetch', (p: BackupFetchProgress) => {
    if (p.projectId === project.id) progress = p
  })
  onDestroy(off)

  async function call(kind: typeof busy, fn: (s: string, a: string, u: string) => Promise<BackupResult>): Promise<BackupResult | null> {
    busy = kind
    try {
      const r = await withConnection(server, fn)
      if (r && r.status !== 'ok') toast(r.message || 'No se pudo', 'error')
      return r && r.status === 'ok' ? r : null
    } catch (e) {
      toast(String(e), 'error')
      return null
    } finally {
      busy = ''
      progress = null
    }
  }

  async function now() {
    output = null
    const r = await call('now', (s, a, u) => api.BackupNow(project.id, s, a, u))
    if (r) {
      output = { ok: r.ok, text: r.output ?? '' }
      if (snaps && !snapsRemote) list(false)
    }
  }
  async function list(remote: boolean) {
    const r = await call(remote ? 'remote' : 'list', (s, a, u) => api.BackupSnapshots(project.id, remote, s, a, u))
    if (r) {
      snaps = r.snapshots ?? []
      snapsRemote = remote
    }
  }
  async function choose() {
    const d = await api.ChooseBackupFolder(project.id)
    if (d) dest = d
  }
  async function fetchAll() {
    const r = await call('fetch', (s, a, u) => api.FetchBackups(project.id, dest, s, a, u))
    if (r?.fetch) {
      await refreshProjects()
      toast(r.fetch.files ? `Copias traídas a ${r.fetch.dir} (${r.fetch.files} ficheros nuevos)` : `Ya tenías todas las copias en ${r.fetch.dir}`)
    }
  }

  function size(n?: number): string {
    if (!n) return ''
    const u = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = 0
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
    return `${n.toFixed(i ? 1 : 0)} ${u[i]}`
  }
  const what = (s: Snapshot) =>
    s.tags.includes('postgres') ? 'PostgreSQL' : s.tags.includes('coolify') ? 'Base de datos de Coolify'
      : s.tags.includes('coolify-archivos') ? 'Configuración de Coolify' : 'Archivos'
  const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
</script>

<section class="card bk">
  <div class="head">
    <DatabaseBackup size={18} />
    <div class="txt">
      <strong>Copias de seguridad</strong>
      <span class="muted">
        Copia diaria a las {vals.backups_time ?? '03:30'} en el servidor{#if remoteType !== 'no'}{' '}y en {remoteType} ({vals.backups_remote}){/if}.
        {#if project.backupsFetched}Traídas a este equipo {timeAgo(project.backupsFetched.at)}.{:else}<span class="warn">Aún no las has traído a este equipo.</span>{/if}
      </span>
    </div>
  </div>

  <div class="btns">
    <button class="btn sm" onclick={now} disabled={disabled || !!busy}>
      {#if busy === 'now'}<LoaderCircle size={14} class="spin" /> Haciendo copia…{:else}<Play size={14} /> Hacer copia ahora{/if}
    </button>
    <button class="btn sm" onclick={() => list(false)} disabled={disabled || !!busy}>
      {#if busy === 'list'}<LoaderCircle size={14} class="spin" />{:else}<List size={14} />{/if} Ver copias
    </button>
    {#if remoteType !== 'no'}
      <button class="btn sm" onclick={() => list(true)} disabled={disabled || !!busy}>
        {#if busy === 'remote'}<LoaderCircle size={14} class="spin" />{:else}<Cloud size={14} />{/if} Ver copias remotas
      </button>
    {/if}
  </div>

  {#if output}
    <div class="out" class:bad={!output.ok}>
      <div class="out-t">{#if output.ok}<CircleCheck size={14} /> Copia hecha{:else}<CircleX size={14} /> La copia tuvo fallos{/if}</div>
      <pre class="selectable">{output.text}</pre>
    </div>
  {/if}

  {#if snaps}
    <div class="snaps">
      <div class="snaps-t">{snapsRemote ? 'Copias en el destino remoto' : 'Copias en el servidor'} · {snaps.length}</div>
      {#if !snaps.length}<p class="muted small">Todavía no hay ninguna.</p>{/if}
      <table>
        <tbody>
          {#each snaps as s (s.id + s.time)}
            <tr>
              <td class="d">{fmtDate(s.time)}</td>
              <td>{what(s)}</td>
              <td class="muted small p">{s.paths.join(', ')}</td>
              <td class="muted small r">{size(s.bytes)}</td>
              <td class="mono small muted">{s.id}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <div class="fetch">
    <div class="fetch-t"><Download size={15} /> <strong>Traer copias al equipo</strong>
      <span class="muted small">Solo se descarga lo nuevo. Se guardan cifradas, con su contraseña y un LEEME para restaurar con restic.</span></div>
    <div class="row">
      <input class="input mono" bind:value={dest} placeholder="/home/…/Draupnode-copias/proyecto" spellcheck="false" disabled={!!busy} />
      <button class="btn sm" onclick={choose} disabled={!!busy}><FolderOpen size={14} /> Elegir…</button>
      <button class="btn sm primary" onclick={fetchAll} disabled={disabled || !!busy || !dest.trim()}>
        {#if busy === 'fetch'}<LoaderCircle size={14} class="spin" /> Trayendo…{:else}<Download size={14} /> Traer{/if}
      </button>
    </div>
    {#if busy === 'fetch' && progress}
      <div class="prog">
        <span class="muted small">{progress.stage}{#if progress.total} · {size(progress.done)} de {size(progress.total)}{/if}</span>
        {#if progress.total}<div class="bar"><i style:width={`${Math.min(100, (progress.done / progress.total) * 100)}%`}></i></div>{/if}
      </div>
    {:else if project.backupsFetched}
      <span class="muted small">Última vez: {timeAgo(project.backupsFetched.at)} en <code>{project.backupsFetched.dir}</code> ({size(project.backupsFetched.bytes)}).</span>
    {/if}
  </div>
</section>

<style>
  .bk { padding: 12px 16px; margin: 14px 0; display: flex; flex-direction: column; gap: 10px; }
  .head { display: flex; gap: 12px; align-items: center; }
  .head > :global(svg) { color: var(--accent); flex: none; }
  .txt { display: flex; flex-direction: column; gap: 2px; font-size: 13px; min-width: 0; }
  .warn { color: var(--warning); }
  .btns { display: flex; gap: 8px; flex-wrap: wrap; }
  .small { font-size: 12px; }
  .out { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; }
  .out.bad { border-color: color-mix(in srgb, var(--danger) 50%, var(--border)); }
  .out-t { display: flex; gap: 6px; align-items: center; font-size: 13px; font-weight: 600; color: var(--success); }
  .out.bad .out-t { color: var(--danger); }
  .out pre { margin: 6px 0 0; font-family: var(--mono); font-size: 12px; white-space: pre-wrap; max-height: 220px; overflow: auto; }
  .snaps-t { font-size: 11.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 600; margin-bottom: 4px; }
  .snaps { max-height: 300px; overflow: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 5px 8px 5px 0; border-bottom: 1px solid var(--border-soft); vertical-align: top; }
  td.d { white-space: nowrap; }
  td.p { overflow-wrap: anywhere; }
  td.r { text-align: right; white-space: nowrap; }
  .mono { font-family: var(--mono); }
  .fetch { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--border-soft); padding-top: 10px; }
  .fetch-t { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: 13px; }
  .fetch-t :global(svg) { color: var(--accent); align-self: center; }
  .row { display: flex; gap: 6px; }
  .row .input { flex: 1; min-width: 0; }
  .prog { display: flex; flex-direction: column; gap: 4px; }
  .bar { height: 6px; border-radius: 3px; background: var(--border-soft); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); transition: width .2s; }
  code { font-family: var(--mono); font-size: 12px; }
</style>
