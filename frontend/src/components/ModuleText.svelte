<script lang="ts">
  // Texto largo de un módulo (details de module.yaml) en párrafos: une las
  // líneas que el fichero corta a mano, empieza párrafo nuevo tras una línea
  // en blanco o al acabar una frase al final de la línea, y deja como líneas
  // sueltas (en monoespaciada) las que van sangradas, que son ejemplos.
  let { text }: { text: string } = $props()

  type Block = { kind: 'p' | 'ex'; lines: string[] }
  const blocks = $derived.by(() => {
    const out: Block[] = []
    let cur: Block | null = null
    const lines = text.replace(/\r/g, '').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]
      const line = raw.trim()
      if (!line) { cur = null; continue }
      const indented = /^\s{2,}/.test(raw)
      const kind = indented ? 'ex' : 'p'
      const prev = cur?.lines[cur.lines.length - 1] ?? ''
      const newSentence = kind === 'p' && cur?.kind === 'p' && /[.:!?)»]$/.test(prev) && /^[A-ZÁÉÍÓÚÑ«¿¡0-9]/.test(line)
      if (!cur || cur.kind !== kind || newSentence) {
        cur = { kind, lines: [] }
        out.push(cur)
      }
      cur.lines.push(line)
    }
    return out
  })
</script>

<div class="mt">
  {#each blocks as b}
    {#if b.kind === 'p'}<p>{b.lines.join(' ')}</p>
    {:else}<div class="ex">{#each b.lines as l}<code>{l}</code>{/each}</div>{/if}
  {/each}
</div>

<style>
  .mt { display: flex; flex-direction: column; gap: 10px; width: 100%; font-size: 13.5px; line-height: 1.6; }
  .mt p { margin: 0; }
  .ex { display: flex; flex-direction: column; gap: 2px; padding: 8px 12px; background: var(--panel-2); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); }
  .ex code { font-family: var(--mono); font-size: 12.5px; white-space: pre-wrap; }
</style>
