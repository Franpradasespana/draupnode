<script lang="ts">
  import { Check, Copy, Pencil, Plus, Trash2, Upload, TriangleAlert, FolderCog, KeyRound, LockKeyhole, Lock } from '@lucide/svelte'
  import Modal from '../components/Modal.svelte'
  import PalettePreview from '../components/PalettePreview.svelte'
  import KeyringHelp from '../components/KeyringHelp.svelte'
  import BackupSection from '../components/BackupSection.svelte'
  import { BUILTIN_PALETTES, COLOR_KEYS, applyPalette, contrast, cssVars, isHex, type Palette } from '../lib/palettes'
  import { ui, allPalettes, currentPalette, setTheme, persistSettings, sanitizePalettes, toast, requestVault, refreshSecrets } from '../lib/state.svelte'
  import { api, errorText } from '../lib/api'

  let updEnabled = $state(true)
  api.GetSettings().then((s) => (updEnabled = !s.noUpdateCheck)).catch(() => {})
  async function setUpd(v: boolean) {
    updEnabled = v
    try { await api.SetUpdateCheck(v) } catch (e) { toast(errorText(e), 'error') }
  }

  async function setBackend(b: string) {
    try {
      await api.SetSecretBackend(b)
      await refreshSecrets()
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function lockVault() {
    await api.VaultLock()
    await refreshSecrets()
    toast('Bóveda bloqueada')
  }

  let editing = $state<Palette | null>(null)
  let hexDraft = $state<Record<string, string>>({})
  let importing = $state(false)
  let importText = $state('')
  let confirmDelete = $state<Palette | null>(null)

  const groups = $derived([
    { title: 'Oscuras', items: allPalettes().filter((p) => p.mode === 'dark' && !p.custom) },
    { title: 'Claras y mixtas', items: allPalettes().filter((p) => p.mode !== 'dark' && !p.custom) },
  ])

  function startNew(from: Palette) {
    editing = {
      id: 'custom-' + Math.random().toString(36).slice(2, 9),
      name: from.custom ? from.name + ' (copia)' : 'Mi ' + from.name,
      tag: 'Personalizada',
      mode: from.mode,
      colors: { ...from.colors },
      custom: true,
    }
    hexDraft = { ...editing.colors }
  }

  function startEdit(p: Palette) {
    editing = { ...p, colors: { ...p.colors } }
    hexDraft = { ...p.colors }
  }

  // Vista previa en vivo sobre toda la app mientras se edita.
  $effect(() => {
    if (editing) applyPalette(editing.colors)
  })

  function cancelEdit() {
    editing = null
    applyPalette(currentPalette().colors)
  }

  function setColor(key: string, v: string) {
    if (!editing) return
    hexDraft[key] = v
    const val = v.startsWith('#') ? v : '#' + v
    if (isHex(val)) (editing.colors as unknown as Record<string, string>)[key] = val.toUpperCase()
  }

  async function saveEdit() {
    if (!editing) return
    if (!editing.name.trim()) return toast('Ponle un nombre a la paleta', 'error')
    const p = { ...editing, name: editing.name.trim(), colors: { ...editing.colors } }
    const i = ui.custom.findIndex((c) => c.id === p.id)
    ui.custom = i >= 0 ? ui.custom.map((c) => (c.id === p.id ? p : c)) : [...ui.custom, p]
    editing = null
    setTheme(p.id)
    toast(`Paleta «${p.name}» guardada`)
  }

  async function remove(p: Palette) {
    ui.custom = ui.custom.filter((c) => c.id !== p.id)
    confirmDelete = null
    if (ui.themeId === p.id) setTheme(BUILTIN_PALETTES[0].id)
    else await persistSettings()
    toast(`Paleta «${p.name}» eliminada`)
  }

  async function exportPalettes() {
    const data = JSON.stringify(ui.custom.length ? ui.custom : [currentPalette()], null, 2)
    try {
      await navigator.clipboard.writeText(data)
      toast(ui.custom.length ? 'Paletas personalizadas copiadas al portapapeles' : 'Paleta actual copiada al portapapeles')
    } catch (e) {
      toast('No se pudo copiar: ' + errorText(e), 'error')
    }
  }

  async function doImport() {
    let parsed: unknown
    try {
      parsed = JSON.parse(importText)
    } catch {
      return toast('Eso no es JSON válido', 'error')
    }
    const got = sanitizePalettes(Array.isArray(parsed) ? parsed : [parsed]).map((p) => ({
      ...p,
      id: 'custom-' + Math.random().toString(36).slice(2, 9),
    }))
    if (!got.length) return toast('No hay ninguna paleta válida (10 colores #RRGGBB)', 'error')
    ui.custom = [...ui.custom, ...got]
    await persistSettings()
    importing = false
    importText = ''
    toast(`${got.length} paleta(s) importada(s)`)
  }

  const warnings = $derived.by(() => {
    if (!editing) return []
    const c = editing.colors
    const v = cssVars(c)
    const w: string[] = []
    if (contrast(c.text, c.bg) < 4.5) w.push('El texto se lee mal sobre el fondo (contraste < 4,5).')
    if (contrast(c.text, c.panel) < 4.5) w.push('El texto se lee mal sobre los paneles.')
    if (contrast(c.muted, c.panel) < 3) w.push('El texto secundario apenas se distingue en los paneles.')
    if (contrast(v['--on-accent'], c.accent) < 3) w.push('El texto de los botones principales se lee mal.')
    if (contrast(c.success, c.danger) < 1.3) w.push('«Correcto» y «Error» se parecen demasiado.')
    return w
  })
</script>

<div class="head">
  <div>
    <h1>Ajustes</h1>
    <p class="muted">Apariencia y datos de la aplicación.</p>
  </div>
</div>

<BackupSection />

<section class="card secrets">
  <div class="sec-head">
    <div>
      <h2>Contraseñas guardadas</h2>
      <p class="muted small">Dónde se guardan las contraseñas de tus claves y usuarios cuando marcas «Guardar contraseña».</p>
    </div>
  </div>
  {#if ui.secrets}
    {@const sx = ui.secrets}
    <div class="opts">
      <label class="opt" class:on={sx.backend === 'auto'}>
        <input type="radio" name="sb" checked={sx.backend === 'auto'} onchange={() => setBackend('auto')} />
        <div>
          <strong>Automático <span class="badge accent">recomendado</span></strong>
          <span class="muted">Usa el llavero del sistema si existe; si no, la bóveda cifrada de Draupnode.</span>
        </div>
      </label>
      <label class="opt" class:on={sx.backend === 'keyring'} class:disabled={!sx.keyring.available}>
        <input type="radio" name="sb" checked={sx.backend === 'keyring'} disabled={!sx.keyring.available} onchange={() => setBackend('keyring')} />
        <div>
          <strong><KeyRound size={15} /> Llavero del sistema</strong>
          <span class="muted">{sx.keyring.name}</span>
          {#if sx.keyring.available}
            <span class="badge ok">Detectado y funcionando</span>
          {:else}
            <span class="badge err">No detectado en este equipo</span>
          {/if}
        </div>
      </label>
      <label class="opt" class:on={sx.backend === 'vault'}>
        <input type="radio" name="sb" checked={sx.backend === 'vault'} onchange={() => setBackend('vault')} />
        <div>
          <strong><LockKeyhole size={15} /> Bóveda cifrada de Draupnode</strong>
          <span class="muted">Fichero cifrado en tu equipo con una contraseña maestra (Argon2id + XChaCha20-Poly1305). Funciona en cualquier sistema.</span>
          <div class="vault-row">
            {#if !sx.vault.exists}
              <span class="badge">Sin crear</span>
              <button type="button" class="btn sm" onclick={() => requestVault('create')}>Crear bóveda</button>
            {:else if sx.vault.unlocked}
              <span class="badge ok">Desbloqueada</span>
              <button type="button" class="btn sm" onclick={lockVault}><Lock size={14} /> Bloquear</button>
            {:else}
              <span class="badge">Bloqueada</span>
              <button type="button" class="btn sm" onclick={() => requestVault('unlock')}>Desbloquear</button>
            {/if}
            {#if sx.vault.exists}<span class="muted small">{sx.vault.entries} contraseña(s)</span>{/if}
          </div>
        </div>
      </label>
    </div>
    <KeyringHelp />
    <p class="muted small now">
      Ahora se guardan en: <strong>{sx.effective === 'keyring' ? sx.keyring.name : 'la bóveda cifrada de Draupnode'}</strong>.
      Las ya guardadas siguen donde estaban hasta que las vuelvas a escribir.
    </p>
  {/if}
</section>

<section>
  <div class="sec-head">
    <h2>Tema</h2>
    <div class="row">
      <button class="btn sm" onclick={() => (importing = true)}><Upload size={14} /> Importar</button>
      <button class="btn sm" onclick={exportPalettes}><Copy size={14} /> Exportar</button>
      <button class="btn sm primary" onclick={() => startNew(currentPalette())}><Plus size={14} /> Nueva paleta</button>
    </div>
  </div>

  {#if ui.custom.length}
    <h3 class="group">Tus paletas</h3>
    <div class="grid">
      {#each ui.custom as p (p.id)}
        {@render card(p)}
      {/each}
    </div>
  {/if}

  {#each groups as g}
    <h3 class="group">{g.title}</h3>
    <div class="grid">
      {#each g.items as p (p.id)}
        {@render card(p)}
      {/each}
    </div>
  {/each}
</section>

<section class="card about">
  <h2>Datos de la aplicación</h2>
  <label class="upd"><input type="checkbox" checked={updEnabled} onchange={(e) => setUpd((e.currentTarget as HTMLInputElement).checked)} />
    Avisar de versiones nuevas <span class="muted small">(al abrir, consulta la última versión publicada en GitHub; no envía ningún dato tuyo)</span></label>
  <div class="kv"><FolderCog size={16} /><span class="muted">Configuración</span><code class="selectable">{ui.info?.configDir}</code></div>
</section>

{#snippet card(p: Palette)}
  {@const active = ui.themeId === p.id}
  <div class="pcard" class:active>
    <button class="pick" onclick={() => setTheme(p.id)} aria-label="Usar {p.name}">
      <PalettePreview colors={p.colors} />
    </button>
    <div class="swatches">
      {#each COLOR_KEYS as { key }}<i style="background: {p.colors[key]}"></i>{/each}
    </div>
    <div class="pfoot">
      <div class="pname">
        <strong>{p.name}</strong>
        <span class="muted">{p.tag}</span>
      </div>
      {#if active}<span class="badge accent"><Check size={12} /> En uso</span>{/if}
      <div class="pact">
        {#if p.custom}
          <button class="btn icon sm ghost" title="Editar" aria-label="Editar" onclick={() => startEdit(p)}><Pencil size={14} /></button>
          <button class="btn icon sm ghost danger" title="Eliminar" aria-label="Eliminar" onclick={() => (confirmDelete = p)}><Trash2 size={14} /></button>
        {:else}
          <button class="btn icon sm ghost" title="Duplicar y editar" aria-label="Duplicar y editar" onclick={() => startNew(p)}><Copy size={14} /></button>
        {/if}
      </div>
    </div>
  </div>
{/snippet}

{#if editing}
  <Modal title={ui.custom.some((c) => c.id === editing?.id) ? 'Editar paleta' : 'Nueva paleta'} onclose={cancelEdit} width={860}>
    <div class="editor">
      <div class="fields">
        <div class="two">
          <label class="field"><span>Nombre</span><input class="input" bind:value={editing.name} maxlength="40" /></label>
          <label class="field"><span>Tipo</span>
            <select class="input" bind:value={editing.mode}>
              <option value="dark">Oscura</option>
              <option value="light">Clara</option>
              <option value="mixed">Mixta</option>
            </select>
          </label>
        </div>
        <div class="colors">
          {#each COLOR_KEYS as { key, label }}
            <label class="color">
              <input type="color" value={editing.colors[key]} oninput={(e) => setColor(key, e.currentTarget.value)} />
              <span>{label}</span>
              <input class="input mono hex" class:bad={!isHex(hexDraft[key]?.startsWith('#') ? hexDraft[key] : '#' + hexDraft[key])}
                value={hexDraft[key]} oninput={(e) => setColor(key, e.currentTarget.value)} maxlength="7" spellcheck="false" />
            </label>
          {/each}
        </div>
      </div>
      <div class="side">
        <PalettePreview colors={editing.colors} big />
        <p class="muted small">Toda la aplicación se pinta en vivo con esta paleta mientras la editas.</p>
        {#each warnings as w}
          <p class="warn"><TriangleAlert size={14} /> {w}</p>
        {/each}
      </div>
    </div>
    {#snippet footer()}
      <button class="btn" onclick={cancelEdit}>Cancelar</button>
      <button class="btn primary" onclick={saveEdit}>Guardar y usar</button>
    {/snippet}
  </Modal>
{/if}

{#if importing}
  <Modal title="Importar paletas" onclose={() => (importing = false)} width={560}>
    <p class="muted">Pega el JSON exportado desde otro equipo (una paleta o una lista).</p>
    <textarea class="input mono" rows="10" bind:value={importText} placeholder={'[{ "name": "...", "colors": { "bg": "#111318", ... } }]'}></textarea>
    {#snippet footer()}
      <button class="btn" onclick={() => (importing = false)}>Cancelar</button>
      <button class="btn primary" onclick={doImport} disabled={!importText.trim()}>Importar</button>
    {/snippet}
  </Modal>
{/if}

{#if confirmDelete}
  {@const p = confirmDelete}
  <Modal title="Eliminar paleta" onclose={() => (confirmDelete = null)} width={420}>
    <p>¿Eliminar la paleta <strong>{p.name}</strong>?</p>
    {#snippet footer()}
      <button class="btn" onclick={() => (confirmDelete = null)}>Cancelar</button>
      <button class="btn solid-danger" onclick={() => remove(p)}>Eliminar</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .head { margin-bottom: 22px; }
  .head p { margin-top: 4px; }
  .sec-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .row { display: flex; gap: 8px; }
  .group { font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin: 18px 0 10px; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
  .pcard { border: 1px solid var(--border); border-radius: var(--radius); background: var(--panel); padding: 8px; display: flex; flex-direction: column; gap: 8px; transition: border-color .15s, box-shadow .15s; }
  .pcard:hover { border-color: var(--muted); }
  .pcard.active { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .pick { padding: 0; border: 0; background: none; cursor: pointer; display: block; border-radius: 8px; }
  .swatches { display: grid; grid-template-columns: repeat(10, 1fr); height: 12px; border-radius: 4px; overflow: hidden; }
  .pfoot { display: flex; align-items: center; gap: 8px; padding: 0 4px 2px; }
  .pname { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .pname strong { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pname span { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pact { display: flex; }
  .upd { display: flex; gap: 8px; align-items: center; font-size: 13.5px; flex-wrap: wrap; }
  .about { margin-top: 28px; display: flex; flex-direction: column; gap: 12px; }
  .secrets { margin-bottom: 28px; display: flex; flex-direction: column; gap: 14px; }
  .secrets .sec-head p { margin-top: 4px; }
  .opts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .opt { display: flex; gap: 10px; align-items: flex-start; padding: 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--panel-2); cursor: pointer; transition: border-color .15s; }
  .opt:hover { border-color: var(--muted); }
  .opt.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .opt.disabled { opacity: .6; cursor: not-allowed; }
  .opt input { accent-color: var(--accent); margin-top: 3px; }
  .opt > div { display: flex; flex-direction: column; gap: 6px; font-size: 13px; min-width: 0; }
  .opt strong { display: flex; align-items: center; gap: 6px; font-size: 13.5px; }
  .opt .badge { width: fit-content; }
  .vault-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
  .now { padding-top: 2px; }
  @media (max-width: 1100px) { .opts { grid-template-columns: 1fr; } }
  .kv { display: grid; grid-template-columns: 18px 160px 1fr; align-items: center; gap: 10px; font-size: 13.5px; }
  .kv :global(svg) { color: var(--muted); }
  .small { font-size: 12.5px; line-height: 1.6; }

  .editor { display: grid; grid-template-columns: 1fr 340px; gap: 22px; }
  .fields { display: flex; flex-direction: column; gap: 16px; }
  .two { display: grid; grid-template-columns: 1fr 140px; gap: 12px; }
  .colors { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; }
  .color { display: grid; grid-template-columns: 34px 1fr 96px; align-items: center; gap: 10px; font-size: 13px; }
  .color input[type='color'] { width: 34px; height: 34px; padding: 0; border: 1px solid var(--border); border-radius: 7px; background: none; cursor: pointer; }
  .color input[type='color']::-webkit-color-swatch-wrapper { padding: 3px; }
  .color input[type='color']::-webkit-color-swatch { border: 0; border-radius: 4px; }
  .hex { height: 32px; padding: 0 8px; text-transform: uppercase; }
  .hex.bad { border-color: var(--danger); }
  .side { display: flex; flex-direction: column; gap: 10px; }
  .warn { display: flex; gap: 7px; align-items: flex-start; font-size: 12.5px; color: var(--danger); }
  .warn :global(svg) { flex: none; margin-top: 2px; }
</style>
