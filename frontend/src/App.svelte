<script lang="ts">
  import { onMount } from 'svelte'
  import { LayoutDashboard, Server, Boxes, FolderGit2, Container, SquareTerminal, Settings, CircleCheck, FlaskConical, CircleAlert, CircleHelp, Menu, X, Bell, ChevronRight } from '@lucide/svelte'
  import Logo from './components/Logo.svelte'
  import Dashboard from './views/Dashboard.svelte'
  import Servers from './views/Servers.svelte'
  import SettingsView from './views/Settings.svelte'
  import Upcoming from './views/Upcoming.svelte'
  import VaultDialog from './components/VaultDialog.svelte'
  import StoreDialog from './components/StoreDialog.svelte'
  import AskDialog from './components/AskDialog.svelte'
  import ConfirmDialog from './components/ConfirmDialog.svelte'
  import Catalog from './views/Catalog.svelte'
  import Projects from './views/Projects.svelte'
  import Lab from './views/Lab.svelte'
  import Dockerize from './views/Dockerize.svelte'
  import StatusBar from './components/StatusBar.svelte'
  import HelpDialog from './components/HelpDialog.svelte'
  import Alerts from './views/Alerts.svelte'
  import TerminalView from './views/Terminal.svelte'
  import { alertItems, loadAlerts } from './lib/alerts.svelte'
  import { ui, boot, toast, openServer, openRecipe, type View } from './lib/state.svelte'
  import { errorText, isDesktop } from './lib/api'

  type NavItem = { id: View; label: string; icon: typeof Server; soon?: boolean }
  // Servidores y Proyectos se despliegan en el menú para entrar directo a cada uno.
  // Lo desplegado se recuerda en este equipo.
  let expanded = $state<Record<string, boolean>>(loadExpanded())
  function loadExpanded(): Record<string, boolean> {
    try {
      return JSON.parse(localStorage.getItem('dn-menu') ?? '') ?? {}
    } catch {
      return { servers: true, projects: true }
    }
  }
  function toggle(id: string) {
    expanded[id] = !isOpen(id)
    try { localStorage.setItem('dn-menu', JSON.stringify(expanded)) } catch { /* sin almacenamiento */ }
  }
  const isOpen = (id: string) => expanded[id] ?? true
  const children = (id: View) =>
    id === 'servers' ? ui.servers.map((s) => ({ id: s.id, label: s.name, active: ui.view === 'servers' && ui.serverId === s.id, open: () => { openServer(s.id); menuOpen = false } }))
    : id === 'projects' ? ui.recipes.map((r) => ({ id: r.id, label: r.name, active: ui.view === 'projects' && ui.recipeId === r.id, open: () => { openRecipe(r.id); menuOpen = false } }))
    : []
  // Lo principal arriba; las herramientas en «Utilidades»; el Catálogo
  // (lo que se puede instalar) abajo, junto a la Ayuda.
  const nav: NavItem[] = [
    { id: 'dashboard', label: 'Panel', icon: LayoutDashboard },
    { id: 'servers', label: 'Servidores', icon: Server },
    { id: 'projects', label: 'Plantillas', icon: FolderGit2 },
  ]
  const tools: NavItem[] = [
    { id: 'docker', label: 'Docker Creator', icon: Container },
    { id: 'lab', label: 'Servidor de pruebas', icon: FlaskConical },
    { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
  ]

  const titles: Record<View, string> = {
    dashboard: 'Panel', servers: 'Servidores', catalog: 'Catálogo', projects: 'Plantillas',
    docker: 'Docker Creator', terminal: 'Terminal', settings: 'Ajustes', lab: 'Servidor de pruebas', alerts: 'Avisos',
  }

  let ready = $state(false)
  // Menú lateral plegado en pantallas estrechas (botón hamburguesa).
  let menuOpen = $state(false)
  function go(v: View) {
    ui.view = v
    if (v === 'projects') ui.recipeId = null
    if (v === 'servers') { ui.serverId = null; ui.projectId = null }
    menuOpen = false
  }
  onMount(async () => {
    // En la demo del navegador, #servers, #settings… abren esa pantalla.
    const h = location.hash.slice(1) as View
    if (!isDesktop && h in titles) ui.view = h
    if (!isDesktop && location.search.includes('ayuda')) ui.help = ui.view
    try {
      await boot()
    } catch (e) {
      toast('No se pudo cargar la configuración: ' + errorText(e), 'error')
    }
    ready = true
    loadAlerts()
  })
  const alertCount = $derived(alertItems().length)
  // La terminal se monta la primera vez que se abre y ya no se desmonta.
  let termSeen = $state(false)
  $effect(() => { if (ui.view === 'terminal') termSeen = true })
</script>

<div class="shell">
  <header class="topbar">
    <button class="burger" onclick={() => (menuOpen = !menuOpen)} aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen}>
      {#if menuOpen}<X size={20} />{:else}<Menu size={20} />{/if}
    </button>
    <div class="brand">
      <Logo size={28} />
      <span>DRAUPNODE</span>
    </div>
    <div class="crumb">{titles[ui.view]}</div>
    <div class="top-right">
      {#if !isDesktop}<span class="badge accent" title="Abierto en el navegador: datos simulados">Demo navegador</span>{/if}
      {#if alertCount && ui.view !== 'alerts'}
        <button class="btn ghost sm bell" onclick={() => go('alerts')} title="{alertCount} aviso{alertCount > 1 ? 's' : ''}">
          <Bell size={15} /> <span class="count">{alertCount}</span>
        </button>
      {/if}
      <button class="btn ghost sm" class:active={ui.view === 'settings'} onclick={() => go('settings')} title="Ajustes">
        <Settings size={15} /> <span class="lbl">Ajustes</span>
      </button>
    </div>
  </header>

  {#if menuOpen}<div class="scrim" role="presentation" onclick={() => (menuOpen = false)}></div>{/if}
  <aside class="sidebar" class:open={menuOpen}>
    <nav>
      {#each nav as item}
        {@const kids = children(item.id)}
        <div class="nav-row">
          <button class="nav-item" class:active={ui.view === item.id && !kids.some((k) => k.active)} onclick={() => go(item.id)}>
            <item.icon size={17} strokeWidth={1.8} />
            <span>{item.label}</span>
          </button>
          {#if kids.length}
            <button class="nav-fold" class:open={isOpen(item.id)} onclick={() => toggle(item.id)}
              aria-expanded={isOpen(item.id)} title={isOpen(item.id) ? 'Plegar' : 'Desplegar'}><ChevronRight size={15} /></button>
          {/if}
        </div>
        {#if kids.length && isOpen(item.id)}
          {#each kids as k (k.id)}
            <button class="nav-item sub" class:active={k.active} onclick={k.open} title={k.label}><span>{k.label}</span></button>
          {/each}
        {/if}
      {/each}
      <div class="nav-group">Utilidades</div>
      {#each tools as item}
        <button class="nav-item" class:active={ui.view === item.id} onclick={() => go(item.id)}>
          <item.icon size={17} strokeWidth={1.8} />
          <span>{item.label}</span>
          {#if item.soon}<em>pronto</em>{/if}
        </button>
      {/each}
    </nav>
    <div class="side-foot">
      <button class="nav-item help-btn" class:active={ui.view === 'alerts'} onclick={() => go('alerts')} title="Copias pendientes, fallos…">
        <Bell size={17} strokeWidth={1.8} />
        <span>Avisos</span>
        {#if alertCount}<span class="count">{alertCount}</span>{/if}
      </button>
      <button class="nav-item help-btn" class:active={ui.view === 'catalog'} onclick={() => go('catalog')} title="Los módulos que se pueden instalar">
        <Boxes size={17} strokeWidth={1.8} />
        <span>Catálogo</span>
      </button>
      <button class="nav-item help-btn" onclick={() => { ui.help = ui.view; menuOpen = false }} title="Ayuda de esta pantalla">
        <CircleHelp size={17} strokeWidth={1.8} />
        <span>Ayuda</span>
      </button>
      <div class="ver">v{ui.info?.version ?? '…'}</div>
    </div>
  </aside>

  <main class="content">
    {#if ready}
      {#if ui.view === 'dashboard'}<Dashboard />
      {:else if ui.view === 'servers'}<Servers />
      {:else if ui.view === 'catalog'}<Catalog />
      {:else if ui.view === 'projects'}<Projects />
      {:else if ui.view === 'lab'}<Lab />
      {:else if ui.view === 'docker'}<Dockerize />
      {:else if ui.view === 'settings'}<SettingsView />
      {:else if ui.view === 'alerts'}<Alerts />
      {:else if ui.view === 'terminal'}<!-- abajo, siempre montada -->
      {:else}<Upcoming view={ui.view} />
      {/if}
      {#if termSeen}<TerminalView visible={ui.view === 'terminal'} />{/if}
    {/if}
  </main>

  <StatusBar />
</div>

{#if ui.help}
  <HelpDialog />
{/if}

{#if ui.ask}
  <AskDialog title={ui.ask.title} message={ui.ask.message} label={ui.ask.label} password={ui.ask.password} done={ui.ask.resolve} />
{/if}

{#if ui.confirm}
  <ConfirmDialog title={ui.confirm.title} message={ui.confirm.message} detail={ui.confirm.detail} confirmLabel={ui.confirm.confirmLabel} danger={ui.confirm.danger} done={ui.confirm.resolve} />
{/if}

{#if ui.storePrompt}
  <StoreDialog initial={ui.storePrompt.initial} done={ui.storePrompt.resolve} />
{/if}

{#if ui.vaultPrompt}
  <VaultDialog mode={ui.vaultPrompt.mode} reason={ui.vaultPrompt.reason} done={ui.vaultPrompt.resolve} />
{/if}

{#if ui.toast}
  <div class="toast" class:error={ui.toast.kind === 'error'} role="status">
    {#if ui.toast.kind === 'error'}<CircleAlert size={17} />{:else}<CircleCheck size={17} />{/if}
    <span>{ui.toast.text}</span>
  </div>
{/if}

<style>
  .shell {
    display: grid;
    grid-template-columns: 220px 1fr;
    grid-template-rows: 52px 1fr 30px;
    height: 100vh;
  }
  .topbar {
    grid-column: 1 / -1;
    display: flex; align-items: center; gap: 18px;
    padding: 0 16px 0 18px;
    background: var(--sidebar); color: var(--sidebar-text);
    border-bottom: 1px solid var(--border);
    --wails-draggable: drag;
  }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: 0.08em; font-size: 13.5px; width: 186px; }
  .crumb { color: var(--sidebar-muted); font-size: 13px; }
  .top-right { margin-left: auto; display: flex; align-items: center; gap: 10px; --wails-draggable: no-drag; }
  .top-right .btn { color: var(--sidebar-muted); }
  .top-right .btn:hover, .top-right .btn.active { color: var(--sidebar-text); background: var(--sidebar-hover); }

  .sidebar {
    background: var(--sidebar); color: var(--sidebar-text);
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 12px 0;
    overflow-y: auto;
  }
  .count { margin-left: auto; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--warning); color: #1a1a1a; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
  .bell .count { margin-left: 2px; }
  nav { display: flex; flex-direction: column; gap: 2px; overflow-y: auto; min-height: 0; flex: 1; }
  .nav-item {
    display: flex; align-items: center; gap: 11px;
    height: 38px; padding: 0 18px; margin: 0;
    background: none; border: 0; border-left: 3px solid transparent;
    color: var(--sidebar-muted); cursor: pointer; text-align: left; font-size: 14px;
    transition: background .12s, color .12s;
  }
  .nav-item:hover { background: var(--sidebar-hover); color: var(--sidebar-text); }
  .nav-item.active { border-left-color: var(--accent); background: var(--sidebar-hover); color: var(--sidebar-text); font-weight: 500; }
  .nav-item em { margin-left: auto; font-style: normal; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; opacity: .6; }

  .nav-row { display: flex; align-items: stretch; }
  .nav-row .nav-item { flex: 1; }
  .nav-fold { background: none; border: 0; color: var(--sidebar-muted); cursor: pointer; padding: 0 14px; display: flex; align-items: center; }
  .nav-fold:hover { color: var(--sidebar-text); background: var(--sidebar-hover); }
  .nav-fold :global(svg) { transition: transform .12s; }
  .nav-fold.open :global(svg) { transform: rotate(90deg); }
  .nav-item.sub { height: 30px; padding-left: 46px; font-size: 13px; }
  .nav-item.sub span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .help-btn { margin: 0 -18px; }
  .nav-group { margin: 16px 18px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--sidebar-muted); opacity: .75; font-weight: 600; }
  .side-foot { padding: 14px 18px 4px; display: flex; flex-direction: column; gap: 2px; }
  .side-foot .ver { margin-top: 10px; }
  .ver { font-size: 11.5px; color: var(--sidebar-muted); opacity: .7; font-family: var(--mono); }

  .content { overflow-y: auto; padding: 28px 32px 40px; }

  .burger {
    display: none; align-items: center; justify-content: center; width: 36px; height: 36px; margin-left: -6px;
    background: none; border: 0; border-radius: 8px; color: var(--sidebar-text); cursor: pointer; --wails-draggable: no-drag;
  }
  .burger:hover { background: var(--sidebar-hover); }
  .scrim { display: none; }

  /* Pantalla estrecha (p. ej. media pantalla): el menú se pliega. */
  @media (max-width: 900px) {
    .shell { grid-template-columns: 1fr; }
    .burger { display: inline-flex; }
    .brand { width: auto; }
    .sidebar {
      position: fixed; top: 52px; bottom: 30px; left: 0; width: 240px; z-index: 30;
      transform: translateX(-100%); transition: transform .18s ease-out; box-shadow: var(--shadow);
    }
    .sidebar.open { transform: none; }
    .scrim { display: block; position: fixed; inset: 52px 0 30px; z-index: 29; background: rgba(0, 0, 0, .45); }
    .content { padding: 20px 16px 32px; }
  }
  @media (max-width: 640px) {
    .crumb, .top-right .lbl, .brand span { display: none; }
  }

  .toast {
    position: fixed; right: 22px; bottom: 22px; z-index: 50;
    display: flex; align-items: center; gap: 10px; max-width: 460px;
    padding: 12px 16px; border-radius: var(--radius);
    background: var(--panel); border: 1px solid var(--border); box-shadow: var(--shadow);
    color: var(--text);
  }
  .toast :global(svg) { color: var(--success); flex: none; }
  .toast.error :global(svg) { color: var(--danger); }
</style>
