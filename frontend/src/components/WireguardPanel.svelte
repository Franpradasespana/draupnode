<script lang="ts">
  // VPN WireGuard: la configuración de cada dispositivo, con su QR (para la
  // app del móvil) y para guardarla como .conf. Está en la bóveda: hay que
  // escribir su contraseña cada vez y se oculta sola.
  import { onDestroy } from 'svelte'
  import { Shield, Download, Copy, Lock, QrCode } from '@lucide/svelte'
  import qrcode from 'qrcode-generator'
  import { api, errorText, type Project, type ProjectSecret } from '../lib/api'
  import { ask, toast } from '../lib/state.svelte'

  let { project }: { project: Project } = $props()
  const HIDE_AFTER_MS = 3 * 60 * 1000

  const vals = $derived(project.installedValues?.wireguard ?? {})
  let list = $state<ProjectSecret[] | null>(null)
  let busy = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  function hide() {
    list = null
    clearTimeout(timer)
  }
  onDestroy(hide)

  async function open() {
    const master = await ask('Dispositivos de la VPN', 'Sus configuraciones llevan su clave privada: escribe la contraseña de la bóveda para verlas.', 'Contraseña de la bóveda')
    if (master === null) return
    busy = true
    try {
      const all = await api.ProjectSecrets(project.id, master)
      list = all.filter((s) => s.kind === 'generated' && /^wireguard_.+\.conf$/.test(s.name))
      if (!list.length) toast('Aún no hay configuraciones: pulsa Aplicar para generarlas.', 'error')
      clearTimeout(timer)
      timer = setTimeout(hide, HIDE_AFTER_MS)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      busy = false
    }
  }

  const device = (s: ProjectSecret) => s.name.replace(/^wireguard_/, '').replace(/\.conf$/, '')
  function qr(text: string): string {
    const q = qrcode(0, 'M')
    q.addData(text)
    q.make()
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
  }
  async function save(s: ProjectSecret) {
    try {
      const p = await api.SaveTextFile(`${project.slug || 'vpn'}-${device(s)}.conf`, s.value)
      if (p) toast('Guardado en ' + p)
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  async function copy(t: string) {
    try {
      await navigator.clipboard.writeText(t)
      toast('Copiado')
    } catch {
      toast('No se pudo copiar', 'error')
    }
  }
</script>

<section class="card wg">
  <div class="head">
    <Shield size={18} />
    <div class="txt">
      <strong>Dispositivos de la VPN</strong>
      <span class="muted">Puerto {vals.wireguard_port ?? 51820}/udp · red {vals.wireguard_network ?? '10.8.0.0/24'}{vals.wireguard_route_all ? ' · todo el tráfico por la VPN' : ''}</span>
    </div>
    {#if list}
      <button class="btn sm" onclick={hide}><Lock size={14} /> Ocultar</button>
    {:else}
      <button class="btn sm" onclick={open} disabled={busy}><QrCode size={14} /> Ver configuraciones</button>
    {/if}
  </div>
  {#if list}
    <p class="muted small">En el móvil: app WireGuard → «+» → «Escanear código QR». En el ordenador: guarda el .conf e impórtalo en WireGuard. No lo compartas: quien lo tenga entra en tu VPN.</p>
    <div class="peers">
      {#each list as s (s.name)}
        <div class="peer">
          <div class="qr" aria-label={'QR de ' + device(s)}>{@html qr(s.value)}</div>
          <div class="info">
            <strong>{device(s)}</strong>
            <div class="btns">
              <button class="btn sm" onclick={() => save(s)}><Download size={14} /> Guardar .conf</button>
              <button class="btn sm ghost" onclick={() => copy(s.value)}><Copy size={14} /> Copiar</button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .wg { padding: 12px 16px; margin: 14px 0; display: flex; flex-direction: column; gap: 10px; }
  .head { display: flex; gap: 12px; align-items: center; }
  .head > :global(svg) { color: var(--accent); flex: none; }
  .txt { display: flex; flex-direction: column; gap: 2px; font-size: 13px; flex: 1; min-width: 0; }
  .small { font-size: 12.5px; margin: 0; }
  .peers { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .peer { display: flex; gap: 12px; align-items: center; border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 10px; }
  /* El QR siempre negro sobre blanco (en tema oscuro también), para que lo lea la cámara. */
  .qr { width: 132px; height: 132px; flex: none; background: #fff; border-radius: 6px; padding: 4px; }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  .info { display: flex; flex-direction: column; gap: 8px; }
  .btns { display: flex; gap: 6px; flex-wrap: wrap; }
</style>
