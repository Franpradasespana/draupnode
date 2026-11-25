<script lang="ts">
  import { untrack } from 'svelte'
  import { LockKeyhole, ShieldCheck, Eye, EyeOff, TriangleAlert } from '@lucide/svelte'
  import Modal from './Modal.svelte'
  import { api, errorText } from '../lib/api'
  import { t } from '../lib/i18n.svelte'

  let { mode, reason = '', done }: { mode: 'create' | 'unlock'; reason?: string; done: (ok: boolean) => void } = $props()

  const creating = untrack(() => mode === 'create')
  let master = $state('')
  let repeat = $state('')
  let show = $state(false)
  let busy = $state(false)
  let error = $state('')

  const checks = $derived([
    { ok: master.length >= 10, text: t('Al menos 10 caracteres') },
    { ok: /[a-zà-ÿñ]/.test(master) && /[A-ZÀ-ÝÑ]/.test(master), text: t('Mayúsculas y minúsculas') },
    { ok: /\d/.test(master) && /[^\p{L}\d]/u.test(master), text: t('Números y símbolos') },
  ])
  const canCreate = $derived(master.length >= 10 && master === repeat)

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    error = ''
    if (creating && !canCreate) return
    busy = true
    try {
      if (creating) await api.VaultCreate(master)
      else await api.VaultUnlock(master)
      master = repeat = ''
      done(true)
    } catch (err) {
      error = errorText(err)
    } finally {
      busy = false
    }
  }
</script>

<Modal title={creating ? t('Crear la bóveda cifrada') : t('Desbloquear la bóveda')} onclose={() => done(false)} width={520}>
  <form id="vault-form" class="stack" onsubmit={submit}>
    <div class="intro">
      {#if creating}<ShieldCheck size={22} />{:else}<LockKeyhole size={22} />{/if}
      <p>
        {#if reason}{reason}<br />{/if}
        {#if creating}
          {t('Las contraseñas se guardarán cifradas en tu equipo (Argon2id + XChaCha20-Poly1305). Elige una')}
          <strong>{t('contraseña maestra')}</strong>{t(': la pedirá una vez cada vez que abras Draupnode.')}
        {:else}
          {t('Escribe la contraseña maestra. La bóveda seguirá desbloqueada hasta que cierres la aplicación.')}
        {/if}
      </p>
    </div>

    <label class="field">
      <span>{t('Contraseña maestra')}</span>
      <div class="row">
        <!-- svelte-ignore a11y_autofocus -->
        <input class="input" type={show ? 'text' : 'password'} bind:value={master} autofocus autocomplete="off" />
        <button type="button" class="btn icon" onclick={() => (show = !show)} aria-label={t('Mostrar u ocultar')}>
          {#if show}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
        </button>
      </div>
    </label>

    {#if creating}
      <label class="field">
        <span>{t('Repítela')}</span>
        <input class="input" type={show ? 'text' : 'password'} bind:value={repeat} autocomplete="off" />
        {#if repeat && repeat !== master}<small class="err">{t('No coinciden.')}</small>{/if}
      </label>
      <ul class="checks">
        {#each checks as c}<li class:ok={c.ok}>{c.ok ? '✓' : '·'} {c.text}</li>{/each}
      </ul>
      <p class="warn"><TriangleAlert size={15} /> {t('Si la olvidas no hay forma de recuperarla: tendrías que volver a escribir las contraseñas de tus servidores.')}</p>
    {/if}

    {#if error}<p class="err">{error}</p>{/if}
  </form>

  {#snippet footer()}
    <button class="btn" type="button" onclick={() => done(false)}>{t('Cancelar')}</button>
    <button class="btn primary" type="submit" form="vault-form" disabled={busy || (creating ? !canCreate : !master)}>
      {busy ? t('Un momento…') : creating ? t('Crear bóveda') : t('Desbloquear')}
    </button>
  {/snippet}
</Modal>

<style>
  .stack { display: flex; flex-direction: column; gap: 14px; }
  .intro { display: flex; gap: 12px; align-items: flex-start; }
  .intro :global(svg) { flex: none; color: var(--accent); margin-top: 2px; }
  .row { display: flex; gap: 8px; }
  .checks { list-style: none; margin: 0; padding: 0; display: flex; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: var(--muted); }
  .checks li.ok { color: var(--success); }
  .warn { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; color: var(--muted); }
  .warn :global(svg) { flex: none; color: var(--accent); margin-top: 2px; }
  .err { color: var(--danger); font-size: 13px; }
</style>
