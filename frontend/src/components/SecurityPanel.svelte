<script lang="ts">
  // Nota de seguridad del servidor (Red y seguridad): las comprobaciones con
  // su estado y, primero, lo que más conviene arreglar.
  import { ShieldCheck, CircleCheck, CircleAlert, TriangleAlert, CircleMinus } from '@lucide/svelte'
  import type { ServerOverview } from '../lib/api'
  import { securityChecks, securityScore, scoreLevel, type SecCheck } from '../lib/security'
  import { t } from '../lib/i18n.svelte'

  let { ov, installed, onmodules, onupgrade, onreboot, onports }: {
    ov: ServerOverview; installed: string[]; onmodules: () => void; onupgrade: () => void; onreboot: () => void; onports: () => void
  } = $props()

  const checks = $derived(securityChecks(ov, installed))
  const score = $derived(securityScore(checks))
  const todo = $derived(checks.filter((c) => c.fix && (c.state === 'bad' || c.state === 'warn')).sort((a, b) => (a.state === b.state ? b.weight - a.weight : a.state === 'bad' ? -1 : 1)))
  const suggest = $derived(checks.filter((c) => c.state === 'na' && c.fix))
  let showAll = $state(false)

  function act(c: SecCheck) {
    switch (c.fix?.kind) {
      case 'module': return onmodules()
      case 'upgrade': return onupgrade()
      case 'reboot': return onreboot()
      case 'ports': return onports()
    }
  }
  const actLabel = (c: SecCheck) => (c.fix?.kind === 'module' ? t('ir a Módulos') : c.fix?.kind === 'upgrade' ? t('instalar…') : c.fix?.kind === 'reboot' ? t('reiniciar…') : c.fix?.kind === 'ports' ? t('ver puertos') : '')
</script>

<section class="card block">
  <div class="h2row">
    <h2><ShieldCheck size={17} /> {t('Seguridad del servidor')}</h2>
    {#if score !== null}<span class="score {scoreLevel(score)}"><strong>{score}</strong>/100</span>{/if}
  </div>
  {#if score === null}
    <p class="muted">{t('Aún no hay datos: actualiza la ficha.')}</p>
  {:else}
    {#if todo.length}
      <h3>{t('Qué arreglar primero')}</h3>
      <ol class="todo">
        {#each todo as c (c.id)}
          <li>
            <span class:bad-t={c.state === 'bad'} class:warn-t={c.state === 'warn'}><strong>{c.title}</strong>: {c.detail}.</span>
            <span class="muted">{c.fix?.text}</span>
            {#if actLabel(c)}<button class="lnk" onclick={() => act(c)}>{actLabel(c)}</button>{/if}
          </li>
        {/each}
      </ol>
    {:else}
      <p class="ok"><CircleCheck size={16} class="ok-i" /> {t('Nada importante que arreglar.')}</p>
    {/if}
    {#if suggest.length}
      <p class="muted small">{t('Para saber más:')} {#each suggest as c, i}{i ? ' · ' : ''}{c.fix?.text}{/each} <button class="lnk small" onclick={onmodules}>{t('ir a Módulos')}</button></p>
    {/if}
    <button class="lnk small" onclick={() => (showAll = !showAll)}>{showAll ? t('Ocultar las comprobaciones') : t('Ver todas las comprobaciones ({0})', checks.length)}</button>
    {#if showAll}
      <ul class="all">
        {#each checks as c (c.id)}
          <li>
            {#if c.state === 'ok'}<CircleCheck size={15} class="ok-i" />{:else if c.state === 'bad'}<CircleAlert size={15} class="bad-i" />{:else if c.state === 'warn'}<TriangleAlert size={15} class="warn-i" />{:else}<CircleMinus size={15} class="na-i" />{/if}
            <span><strong>{c.title}</strong> <span class="muted">· {c.detail}</span></span>
            {#if c.weight && c.state !== 'na'}<span class="w muted small">{t('{0} puntos', c.weight)}</span>{/if}
          </li>
        {/each}
      </ul>
      <p class="muted small">{t('La nota pondera cada comprobación por lo que protege; lo que está a medias cuenta la mitad. Lo que no se puede comprobar (sin Lynis, sin Trivy…) no resta.')}</p>
    {/if}
  {/if}
</section>

<style>
  .block { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
  .block h2 { display: flex; gap: 8px; align-items: center; font-size: 15px; margin: 0; }
  .block h2 :global(svg) { color: var(--accent); }
  .block h3 { font-size: 13px; margin: 4px 0 0; color: var(--muted); font-weight: 600; }
  .block p { margin: 0; }
  .h2row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .score { font-size: 14px; color: var(--muted); }
  .score strong { font-size: 26px; }
  .score.ok strong { color: var(--success); }
  .score.warn strong { color: var(--warning); }
  .score.bad strong { color: var(--danger); }
  .todo { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; }
  .todo li > span { margin-right: 6px; }
  .all { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
  .all li { display: flex; gap: 8px; align-items: flex-start; }
  .all li :global(svg) { flex: none; margin-top: 2px; }
  .w { margin-left: auto; white-space: nowrap; }
  .ok { display: flex; align-items: center; gap: 6px; }
  .small { font-size: 12px; }
  .bad-t { color: var(--danger); }
  .warn-t { color: var(--warning); }
  .lnk { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-align: left; }
  .lnk:hover { text-decoration: underline; }
  :global(.ok-i) { color: var(--success); }
  :global(.warn-i) { color: var(--warning); }
  :global(.bad-i) { color: var(--danger); }
  :global(.na-i) { color: var(--muted); }
</style>
