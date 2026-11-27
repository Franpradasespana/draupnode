<script lang="ts">
  // Historial de la configuración de un servidor (kind «p») o de una plantilla
  // («r»): cada cambio de módulos u opciones con lo que cambió, y «Volver a
  // esta versión». Volver solo cambia la configuración: en el servidor no se
  // toca nada hasta Aplicar.
  import { GitCommitVertical, ChevronDown, ChevronRight, RotateCcw } from '@lucide/svelte'
  import { api, errorText, type ConfigVersion } from '../lib/api'
  import { toast, confirmDialog } from '../lib/state.svelte'
  import { t as tr, plural } from '../lib/i18n.svelte'

  let { kind, id, refreshKey = '', dirty = false, onrestored }: { kind: 'p' | 'r'; id: string; refreshKey?: string; dirty?: boolean; onrestored: () => void } = $props()

  let list = $state<ConfigVersion[]>([])
  let all = $state(false)
  let open = $state<Record<string, boolean>>({})
  let busy = $state(false)

  function load() {
    api.ConfigHistory(kind, id).then((l) => (list = l ?? [])).catch(() => {})
  }
  $effect(() => {
    void refreshKey
    void id
    load()
  })
  const shown = $derived(all ? list : list.slice(0, 6))
  const when = (iso: string) => new Date(iso).toLocaleString([], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

  async function restore(v: ConfigVersion) {
    if (dirty) return toast(tr('Guarda o deshaz antes los cambios sin guardar'), 'error')
    const ok = await confirmDialog({
      title: tr('¿Volver a la versión del {0}?', when(v.at)),
      message: kind === 'p'
        ? tr('Los módulos y sus opciones quedarán como en esa versión. En el servidor no cambia nada hasta que pulses Aplicar; quitar un módulo de la lista no lo desinstala. Esta vuelta atrás también queda en el historial.')
        : tr('Los módulos y sus opciones de la plantilla quedarán como en esa versión. Los servidores en los que se aplicó no cambian. Esta vuelta atrás también queda en el historial.'),
      confirmLabel: tr('Volver a esta versión'),
    })
    if (!ok) return
    busy = true
    try {
      await api.RestoreConfigVersion(kind, id, v.id)
      toast(tr('Configuración devuelta a la versión del {0}', when(v.at)))
      onrestored()
      load()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      busy = false
    }
  }
</script>

<section class="card hist">
  <h2><GitCommitVertical size={17} /> {tr('Historial de la configuración')}</h2>
  {#if !list.length}
    <p class="muted">{tr('Aquí aparecerá cada cambio de módulos u opciones, con lo que cambió, para poder volver atrás.')}</p>
  {:else}
    <div class="rows">
      {#each shown as v, i (v.id)}
        <div class="row">
          <button class="head" onclick={() => (open[v.id] = !open[v.id])} disabled={!v.changes.length}>
            {#if v.changes.length}{#if open[v.id]}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}{:else}<span class="sp"></span>{/if}
            <span class="when mono">{when(v.at)}</span>
            <span class="what">{v.reason || (v.changes.length === 1 ? v.changes[0] : plural(v.changes.length, 'cambio', 'cambios'))}</span>
            {#if i === 0}<span class="now">{tr('actual')}</span>{/if}
          </button>
          {#if i > 0}
            <button class="btn sm ghost" onclick={() => restore(v)} disabled={busy} title={tr('Volver a esta versión')}><RotateCcw size={14} /> {tr('Volver')}</button>
          {/if}
        </div>
        {#if open[v.id] && v.changes.length}
          <ul class="changes">
            {#each v.changes as c, ci (ci)}<li>{c}</li>{/each}
          </ul>
        {/if}
      {/each}
    </div>
    {#if list.length > 6}<button class="btn sm ghost" onclick={() => (all = !all)}>{all ? tr('Ver menos') : tr('Ver las {0}', list.length)}</button>{/if}
  {/if}
</section>

<style>
  .hist { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; align-items: flex-start; }
  h2 { display: flex; gap: 8px; align-items: center; margin: 0; font-size: 16px; }
  .rows { display: flex; flex-direction: column; width: 100%; }
  .row { display: flex; gap: 8px; align-items: center; border-top: 1px solid var(--border-soft); padding: 2px 0; }
  .head { flex: 1; min-width: 0; display: flex; gap: 10px; align-items: center; padding: 6px; border: 0; background: none; font: inherit; font-size: 13px; color: var(--text); cursor: pointer; text-align: left; }
  .head:disabled { cursor: default; }
  .head:not(:disabled):hover { background: var(--panel-2); }
  .sp { width: 14px; flex: none; }
  .when { font-size: 12px; color: var(--muted); white-space: nowrap; }
  .what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .now { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--panel-2); color: var(--muted); }
  .changes { margin: 0 0 6px 30px; padding-left: 16px; font-size: 12.5px; color: var(--muted); display: flex; flex-direction: column; gap: 2px; }
</style>
