<script lang="ts">
  // «Guardar también en otro servidor»: crea (o reutiliza) el proyecto
  // «Destino de copias» en el servidor elegido y deja este proyecto apuntando a él.
  import { ServerCog, ShieldCheck, LoaderCircle, CircleCheck, ArrowRight, TriangleAlert, Dices } from '@lucide/svelte'
  import Modal from './Modal.svelte'
  import { api, errorText, type BackupTargetResult, type Project } from '../lib/api'
  import { ui, toast, withVault, refreshProjects } from '../lib/state.svelte'

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

  function openTarget() {
    if (!result) return
    ui.projectServer = null
    ui.projectId = result.targetProjectId
    ui.view = 'projects'
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
          <p class="muted small">Ya tiene el proyecto «{target.name}»: se añade este proyecto a él, con su mismo puerto ({target.modules.find((m) => m.id === 'backup-target')?.values.backup_target_port ?? '—'}).</p>
        {:else}
          <label class="field"><span>Puerto (elegido al azar)</span>
            <div class="port">
              <input class="input" type="number" min="1024" max="65535" bind:value={port} disabled={busy} />
              <button class="btn sm" type="button" onclick={() => (port = randomPort())} disabled={busy} title="Elegir otro al azar"><Dices size={14} /> Otro</button>
            </div>
            <small>Un puerto poco común para que no sea fácil de encontrar. Puedes poner el que quieras (1024-65535). Por él se conectará {source?.name ?? 'este servidor'}; se abre en el Cortafuegos del destino.</small>
          </label>
        {/if}
        {#if local}<p class="warn"><TriangleAlert size={16} /> Ese servidor se conecta por 127.0.0.1: el servidor de origen no podrá llegar a él.</p>{/if}
        <div class="note">
          <strong>Qué se hará</strong>
          <ul>
            <li><ServerCog size={14} /> {target ? 'Se actualiza' : 'Se crea'} el proyecto «Destino de copias» en ese servidor, con Docker, el Cortafuegos y rest-server.</li>
            <li><ShieldCheck size={14} /> Se generan aquí un usuario y una contraseña para este proyecto y un certificado HTTPS propio. Al destino solo llega la huella de la contraseña.</li>
            <li><ArrowRight size={14} /> El módulo Copias de este proyecto queda apuntando al destino. Tus copias siguen también en este servidor.</li>
          </ul>
          <span class="muted small">No se aplica nada todavía: lo haces tú después, en el orden que te diremos.</span>
        </div>
      {/if}
    </div>
  {:else}
    <div class="col">
      <p class="ok"><CircleCheck size={18} /> Listo. Destino: <code class="selectable">{result.url}</code></p>
      <ol>
        {#each result.notes as n}<li>{n}</li>{/each}
      </ol>
      <p class="muted small">Las copias viejas del destino no se borran (no se puede, a propósito): vigila su disco de vez en cuando.</p>
    </div>
  {/if}

  {#snippet footer()}
    {#if !result}
      <button class="btn" onclick={onclose} disabled={busy}>Cancelar</button>
      <button class="btn primary" onclick={create} disabled={busy || !serverId || !candidates.length}>
        {#if busy}<LoaderCircle size={15} class="spin" />{/if} Preparar
      </button>
    {:else}
      <button class="btn" onclick={onclose}>Cerrar</button>
      <button class="btn primary" onclick={openTarget}>Ir a «{result.targetProjectName}» <ArrowRight size={15} /></button>
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
  ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
  .port { display: flex; gap: 8px; }
  .port .input { width: 140px; }
  code { font-family: var(--mono); font-size: 12.5px; word-break: break-all; }
</style>
