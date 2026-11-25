<script lang="ts">
  // Miniatura de la interfaz con una paleta, como en las láminas de diseño.
  import { cssVars, type Colors } from '../lib/palettes'
  import { t } from '../lib/i18n.svelte'

  let { colors, big = false }: { colors: Colors; big?: boolean } = $props()
  const style = $derived(
    Object.entries(cssVars(colors))
      .filter(([k]) => k.startsWith('--'))
      .map(([k, v]) => `${k}:${v}`)
      .join(';'),
  )
</script>

<div class="pv" class:big {style}>
  <div class="tb"><i class="logo"></i><b></b><span></span></div>
  <div class="sb">
    <i class="on"></i><i></i><i></i><i></i>
  </div>
  <div class="main">
    <div class="tiles"><div><b>08</b></div><div><b class="a2">12</b></div></div>
    <div class="panel">
      <div class="bar"><span></span></div>
      <div class="li"><i class="ok"></i><span></span></div>
      <div class="li"><i class="ok"></i><span></span></div>
      <div class="li"><i class="bad"></i><span></span></div>
    </div>
    <div class="btns"><span class="pri">{t('Deploy')}</span><span class="sec">{t('Logs')}</span></div>
  </div>
</div>

<style>
  .pv {
    display: grid; grid-template-columns: 28% 1fr; grid-template-rows: 16px 1fr;
    height: 128px; border-radius: 8px; overflow: hidden;
    background: var(--bg); border: 1px solid var(--border); font-size: 9px; color: var(--text);
  }
  .big { height: 230px; font-size: 13px; grid-template-rows: 26px 1fr; }
  .tb { grid-column: 1 / -1; background: var(--sidebar); border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 5px; padding: 0 7px; }
  .tb .logo { width: 7px; height: 7px; border-radius: 50%; border: 2px solid var(--accent); }
  .tb b { width: 34px; height: 4px; border-radius: 2px; background: var(--sidebar-text); opacity: .85; }
  .tb span { margin-left: auto; width: 20px; height: 4px; border-radius: 2px; background: var(--sidebar-muted); }
  .sb { background: var(--sidebar); border-right: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; padding: 8px 0; }
  .sb i { height: 4px; margin: 0 8px; border-radius: 2px; background: var(--sidebar-muted); opacity: .7; }
  .sb i.on { margin-left: 0; height: 9px; border-left: 2px solid var(--accent); background: var(--sidebar-hover); opacity: 1; border-radius: 0; }
  .main { padding: 7px; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
  .tiles div { background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; }
  .tiles b { font-weight: 600; }
  .tiles b.a2 { color: var(--accent-2); }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 5px 6px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .bar { height: 3px; border-radius: 3px; background: var(--border); }
  .bar span { display: block; height: 100%; width: 80%; border-radius: 3px; background: var(--accent); }
  .li { display: flex; align-items: center; gap: 4px; }
  .li i { width: 4px; height: 4px; border-radius: 50%; }
  .li i.ok { background: var(--success); }
  .li i.bad { background: var(--danger); }
  .li span { height: 3px; width: 50%; border-radius: 2px; background: var(--muted); opacity: .6; }
  .btns { display: flex; gap: 4px; }
  .btns span { padding: 1px 6px; border-radius: 3px; font-weight: 600; font-size: .85em; }
  .pri { background: var(--accent); color: var(--on-accent); }
  .sec { border: 1px solid var(--border); color: var(--text); }
  .big .main { padding: 14px; gap: 10px; }
  .big .tiles div { padding: 6px 12px; border-radius: 6px; }
  .big .tiles b { font-size: 22px; }
  .big .panel { padding: 10px 12px; gap: 9px; border-radius: 6px; }
  .big .bar { height: 5px; }
  .big .li i { width: 7px; height: 7px; }
  .big .li span { height: 5px; }
  .big .btns span { padding: 4px 12px; border-radius: 5px; }
  .big .sb { gap: 12px; padding: 14px 0; }
  .big .sb i { height: 6px; margin: 0 14px; }
  .big .sb i.on { height: 16px; margin-left: 0; }
</style>
