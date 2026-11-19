<script lang="ts">
  import type { Snippet } from 'svelte'
  import { X } from '@lucide/svelte'

  let { title, onclose, width = 520, children, footer }: {
    title: string
    onclose: () => void
    width?: number
    children: Snippet
    footer?: Snippet
  } = $props()

  function onkey(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }
</script>

<svelte:window onkeydown={onkey} />

<div class="backdrop" role="presentation" onmousedown={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-label={title} style="width: min({width}px, calc(100vw - 32px))">
    <header>
      <h2>{title}</h2>
      <button class="btn icon ghost sm" onclick={onclose} aria-label="Cerrar"><X size={17} /></button>
    </header>
    <div class="body">{@render children()}</div>
    {#if footer}<footer>{@render footer()}</footer>{/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 40;
    background: rgba(0, 0, 0, 0.55);
    display: grid; place-items: center; padding: 16px;
    animation: fade .12s ease-out;
  }
  .modal {
    background: var(--panel); border: 1px solid var(--border); border-radius: 14px;
    box-shadow: var(--shadow); max-height: calc(100vh - 32px);
    display: flex; flex-direction: column;
    animation: pop .14s ease-out;
  }
  header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px 12px 22px; }
  .body { padding: 4px 22px 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
  footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 22px; border-top: 1px solid var(--border); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: translateY(6px) scale(.985); } }
</style>
