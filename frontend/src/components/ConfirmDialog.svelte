<script lang="ts">
  import Modal from './Modal.svelte'
  import { t } from '../lib/i18n.svelte'
  let { title, message, detail, confirmLabel, danger, done }: { title: string; message: string; detail?: string; confirmLabel: string; danger?: boolean; done: (ok: boolean) => void } = $props()
</script>

<Modal {title} onclose={() => done(false)} width={540}>
  <p>{message}</p>
  {#if detail}<pre class="detail selectable">{detail}</pre>{/if}
  {#snippet footer()}
    <button class="btn" onclick={() => done(false)}>{t('Cancelar')}</button>
    <button class="btn" class:primary={!danger} class:solid-danger={danger} onclick={() => done(true)}>{confirmLabel}</button>
  {/snippet}
</Modal>

<style>
  .detail { margin: 0; padding: 12px 14px; background: var(--panel-2); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); font-family: var(--mono); font-size: 12.5px; white-space: pre-wrap; word-break: break-all; }
</style>
