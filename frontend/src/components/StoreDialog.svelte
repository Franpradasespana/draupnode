<script lang="ts">
  import { untrack } from 'svelte'
  import Modal from './Modal.svelte'
  import StorePicker from './StorePicker.svelte'
  import KeyringHelp from './KeyringHelp.svelte'

  let { initial, done }: { initial: 'keyring' | 'vault'; done: (v: 'keyring' | 'vault' | null) => void } = $props()
  let value = $state<'keyring' | 'vault'>(untrack(() => initial))
</script>

<Modal title="¿Dónde guardar la contraseña?" onclose={() => done(null)} width={620}>
  <p class="muted">Elige dónde se guarda cifrada. Puedes cambiarlo más adelante editando el servidor.</p>
  <StorePicker bind:value />
  <KeyringHelp />
  {#snippet footer()}
    <button class="btn" onclick={() => done(null)}>Cancelar</button>
    <button class="btn primary" onclick={() => done(value)}>Guardar aquí</button>
  {/snippet}
</Modal>
