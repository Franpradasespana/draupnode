package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strings"

	"draupnode/internal/bundle"
	"draupnode/internal/runner"
	"draupnode/internal/secrets"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
)

// «Leer el repositorio» (módulo «Tu app»): se baja el repositorio en el
// servidor (con el token o la deploy key si es privado), se miran
// .env.example y el docker-compose y se devuelven las variables que usa la
// app, para rellenar las opciones del módulo. Nunca se leen ficheros .env
// de verdad ni valores secretos: solo nombres y los valores de ejemplo.

// GitEnvVar es una variable que usa la app.
type GitEnvVar struct {
	Key        string `json:"key"`
	Example    string `json:"example,omitempty"` // valor de .env.example (si lo trae)
	InExample  bool   `json:"inExample"`         // sale en .env.example
	InCompose  bool   `json:"inCompose"`
	InCode     bool   `json:"inCode"`     // la lee el código
	HasDefault bool   `json:"hasDefault"` // el compose le da valor por defecto (${KEY:-x})
	Secret     bool   `json:"secret"`     // por su nombre, parece una contraseña o clave
	External   bool   `json:"external"`   // clave o token de otro servicio (Stripe, correo…): solo la tiene el usuario
	Hint       string `json:"hint,omitempty"`
	// Perfil del tipo de app: valor de servidor típico, o generarla (con su formato).
	Suggest  string `json:"suggest,omitempty"`
	Generate bool   `json:"generate,omitempty"`
	Format   string `json:"format,omitempty"`
}

// GitInspectResult es lo que se ha visto en el repositorio.
type GitInspectResult struct {
	RunStart
	Commit       string      `json:"commit,omitempty"`
	ComposeFound bool        `json:"composeFound"`
	ExampleFile  string      `json:"exampleFile,omitempty"`
	Vars         []GitEnvVar `json:"vars"`
	// Orden para preparar la base de datos según el tipo de app (manage.py → migrate…) y
	// el servicio donde ejecutarla (el primero que se construye).
	PostCommand string `json:"postCommand,omitempty"`
	Framework   string `json:"framework,omitempty"` // django | laravel | rails | node | ""
	PostService string `json:"postService,omitempty"`
}

var (
	gitRepoRe    = regexp.MustCompile(`^(https://[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+|[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._/~-]+)$`)
	gitBranchRe  = regexp.MustCompile(`^[A-Za-z0-9._/-]+$`)
	gitComposeRe = regexp.MustCompile(`^[A-Za-z0-9._/-]+\.ya?ml$`)
	gitNameRe    = regexp.MustCompile(`^[a-z][a-z0-9-]{1,30}$`)
	secretNameRe = regexp.MustCompile(`(?i)(SECRET|PASSWORD|PASSWD|PASSPHRASE|(^|_)PASS($|_)|TOKEN|(^|_)KEY$|PRIVATE|SALT|CREDENTIAL|(^|_)PWD($|_))`)
	urlNameRe    = regexp.MustCompile(`(?i)(_URL|_URI|_DSN)$`)
	// Opciones con nombre de secreto: no se generan.
	configNameRe = regexp.MustCompile(`(?i)_(TABLE|TIMEOUT|BROKER|DRIVER|LIFETIME|ROUNDS|PATH|HOST|PORT|NAME|DB|ENABLED|LENGTH|EXPIRES?|TTL|STORE|CONNECTION|CHANNEL|LEVEL|ALGO|ALGORITHM|PREFIX|MODE)$`)
	externalRe   = regexp.MustCompile(`(?i)(API_KEY|APIKEY|ACCESS_KEY|_TOKEN$|^TOKEN$|STRIPE|PAYPAL|SENDGRID|MAILGUN|SMTP|EMAIL_HOST|TWILIO|OPENAI|ANTHROPIC|GOOGLE|GITHUB|AWS_|S3_|SENTRY|RECAPTCHA|VAPID|^MAIL_|MEMCACHED_|REDIS_PASSWORD)`)
)

// classifyGitVar decide qué es cada variable por su nombre: una contraseña o
// clave propia de la app (se puede generar al azar), una clave o token de otro
// servicio (solo la tiene el usuario) o una dirección.
func classifyGitVar(v *GitEnvVar) {
	k := strings.ToUpper(v.Key)
	switch {
	case urlNameRe.MatchString(k):
		v.Hint = "dirección: si lleva usuario y contraseña, escríbela entera"
	case strings.Contains(k, "PUBLIC") || strings.HasSuffix(k, "_KEY_ID") || strings.HasSuffix(k, "_ID"):
	case externalRe.MatchString(k):
		v.External = true
		v.Hint = "clave de otro servicio: solo la tienes tú"
	case configNameRe.MatchString(k):
		// AUTH_PASSWORD_BROKER, SESSION_LIFETIME…: opciones, aunque lleven «PASSWORD» o «KEY».
	case secretNameRe.MatchString(k):
		v.Secret = true
		v.Hint = "contraseña o clave de la app: se puede generar al azar"
	}
}

const gitInspectScript = `set -e
IFS= read -r T || true
command -v git >/dev/null 2>&1 || { echo '{"error":"nogit"}'; exit 0; }
command -v python3 >/dev/null 2>&1 || { echo '{"error":"nopy"}'; exit 0; }
d=$(mktemp -d); trap 'rm -rf "$d"' EXIT
export GIT_TERMINAL_PROMPT=0
if [ -n "$K" ] && [ -f "$K" ]; then
  export GIT_SSH_COMMAND="ssh -i $K -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$KH"
else
  export GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$d/kh"
fi
if [ -n "$T" ]; then
  auth=$(printf 'x-access-token:%s' "$T" | base64 -w0)
  export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraHeader GIT_CONFIG_VALUE_0="Authorization: Basic $auth"
fi
if ! timeout 120 git clone -q --depth 1 --branch "$B" "$R" "$d/r" 2>"$d/err"; then
  python3 -c 'import json,sys; print(json.dumps({"error":"clone","detail":open(sys.argv[1]).read()[-400:]}))' "$d/err"
  exit 0
fi
python3 - "$d/r" "$C" <<'PY'
import json, os, re, subprocess, sys
root, compose = sys.argv[1], sys.argv[2]
out = {"vars": {}, "compose": False, "example": ""}
def var(k):
    return out["vars"].setdefault(k, {"key": k, "inExample": False, "inCompose": False, "hasDefault": False, "example": ""})
for name in (".env.example", ".env.sample", ".env.template", ".env.dist", "env.example"):
    p = os.path.join(root, name)
    if os.path.isfile(p):
        out["example"] = name
        for l in open(p, errors="replace"):
            l = l.strip()
            if not l or l.startswith("#"):
                continue
            if l.startswith("export "):
                l = l[7:].strip()
            m = re.match(r"([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", l)
            if m:
                v = var(m.group(1)); v["inExample"] = True
                val = re.sub(r"\s+#.*$", "", m.group(2)).strip().strip('"').strip("'")
                v["example"] = val[:200]
        break
cp = os.path.join(root, compose)
if os.path.isfile(cp):
    out["compose"] = True
    # Sin las líneas comentadas: una variable en un comentario no la usa la app.
    txt = "\n".join(l for l in open(cp, errors="replace") if not l.lstrip().startswith("#"))
    for m in re.finditer(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(:?[-?+][^}]*)?\}", txt):
        v = var(m.group(1)); v["inCompose"] = True
        if m.group(2) and m.group(2).lstrip(":").startswith("-"):
            v["hasDefault"] = True
# Lo que lee el código (como Docker Creator): variables que no están en .env.example ni
# en el compose, y el formato de las claves cerca de donde se leen.
envre = re.compile(r"""(?:os\.environ\.get|os\.getenv|os\.environ\[|\benv(?:\.\w+)?|process\.env\[?|getenv|Getenv|LookupEnv)\(?\s*\.?\s*["'\x60]?([A-Z][A-Z0-9_]{2,})["'\x60]?""")
fernet = re.compile(r"Fernet\(\s*[A-Za-z_][A-Za-z0-9_.]*\s*\)")
skipd = {".git", ".venv", "venv", "env", "node_modules", "__pycache__", "migrations", "vendor", "dist", "build", "staticfiles", "static", "media", "tests", "test", "docs"}
ignore = {"PATH", "HOME", "USER", "PWD", "HOSTNAME", "TERM", "LANG", "TZ", "DJANGO_SETTINGS_MODULE", "PYTHONPATH", "PORT"}
texts, n = [], 0
for dp, dns, fns in os.walk(root):
    dns[:] = [d for d in dns if d not in skipd and not d.startswith(".")]
    for fn in fns:
        if n >= 3000 or os.path.splitext(fn)[1] not in (".py", ".js", ".ts", ".mjs", ".php", ".go", ".rb"):
            continue
        fp = os.path.join(dp, fn)
        try:
            if os.path.getsize(fp) > 512 * 1024:
                continue
            texts.append(open(fp, errors="replace").read()); n += 1
        except Exception:
            pass
for t in texts:
    for m in envre.finditer(t):
        k = m.group(1)
        if k not in ignore:
            var(k)["inCode"] = True
for k, v in out["vars"].items():
    for t in texts:
        if v.get("format") or k not in t:
            continue
        lines = t.split("\n")
        for i, l in enumerate(lines):
            if k not in l:
                continue
            win = "\n".join(lines[i:i + 16])
            if fernet.search(win):
                v["format"] = "fernet"
            elif "b64decode" in win and "32" in win:
                v["format"] = "base64-32"
            elif "bytes.fromhex" in win or "hex.DecodeString" in win:
                v["format"] = "hex-32"
            if v.get("format"):
                break
c = subprocess.run(["git", "-C", root, "log", "-1", "--format=%h %s"], capture_output=True, text=True).stdout.strip()
known = []
for f in ("manage.py", "artisan", "bin/rails", "prisma/schema.prisma", "alembic.ini", "package.json"):
    hits = [f] if os.path.isfile(os.path.join(root, f)) else [os.path.join(d, f) for d in sorted(os.listdir(root)) if not d.startswith(".") and os.path.isfile(os.path.join(root, d, f))]
    if hits:
        known.append(f)
built = ""
if out["compose"]:
    cur = None
    for l in open(cp, errors="replace"):
        m = re.match(r"^  ([A-Za-z0-9][A-Za-z0-9_.-]*):\s*$", l)
        if m:
            cur = m.group(1)
        elif cur and not built and re.match(r"^    (build|<<):", l):
            built = cur
print(json.dumps({"commit": c, "compose": out["compose"], "example": out["example"], "vars": list(out["vars"].values()), "known": known, "built": built}))
PY
`

// GitAppInspect lee el repositorio (en el servidor del proyecto) y devuelve
// las variables que usa la app. repo/branch/compose son los del formulario
// (aún sin guardar); el token, si hace falta, se toma de la bóveda.
func (a *App) GitAppInspect(projectID, moduleID, repo, branch, compose, appName, secret, accept, sudoPassword string) GitInspectResult {
	fail := func(msg string) GitInspectResult {
		return GitInspectResult{RunStart: RunStart{Status: "error", Message: msg}}
	}
	repo, branch, compose = strings.TrimSpace(repo), strings.TrimSpace(branch), strings.TrimSpace(compose)
	if branch == "" {
		branch = "main"
	}
	if compose == "" {
		compose = "docker-compose.yml"
	}
	switch {
	case !gitRepoRe.MatchString(repo):
		return fail("Escribe primero la dirección del repositorio (https://… o git@…).")
	case !gitBranchRe.MatchString(branch):
		return fail("El nombre de la rama no es válido.")
	case !gitComposeRe.MatchString(compose) || strings.Contains(compose, ".."):
		return fail("El fichero compose no es válido.")
	}
	p, err := a.store.Project(projectID)
	if err != nil {
		return fail(err.Error())
	}
	srv, err := a.store.Server(p.ServerID)
	if err != nil {
		return fail(err.Error())
	}
	isSSH := !strings.HasPrefix(repo, "https://")
	token := ""
	if !isSSH {
		t, err := a.vault.Get(varName(projectID, secretKey(moduleID, "git_app_token")))
		switch {
		case errors.Is(err, secrets.ErrLocked):
			return GitInspectResult{RunStart: RunStart{Status: "vault_locked", Message: "Desbloquea la bóveda: ahí está el token del repositorio."}}
		case err == nil:
			token = strings.TrimSpace(t)
		}
	}
	keyPath, knownHosts := "", ""
	if isSSH && gitNameRe.MatchString(appName) {
		dir := bundle.SecretsDir(slugOf(p))
		keyPath, knownHosts = dir+"/.git_app_"+appName+"_key", dir+"/.git_known_hosts"
	}
	var res GitInspectResult
	res.RunStart = a.withServerConn(srv.ID, secret, accept, sudoPassword, func(c *ssh.Client, su runner.Sudo) RunStart {
		env := "R=" + bundle.ShellQuote(repo) + " B=" + bundle.ShellQuote(branch) + " C=" + bundle.ShellQuote(compose) +
			" K=" + bundle.ShellQuote(keyPath) + " KH=" + bundle.ShellQuote(knownHosts)
		out, errOut, err := execIn(c, su, env+" sh -c "+bundle.ShellQuote(gitInspectScript), token+"\n")
		if err != nil && strings.TrimSpace(out) == "" {
			return RunStart{Status: "error", Message: "no se pudo leer: " + firstLine(errOut, err)}
		}
		var raw struct {
			Error   string      `json:"error"`
			Detail  string      `json:"detail"`
			Commit  string      `json:"commit"`
			Compose bool        `json:"compose"`
			Example string      `json:"example"`
			Vars    []GitEnvVar `json:"vars"`
			Known   []string    `json:"known"`
			Built   string      `json:"built"`
		}
		if json.Unmarshal([]byte(lastJSONLine(out)), &raw) != nil {
			return RunStart{Status: "error", Message: "respuesta no válida del servidor"}
		}
		switch raw.Error {
		case "nogit":
			return RunStart{Status: "error", Message: "El servidor aún no tiene git (se instala al aplicar este módulo). Aplica una vez o instala git y vuelve a probar."}
		case "nopy":
			return RunStart{Status: "error", Message: "El servidor no tiene python3 (lo instala el módulo «Sistema base»)."}
		case "clone":
			return RunStart{Status: "error", Message: gitCloneHelp(raw.Detail, isSSH, token != "", keyPath)}
		}
		res.Commit, res.ComposeFound, res.ExampleFile = raw.Commit, raw.Compose, raw.Example
		known := map[string]bool{}
		for _, f := range raw.Known {
			known[f] = true
		}
		if res.PostCommand = gitPostSuggestion(known); res.PostCommand != "" {
			res.PostService = raw.Built
		}
		fw := frameworkFromFiles(known)
		res.Framework = fw
		for i := range raw.Vars {
			v := &raw.Vars[i]
			classifyGitVar(v)
			codeFormat := v.Format // el que se ha visto en el código
			v.Suggest, v.Generate, v.Format = profileValue(fw, v.Key, v.Example, "")
			if v.Format == "" && codeFormat != "" {
				v.Format = codeFormat
				v.Secret, v.External = true, false // una clave con formato es de la app: se genera
			}
		}
		sort.Slice(raw.Vars, func(i, j int) bool { return raw.Vars[i].Key < raw.Vars[j].Key })
		res.Vars = raw.Vars
		return RunStart{Status: "ok"}
	})
	if res.Vars == nil {
		res.Vars = []GitEnvVar{}
	}
	return res
}

func gitCloneHelp(detail string, isSSH, hasToken bool, keyPath string) string {
	d := strings.TrimSpace(detail)
	if i := strings.LastIndex(d, "fatal:"); i >= 0 {
		d = strings.TrimSpace(d[i:])
	}
	msg := "No se pudo bajar el repositorio (" + d + "). "
	switch {
	case strings.Contains(d, "Remote branch") || strings.Contains(d, "not found in upstream"):
		return msg + "Comprueba el nombre de la rama."
	case isSSH && keyPath == "":
		return msg + "Pon antes el nombre de la app."
	case isSSH:
		return msg + "Si es privado por SSH, la deploy key se crea al aplicar por primera vez: aplica, añádela al repositorio y vuelve a leerlo; o usa la dirección https:// con un token."
	case hasToken:
		return msg + "El token no sirve para este repositorio: comprueba que no ha caducado y que tiene permiso de lectura."
	default:
		return msg + "Si es privado, pon antes el «Token de acceso» (solo lectura) y vuelve a leerlo."
	}
}

// execIn es como execOut, pero mandando stdin (para no poner secretos en la orden).
func execIn(c *ssh.Client, su runner.Sudo, cmd, stdin string) (string, string, error) {
	var out, errb strings.Builder
	err := runner.Exec(context.Background(), c, su, cmd, strings.NewReader(stdin), &out, &errb)
	return out.String(), errb.String(), err
}

// ---------------------------------------------------------------- .env de este equipo

// EnvImportResult: lo que se ha sacado de un .env de este equipo. Las
// variables normales vuelven para «Variables (.env)»; las secretas ya se han
// guardado cifradas en la bóveda («Variables secretas con valor tuyo»).
type EnvImportResult struct {
	RunStart
	Env        []string `json:"env"`        // CLAVE=valor (no secretas)
	SecretKeys []string `json:"secretKeys"` // guardadas en la bóveda
	Skipped    []string `json:"skipped"`    // no se pueden guardar así (valor con «;» o de varias líneas)
}

type envKV struct{ Key, Value string }

var envLineRe = regexp.MustCompile(`^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$`)

// parseDotEnv lee un .env sencillo: CLAVE=valor por línea, con «export»,
// comillas y comentarios. Las comillas que no se cierran en la línea (valores
// de varias líneas) se marcan para saltarlas.
func parseDotEnv(text string) (out []envKV, multiline []string) {
	seen := map[string]int{}
	for _, l := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		l = strings.TrimSpace(l)
		if l == "" || strings.HasPrefix(l, "#") {
			continue
		}
		m := envLineRe.FindStringSubmatch(l)
		if m == nil {
			continue
		}
		k, v := m[1], strings.TrimSpace(m[2])
		switch {
		case strings.HasPrefix(v, `"`) || strings.HasPrefix(v, `'`):
			q := v[:1]
			if end := strings.Index(v[1:], q); end >= 0 {
				v = v[1 : end+1]
			} else {
				multiline = append(multiline, k)
				continue
			}
		default:
			if i := strings.Index(v, " #"); i >= 0 {
				v = strings.TrimSpace(v[:i])
			}
		}
		if i, ok := seen[k]; ok {
			out[i].Value = v // la última gana, como en Docker Compose
			continue
		}
		seen[k] = len(out)
		out = append(out, envKV{k, v})
	}
	return out, multiline
}

// ChooseEnvFile abre el diálogo para elegir un .env de este equipo.
func (a *App) ChooseEnvFile() (string, error) {
	home, _ := os.UserHomeDir()
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Fichero .env de tu app",
		DefaultDirectory: home,
		ShowHiddenFiles:  true,
	})
}

// GitAppImportEnv lee un .env de este equipo para el módulo «Tu app»:
// las variables que parecen contraseñas o claves se guardan cifradas en la
// bóveda (junto a las que ya hubiera); el resto vuelve como CLAVE=valor.
// El fichero no se copia a ningún sitio.
func (a *App) GitAppImportEnv(projectID, moduleID, path string) EnvImportResult {
	res := EnvImportResult{Env: []string{}, SecretKeys: []string{}, Skipped: []string{}}
	fail := func(msg string) EnvImportResult { res.RunStart = RunStart{Status: "error", Message: msg}; return res }
	if _, err := a.store.Project(projectID); err != nil {
		return fail(err.Error())
	}
	st, err := os.Stat(path)
	if err != nil {
		return fail("no se pudo abrir el fichero: " + err.Error())
	}
	if st.IsDir() || st.Size() > 256<<10 {
		return fail("eso no parece un fichero .env (es una carpeta o pesa demasiado)")
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return fail("no se pudo leer el fichero: " + err.Error())
	}
	vars, multi := parseDotEnv(string(b))
	if len(vars) == 0 && len(multi) == 0 {
		return fail("el fichero no tiene ninguna línea CLAVE=valor")
	}
	res.Skipped = append(res.Skipped, multi...)
	secretVals := map[string]string{}
	for _, kv := range vars {
		v := GitEnvVar{Key: kv.Key}
		classifyGitVar(&v)
		if !v.Secret && !v.External {
			res.Env = append(res.Env, kv.Key+"="+kv.Value)
			continue
		}
		if strings.ContainsAny(kv.Value, ";\n") {
			res.Skipped = append(res.Skipped, kv.Key)
			continue
		}
		secretVals[kv.Key] = kv.Value
	}
	if len(secretVals) > 0 {
		key := varName(projectID, secretKey(moduleID, "git_app_env_secret"))
		old, err := a.vault.Get(key)
		switch {
		case errors.Is(err, secrets.ErrLocked):
			res.RunStart = RunStart{Status: "vault_locked", Message: "Desbloquea la bóveda: las contraseñas del .env se guardan cifradas ahí."}
			return res
		case errors.Is(err, secrets.ErrNoVault):
			res.RunStart = RunStart{Status: "vault_missing", Message: "Las contraseñas del .env se guardan en la bóveda cifrada: créala."}
			return res
		}
		merged := map[string]string{}
		var order []string
		for _, part := range strings.Split(old, ";") {
			if k, v, ok := strings.Cut(strings.TrimSpace(part), "="); ok && k != "" {
				if _, dup := merged[k]; !dup {
					order = append(order, k)
				}
				merged[k] = v
			}
		}
		for _, kv := range vars {
			if v, ok := secretVals[kv.Key]; ok {
				if _, dup := merged[kv.Key]; !dup {
					order = append(order, kv.Key)
				}
				merged[kv.Key] = v
				res.SecretKeys = append(res.SecretKeys, kv.Key)
			}
		}
		parts := make([]string, 0, len(order))
		for _, k := range order {
			parts = append(parts, k+"="+merged[k])
		}
		if err := vaultErr(a.vault.Set(key, strings.Join(parts, "; "))); err != nil {
			return fail(err.Error())
		}
	}
	res.RunStart = RunStart{Status: "ok"}
	return res
}

// gitEnvWarnings: errores típicos en «Variables (.env)» de la app, antes de
// aplicar (salen como avisos en «Qué pasará» y en el asistente).
func gitEnvWarnings(name string, vals map[string]any) []string {
	var out []string
	lines, _ := vals["git_app_env"].([]any)
	var strs []string
	for _, l := range lines {
		if s, ok := l.(string); ok {
			strs = append(strs, s)
		}
	}
	if ls, ok := vals["git_app_env"].([]string); ok {
		strs = append(strs, ls...)
	}
	for _, l := range strs {
		k, v, ok := strings.Cut(l, "=")
		if !ok {
			continue
		}
		k, v = strings.TrimSpace(k), strings.Trim(strings.TrimSpace(v), `"'`)
		lv := strings.ToLower(v)
		switch {
		case k == "NODE_ENV" && v != "" && v != "production" && v != "development" && v != "test":
			out = append(out, fmt.Sprintf("%s: NODE_ENV=%s no es un valor que entiendan las apps de Node (production, development o test); en un servidor, «production». Con otro valor muchas se quedan en modo desarrollo.", name, v))
		case (k == "DEBUG" || k == "APP_DEBUG" || k == "FLASK_DEBUG" || k == "DJANGO_DEBUG") && (lv == "true" || lv == "1" || lv == "yes" || lv == "on"):
			out = append(out, fmt.Sprintf("%s: %s=%s en un servidor enseña los errores (y a veces contraseñas) a cualquiera; ponlo a false.", name, k, v))
		case (k == "RAILS_ENV" || k == "APP_ENV" || k == "FLASK_ENV") && (lv == "development" || lv == "dev" || lv == "local"):
			out = append(out, fmt.Sprintf("%s: %s=%s es para desarrollo; en un servidor, «production».", name, k, v))
		case v == "" && !strings.HasPrefix(k, "#"):
			out = append(out, fmt.Sprintf("%s: %s está vacía. Si la app no la necesita, quita la línea (vacía no es lo mismo que «sin poner»: puede pisar un valor por defecto).", name, k))
		}
	}
	return out
}

// gitPostSuggestion: la orden típica para preparar la base de datos según el
// tipo de app que se ve en el repositorio.
func gitPostSuggestion(files map[string]bool) string {
	switch {
	case files["manage.py"]:
		return "python3 manage.py migrate"
	case files["artisan"]:
		return "php artisan migrate --force"
	case files["bin/rails"]:
		return "bin/rails db:migrate"
	case files["prisma/schema.prisma"]:
		return "npx prisma migrate deploy"
	case files["alembic.ini"]:
		return "alembic upgrade head"
	}
	return ""
}
