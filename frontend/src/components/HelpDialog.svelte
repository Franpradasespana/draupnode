<script lang="ts">
  import { X } from '@lucide/svelte'
  import { HELP, helpFor, shot } from '../lib/help'
  import { ui } from '../lib/state.svelte'
  import ModuleTests from './ModuleTests.svelte'
  import { t } from '../lib/i18n.svelte'

  let current = $state(helpFor(ui.help).id)
  const sec = $derived(HELP.find((h) => h.id === current) ?? HELP[0])
  let bodyEl = $state<HTMLElement>()
  let zoom = $state<string | null>(null)

  function go(id: typeof current) {
    current = id
    bodyEl?.scrollTo({ top: 0 })
  }
  function onkey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    if (zoom) zoom = null
    else ui.help = null
  }
</script>

<svelte:window onkeydown={onkey} />

<div class="backdrop" role="presentation" onmousedown={(e) => e.target === e.currentTarget && (ui.help = null)}>
  <div class="help" role="dialog" aria-modal="true" aria-label={t('Ayuda')}>
    <nav>
      <div class="nav-title">{t('Ayuda')}</div>
      {#each HELP as h (h.id)}
        <button class:active={h.id === current} onclick={() => go(h.id)}>{h.title}</button>
      {/each}
    </nav>
    <div class="main">
    <section bind:this={bodyEl}>
      <header>
        <h1>{sec.title}</h1>
      </header>
      <p class="intro">{sec.intro}</p>
      <ol>
        {#each sec.steps as st}
          {@const src = st.img ? shot(st.img) : undefined}
          <li>
            <h3>{st.title}</h3>
            <p>{st.text}</p>
            {#if src}
              <button class="shot" onclick={() => (zoom = src)} title={t('Ampliar')}><img {src} alt={st.title} loading="lazy" /></button>
            {/if}
          </li>
        {/each}
      </ol>
      {#if sec.id === 'probar'}<ModuleTests />{/if}
    </section>
    <footer>
      <span class="muted">{t('Esc también cierra')}</span>
      <button class="btn" onclick={() => (ui.help = null)}><X size={15} /> {t('Cerrar')}</button>
    </footer>
    </div>
  </div>
</div>

{#if zoom}
  <div class="zoom" role="presentation" onclick={() => (zoom = null)}><img src={zoom} alt="" /></div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 45; background: rgba(0, 0, 0, .55);
    display: grid; place-items: center; padding: 16px;
  }
  .help {
    width: min(1020px, calc(100vw - 32px)); height: min(760px, calc(100vh - 32px));
    display: grid; grid-template-columns: 200px 1fr;
    background: var(--panel); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); overflow: hidden;
  }
  nav { background: var(--panel-2); border-right: 1px solid var(--border); padding: 14px 8px; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
  .nav-title { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); padding: 4px 12px 10px; }
  nav button {
    text-align: left; background: none; border: 0; border-radius: 7px; padding: 8px 12px;
    font: inherit; font-size: 13.5px; color: var(--muted); cursor: pointer;
  }
  nav button:hover { background: var(--border-soft); color: var(--text); }
  nav button.active { background: var(--accent-soft); color: var(--text); font-weight: 500; }
  .main { display: flex; flex-direction: column; min-height: 0; }
  section { flex: 1; min-height: 0; overflow-y: auto; padding: 20px 28px 32px; }
  footer { display: flex; justify-content: flex-end; align-items: center; gap: 12px; padding: 10px 18px; border-top: 1px solid var(--border); background: var(--panel); font-size: 12.5px; }
  .muted { color: var(--muted); }
  header { display: flex; justify-content: space-between; align-items: center; }
  .intro { color: var(--muted); margin: 6px 0 18px; line-height: 1.55; }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 20px; }
  li h3 { margin: 0 0 4px; font-size: 14.5px; }
  li p { margin: 0; line-height: 1.55; font-size: 13.5px; }
  .shot { display: block; margin-top: 10px; padding: 0; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; background: none; cursor: zoom-in; max-width: 100%; }
  .shot img { display: block; width: 100%; height: auto; }
  @media (max-width: 720px) {
    .help { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
    nav { flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--border); padding: 8px; }
    .nav-title { display: none; }
    nav button { white-space: nowrap; padding: 6px 10px; }
    section { padding: 16px 18px 24px; }
  }
  .zoom { position: fixed; inset: 0; z-index: 46; background: rgba(0, 0, 0, .8); display: grid; place-items: center; padding: 24px; cursor: zoom-out; }
  .zoom img { max-width: 100%; max-height: 100%; border-radius: 8px; box-shadow: var(--shadow); }
</style>
