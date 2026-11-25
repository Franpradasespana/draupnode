<script lang="ts">
  // «Lo que ya hay en este servidor»: plantillas que aplicó Draupnode (aquí o
  // en otro equipo) y que este Draupnode no conoce, para recuperarlas; y
  // programas instalados fuera de las plantillas, con lo que conviene saber.
  import { ArchiveRestore, PackageSearch, Trash2 } from '@lucide/svelte'
  import { api, errorText, type DockerResult, type Project, type ServerMarker, type ServerOverview } from '../lib/api'
  import { ui, toast, timeAgo, refreshProjects, moduleName, confirmDialog, openDeployment } from '../lib/state.svelte'
  import { withConnection } from '../lib/connect'
  import { t } from '../lib/i18n.svelte'

  let { serverId, ov, deployments }: { serverId: string; ov: ServerOverview; deployments: Project[] } = $props()

  const known = $derived(new Set(deployments.map((p) => p.slug ?? '')))
  const markers = $derived((ov.draupnode?.markers ?? []).filter((m) => m.slug && !known.has(m.slug)))
  const knownMods = (id: string) => !!ui.modules?.modules.some((m) => m.id === id)
  // Carpetas de contraseñas sin ficha (plantillas de antes de la 0.42).
  const orphans = $derived((ov.draupnode?.secretDirs ?? []).filter((s) => !known.has(s) && !markers.some((m) => m.slug === s)))
  const covered = $derived(new Set([...deployments.flatMap((p) => p.installedModules ?? []), ...(ov.draupnode?.markers ?? []).flatMap((m) => m.modulos.map((x) => x.id))]))
  const outside = $derived((ov.software ?? []).filter((s) => !covered.has(s.module) && knownMods(s.module)))
  let busy = $state('')
  // Desde la 0.50 un servidor tiene un solo conjunto de módulos (con su carpeta):
  // si ya tiene módulos, una ficha de otra carpeta no se puede recuperar encima.
  const own = $derived(deployments[0])
  const blocked = (slug: string) => !!own?.modules.length && (own.slug ?? '') !== slug

  // Apps huérfanas: carpetas de /srv/draupnode/apps o proyectos de Docker «dn-…» que
  // no son de una «Tu app» de este servidor ni de un módulo del catálogo
  // (p. ej. la que se quedó al cambiar el nombre de una app).
  const managedApps = $derived(new Set((own?.modules ?? []).flatMap((m) => [m.values?.git_app_name, own?.installedValues?.[m.id]?.git_app_name]).filter(Boolean).map(String)))
  const orphanApps = $derived.by(() => {
    const names = new Set<string>(ov.draupnode?.appDirs ?? [])
    for (const c of ov.containers ?? []) if (c.compose?.startsWith('dn-')) names.add(c.compose.slice(3))
    return [...names].filter((n) => !managedApps.has(n) && !knownMods(n)).sort().map((n) => ({
      name: n,
      containers: (ov.containers ?? []).filter((c) => c.compose === 'dn-' + n),
      dir: (ov.draupnode?.appDirs ?? []).includes(n),
    }))
  })
  async function removeOrphan(name: string) {
    const ok = await confirmDialog({
      title: t('Borrar la app «{0}»', name),
      message: t('Draupnode ya no gestiona esta app. Se paran y borran sus contenedores (dn-{0}) y su carpeta /srv/draupnode/apps/{1}.', name, name),
      detail: t('Sus datos (volúmenes: la base de datos, ficheros subidos…) se conservan salvo que marques la casilla siguiente.'),
      confirmLabel: t('Borrar la app'), danger: true,
    })
    if (!ok) return
    const purge = await confirmDialog({
      title: t('¿Borrar también sus datos?'),
      message: t('Sus volúmenes de Docker (la base de datos y lo que guarde «{0}»). No se puede deshacer.', name),
      confirmLabel: t('Sí, borrar los datos'), danger: true,
    })
    busy = name
    try {
      const r = await withConnection<DockerResult>(ui.servers.find((s) => s.id === serverId), (s, a, u) => api.RemoveOrphanApp(serverId, name, purge, s, a, u))
      if (r?.status === 'ok') toast(t('«{0}» borrada{1}. Pulsa «Actualizar» para verlo.', name, purge ? t(' con sus datos') : t(' (sus datos se conservan)')))
      else if (r) toast(r.message || t('No se pudo borrar'), 'error')
    } finally {
      busy = ''
    }
  }

  const NOTES: Record<string, string> = {
    docker: t('Se puede añadir sin problema: el módulo Docker respeta lo instalado.'),
    firewall: t('Hay reglas de Draupnode: añadir el Cortafuegos las mantiene.'),
    nginx: t('Si añades el módulo nginx, Draupnode reescribe sus sitios: copia antes tu configuración.'),
    caddy: t('Si añades el módulo Caddy, Draupnode reescribe su Caddyfile: copia antes tu configuración.'),
    coolify: t('Instalado aparte. Añadir el módulo Coolify no lo reinstala, pero revísalo en el servidor de pruebas antes.'),
    wireguard: t('Si añades el módulo WireGuard, Draupnode reescribe wg0.conf y sus dispositivos.'),
    ssh: t('Si añades «SSH seguro», Draupnode cambia la configuración de SSH: comprueba antes que entras con clave.'),
  }

  async function recover(m: ServerMarker, guessed = false) {
    busy = m.slug
    try {
      const r = await api.RecoverFromServer(serverId, JSON.stringify(m))
      await refreshProjects()
      toast([t('Módulos recuperados.'), ...r.notes, guessed ? t('Revisa sus módulos: se han deducido de lo que hay en el servidor.') : ''].filter(Boolean).join(' '))
      const ok = await confirmDialog({ title: t('Contraseñas'), message: t('¿Traer ya a la bóveda las contraseñas que generaron sus módulos en el servidor?'), confirmLabel: t('Traer ahora') })
      if (ok) {
        const res = await withConnection(ui.servers.find((s) => s.id === serverId), (s, a, u) => api.FetchProjectSecrets(r.project.id, s, a, u))
        if (res?.status === 'ok') toast(t('{0} contraseña(s) traídas a la bóveda', res.count))
        else if (res) toast(res.message || t('No se pudieron traer'), 'error')
      }
      openDeployment(r.project.id)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      busy = ''
    }
  }

  // Sin ficha: lo que se deduce (apps de Draupnode + programas no cubiertos).
  function guess(slug: string): ServerMarker {
    const apps = (ov.draupnode?.appDirs ?? []).filter(knownMods)
    const mods = [...new Set([...outside.map((s) => s.module), ...apps])]
    return { slug, nombre: slug, modulos: mods.map((id) => ({ id, values: {} })) }
  }
</script>

<section class="card adopt">
    <h2><PackageSearch size={17} /> {t('Lo que ya hay en este servidor')}</h2>
    {#if !markers.length && !orphans.length && !outside.length && !orphanApps.length}
      <p class="muted small">{t('Todo lo que Draupnode instaló aquí ya está en sus módulos. Si abres Draupnode en otro equipo (o pierdes sus datos), aquí saldrá con el botón «Recuperar».')}</p>
    {/if}

    {#each markers as m (m.slug)}
      <div class="item">
        <ArchiveRestore size={16} class="ic" />
        <div class="txt">
          <span><strong>{m.nombre || m.slug}</strong>{#if m.plantilla && m.plantilla !== m.nombre} <span class="muted">{t('(plantilla «{0}»)', m.plantilla)}</span>{/if}</span>
          <span class="muted small">{t('Instalada con Draupnode{0}{1}, pero este Draupnode no la conoce. Módulos: {2}.', m.draupnode ? ' ' + m.draupnode : '', m.at ? ' ' + timeAgo(m.at) : '', m.modulos.map((x) => moduleName(x.id)).join(', '))}</span>
        </div>
        {#if blocked(m.slug)}
          <span class="muted small nb" title={t('Este servidor ya tiene módulos en Draupnode')}>{t('Añade sus módulos a mano (Añadir módulos) o aplica una plantilla con ellos.')}</span>
        {:else}
          <button class="btn sm primary" onclick={() => recover(m)} disabled={!!busy}>{busy === m.slug ? t('Recuperando…') : t('Recuperar')}</button>
        {/if}
      </div>
    {/each}

    {#each orphans as s (s)}
      {@const g = guess(s)}
      <div class="item">
        <ArchiveRestore size={16} class="ic" />
        <div class="txt">
          <strong>{s}</strong>
          <span class="muted small">{t('Contraseñas de una plantilla aplicada con un Draupnode anterior a la 0.42 (sin ficha). Se puede recuperar con lo que se ve instalado{0}; revisa después sus módulos.', g.modulos.length ? ': ' + g.modulos.map((x) => moduleName(x.id)).join(', ') : '')}</span>
        </div>
        <button class="btn sm" onclick={() => recover(g, true)} disabled={!!busy || !g.modulos.length || blocked(s)}>{busy === s ? t('Recuperando…') : t('Recuperar')}</button>
      </div>
    {/each}

    {#each orphanApps as o (o.name)}
      <div class="item">
        <Trash2 size={16} class="ic warn" />
        <div class="txt">
          <strong>{o.name}</strong>
          <span class="muted small">{t('App que Draupnode ya no gestiona{0}{1}. Suele quedarse al cambiar el nombre de una «Tu app» o al quitarla sin desinstalar.', o.containers.length ? t(' · {0} contenedor(es): {1}', o.containers.length, o.containers.map((c) => `${c.name} (${c.state})`).join(', ')) : '', o.dir ? t(' · carpeta /srv/draupnode/apps/{0}', o.name) : '')}</span>
        </div>
        <button class="btn sm danger" onclick={() => removeOrphan(o.name)} disabled={!!busy}>{busy === o.name ? t('Borrando…') : t('Borrar…')}</button>
      </div>
    {/each}

    {#if outside.length}
      <div class="out">
        <p class="small"><strong>{t('Instalado fuera de los módulos de Draupnode:')}</strong> {outside.map((s) => moduleName(s.module)).join(', ')}.</p>
        <p class="muted small">{t('Draupnode no lo toca. Si añades su módulo a este servidor, pasará a gestionarlo:')}</p>
        <ul>
          {#each outside as s}<li class="small"><strong>{moduleName(s.module)}</strong>{s.active ? '' : ' (parado)'}: {NOTES[s.module] ?? t('su módulo puede cambiar la configuración que tenga: pruébalo antes en el servidor de pruebas.')}</li>{/each}
        </ul>
      </div>
    {/if}
</section>

<style>
  .adopt { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
  h2 { display: flex; gap: 8px; align-items: center; margin: 0; font-size: 16px; }
  .item { display: flex; gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid var(--border-soft); }
  .item :global(.ic) { color: var(--accent); flex: none; }
  .item :global(.ic.warn) { color: var(--warning); }
  .txt { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 13.5px; }
  .small { font-size: 12.5px; margin: 0; }
  .nb { max-width: 260px; text-align: right; }
  .out { border-top: 1px solid var(--border-soft); padding-top: 10px; display: flex; flex-direction: column; gap: 4px; }
  ul { margin: 2px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; }
</style>
