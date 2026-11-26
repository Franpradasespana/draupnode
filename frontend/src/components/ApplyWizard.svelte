<script lang="ts">
  // Asistente al aplicar: una ventana por cada módulo nuevo que tenga
  // opciones y, al final, el resumen con «Finalizar y aplicar».
  import { ArrowLeft, ArrowRight, Eye, Hammer, TriangleAlert, CircleCheck, Lightbulb } from '@lucide/svelte'
  import Modal from './Modal.svelte'
  import ModuleForm from './ModuleForm.svelte'
  import type { Module, ProjectModule } from '../lib/api'
  import { t } from '../lib/i18n.svelte'

  let { modules = $bindable(), steps, install, changed, errors, warnings, tips = [], projectId, where, busy = false, onsecret, onpreview, onapply, onclose }: {
    modules: ProjectModule[]
    steps: Module[] // módulos nuevos con opciones, en orden de instalación
    install: Module[] // todos los módulos que se van a instalar, en orden
    changed: Module[] // instalados cuya configuración ha cambiado
    errors: Record<string, Record<string, string>>
    warnings: string[]
    tips?: string[]
    projectId: string
    where: string
    busy?: boolean
    onsecret: () => void
    onpreview: () => void
    onapply: () => void
    onclose: () => void
  } = $props()

  let i = $state(0)
  const total = $derived(steps.length + 1)
  const step = $derived(i < steps.length ? steps[i] : null)
  const pm = $derived(step ? modules.find((x) => x.id === step.id) : undefined)
  const stepErrors = $derived(step ? Object.keys(errors[step.id] ?? {}).length : 0)
  const allErrors = $derived(Object.values(errors).reduce((n, e) => n + Object.keys(e).length, 0))
</script>

<Modal title={step ? t('Configurar {0}', step.name) : t('Resumen')} {onclose} width={780} height={680}>
  <div class="top">
    <span class="where">{where}</span>
    <ol class="dots">
      {#each steps as s, k}
        <li class:on={k === i} class:done={k < i} class:bad={Object.keys(errors[s.id] ?? {}).length > 0}>
          <button onclick={() => (i = k)} title={s.name}>{k + 1}</button>
        </li>
      {/each}
      <li class:on={i === steps.length}><button onclick={() => (i = steps.length)} title={t('Resumen')}><CircleCheck size={13} /></button></li>
    </ol>
    <span class="muted small">{t('Paso {0} de {1}', i + 1, total)}</span>
  </div>

  {#if step && pm}
    <p class="intro muted">{step.description}</p>
    <ModuleForm m={step} bind:values={pm.values} errors={errors[step.id]} {projectId} {onsecret} />
  {:else}
    {#if install.length}
      <div class="sum">
        <h4>{t('Se instalará, en este orden')}</h4>
        <ol>{#each install as m}<li><strong>{m.name}</strong> <span class="muted">· {m.description}</span></li>{/each}</ol>
      </div>
    {/if}
    {#if changed.length}
      <div class="sum">
        <h4>{t('Se actualizará la configuración de')}</h4>
        <ul>{#each changed as m}<li><strong>{m.name}</strong></li>{/each}</ul>
      </div>
    {/if}
    {#if warnings.length}
      <div class="warns">{#each warnings as w}<p><TriangleAlert size={14} /> {w}</p>{/each}</div>
    {/if}
    {#if tips.length}
      <div class="tips">{#each tips as tip}<p><Lightbulb size={14} /> {tip}</p>{/each}</div>
    {/if}
    {#if allErrors}
      <p class="bad"><TriangleAlert size={14} /> {t('Hay {0} opción(es) con errores: vuelve al paso marcado en rojo.', allErrors)}</p>
    {:else}
      <p class="muted">{t('Lo que ya esté bien en el servidor no se toca. «Simular» enseña lo que cambiaría sin tocar nada.')}</p>
    {/if}
  {/if}

  {#snippet footer()}
    <button class="btn" onclick={onclose}>{t('Cancelar')}</button>
    <div class="sp"></div>
    {#if i > 0}<button class="btn" onclick={() => i--}><ArrowLeft size={15} /> {t('Anterior')}</button>{/if}
    {#if step}
      <button class="btn primary" onclick={() => i++} disabled={stepErrors > 0}>{t('Siguiente')} <ArrowRight size={15} /></button>
    {:else}
      <button class="btn" onclick={onpreview} disabled={busy || allErrors > 0}><Eye size={15} /> {t('Simular')}</button>
      <button class="btn primary" onclick={onapply} disabled={busy || allErrors > 0}><Hammer size={15} /> {t('Finalizar y aplicar')}</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .top { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding-bottom: 6px; border-bottom: 1px solid var(--border-soft); }
  .where { font-size: 12.5px; color: var(--muted); flex: 1; min-width: 0; }
  .dots { display: flex; gap: 6px; list-style: none; margin: 0; padding: 0; }
  .dots button { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--border); background: var(--panel-2); color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; display: grid; place-items: center; }
  .dots .done button { background: var(--success-soft); color: var(--success); border-color: transparent; }
  .dots .on button { background: var(--accent); color: var(--on-accent); border-color: transparent; }
  .dots .bad button { background: var(--danger-soft); color: var(--danger); border-color: var(--danger); }
  .small { font-size: 12px; }
  .intro { font-size: 13.5px; margin: 0; }
  .sum h4 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 6px; }
  .sum ol, .sum ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 13.5px; }
  .warns { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--warning-soft); }
  .warns p, .bad { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; margin: 0; }
  .warns :global(svg) { color: var(--warning); flex: none; margin-top: 2px; }
  .bad { color: var(--danger); }
  .sp { flex: 1; }
  .tips p { display: flex; gap: 6px; align-items: flex-start; margin: 4px 0; font-size: 13px; color: var(--info); }
  .tips :global(svg) { flex: none; margin-top: 2px; }
</style>
