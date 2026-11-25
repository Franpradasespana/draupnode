<script lang="ts">
  // «Dónde guardarla»: llavero del sistema o bóveda cifrada de Draupnode.
  import { KeyRound, LockKeyhole } from '@lucide/svelte'
  import { ui } from '../lib/state.svelte'
  import { t } from '../lib/i18n.svelte'

  let { value = $bindable() }: { value: 'keyring' | 'vault' } = $props()

  const sx = $derived(ui.secrets)
  const vaultState = $derived(
    !sx?.vault.exists ? t('Se creará ahora con una contraseña maestra') : sx.vault.unlocked ? t('Desbloqueada') : t('Bloqueada: se pedirá la contraseña maestra'),
  )
</script>

<div class="picker" role="radiogroup" aria-label={t('Dónde guardar la contraseña')}>
  <label class="opt" class:on={value === 'keyring'} class:disabled={!sx?.keyring.available}>
    <input type="radio" bind:group={value} value="keyring" disabled={!sx?.keyring.available} />
    <KeyRound size={16} />
    <div>
      <strong>{t('Llavero del sistema')}</strong>
      <span>{sx?.keyring.name ?? '…'}</span>
      <em class:bad={!sx?.keyring.available}>
        {sx?.keyring.available ? t('Detectado · se abre con tu sesión') : t('No disponible en este equipo')}
      </em>
    </div>
  </label>
  <label class="opt" class:on={value === 'vault'}>
    <input type="radio" bind:group={value} value="vault" />
    <LockKeyhole size={16} />
    <div>
      <strong>{t('Bóveda cifrada de Draupnode')}</strong>
      <span>{t('Argon2id + XChaCha20-Poly1305 (256 bits)')}</span>
      <em>{vaultState}</em>
    </div>
  </label>
</div>

<style>
  .picker { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .opt {
    display: flex; gap: 10px; align-items: flex-start; padding: 11px 12px;
    border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--panel-2);
    cursor: pointer; transition: border-color .15s, box-shadow .15s;
  }
  .opt:hover { border-color: var(--muted); }
  .opt.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .opt.disabled { opacity: .55; cursor: not-allowed; }
  .opt input { accent-color: var(--accent); margin: 2px 0 0; }
  .opt > :global(svg) { flex: none; color: var(--accent); margin-top: 1px; }
  .opt div { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 12.5px; }
  .opt strong { font-size: 13px; font-weight: 600; }
  .opt span { color: var(--muted); }
  .opt em { font-style: normal; color: var(--success); font-size: 12px; }
  .opt em.bad { color: var(--danger); }
  @media (max-width: 700px) { .picker { grid-template-columns: 1fr; } }
</style>
