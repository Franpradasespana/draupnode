<script lang="ts">
  // Módulo «App desde Git»: «Leer el repositorio» baja el repositorio en el
  // servidor y mira qué variables usa la app (.env.example y ${…} del
  // compose). Rellena las opciones: contraseñas de la app → «Generar en el
  // servidor»; el resto → «Variables (.env)» con el valor de ejemplo o vacío.
  // Las claves de otros servicios (Stripe, correo…) solo las tienes tú.
  import { FileSearch, LoaderCircle, CircleCheck, TriangleAlert, Sparkles, KeyRound, Minus, FileUp } from '@lucide/svelte'
  import { api, type EnvImportResult, type GitInspectResult } from '../lib/api'
  import { ui, toast } from '../lib/state.svelte'
  import { withConnection } from '../lib/connect'

  let { values = $bindable(), projectId, moduleId = 'git-app' }: { values: Record<string, unknown>; projectId: string; moduleId?: string } = $props()

  type Row = { key: string; what: string; kind: 'gen' | 'example' | 'empty' | 'external' | 'optional' | 'had'; hint?: string }
  let busy = $state(false)
  let result = $state<GitInspectResult | null>(null)
  let readFrom = $state('')
  let rows = $state<Row[]>([])

  const server = $derived(ui.servers.find((s) => s.id === ui.projects.find((p) => p.id === projectId)?.serverId))
  const keyOf = (line: string) => line.split('=')[0].trim()

  async function read() {
    busy = true
    try {
      const r = await withConnection<GitInspectResult>(server, (s, a, u) =>
        api.GitAppInspect(projectId, moduleId, String(values.git_app_repo ?? ''), String(values.git_app_branch ?? ''), String(values.git_app_compose ?? ''), String(values.git_app_name ?? ''), s, a, u))
      if (!r) return
      if (r.status !== 'ok') { toast(r.message || 'No se pudo leer el repositorio', 'error'); return }
      result = r
      imported = null
      readFrom = `${values.git_app_repo} (rama ${values.git_app_branch || 'main'})`
      if (r.composeFound) fill(r)
      else rows = []
    } finally {
      busy = false
    }
  }

  // «Usar un .env de este equipo»: las contraseñas y claves van cifradas a la
  // bóveda (las guarda el backend); el resto, a «Variables (.env)» con su valor.
  let root: HTMLDivElement | undefined
  const changed = () => root?.dispatchEvent(new Event('change', { bubbles: true }))
  let importing = $state(false)
  let imported = $state<EnvImportResult | null>(null)
  async function importEnv() {
    const path = await api.ChooseEnvFile().catch(() => '')
    if (!path) return
    importing = true
    try {
      const r = await withConnection<EnvImportResult>(server, () => api.GitAppImportEnv(projectId, moduleId, path))
      if (!r) return
      if (r.status !== 'ok') { toast(r.message || 'No se pudo leer el .env', 'error'); return }
      const keys = new Set([...r.env.map(keyOf), ...r.secretKeys])
      const env = ((values.git_app_env as string[]) ?? []).filter((l) => !keys.has(keyOf(l)))
      values.git_app_env = [...env, ...r.env]
      // Si el .env trae el valor, ya no se genera al azar.
      values.git_app_env_generate = ((values.git_app_env_generate as string[]) ?? []).filter((k) => !keys.has(k))
      imported = r
      result = null
      changed()
      toast(`.env leído: ${r.env.length} variable(s) normales y ${r.secretKeys.length} secreta(s) guardadas en la bóveda`)
    } finally {
      importing = false
    }
  }

  function fill(r: GitInspectResult) {
    const env = [...((values.git_app_env as string[]) ?? [])]
    const gen = [...((values.git_app_env_generate as string[]) ?? [])]
    const have = new Set([...env.map(keyOf), ...gen])
    const out: Row[] = []
    for (const v of r.vars) {
      if (have.has(v.key)) out.push({ key: v.key, what: 'ya estaba en las opciones', kind: 'had' })
      else if (v.hasDefault && !v.inExample) out.push({ key: v.key, what: 'opcional: el compose ya le da un valor por defecto', kind: 'optional' })
      else if (v.secret) { gen.push(v.key); out.push({ key: v.key, what: 'se generará al azar en el servidor (una vez)', kind: 'gen' }) }
      else if (v.external) out.push({ key: v.key, what: 'clave de otro servicio: ponla en «Variables secretas con valor tuyo» como ' + v.key + '=valor', kind: 'external' })
      else if (v.example) { env.push(`${v.key}=${v.example}`); out.push({ key: v.key, what: `puesta con el valor de ejemplo «${v.example}»: revísalo`, kind: 'example', hint: v.hint }) }
      else { env.push(`${v.key}=`); out.push({ key: v.key, what: 'sin valor: escríbelo en «Variables (.env)»', kind: 'empty', hint: v.hint }) }
    }
    values.git_app_env = env
    values.git_app_env_generate = gen
    rows = out
    changed()
  }
</script>

<div class="reader" bind:this={root}>
  <div class="head">
    <div>
      <strong>¿Qué variables necesita tu app?</strong>
      <small>«Leer el repositorio» baja el repositorio en el servidor (con el token si es privado), mira su <code>.env.example</code> y las <code>${'{VARIABLE}'}</code> del compose, y rellena las opciones de abajo. Si no subes un <code>.env.example</code>, elige el <code>.env</code> de tu equipo: las contraseñas y claves van cifradas a la bóveda y el resto a «Variables (.env)». El fichero no se copia a ningún sitio.</small>
    </div>
    <div class="btns">
      <button class="btn sm" onclick={read} disabled={busy || importing || !values.git_app_repo}>
        {#if busy}<LoaderCircle size={14} class="spin" /> Leyendo…{:else}<FileSearch size={14} /> Leer el repositorio{/if}
      </button>
      <button class="btn sm" onclick={importEnv} disabled={busy || importing} title="Si tu repositorio no tiene .env.example: elige el .env que usas en tu equipo">
        {#if importing}<LoaderCircle size={14} class="spin" /> Leyendo…{:else}<FileUp size={14} /> Usar un .env de este equipo…{/if}
      </button>
    </div>
  </div>
  {#if imported}
    <p class="small"><strong>Leído tu .env:</strong> {imported.env.length} variable(s) en «Variables (.env)»{imported.secretKeys.length ? `; cifradas en la bóveda (Variables secretas): ${imported.secretKeys.join(', ')}` : ''}.</p>
    {#if imported.skipped.length}<p class="small bad"><TriangleAlert size={13} /> <span>No se han podido guardar así (valor de varias líneas o con «;»): {imported.skipped.join(', ')}. Ponlas a mano.</span></p>{/if}
    <p class="small muted">Revisa abajo los valores: los de tu equipo (localhost, DEBUG…) quizá no sirvan en el servidor.</p>
  {/if}
  {#if result}
    <p class="small"><strong>Leído:</strong> <code>{readFrom}</code>{#if result.commit}<span class="muted">{' · '}último commit <code>{result.commit.split(' ')[0]}</code>: «{result.commit.split(' ').slice(1).join(' ')}»</span>{/if}</p>
    {#if !result.composeFound}
      <p class="small bad"><TriangleAlert size={13} /> <span>En esa rama no está <code>{values.git_app_compose || 'docker-compose.yml'}</code>: con este repositorio el módulo no puede arrancar la app. Comprueba que la dirección es la de tu app, la rama y el nombre del fichero compose (puedes crearlo con <strong>Docker Creator</strong> y subirlo al repositorio). No se ha cambiado nada en las opciones.</span></p>
    {:else}
      <p class="small muted">{result.exampleFile ? `Variables de ${result.exampleFile} y del compose.` : 'Sin .env.example: solo las variables del compose.'}</p>
      {#if !rows.length}
        <p class="small"><CircleCheck size={13} class="ok" /> El compose no usa variables de entorno: no hace falta rellenar nada.</p>
      {:else}
        <ul>
          {#each rows as r (r.key)}
            <li class={r.kind}>
              {#if r.kind === 'gen'}<Sparkles size={13} />{:else if r.kind === 'external'}<KeyRound size={13} />{:else if r.kind === 'empty'}<TriangleAlert size={13} />{:else if r.kind === 'optional'}<Minus size={13} />{:else}<CircleCheck size={13} />{/if}
              <code>{r.key}</code> <span>{r.what}{r.hint ? ` (${r.hint})` : ''}</span>
            </li>
          {/each}
        </ul>
        <p class="small muted">Al aplicar, si alguna variable que usa el compose se queda sin valor, Draupnode para y te dice cuál.</p>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .reader { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; margin: 6px 0; border: 1px dashed color-mix(in srgb, var(--accent) 45%, var(--border)); border-radius: var(--radius-sm); background: var(--panel-2); }
  .head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
  .head > div { display: flex; flex-direction: column; gap: 3px; font-size: 13.5px; }
  .head > .btns { flex-direction: column; align-items: stretch; flex: none; gap: 6px; }
  .head small { color: var(--muted); font-size: 12px; }
  .small { font-size: 12.5px; margin: 0; }
  .bad { color: var(--warning); display: flex; gap: 6px; align-items: flex-start; }
  .bad :global(svg) { flex: none; margin-top: 2px; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
  li { display: flex; gap: 6px; align-items: baseline; }
  li :global(svg) { flex: none; position: relative; top: 2px; }
  li.gen :global(svg), li.example :global(svg), li.had :global(svg), :global(.ok) { color: var(--success); }
  li.empty, li.external { color: var(--warning); }
  li.optional { color: var(--muted); }
  code { font-family: var(--mono); font-size: 12px; }
</style>
