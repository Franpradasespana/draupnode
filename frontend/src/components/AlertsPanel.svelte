<script lang="ts">
  // Alertas al móvil: suscribirse en ntfy (QR), mandar un aviso de prueba y
  // ver qué problemas ve ahora el servidor.
  import { onDestroy } from 'svelte'
  import { BellRing, Send, Activity, QrCode, Copy, Lock, LoaderCircle, CircleCheck, CircleX } from '@lucide/svelte'
  import qrcode from 'qrcode-generator'
  import { api, errorText, type AlertsResult, type Project } from '../lib/api'
  import { ask, toast, ui } from '../lib/state.svelte'
  import { withConnection } from '../lib/connect'
  import { t as tr } from '../lib/i18n.svelte'

  let { project, disabled = false }: { project: Project; disabled?: boolean } = $props()

  const server = $derived(ui.servers.find((s) => s.id === project.serverId))
  const vals = $derived(project.installedValues?.alerts ?? {})
  const channel = $derived(String(vals.alerts_channel ?? 'ntfy'))
  let busy = $state<'' | 'prueba' | 'estado' | 'tema'>('')
  let out = $state<{ ok: boolean; text: string; what: string } | null>(null)
  let topicUrl = $state('')
  let timer: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => clearTimeout(timer))

  async function run(what: 'prueba' | 'estado') {
    busy = what
    out = null
    try {
      const r = await withConnection<AlertsResult>(server, (s, a, u) => api.AlertsRun(project.id, what, s, a, u))
      if (!r) return
      if (r.status !== 'ok') return toast(r.message || tr('No se pudo'), 'error')
      // «Qué ve ahora» sale bien aunque vea problemas: se pinta como aviso si los hay.
      out = { ok: r.ok && (what === 'prueba' || (r.output ?? '').trim() === 'Sin problemas.'), text: r.output ?? '', what }
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      busy = ''
    }
  }

  async function subscribe() {
    const master = await ask(tr('Suscribirse a las alertas'), tr('El nombre del tema es secreto (quien lo sepa puede leer los avisos): escribe la contraseña de la bóveda para verlo.'), tr('Contraseña de la bóveda'))
    if (master === null) return
    busy = 'tema'
    try {
      const all = await api.ProjectSecrets(project.id, master)
      const t = all.find((s) => s.name === 'alerts_ntfy_topic')
      if (!t) return toast(tr('Aún no hay tema: pulsa Aplicar para generarlo.'), 'error')
      topicUrl = String(vals.alerts_ntfy_server ?? 'https://ntfy.sh').replace(/\/+$/, '') + '/' + t.value.trim()
      clearTimeout(timer)
      timer = setTimeout(() => (topicUrl = ''), 3 * 60 * 1000)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      busy = ''
    }
  }

  function qr(text: string): string {
    const q = qrcode(0, 'M')
    q.addData(text)
    q.make()
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
  }
  async function copy(t: string) {
    try {
      await navigator.clipboard.writeText(t)
      toast(tr('Copiado'))
    } catch {
      toast(tr('No se pudo copiar'), 'error')
    }
  }
</script>

<section class="card al">
  <div class="head">
    <BellRing size={18} />
    <div class="txt">
      <strong>{tr('Alertas')}</strong>
      <span class="muted">{tr('Por {0}, cada {1} min{2}.', channel === 'telegram' ? tr('Telegram') : 'ntfy', vals.alerts_interval_min ?? 5, vals.alerts_daily ? tr(' · aviso diario a las 9:00') : '')}</span>
    </div>
  </div>
  <div class="btns">
    <button class="btn sm" onclick={() => run('prueba')} disabled={disabled || !!busy}>
      {#if busy === 'prueba'}<LoaderCircle size={14} class="spin" />{:else}<Send size={14} />{/if} {tr('Enviar aviso de prueba')}
    </button>
    <button class="btn sm" onclick={() => run('estado')} disabled={disabled || !!busy}>
      {#if busy === 'estado'}<LoaderCircle size={14} class="spin" />{:else}<Activity size={14} />{/if} {tr('Qué ve ahora')}
    </button>
    {#if channel === 'ntfy'}
      {#if topicUrl}
        <button class="btn sm" onclick={() => (topicUrl = '')}><Lock size={14} /> {tr('Ocultar el tema')}</button>
      {:else}
        <button class="btn sm" onclick={subscribe} disabled={!!busy}><QrCode size={14} /> {tr('Suscribirse en el móvil')}</button>
      {/if}
    {/if}
  </div>
  {#if out}
    <div class="out" class:bad={!out.ok}>
      <div class="out-t">{#if out.ok}<CircleCheck size={14} />{:else}<CircleX size={14} />{/if} {out.what === 'prueba' ? (out.ok ? tr('Enviado: mira el móvil') : tr('No se pudo enviar')) : out.ok ? tr('Todo bien ahora mismo') : tr('Problemas que ve ahora el servidor')}</div>
      <pre class="selectable">{out.text}</pre>
    </div>
  {/if}
  {#if topicUrl}
    <div class="sub">
      <div class="qr">{@html qr(topicUrl)}</div>
      <div class="col">
        <p>{tr('En la app')} <strong>ntfy</strong> {tr('(Android, iPhone o el navegador): «+» → «Suscribirse a un tema», con este tema{0}. O escanea el QR con la cámara.', String(vals.alerts_ntfy_server ?? 'https://ntfy.sh') !== 'https://ntfy.sh' ? tr(' y tu servidor') : '')}</p>
        <div class="cmd"><code class="selectable">{topicUrl}</code><button class="btn icon sm ghost" title={tr('Copiar')} onclick={() => copy(topicUrl)}><Copy size={14} /></button></div>
      </div>
    </div>
  {/if}
</section>

<style>
  .al { padding: 12px 16px; margin: 14px 0; display: flex; flex-direction: column; gap: 10px; }
  .head { display: flex; gap: 12px; align-items: center; }
  .head > :global(svg) { color: var(--accent); flex: none; }
  .txt { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
  .btns { display: flex; gap: 8px; flex-wrap: wrap; }
  .out { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; }
  .out.bad { border-color: color-mix(in srgb, var(--danger) 50%, var(--border)); }
  .out-t { display: flex; gap: 6px; align-items: center; font-size: 13px; font-weight: 600; color: var(--success); }
  .out.bad .out-t { color: var(--danger); }
  .out pre { margin: 6px 0 0; font-family: var(--mono); font-size: 12px; white-space: pre-wrap; }
  .sub { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
  .qr { width: 132px; height: 132px; flex: none; background: #fff; border-radius: 6px; padding: 4px; }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  .col { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 220px; font-size: 13px; }
  .col p { margin: 0; }
  .cmd { display: flex; align-items: center; gap: 6px; background: var(--panel-2); border: 1px solid var(--border-soft); border-radius: 6px; padding: 4px 4px 4px 10px; }
  .cmd code { flex: 1; overflow-x: auto; white-space: nowrap; font-family: var(--mono); font-size: 12px; }
</style>
