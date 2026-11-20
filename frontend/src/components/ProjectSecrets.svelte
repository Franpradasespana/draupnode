<script lang="ts">
  // Contraseñas de un proyecto: las que generaron los módulos en el servidor
  // (Draupnode las trae al Aplicar) y los datos secretos que escribiste.
  // Están cifradas en la bóveda: para verlas hay que escribir su contraseña
  // cada vez, y se ocultan solas al cabo de un rato.
  import { onDestroy } from 'svelte'
  import { KeyRound, Eye, EyeOff, Copy, Lock } from '@lucide/svelte'
  import { api, errorText, type ProjectSecret, type ProjectSecretsSummary } from '../lib/api'
  import { ask, toast, timeAgo, ui } from '../lib/state.svelte'

  let { projectId, refreshKey = '' }: { projectId: string; refreshKey?: string } = $props()

  const HIDE_AFTER_MS = 2 * 60 * 1000

  let info = $state<ProjectSecretsSummary | null>(null)
  let list = $state<ProjectSecret[] | null>(null)
  let shown = $state<Record<string, boolean>>({})
  let busy = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  const project = $derived(ui.projects.find((p) => p.id === projectId))
  // ¿Algún módulo del proyecto genera contraseñas o pide datos secretos?
  const relevant = $derived(
    (project?.modules ?? []).some((pm) => {
      const m = ui.modules?.modules.find((x) => x.id === pm.id)
      return !!m?.secrets?.length || !!m?.variables?.some((v) => v.type === 'secret')
    }),
  )
  const count = $derived((info?.generated ?? 0) + (info?.typed.length ?? 0))

  $effect(() => {
    void refreshKey
    api.ProjectSecretsInfo(projectId).then((i) => (info = i)).catch(() => {})
  })

  function hide() {
    list = null
    shown = {}
    clearTimeout(timer)
  }
  onDestroy(hide)

  async function open() {
    const master = await ask('Contraseñas del proyecto', 'Escribe la contraseña de la bóveda de Draupnode para verlas.', 'Contraseña de la bóveda')
    if (master === null) return
    busy = true
    try {
      list = await api.ProjectSecrets(projectId, master)
      clearTimeout(timer)
      timer = setTimeout(hide, HIDE_AFTER_MS)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      busy = false
    }
  }

  // Valores de varias líneas «Clave: valor» (p. ej. el administrador de
  // Coolify) se enseñan como filas, cada una con su botón de copiar.
  function rows(s: ProjectSecret): { key: string; value: string }[] {
    const lines = s.value.split('\n')
    if (lines.length > 1 && lines.every((l) => /^[^:]{1,30}: /.test(l))) {
      return lines.map((l) => ({ key: l.slice(0, l.indexOf(':')), value: l.slice(l.indexOf(':') + 2) }))
    }
    return [{ key: '', value: s.value }]
  }

  // Lo que se tapa: un valor suelto, o las filas «Contraseña:/Clave:».
  const isSecret = (key: string) => !key || /contrase|password|clave|token/i.test(key)

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast(`${what} copiado`)
    } catch {
      toast('No se pudo copiar', 'error')
    }
  }
</script>

{#if relevant || count > 0}
  <section class="card sec">
    <div class="head">
      <KeyRound size={17} />
      <div class="txt">
        <strong>Contraseñas del proyecto</strong>
        {#if count > 0}
          <span class="muted">
            {count} guardada{count === 1 ? '' : 's'} en la bóveda cifrada{#if info?.at} · traídas del servidor {timeAgo(info.at)}{/if}
          </span>
        {:else}
          <span class="muted">Todavía no hay ninguna: los módulos las generan en el servidor la primera vez que pulsas <strong>Aplicar</strong> (al previsualizar no se crean). Draupnode las trae y las guarda cifradas en la bóveda.</span>
        {/if}
      </div>
      {#if list}
        <button class="btn sm" onclick={hide}><Lock size={14} /> Ocultar</button>
      {:else if count > 0}
        <button class="btn sm primary" onclick={open} disabled={busy}><Eye size={14} /> {busy ? 'Abriendo…' : 'Ver contraseñas'}</button>
      {/if}
    </div>

    {#if list}
      {#if !list.length}
        <p class="muted small">No hay contraseñas guardadas para este proyecto.</p>
      {/if}
      <div class="list">
        {#each list as s (s.kind + s.name)}
          <div class="item">
            <div class="meta">
              <strong>{s.label}</strong>
              <span class="muted small">{s.module ? s.module + ' · ' : ''}<code>{s.name}</code>{s.kind === 'typed' ? ' · escrita por ti' : ''}</span>
            </div>
            {#each rows(s) as r, i}
              {@const id = s.name + ':' + i}
              {@const hidden = isSecret(r.key) && !shown[id]}
              <div class="val">
                {#if r.key}<span class="k">{r.key}</span>{/if}
                <code class="v selectable">{hidden ? '•'.repeat(Math.min(24, r.value.length)) : r.value}</code>
                {#if isSecret(r.key)}
                  <button class="btn sm ghost" onclick={() => (shown[id] = !shown[id])} title={shown[id] ? 'Ocultar' : 'Mostrar'}>
                    {#if shown[id]}<EyeOff size={14} />{:else}<Eye size={14} />{/if}
                  </button>
                {/if}
                <button class="btn sm ghost" onclick={() => copy(r.value, r.key || s.label)} title="Copiar"><Copy size={14} /></button>
              </div>
            {/each}
          </div>
        {/each}
      </div>
      <p class="muted small">Se ocultan solas a los 2 minutos. El original sigue en el servidor, en <code>/etc/draupnode/secretos/{project?.slug || '…'}/</code> (solo root).</p>
    {/if}
  </section>
{/if}

<style>
  .sec { padding: 12px 16px; margin: 14px 0; display: flex; flex-direction: column; gap: 10px; }
  .head { display: flex; gap: 12px; align-items: center; }
  .head > :global(svg) { color: var(--accent); flex: none; }
  .txt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; font-size: 13px; }
  .small { font-size: 12px; }
  .list { display: flex; flex-direction: column; gap: 8px; }
  .item { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
  .meta { display: flex; flex-direction: column; gap: 1px; font-size: 13px; }
  .val { display: flex; gap: 6px; align-items: center; }
  .k { font-size: 12px; color: var(--muted); width: 90px; flex: none; }
  .v { flex: 1; min-width: 0; font-family: var(--mono); font-size: 12.5px; background: var(--accent-soft); padding: 4px 8px; border-radius: 6px; overflow-wrap: anywhere; }
  code { font-family: var(--mono); }
</style>
