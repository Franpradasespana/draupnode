package app

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"

	"draupnode/internal/bundle"
	"draupnode/internal/i18n"
	"draupnode/internal/runner"
	"draupnode/internal/store"
)

// «¿Ha cambiado algo a mano?»: se simula la aplicación (Ansible --check) de
// los módulos del servidor tal y como se aplicaron. Si todo sigue como lo dejó
// Draupnode no sale nada; lo que saldría cambiado es que alguien lo tocó fuera
// de la app. Además se miran los temporizadores de Draupnode y los contenedores
// de sus módulos, que la simulación no puede ver (no arranca servicios).

// DriftItem es una cosa del servidor que ya no está como la dejó Draupnode.
type DriftItem struct {
	Kind   string `json:"kind"`             // config | timer | container
	Module string `json:"module,omitempty"` // id del módulo (config)
	Name   string `json:"name"`             // tarea, temporizador o contenedor
	Diff   string `json:"diff,omitempty"`
	Key    string `json:"key"`
}

// DriftReport es el resultado de la última comprobación de un servidor.
type DriftReport struct {
	At time.Time `json:"at"`
	// Skipped: por qué no se comprobó (pending = hay cambios sin aplicar;
	// never = aún no se ha aplicado). Vacío = se comprobó.
	Skipped string      `json:"skipped,omitempty"`
	Error   string      `json:"error,omitempty"`
	Items   []DriftItem `json:"items"`
	// Accepted: claves que el usuario dio por buenas («Dejarlo así»): no avisan.
	Accepted []string `json:"accepted,omitempty"`
	Duration int64    `json:"duration"`
	// Baseline: temporizadores y contenedores en marcha al terminar la última
	// aplicación (timer:x, container:y). Si luego se paran, es un desvío.
	Baseline   []string  `json:"baseline,omitempty"`
	BaselineAt time.Time `json:"baselineAt,omitempty"`
}

// DriftResult es la respuesta de CheckDrift.
type DriftResult struct {
	RunStart
	Report *DriftReport `json:"report,omitempty"`
}

func (a *App) driftPath(serverID string) string {
	if !cacheIDRe.MatchString(serverID) {
		return ""
	}
	return filepath.Join(a.store.Dir(), "desvios", serverID+".json")
}

func (a *App) loadDrift(serverID string) (DriftReport, bool) {
	var r DriftReport
	p := a.driftPath(serverID)
	if p == "" {
		return r, false
	}
	b, err := os.ReadFile(p)
	if err != nil || json.Unmarshal(b, &r) != nil {
		return r, false
	}
	return r, true
}

func (a *App) saveDrift(serverID string, r DriftReport) {
	p := a.driftPath(serverID)
	if p == "" {
		return
	}
	b, err := json.Marshal(r)
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(p), 0o700)
	tmp := p + ".tmp"
	if os.WriteFile(tmp, b, 0o600) == nil {
		_ = os.Rename(tmp, p)
	}
}

// LastDrifts: la última comprobación de cada servidor (los nunca comprobados no salen).
func (a *App) LastDrifts() map[string]DriftReport {
	out := map[string]DriftReport{}
	for _, s := range a.store.Servers() {
		if r, ok := a.loadDrift(s.ID); ok {
			out[s.ID] = r
		}
	}
	return out
}

// AcceptDrift da por buenas las diferencias de ahora (todas si keys está
// vacío): no vuelven a avisar mientras sigan igual.
func (a *App) AcceptDrift(serverID string, keys []string) (DriftReport, error) {
	r, ok := a.loadDrift(serverID)
	if !ok {
		return r, errText(i18n.T("este servidor aún no se ha comprobado"))
	}
	if len(keys) == 0 {
		for _, it := range r.Items {
			keys = append(keys, it.Key)
		}
	}
	for _, k := range keys {
		if !contains(r.Accepted, k) {
			r.Accepted = append(r.Accepted, k)
		}
	}
	sort.Strings(r.Accepted)
	a.saveDrift(serverID, r)
	return r, nil
}

// ForgetAcceptedDrift vuelve a avisar de todo lo que se dio por bueno.
func (a *App) ForgetAcceptedDrift(serverID string) (DriftReport, error) {
	r, ok := a.loadDrift(serverID)
	if !ok {
		return r, errText(i18n.T("este servidor aún no se ha comprobado"))
	}
	r.Accepted = nil
	a.saveDrift(serverID, r)
	return r, nil
}

type errText string

func (e errText) Error() string { return string(e) }

// pendingChanges: ¿hay módulos sin aplicar o con valores cambiados desde que se aplicaron?
func pendingChanges(p store.Project) bool {
	for _, m := range p.Modules {
		if !contains(p.InstalledModules, m.ID) {
			return true
		}
		if !sameJSON(m.Values, p.InstalledValues[m.ID]) {
			return true
		}
	}
	return false
}

func sameJSON(a, b map[string]any) bool {
	if len(a) == 0 && len(b) == 0 {
		return true
	}
	x, _ := json.Marshal(a) // json.Marshal ordena las claves de los mapas
	y, _ := json.Marshal(b)
	return string(x) == string(y)
}

// CheckDrift comprueba si algo del servidor ha cambiado fuera de Draupnode.
// Solo lee: la simulación no toca nada (lo que sube de «carpeta» va a una
// carpeta temporal que se borra).
func (a *App) CheckDrift(serverID, secret, accept, sudoPassword string) DriftResult {
	prev, _ := a.loadDrift(serverID)
	rep := DriftReport{At: time.Now(), Items: []DriftItem{}, Accepted: prev.Accepted, Baseline: prev.Baseline, BaselineAt: prev.BaselineAt}
	p, ok := a.store.ServerProject(serverID)
	switch {
	case !ok || len(p.Modules) == 0 || len(p.InstalledModules) == 0:
		rep.Skipped = "never"
	case pendingChanges(p):
		rep.Skipped = "pending"
	}
	if rep.Skipped != "" {
		a.saveDrift(serverID, rep)
		return DriftResult{RunStart: RunStart{Status: "ok"}, Report: &rep}
	}
	if a.projectRunning(p.ID) {
		return DriftResult{RunStart: RunStart{Status: "busy", Message: i18n.T("ya hay una tarea en marcha en este servidor")}}
	}
	if _, sel := a.resolveProject(p); projectNeedsVault(sel, true) && !a.vault.Status().Unlocked {
		return DriftResult{RunStart: RunStart{Status: "vault_locked", Message: i18n.T("Desbloquea la bóveda: ahí se guardan las contraseñas de este servidor.")}}
	}
	script, srv, err := a.buildScript(p, true)
	if err != nil {
		if strings.HasPrefix(err.Error(), codeVaultLocked) {
			return DriftResult{RunStart: RunStart{Status: "vault_locked"}}
		}
		return DriftResult{RunStart: RunStart{Status: "error", Message: err.Error()}}
	}
	c, su, fail := a.connectSudo(srv, secret, accept, sudoPassword)
	if fail != nil {
		return DriftResult{RunStart: *fail}
	}
	defer c.Close()

	// Ocupa el servidor mientras dura, para que no se aplique a la vez.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	a.runMu.Lock()
	if _, busy := a.runs["p:"+p.ID]; busy {
		a.runMu.Unlock()
		return DriftResult{RunStart: RunStart{Status: "busy", Message: i18n.T("ya hay una tarea en marcha en este servidor")}}
	}
	a.runs["p:"+p.ID] = cancel
	a.runMu.Unlock()
	defer func() {
		a.runMu.Lock()
		delete(a.runs, "p:"+p.ID)
		a.runMu.Unlock()
	}()

	start := time.Now()
	items, now, err := a.driftCheck(ctx, c, su, p, script)
	switch {
	case err != nil:
		// Sin saber qué hay en marcha no se compara.
	case prev.Baseline == nil:
		// Aplicado con una versión anterior: lo de ahora sirve de base.
		rep.Baseline, rep.BaselineAt = now, time.Now()
	default:
		items = append(items, stoppedSince(prev.Baseline, now)...)
	}
	rep.Duration = time.Since(start).Milliseconds()
	if err != nil {
		rep.Error = err.Error()
	}
	rep.Items = items
	// Lo aceptado que ya no sale se olvida (si vuelve a pasar, vuelve a avisar).
	var keep []string
	for _, k := range rep.Accepted {
		for _, it := range items {
			if it.Key == k {
				keep = append(keep, k)
				break
			}
		}
	}
	rep.Accepted = keep
	a.saveDrift(serverID, rep)
	return DriftResult{RunStart: RunStart{Status: "ok"}, Report: &rep}
}

func (a *App) driftCheck(ctx context.Context, c *ssh.Client, su runner.Sudo, p store.Project, script []byte) (items []DriftItem, running []string, err error) {
	slug := slugOf(p)
	if len(localApps(p)) > 0 {
		defer func() { _, _, _ = execOut(c, su, "rm -rf "+bundle.ShellQuote(simDir(slug))) }()
		if err := a.uploadLocalAppsTo(ctx, c, su, p, simDir(slug), func(string) {}); err != nil {
			return nil, nil, err
		}
	}
	items = []DriftItem{}
	var task, role, diff string
	var handler bool
	failed := ""
	code, rerr := runner.RunOpts(ctx, c, script, runner.Opts{Check: true}, su, func(e runner.Event) {
		if e.Kind != "ev" {
			return
		}
		switch e.Ev["ev"] {
		case "task":
			task, _ = e.Ev["name"].(string)
			role, _ = e.Ev["role"].(string)
			handler, _ = e.Ev["handler"].(bool)
			diff = ""
		case "diff":
			if t, _ := e.Ev["text"].(string); t != "" {
				diff += cleanDiff(t)
			}
		case "ok":
			if ch, _ := e.Ev["changed"].(bool); ch && !handler && !strings.HasPrefix(role, "draupnode_") {
				name := task
				if i := strings.Index(name, " : "); i >= 0 {
					name = strings.TrimSpace(name[i+3:])
				}
				items = append(items, DriftItem{Kind: "config", Module: role, Name: name, Diff: diff, Key: "config:" + role + ":" + name})
			}
		case "failed":
			if ig, _ := e.Ev["ignored"].(bool); !ig && failed == "" {
				failed, _ = e.Ev["msg"].(string)
				if failed == "" {
					failed = task
				}
			}
		}
	})
	switch {
	case rerr != nil:
		return items, nil, rerr
	case code != 0:
		msg := i18n.Sprintf("la simulación terminó con errores (código %d)", code)
		if failed != "" {
			msg += ": " + firstLine(failed, nil)
		}
		return items, nil, errText(msg)
	}
	out, _, err := execOut(c, su, driftStateScript(slug))
	if err != nil {
		return items, nil, errText(i18n.T("no se pudo ver qué hay en marcha: ") + err.Error())
	}
	return items, parseState(out), nil
}

// driftStateScript lista lo que está en marcha y la simulación no ve: los
// temporizadores de Draupnode activos y los contenedores de sus módulos que
// corren (sin contar los de un solo uso, que no se reinician).
func driftStateScript(slug string) string {
	return `for f in /etc/systemd/system/draupnode-*.timer; do
  [ -e "$f" ] || continue
  u=$(basename "$f")
  if systemctl is-enabled --quiet "$u" && systemctl is-active --quiet "$u"; then echo "timer $u"; fi
done
if command -v docker >/dev/null 2>&1; then
  docker ps -q --filter label=draupnode.proyecto=` + bundle.ShellQuote(slug) + ` 2>/dev/null |
    xargs -r docker inspect -f '{{.HostConfig.RestartPolicy.Name}} {{.Name}}' 2>/dev/null |
    awk '$1 != "no" && $1 != "" { sub("^/", "", $2); print "container " $2 }'
fi
`
}

// parseState: «timer x» / «container y» → claves timer:x, container:y.
func parseState(out string) []string {
	var keys []string
	for _, l := range strings.Split(out, "\n") {
		kind, name, ok := strings.Cut(strings.TrimSpace(l), " ")
		if !ok || name == "" || (kind != "timer" && kind != "container") {
			continue
		}
		keys = append(keys, kind+":"+name)
	}
	sort.Strings(keys)
	return keys
}

// stoppedSince: lo que estaba en marcha al aplicar (base) y ahora no.
func stoppedSince(base, now []string) []DriftItem {
	var items []DriftItem
	for _, k := range base {
		if contains(now, k) {
			continue
		}
		kind, name, _ := strings.Cut(k, ":")
		items = append(items, DriftItem{Kind: kind, Name: name, Key: k})
	}
	return items
}

// saveDriftBaseline apunta, justo después de aplicar bien, lo que queda en
// marcha: la próxima comprobación avisa si algo de eso se ha parado.
func (a *App) saveDriftBaseline(c *ssh.Client, su runner.Sudo, p store.Project) {
	out, _, err := execOut(c, su, driftStateScript(slugOf(p)))
	if err != nil {
		return
	}
	r, _ := a.loadDrift(p.ServerID)
	// Recién aplicado: todo está como dice Draupnode.
	now := time.Now()
	a.saveDrift(p.ServerID, DriftReport{At: now, Items: []DriftItem{}, Baseline: parseState(out), BaselineAt: now, Accepted: r.Accepted})
}

// La plantilla se compara desde una copia temporal de Ansible: en la cabecera
// del diff sale esa ruta, que no dice nada. Se pone la del fichero de verdad.
var tmpAfterRe = regexp.MustCompile(`(?m)^\+\+\+ after: /\S*/\.ansible/tmp/\S*$`)

func cleanDiff(d string) string {
	before := ""
	for _, l := range strings.SplitN(d, "\n", 3) {
		if strings.HasPrefix(l, "--- before: ") {
			before = strings.TrimPrefix(l, "--- before: ")
		}
	}
	if before == "" {
		before = "(Draupnode)"
	}
	return tmpAfterRe.ReplaceAllString(d, "+++ after: "+before)
}
