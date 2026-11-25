<script lang="ts">
  import { Plus, Plug, Pencil, Trash2, LoaderCircle, KeyRound, UserRound, ShieldAlert, ShieldQuestion, Fingerprint, Server as ServerIcon, FolderGit2, Cloud } from '@lucide/svelte'
  import CloudCreateDialog from '../components/CloudCreateDialog.svelte'
  import Modal from '../components/Modal.svelte'
  import ServerForm from './ServerForm.svelte'
  import ServerDetail from './ServerDetail.svelte'
  import ProjectEditor from './ProjectEditor.svelte'
  import Facts from '../components/Facts.svelte'
  import { api, errorText, type Server, type TestResult } from '../lib/api'
  import { ui, refreshServers, toast, timeAgo, kbToGB, requestVault, withVault, requestStore, storeName, openServer } from '../lib/state.svelte'
  import { t, plural } from '../lib/i18n.svelte'

  type Dialog =
    | { kind: 'form'; server: Server | null }
    | { kind: 'secret'; server: Server; secretKind: 'passphrase' | 'password'; error?: string }
    | { kind: 'fingerprint'; server: Server; keyType: string; fingerprint: string; message: string; passphrase: string; remember: boolean }
    | { kind: 'changed'; server: Server; message: string }
    | { kind: 'result'; server: Server; result: TestResult }
    | { kind: 'delete'; server: Server }
    | null

  let dialog = $state<Dialog>(null)
  let cloudOpen = $state(false)
  let testing = $state<Record<string, boolean>>({})
  let pass = $state('')
  let rememberPass = $state(true)

  async function test(server: Server, passphrase = '', accept = '', remember = false) {
    testing[server.id] = true
    try {
      const r = await api.TestConnection(server.id, passphrase, accept)
      switch (r.status) {
        case 'ok':
          if (passphrase && remember) {
            try {
              const data = r.secretKind === 'passphrase' ? { ...server, keyEncrypted: true } : server
              const picked = await requestStore(server.secretStore)
              if (picked) {
                await withVault(() => api.SaveServer(data, passphrase, true, picked), t('Para guardar la contraseña de este servidor.'))
                toast(t('Contraseña guardada en {0}', storeName(picked)))
              }
            } catch (e) {
              toast(t('Conectado, pero no se guardó la contraseña: ') + errorText(e), 'error')
            }
          }
          dialog = { kind: 'result', server, result: r }
          break
        case 'needs_secret':
        case 'bad_secret':
          pass = ''
          rememberPass = true
          dialog = { kind: 'secret', server, secretKind: r.secretKind ?? 'passphrase', error: r.status === 'bad_secret' ? r.message : undefined }
          break
        case 'vault_locked':
          if (await requestVault('unlock', t('La contraseña de este servidor está en la bóveda.'))) return test(server, passphrase, accept, remember)
          break
        case 'unknown_host':
          dialog = { kind: 'fingerprint', server, keyType: r.keyType ?? '', fingerprint: r.fingerprint ?? '', message: r.message, passphrase, remember }
          break
        case 'host_changed':
          dialog = { kind: 'changed', server, message: r.message }
          break
        default:
          dialog = { kind: 'result', server, result: r }
      }
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      testing[server.id] = false
      await refreshServers()
    }
  }

  async function remove(server: Server) {
    try {
      await api.DeleteServer(server.id)
      await refreshServers()
      toast(t('«{0}» eliminado', server.name))
    } catch (e) {
      toast(errorText(e), 'error')
    }
    dialog = null
  }

  // Abre los proyectos del servidor (salvo si se pulsa un botón o se está seleccionando texto).
  function openProjects(e: MouseEvent | KeyboardEvent, id: string) {
    if ((e.target as HTMLElement).closest('button, a, input, select')) return
    if (window.getSelection()?.toString()) return
    openServer(id)
  }

  function submitPass(e: SubmitEvent, server: Server) {
    e.preventDefault()
    if (!pass) return
    const p = pass
    dialog = null
    test(server, p, '', rememberPass)
  }
</script>

{#if ui.projectId}
  {#key ui.projectId}<ProjectEditor id={ui.projectId} />{/key}
{:else if ui.serverId}
  {#key ui.serverId}<ServerDetail id={ui.serverId} />{/key}
{:else}


<div class="head">
  <div>
    <h1>{t('Servidores')}</h1>
    <p class="muted">{t('Conexiones SSH a las máquinas que Draupnode va a preparar.')}</p>
  </div>
  <div class="head-acts">
    <button class="btn" onclick={() => (cloudOpen = true)}><Cloud size={16} /> {t('Crear en la nube…')}</button>
    <button class="btn primary" onclick={() => (dialog = { kind: 'form', server: null })}><Plus size={16} /> {t('Añadir servidor')}</button>
  </div>
</div>

{#if ui.servers.length === 0}
  <div class="empty card">
    <ServerIcon size={34} strokeWidth={1.4} />
    <h2>{t('Aún no hay servidores')}</h2>
    <p class="muted">{t('Añade tu primer servidor con su IP, usuario y clave SSH (con o sin frase de paso).')}</p>
    <div class="head-acts">
      <button class="btn" onclick={() => (cloudOpen = true)}><Cloud size={16} /> {t('Crear en la nube…')}</button>
      <button class="btn primary" onclick={() => (dialog = { kind: 'form', server: null })}><Plus size={16} /> {t('Añadir servidor')}</button>
    </div>
  </div>
{:else}
  <div class="list">
    {#each ui.servers as s (s.id)}
      {@const lc = s.lastCheck}
      {@const n = ui.projects.find((p) => p.serverId === s.id)?.modules.length ?? 0}
      <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
      <article class="card srv" role="link" tabindex="0" title={t('Ver la ficha del servidor')}
        onclick={(e) => openProjects(e, s.id)}
        onkeydown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openProjects(e, s.id) }}>
        <div class="top">
          <span class="dot" class:ok={lc?.ok} class:err={lc && !lc.ok}></span>
          <div class="title">
            <h2>{s.name}</h2>
            <span class="mono muted selectable">{s.user}@{s.host}{s.port !== 22 ? ':' + s.port : ''}</span>
          </div>
          <div class="actions">
            <button class="btn sm" onclick={() => test(s)} disabled={testing[s.id]}>
              {#if testing[s.id]}<LoaderCircle size={15} class="spin" /> {t('Probando…')}{:else}<Plug size={15} /> {t('Probar conexión')}{/if}
            </button>
            <button class="btn sm icon" title={t('Editar')} aria-label={t('Editar')} onclick={() => (dialog = { kind: 'form', server: s })}><Pencil size={15} /></button>
            <button class="btn sm icon danger" title={t('Eliminar')} aria-label={t('Eliminar')} onclick={() => (dialog = { kind: 'delete', server: s })}><Trash2 size={15} /></button>
          </div>
        </div>
        <div class="meta">
          {#if s.authMethod === 'password'}
            <span class="badge"><UserRound size={12} /> {t('Contraseña')}</span>
          {:else if s.authMethod === 'key'}
            <span class="badge mono" title={s.keyPath}><KeyRound size={12} /> {s.keyPath.split(/[\\/]/).pop()}</span>
          {:else}
            <span class="badge">ssh-agent</span>
          {/if}
          {#if s.hasSecret}
            <span class="badge" >{t('Contraseña en {0}', storeName(s.secretStore))}</span>
          {:else if s.authMethod === 'password' || s.keyEncrypted}
            <span class="badge">{t('contraseña: se pide al conectar')}</span>
          {/if}
          <span class="badge"><FolderGit2 size={12} /> {plural(n, 'módulo', 'módulos')}</span>
          {#if lc?.ok}
            <span class="badge ok">{t('Conectado {0}', timeAgo(lc.at))}</span>
          {:else if lc}
            <span class="badge err">{t('Falló {0}', timeAgo(lc.at))}</span>
          {:else}
            <span class="badge">{t('Sin probar')}</span>
          {/if}
        </div>
        {#if lc?.ok && lc.facts}
          <div class="summary">
            <span>{lc.facts.os}</span>
            <span>{lc.facts.arch}</span>
            <span>{lc.facts.cpus} CPU</span>
            <span>{kbToGB(lc.facts.mem_kb)} RAM</span>
            <span>{t('{0} libres', kbToGB(lc.facts.disk_free_kb))}</span>
          </div>
        {:else if lc && !lc.ok}
          <p class="fail">{lc.error}</p>
        {/if}
        {#if s.notes}<p class="notes muted">{s.notes}</p>{/if}
      </article>
    {/each}
  </div>
{/if}

{/if}

{#if dialog?.kind === 'form'}
  <ServerForm server={dialog.server} onclose={() => (dialog = null)} onsaved={() => (dialog = null)} />
{:else if dialog?.kind === 'delete'}
  {@const srv = dialog.server}
  <Modal title={t('Eliminar servidor')} onclose={() => (dialog = null)} width={440}>
    <p>{t('¿Eliminar')} <strong>{srv.name}</strong> {t('de Draupnode? También se borrará su frase de paso del llavero. El servidor en sí no se toca.')}</p>
    {#snippet footer()}
      <button class="btn" onclick={() => (dialog = null)}>{t('Cancelar')}</button>
      <button class="btn solid-danger" onclick={() => remove(srv)}><Trash2 size={15} /> {t('Eliminar')}</button>
    {/snippet}
  </Modal>
{:else if dialog?.kind === 'secret'}
  {@const srv = dialog.server}
  {@const isPw = dialog.secretKind === 'password'}
  <Modal title={isPw ? t('Contraseña del usuario') : t('Contraseña de la clave')} onclose={() => (dialog = null)} width={480}>
    <form id="pass-form" onsubmit={(e) => submitPass(e, srv)} class="stack">
      {#if isPw}
        <p>{t('Escribe la contraseña de')} <code>{srv.user}</code> {t('en')} <strong>{srv.name}</strong>.</p>
      {:else}
        <p>{t('La clave')} <code class="selectable">{srv.keyPath.split(/[\\/]/).pop()}</code> {t('está protegida. Escribe su contraseña para conectar con')} <strong>{srv.name}</strong>.</p>
      {/if}
      <!-- svelte-ignore a11y_autofocus -->
      <input class="input" type="password" bind:value={pass} autofocus autocomplete="off" placeholder={t('Contraseña')} />
      {#if dialog.error}<p class="err">{dialog.error}</p>{/if}
      <label class="check">
        <input type="checkbox" bind:checked={rememberPass} />
        {t('Guardar contraseña')} <span class="muted small">{t('(al conectar elegirás dónde)')}</span>
      </label>
    </form>
    {#snippet footer()}
      <button class="btn" onclick={() => (dialog = null)}>{t('Cancelar')}</button>
      <button class="btn primary" type="submit" form="pass-form" disabled={!pass}>{t('Conectar')}</button>
    {/snippet}
  </Modal>
{:else if dialog?.kind === 'fingerprint'}
  {@const d = dialog}
  <Modal title={t('Servidor nuevo: confirma su huella')} onclose={() => (dialog = null)} width={560}>
    <div class="fp-head"><ShieldQuestion size={22} /> <p>{d.message}</p></div>
    <div class="fp card">
      <div><span class="muted">{t('Servidor')}</span><code class="selectable">{d.server.host}:{d.server.port}</code></div>
      <div><span class="muted">{t('Tipo')}</span><code>{d.keyType}</code></div>
      <div><span class="muted">{t('Huella')}</span><code class="selectable">{d.fingerprint}</code></div>
    </div>
    <p class="muted small">
      {t('Para comprobarla, en la consola del proveedor (o en el propio servidor) ejecuta:')}<br />
      <code class="selectable">ssh-keygen -lf /etc/ssh/ssh_host_{d.keyType.replace('ssh-', '').replace(/^ecdsa.*/, 'ecdsa')}_key.pub</code>
    </p>
    {#snippet footer()}
      <button class="btn" onclick={() => (dialog = null)}>{t('Cancelar')}</button>
      <button class="btn primary" onclick={() => { dialog = null; test(d.server, d.passphrase, d.fingerprint, d.remember) }}>
        <Fingerprint size={15} /> {t('Confiar y conectar')}
      </button>
    {/snippet}
  </Modal>
{:else if dialog?.kind === 'changed'}
  <Modal title={t('¡La huella del servidor ha cambiado!')} onclose={() => (dialog = null)} width={560}>
    <div class="fp-head danger"><ShieldAlert size={24} /><p>{t('No se ha conectado. {0}', dialog.message)}</p></div>
    {#snippet footer()}
      <button class="btn" onclick={() => (dialog = null)}>{t('Entendido')}</button>
    {/snippet}
  </Modal>
{:else if dialog?.kind === 'result'}
  {@const r = dialog.result}
  <Modal title={r.status === 'ok' ? t('Conectado a {0}', dialog.server.name) : t('No se pudo conectar')} onclose={() => (dialog = null)} width={640}>
    {#if r.status === 'ok' && r.facts}
      <Facts facts={r.facts} />
      <p class="muted small">{t('Comprobado en {0} ms.', r.durationMs)}</p>
    {:else}
      <p class="err selectable">{r.message}</p>
    {/if}
    {#snippet footer()}
      <button class="btn primary" onclick={() => (dialog = null)}>{t('Cerrar')}</button>
    {/snippet}
  </Modal>
{/if}

{#if cloudOpen}<CloudCreateDialog onclose={() => (cloudOpen = false)} />{/if}

<style>
  .head-acts { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
  .head p { margin-top: 4px; }
  .empty { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 48px 24px; color: var(--muted); }
  .empty h2 { color: var(--text); margin-top: 6px; }
  .empty .btn { margin-top: 8px; }
  .list { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; }
  .srv { display: flex; flex-direction: column; gap: 12px; cursor: pointer; transition: border-color .15s; }
  .srv:hover, .srv:focus-visible { border-color: var(--accent); outline: none; }
  .top { display: flex; align-items: center; gap: 12px; }
  .title { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .title span { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .actions { display: flex; gap: 6px; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px; }
  .summary { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; color: var(--muted); padding-top: 10px; border-top: 1px solid var(--border-soft); }
  .summary span:first-child { color: var(--text); }
  .fail { font-size: 12.5px; color: var(--danger); padding-top: 10px; border-top: 1px solid var(--border-soft); }
  .notes { font-size: 12.5px; }
  .stack { display: flex; flex-direction: column; gap: 14px; }
  .err { color: var(--danger); font-size: 13px; }
  .small { font-size: 12.5px; line-height: 1.6; }
  .fp-head { display: flex; gap: 12px; align-items: flex-start; }
  .fp-head :global(svg) { flex: none; color: var(--accent); }
  .fp-head.danger :global(svg) { color: var(--danger); }
  .fp-head.danger p { color: var(--text); }
  .fp { display: flex; flex-direction: column; gap: 8px; padding: 14px; background: var(--panel-2); }
  .fp div { display: grid; grid-template-columns: 80px 1fr; gap: 10px; align-items: baseline; }
  .fp code { word-break: break-all; }
</style>
