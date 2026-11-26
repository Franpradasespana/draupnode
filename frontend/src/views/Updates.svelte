<script lang="ts">
  // Actualizaciones: todo lo que se puede poner al día en tus servidores, en
  // un solo sitio. Por servidor: paquetes del sistema (y cuántos de
  // seguridad), si hace falta reiniciar e imágenes Docker con versión nueva
  // (Draupnode pregunta a cada registro). Se instala servidor a servidor o en
  // todos, uno detrás de otro.
  import { RefreshCw, PackageCheck, Power, Container, CalendarClock, CircleCheck, LoaderCircle, ChevronDown, ChevronRight, Server as ServerIcon } from '@lucide/svelte'
  import { api, errorText, type DockerResult, type ImageInfo, type ImagesResult, type ServerOverviewResult } from '../lib/api'
  import { ui, toast, timeAgo, openServer, openServerModules, confirmDialog } from '../lib/state.svelte'
  import { withConnection } from '../lib/connect'
  import { alerts, rememberOverview, newImages, updatableProjects } from '../lib/alerts.svelte'
  import { runBulk, bulk, type BulkKind } from '../lib/bulk.svelte'
  import { t, plural, locale } from '../lib/i18n.svelte'

  const rows = $derived(
    ui.servers.map((s) => {
      const ov = alerts.fichas[s.id]?.overview
      const im = alerts.images[s.id]
      return {
        s, ov, im,
        read: alerts.fichas[s.id]?.at,
        updates: ov?.updates?.total ?? 0,
        security: ov?.updates?.security ?? 0,
        packages: ov?.updates?.packages ?? [],
        reboot: !!ov?.updates?.reboot,
        rebootFor: ov?.updates?.rebootFor ?? [],
        newImgs: newImages(im),
        projects: updatableProjects(im),
        auto: ov?.autoupdate ?? [],
        docker: !!ov?.docker,
      }
    }),
  )
  const withUpd = $derived(rows.filter((r) => r.updates))
  const withReboot = $derived(rows.filter((r) => r.reboot))
  const withImgs = $derived(rows.filter((r) => r.projects.length))
  const allGood = $derived(rows.every((r) => r.read && !r.updates && !r.reboot && !r.newImgs.length))

  let busy = $state<Record<string, string>>({})
  let output = $state<Record<string, string>>({})
  let openPk = $state<Record<string, boolean>>({})
  let openImg = $state<Record<string, boolean>>({})

  // Volver a mirar un servidor: su ficha (paquetes, reinicio) y sus imágenes.
  async function scan(id: string) {
    const srv = ui.servers.find((s) => s.id === id)
    busy[id] = 'scan'
    try {
      const o = await withConnection<ServerOverviewResult>(srv, (s, a, u) => api.ServerOverview(id, s, a, u))
      if (!o) return
      if (o.status === 'ok' && o.overview) rememberOverview(id, o.overview)
      else { toast(o.message || t('No se pudo leer el servidor'), 'error'); return }
      if (o.overview.docker) {
        const r = await withConnection<ImagesResult>(srv, (s, a, u) => api.CheckImages(id, s, a, u))
        if (!r) return
        if (r.status === 'ok' && r.report) alerts.images[id] = r.report
        else if (r.message) toast(r.message, 'error')
      }
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      delete busy[id]
    }
  }
  let scanningAll = $state(false)
  async function scanAll() {
    scanningAll = true
    try { for (const s of ui.servers) await scan(s.id) } finally { scanningAll = false }
  }

  async function upgrade(id: string, name: string) {
    const ok = await confirmDialog({ title: t('Instalar actualizaciones en {0}', name), message: t('Se instalan ahora los paquetes pendientes del sistema (apt upgrade). Tarda unos minutos; las apps siguen funcionando.'), confirmLabel: t('Instalar') })
    if (!ok) return
    busy[id] = 'upgrade'
    try {
      const r = await withConnection<DockerResult>(ui.servers.find((s) => s.id === id), (s, a, u) => api.ServerUpgrade(id, s, a, u))
      if (r?.status === 'ok') { output[id] = r.output || t('Hecho.'); toast(t('Actualizaciones instaladas')); delete busy[id]; await scan(id) }
      else if (r) toast(r.message || t('No se pudo'), 'error')
    } finally {
      delete busy[id]
    }
  }
  async function reboot(id: string, name: string) {
    const ok = await confirmDialog({ title: t('Reiniciar {0}', name), message: t('El servidor se reinicia ahora: durante uno o dos minutos no responderá y sus apps estarán paradas. Las que tengan reinicio «unless-stopped» vuelven solas.'), confirmLabel: t('Reiniciar'), danger: true })
    if (!ok) return
    busy[id] = 'reboot'
    try {
      const r = await withConnection<DockerResult>(ui.servers.find((s) => s.id === id), (s, a, u) => api.ServerReboot(id, s, a, u))
      if (r?.status === 'ok') toast(t('{0} se está reiniciando: vuelve en un par de minutos', name))
      else if (r) toast(r.message || t('No se pudo'), 'error')
    } finally {
      delete busy[id]
    }
  }
  async function updateImages(id: string, name: string, projects: string[]) {
    const ok = await confirmDialog({
      title: t('Actualizar imágenes en {0}', name),
      message: t('Se bajan las imágenes nuevas y se vuelven a crear sus contenedores ({0}). Cada app está parada unos segundos; sus datos (volúmenes) se quedan.', projects.join(', ')),
      detail: t('La etiqueta no cambia (por ejemplo, postgres:16 sigue en la 16): solo se baja lo último publicado con esa etiqueta.'),
      confirmLabel: t('Actualizar'),
    })
    if (!ok) return
    busy[id] = 'images'
    try {
      const r = await withConnection<ImagesResult>(ui.servers.find((s) => s.id === id), (s, a, u) => api.UpdateImages(id, projects, s, a, u))
      if (!r) return
      if (r.report) alerts.images[id] = r.report
      output[id] = r.output ?? ''
      if (r.status === 'ok') toast(t('Imágenes actualizadas en {0}', name))
      else toast(r.message || t('No se pudo'), 'error')
    } finally {
      delete busy[id]
    }
  }
  async function bulkGo(kind: BulkKind) {
    const list = kind === 'upgrade' ? withUpd : kind === 'reboot' ? withReboot : withImgs
    if (!list.length) return
    const names = list.map((r) => r.s.name).join(', ')
    const title = kind === 'upgrade' ? t('Instalar actualizaciones en {0}', plural(list.length, 'servidor', 'servidores'))
      : kind === 'reboot' ? t('Reiniciar {0}', plural(list.length, 'servidor', 'servidores'))
      : t('Actualizar imágenes en {0}', plural(list.length, 'servidor', 'servidores'))
    const msg = kind === 'upgrade' ? t('Se instalan los paquetes pendientes del sistema (apt upgrade), uno detrás de otro, en: {0}. Las apps siguen funcionando.', names)
      : kind === 'reboot' ? t('Se reinician, uno detrás de otro: {0}. Durante uno o dos minutos cada uno no responderá y sus apps estarán paradas.', names)
      : t('Se bajan las imágenes nuevas y se recrean sus contenedores, uno detrás de otro, en: {0}. Cada app está parada unos segundos.', names)
    const ok = await confirmDialog({ title, message: msg, confirmLabel: kind === 'upgrade' ? t('Instalar') : kind === 'reboot' ? t('Reiniciar') : t('Actualizar'), danger: kind === 'reboot' })
    if (!ok) return
    await runBulk(title, list.map((r) => ({ serverId: r.s.id, kind })))
  }

  const nextText = (ts: number) => new Date(ts * 1000).toLocaleString(locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  const statusText = (i: ImageInfo) =>
    i.status === 'new' ? (i.coolify ? t('nueva · la actualiza Coolify') : !i.compose.length ? t('nueva · contenedor suelto: actualízalo a mano') : t('nueva'))
    : i.status === 'same' ? t('al día')
    : i.status === 'local' ? t('construida en el servidor')
    : i.status === 'pinned' ? t('fijada a una versión exacta')
    : t('no se pudo comprobar{0}', i.error ? ` (${i.error})` : '')
</script>

<div class="head">
  <div>
    <h1>{t('Actualizaciones')}</h1>
    <p class="muted">{t('Paquetes del sistema, reinicios pendientes e imágenes Docker con versión nueva en todos tus servidores.')}</p>
  </div>
  <button class="btn" onclick={scanAll} disabled={scanningAll || !ui.servers.length}>
    {#if scanningAll}<LoaderCircle size={15} class="spin" />{:else}<RefreshCw size={15} />{/if} {t('Buscar en todos')}
  </button>
</div>

{#if !ui.servers.length}
  <p class="muted">{t('Aún no hay servidores.')}</p>
{:else}
  {#if withUpd.length || withReboot.length || withImgs.length}
    <div class="card bar">
      <span class="muted small">{t('En todos, uno detrás de otro:')}</span>
      {#if withUpd.length}<button class="btn sm" onclick={() => bulkGo('upgrade')} disabled={bulk.running}><PackageCheck size={14} /> {t('Instalar paquetes ({0})', withUpd.length)}</button>{/if}
      {#if withImgs.length}<button class="btn sm" onclick={() => bulkGo('images')} disabled={bulk.running}><Container size={14} /> {t('Actualizar imágenes ({0})', withImgs.length)}</button>{/if}
      {#if withReboot.length}<button class="btn sm" onclick={() => bulkGo('reboot')} disabled={bulk.running}><Power size={14} /> {t('Reiniciar ({0})', withReboot.length)}</button>{/if}
    </div>
  {:else if allGood}
    <p class="card ok-box"><CircleCheck size={17} /> {t('Todo al día en tus servidores (de lo que se ha leído).')}</p>
  {/if}

  {#each rows as r (r.s.id)}
    <section class="card srv">
      <div class="sh">
        <button class="lnk name" onclick={() => openServer(r.s.id)}><ServerIcon size={15} /> {r.s.name}</button>
        <span class="muted small">{r.read ? t('leído {0}', timeAgo(r.read)) : t('sin leer aún')}{#if r.im}{' · '}{t('imágenes comprobadas {0}', timeAgo(r.im.at))}{/if}</span>
        <button class="btn sm ghost" onclick={() => scan(r.s.id)} disabled={!!busy[r.s.id]}>
          {#if busy[r.s.id] === 'scan'}<LoaderCircle size={14} class="spin" /> {t('Buscando…')}{:else}<RefreshCw size={14} /> {t('Buscar')}{/if}
        </button>
      </div>

      {#if !r.read}
        <p class="muted small">{t('Pulsa «Buscar» para ver qué tiene pendiente.')}</p>
      {:else}
        <div class="line">
          <PackageCheck size={16} />
          <div class="what">
            <strong>{t('Sistema')}</strong>
            {#if !r.ov?.updates}<span class="muted">—</span>
            {:else if !r.updates}<span class="ok-t">{t('al día')}</span>
            {:else}
              <button class="lnk exp" onclick={() => (openPk[r.s.id] = !openPk[r.s.id])}>
                {#if openPk[r.s.id]}<ChevronDown size={13} />{:else}<ChevronRight size={13} />{/if}
                {t(r.updates === 1 ? '1 paquete pendiente' : '{0} paquetes pendientes', r.updates)}
              </button>
              {#if r.security}<span class="warn-t">{t('{0} de seguridad', r.security)}</span>{/if}
            {/if}
          </div>
          {#if r.updates}<button class="btn sm" onclick={() => upgrade(r.s.id, r.s.name)} disabled={!!busy[r.s.id] || bulk.running}>{busy[r.s.id] === 'upgrade' ? t('Instalando…') : t('Instalar…')}</button>{/if}
        </div>
        {#if openPk[r.s.id] && r.packages.length}
          <p class="pk mono small">{r.packages.join(' · ')}{r.updates > r.packages.length ? ' …' : ''}</p>
        {/if}

        <div class="line">
          <Power size={16} />
          <div class="what">
            <strong>{t('Reinicio')}</strong>
            {#if r.reboot}<span class="warn-t">{t('pendiente')}</span>{#if r.rebootFor.length}<span class="muted small">{t('por {0}', r.rebootFor.slice(0, 3).join(', '))}</span>{/if}
            {:else}<span class="ok-t">{t('no hace falta')}</span>{/if}
          </div>
          {#if r.reboot}<button class="btn sm" onclick={() => reboot(r.s.id, r.s.name)} disabled={!!busy[r.s.id] || bulk.running}>{busy[r.s.id] === 'reboot' ? t('Reiniciando…') : t('Reiniciar…')}</button>{/if}
        </div>

        {#if r.docker}
          <div class="line">
            <Container size={16} />
            <div class="what">
              <strong>{t('Imágenes Docker')}</strong>
              {#if !r.im}<span class="muted">{t('sin comprobar: pulsa «Buscar»')}</span>
              {:else}
                <button class="lnk exp" onclick={() => (openImg[r.s.id] = !openImg[r.s.id])}>
                  {#if openImg[r.s.id]}<ChevronDown size={13} />{:else}<ChevronRight size={13} />{/if}
                  {#if r.newImgs.length}{t(r.newImgs.length === 1 ? '1 con versión nueva' : '{0} con versión nueva', r.newImgs.length)}{:else}{t('{0} al día', r.im.images.filter((i) => i.status === 'same').length)}{/if}
                </button>
                {#if r.newImgs.length}<span class="muted small">{r.newImgs.slice(0, 3).map((i) => i.image).join(', ')}{r.newImgs.length > 3 ? '…' : ''}</span>{/if}
              {/if}
            </div>
            {#if r.projects.length}<button class="btn sm" onclick={() => updateImages(r.s.id, r.s.name, r.projects)} disabled={!!busy[r.s.id] || bulk.running}>{busy[r.s.id] === 'images' ? t('Actualizando…') : t('Actualizar…')}</button>{/if}
          </div>
          {#if openImg[r.s.id] && r.im}
            <table class="imgs">
              <tbody>
                {#each [...r.im.images].sort((a, b) => Number(b.status === 'new') - Number(a.status === 'new')) as i (i.image)}
                  <tr>
                    <td class="mono">{i.image}</td>
                    <td class="muted small">{i.compose.map((c) => c.project).join(', ') || i.containers.join(', ')}</td>
                    <td class:warn-t={i.status === 'new'} class:muted={i.status !== 'new'} class="small">{statusText(i)}</td>
                    <td class="act">
                      {#if i.status === 'new' && !i.coolify && i.compose.length}
                        <button class="lnk small" onclick={() => updateImages(r.s.id, r.s.name, i.compose.map((c) => c.project))} disabled={!!busy[r.s.id] || bulk.running}>{t('actualizar')}</button>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        {/if}

        <div class="line">
          <CalendarClock size={16} />
          <div class="what">
            <strong>{t('Solas')}</strong>
            {#if !r.auto.length}
              <span class="muted">{t('no: con el módulo «Actualizar las apps solas» se actualizan de madrugada y vuelven atrás si fallan')}</span>
            {:else}
              {#each r.auto as a}
                <span>{a.active ? t('sí') : t('temporizador parado')}{#if a.next}{' · '}{t('la próxima, {0}', nextText(a.next))}{/if}</span>
                {#if a.last}
                  <span class="muted small">· {t('la última, {0}', timeAgo(new Date(a.last.at * 1000).toISOString()))}:
                    {t(a.last.updated.length === 1 ? '1 actualizada' : '{0} actualizadas', a.last.updated.length)}{#if a.last.rolledBack.length}{', '}<span class="warn-t">{t('vuelta atrás: {0}', a.last.rolledBack.join(', '))}</span>{/if}{#if a.last.failed.length}{', '}<span class="bad-t">{t('fallos: {0}', a.last.failed.join(', '))}</span>{/if}</span>
                {/if}
              {/each}
            {/if}
          </div>
          <button class="btn sm ghost" onclick={() => openServerModules(r.s.id)}>{r.auto.length ? t('Cambiar…') : t('Añadir…')}</button>
        </div>

        {#if output[r.s.id]}
          <pre class="out">{output[r.s.id]}</pre>
        {/if}
      {/if}
    </section>
  {/each}
  <p class="muted small">{t('Se busca solo desde el Panel una vez al día (si la contraseña está guardada). Una imagen «nueva» es una versión más reciente publicada con la misma etiqueta: para cambiar de versión grande (por ejemplo, de PostgreSQL 16 a 17) cambia la opción del módulo.')}</p>
{/if}

<style>
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .head h1 { margin: 0 0 4px; }
  .head p { margin: 0; }
  .bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 10px 14px; margin-bottom: 14px; }
  .ok-box { display: flex; gap: 8px; align-items: center; padding: 12px 14px; color: var(--success); }
  .srv { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; padding: 14px 16px; }
  .sh { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .sh .muted { margin-right: auto; }
  .lnk.name { font-weight: 600; font-size: 15px; color: var(--text); display: inline-flex; gap: 6px; align-items: center; }
  .line { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-top: 1px solid var(--border); }
  .line > :global(svg) { color: var(--muted); flex: none; }
  .what { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: 1; min-width: 0; }
  .what strong { min-width: 130px; font-weight: 500; }
  .exp { display: inline-flex; align-items: center; gap: 3px; }
  .pk { margin: 0 0 4px 26px; color: var(--muted); }
  .imgs { width: calc(100% - 26px); margin-left: 26px; border-collapse: collapse; font-size: 13px; }
  .imgs td { padding: 4px 8px 4px 0; border-top: 1px dashed var(--border); vertical-align: top; }
  .imgs td.mono { word-break: break-all; }
  .imgs .act { text-align: right; white-space: nowrap; }
  .out { margin: 4px 0 0; padding: 8px 10px; background: var(--bg); border-radius: var(--radius-sm); font-size: 12px; max-height: 220px; overflow: auto; white-space: pre-wrap; }
  .small { font-size: 12px; }
  .ok-t { color: var(--success); }
  .warn-t { color: var(--warning); }
  .bad-t { color: var(--danger); }
  .lnk { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-align: left; }
  .lnk:hover { text-decoration: underline; }
  .lnk:disabled { opacity: .5; cursor: default; }
  :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
