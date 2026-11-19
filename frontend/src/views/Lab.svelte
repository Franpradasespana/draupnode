<script lang="ts">
  import { onMount, tick } from 'svelte'
  import {
    FlaskConical, CircleCheck, CircleX, TriangleAlert, LoaderCircle, Play, Square, Trash2, RefreshCw,
    Download, Wrench, ServerCog, Copy, ExternalLink, ArrowRight, KeyRound,
  } from '@lucide/svelte'
  import { api, errorText, onEvent, type LabStatus } from '../lib/api'
  import { ui, toast, refreshServers, confirmDialog } from '../lib/state.svelte'

  let st = $state<LabStatus | null>(null)
  let loading = $state(true)
  let action = $state('')
  let lines = $state<string[]>([])
  let result = $state<{ ok: boolean; error?: string; action: string } | null>(null)
  let logEl = $state<HTMLElement | null>(null)

  const labels: Record<string, string> = {
    'fix-missing': 'Instalando Docker', 'fix-daemon': 'Arrancando Docker', 'fix-permission': 'Dando permiso',
    start: 'Creando y arrancando el servidor', stop: 'Parando el servidor', remove: 'Borrando el servidor',
  }

  async function refresh() {
    try {
      st = await api.LabStatus()
      if (st.busy) action = st.busy
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      loading = false
    }
  }

  onMount(() => {
    refresh()
    return onEvent('lab', async (e) => {
      if (e.kind === 'line') {
        lines.push(e.text ?? '')
        if (lines.length > 3000) lines.splice(0, lines.length - 3000)
        await tick()
        if (logEl) logEl.scrollTop = logEl.scrollHeight
        return
      }
      result = { ok: !!e.ok, error: e.error, action: e.action }
      action = ''
      await refresh()
      if (e.ok && e.action === 'start' && !st?.serverId) toast('Servidor listo. Dalo de alta en Draupnode con el botón de abajo.')
      else if (e.ok && e.action === 'fix-permission') toast('Permiso concedido. Si aún falla, reinicia el equipo.')
      else if (!e.ok) toast(e.error ?? 'Ha fallado', 'error')
    })
  })

  async function run(a: string) {
    if (a === 'remove') {
      const ok = await confirmDialog({
        title: 'Borrar el servidor de pruebas',
        message: 'Se borra el contenedor y todo lo instalado en él (Docker interno, Coolify…). Las claves se conservan, así que «Crear y arrancar» lo deja como nuevo con la misma huella.',
        confirmLabel: 'Borrar', danger: true,
      })
      if (!ok) return
    }
    lines = []
    result = null
    try {
      await api.LabAction(a)
      action = a
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function register() {
    try {
      await api.LabRegister()
      await refreshServers()
      await refresh()
      toast('Dado de alta en Servidores como «Servidor de pruebas (Docker)»')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function copy(t: string) {
    try {
      await navigator.clipboard.writeText(t)
      toast('Copiado')
    } catch {
      toast('No se pudo copiar', 'error')
    }
  }

  const d = $derived(st?.docker)
  const busy = $derived(!!action)
  const dockerOk = $derived(d?.problem === '')
</script>

<div class="head">
  <div>
    <h1>Pruebas</h1>
    <p class="muted">Un servidor Ubuntu 24.04 dentro de Docker en este equipo, para probar proyectos sin tocar un servidor real.</p>
  </div>
  <button class="btn" onclick={refresh} disabled={busy}><RefreshCw size={15} /> Volver a comprobar</button>
</div>

{#if loading}
  <p class="muted"><LoaderCircle size={15} class="spin" /> Comprobando Docker…</p>
{:else if st && d}
  <!-- 1. Docker -->
  <section class="card block">
    <div class="step">
      <span class="num" class:done={dockerOk}>1</span>
      <h2>Docker en este equipo</h2>
      {#if dockerOk}
        <span class="badge ok"><CircleCheck size={12} /> Docker {d.version}{#if d.viaGroup} · activado sin cerrar sesión{/if}</span>
      {:else}
        <span class="badge err"><CircleX size={12} /> {d.problem === 'missing' ? 'No instalado' : d.problem === 'daemon' ? 'Servicio parado' : d.problem === 'permission' ? 'Sin permiso' : 'Error'}</span>
      {/if}
    </div>

    {#if !dockerOk}
      <p class="msg"><TriangleAlert size={16} /> {d.message}</p>
      {#if d.os === 'linux'}
        <div class="fix">
          {#if d.canAutoFix}
            {#if d.problem === 'missing'}
              <button class="btn primary" onclick={() => run('fix-missing')} disabled={busy}><Download size={15} /> Instalar Docker</button>
            {:else if d.problem === 'daemon'}
              <button class="btn primary" onclick={() => run('fix-daemon')} disabled={busy}><Play size={15} /> Arrancar Docker</button>
            {:else if d.problem === 'permission' && !d.needsRelogin}
              <button class="btn primary" onclick={() => run('fix-permission')} disabled={busy}><Wrench size={15} /> Darme permiso</button>
            {/if}
            <span class="muted small">Se abrirá la ventana del sistema para pedirte tu contraseña.</span>
          {/if}
        </div>
        {#if d.problem === 'missing' && d.installCommand}
          <p class="muted small">O a mano, en una terminal:</p>
          <div class="cmd"><code class="selectable">sudo sh -c '{d.installCommand}'</code><button class="btn icon sm ghost" title="Copiar" onclick={() => copy(`sudo sh -c '${d.installCommand}'`)}><Copy size={14} /></button></div>
        {:else if d.problem === 'permission' && !d.needsRelogin}
          <p class="muted small">O a mano: <code class="selectable">sudo usermod -aG docker $USER</code> y después reinicia el equipo.</p>
        {:else if d.problem === 'daemon'}
          <p class="muted small">O a mano: <code class="selectable">sudo systemctl enable --now docker</code></p>
        {/if}
      {:else}
        <div class="fix">
          {#if d.problem === 'missing' && d.downloadUrl}
            <button class="btn primary" onclick={() => api.OpenURL(d.downloadUrl!)}><Download size={15} /> Descargar Docker Desktop</button>
            <span class="muted small">Instálalo, ábrelo y pulsa «Volver a comprobar».</span>
          {:else if d.problem === 'daemon'}
            <span class="muted">Abre <strong>Docker Desktop</strong> y espera a que diga que está en marcha; luego pulsa «Volver a comprobar».</span>
          {/if}
        </div>
      {/if}
    {/if}
  </section>

  <!-- 2. Servidor -->
  <section class="card block" class:off={!dockerOk && !st.server.running}>
    <div class="step">
      <span class="num" class:done={st.server.running}>2</span>
      <h2>Servidor de pruebas</h2>
      {#if st.server.running && st.server.byPort}
        <span class="badge ok"><CircleCheck size={12} /> En marcha</span>
        <span class="muted small">(lo veo por su puerto; para pararlo o borrarlo desde aquí, arregla primero el paso 1)</span>
      {:else if st.server.running}
        <span class="badge ok"><CircleCheck size={12} /> En marcha</span>
      {:else if st.server.exists}
        <span class="badge">Parado</span>
      {:else}
        <span class="badge">No creado</span>
      {/if}
    </div>
    <div class="buttons">
      {#if !st.server.running}
        <button class="btn primary" onclick={() => run('start')} disabled={busy || !dockerOk}>
          <Play size={15} /> {st.server.exists ? 'Arrancar' : 'Crear y arrancar'}
        </button>
      {:else}
        <button class="btn" onclick={() => run('stop')} disabled={busy || !dockerOk}><Square size={14} /> Parar</button>
      {/if}
      <button class="btn danger" onclick={() => run('remove')} disabled={busy || !dockerOk || !st.server.exists}><Trash2 size={14} /> Borrar</button>
      {#if st.server.running && st.coolifyUp}
        <button class="btn" onclick={() => api.OpenURL(st!.coolifyUrl)}><ExternalLink size={14} /> Panel de Coolify</button>
      {/if}
    </div>
    {#if st.server.running && !st.coolifyUp}
      <p class="muted small">El servidor está recién creado: no tiene Docker ni Coolify. Para instalarlos, dalo de alta (paso 3), crea un proyecto en él con el módulo <strong>Coolify</strong> y pulsa <strong>Aplicar</strong>. Después aparecerá aquí el botón «Panel de Coolify».</p>
    {/if}
    <p class="muted small">Parar conserva lo instalado. Borrar lo deja como recién creado (las claves y la huella se mantienen).</p>

    {#if busy || lines.length}
      <div class="progress">
        <div class="p-head">
          {#if busy}<LoaderCircle size={15} class="spin" /> {labels[action] ?? action}…
          {:else if result?.ok}<CircleCheck size={15} /> {labels[result.action] ?? result.action}: terminado
          {:else if result}<CircleX size={15} /> {labels[result.action] ?? result.action}: {result.error}{/if}
        </div>
        <pre class="log selectable" bind:this={logEl}>{lines.join('\n')}</pre>
      </div>
    {/if}
  </section>

  <!-- 3. Datos y alta -->
  <section class="card block" class:off={!st.server.running}>
    <div class="step">
      <span class="num" class:done={!!st.serverId}>3</span>
      <h2>Usarlo en Draupnode</h2>
      {#if st.serverId}<span class="badge ok"><CircleCheck size={12} /> Dado de alta</span>{/if}
    </div>
    <div class="buttons">
      {#if st.serverId}
        <button class="btn" onclick={() => (ui.view = 'servers')}><ServerCog size={15} /> Ver en Servidores</button>
        <button class="btn primary" onclick={() => { ui.view = 'projects'; ui.projectId = '' }}><ArrowRight size={15} /> Crear un proyecto</button>
      {:else}
        <button class="btn primary" onclick={register} disabled={!st.server.running}><ServerCog size={15} /> Dar de alta en Draupnode</button>
        <span class="muted small">Con la clave sin contraseña y la huella ya confiada.</span>
      {/if}
    </div>
    <table>
      <tbody>
        <tr><td>IP · puerto</td><td><code class="selectable">{st.host}</code> · <code>{st.port}</code></td></tr>
        <tr><td>Usuario</td><td><code>{st.user}</code> <span class="muted small">sudo sin contraseña, como en Oracle · contraseña <code>{st.password}</code></span></td></tr>
        <tr><td>Otro usuario</td><td><code>prueba</code> / <code>{st.password}</code> <span class="muted small">sudo CON contraseña (para probar que la app la pide)</span></td></tr>
        {#each st.keys as k}
          <tr>
            <td><KeyRound size={13} /> {k.label}</td>
            <td><code class="selectable path">{k.path}</code>{#if k.passphrase}<span class="muted small gap">contraseña <code>{k.passphrase}</code></span>{/if}</td>
          </tr>
        {/each}
        <tr><td>Huella</td><td><code class="selectable">{st.fingerprint}</code></td></tr>
        <tr><td>Por terminal</td><td><code class="selectable">ssh -i {st.keys[0]?.path} -p {st.port} {st.user}@{st.host}</code></td></tr>
      </tbody>
    </table>
  </section>
{/if}

<style>
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
  .head p { margin-top: 4px; }
  .block { display: flex; flex-direction: column; gap: 12px; margin-bottom: 14px; transition: opacity .2s; }
  .block.off { opacity: .55; }
  .step { display: flex; align-items: center; gap: 12px; }
  .num { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-weight: 600; font-size: 13px; background: var(--accent-soft); color: var(--accent); flex: none; }
  .num.done { background: var(--success-soft); color: var(--success); }
  .msg { display: flex; gap: 8px; align-items: center; }
  .msg :global(svg) { color: var(--accent); flex: none; }
  .fix, .buttons { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .small { font-size: 12.5px; }
  .cmd { display: flex; align-items: center; gap: 6px; background: var(--panel-2); border: 1px solid var(--border-soft); border-radius: 6px; padding: 4px 4px 4px 10px; }
  .cmd code { flex: 1; overflow-x: auto; white-space: nowrap; }
  .progress { border: 1px solid var(--border-soft); border-radius: var(--radius-sm); overflow: hidden; }
  .p-head { display: flex; align-items: center; gap: 8px; padding: 9px 12px; background: var(--panel-2); font-size: 13px; font-weight: 500; border-bottom: 1px solid var(--border-soft); }
  .log { margin: 0; padding: 10px 12px; max-height: 260px; overflow-y: auto; font-family: var(--mono); font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  td { padding: 7px 8px; border-bottom: 1px solid var(--border-soft); vertical-align: top; }
  td:first-child { color: var(--muted); white-space: nowrap; width: 200px; }
  td:first-child :global(svg) { vertical-align: -2px; }
  .path { word-break: break-all; }
  .gap { margin-left: 10px; }
</style>
