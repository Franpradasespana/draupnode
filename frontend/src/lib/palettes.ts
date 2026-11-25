import { t as tr } from './i18n.svelte'
// Paletas de Draupnode.
// Las 12 primeras salen de las láminas «Paletas de color para DvergNode»
// (DEV/1 IMAGENES/Draupnode). Las 3 últimas son nuevas.
// Cada paleta tiene los mismos 10 colores, en el mismo orden que en las láminas.

export interface Colors {
  bg: string       // fondo general
  sidebar: string  // barra lateral y barra superior
  panel: string    // tarjetas y paneles
  border: string   // bordes y separadores
  accent: string   // botón principal, barra de progreso, selección
  accent2: string  // cifras destacadas, acento secundario
  text: string     // texto principal
  muted: string    // texto secundario
  success: string  // estado correcto / en marcha
  danger: string   // error / parado
}

export interface Palette {
  id: string
  name: string
  tag: string
  mode: 'dark' | 'light' | 'mixed'
  colors: Colors
  custom?: boolean
}

export const COLOR_KEYS: { key: keyof Colors; label: string }[] = [
  { key: 'bg', label: tr('Fondo') },
  { key: 'sidebar', label: tr('Barra lateral') },
  { key: 'panel', label: tr('Paneles') },
  { key: 'border', label: tr('Bordes') },
  { key: 'accent', label: tr('Acento') },
  { key: 'accent2', label: tr('Acento 2') },
  { key: 'text', label: tr('Texto') },
  { key: 'muted', label: tr('Texto secundario') },
  { key: 'success', label: tr('Correcto') },
  { key: 'danger', label: tr('Error') },
]

const p = (id: string, name: string, tag: string, mode: Palette['mode'], hex: string[]): Palette => {
  const [bg, sidebar, panel, border, accent, accent2, text, muted, success, danger] = hex.map((h) => '#' + h)
  return { id, name, tag, mode, colors: { bg, sidebar, panel, border, accent, accent2, text, muted, success, danger } }
}

export const BUILTIN_PALETTES: Palette[] = [
  // Nuevas
  p('draupnir-gold', tr('Draupnir Gold'), tr('El anillo de oro · por defecto'), 'dark',
    ['0E0D0B', '15130F', '1D1A15', '3A3328', 'E3B04B', 'F2CF7A', 'F3EDE1', 'A79E8C', '6CC48A', 'E5675C']),
  p('muspelheim', tr('Muspelheim'), tr('Reino de fuego'), 'dark',
    ['140C0C', '1C1111', '261716', '462A26', 'FF6A3D', 'FFB347', 'F7E9E4', 'B5958D', '66C98A', 'F0507A']),
  p('niflheim', tr('Niflheim'), tr('Reino de hielo · claro'), 'light',
    ['EEF3F7', 'E2EAF1', 'FFFFFF', 'C8D5E1', '3A6EA5', '2B8FB8', '0F1B2A', '56677A', '2E9E6B', 'C93D4A']),
  // Lámina I
  p('obsidian-forge', tr('Obsidian Forge'), tr('DevOps industrial'), 'dark',
    ['111318', '181B22', '20242D', '303642', 'F28C45', 'FF9F5C', 'E8EAF0', '929AAA', '45C486', 'EF6262']),
  p('nordic-frost', tr('Nordic Frost'), tr('Mitología nórdica'), 'dark',
    ['0D141C', '131E29', '1C2B39', '304455', '79C9E8', '65D6C4', 'E5F0F6', '8DA6B8', '65C995', 'E76F78']),
  p('olympus', tr('Olympus'), tr('Mitología griega'), 'dark',
    ['11101A', '191727', '242137', '39334F', 'D6AE62', '9B83E8', 'F0EDF7', 'A29BB8', '65C995', 'E87985']),
  p('cyber-terminal', tr('Cyber Terminal'), tr('Hacker / terminal'), 'dark',
    ['090D0B', '101713', '151F19', '26382C', '70E08A', '318B55', 'E0F2E4', '82988A', '70E08A', 'ED6868']),
  p('graphite-blue', tr('Graphite Blue'), tr('SaaS profesional'), 'dark',
    ['11151D', '171E29', '202A38', '303D4F', '528BFF', '82ABFF', 'EDF2FA', '9AA9BD', '4CCB91', 'F16D75']),
  p('ember-steel', tr('Ember & Steel'), tr('Forja mitológica'), 'dark',
    ['121212', '1B1A19', '252321', '403A34', 'C47A48', 'E6A653', 'F0ECE6', 'A69C90', '79B88A', 'D76D60']),
  // Lámina II
  p('fjord-light', tr('Fjord Light'), tr('Nórdico claro'), 'light',
    ['F4F7FA', 'E9EEF3', 'FFFFFF', 'D3DCE5', '2F7FB8', '2A9D96', '1A2633', '5C6B7A', '2E9E6B', 'D64550']),
  p('runestone-parchment', tr('Runestone Parchment'), tr('Pergamino / rúnico'), 'light',
    ['F5F0E8', 'EBE3D6', 'FFFDF9', 'D9CDBB', 'B5562A', '8C6A3E', '2B241C', '6E6356', '4F8F5B', 'C2453B']),
  p('cloud-indigo', tr('Cloud Indigo'), tr('SaaS claro'), 'light',
    ['F7F8FA', 'FFFFFF', 'FFFFFF', 'E2E5EA', '5B5BD6', '7C7CE8', '16181D', '646B78', '1F9D6B', 'E04B4B']),
  p('sand-slate', tr('Sand & Slate'), tr('Mixto: barra lateral oscura'), 'mixed',
    ['F3F1EC', '23272E', 'FFFFFF', 'DEDAD2', 'E07A2E', '2D6A8F', '1E2229', '6B6F78', '2E9E6B', 'D64550']),
  p('midgard-moss', tr('Midgard Moss'), tr('Bosque oscuro'), 'dark',
    ['10150F', '161D15', '1F281D', '34412F', 'A3C163', 'D9B45A', 'E9EEDF', '98A38C', '7CC27A', 'E06C5F']),
  p('aurora-borealis', tr('Aurora Borealis'), tr('Oscuro vibrante'), 'dark',
    ['0F1020', '15172B', '1E2140', '333863', 'C77DFF', '5EE0C8', 'ECEBFA', '9A9CC0', '5EE0A0', 'FF6B81']),
]

export const DEFAULT_PALETTE_ID = 'draupnir-gold'

// ---- utilidades de color -------------------------------------------------

export function isHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v)
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

export function alpha(hex: string, a: number): string {
  const [r, g, b] = rgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export function mix(a: string, b: string, t: number): string {
  const A = rgb(a)
  const B = rgb(b)
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t))
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** Elige el color de texto más legible sobre un fondo. */
export function readableOn(bgHex: string, light = '#FFFFFF', dark = '#111111'): string {
  return contrast(bgHex, light) >= contrast(bgHex, dark) ? light : dark
}

/** Variables CSS derivadas de una paleta. */
export function cssVars(c: Colors): Record<string, string> {
  const sidebarDark = luminance(c.sidebar) < 0.2
  const sidebarText = contrast(c.sidebar, c.text) >= 4.5 ? c.text : (sidebarDark ? '#ECEEF2' : '#16181D')
  const sidebarMuted = contrast(c.sidebar, c.muted) >= 3 ? c.muted : mix(sidebarText, c.sidebar, 0.4)
  const isDark = luminance(c.bg) < 0.2
  return {
    '--bg': c.bg,
    '--sidebar': c.sidebar,
    '--panel': c.panel,
    '--panel-2': mix(c.panel, c.bg, 0.5),
    '--border': c.border,
    '--border-soft': alpha(c.border, 0.6),
    '--accent': c.accent,
    '--accent-2': c.accent2,
    '--accent-soft': alpha(c.accent, isDark ? 0.14 : 0.1),
    '--on-accent': readableOn(c.accent),
    '--text': c.text,
    '--muted': c.muted,
    '--success': c.success,
    '--success-soft': alpha(c.success, 0.14),
    '--danger': c.danger,
    '--danger-soft': alpha(c.danger, 0.14),
    // Fijos (no van en la paleta): azul = se instalará, ámbar = lo necesita otro módulo.
    '--info': isDark ? '#60a5fa' : '#2563eb',
    '--info-soft': alpha(isDark ? '#60a5fa' : '#2563eb', 0.14),
    '--warning': isDark ? '#fbbf24' : '#b45309',
    '--warning-soft': alpha(isDark ? '#fbbf24' : '#d97706', 0.16),
    '--on-danger': readableOn(c.danger),
    '--sidebar-text': sidebarText,
    '--sidebar-muted': sidebarMuted,
    '--sidebar-hover': alpha(sidebarText, 0.06),
    '--shadow': isDark ? '0 8px 30px rgba(0,0,0,.45)' : '0 8px 30px rgba(20,30,50,.12)',
    'color-scheme': isDark ? 'dark' : 'light',
  }
}

export function applyPalette(c: Colors, el: HTMLElement = document.documentElement) {
  for (const [k, v] of Object.entries(cssVars(c))) el.style.setProperty(k, v)
}
