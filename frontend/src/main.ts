import './app.css'
import { mount } from 'svelte'
import { setLang } from './lib/i18n.svelte'

// El idioma se fija ANTES de cargar el resto: así los textos que se calculan
// al cargar cada fichero (listas de la ayuda, datos de la demo…) salen ya en
// el idioma elegido. Por eso la app se importa después, no arriba.
async function readLang(): Promise<string | null> {
  const go = (window as any).go?.app?.App
  if (go) {
    try { return (await go.GetSettings()).language ?? null } catch { return null }
  }
  // Demo en el navegador: ?lang=en manda; si no, lo guardado por la demo.
  const q = new URLSearchParams(location.search).get('lang')
  if (q) return q
  try { return JSON.parse(localStorage.getItem('draupnode-mock2-settings') ?? 'null')?.language ?? null } catch { return null }
}

async function start() {
  setLang(await readLang())
  const { default: App } = await import('./App.svelte')
  mount(App, { target: document.getElementById('app')! })
}

start()
