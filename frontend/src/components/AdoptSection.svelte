<script lang="ts">
  // «Lo que ya hay en este servidor»: plantillas que aplicó Draupnode (aquí o
  // en otro equipo) y que este Draupnode no conoce, para recuperarlas; y
  // programas instalados fuera de las plantillas, con lo que conviene saber.
  import { ArchiveRestore, PackageSearch } from '@lucide/svelte'
  import { api, errorText, type Project, type ServerMarker, type ServerOverview } from '../lib/api'
  import { ui, toast, timeAgo, refreshProjects, moduleName, confirmDialog, openDeployment } from '../lib/state.svelte'
  import { withConnection } from '../lib/connect'

  let { serverId, ov, deployments }: { serverId: string; ov: ServerOverview; deployments: Project[] } = $props()

  const known = $derived(new Set(deployments.map((p) => p.slug ?? '')))
  const markers = $derived((ov.draupnode?.markers ?? []).filter((m) => m.slug && !known.has(m.slug)))
  const knownMods = (id: string) => !!ui.modules?.modules.some((m) => m.id === id)
  // Carpetas de contraseñas sin ficha (plantillas de antes de la 0.42).
  const orphans = $derived((ov.draupnode?.secretDirs ?? []).filter((s) => !known.has(s) && !markers.some((m) => m.slug === s)))
  const covered = $derived(new Set([...deployments.flatMap((p) => p.installedModules ?? []), ...(ov.draupnode?.markers ?? []).flatMap((m) => m.modulos.map((x) => x.id))]))
  const outside = $derived((ov.software ?? []).filter((s) => !covered.has(s.module) && knownMods(s.module)))
  let busy = $state('')

  const NOTES: Record<string, string> = {
    docker: 'Se puede añadir sin problema: el módulo Docker respeta lo instalado.',
    firewall: 'Hay reglas de Draupnode: añadir el Cortafuegos las mantiene.',
    nginx: 'Si añades el módulo nginx, Draupnode reescribe sus sitios: copia antes tu configuración.',
    caddy: 'Si añades el módulo Caddy, Draupnode reescribe su Caddyfile: copia antes tu configuración.',
    coolify: 'Instalado aparte. Añadir el módulo Coolify no lo reinstala, pero revísalo en el servidor de pruebas antes.',
    wireguard: 'Si añades el módulo WireGuard, Draupnode reescribe wg0.conf y sus dispositivos.',
    ssh: 'Si añades «SSH seguro», Draupnode cambia la configuración de SSH: comprueba antes que entras con clave.',
  }

  async function recover(m: ServerMarker, guessed = false) {
    busy = m.slug
    try {
      const r = await api.RecoverFromServer(serverId, JSON.stringify(m))
      await refreshProjects()
      toast(['Plantilla recuperada.', ...r.notes, guessed ? 'Revisa sus módulos: se han deducido de lo que hay en el servidor.' : ''].filter(Boolean).join(' '))
      const ok = await confirmDialog({ title: 'Contraseñas', message: `¿Traer ya a la bóveda las contraseñas que generaron sus módulos en el servidor?`, confirmLabel: 'Traer ahora' })
      if (ok) {
        const res = await withConnection(ui.servers.find((s) => s.id === serverId), (s, a, u) => api.FetchProjectSecrets(r.project.id, s, a, u))
        if (res?.status === 'ok') toast(`${res.count} contraseña(s) traídas a la bóveda`)
        else if (res) toast(res.message || 'No se pudieron traer', 'error')
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
    <h2><PackageSearch size={17} /> Lo que ya hay en este servidor</h2>
    {#if !markers.length && !orphans.length && !outside.length}
      <p class="muted small">Todo lo que Draupnode instaló aquí ya está en sus plantillas. Si abres Draupnode en otro equipo (o pierdes sus datos), aquí saldrán esas plantillas con el botón «Recuperar».</p>
    {/if}

    {#each markers as m (m.slug)}
      <div class="item">
        <ArchiveRestore size={16} class="ic" />
        <div class="txt">
          <span><strong>{m.nombre || m.slug}</strong>{#if m.plantilla && m.plantilla !== m.nombre} <span class="muted">(plantilla «{m.plantilla}»)</span>{/if}</span>
          <span class="muted small">Aplicada con Draupnode{m.draupnode ? ' ' + m.draupnode : ''}{m.at ? ' ' + timeAgo(m.at) : ''}, pero este Draupnode no la conoce. Módulos: {m.modulos.map((x) => moduleName(x.id)).join(', ')}.</span>
        </div>
        <button class="btn sm primary" onclick={() => recover(m)} disabled={!!busy}>{busy === m.slug ? 'Recuperando…' : 'Recuperar'}</button>
      </div>
    {/each}

    {#each orphans as s (s)}
      {@const g = guess(s)}
      <div class="item">
        <ArchiveRestore size={16} class="ic" />
        <div class="txt">
          <strong>{s}</strong>
          <span class="muted small">Contraseñas de una plantilla aplicada con un Draupnode anterior a la 0.42 (sin ficha). Se puede recuperar con lo que se ve instalado{g.modulos.length ? ': ' + g.modulos.map((x) => moduleName(x.id)).join(', ') : ''}; revisa después sus módulos.</span>
        </div>
        <button class="btn sm" onclick={() => recover(g, true)} disabled={!!busy || !g.modulos.length}>{busy === s ? 'Recuperando…' : 'Recuperar'}</button>
      </div>
    {/each}

    {#if outside.length}
      <div class="out">
        <p class="small"><strong>Instalado fuera de las plantillas de Draupnode:</strong> {outside.map((s) => moduleName(s.module)).join(', ')}.</p>
        <p class="muted small">Draupnode no lo toca. Si añades su módulo a una plantilla de este servidor, pasará a gestionarlo:</p>
        <ul>
          {#each outside as s}<li class="small"><strong>{moduleName(s.module)}</strong>{s.active ? '' : ' (parado)'}: {NOTES[s.module] ?? 'su módulo puede cambiar la configuración que tenga: pruébalo antes en el servidor de pruebas.'}</li>{/each}
        </ul>
      </div>
    {/if}
</section>

<style>
  .adopt { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
  h2 { display: flex; gap: 8px; align-items: center; margin: 0; font-size: 16px; }
  .item { display: flex; gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid var(--border-soft); }
  .item :global(.ic) { color: var(--accent); flex: none; }
  .txt { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 13.5px; }
  .small { font-size: 12.5px; margin: 0; }
  .out { border-top: 1px solid var(--border-soft); padding-top: 10px; display: flex; flex-direction: column; gap: 4px; }
  ul { margin: 2px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; }
</style>
