<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { FolderOpen, KeyRound, Eye, EyeOff, UserRound, FileInput } from '@lucide/svelte'
  import Modal from '../components/Modal.svelte'
  import { api, errorText, type ConfigHost, type KeyInfo, type Server } from '../lib/api'
  import { ui, refreshServers, toast, withVault, requestStore, storeName } from '../lib/state.svelte'

  let { server, onclose, onsaved }: {
    server: Server | null
    onclose: () => void
    onsaved: (s: Server) => void
  } = $props()

  // El formulario parte de los valores con los que se abre (no se resincroniza).
  const initial = untrack(() => server)
  const editing = !!initial?.id
  let form = $state<Server>(
    initial
      ? { ...initial, authMethod: initial.authMethod === 'agent' ? 'key' : initial.authMethod }
      : { id: '', name: '', host: '', port: 22, user: '', authMethod: 'key', keyPath: '', keyEncrypted: false, secretStore: '', notes: '' },
  )
  let secret = $state('')
  let showSecret = $state(false)
  let saveSecret = $state(initial ? !!initial.secretStore : true)
  let keys = $state<KeyInfo[]>([])
  let hosts = $state<ConfigHost[]>([])
  let keyInfo = $state<KeyInfo | null>(null)
  let saving = $state(false)
  let error = $state('')

  const hadSecret = !!initial?.hasSecret
  const needsSecret = $derived(form.authMethod === 'password' || form.keyEncrypted)
  // Opciones del desplegable: claves encontradas + la actual si no está entre ellas.
  const keyOptions = $derived(
    form.keyPath && !keys.some((k) => k.path === form.keyPath)
      ? [...keys, { path: form.keyPath, name: form.keyPath.split(/[\\/]/).pop() ?? form.keyPath, format: '', encrypted: false } as KeyInfo]
      : keys,
  )

  onMount(async () => {
    try {
      ;[keys, hosts] = await Promise.all([api.FindKeys(), api.SSHConfigHosts()])
    } catch (e) {
      toast(errorText(e), 'error')
    }
    if (form.keyPath) inspect(false)
  })

  async function inspect(autoCheck = true) {
    keyInfo = form.keyPath ? await api.InspectKey(form.keyPath) : null
    if (autoCheck && keyInfo && !keyInfo.error) form.keyEncrypted = keyInfo.encrypted
  }

  async function chooseKey(path: string) {
    form.keyPath = path
    await inspect()
  }

  async function browse() {
    try {
      const p = await api.PickKeyFile()
      if (p) await chooseKey(p)
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function importHost(alias: string) {
    const h = hosts.find((x) => x.alias === alias)
    if (!h) return
    form.name ||= h.alias
    form.host = h.hostName
    form.port = h.port || 22
    if (h.user) form.user = h.user
    if (h.identityFile) {
      form.authMethod = 'key'
      const match = keys.find((k) => k.path.endsWith(h.identityFile.replace(/^~/, '')))
      await chooseKey(match?.path ?? h.identityFile)
    }
    toast(`Datos importados de «${h.alias}»`)
  }

  function fmt(k: KeyInfo) {
    const f = k.format === 'ppk' ? 'PuTTY' : k.format === 'openssh' ? 'OpenSSH' : k.format === 'pem' ? 'PEM' : ''
    return [f, k.keyType?.replace('ssh-', ''), k.encrypted ? 'con contraseña' : ''].filter(Boolean).join(' · ')
  }

  async function save(e: SubmitEvent) {
    e.preventDefault()
    error = ''
    if (form.authMethod === 'key' && !form.keyPath) return (error = 'Elige la clave privada.')
    if (needsSecret && saveSecret && !secret && !hadSecret) {
      return (error = 'Escribe la contraseña o desmarca «Guardar contraseña» (entonces se pedirá al conectar).')
    }
    // Contraseña nueva que guardar → ventana para elegir dónde.
    let storeChoice = ''
    if (needsSecret && saveSecret && secret) {
      const picked = await requestStore(initial?.secretStore || '')
      if (!picked) return
      storeChoice = picked
    }
    saving = true
    try {
      const data = { ...form, port: Number(form.port) || 22, keyEncrypted: form.authMethod === 'key' && form.keyEncrypted }
      const saved = await withVault(
        () => api.SaveServer(data, needsSecret ? secret : '', needsSecret && saveSecret, storeChoice),
        'Para guardar la contraseña de este servidor.',
      )
      await refreshServers()
      toast(editing ? 'Servidor actualizado' : 'Servidor añadido')
      onsaved(saved)
    } catch (err) {
      error = errorText(err)
    } finally {
      saving = false
    }
  }
</script>

<Modal title={editing ? `Editar «${initial?.name}»` : 'Añadir servidor'} {onclose} width={640}>
  <form id="server-form" class="grid" onsubmit={save}>
    {#if !editing && hosts.length}
      <div class="import span2">
        <FileInput size={16} />
        <span>Importar de <code>~/.ssh/config</code></span>
        <select class="input" onchange={(e) => { importHost(e.currentTarget.value); e.currentTarget.value = '' }}>
          <option value="">Elige un servidor…</option>
          {#each hosts as h}<option value={h.alias}>{h.alias} — {h.user ? h.user + '@' : ''}{h.hostName}</option>{/each}
        </select>
      </div>
    {/if}

    <label class="field span2">
      <span>Nombre</span>
      <input class="input" bind:value={form.name} placeholder="Servidor web" required />
    </label>
    <label class="field">
      <span>IP o dominio</span>
      <input class="input mono" bind:value={form.host} placeholder="203.0.113.10" required spellcheck="false" />
    </label>
    <label class="field">
      <span>Puerto</span>
      <input class="input mono" type="number" min="1" max="65535" bind:value={form.port} />
    </label>
    <label class="field span2">
      <span>Usuario</span>
      <input class="input mono" bind:value={form.user} placeholder="ubuntu" required spellcheck="false" />
      <small>En Oracle Cloud suele ser <code>ubuntu</code> u <code>opc</code>.</small>
    </label>

    <div class="field span2">
      <span>Cómo entrar</span>
      <div class="seg">
        <button type="button" class:on={form.authMethod === 'key'} onclick={() => (form.authMethod = 'key')}>
          <KeyRound size={15} /> Usuario y clave SSH
        </button>
        <button type="button" class:on={form.authMethod === 'password'} onclick={() => (form.authMethod = 'password')}>
          <UserRound size={15} /> Usuario y contraseña
        </button>
      </div>
    </div>

    {#if form.authMethod === 'key'}
      <div class="field span2">
        <span>Clave privada</span>
        <div class="row">
          <select class="input" value={form.keyPath} onchange={(e) => chooseKey(e.currentTarget.value)}>
            <option value="" disabled>{keys.length ? `${keys.length} clave(s) encontrada(s) en tu equipo…` : 'No se encontraron claves en ~/.ssh'}</option>
            {#each keyOptions as k (k.path)}
              <option value={k.path}>{k.name}{fmt(k) ? `  (${fmt(k)})` : ''}</option>
            {/each}
          </select>
          <button type="button" class="btn" onclick={browse}><FolderOpen size={15} /> Examinar…</button>
        </div>
        {#if form.keyPath}<small class="mono path selectable">{form.keyPath}</small>{/if}
        {#if keyInfo?.error}
          <small class="err">{keyInfo.error}</small>
        {:else if keyInfo}
          <small>{fmt(keyInfo) || 'Clave'}{keyInfo.comment ? ` · «${keyInfo.comment}»` : ''}</small>
        {/if}
        <small>Se admiten claves OpenSSH (<code>id_ed25519</code>, <code>id_rsa</code>…), PEM/PKCS#8 (<code>.key</code>, <code>.pem</code>) y PuTTY (<code>.ppk</code>).</small>
      </div>

      <div class="checks span2">
        <label class="check">
          <input type="checkbox" bind:checked={form.keyEncrypted} />
          La clave tiene contraseña
        </label>
        <label class="check" class:off={!form.keyEncrypted}>
          <input type="checkbox" bind:checked={saveSecret} disabled={!form.keyEncrypted} />
          Guardar contraseña
        </label>
      </div>
    {:else}
      <div class="checks span2">
        <span class="muted small">Se entrará con la contraseña del usuario <strong>{form.user || '…'}</strong>.</span>
        <label class="check">
          <input type="checkbox" bind:checked={saveSecret} />
          Guardar contraseña
        </label>
      </div>
    {/if}

    {#if needsSecret}
      <div class="field span2">
        <span>{form.authMethod === 'password' ? 'Contraseña del usuario' : 'Contraseña de la clave'}</span>
        <div class="row">
          <input
            class="input"
            type={showSecret ? 'text' : 'password'}
            bind:value={secret}
            placeholder={hadSecret ? '•••••••• guardada (escribe para cambiarla)' : saveSecret ? 'Contraseña' : 'Opcional: si la dejas vacía se pedirá al conectar'}
            autocomplete="off"
          />
          <button type="button" class="btn icon" onclick={() => (showSecret = !showSecret)} aria-label="Mostrar u ocultar">
            {#if showSecret}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
          </button>
        </div>
        {#if !saveSecret}
          <small>No se guardará: se pedirá cada vez que te conectes.</small>
        {:else if hadSecret && initial?.secretStore && !secret}
          <small>Guardada en {storeName(initial.secretStore)}.</small>
        {:else}
          <small>Al pulsar «{editing ? 'Guardar cambios' : 'Añadir servidor'}» elegirás dónde guardarla.</small>
        {/if}
      </div>
    {/if}

    <label class="field span2">
      <span>Notas</span>
      <textarea class="input" bind:value={form.notes} rows="2" placeholder="Opcional"></textarea>
    </label>
    {#if error}<p class="span2 err">{error}</p>{/if}
  </form>

  {#snippet footer()}
    <button class="btn" type="button" onclick={onclose}>Cancelar</button>
    <button class="btn primary" type="submit" form="server-form" disabled={saving}>
      {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Añadir servidor'}
    </button>
  {/snippet}
</Modal>

<style>
  .grid { display: grid; grid-template-columns: 1fr 120px; gap: 16px; }
  .span2 { grid-column: 1 / -1; }
  .row { display: flex; gap: 8px; }
  .row select { flex: 1; min-width: 0; }
  select.input { cursor: pointer; }
  .import {
    display: flex; align-items: center; gap: 10px; padding: 10px 12px;
    border: 1px dashed var(--border); border-radius: var(--radius-sm); background: var(--panel-2); font-size: 13px;
  }
  .import :global(svg) { color: var(--accent); flex: none; }
  .import span { white-space: nowrap; }
  .import select { height: 32px; }
  .seg { display: flex; padding: 3px; border-radius: var(--radius-sm); background: var(--panel-2); border: 1px solid var(--border); width: fit-content; }
  .seg button {
    display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 14px;
    border: 0; border-radius: 5px; background: none; color: var(--muted); cursor: pointer; font-weight: 500;
  }
  .seg button.on { background: var(--accent-soft); color: var(--accent); }
  .checks { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .check.off { opacity: .45; }
  .path { word-break: break-all; }
  .small { font-size: 13px; }
  .err { color: var(--danger); font-size: 13px; }
</style>
