<script lang="ts">
  // Gráfica de una sola medida a lo largo del tiempo (CPU, memoria o disco):
  // línea con relleno suave, rejilla discreta y, al pasar el ratón, una guía
  // vertical con la hora y el valor. Con «max» (vista de 30 días) dibuja
  // además la banda hasta el máximo de cada hora, más clara.
  let {
    title,
    points,
    top = 100,
    format,
    max,
    now = '',
    long = false,
  }: {
    title: string
    /** [t (segundos), valor] */
    points: [number, number][]
    /** Valor de arriba del eje (100 para %). */
    top?: number
    format: (v: number) => string
    /** Máximo de cada punto (misma longitud que points). */
    max?: number[]
    /** Texto grande a la derecha del título (el valor actual). */
    now?: string
    /** Fechas en el eje en vez de horas. */
    long?: boolean
  } = $props()

  const W = 600, H = 120, PAD = 4
  let hover = $state<number | null>(null)
  let box = $state<HTMLDivElement>()

  const t0 = $derived(points[0]?.[0] ?? 0)
  const t1 = $derived(points[points.length - 1]?.[0] ?? 1)
  const x = (t: number) => (t1 > t0 ? ((t - t0) / (t1 - t0)) * W : W / 2)
  const y = (v: number) => PAD + (H - 2 * PAD) * (1 - Math.min(Math.max(v / (top || 1), 0), 1))
  // Un hueco de más de 3 pasos (servidor apagado) corta la línea.
  const segments = $derived.by(() => {
    if (points.length < 2) return [] as [number, number][][]
    const step = Math.min(...points.slice(1, 50).map((p, i) => p[0] - points[i][0]).filter((d) => d > 0))
    const out: [number, number][][] = [[]]
    points.forEach((p, i) => {
      if (i && p[0] - points[i - 1][0] > step * 3.5) out.push([])
      out[out.length - 1].push(p)
    })
    return out.filter((s) => s.length > 1)
  })
  const line = (seg: [number, number][]) => seg.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('')
  const area = (seg: [number, number][]) => `${line(seg)}L${x(seg[seg.length - 1][0]).toFixed(1)},${H - PAD}L${x(seg[0][0]).toFixed(1)},${H - PAD}Z`
  const band = $derived.by(() => {
    if (!max || max.length !== points.length || points.length < 2) return ''
    const up = points.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(max[i]).toFixed(1)}`).join('')
    const down = [...points].reverse().map((p) => `L${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('')
    return up + down + 'Z'
  })

  const fmtTime = (t: number, withDay = long) => {
    const d = new Date(t * 1000)
    const hm = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    return withDay ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + (long ? '' : ' ' + hm) : hm
  }
  const ticks = $derived(points.length > 1 ? [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + (t1 - t0) * f) : [])

  function move(e: PointerEvent) {
    if (!box || !points.length) return
    const r = box.getBoundingClientRect()
    const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0)
    let best = 0
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i][0] - t) < Math.abs(points[best][0] - t)) best = i
    hover = best
  }
  const hp = $derived(hover !== null ? points[hover] : null)
  const hx = $derived(hp ? (x(hp[0]) / W) * 100 : 0)
</script>

<div class="hc">
  <div class="hc-h"><span class="muted small">{title}</span>{#if now}<strong>{now}</strong>{/if}</div>
  {#if points.length < 2}
    <div class="empty muted small">Aún no hay bastantes muestras (una cada 5 minutos).</div>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="plot" bind:this={box} onpointermove={move} onpointerleave={() => (hover = null)}>
      <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="{title}: de {format(Math.min(...points.map((p) => p[1])))} a {format(Math.max(...points.map((p) => p[1])))}">
        {#each [0.5, 1] as g}<line class="grid" x1="0" x2={W} y1={y(top * g)} y2={y(top * g)} />{/each}
        <line class="base" x1="0" x2={W} y1={H - PAD} y2={H - PAD} />
        {#if band}<path class="band" d={band} />{/if}
        {#each segments as seg}<path class="area" d={area(seg)} /><path class="ln" d={line(seg)} />{/each}
        {#if hp}<line class="cross" x1={x(hp[0])} x2={x(hp[0])} y1="0" y2={H} />{/if}
      </svg>
      <span class="ylab top">{format(top)}</span>
      {#if hp}
        <span class="dot" style:left="{hx}%" style:top="{(y(hp[1]) / H) * 100}%"></span>
        <div class="tip" class:left={hx > 60} style:left="{hx}%">
          <span class="muted">{fmtTime(hp[0], true)}</span>
          <strong>{format(hp[1])}</strong>{#if max && hover !== null}<span class="muted">máx. {format(max[hover])}</span>{/if}
        </div>
      {/if}
    </div>
    <div class="xlab muted">{#each ticks as t}<span>{fmtTime(t)}</span>{/each}</div>
  {/if}
</div>

<style>
  .hc { min-width: 0; }
  .hc-h { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .hc-h strong { font-variant-numeric: tabular-nums; }
  .plot { position: relative; height: 120px; cursor: crosshair; touch-action: none; }
  svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .grid { stroke: var(--border-soft); stroke-width: 1; stroke-dasharray: 3 4; vector-effect: non-scaling-stroke; }
  .base { stroke: var(--border); stroke-width: 1; vector-effect: non-scaling-stroke; }
  .area { fill: var(--accent); opacity: 0.12; }
  .band { fill: var(--accent); opacity: 0.16; }
  .ln { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
  .cross { stroke: var(--muted); stroke-width: 1; vector-effect: non-scaling-stroke; }
  .dot { position: absolute; width: 9px; height: 9px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 2px var(--panel); transform: translate(-50%, -50%); pointer-events: none; }
  .ylab { position: absolute; left: 0; font-size: 10.5px; color: var(--muted); pointer-events: none; }
  .ylab.top { top: -2px; }
  .tip { position: absolute; top: 4px; transform: translateX(10px); display: flex; flex-direction: column; gap: 1px; padding: 5px 8px; border-radius: var(--radius-sm); background: var(--panel); border: 1px solid var(--border); box-shadow: var(--shadow); font-size: 12px; white-space: nowrap; pointer-events: none; z-index: 2; font-variant-numeric: tabular-nums; }
  .tip.left { transform: translateX(calc(-100% - 10px)); }
  .xlab { display: flex; justify-content: space-between; font-size: 10.5px; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .empty { height: 120px; display: grid; place-items: center; border: 1px dashed var(--border-soft); border-radius: var(--radius-sm); }
</style>
