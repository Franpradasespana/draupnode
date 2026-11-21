<script lang="ts">
  // Página de un módulo del proyecto (instalado o fuera del proyecto): su
  // estado, lo propio de cada módulo, su configuración y quitar/desinstalar.
  import { Hammer, Trash2, Undo2, ExternalLink, Info, ChevronDown, ChevronRight, CircleCheck } from '@lucide/svelte'
  import ModuleForm from './ModuleForm.svelte'
  import BackupsPanel from './BackupsPanel.svelte'
  import ModuleText from './ModuleText.svelte'
  import ModuleLinks from './ModuleLinks.svelte'
  import WireguardPanel from './WireguardPanel.svelte'
  import AlertsPanel from './AlertsPanel.svelte'
  import MonitoringPanel from './MonitoringPanel.svelte'
  import ProjectSecrets from './ProjectSecrets.svelte'
  import { api, type Module, type MonitorResult, type Project, type ProjectModule } from '../lib/api'
  import { timeAgo, ui, toast } from '../lib/state.svelte'
  import { withConnection } from '../lib/connect'
  import { sameValues } from '../lib/modules'

  let { m, modules = $bindable(), project, errors = {}, requiredBy = [], running = false, onsecret, onapply, onremove, onreadd, onuninstall, onreload = () => {} }: {
    m: Module
    modules: ProjectModule[]
    project: Project
    errors?: Record<string, string>
    requiredBy?: string[]
    running?: boolean
    onsecret: () => void
    onapply: () => void
    onremove: () => void
    onreadd: () => void
    onuninstall: () => void
    onreload?: () => void
  } = $props()

  const pm = $derived(modules.find((x) => x.id === m.id))
  const installed = $derived(!!project.installedModules?.includes(m.id))
  // ¿La configuración ha cambiado desde que se aplicó?
  const changed = $derived(!!pm && installed && !!project.installedValues?.[m.id] && !sameValues(pm.values, project.installedValues[m.id]))
  const errorCount = $derived(Object.keys(errors).length)
  let more = $state(false)

  // Apps (proxy_site): «Abrir» por túnel SSH, o su dominio.
  const appDomain = $derived(m.proxySite && installed ? String(project.installedValues?.[m.id]?.[m.proxySite.domain] ?? '') : '')
  let opening = $state(false)
  async function openApp() {
    opening = true
    try {
      const server = ui.servers.find((s) => s.id === project.serverId)
      const r = await withConnection<MonitorResult>(server, (s, a) => api.OpenAppTunnel(project.id, m.id, s, a))
      if (r?.status === 'ok' && r.url) api.OpenURL(r.url)
      else if (r) toast(r.message || 'No se pudo abrir', 'error')
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      opening = false
    }
  }

  let webUrl = $state('')
  $effect(() => {
    if (m.id !== 'coolify' || !installed) return
    api.ServerLive(project.serverId).then((l) => (webUrl = l.webUrl ?? '')).catch(() => {})
  })
</script>

<section class="card head">
  <div class="title">
    <h2>{m.name}</h2>
    {#if installed && pm}<span class="pill ok"><CircleCheck size={13} /> Instalado{#if project.appliedAt}{' · '}aplicado {timeAgo(project.appliedAt)}{/if}</span>
    {:else if installed}<span class="pill left">Instalado, fuera del proyecto</span>
    {:else}<span class="pill new">Se instalará al aplicar</span>{/if}
  </div>
  <p class="muted">{m.description}</p>
  <ModuleLinks links={m.links} />
  {#if m.details}
    <button class="more" onclick={() => (more = !more)}>{#if more}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if} Cómo funciona</button>
    {#if more}<ModuleText text={m.details} />{/if}
  {/if}
  {#if !pm && installed}
    <p class="info"><Info size={15} /> Sigue instalado y funcionando en el servidor, pero este proyecto ya no lo gestiona (no lo comprueba ni lo actualiza al aplicar).</p>
  {/if}
  {#if m.proxySite && installed}
    <div class="app-open">
      <button class="btn sm primary" onclick={openApp} disabled={opening}><ExternalLink size={14} /> {opening ? 'Abriendo…' : 'Abrir (túnel SSH)'}</button>
      {#if appDomain}<button class="btn sm" onclick={() => api.OpenURL('https://' + appDomain)}><ExternalLink size={14} /> https://{appDomain}</button>{/if}
      <span class="muted small">«Abrir» la ve desde este equipo sin publicarla en internet.</span>
    </div>
  {/if}
  {#if m.id === 'coolify' && installed && webUrl}
    <div><button class="btn sm" onclick={() => api.OpenURL(webUrl)}><ExternalLink size={14} /> Abrir el panel de Coolify</button> <span class="muted small">{webUrl}</span></div>
  {/if}
</section>

{#if m.id === 'monitoring' && installed}
  <MonitoringPanel {project} />
{/if}
{#if m.id === 'logs' && installed}
  <MonitoringPanel {project} dashboard="logs-apps" />
{/if}

{#if m.id === 'alerts' && installed}
  <AlertsPanel {project} disabled={running} />
{/if}

{#if m.id === 'wireguard' && installed}
  <WireguardPanel {project} />
{/if}

{#if m.id === 'backups' && installed}
  <BackupsPanel {project} disabled={running} onchanged={onreload} />
{/if}

{#if m.secrets?.length || m.variables?.some((v) => v.type === 'secret')}
  <ProjectSecrets projectId={project.id} refreshKey={project.lastRun?.at ?? ''} module={m.name} />
{/if}

{#if pm}
  <section class="card cfg">
    <div class="cfg-h">
      <h3>Configuración</h3>
      {#if changed}<span class="pending">Cambios sin aplicar</span>{/if}
    </div>
    <ModuleForm {m} bind:values={pm.values} {errors} projectId={project.id} {onsecret} />
    {#if changed || !installed}
      <div class="cfg-f">
        <span class="muted small">{errorCount ? `Corrige ${errorCount} opción(es) en rojo.` : 'Los cambios se guardan solos; en el servidor se aplican al pulsar el botón.'}</span>
        <button class="btn primary" onclick={onapply} disabled={running || errorCount > 0}><Hammer size={15} /> Aplicar cambios</button>
      </div>
    {/if}
  </section>
{/if}

<section class="card zone">
  {#if pm}
    <div class="z">
      <div><strong>Quitar del proyecto</strong><span class="muted small">Sigue instalado en el servidor; Draupnode deja de gestionarlo.</span></div>
      <button class="btn" onclick={onremove} disabled={running || requiredBy.length > 0} title={requiredBy.length ? `Lo necesita ${requiredBy.join(', ')}` : ''}>Quitar del proyecto</button>
    </div>
    {#if requiredBy.length}<p class="muted small">No se puede quitar mientras lo necesite {requiredBy.join(', ')}.</p>{/if}
  {:else}
    <div class="z">
      <div><strong>Volver a gestionarlo</strong><span class="muted small">Lo añade otra vez al proyecto con la configuración con la que se instaló.</span></div>
      <button class="btn" onclick={onreadd} disabled={running}><Undo2 size={15} /> Volver al proyecto</button>
    </div>
  {/if}
  {#if installed}
    <div class="z">
      <div><strong>Desinstalar del servidor</strong><span class="muted small">{m.noUninstall ? `No se puede: ${m.noUninstall}` : m.uninstallWarning ?? 'Lo quita del servidor.'}</span></div>
      <button class="btn danger" onclick={onuninstall} disabled={running || !!m.noUninstall || !m.uninstallable}><Trash2 size={15} /> Desinstalar…</button>
    </div>
  {/if}
</section>

<style>
  .head { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
  .title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .title h2 { margin: 0; font-size: 20px; }
  .pill { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; }
  .pill.ok { background: var(--success-soft); color: var(--success); }
  .pill.new { background: var(--info-soft); color: var(--info); }
  .pill.left { border: 1px dashed var(--success); color: var(--success); }
  .head p { margin: 0; font-size: 13.5px; }
  .more { display: inline-flex; align-items: center; gap: 4px; background: none; border: 0; color: var(--accent); font: inherit; font-size: 13px; cursor: pointer; padding: 0; align-self: flex-start; }
  .info { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; background: var(--panel-2); padding: 8px 10px; border-radius: var(--radius-sm); }
  .small { font-size: 12px; }
  .cfg { margin: 14px 0; }
  .cfg-h { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .cfg-h h3 { margin: 0; }
  .pending { font-size: 12px; font-weight: 600; color: var(--info); background: var(--info-soft); padding: 2px 8px; border-radius: 999px; }
  .cfg-f { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid var(--border-soft); padding-top: 12px; margin-top: 4px; flex-wrap: wrap; }
  .zone { display: flex; flex-direction: column; gap: 12px; }
  .z { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .z > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .z strong { font-size: 13.5px; }
  .app-open { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
</style>
