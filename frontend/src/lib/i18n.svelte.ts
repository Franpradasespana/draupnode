// Idioma de la interfaz (español ⇄ inglés).
//
// El español es el idioma del código: cada texto visible se escribe en
// español dentro de t('…') y, en inglés, se busca en locales/en.json
// («texto en español» → «English text»). Si falta, sale en español.
// Los huecos se marcan {0}, {1}… y se rellenan con los argumentos:
//   t('Aplicada en {0}', nombre)
import EN from '../locales/en.json'

export type Lang = 'es' | 'en'
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'es', label: 'Español' },
  { id: 'en', label: 'English' },
]

export const i18n = $state({ lang: 'es' as Lang })
const en = EN as Record<string, string>

export function normalizeLang(l?: string | null): Lang | null {
  const v = (l ?? '').toLowerCase()
  if (v.startsWith('es')) return 'es'
  if (v.startsWith('en')) return 'en'
  return null
}

/** Idioma del navegador o del sistema: español si lo es; si no, inglés. */
export function systemLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator.languages?.[0] ?? navigator.language : ''
  return normalizeLang(nav) === 'es' ? 'es' : 'en'
}

export function setLang(l?: string | null) {
  i18n.lang = normalizeLang(l) ?? systemLang()
  if (typeof document !== 'undefined') document.documentElement.lang = i18n.lang
}

/** Traduce un texto escrito en español y rellena sus huecos {0}, {1}… */
export function t(s: string, ...args: unknown[]): string {
  let out = i18n.lang === 'en' ? en[s] || s : s
  if (args.length) out = out.replace(/\{(\d+)\}/g, (m, i) => (+i < args.length ? String(args[+i]) : m))
  return out
}

/** Para Intl y toLocale…: «es-ES» o «en-GB» (fechas día/mes/año en los dos). */
export function locale(): string {
  return i18n.lang === 'en' ? 'en-GB' : 'es-ES'
}

/** «1 módulo» / «3 módulos» (las dos formas se escriben en español). */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${t(n === 1 ? one : many)}`
}

/** Duración corta: «5 min», «3 h», «2 días». */
export function shortDuration(seconds: number): string {
  const s = Math.max(0, seconds)
  if (s < 3600) return t('{0} min', Math.max(1, Math.round(s / 60)))
  if (s < 172800) return t('{0} h', Math.round(s / 3600))
  return t('{0} días', Math.round(s / 86400))
}

/** «hace 5 min», «hace 3 h», «hace 2 días». */
export function agoText(seconds: number): string {
  return t('hace {0}', shortDuration(seconds))
}
