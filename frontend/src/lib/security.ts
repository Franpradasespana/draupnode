// Nota de seguridad de un servidor (0-100) a partir de su ficha: una lista de
// comprobaciones con su peso, y para cada una que falle, cómo arreglarla.
// Pesa más lo que más protege (que no se pueda entrar con contraseña, el
// cortafuegos) que lo que solo informa (la revisión de Lynis).
import type { ServerOverview } from './api'
import { moduleName } from './state.svelte'
import { t } from './i18n.svelte'

export type CheckState = 'ok' | 'warn' | 'bad' | 'na'
export type SecFix =
  | { kind: 'module'; module: string; text: string }
  | { kind: 'upgrade' | 'reboot' | 'ports' | 'clamav'; text: string }
  | { kind: 'text'; text: string }
export interface SecCheck { id: string; title: string; state: CheckState; detail: string; weight: number; fix?: SecFix }

/** Puertos que se esperan abiertos al mundo (además del de SSH). */
const EXPECTED = new Set([80, 443, 51820])

export function securityChecks(ov: ServerOverview, installed: string[]): SecCheck[] {
  const h = ov.hardening ?? {}
  const has = (m: string) => installed.includes(m)
  const out: SecCheck[] = []
  const ssh = h.ssh
  // 1. SSH sin contraseñas
  if (ssh) {
    const pw = ssh.password || ssh.kbd
    out.push({ id: 'ssh-pass', weight: 15, title: t('SSH solo con clave'), state: pw ? 'bad' : 'ok',
      detail: pw ? t('se puede entrar con contraseña: los robots la prueban sin parar') : t('las contraseñas no sirven para entrar'),
      fix: pw ? (has('ssh') ? { kind: 'module', module: 'ssh', text: t('En «{0}», desmarca «Permitir entrar con contraseña» y aplica.', moduleName('ssh')) } : { kind: 'module', module: 'ssh', text: t('Añade el módulo «{0}» (por defecto, solo con clave).', moduleName('ssh')) }) : undefined })
    const root = ssh.root === 'yes'
    out.push({ id: 'ssh-root', weight: 10, title: t('root no entra con contraseña'), state: root ? (ssh.password ? 'bad' : 'warn') : 'ok',
      detail: root ? t('PermitRootLogin está en «yes»') : t('PermitRootLogin: {0}', ssh.root),
      fix: root ? { kind: 'module', module: 'ssh', text: t('En «{0}», elige «Entrar como root: no» (o «solo-con-clave»).', moduleName('ssh')) } : undefined })
  }
  // 2. Cortafuegos
  if (ov.firewall) {
    out.push({ id: 'firewall', weight: 15, title: t('Cortafuegos'), state: ov.firewall.active ? 'ok' : 'bad',
      detail: ov.firewall.active ? t('bloquea lo que no está permitido') : t('no bloquea nada: todo lo que escucha se ve desde Internet'),
      fix: ov.firewall.active ? undefined : { kind: 'module', module: 'firewall', text: t('Añade el módulo «{0}».', moduleName('firewall')) } })
  }
  // 3. Fuerza bruta
  const f2b = !!ov.security?.fail2ban
  const cs = !!h.crowdsec?.active
  out.push({ id: 'bruteforce', weight: 10, title: t('Bloqueo de ataques'), state: f2b || cs ? 'ok' : (ssh && !ssh.password ? 'warn' : 'bad'),
    detail: cs ? t('CrowdSec activo ({0} IPs bloqueadas ahora)', h.crowdsec?.decisions ?? 0) : f2b ? t('fail2ban activo ({0} IPs bloqueadas ahora)', ov.security?.fail2ban?.banned ?? 0) : t('ni fail2ban ni CrowdSec'),
    fix: f2b || cs ? undefined : { kind: 'module', module: 'crowdsec', text: t('Añade «{0}» o activa fail2ban en «{1}».', moduleName('crowdsec'), moduleName('ssh')) } })
  // 4. Actualizaciones
  if (h.autoUpdates !== undefined) {
    out.push({ id: 'autoupd', weight: 10, title: t('Actualizaciones de seguridad automáticas'), state: h.autoUpdates ? 'ok' : 'warn',
      detail: h.autoUpdates ? t('unattended-upgrades activado') : t('hay que instalarlas a mano'),
      fix: h.autoUpdates ? undefined : { kind: 'module', module: 'base', text: t('Aplica el módulo «{0}»: las activa.', moduleName('base')) } })
  }
  if (ov.updates) {
    const sec = ov.updates.security
    out.push({ id: 'secupd', weight: 10, title: t('Sin parches de seguridad pendientes'), state: sec ? (sec > 10 ? 'bad' : 'warn') : 'ok',
      detail: sec ? t('{0} actualizaciones de seguridad sin instalar', sec) : t('al día'),
      fix: sec ? { kind: 'upgrade', text: t('Instálalas ahora.') } : undefined })
    out.push({ id: 'reboot', weight: 5, title: t('Sin reinicio pendiente'), state: ov.updates.reboot ? 'warn' : 'ok',
      detail: ov.updates.reboot ? t('hay parches (del núcleo u otros) que no se usan hasta reiniciar') : t('no hace falta'),
      fix: ov.updates.reboot ? { kind: 'reboot', text: t('Reinicia cuando te venga bien.') } : undefined })
  }
  // 5. Puertos abiertos al mundo
  if (ov.ports) {
    const sshPort = ssh?.port ?? 22
    const fwOpen = new Set(ov.firewall?.tcp ?? [])
    const extra = ov.ports.filter((p) => p.public && p.proto.startsWith('tcp') && p.port !== sshPort && !EXPECTED.has(p.port) && (!ov.firewall?.active || fwOpen.has(String(p.port)) || p.process === 'docker-proxy'))
    const ports = [...new Set(extra.map((p) => p.port))]
    out.push({ id: 'ports', weight: 10, title: t('Solo los puertos necesarios'), state: ports.length ? (ports.length > 3 ? 'bad' : 'warn') : 'ok',
      detail: ports.length ? t('abiertos al mundo además de SSH, 80 y 443: {0}', ports.join(', ')) : t('SSH y web, nada más'),
      fix: ports.length ? { kind: 'ports', text: t('Mira en «Red y seguridad» quién escucha en cada uno; si no lo necesitas fuera, ciérralo en el cortafuegos o haz que escuche solo en 127.0.0.1.') } : undefined })
  }
  // 6. Revisiones (solo informan; sin ellas no se pierde nota, se recomiendan)
  const ly = h.lynis
  out.push(ly?.index != null
    ? { id: 'lynis', weight: 10, title: t('Revisión de Lynis'), state: ly.index >= 70 ? 'ok' : ly.index >= 55 ? 'warn' : 'bad', detail: t('índice {0}/100 · {1} avisos · {2} consejos', ly.index, ly.warnings, ly.suggestions),
      fix: ly.index < 70 ? { kind: 'text', text: t('Lee el informe (/var/lib/draupnode/lynis/informe.txt): empieza por los avisos.') } : undefined }
    : { id: 'lynis', weight: 0, title: t('Revisión de Lynis'), state: 'na', detail: has('lynis') ? t('aún no hay informe') : t('sin revisar'), fix: has('lynis') ? undefined : { kind: 'module', module: 'lynis', text: t('Añade «{0}» para revisar el sistema cada semana.', moduleName('lynis')) } })
  const tr = h.trivy
  out.push(tr
    ? { id: 'trivy', weight: 5, title: t('Vulnerabilidades en los contenedores'), state: tr.vulns === 0 ? 'ok' : tr.vulns > 20 ? 'bad' : 'warn', detail: t('{0} en {1} imágenes (Trivy)', tr.vulns, tr.images),
      fix: tr.vulns ? { kind: 'text', text: t('Actualiza las imágenes (pantalla «Actualizaciones») y mira el informe de Trivy.') } : undefined }
    : { id: 'trivy', weight: 0, title: t('Vulnerabilidades en los contenedores'), state: 'na', detail: ov.docker ? t('sin revisar') : t('sin Docker'), fix: ov.docker && !has('trivy') ? { kind: 'module', module: 'trivy', text: t('Añade «{0}».', moduleName('trivy')) } : undefined })
  if (h.clamav) {
    out.push({ id: 'clamav', weight: 10, title: t('Antivirus (ClamAV)'), state: h.clamav.found ? 'bad' : 'ok',
      detail: h.clamav.found ? t('{0} fichero(s) sospechoso(s): {1}', h.clamav.found, h.clamav.files.join(', ')) : t('nada sospechoso'),
      fix: h.clamav.found ? { kind: 'clamav', text: t('Revisa esos ficheros (lista completa en /var/lib/draupnode/clamav/encontrado.txt).') } : undefined })
  }
  if (h.aide && h.aide.differences !== null) {
    out.push({ id: 'aide', weight: 5, title: t('Ficheros del sistema sin cambios (AIDE)'), state: h.aide.differences ? 'warn' : 'ok',
      detail: h.aide.differences ? t('AIDE ha visto cambios: si no los hiciste tú (ni una actualización), investiga') : t('sin cambios'),
      fix: h.aide.differences ? { kind: 'text', text: t('Mira /var/log/aide/aide.log.') } : undefined })
  }
  return out
}

/** Nota de 0 a 100 (null si no hay con qué calcularla). */
export function securityScore(checks: SecCheck[]): number | null {
  const used = checks.filter((c) => c.state !== 'na' && c.weight > 0)
  const total = used.reduce((n, c) => n + c.weight, 0)
  if (!total) return null
  const got = used.reduce((n, c) => n + (c.state === 'ok' ? c.weight : c.state === 'warn' ? c.weight / 2 : 0), 0)
  return Math.round((got / total) * 100)
}

export const scoreLevel = (n: number | null) => (n === null ? '' : n >= 80 ? 'ok' : n >= 55 ? 'warn' : 'bad')
