<script lang="ts">
  import { onMount } from 'svelte'
  import { LayoutDashboard, Server, Boxes, FolderGit2, FileCode, SquareTerminal, Settings, CircleCheck, FlaskConical, CircleAlert, CircleHelp } from '@lucide/svelte'
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
  import StatusBar from './components/StatusBar.svelte'
  import HelpDialog from './components/HelpDialog.svelte'
  import { ui, boot, toast, type View } from './lib/state.svelte'
  import { errorText, isDesktop } from './lib/api'

  const nav: { id: View; label: string; icon: typeof Server; soon?: boolean }[] = [
    { id: 'dashboard', label: 'Panel', icon: LayoutDashboard },
    { id: 'servers', label: 'Servidores', icon: Server },
    { id: 'projects', label: 'Proyectos', icon: FolderGit2 },
    { id: 'catalog', label: 'Catálogo', icon: Boxes },
    { id: 'lab', label: 'Pruebas', icon: FlaskConical },
    { id: 'editor', label: 'Editor', icon: FileCode, soon: true },
    { id: 'terminal', label: 'Terminal', icon: SquareTerminal, soon: true },
  ]

  const titles: Record<View, string> = {
    dashboard: 'Panel', servers: 'Servidores', catalog: 'Catálogo', projects: 'Proyectos',
    editor: 'Editor', terminal: 'Terminal', settings: 'Ajustes', lab: 'Pruebas',
  }

  let ready = $state(false)
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
  })
</script>

<div class="shell">
  <header class="topbar">
    <div class="brand">
      <Logo size={28} />
      <span>DRAUPNODE</span>
    </div>
    <div class="crumb">{titles[ui.view]}</div>
    <div class="top-right">
      {#if !isDesktop}<span class="badge accent" title="Abierto en el navegador: datos simulados">Demo navegador</span>{/if}
      <button class="btn ghost sm" class:active={ui.view === 'settings'} onclick={() => (ui.view = 'settings')}>
        <Settings size={15} /> Ajustes
      </button>
    </div>
  </header>

  <aside class="sidebar">
    <nav>
      {#each nav as item}
        <button class="nav-item" class:active={ui.view === item.id} onclick={() => { ui.view = item.id; if (item.id === 'projects') { ui.projectId = null; ui.projectServer = null } }}>
          <item.icon size={17} strokeWidth={1.8} />
          <span>{item.label}</span>
          {#if item.soon}<em>pronto</em>{/if}
        </button>
      {/each}
    </nav>
    <div class="side-foot">
      <button class="nav-item help-btn" onclick={() => (ui.help = ui.view)} title="Ayuda de esta pantalla">
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
      {:else if ui.view === 'settings'}<SettingsView />
      {:else}<Upcoming view={ui.view} />
      {/if}
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
  nav { display: flex; flex-direction: column; gap: 2px; }
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

  .help-btn { margin: 0 -18px; }
  .side-foot { padding: 14px 18px 4px; display: flex; flex-direction: column; gap: 10px; }
  .ver { font-size: 11.5px; color: var(--sidebar-muted); opacity: .7; font-family: var(--mono); }

  .content { overflow-y: auto; padding: 28px 32px 40px; }

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
