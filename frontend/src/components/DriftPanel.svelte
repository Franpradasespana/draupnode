<script lang="ts">
  // «¿Ha cambiado algo a mano?» en el Resumen de la ficha: simula la
  // aplicación de los módulos tal como se aplicaron y enseña lo que alguien
  // ha cambiado fuera de Draupnode (ficheros, configuración, tareas
  // programadas o contenedores parados). Solo lee el servidor.
  import { FileDiff, LoaderCircle, CircleCheck, TriangleAlert, ChevronDown, ChevronRight } from '@lucide/svelte'
  import { api, errorText, type DriftResult, type Server } from '../lib/api'
  import { withConnection } from '../lib/connect'
  import { toast, timeAgo } from '../lib/state.svelte'
  import { alerts, driftOpen, driftLabel, DRIFT_HOURS } from '../lib/alerts.svelte'
  import { t } from '../lib/i18n.svelte'

  let { server, onfix }: { server: Server; onfix: () => void } = $props()

  const report = $derived(alerts.drifts[server.id])
  const open = $derived(driftOpen(report))
  const accepted = $derived(report && !report.skipped ? (report.items ?? []).filter((i) => (report.accepted ?? []).includes(i.key)) : [])
  let busy = $state(false)
  let shown = $state<Record<string, boolean>>({})

  async function check() {
    busy = true
    try {
      const r = await withConnection<DriftResult>(server, (s, a, u) => api.CheckDrift(server.id, s, a, u))
      if (r?.status === 'ok' && r.report) {
        alerts.drifts[server.id] = r.report
        const n = driftOpen(r.report).length
        if (!r.report.skipped && !r.report.error) toast(n ? t(n === 1 ? '1 cosa ha cambiado fuera de Draupnode' : '{0} cosas han cambiado fuera de Draupnode', n) : t('Todo sigue como lo dejó Draupnode'))
      } else if (r) toast(r.message || t('No se pudo comprobar'), 'error')
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      busy = false
    }
  }
  async function accept(keys: string[]) {
    try { alerts.drifts[server.id] = await api.AcceptDrift(server.id, keys) } catch (e) { toast(errorText(e), 'error') }
  }
  async function forget() {
    try { alerts.drifts[server.id] = await api.ForgetAcceptedDrift(server.id) } catch (e) { toast(errorText(e), 'error') }
  }
  const kindText = (k: string) => (k === 'timer' ? t('tarea programada') : k === 'container' ? t('contenedor') : t('configuración'))
  const lineClass = (l: string) => (l.startsWith('+++') || l.startsWith('---') ? 'hd' : l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@@') ? 'hd' : '')
</script>

<section class="card block">
  <div class="h2row">
    <h2><FileDiff size={17} /> {t('¿Ha cambiado algo a mano?')}</h2>
    <button class="btn sm" onclick={check} disabled={busy || report?.skipped === 'never'}>
      {#if busy}<LoaderCircle size={14} class="spin" /> {t('Comprobando…')}{:else}{t('Comprobar ahora')}{/if}
    </button>
  </div>

  {#if busy}
    <p class="muted small">{t('Simulando los módulos tal como se aplicaron (no se cambia nada). Tarda lo que una simulación: de uno a unos pocos minutos.')}</p>
  {/if}

  {#if !report}
    <p class="muted">{t('Draupnode simula sus módulos y te dice si alguien ha cambiado algo por fuera: un fichero de configuración, una tarea programada o un contenedor parado. Desde el Panel se comprueba solo una vez cada {0} h si la contraseña está guardada.', DRIFT_HOURS)}</p>
  {:else if report.skipped === 'never'}
    <p class="muted">{t('Cuando apliques los módulos, Draupnode podrá comprobar si alguien los cambia por fuera.')}</p>
  {:else if report.skipped === 'pending'}
    <p class="muted"><span class="info-t">{t('Hay módulos sin aplicar.')}</span> {t('Aplícalos primero: si no, lo pendiente saldría como cambiado a mano.')} <button class="lnk" onclick={onfix}>{t('ver módulos')}</button></p>
  {:else}
    {#if report.error}
      <p class="warn-t small"><TriangleAlert size={14} class="ic" /> {t('No se pudo comprobar entero: {0}', report.error)}</p>
    {/if}
    {#if !open.length && !report.error}
      <p class="ok"><CircleCheck size={16} class="ok-i" /> {t('Todo sigue como lo dejó Draupnode.')} <span class="muted small">{t('Comprobado {0}', timeAgo(report.at))}</span></p>
    {:else if open.length}
      <p class="small">{t(open.length === 1 ? 'Esto ya no está como lo dejó Draupnode:' : 'Estas {0} cosas ya no están como las dejó Draupnode:', open.length)} <span class="muted">{t('comprobado {0}', timeAgo(report.at))}</span></p>
      <ul class="items">
        {#each open as it (it.key)}
          <li>
            <div class="row">
              {#if it.diff}
                <button class="lnk exp" onclick={() => (shown[it.key] = !shown[it.key])} aria-expanded={!!shown[it.key]}>
                  {#if shown[it.key]}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
                  {driftLabel(it)}
                </button>
              {:else}
                <span class="nm"><span class="mono">{it.name.replace(/\.timer$/, '')}</span> · {it.kind === 'timer' ? t('parada') : t('parado')}</span>
              {/if}
              <span class="tag">{kindText(it.kind)}</span>
              <button class="lnk small keep" onclick={() => accept([it.key])} title={t('No volver a avisar de esto mientras siga igual')}>{t('Dejarlo así')}</button>
            </div>
            {#if it.diff && shown[it.key]}
              <pre class="diff">{#each it.diff.split('\n') as l}<span class={lineClass(l)}>{l}</span>{'\n'}{/each}</pre>
              <p class="muted small">{t('En rojo, lo que hay ahora en el servidor; en verde, lo que volvería a poner Draupnode.')}</p>
            {/if}
          </li>
        {/each}
      </ul>
      <div class="acts">
        <button class="btn sm primary" onclick={onfix}>{t('Volver a dejarlo como dice Draupnode')}</button>
        <button class="btn sm ghost" onclick={() => accept([])}>{t('Dejarlo todo así')}</button>
      </div>
      <p class="muted small">{t('«Volver a dejarlo» es aplicar los módulos: deshace los cambios hechos a mano. Si el cambio es bueno, llévalo a las opciones del módulo para que no se pierda la próxima vez que apliques.')}</p>
    {/if}
    {#if accepted.length}
      <p class="muted small">{t(accepted.length === 1 ? '1 diferencia dada por buena' : '{0} diferencias dadas por buenas', accepted.length)} · <button class="lnk small" onclick={forget}>{t('volver a avisar')}</button></p>
    {/if}
  {/if}
</section>

<style>
  .block { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
  .block h2 { display: flex; gap: 8px; align-items: center; font-size: 15px; margin: 0; }
  .block h2 :global(svg) { color: var(--accent); }
  .block p { margin: 0; }
  .small { font-size: 12px; }
  .warn-t { color: var(--warning); }
  .info-t { color: var(--info); }
  .lnk { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-align: left; }
  .lnk:hover { text-decoration: underline; }
  .h2row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .ok { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .items li { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; }
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .exp { display: inline-flex; align-items: center; gap: 4px; color: var(--text); }
  .nm { padding-left: 18px; }
  .tag { font-size: 11px; color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; }
  .keep { margin-left: auto; }
  .diff { margin: 8px 0 4px; padding: 8px 10px; background: var(--bg); border-radius: var(--radius-sm); font-size: 12px; overflow: auto; max-height: 320px; white-space: pre; }
  .diff .add { color: var(--success); }
  .diff .del { color: var(--danger); }
  .diff .hd { color: var(--muted); }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  :global(.ok-i) { color: var(--success); }
  :global(.spin) { animation: spin 1s linear infinite; }
  :global(.ic) { vertical-align: -2px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
