<script lang="ts">
  // Instantáneas del disco en el proveedor (Hetzner Cloud, DigitalOcean), en el
  // Resumen de la ficha: vincular el servidor con su máquina, hacer una ahora,
  // hacerla sola antes de aplicar, volver a una y borrarlas.
  import { onDestroy } from 'svelte'
  import { Camera, LoaderCircle, ExternalLink, RotateCcw, Trash2 } from '@lucide/svelte'
  import Modal from './Modal.svelte'
  import { api, errorText, onEvent, type CloudProvider, type Server, type SnapshotInfo, type CloudSnapshot } from '../lib/api'
  import { toast, withVault, refreshServers, confirmDialog } from '../lib/state.svelte'
  import { t, locale } from '../lib/i18n.svelte'

  let { server, onrestored }: { server: Server; onrestored: () => void } = $props()

  const link = $derived(server.cloud)
  let providers = $state<CloudProvider[]>([])
  let info = $state<SnapshotInfo | null>(null)
  let locked = $state(false)
  let error = $state('')
  let busy = $state<'' | 'link' | 'list' | 'take' | 'restore' | 'delete' | 'token'>('')
  let stage = $state('')
  let tokenFor = $state('')
  let token = $state('')
  let restoring = $state<CloudSnapshot | null>(null)
  let typed = $state('')
  let hidden = $state(readHidden())

  const off = onEvent('snapshot', (d: { serverId: string; stage: string }) => {
    if (d.serverId === server.id) stage = d.stage
  })
  onDestroy(off)

  function readHidden() {
    try { return localStorage.getItem('dn-instantaneas-ocultas-' + server.id) === '1' } catch { return false }
  }
  function hide(v: boolean) {
    hidden = v
    try { if (v) localStorage.setItem('dn-instantaneas-ocultas-' + server.id, '1'); else localStorage.removeItem('dn-instantaneas-ocultas-' + server.id) } catch { /* sin almacenamiento */ }
  }

  api.CloudProviders().then((p) => (providers = p)).catch(() => {})
  const provName = (id?: string) => providers.find((p) => p.id === id)?.name ?? id ?? ''

  // La lista se lee sola si la bóveda está abierta; si no, se pide con un botón.
  async function load(ask = false) {
    if (!link) return
    busy = 'list'
    error = ''
    try {
      info = ask ? await withVault(() => api.ServerSnapshots(server.id), t('El token del proveedor está en la bóveda.')) : await api.ServerSnapshots(server.id)
      locked = false
    } catch (e) {
      const msg = errorText(e)
      if (!ask && /VAULT_(LOCKED|MISSING)/.test(String(e))) locked = true
      else error = msg
    } finally {
      busy = ''
    }
  }
  let loadedFor = ''
  $effect(() => {
    const key = link ? server.id + ':' + link.id : ''
    if (key && key !== loadedFor) { loadedFor = key; load() }
  })

  async function linkTo(provider: string) {
    const p = providers.find((x) => x.id === provider)
    if (!p?.hasToken) { tokenFor = provider; return }
    busy = 'link'
    error = ''
    try {
      await withVault(() => api.LinkServerCloud(server.id, provider), t('El token del proveedor está en la bóveda.'))
      await refreshServers()
      toast(t('Vinculado con {0}: hará una instantánea antes de aplicar', p.name))
    } catch (e) {
      error = errorText(e)
    } finally {
      busy = ''
    }
  }
  async function saveToken() {
    busy = 'token'
    error = ''
    try {
      await withVault(() => api.CloudSetToken(tokenFor, token), t('El token se guarda cifrado en la bóveda.'))
      token = ''
      providers = await api.CloudProviders()
      const p = tokenFor
      tokenFor = ''
      busy = ''
      await linkTo(p)
    } catch (e) {
      error = errorText(e)
    } finally {
      busy = ''
    }
  }
  async function unlink() {
    const ok = await confirmDialog({ title: t('Desvincular {0}', server.name), message: t('Draupnode deja de hacer instantáneas de este servidor. Las que ya hay se quedan en el proveedor (y se siguen pagando): bórralas antes si no las quieres.'), confirmLabel: t('Desvincular') })
    if (!ok) return
    try { await api.UnlinkServerCloud(server.id); info = null; await refreshServers() } catch (e) { toast(errorText(e), 'error') }
  }
  async function setOptions(before: boolean, keep: number) {
    try { await api.SetSnapshotOptions(server.id, before, keep); await refreshServers() } catch (e) { toast(errorText(e), 'error') }
  }
  async function take() {
    busy = 'take'
    stage = ''
    try {
      const warn = await withVault(() => api.TakeServerSnapshot(server.id), t('El token del proveedor está en la bóveda.'))
      toast(warn || t('Instantánea hecha'), warn ? 'error' : undefined)
      busy = ''
      await load()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      busy = ''
      stage = ''
    }
  }
  async function restore() {
    const s = restoring
    if (!s) return
    restoring = null
    typed = ''
    busy = 'restore'
    stage = ''
    try {
      await withVault(() => api.RestoreServerSnapshot(server.id, s.id), t('El token del proveedor está en la bóveda.'))
      toast(t('{0} ha vuelto a la instantánea del {1}', server.name, when(s.created)))
      onrestored()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      busy = ''
      stage = ''
    }
  }
  async function remove(s: CloudSnapshot) {
    const ok = await confirmDialog({ title: t('Borrar la instantánea'), message: t('Se borra «{0}» en {1}. No se puede deshacer.', s.name, provName(link?.provider)), confirmLabel: t('Borrar'), danger: true })
    if (!ok) return
    busy = 'delete'
    try {
      await withVault(() => api.DeleteServerSnapshot(server.id, s.id), t('El token del proveedor está en la bóveda.'))
      await load()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      busy = ''
    }
  }

  const when = (iso: string) => new Date(iso).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' })
  const money = (v: number) => new Intl.NumberFormat(locale(), { style: 'currency', currency: info?.currency || 'EUR', maximumFractionDigits: 2 }).format(v)
  const total = $derived((info?.snapshots ?? []).reduce((n, s) => n + s.sizeGb, 0))
  const tokenProv = $derived(providers.find((p) => p.id === tokenFor))
</script>

{#if link || !hidden}
<section class="card block">
  <div class="h2row">
    <h2><Camera size={17} /> {t('Instantáneas del disco')}{#if link}<span class="muted sub">{' · '}{provName(link.provider)}{link.name ? ` (${link.name})` : ''}</span>{/if}</h2>
    {#if link}
      <button class="btn sm" onclick={take} disabled={!!busy}>{#if busy === 'take'}<LoaderCircle size={14} class="spin" /> {t('Haciéndola…')}{:else}{t('Hacer una ahora')}{/if}</button>
    {/if}
  </div>

  {#if !link}
    <p class="muted">{t('Si este servidor está en Hetzner Cloud o DigitalOcean, vincúlalo: Draupnode hará una instantánea del disco entero antes de aplicar, y si algo sale mal podrás volver a ella.')}</p>
    {#if tokenProv}
      <div class="tok">
        <p class="small">{tokenProv.tokenHelp}</p>
        <button class="lnk small" onclick={() => api.OpenURL(tokenProv.tokenUrl)}><ExternalLink size={13} /> {t('Abrir la página del proveedor')}</button>
        <label class="field"><span>{t('Token de la API de {0}', tokenProv.name)}</span><input class="input mono" type="password" bind:value={token} autocomplete="off" spellcheck="false" /></label>
        <div class="acts">
          <button class="btn primary sm" onclick={saveToken} disabled={!token.trim() || busy === 'token'}>{busy === 'token' ? t('Comprobando…') : t('Guardar y vincular')}</button>
          <button class="btn ghost sm" onclick={() => (tokenFor = '')}>{t('Cancelar')}</button>
        </div>
      </div>
    {:else}
      <div class="acts">
        {#each providers as p}
          <button class="btn sm" onclick={() => linkTo(p.id)} disabled={!!busy}>{busy === 'link' ? t('Buscando su IP…') : t('Vincular con {0}', p.name)}</button>
        {/each}
        <button class="lnk small" onclick={() => hide(true)}>{t('No está en ninguno: ocultar')}</button>
      </div>
    {/if}
  {:else}
    <div class="opts">
      <label class="check"><input type="checkbox" checked={!!link.snapshotBeforeApply} onchange={(e) => setOptions((e.target as HTMLInputElement).checked, link.keepSnapshots || 3)} /> {t('Hacer una antes de aplicar o desinstalar')}</label>
      <label class="keep">{t('Guardar las últimas')}
        <select class="input sm" value={link.keepSnapshots || 3} onchange={(e) => setOptions(!!link.snapshotBeforeApply, Number((e.target as HTMLSelectElement).value))}>
          {#each [1, 2, 3, 5, 7, 10] as n}<option value={n}>{n}</option>{/each}
        </select>
      </label>
    </div>

    {#if busy === 'take' || busy === 'restore'}
      <p class="small info-t"><LoaderCircle size={14} class="spin ic" /> {stage || (busy === 'take' ? t('Pidiendo la instantánea al proveedor…') : t('Pidiendo al proveedor que vuelva a la instantánea…'))}</p>
    {/if}
    {#if error}<p class="small bad-t">{error}</p>{/if}

    {#if locked}
      <p class="muted small">{t('El token del proveedor está en la bóveda.')} <button class="lnk small" onclick={() => load(true)}>{t('Desbloquear y ver las instantáneas')}</button></p>
    {:else if busy === 'list' && !info}
      <p class="muted small"><LoaderCircle size={14} class="spin ic" /> {t('Leyendo…')}</p>
    {:else if info && !info.snapshots.length}
      <p class="muted">{t('Aún no hay ninguna. Se hará la primera al aplicar, o pulsa «Hacer una ahora».')}</p>
    {:else if info}
      <ul class="snaps">
        {#each info.snapshots as s (s.id)}
          <li>
            <div class="nm">
              <strong>{when(s.created)}</strong>
              <span class="muted small mono">{s.name}</span>
            </div>
            <span class="tag">{s.draupnode ? 'Draupnode' : t('hecha a mano')}</span>
            <span class="muted small sz">{s.sizeGb ? `${s.sizeGb.toFixed(1)} GB · ${t('{0}/mes', money(s.sizeGb * info.pricePerGb))}` : t('creándose…')}</span>
            <button class="btn sm ghost" onclick={() => { restoring = s; typed = '' }} disabled={!!busy} title={t('Volver el disco entero a como estaba entonces')}><RotateCcw size={14} /> {t('Volver a esta…')}</button>
            <button class="btn sm ghost icon" onclick={() => remove(s)} disabled={!!busy} title={t('Borrar')} aria-label={t('Borrar')}><Trash2 size={14} /></button>
          </li>
        {/each}
      </ul>
      <p class="muted small">{t('Se guardan las {0} últimas de Draupnode (las hechas a mano no se borran solas). Ocupan {1} GB: unos {2} al mes en el proveedor.', link.keepSnapshots || 3, total.toFixed(1), money(total * info.pricePerGb))}</p>
    {/if}
    <p class="foot"><button class="lnk small" onclick={unlink}>{t('Desvincular')}</button></p>
  {/if}
</section>
{:else}
  <p class="muted small showlink"><button class="lnk small" onclick={() => hide(false)}>{t('Instantáneas del disco (Hetzner, DigitalOcean)…')}</button></p>
{/if}

{#if restoring}
  <Modal title={t('Volver a la instantánea del {0}', when(restoring.created))} onclose={() => (restoring = null)}>
    <p>{t('El disco entero de {0} vuelve a como estaba entonces. Todo lo que haya cambiado desde esa fecha (datos de las apps, bases de datos, ficheros subidos) se pierde. El servidor se apaga mientras tanto: unos minutos sin servicio.', server.name)}</p>
    <p class="muted small">{t('Si después de esa fecha aplicaste módulos, pulsa luego «Simular» en Módulos para ver qué falta. Si quieres conservar lo de ahora, haz antes otra instantánea.')}</p>
    <label class="field"><span>{t('Escribe el nombre del servidor para confirmar: {0}', server.name)}</span><input class="input" bind:value={typed} autocomplete="off" /></label>
    {#snippet footer()}
      <button class="btn ghost" onclick={() => (restoring = null)}>{t('Cancelar')}</button>
      <button class="btn danger" onclick={restore} disabled={typed.trim() !== server.name}>{t('Volver a esta instantánea')}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .block { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
  .block h2 { display: flex; gap: 8px; align-items: center; font-size: 15px; margin: 0; }
  .block h2 :global(svg) { color: var(--accent); }
  .block p { margin: 0; }
  .sub { font-size: 13px; font-weight: 400; }
  .small { font-size: 12px; }
  .bad-t { color: var(--danger); }
  .info-t { color: var(--info); }
  .lnk { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-align: left; display: inline-flex; align-items: center; gap: 4px; }
  .lnk:hover { text-decoration: underline; }
  .h2row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .tok { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; max-width: 560px; }
  .field { display: flex; flex-direction: column; gap: 4px; width: 100%; }
  .field span { font-size: 12.5px; color: var(--muted); }
  .opts { display: flex; gap: 18px; flex-wrap: wrap; align-items: center; font-size: 13px; }
  .check, .keep { display: inline-flex; gap: 6px; align-items: center; }
  .keep select { width: auto; }
  .snaps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .snaps li { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 6px 10px; }
  .nm { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .nm .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag { font-size: 11px; color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; }
  .sz { min-width: 140px; text-align: right; }
  .foot { margin-top: 2px; }
  .showlink { margin: -4px 0 14px; }
  :global(.ic) { vertical-align: -2px; }
</style>
