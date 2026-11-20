<script lang="ts">
  // Dato secreto que escribe el usuario (un token, una clave): va directo a la
  // bóveda del proyecto, nunca al proyecto ni al instalar.sh exportado.
  import { KeyRound, Trash2 } from '@lucide/svelte'
  import { api, errorText, type ModVariable } from '../lib/api'
  import { toast, withVault } from '../lib/state.svelte'

  let { v, projectId, error, onchange, bare = false }: { v: ModVariable; projectId: string; error?: string; onchange?: () => void; bare?: boolean } = $props()

  let saved = $state(false)
  let editing = $state(false)
  let text = $state('')
  let busy = $state(false)

  async function refresh() {
    if (!projectId) return
    try {
      saved = (await api.ProjectSecretsInfo(projectId)).typed.includes(v.name)
    } catch { /* sin bóveda todavía */ }
  }
  $effect(() => {
    void projectId
    refresh()
  })

  async function store(value: string) {
    busy = true
    try {
      await withVault(() => api.SetProjectSecret(projectId, v.name, value), 'Los datos secretos del proyecto se guardan cifrados en la bóveda.')
      text = ''
      editing = false
      await refresh()
      onchange?.()
      toast(value ? `«${v.label}» guardado en la bóveda` : `«${v.label}» borrado de la bóveda`)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      busy = false
    }
  }
</script>

<div class="vf" class:bad={!!error}>
  <label class="field">
    {#if !bare}<span>{v.label}{#if v.required} *{/if}</span>{/if}
    {#if saved && !editing}
      <div class="row">
        <span class="ok"><KeyRound size={14} /> Guardado en la bóveda</span>
        <button class="btn sm ghost" onclick={() => (editing = true)} disabled={busy}>Cambiar</button>
        <button class="btn sm ghost" onclick={() => store('')} disabled={busy} title="Borrar de la bóveda"><Trash2 size={13} /></button>
      </div>
    {:else}
      <div class="row">
        <input class="input mono" type="password" bind:value={text} placeholder={v.placeholder ?? 'Escríbelo aquí'} autocomplete="off" spellcheck="false"
          onkeydown={(e) => e.key === 'Enter' && text && store(text)} />
        <button class="btn sm" onclick={() => store(text)} disabled={busy || !text || !projectId}>Guardar</button>
        {#if editing}<button class="btn sm ghost" onclick={() => { editing = false; text = '' }}>Cancelar</button>{/if}
      </div>
    {/if}
  </label>
  {#if !bare}{#if error && !saved}<small class="err">{error}</small>{:else if v.help}<small class="muted">{v.help}</small>{/if}{/if}
</div>

<style>
  .vf { display: flex; flex-direction: column; gap: 5px; }
  .vf small { font-size: 12px; }
  .bad :global(.input) { border-color: var(--danger); }
  .err { color: var(--danger); }
  .row { display: flex; gap: 6px; align-items: center; }
  .row .input { flex: 1; min-width: 0; }
  .ok { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: var(--success); flex: 1; }
</style>
