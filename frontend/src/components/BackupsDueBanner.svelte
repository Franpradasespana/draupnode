<script lang="ts">
  // Al abrir la app: avisa de las copias que hace tiempo que no se traen a
  // este equipo, o las trae solas si el proyecto lo tiene así.
  import { onMount, onDestroy } from 'svelte'
  import { DatabaseBackup, Download, LoaderCircle, X } from '@lucide/svelte'
  import { api, onEvent, type BackupDue, type BackupFetchProgress, type BackupResult } from '../lib/api'
  import { ui, toast, refreshProjects } from '../lib/state.svelte'
  import { withConnection } from '../lib/connect'

  let due = $state<BackupDue[]>([])
  let busy = $state('')
  let progress = $state<BackupFetchProgress | null>(null)
  const off = onEvent('backupfetch', (p: BackupFetchProgress) => {
    if (p.projectId === busy) progress = p
  })
  onDestroy(off)

  const serverOf = (id: string) => ui.servers.find((s) => s.id === ui.projects.find((p) => p.id === id)?.serverId)

  async function fetchOne(d: BackupDue, quiet: boolean): Promise<boolean> {
    busy = d.projectId
    progress = null
    try {
      const call = (s: string, a: string, u: string) => api.FetchBackups(d.projectId, d.dest, s, a, u)
      // Solas: sin preguntar nada (si hace falta una contraseña, se queda en aviso).
      const r: BackupResult | null = quiet ? await call('', '', '') : await withConnection(serverOf(d.projectId), call)
      if (r?.status === 'ok' && r.fetch) {
        due = due.filter((x) => x.projectId !== d.projectId)
        toast(`Copias de «${d.name}» traídas a ${r.fetch.dir}`)
        return true
      }
      if (!quiet && r && r.status !== 'ok') toast(r.message || 'No se pudieron traer', 'error')
      return false
    } catch (e) {
      if (!quiet) toast(String(e), 'error')
      return false
    } finally {
      busy = ''
      progress = null
    }
  }

  onMount(async () => {
    try {
      due = await api.BackupsDue()
    } catch {
      return
    }
    for (const d of due.filter((x) => x.mode === 'fetch')) {
      const ok = await fetchOne(d, true)
      if (!ok) d.mode = 'warn' // no se pudo sin preguntar: queda como aviso
    }
    await refreshProjects()
  })

  const size = (n: number) => (n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : (n / 1e6).toFixed(0) + ' MB')
</script>

{#if due.length}
  <div class="due" role="status">
    <DatabaseBackup size={17} />
    <div class="list">
      {#each due as d (d.projectId)}
        <div class="row">
          {#if busy === d.projectId}
            <LoaderCircle size={14} class="spin" />
            <span>Trayendo las copias de <strong>{d.name}</strong>…{#if progress?.total} {size(progress.done)} de {size(progress.total)}{/if}</span>
          {:else}
            <span>Copias de <strong>{d.name}</strong>: {d.age < 0 ? 'nunca las has traído a este equipo' : `las de este equipo son de hace ${d.age} días`}.</span>
            <button class="btn sm" onclick={() => fetchOne(d, false)} disabled={!!busy}><Download size={13} /> Traer ahora</button>
            <button class="btn sm ghost icon" title="Ocultar hasta la próxima vez" onclick={() => (due = due.filter((x) => x.projectId !== d.projectId))}><X size={14} /></button>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .due { display: flex; gap: 12px; align-items: flex-start; padding: 10px 14px; margin-bottom: 16px; border-radius: var(--radius); border: 1px solid color-mix(in srgb, var(--warning) 45%, var(--border)); background: color-mix(in srgb, var(--warning) 8%, var(--panel)); font-size: 13px; }
  .due > :global(svg) { color: var(--warning); flex: none; margin-top: 5px; }
  .list { display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; min-height: 30px; }
</style>
