<script lang="ts">
  // Minigráfica para una fila de tabla (uso de una app en 24 h). Al pasar el
  // ratón dice la hora y el valor.
  let { values, times, top, format, label }: { values: number[]; times: number[]; top: number; format: (v: number) => string; label: string } = $props()
  const W = 120, H = 26
  let hover = $state<number | null>(null)
  let el = $state<SVGSVGElement>()
  const y = (v: number) => 2 + (H - 4) * (1 - Math.min(v / (top || 1), 1))
  const x = (i: number) => (values.length > 1 ? (i / (values.length - 1)) * W : 0)
  const d = $derived(values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(''))
  function move(e: PointerEvent) {
    if (!el || values.length < 2) return
    const r = el.getBoundingClientRect()
    hover = Math.max(0, Math.min(values.length - 1, Math.round(((e.clientX - r.left) / r.width) * (values.length - 1))))
  }
  const hm = (t: number) => new Date(t * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
</script>

{#if values.length > 1}
  <span class="sp">
    <svg bind:this={el} viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label={label} onpointermove={move} onpointerleave={() => (hover = null)}>
      <path class="a" d="{d}L{W},{H}L0,{H}Z" />
      <path class="l" d={d} />
      {#if hover !== null}<circle cx={x(hover)} cy={y(values[hover])} r="2.6" />{/if}
    </svg>
    {#if hover !== null}<span class="tip">{hm(times[hover])} · <strong>{format(values[hover])}</strong></span>{/if}
  </span>
{:else}
  <span class="muted small">—</span>
{/if}

<style>
  .sp { position: relative; display: inline-block; width: 120px; height: 26px; vertical-align: middle; }
  svg { display: block; width: 100%; height: 100%; overflow: visible; cursor: crosshair; }
  .a { fill: var(--accent); opacity: 0.12; }
  .l { fill: none; stroke: var(--accent); stroke-width: 1.6; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  circle { fill: var(--accent); stroke: var(--panel); stroke-width: 1.5; }
  .tip { position: absolute; bottom: calc(100% + 4px); right: 0; padding: 3px 7px; border-radius: var(--radius-sm); background: var(--panel); border: 1px solid var(--border); box-shadow: var(--shadow); font-size: 11.5px; white-space: nowrap; pointer-events: none; z-index: 2; font-variant-numeric: tabular-nums; }
</style>
