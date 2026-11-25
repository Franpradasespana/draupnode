<script lang="ts">
  // Terminal SSH integrada: una pestaña por sesión (puede haber varias del
  // mismo servidor). Se queda montada aunque cambies de pantalla, así las
  // sesiones siguen abiertas.
  import { onDestroy, tick } from 'svelte'
  import { Terminal } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import '@xterm/xterm/css/xterm.css'
  import { Plus, X, SquareTerminal, RotateCcw } from '@lucide/svelte'
  import { api, onEvent } from '../lib/api'
  import { ui, toast, contextServerId } from '../lib/state.svelte'
  import { withConnection } from '../lib/connect'
  import { t as tr } from '../lib/i18n.svelte'

  let { visible }: { visible: boolean } = $props()

  type Tab = { key: number; serverId: string; title: string; id: string; closed: boolean; reason: string; term?: Terminal; fit?: FitAddon; el?: HTMLDivElement }
  let tabs = $state<Tab[]>([])
  let active = $state(0)
  let pick = $state('')
  let next = 1

  const off = onEvent('term', (e: { id: string; data?: string; closed?: boolean; reason?: string }) => {
    const t = tabs.find((x) => x.id === e.id)
    if (!t?.term) return
    if (e.data) {
      const bin = atob(e.data)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      t.term.write(bytes)
    }
    if (e.closed) {
      t.closed = true
      t.reason = e.reason || tr('Sesión terminada.')
      t.term.write(`\\r
\\x1b[2m— ${t.reason} —\\x1b[0m\\r
`)
    }
  })
  onDestroy(() => {
    off()
    for (const t of tabs) {
      if (t.id && !t.closed) api.TerminalClose(t.id)
      t.term?.dispose()
    }
  })

  // Al pedir una terminal desde otra pantalla (ficha del servidor).
  $effect(() => {
    const sid = ui.termRequest
    if (sid) {
      ui.termRequest = null
      openTab(sid)
    }
  })
  $effect(() => {
    if (!pick) pick = contextServerId() ?? ui.servers[0]?.id ?? ''
  })
  // Al volver a la pantalla, recolocar.
  $effect(() => {
    if (visible) tick().then(fitActive)
  })

  const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()

  async function openTab(serverId: string, reuse?: Tab) {
    const srv = ui.servers.find((s) => s.id === serverId)
    if (!srv) return
    let t: Tab
    if (reuse) {
      t = reuse
      t.closed = false
      t.reason = ''
      t.term!.write('\r\n\x1b[2m' + tr('Reconectando…') + '\x1b[0m\r\n')
    } else {
      tabs.push({ key: next++, serverId, title: srv.name, id: '', closed: false, reason: '' })
      t = tabs[tabs.length - 1]
      active = t.key
      await tick()
      const term = new Terminal({
        fontFamily: '"JetBrains Mono", monospace', fontSize: 13, cursorBlink: true, scrollback: 5000,
        theme: { background: '#12110f', foreground: '#e8e4dc', cursor: css('--accent') || '#e8893a', selectionBackground: '#4a4438' },
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(t.el!)
      fit.fit()
      term.onData((d) => { if (t.id && !t.closed) api.TerminalInput(t.id, d) })
      term.onResize(({ cols, rows }) => { if (t.id && !t.closed) api.TerminalResize(t.id, cols, rows) })
      t.term = term
      t.fit = fit
      new ResizeObserver(() => { if (visible && active === t.key) fit.fit() }).observe(t.el!)
      term.write('\x1b[2m' + tr('Conectando con {0}@{1}…', srv.user, srv.host) + '\x1b[0m\r\n')
    }
    const r = await withConnection(srv, (s, a) => api.TerminalOpen(serverId, s, a, t.term!.cols, t.term!.rows))
    if (!r || r.status !== 'ok' || !r.id) {
      t.closed = true
      t.reason = r?.message || tr('No se pudo conectar.')
      t.term!.write(`\\x1b[31m${t.reason}\\x1b[0m\\r
`)
      if (r && r.status !== 'ok') toast(t.reason, 'error')
      return
    }
    t.id = r.id
    t.term!.focus()
  }

  function closeTab(t: Tab) {
    if (t.id && !t.closed) api.TerminalClose(t.id)
    t.term?.dispose()
    const i = tabs.indexOf(t)
    tabs.splice(i, 1)
    if (active === t.key) active = tabs[Math.max(0, i - 1)]?.key ?? 0
    tick().then(fitActive)
  }

  function fitActive() {
    const t = tabs.find((x) => x.key === active)
    if (t?.fit && visible) {
      t.fit.fit()
      t.term?.focus()
    }
  }
  function select(t: Tab) {
    active = t.key
    tick().then(fitActive)
  }
</script>

<div class="term-view" class:hidden={!visible}>
  <div class="head">
    <div>
      <h1>{tr('Terminal')}</h1>
      <p class="muted">{tr('Una consola SSH de tus servidores, aquí mismo. Cada pestaña es una sesión; siguen abiertas aunque cambies de pantalla.')}</p>
    </div>
    <div class="new">
      <select class="input" bind:value={pick} aria-label={tr('Servidor')}>
        {#each ui.servers as s}<option value={s.id}>{s.name} — {s.user}@{s.host}</option>{/each}
      </select>
      <button class="btn primary" onclick={() => openTab(pick)} disabled={!pick}><Plus size={15} /> {tr('Abrir terminal')}</button>
    </div>
  </div>

  {#if !tabs.length}
    <div class="card empty">
      <SquareTerminal size={34} strokeWidth={1.4} />
      <p class="muted">{ui.servers.length ? tr('Elige un servidor y pulsa «Abrir terminal».') : tr('Primero da de alta un servidor.')}</p>
    </div>
  {/if}

  {#if tabs.length}
    <div class="tabs" role="tablist">
      {#each tabs as t (t.key)}
        <div class="tab" class:on={active === t.key} class:dead={t.closed}>
          <button class="tname" role="tab" aria-selected={active === t.key} onclick={() => select(t)}><SquareTerminal size={13} /> {t.title}</button>
          <button class="tx" title={tr('Cerrar')} onclick={() => closeTab(t)}><X size={13} /></button>
        </div>
      {/each}
    </div>
  {/if}
  <div class="screens">
    {#each tabs as t (t.key)}
      <div class="screen" class:on={active === t.key}>
        <div class="xt" bind:this={t.el}></div>
        {#if t.closed}
          <div class="re"><button class="btn sm primary" onclick={() => openTab(t.serverId, t)}><RotateCcw size={14} /> {tr('Reconectar')}</button></div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .term-view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .term-view.hidden { display: none; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
  .head h1 { margin: 0 0 4px; }
  .new { display: flex; gap: 8px; }
  .new .input { min-width: 240px; }
  .empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 40px; }
  .tabs { display: flex; gap: 4px; flex-wrap: wrap; }
  .tab { display: flex; align-items: center; border: 1px solid var(--border); border-bottom: 0; border-radius: var(--radius-sm) var(--radius-sm) 0 0; background: var(--panel-2); }
  .tab.on { background: #12110f; border-color: #12110f; }
  .tab.on .tname { color: #e8e4dc; }
  .tab.dead .tname { opacity: .6; text-decoration: line-through; }
  .tname, .tx { background: none; border: 0; font: inherit; font-size: 13px; color: var(--muted); cursor: pointer; display: flex; gap: 6px; align-items: center; padding: 7px 10px; }
  .tx { padding: 7px 8px 7px 0; }
  .tx:hover { color: var(--danger); }
  .screens { flex: 1; min-height: 360px; position: relative; }
  .screen { display: none; position: absolute; inset: 0; background: #12110f; border-radius: 0 var(--radius-sm) var(--radius-sm) var(--radius-sm); padding: 8px; }
  .screen.on { display: block; }
  .xt { width: 100%; height: 100%; }
  .re { position: absolute; right: 16px; bottom: 16px; }
</style>
