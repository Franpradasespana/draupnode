// Icono de cada módulo (los que no tienen uno propio, una caja).
import { Shield, KeyRound, Container, Rocket, Database, DatabaseBackup, ServerCog, Package } from '@lucide/svelte'

const ICONS: Record<string, typeof Package> = { base: ServerCog, firewall: Shield, ssh: KeyRound, docker: Container, coolify: Rocket, postgres: Database, backups: DatabaseBackup }

export function moduleIcon(id: string): typeof Package {
  return ICONS[id] ?? Package
}
