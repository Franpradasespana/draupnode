<script lang="ts">
  // Copia de Draupnode: exportar todo (servidores, plantillas, bóveda,
  // huellas, módulos propios y, si se quiere, claves SSH) a un fichero
  // cifrado, e importarlo en este u otro equipo.
  import { onMount } from 'svelte'
  import { DatabaseBackup, Download, Upload, Eye, EyeOff } from '@lucide/svelte'
  import { api, errorText } from '../lib/api'
  import { ask, confirmDialog, toast, timeAgo, refreshServers, refreshProjects, refreshModules, refreshSecrets } from '../lib/state.svelte'
  import { loadAlerts } from '../lib/alerts.svelte'

  let last = $state<string | null>(null)
  let pw = $state('')
  let pw2 = $state('')
  let show = $state(false)
  let withKeys = $state(true)
  let busy = $state('')

  onMount(async () => {
    try { last = (await api.BackupStatus()).lastExport ?? null } catch { /* demo */ }
  })

  const pwError = $derived(pw && pw.length < 10 ? 'Al menos 10 caracteres' : pw2 && pw !== pw2 ? 'No coinciden' : '')

  async function doExport() {
    busy = 'export'
    try {
      const p = await api.ExportBackup(pw, withKeys)
      if (!p) return
      pw = pw2 = ''
      last = new Date().toISOString()
      toast('Copia guardada en ' + p)
      loadAlerts()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      busy = ''
    }
  }

  async function doImport() {
    try {
      const file = await api.ChooseBackupFile()
      if (!file) return
      const password = await ask('Contraseña de la copia', 'La que pusiste al exportarla.', 'Contraseña de la copia')
      if (password === null) return
      busy = 'import'
      const m = await api.InspectBackup(file, password)
      busy = ''
      const ok = await confirmDialog({
        title: 'Importar la copia',
        message: 'Se sustituye TODO lo de Draupnode en este equipo por lo de la copia. Lo que hay ahora se guarda en una carpeta aparte, por si acaso. Los servidores no se tocan.',
        detail: [
          `Copia del ${new Date(m.created).toLocaleString()} (Draupnode ${m.app})`,
          `${m.servers} servidor(es), ${m.templates} plantilla(s), ${m.deployments} plantilla(s) aplicada(s)`,
          `${m.vaultEntries} contraseña(s) en la bóveda · ${m.keyring} del llavero · ${m.keys.length} clave(s) SSH · ${m.modules} módulo(s) propio(s)`,
        ].join('\n'),
        confirmLabel: 'Importar',
        danger: true,
      })
      if (!ok) return
      busy = 'import'
      const r = await api.ImportBackup(file, password)
      await Promise.all([refreshServers(), refreshProjects(), refreshModules(true), refreshSecrets()])
      loadAlerts()
      toast('Copia importada. ' + r.notes.join(' '))
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      busy = ''
    }
  }
</script>

<section class="card bk">
  <div>
    <h2><DatabaseBackup size={18} /> Copia de Draupnode</h2>
    <p class="muted small">Tus servidores, plantillas, contraseñas de la bóveda, huellas, módulos propios y claves SSH están solo en este equipo. Guarda una copia cifrada fuera de él (un USB, tu nube…) para no perderlos si se rompe o cambias de equipo.</p>
    <p class="small">Última copia: <strong>{last ? timeAgo(last) : 'nunca'}</strong></p>
  </div>

  <div class="cols">
    <div class="box">
      <h3>Exportar</h3>
      <label class="field">
        <span>Contraseña de la copia</span>
        <div class="pwrow">
          <input class="input" type={show ? 'text' : 'password'} bind:value={pw} autocomplete="new-password" />
          <button class="btn ghost sm icon" onclick={() => (show = !show)} title={show ? 'Ocultar' : 'Mostrar'}>{#if show}<EyeOff size={14} />{:else}<Eye size={14} />{/if}</button>
        </div>
      </label>
      <label class="field">
        <span>Repítela</span>
        <input class="input" type={show ? 'text' : 'password'} bind:value={pw2} autocomplete="new-password" />
      </label>
      {#if pwError}<p class="err small">{pwError}</p>{/if}
      <label class="check"><input type="checkbox" bind:checked={withKeys} /> Incluir las claves SSH de los servidores</label>
      <p class="muted small">Sin esta contraseña no se puede abrir: apúntala en un sitio seguro. La bóveda va dentro tal cual, y se sigue abriendo con su contraseña maestra.</p>
      <button class="btn primary" onclick={doExport} disabled={!!busy || !pw || pw !== pw2 || pw.length < 10}><Download size={15} /> {busy === 'export' ? 'Cifrando…' : 'Exportar copia…'}</button>
    </div>
    <div class="box">
      <h3>Importar</h3>
      <p class="muted small">En un equipo nuevo (o tras reinstalar), elige el fichero <code>.draupnode</code> y escribe su contraseña. Verás lo que trae antes de confirmar. Lo que haya ahora en este equipo se guarda aparte, no se pierde.</p>
      <button class="btn" onclick={doImport} disabled={!!busy}><Upload size={15} /> {busy === 'import' ? 'Abriendo…' : 'Importar una copia…'}</button>
    </div>
  </div>
</section>

<style>
  .bk { margin-bottom: 28px; display: flex; flex-direction: column; gap: 14px; }
  h2 { display: flex; gap: 8px; align-items: center; margin: 0 0 4px; }
  h3 { margin: 0 0 6px; font-size: 14px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .box { display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid var(--border-soft); border-radius: var(--radius-sm); background: var(--panel-2); align-items: flex-start; }
  .field { display: flex; flex-direction: column; gap: 4px; width: 100%; font-size: 13px; }
  .pwrow { display: flex; gap: 6px; }
  .pwrow .input { flex: 1; }
  .check { display: flex; gap: 8px; align-items: center; font-size: 13px; }
  .small { font-size: 12.5px; margin: 0; }
  .err { color: var(--danger); }
  @media (max-width: 760px) { .cols { grid-template-columns: 1fr; } }
</style>
