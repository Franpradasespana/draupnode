<script lang="ts">
  // Panel → «Pendiente en tus servidores»: una fila por servidor con lo que
  // tiene sin hacer (módulos sin aplicar, actualizaciones, reinicio) y
  // botones para hacerlo en los marcados, uno detrás de otro.
  import { Hammer, PackageCheck, RotateCcw, CircleCheck } from '@lucide/svelte'
  import { ui, openServerModules, openServer, confirmDialog } from '../lib/state.svelte'
  import { alerts, pendingModules } from '../lib/alerts.svelte'
  import { bulk, runBulk, type BulkKind } from '../lib/bulk.svelte'
  import { t, plural } from '../lib/i18n.svelte'

  const rows = $derived(
    ui.servers
      .map((s) => {
        const p = ui.projects.find((x) => x.serverId === s.id)
        const up = alerts.fichas[s.id]?.overview.updates
        return { s, mods: p ? pendingModules(p) : 0, updates: up?.total ?? 0, security: up?.security ?? 0, reboot: !!up?.reboot, read: !!alerts.fichas[s.id] }
      })
      .filter((r) => r.mods || r.updates || r.reboot),
  )
  let picked = $state<Record<string, boolean>>({})
  const sel = $derived(rows.filter((r) => picked[r.s.id] ?? true))
  const nMods = $derived(sel.filter((r) => r.mods).length)
  const nUpd = $derived(sel.filter((r) => r.updates).length)
  const nReb = $derived(sel.filter((r) => r.reboot).length)

  async function go(kind: BulkKind) {
    const list = sel.filter((r) => (kind === 'apply' ? r.mods : kind === 'upgrade' ? r.updates : r.reboot))
    if (!list.length) return
    const names = list.map((r) => r.s.name).join(', ')
    const msg =
      kind === 'apply' ? t('Se aplican sus módulos, uno detrás de otro, en: {0}. Lo que ya esté bien no se toca.', names)
      : kind === 'upgrade' ? t('Se instalan los paquetes pendientes del sistema (apt upgrade), uno detrás de otro, en: {0}. Las apps siguen funcionando.', names)
      : t('Se reinician, uno detrás de otro: {0}. Durante uno o dos minutos cada uno no responderá y sus apps estarán paradas.', names)
    const title = kind === 'apply' ? t('Aplicar módulos en {0}', plural(list.length, 'servidor', 'servidores'))
      : kind === 'upgrade' ? t('Instalar actualizaciones en {0}', plural(list.length, 'servidor', 'servidores'))
      : t('Reiniciar {0}', plural(list.length, 'servidor', 'servidores'))
    const ok = await confirmDialog({ title, message: msg, confirmLabel: kind === 'apply' ? t('Aplicar') : kind === 'upgrade' ? t('Instalar') : t('Reiniciar'), danger: kind === 'reboot' })
    if (!ok) return
    await runBulk(title, list.map((r) => ({ serverId: r.s.id, kind })))
  }
</script>

<section class="pend">
  <h2>{t('Pendiente en tus servidores')}</h2>
  {#if !rows.length}
    <p class="card ok-box"><CircleCheck size={17} /> {t('Nada pendiente: módulos aplicados y sistemas al día (de lo que se ha leído).')}</p>
  {:else}
    <div class="card tbl">
      <table>
        <thead>
          <tr>
            <th class="ck"><input type="checkbox" aria-label={t('Marcar todos')} checked={sel.length === rows.length} onchange={(e) => { for (const r of rows) picked[r.s.id] = e.currentTarget.checked }} /></th>
            <th>{t('Servidor')}</th>
            <th>{t('Módulos sin aplicar')}</th>
            <th>{t('Actualizaciones')}</th>
            <th>{t('Reinicio')}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.s.id)}
            <tr>
              <td class="ck"><input type="checkbox" aria-label={r.s.name} checked={picked[r.s.id] ?? true} onchange={(e) => (picked[r.s.id] = e.currentTarget.checked)} /></td>
              <td><button class="lnk" onclick={() => openServer(r.s.id)}>{r.s.name}</button></td>
              <td>{#if r.mods}<button class="lnk info-t" onclick={() => openServerModules(r.s.id)}>{plural(r.mods, 'módulo', 'módulos')}</button>{:else}<span class="muted">—</span>{/if}</td>
              <td>{#if r.updates}{t('{0} pendientes', r.updates)}{#if r.security}{' · '}<span class="warn-t">{t('{0} de seguridad', r.security)}</span>{/if}{:else}<span class="muted">{r.read ? t('al día') : '—'}</span>{/if}</td>
              <td>{#if r.reboot}<span class="warn-t">{t('pendiente')}</span>{:else}<span class="muted">—</span>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <div class="acts">
        <span class="muted small">{t('En los marcados, uno detrás de otro:')}</span>
        <button class="btn sm primary" disabled={!nMods || bulk.running} onclick={() => go('apply')}><Hammer size={14} /> {t('Aplicar módulos ({0})', nMods)}</button>
        <button class="btn sm" disabled={!nUpd || bulk.running} onclick={() => go('upgrade')}><PackageCheck size={14} /> {t('Instalar actualizaciones ({0})', nUpd)}</button>
        <button class="btn sm" disabled={!nReb || bulk.running} onclick={() => go('reboot')}><RotateCcw size={14} /> {t('Reiniciar ({0})', nReb)}</button>
      </div>
      <p class="muted small note">{t('Las actualizaciones y el reinicio salen de la última lectura de cada ficha (el Panel las vuelve a leer cada 5 minutos si la contraseña está guardada).')}</p>
    </div>
  {/if}
</section>

<style>
  .pend { margin-bottom: 22px; }
  h2 { font-size: 16px; margin: 0 0 10px; }
  .tbl { padding: 6px 14px 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th { text-align: left; font-size: 12px; color: var(--muted); font-weight: 600; padding: 8px 8px 6px; border-bottom: 1px solid var(--border-soft); }
  td { padding: 8px; border-bottom: 1px solid var(--border-soft); }
  .ck { width: 28px; }
  .lnk { background: none; border: 0; padding: 0; font: inherit; color: var(--text); cursor: pointer; font-weight: 600; }
  .lnk:hover { color: var(--accent); }
  .info-t { color: var(--info); font-weight: 500; }
  .warn-t { color: var(--warning); }
  .acts { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 12px; }
  .small { font-size: 12.5px; }
  .note { margin: 8px 0 0; }
  .ok-box { display: flex; align-items: center; gap: 10px; margin: 0; padding: 12px 14px; font-size: 13.5px; }
  .ok-box :global(svg) { color: var(--success); flex: none; }
</style>
