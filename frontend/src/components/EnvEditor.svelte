<script lang="ts">
  // «Variables (.env)» de «Tu app», en filas: nombre a la izquierda,
  // valor a la derecha. Las que hay que completar o revisar salen resaltadas,
  // con el motivo debajo (las mismas reglas que los avisos de antes de aplicar,
  // y alguna más que solo se puede ver aquí: valores de ejemplo, localhost…).
  import { untrack } from 'svelte'
  import { Plus, X, TriangleAlert, CircleAlert, FileText, Rows3 } from '@lucide/svelte'
  import { t } from '../lib/i18n.svelte'

  let { value = $bindable(), error = '' }: { value: unknown; error?: string } = $props()

  type Row = { k: string; v: string }
  const toRows = (l: unknown): Row[] =>
    (Array.isArray(l) ? (l as unknown[]).map(String) : []).map((line) => {
      const i = line.indexOf('=')
      return i < 0 ? { k: line.trim(), v: '' } : { k: line.slice(0, i).trim(), v: line.slice(i + 1) }
    })
  const toList = (rs: Row[]) => rs.filter((r) => r.k.trim()).map((r) => `${r.k.trim()}=${r.v}`)

  let rows = $state<Row[]>(toRows(value))
  let asText = $state(false)
  let text = $state('')

  function commit() {
    value = toList(rows)
  }
  // Si la lista cambia desde fuera («Leer el repositorio», «Usar un .env»…), se refleja aquí.
  $effect(() => {
    const ext = Array.isArray(value) ? (value as unknown[]).map(String) : []
    if (ext.join('\n') !== untrack(() => toList(rows)).join('\n')) rows = toRows(ext)
  })

  // ---- qué conviene revisar en cada fila
  const keyOk = (k: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)
  const truthy = (v: string) => ['true', '1', 'yes', 'on'].includes(v.toLowerCase())
  const placeholder = /(change[_-]?me|changeit|cambia|your[_-]|tu[_-]|xxx+|example\.com|insecure|replace[_-]?me|todo|secret[_-]?here|<.+>)/i
  const secretName = /(SECRET|PASSWORD|PASSWD|(^|_)PASS($|_)|TOKEN|(^|_)KEY$|PRIVATE|SALT|CREDENTIAL)/i
  function check(r: Row, i: number): { bad: boolean; msg: string } | null {
    const k = r.k.trim()
    const v = r.v.trim().replace(/^["']|["']$/g, '')
    if (!k) return r.v ? { bad: true, msg: t('Falta el nombre de la variable.') } : null
    if (!keyOk(k)) return { bad: true, msg: t('Nombre no válido: letras, números y «_», sin empezar por número.') }
    if (rows.findIndex((x) => x.k.trim() === k) !== i) return { bad: true, msg: t('Repetida: vale la última; quita una.') }
    if (v === '') return { bad: true, msg: t('Vacía: escribe su valor o quita la línea (vacía no es lo mismo que «sin poner»: puede pisar un valor por defecto de la app).') }
    if (k === 'NODE_ENV' && !['production', 'development', 'test'].includes(v)) return { bad: true, msg: t('Las apps de Node solo entienden production, development o test. En un servidor: production.') }
    if (/^(DEBUG|APP_DEBUG|FLASK_DEBUG|DJANGO_DEBUG)$/.test(k) && truthy(v)) return { bad: false, msg: t('En un servidor enseña los errores (y a veces contraseñas) a cualquiera: ponlo a false.') }
    if (/^(RAILS_ENV|APP_ENV|FLASK_ENV|ENVIRONMENT|ENV)$/.test(k) && /^(dev|development|local)$/i.test(v)) return { bad: false, msg: t('Es de desarrollo: en un servidor, production.') }
    if (/PORT_FORWARD|_PUBLISH|^PORTS?$/.test(k) && /^\d+(:\d+)?$/.test(v)) return { bad: false, msg: t('Publica el puerto a todo internet (Docker se salta el cortafuegos). Si va detrás de Caddy/nginx o túnel: 127.0.0.1:') + v + '.' }
    if (/VOLUME/.test(k) && /^\.(:|\/)/.test(v)) return { bad: false, msg: t('Monta la carpeta del código dentro del contenedor: es para desarrollo. En un servidor, quita la línea.') }
    if (/HEALTHCHECK/.test(k) && /\/bin\/true/.test(v)) return { bad: false, msg: t('Desactiva la comprobación de salud de la app: es para desarrollo. En un servidor, quita la línea.') }
    if (placeholder.test(v)) return { bad: true, msg: t('Parece un valor de ejemplo: cámbialo por el de verdad.') }
    if (secretName.test(k) && !/_ID$|PUBLIC/.test(k)) return { bad: false, msg: t('Parece una contraseña o clave y aquí se guarda a la vista: muévela a «Generar en el servidor» (si vale al azar) o a «Variables secretas».') }
    if (/(localhost|127\.0\.0\.1)/.test(v) && !/PORT_FORWARD|BIND|LISTEN|HOST$/.test(k)) return { bad: false, msg: t('Lleva localhost: en el servidor quizá deba ser tu dominio o el nombre de otro servicio del compose.') }
    return null
  }
  const checks = $derived(rows.map((r, i) => check(r, i)))
  const pending = $derived(checks.filter(Boolean).length)

  function add() {
    rows = [...rows, { k: '', v: '' }]
  }
  function remove(i: number) {
    rows = rows.filter((_, j) => j !== i)
    commit()
  }
  function toText() {
    text = toList(rows).join('\n')
    asText = true
  }
  function fromText() {
    rows = toRows(text.split('\n').map((x) => x.trim()).filter(Boolean))
    commit()
    asText = false
  }
</script>

<div class="env" class:bad={!!error}>
  <div class="bar">
    {#if pending}<span class="sum"><TriangleAlert size={13} /> {pending === 1 ? t('1 variable para revisar') : t('{0} variables para revisar', pending)}</span>{:else if rows.length}<span class="muted small">{rows.length} variable{rows.length === 1 ? '' : 's'}</span>{/if}
    <span class="sp"></span>
    {#if asText}
      <button type="button" class="btn sm ghost" onclick={fromText}><Rows3 size={13} /> {t('Ver en filas')}</button>
    {:else}
      <button type="button" class="btn sm ghost" onclick={toText} title={t('Pegar o editar todas de golpe, una por línea CLAVE=valor')}><FileText size={13} /> {t('Editar como texto')}</button>
    {/if}
  </div>

  {#if asText}
    <textarea class="input mono" rows="8" bind:value={text} onblur={fromText} placeholder={t('CLAVE=valor, una por línea')}></textarea>
  {:else}
    {#if rows.length}
      <div class="head muted"><span>{t('Variable')}</span><span>{t('Valor')}</span></div>
    {/if}
    {#each rows as r, i (i)}
      {@const c = checks[i]}
      <div class="kv" class:warn={c && !c.bad} class:err={c?.bad}>
        <input class="input mono k" placeholder="NOMBRE" bind:value={r.k} oninput={commit} spellcheck="false" />
        <input class="input mono v" placeholder="valor" bind:value={r.v} oninput={commit} spellcheck="false" />
        <button type="button" class="btn sm ghost icon" title={t('Quitar')} onclick={() => remove(i)}><X size={14} /></button>
        {#if c}<p class="why">{#if c.bad}<CircleAlert size={12} />{:else}<TriangleAlert size={12} />{/if} {c.msg}</p>{/if}
      </div>
    {:else}
      <p class="muted small">{t('Ninguna. Usa «Leer el repositorio» o «Usar un .env de este equipo» (arriba), o añádelas a mano.')}</p>
    {/each}
    <button type="button" class="btn sm add" onclick={add}><Plus size={13} /> {t('Añadir variable')}</button>
  {/if}
  {#if error}<p class="why errline"><CircleAlert size={12} /> {error}</p>{/if}
</div>

<style>
  .env { display: flex; flex-direction: column; gap: 6px; }
  .bar { display: flex; align-items: center; gap: 8px; }
  .sp { flex: 1; }
  .sum { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--warning); font-weight: 600; }
  .small { font-size: 12.5px; }
  .mono { font-family: var(--mono); font-size: 12.5px; }
  .head { display: grid; grid-template-columns: minmax(140px, 2fr) 3fr 34px; gap: 6px; font-size: 11.5px; font-weight: 600; padding: 0 2px; }
  .kv { display: grid; grid-template-columns: minmax(140px, 2fr) 3fr 34px; gap: 6px; align-items: center; padding: 4px; border-radius: var(--radius-sm); border: 1px solid transparent; }
  .kv .input { height: 32px; min-width: 0; }
  .kv.warn { background: color-mix(in srgb, var(--warning) 9%, transparent); border-color: color-mix(in srgb, var(--warning) 40%, transparent); }
  .kv.err { background: color-mix(in srgb, var(--danger) 8%, transparent); border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
  .kv.err .v { border-color: var(--danger); }
  .kv.warn .v { border-color: color-mix(in srgb, var(--warning) 70%, var(--border)); }
  .why { grid-column: 1 / -1; margin: 0 2px 2px; font-size: 12px; display: flex; gap: 5px; align-items: flex-start; }
  .why :global(svg) { flex: none; margin-top: 2px; }
  .kv.warn .why { color: var(--warning); }
  .kv.err .why, .errline { color: var(--danger); }
  .add { align-self: flex-start; }
  textarea { width: 100%; resize: vertical; }
</style>
