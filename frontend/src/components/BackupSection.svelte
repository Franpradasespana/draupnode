<script lang="ts">
  // Copia de Draupnode: exportar todo (servidores, plantillas, bóveda,
  // huellas, módulos propios y, si se quiere, claves SSH) a un fichero
  // cifrado, e importarlo en este u otro equipo.
  import { onMount } from 'svelte'
  import { DatabaseBackup, Download, Upload, Eye, EyeOff } from '@lucide/svelte'
  import { api, errorText } from '../lib/api'
  import { ask, confirmDialog, toast, timeAgo, refreshServers, refreshProjects, refreshModules, refreshSecrets } from '../lib/state.svelte'
  import { loadAlerts } from '../lib/alerts.svelte'
  import { t } from '../lib/i18n.svelte'

  let last = $state<string | null>(null)
  let pw = $state('')
  let pw2 = $state('')
  let show = $state(false)
  let withKeys = $state(true)
  let busy = $state('')

  onMount(async () => {
    try { last = (await api.BackupStatus()).lastExport ?? null } catch { /* demo */ }
  })

  const pwError = $derived(pw && pw.length < 10 ? t('Al menos 10 caracteres') : pw2 && pw !== pw2 ? t('No coinciden') : '')

  async function doExport() {
    busy = 'export'
    try {
      const p = await api.ExportBackup(pw, withKeys)
      if (!p) return
      pw = pw2 = ''
      last = new Date().toISOString()
      toast(t('Copia guardada en ') + p)
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
      const password = await ask(t('Contraseña de la copia'), t('La que pusiste al exportarla.'), t('Contraseña de la copia'))
      if (password === null) return
      busy = 'import'
      const m = await api.InspectBackup(file, password)
      busy = ''
      const ok = await confirmDialog({
        title: t('Importar la copia'),
        message: t('Se sustituye TODO lo de Draupnode en este equipo por lo de la copia. Lo que hay ahora se guarda en una carpeta aparte, por si acaso. Los servidores no se tocan.'),
        detail: [
          t('Copia del {0} (Draupnode {1})', new Date(m.created).toLocaleString(), m.app),
          t('{0} servidor(es), {1} plantilla(s), {2} plantilla(s) aplicada(s)', m.servers, m.templates, m.deployments),
          t('{0} contraseña(s) en la bóveda · {1} del llavero · {2} clave(s) SSH · {3} módulo(s) propio(s)', m.vaultEntries, m.keyring, m.keys.length, m.modules),
        ].join('\n'),
        confirmLabel: t('Importar'),
        danger: true,
      })
      if (!ok) return
      busy = 'import'
      const r = await api.ImportBackup(file, password)
      await Promise.all([refreshServers(), refreshProjects(), refreshModules(true), refreshSecrets()])
      loadAlerts()
      toast(t('Copia importada. ') + r.notes.join(' '))
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      busy = ''
    }
  }
</script>

<section class="card bk">
  <div>
    <h2><DatabaseBackup size={18} /> {t('Copia de Draupnode')}</h2>
    <p class="muted small">{t('Tus servidores, plantillas, contraseñas de la bóveda, huellas, módulos propios y claves SSH están solo en este equipo. Guarda una copia cifrada fuera de él (un USB, tu nube…) para no perderlos si se rompe o cambias de equipo.')}</p>
    <p class="small">{t('Última copia:')} <strong>{last ? timeAgo(last) : t('nunca')}</strong></p>
  </div>

  <div class="cols">
    <div class="box">
      <h3>{t('Exportar')}</h3>
      <label class="field">
        <span>{t('Contraseña de la copia')}</span>
        <div class="pwrow">
          <input class="input" type={show ? 'text' : 'password'} bind:value={pw} autocomplete="new-password" />
          <button class="btn ghost sm icon" onclick={() => (show = !show)} title={show ? t('Ocultar') : t('Mostrar')}>{#if show}<EyeOff size={14} />{:else}<Eye size={14} />{/if}</button>
        </div>
      </label>
      <label class="field">
        <span>{t('Repítela')}</span>
        <input class="input" type={show ? 'text' : 'password'} bind:value={pw2} autocomplete="new-password" />
      </label>
      {#if pwError}<p class="err small">{pwError}</p>{/if}
      <label class="check"><input type="checkbox" bind:checked={withKeys} /> {t('Incluir las claves SSH de los servidores')}</label>
      <p class="muted small">{t('Sin esta contraseña no se puede abrir: apúntala en un sitio seguro. La bóveda va dentro tal cual, y se sigue abriendo con su contraseña maestra.')}</p>
      <button class="btn primary" onclick={doExport} disabled={!!busy || !pw || pw !== pw2 || pw.length < 10}><Download size={15} /> {busy === 'export' ? t('Cifrando…') : t('Exportar copia…')}</button>
    </div>
    <div class="box">
      <h3>{t('Importar')}</h3>
      <p class="muted small">{t('En un equipo nuevo (o tras reinstalar), elige el fichero')} <code>.draupnode</code> {t('y escribe su contraseña. Verás lo que trae antes de confirmar. Lo que haya ahora en este equipo se guarda aparte, no se pierde.')}</p>
      <button class="btn" onclick={doImport} disabled={!!busy}><Upload size={15} /> {busy === 'import' ? t('Abriendo…') : t('Importar una copia…')}</button>
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
