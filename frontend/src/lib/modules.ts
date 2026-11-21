// Reglas de los módulos que la interfaz aplica al instante, sin esperar al
// backend. Son las mismas que internal/modules (Catalog.Resolve y Clashes).
import type { Module } from './api'

type Lookup = (id: string) => Module | undefined

/** Orden de ejecución: ids ordenados y, delante de cada uno, sus dependencias
 *  y sus «after» que estén en el proyecto. */
export function orderModules(ids: Iterable<string>, byId: Lookup): string[] {
  const want = new Set(ids)
  const all = new Set<string>()
  const collect = (id: string) => {
    if (all.has(id)) return
    all.add(id)
    for (const d of byId(id)?.depends ?? []) collect(d)
  }
  want.forEach(collect)
  const out: string[] = []
  const seen = new Set<string>()
  const visit = (id: string, path: Set<string>) => {
    if (seen.has(id) || path.has(id)) return
    path.add(id)
    const m = byId(id)
    const prev = [...(m?.depends ?? []), ...(m?.after ?? []).filter((a) => all.has(a))].sort()
    for (const d of prev) visit(d, path)
    path.delete(id)
    seen.add(id)
    out.push(id)
  }
  for (const id of [...want].sort()) visit(id, new Set())
  return out
}

/** Módulos ya elegidos con los que choca mid (en cualquiera de los dos sentidos). */
export function clashesWith(mid: string, selected: Iterable<string>, byId: Lookup): string[] {
  const m = byId(mid)
  const out: string[] = []
  for (const other of selected) {
    if (other === mid) continue
    if (m?.conflicts?.includes(other) || byId(other)?.conflicts?.includes(mid)) out.push(other)
  }
  return out
}

/** Puertos que necesita abiertos un módulo con estos valores. */
export function modulePorts(m: Module | undefined, values: Record<string, unknown> | undefined): string[] {
  if (!m) return []
  const out = (m.firewallPorts ?? []).map(String)
  for (const name of m.firewallPortsFrom ?? []) {
    const n = Number(values?.[name])
    if (Number.isInteger(n) && n > 0) out.push(String(n))
  }
  return out
}

/** Estado de un módulo en la página del proyecto. */
export type CardState = 'installed' | 'left' | 'pending' | 'required' | 'clash' | 'none'

/** Compara opciones sin depender del orden de las claves. */
export function sameValues(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(norm)
      : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])]))
        : v
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b))
}

// Cortafuegos del proveedor de nube (fuera del servidor): dónde abrir los puertos.
const CLOUDS: Record<string, [string, string]> = {
  oracle: ['Oracle Cloud', 'la «Security List» de su VCN (Networking → Virtual Cloud Networks → la red → Security Lists → Add Ingress Rules)'],
  aws: ['AWS', 'el «Security Group» de la instancia (EC2 → Security Groups → Inbound rules)'],
  gcp: ['Google Cloud', 'las reglas de cortafuegos de su VPC (VPC network → Firewall)'],
  azure: ['Azure', 'el «Network Security Group» de la máquina (Networking → Inbound port rules)'],
  hetzner: ['Hetzner Cloud', 'su «Firewall» de Hetzner, si le has puesto uno'],
  digitalocean: ['DigitalOcean', 'su «Cloud Firewall», si le has puesto uno'],
  ovh: ['OVHcloud', 'su «Firewall Network», si lo tienes activado'],
  scaleway: ['Scaleway', 'su «Security Group»'],
  linode: ['Akamai/Linode', 'su «Cloud Firewall», si le has puesto uno'],
  vultr: ['Vultr', 'su «Firewall Group», si le has puesto uno'],
}

/** Aviso para abrir puertos en el cortafuegos del proveedor de nube. */
export function cloudHint(cloud: string | undefined, ports: string): string {
  const c = cloud ? CLOUDS[cloud] : undefined
  if (c) return `Este servidor está en ${c[0]}: abre también ${ports} en ${c[1]}. Es un cortafuegos aparte y Draupnode no puede tocarlo.`
  return `Si este servidor está en la nube (Oracle, AWS, Google, Azure, Hetzner…), abre también ${ports} en el cortafuegos del proveedor: es aparte y Draupnode no puede tocarlo.`
}
