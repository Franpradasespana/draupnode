// Asistente «¿Qué quieres montar?»: cada objetivo trae sus módulos. Lo básico
// de cualquier servidor (sistema, cortafuegos, SSH seguro, copias) se propone
// siempre, marcado; el usuario puede quitarlo.
import type { Module } from './api'
import { clashesWith } from './modules'
import { t } from './i18n.svelte'

export interface Goal {
  id: string
  icon: string // nombre de un icono de Lucide (ver SetupWizard)
  title: string
  text: string
  modules: string[]
}

export const BASICS = ['base', 'firewall', 'ssh', 'chrony', 'backups']

export function goals(): Goal[] {
  return [
    { id: 'web', icon: 'globe', title: t('Mis webs y apps con mi dominio'), text: t('Tu app desde Git o desde una carpeta, con HTTPS automático (Caddy).'), modules: ['docker', 'caddy', 'git-app'] },
    { id: 'paas', icon: 'rocket', title: t('Un panel para desplegar desde GitHub'), text: t('Coolify: como Heroku o Vercel, pero en tu servidor.'), modules: ['coolify'] },
    { id: 'cloud', icon: 'cloud', title: t('Mi nube'), text: t('Nextcloud: archivos, calendario y contactos sincronizados.'), modules: ['nextcloud'] },
    { id: 'passwords', icon: 'key', title: t('Gestor de contraseñas'), text: t('Vaultwarden, compatible con las apps de Bitwarden.'), modules: ['vaultwarden'] },
    { id: 'photos', icon: 'image', title: t('Fotos y vídeos del móvil'), text: t('Immich: copia automática, álbumes y búsqueda (pide 4 GB de RAM).'), modules: ['immich'] },
    { id: 'media', icon: 'film', title: t('Películas, series y música'), text: t('Jellyfin y Navidrome.'), modules: ['jellyfin', 'navidrome'] },
    { id: 'vpn', icon: 'shield', title: t('VPN y sin anuncios'), text: t('WireGuard para entrar a tu red y AdGuard Home para quitar la publicidad.'), modules: ['wireguard', 'adguard'] },
    { id: 'docs', icon: 'file', title: t('Mis papeles en digital'), text: t('Paperless-ngx: escanea, lee el texto y archiva.'), modules: ['paperless'] },
    { id: 'git', icon: 'git', title: t('Mi propio GitHub'), text: t('Forgejo: repositorios, incidencias y revisiones, con sus Actions (Forgejo Runner).'), modules: ['forgejo', 'forgejo-runner'] },
    { id: 'ai', icon: 'bot', title: t('IA en mi servidor'), text: t('Ollama con una web para chatear, sin mandar nada fuera (pide 4 GB de RAM).'), modules: ['ollama'] },
    { id: 'home', icon: 'house', title: t('Domótica'), text: t('Home Assistant: luces, enchufes y sensores, sin la nube del fabricante.'), modules: ['home-assistant'] },
    { id: 'reading', icon: 'book', title: t('Leer y escuchar'), text: t('FreshRSS para tus noticias y Audiobookshelf para audiolibros y pódcasts.'), modules: ['freshrss', 'audiobookshelf'] },
    { id: 'mesh', icon: 'network', title: t('Red privada entre mis equipos'), text: t('Headscale: tus equipos conectados entre sí con las apps de Tailscale.'), modules: ['headscale'] },
    { id: 'sso', icon: 'lock', title: t('Una puerta delante de mis apps'), text: t('Authelia: inicio de sesión con doble factor antes de entrar (con Caddy).'), modules: ['caddy', 'authelia'] },
    { id: 'watch', icon: 'activity', title: t('Vigilar el servidor'), text: t('Grafana con métricas y avisos al móvil cuando algo va mal.'), modules: ['monitoring', 'alerts'] },
    { id: 'k8s', icon: 'boxes', title: t('Kubernetes'), text: t('k3s con Helm y Argo CD.'), modules: ['k3s', 'argocd'] },
  ]
}

export interface Plan {
  ids: string[] // en el orden en que se añadieron (las dependencias, antes)
  dropped: { id: string; because: string }[] // quitados por chocar con otro
  ramMb: number // la mayor RAM mínima que piden
}

/** Junta los módulos de los objetivos y lo básico, con sus dependencias y sin choques. */
export function plan(goalIds: string[], basics: string[], byId: (id: string) => Module | undefined): Plan {
  const ids: string[] = []
  const dropped: Plan['dropped'] = []
  const add = (id: string) => {
    const m = byId(id)
    if (!m || ids.includes(id)) return
    const clash = clashesWith(id, ids, byId)
    if (clash.length) {
      dropped.push({ id, because: clash[0] })
      return
    }
    for (const d of m.depends ?? []) add(d)
    ids.push(id)
  }
  const wanted = goals().filter((g) => goalIds.includes(g.id)).flatMap((g) => g.modules)
  // Primero lo que se ha pedido (así Coolify gana a Caddy si se piden los dos), luego lo básico.
  for (const id of wanted.includes('coolify') ? ['coolify', ...wanted] : wanted) add(id)
  for (const id of basics) add(id)
  const ramMb = Math.max(0, ...ids.map((id) => byId(id)?.requires?.minRamMb ?? 0))
  return { ids, dropped, ramMb }
}
