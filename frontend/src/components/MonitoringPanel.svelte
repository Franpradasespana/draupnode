<script lang="ts">
  // Monitorización del servidor: abrir Grafana (por túnel SSH) y un resumen
  // rápido sacado de Prometheus, que se refresca solo mientras se ve.
  import { onDestroy } from 'svelte'
  import { Activity, ExternalLink, RefreshCw, LoaderCircle, Cpu, MemoryStick, HardDrive, Container, Clock } from '@lucide/svelte'
  import { api, type MonitorStats, type Project } from '../lib/api'
  import { toast, ui } from '../lib/state.svelte'
  import { withConnection } from '../lib/connect'

  let { project, dashboard = 'recursos' }: { project: Project; dashboard?: string } = $props()

  const server = $derived(ui.servers.find((s) => s.id === project.serverId))
  let stats = $state<MonitorStats | null>(null)
  let busy = $state<'' | 'grafana' | 'stats'>('')
  let timer: ReturnType<typeof setInterval> | undefined
  onDestroy(() => clearInterval(timer))

  async function openGrafana() {
    busy = 'grafana'
    try {
      const r = await withConnection(server, (s, a) => api.OpenGrafana(project.id, s, a))
      if (!r) return
      if (r.status !== 'ok' || !r.url) return toast(r.message || 'No se pudo abrir Grafana', 'error')
      await api.OpenURL(r.url + (dashboard ? `d/${dashboard}` : ''))
      toast('Grafana abierta en el navegador. Usuario admin; la contraseña está en «Contraseñas» de este módulo.')
    } finally {
      busy = ''
    }
  }

  async function refresh(quiet = false) {
    if (!quiet) busy = 'stats'
    try {
      const r = await withConnection(server, (s, a) => api.MonitorSummary(project.id, s, a))
      if (!r) return
      if (r.status !== 'ok') {
        if (!quiet) toast(r.message || 'No se pudo leer el estado', 'error')
        return
      }
      stats = r.stats ?? null
      // Una vez conectado, se refresca solo cada 30 s (el túnel se reutiliza).
      if (!timer) timer = setInterval(() => refresh(true), 30_000)
    } finally {
      if (!quiet) busy = ''
    }
  }

  function bytes(n: number): string {
    const u = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = 0
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
    return `${n.toFixed(i > 2 ? 1 : 0)} ${u[i]}`
  }
  function dur(s: number): string {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
    return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`
  }
  const level = (pct: number) => (pct >= 90 ? 'bad' : pct >= 75 ? 'warn' : 'ok')
  const JOBS: Record<string, string> = { prometheus: 'Prometheus', node: 'Servidor', cadvisor: 'Contenedores', postgres: 'PostgreSQL' }
</script>

<section class="card mon">
  <div class="head">
    <Activity size={18} />
    <div class="txt">
      <strong>Estado de {server?.name ?? 'el servidor'}</strong>
      <span class="muted">Grafana y Prometheus solo escuchan en el servidor; Draupnode llega a ellos por SSH.</span>
    </div>
    <div class="btns">
      <button class="btn sm" onclick={() => refresh()} disabled={!!busy}>
        {#if busy === 'stats'}<LoaderCircle size={14} class="spin" />{:else}<RefreshCw size={14} />{/if} {stats ? 'Actualizar' : 'Ver estado'}
      </button>
      <button class="btn sm primary" onclick={openGrafana} disabled={!!busy}>
        {#if busy === 'grafana'}<LoaderCircle size={14} class="spin" />{:else}<ExternalLink size={14} />{/if} Abrir Grafana
      </button>
    </div>
  </div>

  {#if stats}
    <div class="tiles">
      <div class="tile {level(stats.cpu)}"><Cpu size={16} /><span class="v">{stats.cpu.toFixed(0)} %</span><span class="l">CPU · {stats.cpus} núcleos · carga {stats.load.toFixed(2)}</span><i style:width={`${Math.min(100, stats.cpu)}%`}></i></div>
      <div class="tile {level(stats.ram)}"><MemoryStick size={16} /><span class="v">{stats.ram.toFixed(0)} %</span><span class="l">RAM de {bytes(stats.ramTotal)}</span><i style:width={`${Math.min(100, stats.ram)}%`}></i></div>
      {#if stats.disk >= 0}
        <div class="tile {level(stats.disk)}"><HardDrive size={16} /><span class="v">{stats.disk.toFixed(0)} %</span><span class="l">Disco · {bytes(stats.diskFree)} libres</span><i style:width={`${Math.min(100, stats.disk)}%`}></i></div>
      {:else}
        <div class="tile"><HardDrive size={16} /><span class="v">—</span><span class="l">Disco: sin datos de «/»</span></div>
      {/if}
      <div class="tile"><Container size={16} /><span class="v">{stats.containers >= 0 ? stats.containers : '—'}</span><span class="l">{stats.containers >= 0 ? 'contenedores en marcha' : 'sin cAdvisor'}</span></div>
      <div class="tile"><Clock size={16} /><span class="v">{dur(stats.uptime)}</span><span class="l">encendido</span></div>
    </div>
    <div class="targets">
      {#each stats.targets as t}
        <span class="tg" class:down={!t.up}><span class="dot"></span>{JOBS[t.job] ?? t.job}{t.up ? '' : ' · no responde'}</span>
      {/each}
      <span class="muted small">· actualizado {new Date(stats.at).toLocaleTimeString('es-ES')}</span>
    </div>
  {/if}
</section>

<style>
  .mon { padding: 12px 16px; margin: 14px 0; display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .head > :global(svg) { color: var(--accent); flex: none; }
  .txt { display: flex; flex-direction: column; gap: 2px; font-size: 13px; min-width: 0; flex: 1; }
  .btns { display: flex; gap: 8px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
  .tile { position: relative; overflow: hidden; display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; align-items: center; padding: 10px 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--panel-2); }
  .tile :global(svg) { color: var(--muted); grid-row: 1 / 3; }
  .v { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .l { font-size: 11.5px; color: var(--muted); }
  .tile i { position: absolute; left: 0; bottom: 0; height: 4px; background: var(--success); }
  .tile.warn i { background: var(--warning); }
  .tile.bad i { background: var(--danger); }
  .tile.bad .v { color: var(--danger); }
  .targets { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 12.5px; }
  .tg { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: var(--success-soft); color: var(--success); }
  .tg.down { background: var(--danger-soft); color: var(--danger); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .small { font-size: 12px; }
</style>
