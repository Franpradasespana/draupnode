<script lang="ts">
  // Historial de ejecuciones (Previsualizar / Aplicar / Desinstalar) de las
  // plantillas de un servidor, de una sola o (serverId vacío) de todos los
  // servidores, como en el Panel. Pulsando una se ve su registro.
  import { History, CircleCheck, CircleX, CircleSlash, Circle, ScrollText, LoaderCircle } from '@lucide/svelte'
  import Modal from './Modal.svelte'
  import { api, type RunEntry } from '../lib/api'

  let { serverId, projectId = '', refreshKey = '', limit = 0, title = 'Historial de ejecuciones' }: { serverId: string; projectId?: string; refreshKey?: string; limit?: number; title?: string } = $props()

  let list = $state<RunEntry[]>([])
  let all = $state(false)
  let open = $state<{ e: RunEntry; text: string; loading: boolean } | null>(null)

  $effect(() => {
    void refreshKey
    api.RunHistory(serverId, projectId, limit).then((l) => (list = l)).catch(() => {})
  })
  const shown = $derived(all ? list : list.slice(0, 8))

  async function view(e: RunEntry) {
    open = { e, text: '', loading: true }
    try {
      const t = await api.ReadRunLog(e.projectId, e.name)
      if (open) open = { e, text: t || '(vacío)', loading: false }
    } catch (err) {
      if (open) open = { e, text: String(err), loading: false }
    }
  }
  const when = (iso: string) => new Date(iso).toLocaleString([], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  const dur = (ms: number) => (ms >= 60000 ? `${Math.round(ms / 60000)} min` : `${Math.max(1, Math.round(ms / 1000))} s`)
</script>

<section class="card hist">
  <h2><History size={17} /> {title}</h2>
  {#if !list.length}
    <p class="muted">Todavía no se ha previsualizado ni aplicado nada{projectId || !serverId ? '' : ' en este servidor'}.</p>
  {:else}
    <div class="rows">
      {#each shown as e (e.projectId + e.name)}
        <button class="row" onclick={() => view(e)}>
          <span class="st">
            {#if !e.known}<Circle size={15} class="unk" />{:else if e.canceled}<CircleSlash size={15} class="unk" />{:else if e.ok}<CircleCheck size={15} class="ok" />{:else}<CircleX size={15} class="bad" />{/if}
          </span>
          <span class="when mono">{when(e.at)}</span>
          <span class="mode m-{e.mode}">{e.mode}</span>
          {#if !serverId}<strong class="proj">{e.server}</strong><span class="proj muted">{e.project}</span>{:else if !projectId}<strong class="proj">{e.project}</strong>{/if}
          <span class="res muted">
            {#if !e.known}—{:else if e.canceled}cancelada{:else if e.ok}{e.changed ? `${e.changed} cambio(s)` : 'sin cambios'}{:else}{e.error || `${e.failed} fallo(s)`}{/if}
            {#if e.known && e.durationMs} · {dur(e.durationMs)}{/if}
          </span>
          <ScrollText size={14} class="ic" />
        </button>
      {/each}
    </div>
    {#if !limit && list.length > 8}<button class="btn sm ghost" onclick={() => (all = !all)}>{all ? 'Ver menos' : `Ver las ${list.length}`}</button>{/if}
  {/if}
</section>

{#if open}
  <Modal title={`Registro · ${open.e.project} · ${open.e.mode} · ${when(open.e.at)}`} width={980} onclose={() => (open = null)}>
    {#if open.loading}<p class="muted"><LoaderCircle size={15} class="spin" /> Leyendo…</p>
    {:else}<pre class="log selectable">{open.text}</pre>{/if}
  </Modal>
{/if}

<style>
  .hist { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; align-items: flex-start; }
  h2 { display: flex; gap: 8px; align-items: center; margin: 0; font-size: 16px; }
  .rows { display: flex; flex-direction: column; width: 100%; }
  .row { display: flex; gap: 10px; align-items: center; padding: 7px 6px; border: 0; border-top: 1px solid var(--border-soft); background: none; font: inherit; font-size: 13px; color: var(--text); cursor: pointer; text-align: left; }
  .row:hover { background: var(--panel-2); }
  .st { display: flex; }
  .st :global(.ok) { color: var(--success); }
  .st :global(.bad) { color: var(--danger); }
  .st :global(.unk) { color: var(--muted); }
  .when { font-size: 12px; color: var(--muted); white-space: nowrap; }
  .mono { font-family: var(--mono); }
  .mode { font-size: 11.5px; padding: 1px 8px; border-radius: 999px; background: var(--panel-2); border: 1px solid var(--border-soft); }
  .m-aplicar { color: var(--accent); }
  .m-desinstalar { color: var(--danger); }
  .proj { white-space: nowrap; }
  .res { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row :global(.ic) { color: var(--muted); flex: none; }
  .log { max-height: 65vh; overflow: auto; margin: 0; padding: 12px; background: var(--panel-2); border-radius: var(--radius-sm); font-family: var(--mono); font-size: 12px; white-space: pre-wrap; }
</style>
