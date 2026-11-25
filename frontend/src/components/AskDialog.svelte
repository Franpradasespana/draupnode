<script lang="ts">
  import Modal from './Modal.svelte'
  import { t } from '../lib/i18n.svelte'
  let { title, message, label, password, done }: { title: string; message: string; label: string; password: boolean; done: (v: string | null) => void } = $props()
  let value = $state('')
</script>

<Modal {title} onclose={() => done(null)} width={480}>
  <form id="ask-form" class="stack" onsubmit={(e) => { e.preventDefault(); if (value) done(value) }}>
    <p>{message}</p>
    <label class="field">
      <span>{label}</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="input" type={password ? 'password' : 'text'} bind:value autofocus autocomplete="off" />
    </label>
  </form>
  {#snippet footer()}
    <button class="btn" onclick={() => done(null)}>{t('Cancelar')}</button>
    <button class="btn primary" type="submit" form="ask-form" disabled={!value}>{t('Continuar')}</button>
  {/snippet}
</Modal>

<style>
  .stack { display: flex; flex-direction: column; gap: 14px; }
</style>
