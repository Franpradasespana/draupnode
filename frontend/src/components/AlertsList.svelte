<script lang="ts">
  // La lista de avisos (pantalla «Avisos» y, si hay, arriba del Panel).
  import { DatabaseBackup, Download, LoaderCircle, X, CircleX, ArrowRight } from '@lucide/svelte'
  import { alerts, alertItems, hideAlert, fetchBackups } from '../lib/alerts.svelte'
  import { openDeployment, timeAgo } from '../lib/state.svelte'

  let { compact = false }: { compact?: boolean } = $props()
  const items = $derived(alertItems())
  const size = (n: number) => (n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : (n / 1e6).toFixed(0) + ' MB')
</script>

<div class="alerts" class:compact>
  {#each items as a (a.key)}
    <div class="card alert" class:bad={a.kind === 'failed'}>
      {#if a.kind === 'backups'}<DatabaseBackup size={17} />{:else}<CircleX size={17} />{/if}
      <div class="txt">
        {#if a.kind === 'backups'}
          {#if alerts.busy === a.projectId}
            <span><LoaderCircle size={13} class="spin" /> Trayendo las copias de <strong>{a.name}</strong>…{#if alerts.progress?.total} {size(alerts.progress.done)} de {size(alerts.progress.total)}{/if}</span>
          {:else}
            <span>Copias de <strong>{a.name}</strong>{#if a.server}{' '}({a.server}){/if}: {a.due.age < 0 ? 'nunca las has traído a este equipo' : `las de este equipo son de hace ${a.due.age} días`}.</span>
            {#if !compact}<span class="muted small">Puedes hacer que se traigan solas, o cambiar cada cuántos días avisa, en el proyecto → Copias.</span>{/if}
          {/if}
        {:else}
          <span>La última aplicación de <strong>{a.name}</strong>{#if a.server}{' '}en {a.server}{/if} falló ({timeAgo(a.at)}).</span>
          {#if !compact && a.error}<span class="muted small">{a.error}</span>{/if}
        {/if}
      </div>
      <div class="btns">
        {#if a.kind === 'backups'}
          <button class="btn sm" onclick={() => fetchBackups(a.due)} disabled={!!alerts.busy}><Download size={13} /> Traer ahora</button>
        {/if}
        <button class="btn sm ghost" onclick={() => openDeployment(a.projectId)}>Abrir <ArrowRight size={13} /></button>
        <button class="btn sm ghost icon" title="Ocultar hasta la próxima vez que abras la app" onclick={() => hideAlert(a.key)}><X size={14} /></button>
      </div>
    </div>
  {:else}
    {#if !compact}<p class="muted">No hay avisos. Todo en orden.</p>{/if}
  {/each}
</div>

<style>
  .alerts { display: flex; flex-direction: column; gap: 8px; }
  .alerts.compact { margin-bottom: 16px; }
  .alert { display: flex; gap: 12px; align-items: center; padding: 10px 14px; font-size: 13px; border-color: color-mix(in srgb, var(--warning) 45%, var(--border)); }
  .alert.bad { border-color: color-mix(in srgb, var(--danger) 45%, var(--border)); }
  .alert > :global(svg) { color: var(--warning); flex: none; }
  .alert.bad > :global(svg) { color: var(--danger); }
  .txt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .btns { display: flex; gap: 6px; flex-wrap: wrap; }
  @media (max-width: 640px) { .alert { flex-wrap: wrap; } }
</style>
