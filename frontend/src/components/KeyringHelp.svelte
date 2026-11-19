<script lang="ts">
  // Qué instalar para tener llavero del sistema (cuando no lo hay).
  import { Copy, Lightbulb } from '@lucide/svelte'
  import { ui, toast } from '../lib/state.svelte'

  const list = $derived(ui.secrets?.keyring.suggestions ?? [])

  async function copy(cmd: string) {
    try {
      await navigator.clipboard.writeText(cmd)
      toast('Comando copiado')
    } catch {
      toast('No se pudo copiar', 'error')
    }
  }
</script>

{#if list.length}
  <div class="help">
    <p class="head"><Lightbulb size={15} /> Este equipo no tiene llavero del sistema. Puedes usar la bóveda de Draupnode o instalar uno de estos:</p>
    <ul>
      {#each list as s}
        <li>
          <strong>{s.name}</strong>
          <span class="muted">{s.description}</span>
          {#if s.command}
            <div class="cmd">
              <code class="selectable">{s.command}</code>
              <button type="button" class="btn icon sm ghost" title="Copiar" aria-label="Copiar comando" onclick={() => copy(s.command!)}><Copy size={14} /></button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="muted foot">Después de instalarlo, cierra y vuelve a abrir Draupnode.</p>
  </div>
{/if}

<style>
  .help { border: 1px dashed var(--border); border-radius: var(--radius-sm); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; font-size: 12.5px; }
  .head { display: flex; gap: 8px; align-items: flex-start; color: var(--text); }
  .head :global(svg) { flex: none; color: var(--accent); margin-top: 1px; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  li { display: flex; flex-direction: column; gap: 3px; }
  strong { font-size: 13px; }
  .cmd { display: flex; align-items: center; gap: 6px; background: var(--panel-2); border: 1px solid var(--border-soft); border-radius: 6px; padding: 4px 4px 4px 10px; margin-top: 2px; }
  .cmd code { flex: 1; overflow-x: auto; white-space: nowrap; }
  .foot { font-size: 12px; }
</style>
