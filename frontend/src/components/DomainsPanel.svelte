<script lang="ts">
  // Pestaña «Dominios» de la ficha: cada dominio del servidor (nginx, Caddy,
  // Coolify y los que añadas) visto desde fuera, desde este equipo: si el DNS
  // apunta aquí, si la web responde por HTTPS, su certificado y si http://
  // lleva a https://. Si el DNS no apunta, «Apuntar a este servidor…» lo
  // arregla con la API de Cloudflare o DigitalOcean.
  import { RefreshCw, LoaderCircle, CircleCheck, CircleAlert, TriangleAlert, ExternalLink, Plus, X, Earth } from '@lucide/svelte'
  import Modal from './Modal.svelte'
  import { api, errorText, type DNSProvider, type DomainCheck, type Server } from '../lib/api'
  import { toast, withVault, timeAgo } from '../lib/state.svelte'
  import { alerts, domainProblem, DOMAINS_MINUTES } from '../lib/alerts.svelte'
  import { t } from '../lib/i18n.svelte'

  let { server }: { server: Server } = $props()

  const rep = $derived(alerts.domains[server.id])
  const fichaHas = $derived((alerts.fichas[server.id]?.overview.sites?.length ?? 0) + (alerts.fichas[server.id]?.overview.coolify?.apps.length ?? 0) > 0)
  let busy = $state(false)
  let adding = $state('')

  async function check() {
    busy = true
    try { alerts.domains[server.id] = await api.CheckDomains(server.id) } catch (e) { toast(errorText(e), 'error') } finally { busy = false }
  }
  // Al abrir la pestaña, si hace rato que no se mira (o nunca), se mira.
  let first = true
  $effect(() => {
    if (!first) return
    first = false
    if (!rep || Date.now() - new Date(rep.at).getTime() > 5 * 60000) check()
  })

  async function setExtra(list: string[]) {
    try {
      alerts.domains[server.id] = await api.SetExtraDomains(server.id, list)
      await check()
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  async function add() {
    const d = adding.trim()
    if (!d) return
    await setExtra([...(rep?.extra ?? []), d])
    adding = ''
  }

  // ---- Apuntar el dominio a este servidor
  let pointing = $state<DomainCheck | null>(null)
  let providers = $state<DNSProvider[]>([])
  let provider = $state('')
  let token = $state('')
  let pbusy = $state(false)
  async function openPoint(d: DomainCheck) {
    pointing = d
    token = ''
    try { providers = await api.DNSProviders() } catch { providers = [] }
    provider = providers.find((p) => p.hasToken)?.id ?? providers[0]?.id ?? ''
  }
  const prov = $derived(providers.find((p) => p.id === provider))
  async function point() {
    if (!pointing || !prov) return
    pbusy = true
    try {
      if (!prov.hasToken) {
        await withVault(() => api.SetDNSToken(prov.id, token), t('El token se guarda cifrado en la bóveda.'))
        providers = await api.DNSProviders()
      }
      const r = await withVault(() => api.PointDomain(server.id, pointing!.domain, prov.id), t('El token del proveedor está en la bóveda.'))
      toast(r.action === 'same' ? t('{0} ya apuntaba a {1}', pointing.domain, r.ip)
        : r.action === 'created' ? t('Creado en {0}: {1} → {2}. Puede tardar unos minutos en verse.', prov.name, pointing.domain, r.ip)
        : t('Cambiado en {0}: {1} → {2} (antes {3}). Puede tardar unos minutos en verse.', prov.name, pointing.domain, r.ip, r.before ?? ''))
      pointing = null
      await check()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      pbusy = false
    }
  }

  const ms = (n?: number) => (n === undefined ? '' : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`)
</script>

<section class="card block">
  <div class="h2row">
    <h2><Earth size={17} /> {t('Dominios vistos desde fuera')}</h2>
    <div class="right">
      {#if rep}<span class="muted small">{t('comprobado {0}', timeAgo(rep.at))}{rep.serverIp ? ' · ' + t('IP del servidor: {0}', rep.serverIp) : ''}</span>{/if}
      <button class="btn sm" onclick={check} disabled={busy}>{#if busy}<LoaderCircle size={14} class="spin" />{:else}<RefreshCw size={14} />{/if} {t('Comprobar ahora')}</button>
    </div>
  </div>
  <p class="muted small">{t('Desde este equipo, no desde el servidor: lo mismo que verá quien entre en tus webs. Se mira solo cada {0} minutos mientras Draupnode está abierta.', DOMAINS_MINUTES)}</p>

  {#if !rep?.domains.length}
    <p class="muted">{fichaHas || rep?.extra?.length ? (busy ? t('Comprobando…') : t('Sin comprobar todavía.')) : t('No hay dominios en nginx, Caddy ni Coolify de este servidor. Puedes añadir uno abajo para vigilarlo.')}</p>
  {:else}
    <div class="tbl">
      <table>
        <thead>
          <tr><th>{t('Dominio')}</th><th>{t('DNS')}</th><th>{t('Web (HTTPS)')}</th><th>{t('Certificado')}</th><th>{t('http → https')}</th><th></th></tr>
        </thead>
        <tbody>
          {#each rep.domains as d (d.domain)}
            {@const p = domainProblem(d)}
            <tr>
              <td>
                <div class="dom">
                  {#if !p}<CircleCheck size={15} class="ok-i" />{:else if p.bad}<CircleAlert size={15} class="bad-i" />{:else}<TriangleAlert size={15} class="warn-i" />{/if}
                  <button class="lnk mono" onclick={() => api.OpenURL('https://' + d.domain)} title={t('Abrir en el navegador')}>{d.domain} <ExternalLink size={12} /></button>
                </div>
                <span class="muted small">{d.source === 'manual' ? t('añadido a mano') : d.source}</span>
              </td>
              <td>
                {#if d.dnsError}<span class="bad-t">{d.dnsError}</span>
                {:else if d.pointsHere}<span class="ok-t">{t('apunta aquí')}</span>
                {:else}<span class="warn-t">{t('apunta a {0}', d.ips.join(', '))}</span>{/if}
                {#if !d.pointsHere}<button class="lnk small blk" onclick={() => openPoint(d)}>{t('Apuntar a este servidor…')}</button>{/if}
              </td>
              <td>
                {#if d.dnsError}<span class="muted">—</span>
                {:else if d.status}<span class:ok-t={d.status < 400} class:warn-t={d.status >= 400 && d.status < 500} class:bad-t={d.status >= 500}>{d.status}</span> <span class="muted small">{ms(d.timeMs)}</span>
                {:else}<span class="bad-t small">{d.webError}</span>{/if}
              </td>
              <td>
                {#if d.dnsError || (!d.status && d.certError === d.webError)}<span class="muted">—</span>
                {:else if d.certError}<span class="bad-t small">{d.certError}</span>
                {:else if d.certDays !== undefined}<span class:ok-t={d.certDays >= 21} class:warn-t={d.certDays < 21 && d.certDays >= 7} class:bad-t={d.certDays < 7}>{t('{0} días', d.certDays)}</span> <span class="muted small">{d.certIssuer}</span>
                {:else}<span class="muted">—</span>{/if}
              </td>
              <td>{#if d.dnsError}<span class="muted">—</span>{:else if d.redirect}<span class="ok-t">{t('sí')}</span>{:else if d.httpStatus}<span class="warn-t" title={t('http:// responde {0} sin llevar a https://', d.httpStatus)}>{t('no')}</span>{:else}<span class="muted">—</span>{/if}</td>
              <td class="x">{#if d.source === 'manual'}<button class="btn sm ghost icon" title={t('Dejar de vigilarlo')} aria-label={t('Dejar de vigilarlo')} onclick={() => setExtra((rep.extra ?? []).filter((x) => x !== d.domain))}><X size={14} /></button>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if rep.domains.some((d) => !d.pointsHere && !d.dnsError)}
      <p class="muted small">{t('Si usas el proxy de Cloudflare (nube naranja), el DNS apunta a Cloudflare y no a tu servidor: es normal.')}</p>
    {/if}
  {/if}

  <form class="add" onsubmit={(e) => { e.preventDefault(); add() }}>
    <input class="input" placeholder={t('otro.dominio.com')} bind:value={adding} autocomplete="off" spellcheck="false" />
    <button class="btn sm" type="submit" disabled={!adding.trim()}><Plus size={14} /> {t('Vigilar este dominio')}</button>
  </form>
</section>

{#if pointing}
  <Modal title={t('Apuntar {0} a {1}', pointing.domain, server.name)} onclose={() => (pointing = null)}>
    <p>{t('Draupnode crea (o cambia) el registro A de {0} para que apunte a {1}, con la API de tu proveedor de DNS. Elige dónde está el dominio:', pointing.domain, rep?.serverIp ?? server.host)}</p>
    <div class="provs">
      {#each providers as p}
        <button class="btn sm" class:primary={provider === p.id} onclick={() => { provider = p.id; token = '' }}>{p.name}{p.hasToken ? ' ✓' : ''}</button>
      {/each}
    </div>
    {#if prov && !prov.hasToken}
      <p class="small">{prov.tokenHelp}</p>
      <button class="lnk small" onclick={() => api.OpenURL(prov.tokenUrl)}><ExternalLink size={13} /> {t('Abrir la página del proveedor')}</button>
      <label class="field"><span>{t('Token de la API de {0}', prov.name)}</span><input class="input mono" type="password" bind:value={token} autocomplete="off" spellcheck="false" /></label>
    {/if}
    <p class="muted small">{t('Si el dominio está en otro sitio (tu registrador, otro DNS), crea allí a mano un registro A: {0} → {1}.', pointing.domain, rep?.serverIp ?? server.host)}</p>
    {#snippet footer()}
      <button class="btn ghost" onclick={() => (pointing = null)}>{t('Cancelar')}</button>
      <button class="btn primary" onclick={point} disabled={pbusy || !prov || (!prov.hasToken && !token.trim())}>{pbusy ? t('Cambiando…') : t('Apuntar')}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .block { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
  .block h2 { display: flex; gap: 8px; align-items: center; font-size: 15px; margin: 0; }
  .block h2 :global(svg) { color: var(--accent); }
  .block p { margin: 0; }
  .h2row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .small { font-size: 12px; }
  .tbl { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 12px; color: var(--muted); font-weight: 600; padding: 6px 8px; border-bottom: 1px solid var(--border); }
  td { padding: 7px 8px; border-bottom: 1px solid var(--border-soft, var(--border)); vertical-align: top; }
  .dom { display: flex; align-items: center; gap: 6px; }
  .x { text-align: right; width: 34px; }
  .blk { display: block; margin-top: 2px; }
  .lnk { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-align: left; display: inline-flex; align-items: center; gap: 4px; }
  .lnk.mono { color: var(--text); }
  .lnk:hover { text-decoration: underline; }
  .ok-t { color: var(--success); }
  .warn-t { color: var(--warning); }
  .bad-t { color: var(--danger); }
  :global(.ok-i) { color: var(--success); flex: none; }
  :global(.warn-i) { color: var(--warning); flex: none; }
  :global(.bad-i) { color: var(--danger); flex: none; }
  .add { display: flex; gap: 8px; align-items: center; max-width: 520px; }
  .add .input { flex: 1; }
  .provs { display: flex; gap: 8px; margin: 10px 0; }
  .field { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
  .field span { font-size: 12.5px; color: var(--muted); }
</style>
