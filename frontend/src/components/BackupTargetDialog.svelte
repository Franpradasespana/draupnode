<script lang="ts">
  // «Guardar también en otro servidor»: crea (o reutiliza) el proyecto
  // «Destino de copias» en el servidor elegido y deja este proyecto apuntando a él.
  import { ServerCog, ShieldCheck, LoaderCircle, CircleCheck, ArrowRight, TriangleAlert, Dices } from '@lucide/svelte'
  import Modal from './Modal.svelte'
  import { api, errorText, type BackupTargetResult, type Project } from '../lib/api'
  import { ui, toast, withVault, refreshProjects, startRun, openDeployment } from '../lib/state.svelte'
  import { withConnection } from '../lib/connect'
  import { cloudHint } from '../lib/modules'

  let { project, onclose, onchanged }: { project: Project; onclose: () => void; onchanged: () => void } = $props()

  const source = $derived(ui.servers.find((s) => s.id === project.serverId))
  const candidates = $derived(ui.servers.filter((s) => s.id !== project.serverId && s.host !== source?.host))
  const existing = (sid: string) => ui.projects.find((p) => p.serverId === sid && p.modules.some((m) => m.id === 'backup-target'))
  let serverId = $state('')
  // Puerto al azar (20000-60999): se enseña y se puede cambiar.
  const randomPort = () => 20000 + Math.floor(Math.random() * 41000)
  let port = $state(randomPort())
  let busy = $state(false)
  let result = $state<BackupTargetResult | null>(null)

  $effect(() => {
    if (!serverId && candidates.length) serverId = (candidates.find((s) => existing(s.id)) ?? candidates.find((s) => !s.host.startsWith('127.')) ?? candidates[0]).id
  })
  const target = $derived(existing(serverId))
  const local = $derived(ui.servers.find((s) => s.id === serverId)?.host.startsWith('127.'))

  async function create() {
    busy = true
    try {
      result = await withVault(() => api.CreateBackupTarget(project.id, serverId, port), 'La contraseña del destino y la clave de su certificado se guardan cifradas en la bóveda.')
      await refreshProjects()
      onchanged()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      busy = false
    }
  }

  // «Aplicar los dos ahora»: destino → origen → destino otra vez (con la
  // contraseña de las copias del origen, que llega al aplicarlo: activa la rotación).
  type Step = { label: string; projectId: string; state: 'wait' | 'run' | 'ok' | 'fail'; detail?: string }
  let steps = $state<Step[]>([])
  let chaining = $state(false)
  const chainDone = $derived(steps.length > 0 && steps.every((x) => x.state === 'ok'))
  const chainFailed = $derived(steps.some((x) => x.state === 'fail'))

  function waitRun(projectId: string, runId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const t = setInterval(() => {
        const r = ui.runs[projectId]
        if (r && r.runId === runId && r.done) {
          clearInterval(t)
          resolve(!!r.summary?.ok)
        }
      }, 500)
    })
  }

  async function applyBoth() {
    if (!result) return
    const tgt = ui.projects.find((p) => p.id === result!.targetProjectId)
    const prune = tgt?.modules.find((m) => m.id === 'backup-target')?.values.backup_target_prune !== false
    steps = [
      { label: `Destino: «${result.targetProjectName}»`, projectId: result.targetProjectId, state: 'wait' },
      { label: `Origen: «${project.name}»`, projectId: project.id, state: 'wait' },
      ...(prune ? [{ label: 'Destino otra vez, para activar la rotación', projectId: result.targetProjectId, state: 'wait' as const }] : []),
    ]
    chaining = true
    for (const st of steps) {
      st.state = 'run'
      const p = ui.projects.find((x) => x.id === st.projectId)
      const srv = ui.servers.find((x) => x.id === p?.serverId)
      try {
        const r = await withConnection(srv, (s, a, u) => api.RunProject(st.projectId, false, s, a, u))
        if (!r || r.status !== 'started') {
          st.state = 'fail'
          st.detail = r?.message || 'Cancelado'
          break
        }
        startRun(st.projectId, r.runId!, false)
        const ok = await waitRun(st.projectId, r.runId!)
        st.state = ok ? 'ok' : 'fail'
        if (!ok) {
          st.detail = 'Ha fallado: ábrelo para ver qué pasó.'
          break
        }
      } catch (e) {
        st.state = 'fail'
        st.detail = errorText(e)
        break
      }
    }
    chaining = false
    await refreshProjects()
    onchanged()
    if (chainDone) toast('Aplicado en los dos servidores: las copias ya van también al otro servidor')
  }
  const stepNow = (st: Step) => (st.state === 'run' ? ui.runs[st.projectId]?.stage ?? 'Conectando…' : '')

  function openTarget() {
    if (!result) return
    openDeployment(result.targetProjectId)
    onclose()
  }
</script>

<Modal title="Guardar también en otro servidor" width={600} {onclose}>
  {#if !result}
    <div class="col">
      <p>Las copias de <strong>{project.name}</strong> se enviarán cada día, además, a otro servidor tuyo. Ese servidor <strong>solo deja añadir copias</strong>: aunque alguien entre en {source?.name ?? 'este servidor'}, no podrá borrarlas.</p>
      {#if !candidates.length}
        <p class="warn"><TriangleAlert size={16} /> Necesitas otro servidor dado de alta en «Servidores» (un VPS barato, una Raspberry, un NAS con Linux…).</p>
      {:else}
        <label class="field"><span>Servidor de destino</span>
          <select class="input" bind:value={serverId} disabled={busy}>
            {#each candidates as s}<option value={s.id}>{s.name} · {s.host}{existing(s.id) ? ' (ya es destino)' : ''}</option>{/each}
          </select>
        </label>
        {#if target}
          <p class="muted small">Ya tiene la plantilla «{target.name}»: se añade este servidor a ella, con su mismo puerto ({target.modules.find((m) => m.id === 'backup-target')?.values.backup_target_port ?? '—'}).</p>
        {:else}
          <label class="field"><span>Puerto (elegido al azar)</span>
            <div class="port">
              <input class="input" type="number" min="1024" max="65535" bind:value={port} disabled={busy} />
              <button class="btn sm" type="button" onclick={() => (port = randomPort())} disabled={busy} title="Elegir otro al azar"><Dices size={14} /> Otro</button>
            </div>
            <small>Un puerto poco común para que no sea fácil de encontrar. Puedes poner el que quieras (1024-65535). Por él se conectará {source?.name ?? 'este servidor'}; se abre en el Cortafuegos del destino.</small>
          </label>
        {/if}
        <p class="warn"><TriangleAlert size={16} /> {cloudHint(ui.servers.find((s) => s.id === serverId)?.lastCheck?.facts?.cloud, `el puerto ${target ? target.modules.find((m) => m.id === 'backup-target')?.values.backup_target_port : port}/TCP`)}</p>
        {#if local}<p class="warn"><TriangleAlert size={16} /> Ese servidor se conecta por 127.0.0.1: el servidor de origen no podrá llegar a él.</p>{/if}
        <div class="note">
          <strong>Qué se hará</strong>
          <ul>
            <li><ServerCog size={14} /> {target ? 'Se actualiza' : 'Se crea'} la plantilla «Destino de copias» en ese servidor, con Docker, el Cortafuegos y rest-server.</li>
            <li><ShieldCheck size={14} /> Se generan aquí un usuario y una contraseña para este servidor y un certificado HTTPS propio. Al destino solo llega la huella de la contraseña.</li>
            <li><ArrowRight size={14} /> El módulo Copias de este servidor queda apuntando al destino. Tus copias siguen también en este servidor.</li>
            <li><ShieldCheck size={14} /> Rotación: el destino borra cada día sus copias viejas (30 días y una al mes durante un año; se cambia en su módulo). Para eso recibe la contraseña de las copias; si no quieres, desactiva allí «Borrar las copias viejas».</li>
          </ul>
          <span class="muted small">No se aplica nada todavía: lo haces tú después, en el orden que te diremos.</span>
        </div>
      {/if}
    </div>
  {:else}
    <div class="col">
      <p class="ok"><CircleCheck size={18} /> Listo. Destino: <code class="selectable">{result.url}</code></p>
      {#if !steps.length}
        <ol>
          {#each result.notes as n}<li>{n}</li>{/each}
        </ol>
        <p class="muted small">Puedes aplicarlos ahora los dos seguidos (primero el destino, luego este servidor y otra vez el destino para activar la rotación) o hacerlo tú más tarde.</p>
      {:else}
        <ul class="chain">
          {#each steps as st}
            <li class="st-{st.state}">
              {#if st.state === 'run'}<LoaderCircle size={15} class="spin" />{:else if st.state === 'ok'}<CircleCheck size={15} />{:else if st.state === 'fail'}<TriangleAlert size={15} />{:else}<span class="dot"></span>{/if}
              <span>{st.label}{#if st.state === 'run'} <em class="muted">· {stepNow(st)}</em>{/if}{#if st.detail} <em>· {st.detail}</em>{/if}</span>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="muted small">En el destino, las copias viejas se borran solas cada día (por defecto se guardan 30 días y una al mes durante 12 meses). Lo cambias en la página de su módulo «Destino de copias».</p>
    </div>
  {/if}

  {#snippet footer()}
    {#if !result}
      <button class="btn" onclick={onclose} disabled={busy}>Cancelar</button>
      <button class="btn primary" onclick={create} disabled={busy || !serverId || !candidates.length}>
        {#if busy}<LoaderCircle size={15} class="spin" />{/if} Preparar
      </button>
    {:else if !steps.length}
      <button class="btn" onclick={openTarget}>Lo haré yo: ir a «{result.targetProjectName}»</button>
      <button class="btn primary" onclick={applyBoth}>Aplicar los dos ahora</button>
    {:else}
      <button class="btn" onclick={onclose} disabled={chaining}>Cerrar</button>
      {#if chainFailed}<button class="btn primary" onclick={openTarget}>Ir a «{result.targetProjectName}» <ArrowRight size={15} /></button>{/if}
    {/if}
  {/snippet}
</Modal>

<style>
  .col { display: flex; flex-direction: column; gap: 12px; font-size: 13.5px; }
  .col p { margin: 0; }
  .small { font-size: 12.5px; }
  .warn, .ok { display: flex; gap: 8px; align-items: flex-start; }
  .warn :global(svg) { color: var(--warning); flex: none; margin-top: 2px; }
  .ok :global(svg) { color: var(--success); flex: none; }
  .note { background: var(--panel-2); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; }
  .note ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .note li { display: flex; gap: 8px; align-items: flex-start; }
  .note li :global(svg) { color: var(--accent); flex: none; margin-top: 3px; }
  .chain { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .chain li { display: flex; gap: 8px; align-items: flex-start; }
  .chain li :global(svg) { flex: none; margin-top: 2px; }
  .chain .st-ok :global(svg) { color: var(--success); }
  .chain .st-fail :global(svg) { color: var(--danger); }
  .chain .st-wait { color: var(--muted); }
  .chain .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border); margin: 5px 4px 0; flex: none; }
  .chain em { font-style: normal; }
  ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
  .port { display: flex; gap: 8px; }
  .port .input { width: 140px; }
  code { font-family: var(--mono); font-size: 12.5px; word-break: break-all; }
</style>
