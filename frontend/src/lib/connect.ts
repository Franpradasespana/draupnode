// Llamadas al backend que necesitan conectar con un servidor: si responde que
// falta algo (contraseña de la clave, huella nueva, sudo, bóveda), se pide al
// usuario y se reintenta. Devuelve la respuesta final o null si se cancela.
import type { RunStart, Server } from './api'
import { ask, confirmDialog, requestVault } from './state.svelte'

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
        const v = await ask(isPw ? 'Contraseña del usuario' : 'Contraseña de la clave',
          (r.status === 'bad_secret' ? 'No es correcta. ' : '') + (isPw ? `Contraseña de ${server?.user} en ${server?.name}.` : `La clave SSH de ${server?.name} está protegida.`))
        if (v === null) return null
        secret = v
        break
      }
      case 'vault_locked':
        if (!(await requestVault('unlock', r.message || 'La contraseña de este servidor está en la bóveda.'))) return null
        break
      case 'vault_missing':
        if (!(await requestVault('create', r.message || 'Las contraseñas de este proyecto se guardan en la bóveda cifrada.'))) return null
        break
      case 'unknown_host': {
        const ok = await confirmDialog({
          title: 'Servidor nuevo: confirma su huella',
          message: 'Es la primera vez que te conectas a este servidor (o ha cambiado de puerto). Comprueba que la huella es la suya antes de confiar.',
          detail: `${server?.host}:${server?.port}\n${r.keyType}\n${r.fingerprint}`,
          confirmLabel: 'Confiar y seguir',
        })
        if (!ok) return null
        accept = r.fingerprint!
        break
      }
      case 'needs_sudo':
      case 'bad_sudo': {
        const v = await ask('Contraseña de sudo',
          (r.status === 'bad_sudo' ? 'No es correcta. ' : '') + `El usuario ${server?.user} necesita su contraseña para hacerse administrador (sudo). No se guarda.`)
        if (v === null) return null
        sudo = v
        break
      }
    }
  }
  return null
}
