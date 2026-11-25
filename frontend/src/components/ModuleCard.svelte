<script lang="ts">
  // Tarjeta de un módulo en la página del proyecto.
  import { Check, Plus, Lock, CircleAlert } from '@lucide/svelte'
  import { moduleIcon } from '../lib/icons'
  import type { Module } from '../lib/api'
  import type { CardState } from '../lib/modules'
  import { t } from '../lib/i18n.svelte'

  let { m, state, note = '', errors = 0, onclick, disabled = false }: {
    m: Module; state: CardState; note?: string; errors?: number; onclick: () => void; disabled?: boolean
  } = $props()

  const Icon = $derived(moduleIcon(m.id))
  const label: Record<CardState, string> = {
    installed: t('Instalado'), left: t('Sin gestionar'), pending: t('Añadido'), required: t('Añadido'), clash: t('No compatible'), none: '',
  }
</script>

<button class="mc st-{state}" {onclick} disabled={disabled || state === 'clash'} title={note || m.description}>
  <span class="ic"><Icon size={20} /></span>
  <span class="body">
    <strong>{m.name}</strong>
    <span class="desc">{m.description}</span>
    {#if note}<span class="note">{note}</span>{/if}
  </span>
  <span class="badge" class:err={errors > 0}>
    {#if errors}<CircleAlert size={13} /> {errors} error{errors > 1 ? 'es' : ''}
    {:else if state === 'installed'}<Check size={13} /> {label[state]}
    {:else if state === 'pending' || state === 'required'}<Check size={13} /> {label[state]}
    {:else if state === 'clash'}<Lock size={13} /> {label[state]}
    {:else if state === 'left'}{label[state]}
    {:else}<Plus size={13} /> {t('Añadir')}{/if}
  </span>
</button>

<style>
  .mc {
    display: grid; grid-template-columns: auto 1fr; grid-template-rows: 1fr auto; gap: 8px 12px;
    text-align: left; padding: 14px; border-radius: var(--radius); border: 1px solid var(--border);
    background: var(--panel); color: var(--text); font: inherit; cursor: pointer; min-height: 118px;
    transition: border-color .15s, box-shadow .15s, transform .05s;
  }
  .mc:hover:not(:disabled) { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); box-shadow: var(--shadow); }
  .mc:active:not(:disabled) { transform: translateY(1px); }
  .mc:disabled { cursor: not-allowed; opacity: .55; }
  .ic { grid-row: 1 / 3; width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; background: var(--panel-2); color: var(--muted); }
  .body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .body strong { font-size: 14px; }
  .desc { font-size: 12px; color: var(--muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .note { font-size: 11.5px; color: var(--info); }
  .st-clash .note, .st-left .note { color: var(--warning); }
  .badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; color: var(--muted); justify-self: start; padding: 3px 8px; border-radius: 999px; background: var(--panel-2); }
  .st-installed { border-color: color-mix(in srgb, var(--success) 55%, transparent); background: var(--success-soft); }
  .st-installed .ic, .st-installed .badge { color: var(--success); }
  .st-pending { border-color: color-mix(in srgb, var(--info) 60%, transparent); background: var(--info-soft); }
  .st-pending .ic, .st-pending .badge { color: var(--info); }
  /* Añadido porque lo necesita otro: igual que añadido (la nota dice quién lo necesita). */
  .st-required { border-color: color-mix(in srgb, var(--info) 60%, transparent); background: var(--info-soft); }
  .st-required .ic, .st-required .badge { color: var(--info); }
  .st-left { border-style: dashed; border-color: color-mix(in srgb, var(--success) 50%, transparent); }
  .st-left .badge { color: var(--success); }
  .badge.err { color: var(--danger); background: var(--danger-soft); }
</style>
