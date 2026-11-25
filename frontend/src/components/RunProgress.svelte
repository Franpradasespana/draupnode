<script lang="ts">
  // Barra de progreso de una simulación, aplicación o desinstalación.
  // Mientras no se sabe cuántas tareas hay (subiendo, preparando Ansible)
  // se mueve sola; después avanza por tareas terminadas.
  import { runProgress, type RunState } from '../lib/state.svelte'
  import { t } from '../lib/i18n.svelte'

  let { run, compact = false }: { run: RunState; compact?: boolean } = $props()
  const p = $derived(runProgress(run))
  const failed = $derived(run.done && !run.summary?.ok)
</script>

<div class="rp" class:compact class:done={run.done} class:failed role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={p.known ? p.pct : undefined}
  aria-label={run.check ? t('Progreso de la simulación') : t('Progreso de la aplicación')}>
  <div class="track"><i class:indet={!p.known && !run.done} style:width="{p.known || run.done ? p.pct : 30}%"></i></div>
  {#if !compact}
    <span class="lbl">
      {#if run.done}{failed ? t('Terminó con errores') : t('Terminado')}
      {:else if p.known}{t('{0} % · tarea {1} de {2}', p.pct, Math.min(p.done + 1, p.total), p.total)}
      {:else}{run.stage || t('Empezando…')}{/if}
    </span>
  {:else if p.known && !run.done}<span class="lbl">{p.pct} %</span>{/if}
</div>

<style>
  .rp { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .track { flex: 1; height: 8px; border-radius: 999px; background: var(--panel-2); border: 1px solid var(--border-soft); overflow: hidden; position: relative; min-width: 60px; }
  .compact .track { height: 6px; }
  .track i { position: absolute; inset: 0 auto 0 0; background: var(--accent); border-radius: 999px; transition: width .4s ease; }
  .track i.indet { animation: rp-slide 1.4s ease-in-out infinite; }
  .done .track i { background: var(--success); }
  .failed .track i { background: var(--danger); }
  .lbl { font-size: 12.5px; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .compact .lbl { font-size: 11.5px; }
  @keyframes rp-slide { 0% { left: -30%; } 100% { left: 100%; } }
  @media (prefers-reduced-motion: reduce) { .track i.indet { animation: none; left: 0; width: 100% !important; opacity: .35; } }
</style>
