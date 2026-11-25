<script lang="ts">
  // Historial del servidor en el Resumen de la ficha: CPU, memoria y disco en
  // las últimas 24 h o los últimos 30 días, y cuándo se llena el disco a este
  // ritmo. Lo guarda en el servidor el temporizador draupnode-historial.
  import { ChartLine, LoaderCircle, HardDrive, CircleCheck, TriangleAlert } from '@lucide/svelte'
  import HistoryChart from './HistoryChart.svelte'
  import { api, type DockerResult, type Server, type ServerHistory } from '../lib/api'
  import { withConnection } from '../lib/connect'
  import { toast, confirmDialog } from '../lib/state.svelte'
  import { DISK_FULL_DAYS } from '../lib/alerts.svelte'
  import { t } from '../lib/i18n.svelte'

  let { server, history, loading = false, onchange }: { server: Server; history?: ServerHistory; loading?: boolean; onchange: () => void } = $props()

  type Range = 'day' | 'month'
  let range = $state<Range>(readRange())
  function readRange(): Range {
    try { return localStorage.getItem('dn-historial-rango') === 'month' ? 'month' : 'day' } catch { return 'day' }
  }
  function setRange(r: Range) {
    range = r
    try { localStorage.setItem('dn-historial-rango', r) } catch { /* sin almacenamiento */ }
  }

  let busy = $state(false)
  async function enable() {
    busy = true
    try {
      const r = await withConnection<DockerResult>(server, (s, a, u) => api.ServerHistory(server.id, true, false, s, a, u))
      if (r?.status === 'ok') { toast(history?.installed ? t('Historial actualizado') : t('Historial activado: guarda una muestra cada 5 minutos')); onchange() }
      else if (r) toast(r.message || t('No se pudo activar'), 'error')
    } finally {
      busy = false
    }
  }
  async function disable() {
    const ok = await confirmDialog({ title: t('Dejar de guardar el historial de {0}', server.name), message: t('Se quita el temporizador del servidor y se borra lo guardado (CPU, memoria, disco y uso de las apps). Puedes volver a activarlo cuando quieras, pero empezará de cero.'), confirmLabel: t('Quitar y borrar'), danger: true })
    if (!ok) return
    busy = true
    try {
      const r = await withConnection<DockerResult>(server, (s, a, u) => api.ServerHistory(server.id, false, false, s, a, u))
      if (r?.status === 'ok') { toast(t('Historial quitado')); onchange() }
      else if (r) toast(r.message || t('No se pudo quitar'), 'error')
    } finally {
      busy = false
    }
  }

  const fmt = (n: number) => {
    const u = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = 0
    while (Math.abs(n) >= 1024 && i < u.length - 1) { n /= 1024; i++ }
    return `${n.toFixed(i > 2 ? 1 : 0)} ${u[i]}`
  }
  const pctf = (v: number) => `${v.toFixed(v < 10 ? 1 : 0)} %`
  const h = $derived(history)
  const day = $derived(h?.day ?? [])
  const month = $derived(h?.month ?? [])
  const cpu = $derived<[number, number][]>(range === 'day' ? day.map((p) => [p[0], p[1]]) : month.map((p) => [p[0], p[1]]))
  const cpuMax = $derived(range === 'month' ? month.map((p) => p[2]) : undefined)
  const mem = $derived<[number, number][]>(range === 'day' ? day.map((p) => [p[0], p[2]]) : month.map((p) => [p[0], p[3]]))
  const memMax = $derived(range === 'month' ? month.map((p) => p[4]) : undefined)
  const disk = $derived<[number, number][]>(range === 'day' ? day.map((p) => [p[0], p[3]]) : month.map((p) => [p[0], p[5]]))
  const last = $derived(day[day.length - 1])
  const fc = $derived(h?.forecast)
  const fullDate = $derived(fc?.days !== undefined ? new Date(Date.now() + fc.days * 86400000).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : '')
  const sinceText = $derived(h?.since ? new Date(h.since * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : '')
</script>

<section class="card block">
  <div class="h2row">
    <h2><ChartLine size={17} /> {t('Historial')} {#if sinceText}<span class="muted small">{t('· desde el {0}', sinceText)}</span>{/if}</h2>
    {#if h?.hasData}
      <div class="seg" role="tablist" aria-label={t('Periodo')}>
        <button role="tab" aria-selected={range === 'day'} class:on={range === 'day'} onclick={() => setRange('day')}>{t('24 horas')}</button>
        <button role="tab" aria-selected={range === 'month'} class:on={range === 'month'} onclick={() => setRange('month')}>{t('30 días')}</button>
      </div>
    {/if}
  </div>

  {#if !h}
    <p class="muted">{loading ? t('Leyendo…') : '—'}</p>
  {:else}
    {#if !h.installed}
      <div class="intro">
        <p>{t('Guarda cada 5 minutos la CPU, la memoria, el disco y lo que gasta cada app, para ver cómo evoluciona y')} <strong>{t('avisarte antes de que se llene el disco')}</strong>{t('. Lo hace un pequeño temporizador en el propio servidor, así que funciona aunque Draupnode esté cerrado (ocupa unos pocos MB y guarda un año).')}</p>
        <button class="btn primary" onclick={enable} disabled={busy}>{#if busy}<LoaderCircle size={14} class="spin" />{:else}<ChartLine size={14} />{/if} {t('Empezar a guardar el historial')}</button>
      </div>
    {:else if h.outdated || !h.timer}
      <p class="small warn-t"><TriangleAlert size={13} /> {h.outdated ? t('El recolector del servidor es de una versión anterior.') : t('El temporizador del historial está parado: no se guardan muestras nuevas.')}
        <button class="lnk" onclick={enable} disabled={busy}>{busy ? t('un momento…') : h.outdated ? t('Actualizarlo') : t('Ponerlo en marcha')}</button></p>
    {/if}

    {#if h.hasData}
      <div class="charts">
        <HistoryChart title={range === 'day' ? 'CPU' : t('CPU (media por hora; banda: máximo)')} points={cpu} max={cpuMax} top={100} format={pctf} long={range === 'month'} now={last ? pctf(last[1]) : ''} />
        <HistoryChart title={range === 'day' ? t('Memoria usada') : t('Memoria (media por hora; banda: máximo)')} points={mem} max={memMax} top={h.memT || 1} format={fmt} long={range === 'month'} now={last ? fmt(last[2]) : ''} />
        <HistoryChart title={t('Disco / usado')} points={disk} top={h.diskT || 1} format={fmt} long={range === 'month'} now={last ? fmt(last[3]) : ''} />
      </div>

      <p class="fc small">
        <HardDrive size={14} />
        {#if !fc?.enough}
          <span class="muted">{t('Previsión del disco: hacen falta al menos 12 horas de muestras (llevas {0} h).', Math.round(fc?.hours ?? 0))}</span>
        {:else if fc.days !== undefined}
          <span class:warn-t={fc.days < DISK_FULL_DAYS} class:bad-t={fc.days < 3}>{t('A este ritmo (')}<strong>{t('+{0} al día', fmt(fc.perDay ?? 0))}</strong>{t(') el disco se llena en')} <strong>{fc.days < 1 ? t('menos de un día') : t('unos {0} días', Math.round(fc.days))}</strong>{t(', hacia el {0}.', fullDate)}</span>
          <span class="muted">{t('Quedan {0} libres.', fmt(fc.free ?? 0))}</span>
        {:else}
          <span><CircleCheck size={13} class="ok-i" /> {t('Disco estable: {0} (últimos {1} días). Quedan {2} libres.', (fc.perDay ?? 0) >= 0 ? t('crece {0} al día', fmt(fc.perDay ?? 0)) : t('baja {0} al día', fmt(-(fc.perDay ?? 0))), Math.round(Math.min(fc.hours, 168) / 24) || 1, fmt(fc.free ?? 0))}</span>
        {/if}
      </p>
    {:else if h.installed}
      <p class="muted small">{t('Activado. La primera muestra llega en unos minutos; pulsa «Actualizar» luego.')}</p>
    {/if}

    {#if h.installed}
      <p class="foot muted small">{t('Una muestra cada 5 minutos (temporizador')} <span class="mono">draupnode-historial</span> {t('en el servidor).')}
        <button class="lnk small" onclick={disable} disabled={busy}>{t('Dejar de guardar…')}</button></p>
    {/if}
  {/if}
</section>

<style>
  .block { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
  .block h2 { display: flex; gap: 8px; align-items: center; font-size: 15px; margin: 0; }
  .block h2 :global(svg) { color: var(--accent); }
  .small { font-size: 12px; }
  .bad-t { color: var(--danger); }
  .warn-t { color: var(--warning); }
  .lnk { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-align: left; }
  .lnk:hover { text-decoration: underline; }
  .h2row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
  .seg button { background: none; border: 0; padding: 4px 10px; font: inherit; font-size: 12.5px; color: var(--muted); cursor: pointer; }
  .seg button.on { background: var(--accent-soft); color: var(--text); }
  .intro { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
  .intro p { margin: 0; max-width: 70ch; }
  .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px 22px; margin-top: 6px; }
  .fc { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 14px 0 0; }
  .foot { margin: 8px 0 0; }
  :global(.ok-i) { color: var(--success); vertical-align: -2px; }
</style>
