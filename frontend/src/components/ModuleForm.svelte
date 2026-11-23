<script lang="ts">
  // Configuración de un módulo: una fila por opción, con la etiqueta y la
  // explicación a la izquierda y el control a la derecha.
  import VarField from './VarField.svelte'
  import SecretField from './SecretField.svelte'
  import GitRepoReader from './GitRepoReader.svelte'
  import EnvEditor from './EnvEditor.svelte'
  import { api, type Module } from '../lib/api'
  import { FolderOpen } from '@lucide/svelte'

  let { m, values = $bindable(), errors = {}, projectId, onsecret }: {
    m: Module; values: Record<string, unknown>; errors?: Record<string, string>; projectId: string; onsecret?: () => void
  } = $props()
  // Otra copia de un módulo repetible («git-app@blog»): sus datos secretos llevan «@blog».
  const inst = $derived(m.id.includes('@') ? m.id.slice(m.id.indexOf('@') + 1) : '')
  // Tu app: solo los campos de donde sale el código (repositorio o carpeta de este equipo).
  const isGit = $derived(m.id.split('@')[0] === 'git-app')
  const GIT_ONLY = ['git_app_repo', 'git_app_token', 'git_app_branch', 'git_app_update']
  function shown(name: string): boolean {
    if (!isGit) return true
    const carpeta = values.git_app_source === 'carpeta'
    return carpeta ? !GIT_ONLY.includes(name) : name !== 'git_app_local_dir'
  }
  async function chooseDir() {
    const d = await api.ChooseProjectDir().catch(() => '')
    if (d) values.git_app_local_dir = d
  }
</script>

{#if !m.variables?.some((v) => !v.managed)}
  <p class="muted none">Este módulo no tiene opciones: se instala tal cual.</p>
{:else}
  <div class="rows">
    {#each m.variables.filter((v) => !v.managed && shown(v.name)) as v (v.name)}
      {#if m.id.split('@')[0] === 'git-app' && v.name === 'git_app_env'}<GitRepoReader bind:values {projectId} moduleId={m.id} />{/if}
      {@const envRows = m.id.split('@')[0] === 'git-app' && v.name === 'git_app_env'}
      <div class="row" class:bad={!!errors[v.name]} class:wide={envRows}>
        <div class="lbl">
          <strong>{v.label}{#if v.required} <span class="req">*</span>{/if}</strong>
          {#if v.help}<small>{v.help}</small>{/if}
          {#if errors[v.name]}<small class="err">{errors[v.name]}</small>{/if}
        </div>
        <div class="ctl">
          {#if v.type === 'secret'}
            <SecretField v={inst ? { ...v, name: `${v.name}@${inst}` } : v} {projectId} error={errors[v.name]} onchange={onsecret} bare />
          {:else if isGit && v.name === 'git_app_local_dir'}
            <div class="dirrow">
              <VarField {v} bind:value={values[v.name]} error={errors[v.name]} bare />
              <button type="button" class="btn sm" onclick={chooseDir}><FolderOpen size={14} /> Elegir…</button>
            </div>
          {:else if envRows}
            <EnvEditor bind:value={values[v.name]} error={errors[v.name]} />
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
  /* Variables (.env): en filas a todo lo ancho, debajo de su explicación. */
  .row.wide { grid-template-columns: 1fr; gap: 10px; }
  .dirrow { display: flex; gap: 8px; align-items: flex-start; }
  .dirrow > :global(*:first-child) { flex: 1; min-width: 0; }
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
