<script lang="ts">
  // «Crear en la nube…»: elige proveedor (Hetzner Cloud o DigitalOcean), pon
  // su token una vez (va cifrado a la bóveda), región, tamaño con su precio,
  // nombre y clave SSH; Draupnode lo crea, espera a que arranque y lo da de alta.
  import { onDestroy } from 'svelte'
  import { Cloud, ExternalLink, KeyRound, LoaderCircle, CircleCheck, TriangleAlert } from '@lucide/svelte'
  import Modal from './Modal.svelte'
  import { api, errorText, onEvent, type CloudCatalog, type CloudProvider, type KeyInfo } from '../lib/api'
  import { toast, withVault, refreshServers, openServer } from '../lib/state.svelte'
  import { t, locale } from '../lib/i18n.svelte'

  let { onclose }: { onclose: () => void } = $props()

  let providers = $state<CloudProvider[]>([])
  let provider = $state('')
  let token = $state('')
  let catalog = $state<CloudCatalog | null>(null)
  let keys = $state<KeyInfo[]>([])
  let busy = $state('')
  let error = $state('')

  let region = $state('')
  let size = $state('')
  let name = $state(t('servidor-1'))
  let keyMode = $state<'new' | 'existing'>('new')
  let keyPath = $state('')
  let passphrase = $state('')
  let savePass = $state(true)

  let creating = $state(false)
  let stage = $state('')
  let stages = $state<string[]>([])
  const off = onEvent('cloud', (d: { stage: string }) => {
    stage = d.stage
    if (stages[stages.length - 1] !== d.stage) stages.push(d.stage)
  })
  onDestroy(off)

  const prov = $derived(providers.find((p) => p.id === provider))
  const sizes = $derived((catalog?.sizes ?? []).filter((s) => !s.regions?.length || !region || s.regions.includes(region)))
  const chosen = $derived(sizes.find((s) => s.id === size))
  const key = $derived(keys.find((k) => k.path === keyPath))
  const nameOk = $derived(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(name))
  const price = (v?: number, c?: string) => (v ? new Intl.NumberFormat(locale(), { style: 'currency', currency: c || 'EUR' }).format(v) : '')
  const ready = $derived(!!(catalog && region && size && nameOk && (keyMode === 'new' || keyPath)))

  async function loadProviders() {
    providers = await api.CloudProviders()
    keys = (await api.FindKeys()).filter((k) => !k.error && k.format !== 'ppk')
    keyPath = keys[0]?.path ?? ''
  }
  loadProviders().catch((e) => (error = errorText(e)))

  async function pick(id: string) {
    provider = id
    catalog = null
    error = ''
    region = ''
    size = ''
    if (providers.find((p) => p.id === id)?.hasToken) await loadCatalog()
  }
  async function loadCatalog() {
    busy = 'catalog'
    error = ''
    try {
      catalog = await withVault(() => api.CloudCatalog(provider), t('El token del proveedor está en la bóveda.'))
      region = catalog.regions[0]?.id ?? ''
      // El más barato con al menos 2 GB de RAM (Docker y alguna app caben).
      size = (catalog.sizes.find((s) => (s.ramMb ?? 0) >= 2048 && (!s.regions?.length || s.regions.includes(region))) ?? catalog.sizes[0])?.id ?? ''
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
      await withVault(() => api.CloudSetToken(provider, token), t('El token se guarda cifrado en la bóveda.'))
      token = ''
      providers = await api.CloudProviders()
      busy = ''
      await loadCatalog()
    } catch (e) {
      error = errorText(e)
    } finally {
      busy = ''
    }
  }
  async function forget() {
    try {
      await withVault(() => api.CloudForgetToken(provider))
      providers = await api.CloudProviders()
      catalog = null
    } catch (e) {
      error = errorText(e)
    }
  }
  $effect(() => {
    // Al cambiar de región, si el tamaño no está allí, el primero que sí.
    if (catalog && size && !sizes.some((s) => s.id === size)) size = sizes[0]?.id ?? ''
  })

  async function create() {
    creating = true
    error = ''
    stages = []
    stage = t('Empezando…')
    try {
      const srv = await withVault(() => api.CloudCreateServer({ provider, name, region, size, keyPath: keyMode === 'new' ? '' : keyPath, newKey: keyMode === 'new', passphrase, savePassphrase: savePass }))
      await refreshServers()
      toast(t('Servidor «{0}» creado en {1} ({2})', srv.name, prov?.name, srv.host))
      onclose()
      openServer(srv.id)
    } catch (e) {
      error = errorText(e)
      await refreshServers()
    } finally {
      creating = false
    }
  }
</script>

<Modal title={t('Crear un servidor en la nube')} {onclose} width={640}>
  {#if creating}
    <div class="progress">
      <p class="big"><LoaderCircle size={18} class="spin" /> {stage}</p>
      <div class="track"><i></i></div>
      <ul>{#each stages.slice(0, -1) as s}<li><CircleCheck size={13} /> {s}</li>{/each}</ul>
      <p class="muted small">{t('Suele tardar uno o dos minutos. No cierres Draupnode.')}</p>
    </div>
  {:else}
    <p class="muted small">{t('Draupnode crea un Ubuntu 24.04 con tu clave SSH, espera a que arranque y lo da de alta. Lo pagas en el proveedor, como cualquier servidor suyo.')}</p>

    <div class="provs">
      {#each providers as p (p.id)}
        <button class="prov" class:on={provider === p.id} onclick={() => pick(p.id)}>
          <Cloud size={18} /> <strong>{p.name}</strong>
          <span class="muted small">{p.hasToken ? t('token guardado') : t('falta el token')}</span>
        </button>
      {/each}
    </div>

    {#if prov && !prov.hasToken}
      <div class="box">
        <p class="small">{prov.tokenHelp}</p>
        <button class="lnk small" onclick={() => api.OpenURL(prov!.tokenUrl)}><ExternalLink size={13} /> {t('Abrir la página del proveedor')}</button>
        <label class="field"><span>{t('Token de la API')}</span><input class="input mono" type="password" bind:value={token} autocomplete="off" spellcheck="false" /></label>
        <p class="muted small">{t('Se comprueba y se guarda cifrado en la bóveda de Draupnode. No sale de tu equipo salvo para hablar con el proveedor.')}</p>
        <button class="btn primary sm" onclick={saveToken} disabled={!token.trim() || busy === 'token'}>{busy === 'token' ? t('Comprobando…') : t('Guardar el token')}</button>
      </div>
    {:else if prov && busy === 'catalog'}
      <p class="muted"><LoaderCircle size={15} class="spin" /> {t('Leyendo regiones y tamaños…')}</p>
    {:else if prov && catalog}
      <div class="grid">
        <label class="field"><span>{t('Región')}</span>
          <select class="input" bind:value={region}>{#each catalog.regions as r (r.id)}<option value={r.id}>{r.label}</option>{/each}</select>
        </label>
        <label class="field"><span>{t('Tamaño')}</span>
          <select class="input" bind:value={size}>{#each sizes as s (s.id)}<option value={s.id}>{s.label}{s.priceMonth ? ' · ' + t('{0}/mes', price(s.priceMonth, s.currency)) : ''}</option>{/each}</select>
        </label>
        <label class="field"><span>{t('Nombre')}</span>
          <input class="input mono" bind:value={name} spellcheck="false" />
          {#if !nameOk}<small class="err">{t('Minúsculas, números y guiones (sin empezar ni acabar en guion).')}</small>{/if}
        </label>
        <div class="field"><span>{t('Clave SSH')}</span>
          <label class="radio"><input type="radio" bind:group={keyMode} value="new" /> {t('Crear una solo para este servidor (recomendado)')}</label>
          <label class="radio"><input type="radio" bind:group={keyMode} value="existing" disabled={!keys.length} /> {t('Usar una que ya tengo')}</label>
          {#if keyMode === 'existing'}
            <select class="input" bind:value={keyPath}>{#each keys as k (k.path)}<option value={k.path}>{k.name}{k.encrypted ? ' 🔒' : ''}</option>{/each}</select>
            {#if key?.encrypted}
              <input class="input" type="password" placeholder={t('Contraseña de la clave')} bind:value={passphrase} />
              <label class="radio"><input type="checkbox" bind:checked={savePass} /> {t('Guardar la contraseña')}</label>
            {/if}
          {/if}
        </div>
      </div>
      {#if chosen}
        <p class="sum"><KeyRound size={14} /> {t('Se creará «{0}»: {1} en {2}, usuario {3}.', name, chosen.label, catalog.regions.find((r) => r.id === region)?.label ?? region, prov.user)}
          {#if chosen.priceMonth}<strong>{t('Cuesta unos {0} al mes en {1}.', price(chosen.priceMonth, chosen.currency), prov.name)}</strong>{/if}</p>
      {/if}
      <button class="lnk small forget" onclick={forget}>{t('Olvidar el token de {0}', prov.name)}</button>
    {/if}
    {#if error}<p class="error"><TriangleAlert size={14} /> {error}</p>{/if}
  {/if}
  {#snippet footer()}
    <button class="btn" onclick={onclose} disabled={creating}>{t('Cancelar')}</button>
    {#if prov?.hasToken && catalog}
      <button class="btn primary" onclick={create} disabled={!ready || creating}><Cloud size={15} /> {t('Crear el servidor')}</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .provs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0; }
  .prov { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--panel-2); color: var(--text); cursor: pointer; font: inherit; text-align: left; }
  .prov:hover { border-color: var(--muted); }
  .prov.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .box { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--border-soft); border-radius: var(--radius-sm); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  .field > span { font-weight: 600; }
  .radio { display: flex; gap: 6px; align-items: center; font-size: 13px; cursor: pointer; }
  .lnk { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; display: inline-flex; gap: 4px; align-items: center; align-self: flex-start; }
  .small { font-size: 12.5px; }
  .err, .error { color: var(--danger); }
  .error { display: flex; gap: 6px; align-items: flex-start; font-size: 13px; margin-top: 10px; }
  .sum { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: 13px; margin: 14px 0 4px; padding: 10px; background: var(--panel-2); border-radius: var(--radius-sm); }
  .forget { margin-top: 8px; color: var(--muted); }
  .progress { display: flex; flex-direction: column; gap: 10px; }
  .big { display: flex; gap: 8px; align-items: center; font-weight: 600; }
  .track { height: 8px; border-radius: 999px; background: var(--panel-2); overflow: hidden; position: relative; }
  .track i { position: absolute; top: 0; bottom: 0; width: 30%; background: var(--accent); border-radius: 999px; animation: cc-slide 1.4s ease-in-out infinite; }
  @keyframes cc-slide { 0% { left: -30%; } 100% { left: 100%; } }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--muted); }
  ul :global(svg) { color: var(--success); vertical-align: -2px; }
  @media (max-width: 640px) { .grid, .provs { grid-template-columns: 1fr; } }
</style>
