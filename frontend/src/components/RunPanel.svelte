<script lang="ts">
  import Linkify from './Linkify.svelte'
  import { tick } from 'svelte'
  import { Trash2, LoaderCircle, CircleCheck, CircleX, CircleDot, CircleMinus, Square, ScrollText, ListChecks, Info, Eye, Hammer } from '@lucide/svelte'
  import { api } from '../lib/api'
  import { moduleName, type RunState } from '../lib/state.svelte'
  import { t as tr } from '../lib/i18n.svelte'

  let { run, onclose }: { run: RunState; onclose: () => void } = $props()

  let showLog = $state(false)
  let listEl = $state<HTMLElement | null>(null)
  let follow = $state(true)
  let now = $state(Date.now())

  $effect(() => {
    if (run.done) return
    const t = setInterval(() => (now = Date.now()), 1000)
    return () => clearInterval(t)
  })

  // Seguir la última tarea mientras se ejecuta (salvo que el usuario suba).
  $effect(() => {
    void run.tasks.length
    void run.lines.length
    if (follow && listEl) tick().then(() => listEl && (listEl.scrollTop = listEl.scrollHeight))
  })

  function onScroll() {
    if (!listEl) return
    follow = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 40
  }

  const counts = $derived({
    changed: run.tasks.filter((t) => t.status === 'changed').length,
    failed: run.tasks.filter((t) => t.status === 'failed').length,
    done: run.tasks.filter((t) => t.status !== 'running').length,
  })
  const elapsed = $derived(Math.round(((run.done && run.summary ? new Date(run.summary.at).getTime() + run.summary.durationMs : now) - run.startedAt) / 1000))
  const fmtTime = (s: number) => (s >= 60 ? tr('{0} min {1} s', Math.floor(s / 60), s % 60) : `${s} s`)

  // Agrupa las tareas por módulo (rol) en el orden en que aparecen.
  const groups = $derived.by(() => {
    const out: { role: string; tasks: typeof run.tasks }[] = []
    for (const t of run.tasks) {
      const g = out[out.length - 1]
      if (g && g.role === t.role) g.tasks.push(t)
      else out.push({ role: t.role, tasks: [t] })
    }
    return out
  })
  const changedTasks = $derived(run.tasks.filter((t) => t.status === 'changed' && !t.handler))
  const failedTasks = $derived(run.tasks.filter((t) => t.status === 'failed'))
  const stLabel = (st: string) =>
    st === 'changed' ? (run.check ? tr('se cambiará') : 'hecho')
    : st === 'ok' ? tr('ya está bien')
    : st === 'skipped' ? tr('no hace falta')
    : st === 'failed' ? 'fallo' : ''

  const roleName = (r: string) => (r === '' ? tr('Preparación') : r === 'draupnode_preflight' ? tr('Comprobaciones previas') : moduleName(r))
</script>

<section class="card run" class:ok={run.done && run.summary?.ok} class:fail={run.done && !run.summary?.ok}>
  <header>
    <div class="state">
      {#if !run.done}
        <LoaderCircle size={20} class="spin" />
      {:else if run.summary?.ok}
        <CircleCheck size={20} />
      {:else}
        <CircleX size={20} />
      {/if}
      <div>
        <strong>
          {#if run.uninstall?.length}<Trash2 size={14} /> {tr('Desinstalación')}{:else if run.check}<Eye size={14} /> {tr('Simulación')}{:else}<Hammer size={14} /> {tr('Aplicación')}{/if}
          {#if !run.done} {tr('en curso')}{:else if run.summary?.canceled} cancelada{:else if run.summary?.ok} terminada{:else} {tr('con errores')}{/if}
        </strong>
        <span class="muted">
          {#if !run.done}{run.stage} · {/if}{tr('{0} tareas · {1} {2}', counts.done, counts.changed, run.check ? tr('se cambiarían') : tr('con cambios'))}{#if counts.failed} · <span class="bad">{counts.failed} fallidas</span>{/if} · {fmtTime(elapsed)}
        </span>
      </div>
    </div>
    <div class="actions">
      <button class="btn sm" onclick={() => (showLog = !showLog)}>
        {#if showLog}<ListChecks size={14} /> {tr('Tareas')}{:else}<ScrollText size={14} /> {tr('Registro completo')}{/if}
      </button>
      {#if !run.done}
        <button class="btn sm danger" onclick={() => api.CancelRun(run.runId)}><Square size={13} /> {tr('Cancelar')}</button>
      {:else}
        <button class="btn sm" onclick={onclose}>{tr('Cerrar')}</button>
      {/if}
    </div>
  </header>

  {#if run.done && run.summary?.error && !run.summary.canceled}
    <p class="error">{run.summary.error}</p>
  {/if}

  {#if run.done && !run.summary?.canceled}
    <div class="verdict" class:good={run.summary?.ok} class:badv={!run.summary?.ok}>
      {#if run.uninstall?.length && run.summary?.ok}
        <p class="big">{tr('Desinstalado del servidor.')}</p>
        <p>{tr('Draupnode ya no lo gestiona.')}</p>
      {:else if run.uninstall?.length}
        <p class="big">{tr('No se pudo desinstalar del todo: se paró con errores.')}</p>
        <p>{tr('Lo que se quitó antes del fallo queda quitado. El módulo sigue en el servidor: corrige el problema y vuelve a intentarlo.')}</p>
        <ul>{#each failedTasks as t}<li>{t.name} <span class="muted">· {roleName(t.role)}</span></li>{/each}</ul>
      {:else if run.check && run.summary?.ok}
        {#if changedTasks.length}
          <p class="big">{tr('Simulación completada. Todavía no se ha aplicado nada en el servidor.')}</p>
          <p>{tr('Para aplicar la configuración pulsa')} <strong>{tr('Aplicar')}</strong>{tr('. Se harán estos {0} cambios:', changedTasks.length)}</p>
          <ul>{#each changedTasks as t}<li>{t.name} <span class="muted">· {roleName(t.role)}</span></li>{/each}</ul>
        {:else}
          <p class="big">{tr('Configuración ya aplicada en el servidor.')}</p>
          <p>{tr('La simulación no ha encontrado nada pendiente:')} <strong>{tr('no es necesario pulsar Aplicar')}</strong>.</p>
        {/if}
      {:else if run.check}
        <p><strong>{tr('La simulación encontró {0} problema{1}.', failedTasks.length || '', failedTasks.length === 1 ? '' : 's')}</strong> {tr('No se ha cambiado nada en el servidor. Revísalo antes de aplicar:')}</p>
        <ul>{#each failedTasks as t}<li>{t.name} <span class="muted">· {roleName(t.role)}</span></li>{/each}</ul>
      {:else if run.summary?.ok}
        <p class="big">{tr('Configuración aplicada en el servidor.')}</p>
        {#if changedTasks.length}<p>{tr('Se hicieron {0} cambios (marcados como «hecho»).', changedTasks.length)}</p>{:else}<p>{tr('No hizo falta cambiar nada: ya estaba aplicada.')}</p>{/if}
      {:else}
        <p class="big">{tr('No se pudo aplicar del todo: se paró con errores.')}</p>
        <p>{tr('Lo que se hizo antes del fallo queda hecho. Corrige el problema y vuelve a aplicar: lo que ya está bien no se repite.')}</p>
        <ul>{#each failedTasks as t}<li>{t.name} <span class="muted">· {roleName(t.role)}</span></li>{/each}</ul>
      {/if}
    </div>
  {/if}

  {#if run.notes.length}
    <div class="notes">
      <div class="notes-t">{tr('Para que lo sepas')}</div>
      {#each run.notes as n}<p><Info size={15} /> <span class="selectable"><Linkify text={n} /></span></p>{/each}
    </div>
  {/if}

  {#if run.tasks.length && !showLog}
    <div class="legend">
      <span class="ok"><CircleCheck size={13} /> {tr('ya está bien')}</span>
      <span class="ch"><CircleDot size={13} /> {run.check ? tr('se cambiará al aplicar') : tr('hecho ahora')}</span>
      <span><CircleMinus size={13} /> {tr('no hace falta en este servidor')}</span>
      <span class="ko"><CircleX size={13} /> {tr('fallo')}</span>
    </div>
  {/if}

  <div class="list" bind:this={listEl} onscroll={onScroll}>
    {#if showLog}
      <pre class="log selectable">{run.lines.join('\n') || tr('Sin salida todavía…')}</pre>
    {:else if run.tasks.length === 0}
      <p class="muted pad"><LoaderCircle size={14} class="spin" /> {run.stage}</p>
    {:else}
      {#each groups as g}
        <div class="group">{roleName(g.role)}</div>
        {#each g.tasks as t}
          <div class="task {t.status}">
            <span class="ic">
              {#if t.status === 'running'}<LoaderCircle size={15} class="spin" />
              {:else if t.status === 'ok'}<CircleCheck size={15} />
              {:else if t.status === 'changed'}<CircleDot size={15} />
              {:else if t.status === 'failed'}<CircleX size={15} />
              {:else}<CircleMinus size={15} />{/if}
            </span>
            <span class="name">{t.name}{#if t.handler} <em>{tr('(al final)')}</em>{/if}</span>
            <span class="st">
              {stLabel(t.status)}
            </span>
          </div>
          {#if t.status === 'running' && t.progress?.length}<pre class="prog selectable">{t.progress.join('\n')}</pre>{/if}
          {#if t.msg}<pre class="msg selectable"><Linkify text={t.msg} /></pre>{/if}
          {#each t.diffs as d}<pre class="diff selectable">{d}</pre>{/each}
        {/each}
      {/each}
    {/if}
  </div>
</section>

<style>
  .run { display: flex; flex-direction: column; gap: 12px; padding: 16px; margin-bottom: 16px; }
  .run.ok { border-color: color-mix(in srgb, var(--success) 50%, var(--border)); }
  .run.fail { border-color: color-mix(in srgb, var(--danger) 50%, var(--border)); }
  header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .state { display: flex; gap: 12px; align-items: center; }
  .state > :global(svg) { color: var(--accent); flex: none; }
  .ok .state > :global(svg) { color: var(--success); }
  .fail .state > :global(svg) { color: var(--danger); }
  .state div { display: flex; flex-direction: column; }
  .state strong { display: flex; align-items: center; gap: 6px; }
  .state span { font-size: 12.5px; }
  .bad { color: var(--danger); }
  .actions { display: flex; gap: 6px; }
  .error { color: var(--danger); font-size: 13px; }
  .verdict { padding: 12px 14px; border-radius: var(--radius-sm); font-size: 13.5px; line-height: 1.5; display: flex; flex-direction: column; gap: 6px; }
  .verdict.good { background: color-mix(in srgb, var(--success) 12%, transparent); }
  .verdict.badv { background: color-mix(in srgb, var(--danger) 12%, transparent); }
  .verdict .big { font-weight: 600; font-size: 14.5px; }
  .verdict ul { margin: 0; padding-left: 20px; }
  .verdict li { margin: 2px 0; }
  .notes-t { font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; color: var(--muted); }
  .legend span { display: inline-flex; align-items: center; gap: 5px; }
  .legend .ok :global(svg) { color: var(--success); }
  .legend .ch :global(svg) { color: var(--accent); }
  .legend .ko :global(svg) { color: var(--danger); }
  .notes { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--accent-soft); }
  .notes p { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
  .notes :global(svg) { flex: none; color: var(--accent); margin-top: 2px; }
  .list { max-height: 46vh; overflow-y: auto; border: 1px solid var(--border-soft); border-radius: var(--radius-sm); background: var(--panel-2); }
  .pad { padding: 14px; display: flex; gap: 8px; align-items: center; }
  .group { position: sticky; top: 0; z-index: 1; padding: 7px 12px; font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); background: var(--panel); border-bottom: 1px solid var(--border-soft); }
  .task { display: grid; grid-template-columns: 22px 1fr auto; gap: 8px; align-items: center; padding: 6px 12px; font-size: 13px; border-bottom: 1px solid var(--border-soft); }
  .task .ic { display: flex; color: var(--muted); }
  .task.ok .ic { color: var(--success); }
  .task.changed .ic, .task.changed .st { color: var(--accent); }
  .task.failed .ic, .task.failed .st { color: var(--danger); }
  .task.running .ic { color: var(--accent); }
  .task.skipped { color: var(--muted); }
  .task .st { font-size: 12px; color: var(--muted); }
  .task em { font-style: normal; color: var(--muted); font-size: 12px; }
  .msg, .diff, .log { margin: 0; font-family: var(--mono); font-size: 12px; white-space: pre-wrap; word-break: break-word; }
  .msg { padding: 8px 12px 10px 42px; color: var(--danger); background: var(--danger-soft); }
  .diff { padding: 8px 12px 10px 42px; color: var(--text); background: var(--accent-soft); }
  .log { padding: 12px; line-height: 1.5; }
  .prog { margin: 2px 0 6px 30px; padding: 8px 10px; max-height: 170px; overflow: hidden; background: var(--panel-2); border-radius: var(--radius-sm); font-family: var(--mono); font-size: 11.5px; line-height: 1.45; color: var(--muted); white-space: pre-wrap; word-break: break-all; }
</style>
