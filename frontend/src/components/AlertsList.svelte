<script lang="ts">
  // La lista de avisos (pantalla «Avisos» y, si hay, arriba del Panel).
  import { DatabaseBackup, Download, LoaderCircle, X, CircleX, ArrowRight, HardDriveDownload, Sparkles, ServerCrash, TriangleAlert, FilePen } from '@lucide/svelte'
  import { alerts, alertItems, hideAlert, fetchBackups } from '../lib/alerts.svelte'
  import { openDeployment, openServer, timeAgo, ui } from '../lib/state.svelte'
  import { api } from '../lib/api'

  let { compact = false, max = 0 }: { compact?: boolean; max?: number } = $props()
  // Primero lo grave; con «max», solo los primeros y un enlace a la pantalla Avisos.
  const isBad = (a: ReturnType<typeof alertItems>[number]) => a.kind === 'failed' || a.kind === 'down' || (a.kind === 'server' && a.bad)
  const all = $derived(alertItems())
  const sorted = $derived(max ? [...all.filter(isBad), ...all.filter((a) => !isBad(a))] : all)
  const items = $derived(max ? sorted.slice(0, max) : sorted)
  const size = (n: number) => (n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : (n / 1e6).toFixed(0) + ' MB')
</script>

<div class="alerts" class:compact>
  {#each items as a (a.key)}
    <div class="card alert" class:bad={isBad(a)} class:info={a.kind === 'pending'}>
      {#if a.kind === 'server'}<TriangleAlert size={17} />{:else if a.kind === 'pending'}<FilePen size={17} />{:else if a.kind === 'backups'}<DatabaseBackup size={17} />{:else if a.kind === 'export'}<HardDriveDownload size={17} />{:else if a.kind === 'update'}<Sparkles size={17} />{:else if a.kind === 'down'}<ServerCrash size={17} />{:else}<CircleX size={17} />{/if}
      <div class="txt">
        {#if a.kind === 'server'}
          <span><strong>{a.name}</strong>: {a.text}.</span>
          {#if !compact}<span class="muted small">Visto en la ficha del servidor {timeAgo(a.at)}. Si ya está arreglado, se quita al volver a leerla.</span>{/if}
        {:else if a.kind === 'pending'}
          <span>La plantilla <strong>{a.name}</strong> en <strong>{a.server}</strong> {a.applied ? 'tiene cambios sin aplicar' : 'está asociada pero no se ha aplicado nunca'}.</span>
        {:else if a.kind === 'backups'}
          {#if alerts.busy === a.projectId}
            <span><LoaderCircle size={13} class="spin" /> Trayendo las copias de <strong>{a.name}</strong>…{#if alerts.progress?.total} {size(alerts.progress.done)} de {size(alerts.progress.total)}{/if}</span>
          {:else}
            <span>Copias de <strong>{a.name}</strong>{#if a.server}{' '}({a.server}){/if}: {a.due.age < 0 ? 'nunca las has traído a este equipo' : `las de este equipo son de hace ${a.due.age} días`}.</span>
            {#if !compact}<span class="muted small">Puedes hacer que se traigan solas, o cambiar cada cuántos días avisa, en la plantilla del servidor → Copias.</span>{/if}
          {/if}
        {:else if a.kind === 'down'}
          <span><strong>{a.name}</strong> no responde por SSH desde {timeAgo(a.since)}.</span>
          {#if !compact}<span class="muted small">Puede estar apagado, sin red o con el puerto SSH cerrado. Si vuelve, este aviso se quita solo.</span>{/if}
        {:else if a.kind === 'update'}
          <span>Hay una versión nueva de Draupnode: <strong>{a.latest}</strong> (tienes la {ui.info?.version}).</span>
        {:else if a.kind === 'export'}
          <span>{a.last ? `Tu última copia de Draupnode es de ${timeAgo(a.last)}.` : 'Nunca has hecho una copia de Draupnode.'} Si se rompe este equipo, perderías servidores, plantillas y contraseñas.</span>
        {:else}
          <span>La última aplicación de <strong>{a.name}</strong>{#if a.server}{' '}en {a.server}{/if} falló ({timeAgo(a.at)}).</span>
          {#if !compact && a.error}<span class="muted small">{a.error}</span>{/if}
        {/if}
      </div>
      <div class="btns">
        {#if a.kind === 'backups'}
          <button class="btn sm" onclick={() => fetchBackups(a.due)} disabled={!!alerts.busy}><Download size={13} /> Traer ahora</button>
        {/if}
        {#if a.kind === 'down' || a.kind === 'server'}
          <button class="btn sm ghost" onclick={() => openServer(a.serverId)}>Ficha <ArrowRight size={13} /></button>
        {:else if a.kind === 'update'}
          <button class="btn sm" onclick={() => api.OpenURL(a.url)}><Download size={13} /> Descargar</button>
        {:else if a.kind === 'export'}
          <button class="btn sm" onclick={() => (ui.view = 'settings')}><HardDriveDownload size={13} /> Hacer la copia</button>
        {:else}
          <button class="btn sm ghost" onclick={() => openDeployment(a.projectId)}>Abrir <ArrowRight size={13} /></button>
        {/if}
        <button class="btn sm ghost icon" title="Ocultar hasta la próxima vez que abras la app" onclick={() => hideAlert(a.key)}><X size={14} /></button>
      </div>
    </div>
  {:else}
    {#if !compact}<p class="muted">No hay avisos. Todo en orden.</p>{/if}
  {/each}
  {#if max && all.length > max}
    <button class="btn sm ghost more" onclick={() => (ui.view = 'alerts')}>Ver los {all.length} avisos <ArrowRight size={13} /></button>
  {/if}
</div>

<style>
  .alerts { display: flex; flex-direction: column; gap: 8px; }
  .alerts.compact { margin-bottom: 16px; }
  .alert { display: flex; gap: 12px; align-items: center; padding: 10px 14px; font-size: 13px; border-color: color-mix(in srgb, var(--warning) 45%, var(--border)); }
  .alert.bad { border-color: color-mix(in srgb, var(--danger) 45%, var(--border)); }
  .alert > :global(svg) { color: var(--warning); flex: none; }
  .alert.bad > :global(svg) { color: var(--danger); }
  .alert.info { border-color: color-mix(in srgb, var(--info) 45%, var(--border)); }
  .alert.info > :global(svg) { color: var(--info); }
  .txt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .btns { display: flex; gap: 6px; flex-wrap: wrap; }
  .more { align-self: flex-start; }
  @media (max-width: 640px) { .alert { flex-wrap: wrap; } }
</style>
