<script lang="ts">
  import { onMount, tick } from 'svelte'
  import {
    FolderOpen, ArrowLeft, ArrowRight, Save, Hammer, LoaderCircle, CircleCheck, CircleX, TriangleAlert,
    Info, Copy, Square, RefreshCw, FileCode, FlaskConical, ExternalLink, Trash2, Upload,
  } from '@lucide/svelte'
  import { api, errorText, onEvent, type DockerAnalysis, type DockerInfo, type DockerPreview, type DockerSpec, type PublishResult } from '../lib/api'
  import { toast, confirmDialog, ui, openServerModules, refreshProjects } from '../lib/state.svelte'

  const STEPS = ['Carpeta', 'Tipo y versión', 'Arranque', 'Servicios', 'Vista previa']
  const STACKS: Record<string, string> = {
    python: 'Python', node: 'Node.js', java: 'Java', php: 'PHP', go: 'Go', static: 'Web estática (HTML)',
  }
  const FRAMEWORKS: Record<string, [string, string][]> = {
    python: [['django', 'Django'], ['flask', 'Flask'], ['fastapi', 'FastAPI'], ['', 'Otro / script propio']],
    node: [['server', 'Servidor (Express, Nest…)'], ['next', 'Next.js'], ['spa', 'Web compilada (Vite, React, Angular…)']],
    java: [['spring', 'Spring Boot'], ['', 'Otro (.jar ejecutable)']],
    php: [['laravel', 'Laravel'], ['', 'PHP sin framework']],
    go: [], static: [],
  }

  let info = $state<DockerInfo | null>(null)
  let step = $state(0)
  let dir = $state('')
  let analysis = $state<DockerAnalysis | null>(null)
  let spec = $state<DockerSpec | null>(null)
  let analyzing = $state(false)
  let preview = $state<DockerPreview | null>(null)
  let tab = $state(0)
  let saved = $state<string[] | null>(null)
  let saving = $state(false)
  // texto editable de las listas (una por línea / separadas por comas)
  let envText = $state('')
  let volText = $state('')
  let pkgText = $state('')
  let pipText = $state('')

  let building = $state(false)
  let buildLines = $state<string[]>([])
  let buildResult = $state<{ ok: boolean; error?: string; image?: string; secs?: number } | null>(null)
  let logEl = $state<HTMLElement | null>(null)

  // Prueba en el servidor de pruebas
  let labRunning = $state(false)
  let labStages = $state<string[]>([])
  let labLines = $state<string[]>([])
  let labResult = $state<{ ok: boolean; error?: string; url?: string; http?: number; output?: string } | null>(null)
  let labLogEl = $state<HTMLElement | null>(null)

  onMount(() => {
    api.DockerInfo().then((i) => (info = i)).catch(() => {})
    const offLab = onEvent('dockerlab', async (e) => {
      if (e.kind === 'stage') labStages.push(e.text ?? '')
      else if (e.kind === 'line') {
        labLines.push(e.text ?? '')
        if (labLines.length > 2000) labLines.splice(0, labLines.length - 2000)
        await tick()
        if (labLogEl) labLogEl.scrollTop = labLogEl.scrollHeight
      } else {
        labRunning = false
        labResult = { ok: !!e.ok, error: e.error, url: e.url, http: e.http, output: e.output }
        if (e.ok) toast('Funciona en el servidor de pruebas')
      }
    })
    const offBuild = onEvent('dockerbuild', async (e) => {
      if (e.kind === 'line') {
        buildLines.push(e.text ?? '')
        if (buildLines.length > 2000) buildLines.splice(0, buildLines.length - 2000)
        await tick()
        if (logEl) logEl.scrollTop = logEl.scrollHeight
        return
      }
      building = false
      buildResult = { ok: !!e.ok, error: e.error, image: e.image, secs: e.secs }
      if (e.ok) toast('Imagen construida: ' + e.image)
    })
    return () => { offLab(); offBuild() }
  })

  const list = (t: string, sep: RegExp) => t.split(sep).map((x) => x.trim()).filter(Boolean)
  function syncLists() {
    if (!spec) return
    spec.envKeys = list(envText, /[\s,]+/)
    spec.volumes = list(volText, /[\s,]+/)
    spec.systemPackages = list(pkgText, /[\s,]+/)
    spec.extraPip = list(pipText, /[\s,]+/)
  }
  function loadLists(s: DockerSpec) {
    envText = (s.envKeys ?? []).join(', ')
    volText = (s.volumes ?? []).join(', ')
    pkgText = (s.systemPackages ?? []).join(' ')
    pipText = (s.extraPip ?? []).join(' ')
  }

  async function choose() {
    try {
      const d = await api.ChooseProjectDir()
      if (d) {
        dir = d
        await analyze('')
      }
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function analyze(stack: string) {
    analyzing = true
    saved = null
    buildResult = null
    try {
      analysis = await api.AnalyzeProject(dir, stack)
      spec = analysis.spec
      loadLists(spec)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      analyzing = false
    }
  }

  async function changeStack(st: string) {
    if (!spec || st === spec.stack) return
    // Si el proyecto tiene pistas de ese lenguaje, se analiza como tal; si no, valores de partida.
    if (analysis && (analysis.alternatives.includes(st) || analysis.spec.stack === st)) {
      await analyze(st)
      return
    }
    const side = spec.sideBySide
    const env = spec.envKeys
    spec = await api.DefaultDockerSpec(st, spec.name)
    spec.sideBySide = side
    spec.envKeys = env
    loadLists(spec)
  }

  async function makePreview() {
    if (!spec) return
    syncLists()
    preview = await api.GenerateDocker(dir, $state.snapshot(spec) as DockerSpec)
    tab = 0
  }

  async function next() {
    if (step === 3) await makePreview()
    step = Math.min(step + 1, STEPS.length - 1)
  }
  function back() {
    step = Math.max(step - 1, 0)
  }
  async function goStep(i: number) {
    if (!spec || i === step) return
    if (i === 4) await makePreview()
    step = i
  }

  async function save() {
    if (!spec || !preview) return
    const ex = preview.files.filter((f) => f.exists).map((f) => f.name)
    if (ex.length) {
      const ok = await confirmDialog({
        title: 'Sustituir ficheros',
        message: 'Ya existen en la carpeta: ' + ex.join(', ') + '. Se sustituirán por los nuevos.',
        confirmLabel: 'Sustituir', danger: true,
      })
      if (!ok) return
    }
    saving = true
    try {
      saved = await api.WriteDockerFiles(dir, $state.snapshot(spec) as DockerSpec, ex.length > 0)
      preview = await api.GenerateDocker(dir, $state.snapshot(spec) as DockerSpec)
      toast('Guardado en la carpeta del proyecto')
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      saving = false
    }
  }

  async function build() {
    if (!spec) return
    buildLines = []
    buildResult = null
    try {
      await api.BuildDockerImage(dir, $state.snapshot(spec) as DockerSpec)
      building = true
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  async function copy(t: string) {
    try {
      await navigator.clipboard.writeText(t)
      toast('Copiado')
    } catch {
      toast('No se pudo copiar', 'error')
    }
  }

  async function labTest() {
    if (!spec) return
    labStages = []
    labLines = []
    labResult = null
    try {
      await api.DockerLabTest(dir, $state.snapshot(spec) as DockerSpec)
      labRunning = true
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  async function labStop() {
    if (!spec) return
    try {
      await api.DockerLabStop(dir, $state.snapshot(spec) as DockerSpec)
      labResult = null
      labStages = []
      labLines = []
      toast('Prueba parada y borrada del servidor de pruebas')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  function restart() {
    step = 0
    dir = ''
    analysis = null
    spec = null
    preview = null
    saved = null
    buildResult = null
    buildLines = []
  }

  const frameworks = $derived(spec ? FRAMEWORKS[spec.stack] ?? [] : [])
  const kind = $derived.by(() => {
    if (!spec) return ''
    const fw = frameworks.find((f) => f[0] === spec!.framework && f[0] !== '')
    return STACKS[spec.stack] + (fw ? ' · ' + fw[1] : '')
  })
  const versions = $derived(spec && info ? info.versions[spec.stack] ?? [] : [])
  const servesStatic = $derived(!!spec && (spec.stack === 'static' || spec.stack === 'php' || (spec.stack === 'node' && spec.framework === 'spa')))
  const composeName = $derived(spec?.sideBySide ? 'docker-compose.draupnode.yml' : 'docker-compose.yml')
  const openUrl = $derived(spec?.proxy ? `http://${spec.proxyDomain || 'localhost'}${(spec.proxyPort || 80) === 80 ? '' : ':' + spec.proxyPort}` : '')
  const upCmd = $derived('docker compose' + (spec?.sideBySide ? ' -f ' + composeName : '') + ' up -d --build')
  const canNext = $derived(step === 0 ? !!spec && !analyzing : !!spec?.stack)

  // ---- Publicar en un servidor (Tu app que sale de esta carpeta)
  let pubServer = $state('')
  let publishing = $state(false)
  let pubResult = $state<PublishResult | null>(null)
  async function publish() {
    if (!spec || !pubServer) return
    publishing = true
    try {
      pubResult = await api.PublishDockerApp(dir, $state.snapshot(spec) as DockerSpec, pubServer)
      await refreshProjects()
      toast('Añadida a los módulos del servidor: revísala y pulsa Aplicar')
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      publishing = false
    }
  }
</script>

<div class="head">
  <div>
    <h1>Docker Creator</h1>
    <p class="muted">Crea el Dockerfile y el docker-compose.yml de cualquier proyecto sin saber Docker. Mira la carpeta, te propone lo que ha visto y tú lo cambias si hace falta.</p>
  </div>
  {#if dir}<button class="btn" onclick={restart}><RefreshCw size={15} /> Otro proyecto</button>{/if}
</div>

<ol class="steps">
  {#each STEPS as s, i}
    <li>
      <button class:active={i === step} class:done={i < step} disabled={!spec || (i > 0 && !spec.stack)} onclick={() => goStep(i)}>
        <span class="num">{i + 1}</span> {s}
      </button>
    </li>
  {/each}
</ol>

<section class="card block">
  {#if step === 0}
    <h2>¿Qué proyecto quieres meter en Docker?</h2>
    <div class="row">
      <button class="btn primary" onclick={choose} disabled={analyzing}><FolderOpen size={15} /> Elegir carpeta…</button>
      {#if dir}<code class="selectable path">{dir}</code>{/if}
    </div>
    {#if analyzing}
      <p class="muted"><LoaderCircle size={15} class="spin" /> Mirando la carpeta…</p>
    {:else if analysis && spec}
      {#if spec.stack}
        <p class="found"><CircleCheck size={16} /> <span>Parece un proyecto <strong>{kind}</strong>.</span></p>
      {/if}
      {#if analysis.evidence.length}
        <div class="note"><strong>En qué me he basado</strong>
          <ul>{#each analysis.evidence as ev}<li>{ev}</li>{/each}</ul>
        </div>
      {/if}
      {#each analysis.warnings as w}<p class="warn"><TriangleAlert size={16} /> {w}</p>{/each}
      {#if spec.sideBySide}
        <p class="warn"><Info size={16} /> El proyecto ya tiene ficheros de Docker ({analysis.existing.join(', ')}). No se tocan: los nuevos se guardan al lado con «.draupnode» en el nombre para que los compares.</p>
      {/if}
      <p class="muted small">Solo se leen ficheros de la carpeta; el .env (con contraseñas) nunca se lee.</p>
    {/if}

  {:else if spec && step === 1}
    <h2>Tipo de proyecto y versión</h2>
    <div class="grid">
      <label class="field"><span>Lenguaje</span>
        <select class="input" value={spec.stack} onchange={(e) => changeStack((e.target as HTMLSelectElement).value)}>
          {#if !spec.stack}<option value="">Elige…</option>{/if}
          {#each Object.entries(STACKS) as [k, v]}<option value={k}>{v}{analysis?.spec.stack === k ? ' (detectado)' : analysis?.alternatives.includes(k) ? ' (también hay pistas)' : ''}</option>{/each}
        </select>
      </label>
      {#if frameworks.length}
        <label class="field"><span>Tipo</span>
          <select class="input" bind:value={spec.framework}>
            {#each frameworks as [k, v]}<option value={k}>{v}</option>{/each}
          </select>
        </label>
      {/if}
      {#if versions.length > 1 || (versions[0] ?? '') !== ''}
        <label class="field"><span>Versión de {STACKS[spec.stack]}</span>
          <select class="input" bind:value={spec.version}>
            {#each versions as v}<option value={v}>{v}</option>{/each}
            {#if spec.version && !versions.includes(spec.version)}<option value={spec.version}>{spec.version} (la del proyecto)</option>{/if}
          </select>
        </label>
      {/if}
      <label class="field"><span>Nombre</span>
        <input class="input" bind:value={spec.name} spellcheck="false" />
        <small>De la imagen y del contenedor: minúsculas, números y guiones.</small>
      </label>
    </div>
    {#if spec.stack === 'node'}
      <div class="grid">
        <label class="field"><span>Gestor de paquetes</span>
          <select class="input" bind:value={spec.nodePm}><option value="npm">npm</option><option value="yarn">yarn</option><option value="pnpm">pnpm</option></select>
        </label>
        {#if spec.framework === 'spa'}
          <label class="field"><span>Carpeta que genera la compilación</span><input class="input" bind:value={spec.staticDir} spellcheck="false" /><small>Normalmente dist o build.</small></label>
        {/if}
      </div>
      {#if spec.framework !== 'spa'}<label class="check"><input type="checkbox" bind:checked={spec.nodeBuild} /> Compilar antes de arrancar (npm run build)</label>{/if}
    {:else if spec.stack === 'java'}
      <div class="grid">
        <label class="field"><span>Herramienta</span>
          <select class="input" bind:value={spec.javaBuild}><option value="maven">Maven</option><option value="gradle">Gradle</option></select>
        </label>
      </div>
      <label class="check"><input type="checkbox" bind:checked={spec.javaWrapper} /> Usar el mvnw / gradlew del proyecto</label>
    {:else if spec.stack === 'python'}
      <div class="grid">
        <label class="field"><span>Dependencias desde</span>
          <select class="input" bind:value={spec.pyInstall}><option value="requirements">requirements.txt</option><option value="pyproject">pyproject.toml</option></select>
        </label>
        {#if spec.framework === 'django'}
          <label class="field"><span>Módulo de Django</span><input class="input" bind:value={spec.module} spellcheck="false" /><small>La carpeta que tiene settings.py y wsgi.py.</small></label>
        {/if}
      </div>
    {:else if spec.stack === 'php'}
      <div class="grid">
        <label class="field"><span>Carpeta pública</span><input class="input" bind:value={spec.docRoot} placeholder="(la raíz)" spellcheck="false" /><small>Laravel: public.</small></label>
      </div>
    {:else if spec.stack === 'go'}
      <div class="grid">
        <label class="field"><span>Paquete principal</span><input class="input" bind:value={spec.goMain} spellcheck="false" /><small>Donde está func main: «.» o ./cmd/app.</small></label>
      </div>
    {/if}

  {:else if spec && step === 2}
    <h2>Cómo arranca</h2>
    <div class="grid">
      {#if !servesStatic && spec.stack !== 'java' && spec.stack !== 'go'}
        <label class="field wide"><span>Orden de arranque</span>
          <input class="input mono" bind:value={spec.start} spellcheck="false" />
          <small>Lo que ejecutarías en una terminal para arrancar la app. Sin comillas, $, ; ni &.</small>
        </label>
      {/if}
      {#if !servesStatic}
        <label class="field"><span>Puerto de la app</span><input class="input" type="number" min="1" max="65535" bind:value={spec.port} /><small>En el que escucha dentro del contenedor.</small></label>
      {:else}
        <p class="muted small wide">Se sirve con {spec.stack === 'php' ? 'Apache' : 'nginx'} en el puerto 80 dentro del contenedor.</p>
      {/if}
      {#if !spec.proxy}
        <label class="field"><span>Puerto en tu equipo / servidor</span><input class="input" type="number" min="0" max="65535" bind:value={spec.hostPort} /><small>0 = el mismo{servesStatic ? ' (8080)' : ''}.</small></label>
      {/if}
      <label class="field"><span>Comprobación de salud</span><input class="input" bind:value={spec.healthPath} placeholder="(ninguna)" spellcheck="false" /><small>Una ruta que responda, p. ej. /health. Docker sabrá si la app está viva.</small></label>
    </div>
    {#if spec.framework === 'django'}
      <div class="opts">
        <label class="check"><input type="checkbox" bind:checked={spec.djangoMigrate} /> Aplicar las migraciones al arrancar</label>
        <label class="check"><input type="checkbox" bind:checked={spec.djangoCollectstatic} /> Recopilar los estáticos (collectstatic) al construir</label>
        <label class="check"><input type="checkbox" bind:checked={spec.djangoSuperuser} /> Crear el superusuario la primera vez (desde DJANGO_SUPERUSER_* del .env)</label>
      </div>
    {:else if spec.framework === 'laravel'}
      <label class="check"><input type="checkbox" bind:checked={spec.laravelMigrate} /> Aplicar las migraciones al arrancar</label>
    {/if}
    <label class="check"><input type="checkbox" bind:checked={spec.nonRoot} /> Ejecutar la app sin ser root (más seguro)</label>

  {:else if spec && step === 3}
    <h2>Lo que necesita</h2>
    <div class="opts">
      <label class="check"><input type="checkbox" bind:checked={spec.postgres} onchange={() => spec!.postgres && (spec!.mariadb = false)} /> PostgreSQL</label>
      <label class="check"><input type="checkbox" bind:checked={spec.mariadb} onchange={() => spec!.mariadb && (spec!.postgres = false)} /> MariaDB / MySQL</label>
      <label class="check"><input type="checkbox" bind:checked={spec.redis} /> Redis</label>
    </div>
    {#if spec.postgres}
      <div class="grid">
        <label class="field"><span>¿Qué PostgreSQL?</span>
          <select class="input" bind:value={spec.dbMode}>
            <option value="own">Uno propio en este compose</option>
            <option value="shared">El PostgreSQL compartido del servidor (módulo de Draupnode)</option>
          </select>
        </label>
        {#if spec.dbMode === 'shared'}
          <label class="field"><span>Red de Docker</span><input class="input" bind:value={spec.sharedNetwork} spellcheck="false" /></label>
          <label class="field"><span>Contenedor de PostgreSQL</span><input class="input" bind:value={spec.sharedHost} spellcheck="false" /></label>
        {/if}
      </div>
    {/if}
    <div class="proxy">
      <label class="check"><input type="checkbox" bind:checked={spec.proxy} /> <strong>Poner nginx delante</strong> (dominio y puerto normal)</label>
      <p class="muted small">Un nginx en el compose recibe las visitas a tu dominio en el puerto 80 (o el que digas) y las pasa por dentro al puerto {servesStatic ? '80' : spec.port} de la app, que ya no se publica.</p>
      {#if spec.proxy}
        <div class="grid">
          <label class="field"><span>Dominio</span><input class="input mono" bind:value={spec.proxyDomain} placeholder="tienda.ejemplo.com" spellcheck="false" /><small>Vacío = responde a cualquiera. Tiene que apuntar a este equipo o servidor.</small></label>
          <label class="field"><span>Puerto de nginx</span><input class="input" type="number" min="1" max="65535" bind:value={spec.proxyPort} /><small>80 = el normal (http://dominio sin puerto).</small></label>
          <label class="field"><span>Tamaño máximo de subida (MB)</span><input class="input" type="number" min="1" max="10240" bind:value={spec.maxBodyMb} /></label>
        </div>
        <p class="muted small">Para HTTPS (candado), pon delante el módulo Caddy o nginx de Draupnode en el servidor, o despliégalo con Coolify.</p>
      {/if}
    </div>
    <div class="grid">
      <label class="field wide"><span>Variables de entorno que usa la app</span>
        <input class="input mono" bind:value={envText} placeholder="SECRET_KEY, API_TOKEN" spellcheck="false" />
        <small>Solo los nombres: los valores van en tu .env, que no se mete en la imagen.</small>
      </label>
      <label class="field wide"><span>Carpetas donde la app guarda datos</span>
        <input class="input mono" bind:value={volText} placeholder="/app/media, /app/uploads" spellcheck="false" />
        <small>Rutas dentro del contenedor. Se guardan en un volumen para no perderlas al actualizar.</small>
      </label>
      <label class="field"><span>Paquetes del sistema extra</span>
        <input class="input mono" bind:value={pkgText} placeholder="libpq-dev gettext" spellcheck="false" />
        <small>De Debian, separados por espacios.</small>
      </label>
      {#if spec.stack === 'python'}
        <label class="field"><span>Paquetes de Python extra</span>
          <input class="input mono" bind:value={pipText} placeholder="gunicorn" spellcheck="false" />
        </label>
      {/if}
    </div>

  {:else if spec && step === 4 && preview}
    <h2>Vista previa</h2>
    {#if preview.errors.length}
      {#each preview.errors as e}<p class="err"><CircleX size={16} /> {e}</p>{/each}
      <p class="muted small">Vuelve a los pasos anteriores para corregirlo.</p>
    {:else}
      <div class="tabs">
        {#each preview.files as f, i}
          <button class:active={tab === i} onclick={() => (tab = i)}><FileCode size={14} /> {f.name}{#if f.exists}<em>se sustituye</em>{/if}</button>
        {/each}
      </div>
      {#if preview.files[tab]}
        <div class="code">
          <button class="btn icon sm ghost copy" title="Copiar" onclick={() => copy(preview!.files[tab].content)}><Copy size={14} /></button>
          <pre class="selectable">{preview.files[tab].content}</pre>
        </div>
      {/if}
      <div class="row">
        <button class="btn primary" onclick={save} disabled={saving}>{#if saving}<LoaderCircle size={15} class="spin" />{:else}<Save size={15} />{/if} Guardar en la carpeta</button>
        {#if saved}
          <button class="btn" onclick={build} disabled={building || !info?.docker} title={info?.docker ? '' : 'No hay Docker en este equipo (pantalla «Servidor de pruebas»)'}><Hammer size={15} /> Probar a construir</button>
          {#if building}<button class="btn ghost" onclick={() => api.CancelDockerBuild()}><Square size={14} /> Cancelar</button>{/if}
          <button class="btn" onclick={labTest} disabled={labRunning || !info?.docker} title={info?.docker ? 'Lo arranca en el servidor de pruebas de este equipo (lo crea si no existe)' : 'No hay Docker en este equipo (pantalla «Servidor de pruebas»)'}><FlaskConical size={15} /> Probar en el servidor de pruebas</button>
          <button class="btn ghost" onclick={() => api.OpenProjectDir(dir)}><FolderOpen size={15} /> Abrir carpeta</button>
        {/if}
      </div>
      {#if saved}
        <p class="found"><CircleCheck size={16} /> Guardado: {saved.join(', ')}.</p>
        <div class="note publish">
          <p><strong>Publicar en un servidor</strong>: Draupnode añade la app a los módulos del servidor con todo rellenado (este compose, el puerto, las variables y las contraseñas que se generan allí) y la sube desde esta carpeta cada vez que aplicas. No hace falta GitHub.</p>
          <div class="row">
            <select class="input" bind:value={pubServer}>
              <option value="">Elige el servidor…</option>
              {#each ui.servers as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
            </select>
            <button class="btn primary" onclick={publish} disabled={!pubServer || publishing}>{#if publishing}<LoaderCircle size={15} class="spin" />{:else}<Upload size={15} />{/if} Publicar en el servidor</button>
          </div>
          {#if pubResult}
            {#each pubResult.notes as n}<p class="small"><CircleCheck size={13} /> {n}</p>{/each}
            {#if pubResult.review.length}
              <p class="small"><strong>Para revisar antes de aplicar</strong> (en sus opciones):</p>
              <ul class="small">{#each pubResult.review as r}<li>{r}</li>{/each}</ul>
            {/if}
            <button class="btn sm" onclick={() => openServerModules(pubResult!.serverId)}>Ir a sus módulos y aplicar <ArrowRight size={13} /></button>
          {/if}
        </div>
        <div class="note">
          <p><strong>Para arrancarlo</strong>, en una terminal dentro de la carpeta del proyecto:</p>
          <div class="cmd"><code class="selectable">{upCmd}</code><button class="btn icon sm ghost" title="Copiar" onclick={() => copy(upCmd)}><Copy size={14} /></button></div>
          {#if openUrl}<p>Después ábrela en <code>{openUrl}</code>{spec?.proxyDomain ? ' (el dominio tiene que apuntar a donde la arranques)' : ''}.</p>{/if}
          <p>Si tu app usa variables (contraseñas…), crea antes un fichero <code>.env</code> con ellas. Coolify también puede desplegarlo con este {composeName}.</p>
        </div>
      {/if}
      {#if labRunning || labResult}
        <div class="progress">
          <div class="p-head">
            {#if labRunning}<LoaderCircle size={15} class="spin" /> {labStages[labStages.length - 1] ?? 'Empezando…'}
              <button class="btn sm ghost push" onclick={() => api.CancelDockerLabTest()}><Square size={13} /> Cancelar</button>
            {:else if labResult?.ok}<CircleCheck size={15} /> Funciona en el servidor de pruebas ({labResult.http})
            {:else if labResult}<CircleX size={15} /> {labResult.error}{/if}
          </div>
          {#if labResult?.ok}
            <div class="lab-ok">
              <button class="btn sm primary" onclick={() => api.OpenURL(labResult!.url!)}><ExternalLink size={14} /> Abrir en el navegador</button>
              <code class="selectable">{labResult.url}</code>
              <button class="btn sm ghost" onclick={labStop}><Trash2 size={14} /> Parar la prueba</button>
            </div>
          {:else if labResult}
            <div class="lab-ok"><button class="btn sm ghost" onclick={labStop}><Trash2 size={14} /> Parar y borrar la prueba</button><span class="muted small">Corrige y vuelve a «Probar»: se sube de nuevo.</span></div>
          {/if}
          {#if labStages.length}<ol class="stages">{#each labStages as st, i}<li class:cur={labRunning && i === labStages.length - 1}>{st}</li>{/each}</ol>{/if}
          <pre class="log selectable" bind:this={labLogEl}>{labResult?.output ? labResult.output : labLines.join('\n')}</pre>
        </div>
      {/if}
      {#if building || buildResult || buildLines.length}
        <div class="progress">
          <div class="p-head">
            {#if building}<LoaderCircle size={15} class="spin" /> Construyendo la imagen…
            {:else if buildResult?.ok}<CircleCheck size={15} /> Construida en {buildResult.secs} s: <code>{buildResult.image}</code>
            {:else if buildResult}<CircleX size={15} /> {buildResult.error}{/if}
          </div>
          <pre class="log selectable" bind:this={logEl}>{buildLines.join('\n')}</pre>
        </div>
      {/if}
    {/if}
  {/if}

  {#if spec}
    <div class="nav">
      <button class="btn" onclick={back} disabled={step === 0}><ArrowLeft size={15} /> Anterior</button>
      {#if step < STEPS.length - 1}
        <button class="btn primary" onclick={next} disabled={!canNext}>Siguiente <ArrowRight size={15} /></button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
  .head p { margin-top: 4px; max-width: 760px; }
  .steps { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 14px; padding: 0; }
  .steps button {
    display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px 0 6px; border-radius: 999px;
    background: var(--panel); border: 1px solid var(--border); color: var(--muted); cursor: pointer; font-size: 13px;
  }
  .steps button:disabled { cursor: default; opacity: .6; }
  .steps button.active { border-color: var(--accent); color: var(--text); font-weight: 500; }
  .steps button.done { color: var(--text); }
  .num { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 600; background: var(--accent-soft); color: var(--accent); }
  .done .num { background: var(--success-soft); color: var(--success); }
  .block { display: flex; flex-direction: column; gap: 14px; }
  .row, .opts { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .opts { gap: 18px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
  .wide { grid-column: 1 / -1; }
  .mono { font-family: var(--mono); }
  .path { word-break: break-all; }
  .small { font-size: 12.5px; }
  .found, .warn, .err { display: flex; gap: 8px; align-items: flex-start; margin: 0; }
  .found :global(svg) { color: var(--success); flex: none; margin-top: 2px; }
  .warn :global(svg) { color: var(--accent); flex: none; margin-top: 2px; }
  .err :global(svg) { color: var(--danger); flex: none; margin-top: 2px; }
  .note { background: var(--panel-2); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 10px 14px; font-size: 13px; display: flex; flex-direction: column; gap: 6px; }
  .note ul, .note p { margin: 0; }
  .note ul { padding-left: 18px; }
  .tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--border); }
  .tabs button { display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--muted); cursor: pointer; font-family: var(--mono); font-size: 12.5px; }
  .tabs button.active { color: var(--text); border-bottom-color: var(--accent); }
  .tabs em { font-style: normal; font-family: var(--font, inherit); font-size: 11px; color: var(--danger); }
  .code { position: relative; }
  .code pre { margin: 0; max-height: 420px; overflow: auto; padding: 12px 14px; background: var(--panel-2); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); font-family: var(--mono); font-size: 12px; line-height: 1.5; }
  .copy { position: absolute; top: 6px; right: 10px; }
  .cmd { display: flex; align-items: center; gap: 6px; background: var(--panel); border: 1px solid var(--border-soft); border-radius: 6px; padding: 4px 4px 4px 10px; }
  .cmd code { flex: 1; overflow-x: auto; white-space: nowrap; }
  .progress { border: 1px solid var(--border-soft); border-radius: var(--radius-sm); overflow: hidden; }
  .p-head { display: flex; align-items: center; gap: 8px; padding: 9px 12px; background: var(--panel-2); font-size: 13px; font-weight: 500; border-bottom: 1px solid var(--border-soft); }
  .log { margin: 0; padding: 10px 12px; max-height: 260px; overflow-y: auto; font-family: var(--mono); font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
  .proxy { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border: 1px solid var(--border-soft); border-radius: var(--radius-sm); }
  .proxy p { margin: 0; }
  .push { margin-left: auto; }
  .lab-ok { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 10px 12px; border-bottom: 1px solid var(--border-soft); }
  .lab-ok code { font-family: var(--mono); font-size: 12px; }
  .stages { margin: 0; padding: 8px 12px 8px 32px; font-size: 12.5px; color: var(--muted); border-bottom: 1px solid var(--border-soft); }
  .stages li.cur { color: var(--text); font-weight: 500; }
  .nav { display: flex; justify-content: space-between; border-top: 1px solid var(--border-soft); padding-top: 14px; }
  .publish { display: flex; flex-direction: column; gap: 8px; border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
  .publish .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .publish .input { width: auto; min-width: 240px; }
  .publish .small { font-size: 12.5px; margin: 0; }
  .publish ul { margin: 0; padding-left: 18px; }
</style>
