<script lang="ts">
  // Enlaces a la web oficial, el código y la documentación de un módulo.
  import { ExternalLink } from '@lucide/svelte'
  import { api } from '../lib/api'

  let { links = [] }: { links?: { label: string; url: string }[] } = $props()
  const host = (u: string) => { try { return new URL(u).host.replace(/^www\./, '') } catch { return u } }
</script>

{#if links.length}
  <div class="links">
    {#each links as l}
      <button class="btn sm" onclick={() => api.OpenURL(l.url)} title={l.url}><ExternalLink size={13} /> {l.label} <span class="muted">· {host(l.url)}</span></button>
    {/each}
  </div>
{/if}

<style>
  .links { display: flex; flex-wrap: wrap; gap: 6px; }
  .links .muted { font-size: 11.5px; }
</style>
