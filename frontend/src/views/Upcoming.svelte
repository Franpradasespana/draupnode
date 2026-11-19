<script lang="ts">
  import { Boxes, FileCode, SquareTerminal } from '@lucide/svelte'
  import type { View } from '../lib/state.svelte'

  let { view }: { view: View } = $props()

  const info: Record<string, { icon: typeof Boxes; title: string; phase: string; text: string; items: string[] }> = {
    editor: {
      icon: FileCode, title: 'Editor de código', phase: 'Fase 3',
      text: 'El editor de VS Code (Monaco) integrado para crear y modificar módulos.',
      items: ['YAML de Ansible, docker-compose, .sh y plantillas', 'Coloreado y autocompletado', 'Validación antes de guardar'],
    },
    terminal: {
      icon: SquareTerminal, title: 'Terminal SSH', phase: 'Fase 3',
      text: 'Una consola real contra tus servidores, sin salir de la app.',
      items: ['Pestañas por servidor', 'Usa la misma clave y frase del llavero', 'Copiar y pegar, búsqueda en la salida'],
    },
  }
  const v = $derived(info[view])
</script>

{#if v}
  <div class="wrap">
    <div class="card box">
      <div class="ico"><v.icon size={30} strokeWidth={1.5} /></div>
      <span class="badge accent">{v.phase}</span>
      <h1>{v.title}</h1>
      <p class="muted">{v.text}</p>
      <ul>
        {#each v.items as it}<li>{it}</li>{/each}
      </ul>
    </div>
  </div>
{/if}

<style>
  .wrap { display: grid; place-items: start center; padding-top: 24px; }
  .box { max-width: 620px; width: 100%; display: flex; flex-direction: column; gap: 12px; padding: 30px 32px; }
  .ico { width: 56px; height: 56px; border-radius: 14px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
  .badge { width: fit-content; }
  ul { margin: 6px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; color: var(--text); }
  li::marker { color: var(--accent); }
</style>
