// Llamadas al backend que necesitan conectar con un servidor: si responde que
// falta algo (contraseña de la clave, huella nueva, sudo, bóveda), se pide al
// usuario y se reintenta. Devuelve la respuesta final o null si se cancela.
import type { RunStart, Server } from './api'
import { ask, confirmDialog, requestVault } from './state.svelte'
import { t } from './i18n.svelte'

type Reply = Pick<RunStart, 'status' | 'message' | 'secretKind' | 'keyType' | 'fingerprint'>
const ASKS = new Set(['needs_secret', 'bad_secret', 'vault_locked', 'vault_missing', 'unknown_host', 'needs_sudo', 'bad_sudo'])

export async function withConnection<T extends Reply>(server: Server | undefined, call: (secret: string, accept: string, sudo: string) => Promise<T>): Promise<T | null> {
  let secret = '', accept = '', sudo = ''
  for (let i = 0; i < 6; i++) {
    const r = await call(secret, accept, sudo)
    if (!ASKS.has(r.status)) return r
    switch (r.status) {
      case 'needs_secret':
      case 'bad_secret': {
        const isPw = r.secretKind === 'password'
        const v = await ask(isPw ? t('Contraseña del usuario') : t('Contraseña de la clave'),
          (r.status === 'bad_secret' ? t('No es correcta. ') : '') + (isPw ? t('Contraseña de {0} en {1}.', server?.user, server?.name) : t('La clave SSH de {0} está protegida.', server?.name)))
        if (v === null) return null
        secret = v
        break
      }
      case 'vault_locked':
        if (!(await requestVault('unlock', r.message || t('La contraseña de este servidor está en la bóveda.')))) return null
        break
      case 'vault_missing':
        if (!(await requestVault('create', r.message || t('Las contraseñas de este servidor se guardan en la bóveda cifrada.')))) return null
        break
      case 'unknown_host': {
        const ok = await confirmDialog({
          title: t('Servidor nuevo: confirma su huella'),
          message: t('Es la primera vez que te conectas a este servidor (o ha cambiado de puerto). Comprueba que la huella es la suya antes de confiar.'),
          detail: `${server?.host}:${server?.port}
${r.keyType}
${r.fingerprint}`,
          confirmLabel: t('Confiar y seguir'),
        })
        if (!ok) return null
        accept = r.fingerprint!
        break
      }
      case 'needs_sudo':
      case 'bad_sudo': {
        const v = await ask(t('Contraseña de sudo'),
          (r.status === 'bad_sudo' ? t('No es correcta. ') : '') + t('El usuario {0} necesita su contraseña para hacerse administrador (sudo). No se guarda.', server?.user))
        if (v === null) return null
        sudo = v
        break
      }
    }
  }
  return null
}
