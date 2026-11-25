<script lang="ts">
  // Texto con las direcciones http(s) convertidas en enlaces que se abren en el navegador.
  import { api } from '../lib/api'
  import { t } from '../lib/i18n.svelte'

  let { text }: { text: string } = $props()

  // La puntuación final (cierre de paréntesis, punto, coma…) no forma parte del enlace.
  const URL_RE = /https?:\/\/[^\s<>"'`]+?(?=[).,;:!?»]*(?:\s|$))/g

  const parts = $derived.by(() => {
    const out: { t: string; url?: boolean }[] = []
    let last = 0
    for (const m of text.matchAll(URL_RE)) {
      if (m.index! > last) out.push({ t: text.slice(last, m.index) })
      out.push({ t: m[0], url: true })
      last = m.index! + m[0].length
    }
    if (last < text.length) out.push({ t: text.slice(last) })
    return out
  })
</script>

{#each parts as p}{#if p.url}<a href={p.t} onclick={(e) => { e.preventDefault(); api.OpenURL(p.t) }} title={t('Abrir en el navegador')}>{p.t}</a>{:else}{p.t}{/if}{/each}

<style>
  a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
  a:hover { text-decoration-thickness: 2px; }
</style>
