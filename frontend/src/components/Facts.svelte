<script lang="ts">
  import { Check, X } from '@lucide/svelte'
  import { kbToGB } from '../lib/state.svelte'

  let { facts }: { facts: Record<string, string> } = $props()

  const rows = $derived([
    ['Sistema', facts.os],
    ['Equipo', facts.hostname],
    ['Kernel', facts.kernel],
    ['Arquitectura', facts.arch],
    ['CPU', facts.cpus],
    ['RAM', kbToGB(facts.mem_kb)],
    ['Disco libre', `${kbToGB(facts.disk_free_kb)} de ${kbToGB(facts.disk_total_kb)}`],
    ['Encendido', facts.uptime?.replace(/^up /, '')],
  ])
  const sudoLabel = $derived(facts.sudo === 'root' ? 'root' : facts.sudo === 'yes' ? 'sudo sin contraseña' : 'sin sudo')
  const tools = ['python3', 'docker', 'git', 'curl', 'ansible']
</script>

<div class="facts">
  {#each rows as [k, v]}
    <div class="row"><span class="muted">{k}</span><span class="selectable">{v || '—'}</span></div>
  {/each}
  <div class="row">
    <span class="muted">Permisos</span>
    <span class:ok={facts.sudo !== 'no'} class:bad={facts.sudo === 'no'}>{sudoLabel}</span>
  </div>
</div>
<div class="tools">
  {#each tools as t}
    {@const has = facts['has_' + t] === 'yes'}
    <span class="badge" class:ok={has}>
      {#if has}<Check size={12} />{:else}<X size={12} />{/if}{t}
    </span>
  {/each}
</div>

<style>
  .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border-soft); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); overflow: hidden; }
  .row { display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; background: var(--panel); }
  .row span:first-child { font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; }
  .ok { color: var(--success); }
  .bad { color: var(--danger); }
  .tools { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
