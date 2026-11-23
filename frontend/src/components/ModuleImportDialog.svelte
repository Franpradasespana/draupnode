<script lang="ts">
  // Revisión de un módulo antes de importarlo: si el fichero está entero, si se
  // carga bien, qué hace (tareas, órdenes, sitios de internet) y lo delicado.
  // Un módulo se ejecuta como root en tus servidores: hay que leerlo antes.
  import { untrack } from 'svelte'
  import { ShieldCheck, ShieldAlert, CircleX, TriangleAlert, FileCode, Download, Globe, SquareTerminal, ListChecks, Box, Info } from '@lucide/svelte'
  import Modal from './Modal.svelte'
  import CodeEditor from './CodeEditor.svelte'
  import type { ModuleImportReport } from '../lib/api'

  let { report, onimport, onclose }: { report: ModuleImportReport; onimport: (newId: string, overwrite: boolean) => void; onclose: () => void } = $props()

  let file = $state(untrack(() => report.files[0]?.path ?? ''))
  const cur = $derived(report.files.find((f) => f.path === file))
  // Si choca con uno incluido, hay que ponerle otro nombre; si choca con uno tuyo, se elige.
  let mode = $state<'replace' | 'rename'>(untrack(() => (report.conflict === 'builtin' ? 'rename' : 'replace')))
  let newId = $state(untrack(() => (report.conflict ? report.id + '-2' : '')))
  let reviewed = $state(false)
  const idOk = $derived(/^[a-z][a-z0-9-]{1,40}$/.test(newId.trim()))
  const renaming = $derived(!!report.conflict && mode === 'rename')
  const can = $derived(report.ok && (!report.warnings.length || reviewed) && (!renaming || idOk))
  const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`)
</script>

<Modal title="Importar «{report.name || report.id || 'módulo'}»" width={860} {onclose}>
  <div class="head">
    {#if report.ok}
      <p class="ok"><ShieldCheck size={16} /> <span><strong>El fichero está entero y el módulo se carga bien.</strong>
        {report.integrity ? 'Cada fichero coincide con su huella (SHA-256).' : ''} No dice quién lo hizo: impórtalo solo si te fías de quien te lo pasó.</span></p>
      <p class="info"><Info size={16} /> <span>Importarlo no ejecuta nada en este equipo. Se ejecutará en un servidor cuando lo añadas y pulses «Aplicar», y allí <strong>como root</strong>: puede hacer cualquier cosa en ese servidor. Esta revisión ayuda a ver qué hace, pero no puede garantizar que sea inofensivo.</span></p>
    {:else}
      <p class="bad"><CircleX size={16} /> <span><strong>No se puede importar.</strong></span></p>
      {#each report.problems as p}<p class="bad sub">· {p}</p>{/each}
    {/if}
    <dl>
      <dt>Módulo</dt><dd><span class="mono">{report.id}</span>{report.version ? ` · versión ${report.version}` : ''}</dd>
      {#if report.description}<dt>Qué hace</dt><dd>{report.description}</dd>{/if}
      {#if report.draupnode || report.exported}<dt>Exportado</dt><dd>{report.exported}{report.draupnode ? ` con Draupnode ${report.draupnode}` : ''}</dd>{/if}
      {#if report.depends.length}<dt>Necesita</dt><dd>{report.depends.join(', ')}</dd>{/if}
    </dl>
  </div>

  {#if report.ok}
    <div class="grid">
      <section>
        <h3><ListChecks size={15} /> Lo que hace en el servidor (como root)</h3>
        {#if report.tasks.length}<p class="chips">{#each report.tasks as t}<span class="chip mono">{t}</span>{/each}</p>{:else}<p class="muted small">Sin tareas.</p>{/if}
        {#if report.commands.length}
          <h4><SquareTerminal size={13} /> Órdenes que ejecuta</h4>
          <ul class="cmds">{#each report.commands as c}<li class="mono">{c}</li>{/each}</ul>
        {/if}
        {#if report.images.length}
          <h4><Box size={13} /> Imágenes de Docker que descargará</h4>
          <p class="chips">{#each report.images as i}<span class="chip mono">{i}</span>{/each}</p>
        {/if}
        {#if report.hosts.length}
          <h4><Globe size={13} /> Sitios de internet que aparecen</h4>
          <p class="chips">{#each report.hosts as h}<span class="chip mono">{h}</span>{/each}</p>
        {/if}
      </section>
      <section>
        <h3>{#if report.warnings.length}<ShieldAlert size={15} class="warn-i" /> Conviene revisar{:else}<ShieldCheck size={15} class="ok-i" /> Nada delicado a la vista{/if}</h3>
        {#each report.warnings as w}<p class="warn"><TriangleAlert size={14} /> <span>{w}</span></p>{/each}
        {#if !report.warnings.length}<p class="muted small">No descarga scripts para ejecutarlos, no toca claves SSH, sudo ni el cortafuegos, ni borra desde la raíz. Aun así, échale un vistazo a sus ficheros.</p>{/if}
      </section>
    </div>

    <h3 class="files-h"><FileCode size={15} /> Sus ficheros</h3>
    <div class="files">
      {#each report.files as f (f.path)}
        <button class="file" class:on={file === f.path} onclick={() => (file = f.path)}>{f.path} <span class="muted">{kb(f.size)}</span></button>
      {/each}
    </div>
    <div class="ed">
      {#if cur?.text !== undefined}{#key file}<CodeEditor value={cur.text} {file} readonly />{/key}{:else}<p class="muted small">No es texto (no se puede enseñar).</p>{/if}
    </div>

    {#if report.conflict}
      <div class="conflict">
        {#if report.conflict === 'builtin'}
          <p><TriangleAlert size={14} /> <span>«{report.id}» es el nombre de un módulo incluido: impórtalo con otro nombre.</span></p>
        {:else}
          <p><TriangleAlert size={14} /> <span>Ya tienes un módulo «{report.id}».</span></p>
          <label class="chk"><input type="radio" bind:group={mode} value="replace" /> Sustituir el mío por este (las plantillas que lo usan verán la versión nueva)</label>
          <label class="chk"><input type="radio" bind:group={mode} value="rename" /> Importarlo con otro nombre</label>
        {/if}
        {#if renaming}
          <label class="field"><span>Nombre nuevo (id)</span><input class="input mono" bind:value={newId} /><small class="muted">Sus variables pasarán a empezar por «{newId.trim().replaceAll('-', '_') || '…'}_».</small></label>
        {/if}
      </div>
    {/if}

    {#if report.warnings.length}
      <label class="chk review"><input type="checkbox" bind:checked={reviewed} /> He leído lo que hace y me fío de quien me lo pasó</label>
    {/if}
  {/if}

  {#snippet footer()}
    <button class="btn" onclick={onclose}>Cancelar</button>
    {#if report.ok}
      <button class="btn primary" disabled={!can} onclick={() => onimport(renaming ? newId.trim() : '', report.conflict === 'user' && mode === 'replace')}>
        <Download size={14} /> {report.conflict === 'user' && mode === 'replace' ? 'Sustituir el mío' : 'Importar'}
      </button>
    {/if}
  {/snippet}
</Modal>

<style>
  .head p { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 8px; font-size: 13.5px; }
  .head :global(svg) { flex: none; margin-top: 2px; }
  .ok { color: var(--text); }
  .info { color: var(--muted); }
  .info :global(svg) { color: var(--accent); }
  .ok :global(svg), :global(.ok-i) { color: var(--success); }
  .bad { color: var(--danger); }
  .sub { margin-left: 24px !important; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 10px 0 14px; font-size: 13px; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 12px; }
  h3 { display: flex; gap: 6px; align-items: center; font-size: 13.5px; margin: 0 0 8px; }
  h4 { display: flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--muted); margin: 10px 0 6px; font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 0; }
  .chip { font-size: 11.5px; padding: 2px 8px; border: 1px solid var(--border-soft); border-radius: 999px; }
  .cmds { margin: 0; padding-left: 18px; font-size: 12px; display: flex; flex-direction: column; gap: 3px; word-break: break-all; }
  .warn { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; background: var(--warning-soft); padding: 6px 9px; border-radius: var(--radius-sm); margin: 0 0 6px; }
  .warn :global(svg), :global(.warn-i) { color: var(--warning); flex: none; margin-top: 2px; }
  .files-h { margin-top: 6px; }
  .files { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
  .file { padding: 4px 10px; border: 1px solid var(--border-soft); border-radius: 999px; background: var(--panel); font: inherit; font-size: 12px; font-family: var(--mono); color: var(--text); cursor: pointer; }
  .file.on { border-color: var(--accent); color: var(--accent); }
  .ed { height: 260px; margin-bottom: 12px; }
  .conflict { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
  .conflict p { display: flex; gap: 8px; margin: 0; }
  .conflict :global(svg) { color: var(--warning); flex: none; margin-top: 2px; }
  .chk { display: flex; gap: 8px; align-items: center; font-size: 13px; cursor: pointer; }
  .review { font-weight: 600; }
  .field { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
  .mono { font-family: var(--mono); }
  .muted { color: var(--muted); }
  .small { font-size: 12.5px; }
  @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
</style>
