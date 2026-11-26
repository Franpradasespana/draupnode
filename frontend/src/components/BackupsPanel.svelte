<script lang="ts">
  // Copias de seguridad del proyecto (módulo «backups»): hacer una ahora,
  // verlas y traerlas a este equipo.
  import { onDestroy } from 'svelte'
  import { DatabaseBackup, Play, List, Download, FolderOpen, LoaderCircle, CircleCheck, CircleX, Cloud, RotateCcw, ServerCog, FlaskConical } from '@lucide/svelte'
  import { api, onEvent, type BackupFetchProgress, type BackupResult, type BackupVerify, type Project, type Snapshot } from '../lib/api'
  import { toast, timeAgo, ui, refreshProjects } from '../lib/state.svelte'
  import { withConnection } from '../lib/connect'
  import RestoreDialog from './RestoreDialog.svelte'
  import BackupTargetDialog from './BackupTargetDialog.svelte'
  import { alerts } from '../lib/alerts.svelte'
  import { t } from '../lib/i18n.svelte'

  let { project, disabled = false, onchanged = () => {} }: { project: Project; disabled?: boolean; onchanged?: () => void } = $props()
  let targetOpen = $state(false)

  const server = $derived(ui.servers.find((s) => s.id === project.serverId))
  const vals = $derived(project.installedValues?.backups ?? {})
  const remoteType = $derived(String(vals.backups_remote_type ?? 'no'))

  let busy = $state<'' | 'now' | 'list' | 'remote' | 'fetch' | 'verify'>('')
  // Última prueba de restaurar: la de la ficha del servidor o la que se acaba de hacer.
  let verifyNow = $state<BackupVerify | null>(null)
  const bk = $derived((alerts.fichas[project.serverId]?.overview.backups ?? []).find((b) => b.slug === project.slug))
  const verify = $derived(verifyNow ?? bk?.verify ?? null)
  async function verifyRun() {
    const r = await call('verify', (s, a, u) => api.BackupVerify(project.id, s, a, u))
    if (r?.verify) {
      verifyNow = r.verify
      toast(r.verify.ok ? t('La copia se restaura bien') : t('La prueba de restaurar falló: {0}', r.verify.error), r.verify.ok ? undefined : 'error')
    }
  }
  let snaps = $state<Snapshot[] | null>(null)
  let snapsRemote = $state(false)
  let output = $state<{ ok: boolean; text: string } | null>(null)
  let dest = $state('')
  let progress = $state<BackupFetchProgress | null>(null)
  let restoring = $state<Snapshot | null>(null)

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
      if (r && r.status !== 'ok') toast(r.message || t('No se pudo'), 'error')
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
  const auto = $derived(project.backupsAuto ?? { mode: 'warn' as const, days: 7 })
  async function setAuto(mode: string, days: number) {
    try {
      await api.SetBackupsAuto(project.id, mode, Math.min(365, Math.max(1, days || 7)))
      await refreshProjects()
      toast(mode === 'off' ? t('No se avisará de estas copias') : mode === 'fetch' ? t('Se traerán solas al abrir Draupnode si tienen más de {0} días', days) : t('Te avisará si tienen más de {0} días', days))
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  async function fetchAll() {
    const r = await call('fetch', (s, a, u) => api.FetchBackups(project.id, dest, s, a, u))
    if (r?.fetch) {
      await refreshProjects()
      toast(r.fetch.files ? t('Copias traídas a {0} ({1} ficheros nuevos)', r.fetch.dir, r.fetch.files) : t('Ya tenías todas las copias en {0}', r.fetch.dir))
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
    s.tags.includes('postgres') ? t('PostgreSQL (bases)') : s.tags.includes('coolify') ? t('Base de datos de Coolify')
      : s.tags.includes('coolify-archivos') ? t('Configuración de Coolify') : t('Archivos')
  const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
</script>

<section class="card bk">
  <div class="head">
    <DatabaseBackup size={18} />
    <div class="txt">
      <strong>{t('Copias de seguridad')}</strong>
      <span class="muted">
        {t('Copia diaria a las {0} en el servidor', vals.backups_time ?? '03:30')}{#if remoteType !== 'no'}{' '}{t('y en {0} ({1})', remoteType, vals.backups_remote)}{/if}.
        {#if project.backupsFetched}{t('Traídas a este equipo {0}.', timeAgo(project.backupsFetched.at))}{:else}<span class="warn">{t('Aún no las has traído a este equipo.')}</span>{/if}
      </span>
    </div>
  </div>

  <p class="verify small">
    <FlaskConical size={14} />
    {#if verify}
      {t('Prueba de restaurar')}:
      {#if verify.ok}<span class="ok-t">{t('bien')}</span>{:else}<span class="bad-t">{t('falló')}: {verify.error}</span>{/if}
      <span class="muted">· {timeAgo(new Date(verify.at * 1000).toISOString())} · {t('{0} ficheros, {1}', verify.files, size(verify.bytes) || '0 B')}{#if verify.dumps}{' · '}{t('{0} volcados de base de datos abiertos', verify.dumps - verify.dumpsBad.length)}{/if}{#if verify.partial}{' · '}{t('no había sitio para restaurarla entera')}{/if}</span>
    {:else if bk?.verifyTimer}
      <span class="muted">{t('Prueba de restaurar: aún no se ha hecho (se hace sola cada semana).')}</span>
    {:else}
      <span class="muted">{t('Prueba de restaurar: sin activar (actívala en las opciones del módulo, o pruébala ahora).')}</span>
    {/if}
  </p>

  <div class="btns">
    <button class="btn sm" onclick={now} disabled={disabled || !!busy}>
      {#if busy === 'now'}<LoaderCircle size={14} class="spin" /> {t('Haciendo copia…')}{:else}<Play size={14} /> {t('Hacer copia ahora')}{/if}
    </button>
    <button class="btn sm" onclick={() => list(false)} disabled={disabled || !!busy}>
      {#if busy === 'list'}<LoaderCircle size={14} class="spin" />{:else}<List size={14} />{/if} {t('Ver copias')}
    </button>
    {#if remoteType !== 'no'}
      <button class="btn sm" onclick={() => list(true)} disabled={disabled || !!busy}>
        {#if busy === 'remote'}<LoaderCircle size={14} class="spin" />{:else}<Cloud size={14} />{/if} {t('Ver copias remotas')}
      </button>
    {/if}
    <button class="btn sm" onclick={verifyRun} disabled={disabled || !!busy} title={t('Restaura la última copia en una carpeta aparte, comprueba que se abre y la borra')}>
      {#if busy === 'verify'}<LoaderCircle size={14} class="spin" /> {t('Probando…')}{:else}<FlaskConical size={14} /> {t('Probar a restaurar ahora')}{/if}
    </button>
    <button class="btn sm" onclick={() => (targetOpen = true)} disabled={disabled || !!busy} title={t('Otro servidor tuyo que guarda una segunda copia y no deja borrarla')}>
      <ServerCog size={14} /> {remoteType === 'rest-server' && vals.backups_remote_append_only ? t('Cambiar el otro servidor…') : t('Guardar también en otro servidor…')}
    </button>
  </div>

  {#if output}
    <div class="out" class:bad={!output.ok}>
      <div class="out-t">{#if output.ok}<CircleCheck size={14} /> {t('Copia hecha')}{:else}<CircleX size={14} /> {t('La copia tuvo fallos')}{/if}</div>
      <pre class="selectable">{output.text}</pre>
    </div>
  {/if}

  {#if snaps}
    <div class="snaps">
      <div class="snaps-t">{snapsRemote ? t('Copias en el destino remoto') : t('Copias en el servidor')} · {snaps.length}</div>
      {#if !snaps.length}<p class="muted small">{t('Todavía no hay ninguna.')}</p>{/if}
      <table>
        <tbody>
          {#each snaps as s (s.id + s.time)}
            <tr>
              <td class="d">{fmtDate(s.time)}</td>
              <td>{what(s)}</td>
              <td class="muted small p">{s.paths.map((x) => x.replace(/^\/var\/tmp\/draupnode-volcado-[^/]+\//, '')).join(', ')}</td>
              <td class="muted small r">{size(s.bytes)}</td>
              <td class="mono small muted">{s.id}</td>
              <td class="act">{#if !snapsRemote}<button class="btn sm ghost" onclick={() => (restoring = s)} disabled={disabled || !!busy}><RotateCcw size={13} /> {t('Restaurar…')}</button>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <div class="fetch">
    <div class="fetch-t"><Download size={15} /> <strong>{t('Traer copias al equipo')}</strong>
      <span class="muted small">{t('Solo se descarga lo nuevo. Se guardan cifradas, con su contraseña y un LEEME para restaurar con restic.')}</span></div>
    <div class="row">
      <input class="input mono" bind:value={dest} placeholder="/home/…/Draupnode-copias/proyecto" spellcheck="false" disabled={!!busy} />
      <button class="btn sm" onclick={choose} disabled={!!busy}><FolderOpen size={14} /> {t('Elegir…')}</button>
      <button class="btn sm primary" onclick={fetchAll} disabled={disabled || !!busy || !dest.trim()}>
        {#if busy === 'fetch'}<LoaderCircle size={14} class="spin" /> {t('Trayendo…')}{:else}<Download size={14} /> {t('Traer')}{/if}
      </button>
    </div>
    <div class="auto">
      <span class="muted small">{t('Al abrir Draupnode, si las de este equipo tienen más de')}</span>
      <input class="input days" type="number" min="1" max="365" value={auto.days} onchange={(e) => setAuto(auto.mode, +(e.target as HTMLInputElement).value)} />
      <span class="muted small">{t('días:')}</span>
      <select class="input" value={auto.mode} onchange={(e) => setAuto((e.target as HTMLSelectElement).value, auto.days)}>
        <option value="warn">{t('avisarme')}</option>
        <option value="fetch">{t('traerlas solas')}</option>
        <option value="off">{t('no hacer nada')}</option>
      </select>
    </div>
    {#if busy === 'fetch' && progress}
      <div class="prog">
        <span class="muted small">{progress.stage}{#if progress.total} {t('· {0} de {1}', size(progress.done), size(progress.total))}{/if}</span>
        {#if progress.total}<div class="bar"><i style:width={`${Math.min(100, (progress.done / progress.total) * 100)}%`}></i></div>{/if}
      </div>
    {:else if project.backupsFetched}
      <span class="muted small">{t('Última vez: {0} en', timeAgo(project.backupsFetched.at))} <code>{project.backupsFetched.dir}</code> ({size(project.backupsFetched.bytes)}).</span>
    {/if}
  </div>
</section>

{#if targetOpen}
  <BackupTargetDialog {project} onclose={() => (targetOpen = false)} {onchanged} />
{/if}

{#if restoring}
  <RestoreDialog {project} snap={restoring} onclose={() => (restoring = null)} />
{/if}

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
  td.act { text-align: right; white-space: nowrap; }
  .mono { font-family: var(--mono); }
  .fetch { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--border-soft); padding-top: 10px; }
  .fetch-t { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: 13px; }
  .fetch-t :global(svg) { color: var(--accent); align-self: center; }
  .row { display: flex; gap: 6px; }
  .row .input { flex: 1; min-width: 0; }
  .auto { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .auto .input { height: 30px; font-size: 13px; width: auto; }
  .auto .days { width: 70px; }
  .prog { display: flex; flex-direction: column; gap: 4px; }
  .bar { height: 6px; border-radius: 3px; background: var(--border-soft); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); transition: width .2s; }
  code { font-family: var(--mono); font-size: 12px; }
  .verify { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0 0 10px; }
  .verify :global(svg) { color: var(--accent); }
  .small { font-size: 12.5px; }
  .ok-t { color: var(--success); }
  .bad-t { color: var(--danger); }
</style>
