<script lang="ts">
  // Configuración de un módulo: una fila por opción, con la etiqueta y la
  // explicación a la izquierda y el control a la derecha.
  import VarField from './VarField.svelte'
  import SecretField from './SecretField.svelte'
  import GitRepoReader from './GitRepoReader.svelte'
  import type { Module } from '../lib/api'

  let { m, values = $bindable(), errors = {}, projectId, onsecret }: {
    m: Module; values: Record<string, unknown>; errors?: Record<string, string>; projectId: string; onsecret?: () => void
  } = $props()
</script>

{#if !m.variables?.some((v) => !v.managed)}
  <p class="muted none">Este módulo no tiene opciones: se instala tal cual.</p>
{:else}
  <div class="rows">
    {#each m.variables.filter((v) => !v.managed) as v (v.name)}
      {#if m.id === 'git-app' && v.name === 'git_app_env'}<GitRepoReader bind:values {projectId} />{/if}
      <div class="row" class:bad={!!errors[v.name]}>
        <div class="lbl">
          <strong>{v.label}{#if v.required} <span class="req">*</span>{/if}</strong>
          {#if v.help}<small>{v.help}</small>{/if}
          {#if errors[v.name]}<small class="err">{errors[v.name]}</small>{/if}
        </div>
        <div class="ctl">
          {#if v.type === 'secret'}
            <SecretField {v} {projectId} error={errors[v.name]} onchange={onsecret} bare />
          {:else}
            <VarField {v} bind:value={values[v.name]} error={errors[v.name]} bare />
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .none { font-size: 13.5px; padding: 8px 0; }
  .rows { display: flex; flex-direction: column; }
  .row { display: grid; grid-template-columns: minmax(200px, 2fr) 3fr; gap: 20px; align-items: start; padding: 14px 0; border-top: 1px solid var(--border-soft); }
  .row:first-child { border-top: 0; padding-top: 4px; }
  .lbl { display: flex; flex-direction: column; gap: 4px; padding-top: 8px; }
  .lbl strong { font-size: 13.5px; font-weight: 600; }
  .lbl small { font-size: 12.5px; color: var(--muted); line-height: 1.45; }
  .lbl .err { color: var(--danger); font-weight: 500; }
  .req { color: var(--danger); }
  .ctl { min-width: 0; }
  .row :global(.input) { background: var(--panel); border-color: color-mix(in srgb, var(--text) 22%, var(--border)); }
  .row.bad :global(.input) { border-color: var(--danger); }
  @media (max-width: 760px) {
    .row { grid-template-columns: 1fr; gap: 8px; }
    .lbl { padding-top: 0; }
  }
</style>
