package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"draupnode/internal/bundle"
	"draupnode/internal/modules"
	"draupnode/internal/runner"
	"draupnode/internal/store"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
)

// ---------------------------------------------------------------- catálogo

func (a *App) userModulesDir() string { return filepath.Join(a.store.Dir(), "modules") }

func (a *App) cat() *modules.Catalog {
	a.catMu.Lock()
	defer a.catMu.Unlock()
	if a.catalog == nil {
		c, err := modules.Load(a.userModulesDir())
		if err != nil {
			// Los incluidos van dentro del ejecutable: esto solo pasa si se compiló mal.
			panic(err)
		}
		a.catalog = c
	}
	return a.catalog
}

// ModulesInfo es el catálogo para la interfaz.
type ModulesInfo struct {
	Modules []*modules.Module `json:"modules"`
	Errors  []string          `json:"errors"`
	UserDir string            `json:"userDir"`
}

func (a *App) ListModules() ModulesInfo {
	c := a.cat()
	errs := c.Errors
	if errs == nil {
		errs = []string{}
	}
	return ModulesInfo{Modules: c.All(), Errors: errs, UserDir: a.userModulesDir()}
}

// ReloadModules vuelve a leer la carpeta de módulos del usuario.
func (a *App) ReloadModules() ModulesInfo {
	a.catMu.Lock()
	a.catalog = nil
	a.catMu.Unlock()
	return a.ListModules()
}

// ModuleFile devuelve el contenido de un fichero del rol (para verlo).
func (a *App) ModuleFile(id, file string) (string, error) {
	m, ok := a.cat().Get(id)
	if !ok {
		return "", fmt.Errorf("el módulo %q no existe", id)
	}
	b, err := fs.ReadFile(m.Role(), file)
	return string(b), err
}

// OpenModulesDir abre la carpeta de módulos del usuario en el explorador.
func (a *App) OpenModulesDir() error {
	dir := a.userModulesDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return openPath(dir)
}

func openPath(p string) error {
	var cmd *exec.Cmd
	switch goruntime.GOOS {
	case "darwin":
		cmd = exec.Command("open", p)
	case "windows":
		cmd = exec.Command("explorer", p)
	default:
		cmd = exec.Command("xdg-open", p)
	}
	return cmd.Start()
}

// ---------------------------------------------------------------- proyectos

func (a *App) ListProjects() []store.Project {
	p := a.store.Projects()
	if p == nil {
		p = []store.Project{}
	}
	return p
}

// ProjectCheck es el resultado de revisar un proyecto antes de guardarlo o lanzarlo.
type ProjectCheck struct {
	Order    []string                     `json:"order"`    // módulos en el orden de ejecución
	Added    []string                     `json:"added"`    // dependencias añadidas solas
	Errors   map[string]map[string]string `json:"errors"`   // módulo → variable → error
	General  []string                     `json:"general"`  // errores que no son de un campo
	Warnings []string                     `json:"warnings"` // requisitos que el servidor no parece cumplir
}

// OK indica si no hay errores.
func (c ProjectCheck) OK() bool { return len(c.Errors) == 0 && len(c.General) == 0 }

// CheckProject valida módulos, valores y requisitos frente al servidor.
func (a *App) CheckProject(p store.Project) ProjectCheck {
	res, _ := a.resolveProject(p)
	return res
}

func (a *App) resolveProject(p store.Project) (ProjectCheck, []bundle.Selection) {
	res := ProjectCheck{Order: []string{}, Added: []string{}, Errors: map[string]map[string]string{}, General: []string{}, Warnings: []string{}}
	c := a.cat()
	vals := map[string]map[string]any{}
	var ids []string
	for _, pm := range p.Modules {
		ids = append(ids, pm.ID)
		vals[pm.ID] = pm.Values
	}
	if len(ids) == 0 {
		res.General = append(res.General, "elige al menos un módulo")
		return res, nil
	}
	order, added, err := c.Resolve(ids)
	if err != nil {
		res.General = append(res.General, err.Error())
		return res, nil
	}
	res.Order, res.Added = order, added
	if res.Added == nil {
		res.Added = []string{}
	}
	res.General = append(res.General, c.Clashes(order)...)
	var sel []bundle.Selection
	for _, id := range order {
		m, _ := c.Get(id)
		v, errs := m.Values(vals[id])
		// Datos secretos obligatorios: tienen que estar en la bóveda.
		for _, sv := range m.SecretVars() {
			if sv.Required && (p.ID == "" || !a.vault.Has(varName(p.ID, sv.Name))) {
				errs[sv.Name] = "falta: escríbelo (se guarda cifrado en la bóveda)"
			}
		}
		if len(errs) > 0 {
			res.Errors[id] = errs
		}
		sel = append(sel, bundle.Selection{Module: m, Values: v})
	}
	res.Warnings = append(res.Warnings, missingPorts(sel)...)
	srv, srvErr := a.store.Server(p.ServerID)
	if srvErr == nil {
		sshRules(srv, sel, &res)
	}
	if srvErr == nil && srv.LastCheck != nil && srv.LastCheck.OK {
		res.Warnings = append(res.Warnings, requirementWarnings(sel, srv.LastCheck.Facts)...)
	}
	if res.Warnings == nil {
		res.Warnings = []string{} // la interfaz espera una lista, nunca null
	}
	return res, sel
}

// ModulePorts: puertos TCP que necesita abiertos un módulo con estos valores.
func ModulePorts(m *modules.Module, vals map[string]any) []string {
	var out []string
	for _, p := range m.FirewallPorts {
		out = append(out, strconv.Itoa(p))
	}
	for _, name := range m.FirewallPortsFrom {
		if n, ok := vals[name].(int); ok && n > 0 {
			out = append(out, strconv.Itoa(n))
		}
	}
	return out
}

// missingPorts avisa si el Cortafuegos no abre un puerto que necesita otro módulo.
func missingPorts(sel []bundle.Selection) []string {
	var fw []string
	found := false
	for _, s := range sel {
		if s.Module.ID == "firewall" {
			fw, _ = s.Values["firewall_tcp_ports"].([]string)
			found = true
		}
	}
	if !found {
		return nil
	}
	var w []string
	for _, s := range sel {
		for _, p := range ModulePorts(s.Module, s.Values) {
			if p != "22" && !contains(fw, p) {
				w = append(w, fmt.Sprintf("%s necesita el puerto %s y no está en la lista del Cortafuegos: añádelo o no se podrá entrar.", s.Module.Name, p))
			}
		}
	}
	return w
}

func requirementWarnings(sel []bundle.Selection, f map[string]string) []string {
	var w []string
	memMB := atoi(f["mem_kb"]) / 1024
	diskGB := atoi(f["disk_free_kb"]) / 1024 / 1024
	for _, s := range sel {
		r := s.Module.Requires
		if len(r.OS) > 0 && f["os_id"] != "" && !contains(r.OS, f["os_id"]) {
			w = append(w, fmt.Sprintf("%s necesita %s y el servidor es %s", s.Module.Name, strings.Join(r.OS, " o "), f["os"]))
		}
		if r.MinRAMMB > 0 && memMB > 0 && memMB < r.MinRAMMB {
			w = append(w, fmt.Sprintf("%s necesita %d MB de RAM y el servidor tiene %d MB", s.Module.Name, r.MinRAMMB, memMB))
		}
		if r.MinDiskGB > 0 && f["disk_free_kb"] != "" && diskGB < r.MinDiskGB {
			w = append(w, fmt.Sprintf("%s necesita %d GB libres y el servidor tiene %d GB", s.Module.Name, r.MinDiskGB, diskGB))
		}
	}
	return w
}

func atoi(s string) int { n, _ := strconv.Atoi(strings.TrimSpace(s)); return n }

func contains(l []string, s string) bool {
	for _, x := range l {
		if x == s {
			return true
		}
	}
	return false
}

// SaveProject valida y guarda. Las dependencias que falten se añaden al
// proyecto con sus valores por defecto, en el orden de ejecución.
func (a *App) SaveProject(p store.Project) (store.Project, error) {
	if p.ID == "" {
		p.Slug = a.uniqueSlug(p.Name, "")
	} else if old, err := a.store.Project(p.ID); err == nil {
		p.Slug = slugOf(old) // los de antes de la 0.8 se quedan con el de su nombre actual
	}
	// Un proyecto recién creado se guarda sin módulos (se eligen después);
	// para ejecutarlo sí hace falta al menos uno.
	if len(p.Modules) == 0 {
		p.Modules = []store.ProjectModule{}
		return a.store.SaveProject(p)
	}
	chk, sel := a.resolveProject(p)
	if !chk.OK() {
		if len(chk.General) > 0 {
			return store.Project{}, errors.New(strings.Join(chk.General, "; "))
		}
		return store.Project{}, errors.New("revisa los campos marcados en rojo")
	}
	mods := make([]store.ProjectModule, 0, len(sel))
	for _, s := range sel {
		mods = append(mods, store.ProjectModule{ID: s.Module.ID, Values: s.Values})
	}
	p.Modules = mods
	return a.store.SaveProject(p)
}

func (a *App) DeleteProject(id string) error {
	if a.projectRunning(id) {
		return errors.New("el proyecto se está ejecutando: cancélalo antes")
	}
	_ = os.RemoveAll(filepath.Join(a.store.Dir(), "runs", id))
	if err := a.store.DeleteProject(id); err != nil {
		return err
	}
	a.deleteProjectSecrets(id)
	return nil
}

// SetProjectCollapsed recuerda qué ventanas de módulo están plegadas en el editor.
func (a *App) SetProjectCollapsed(id string, modules []string) error {
	return a.store.SetCollapsed(id, modules)
}

// buildScript genera el instalar.sh del proyecto.
// withSecrets: incluye los datos secretos del usuario (al ejecutar desde la
// app); al exportar van fuera y el script los pide.
func (a *App) buildScript(p store.Project, withSecrets bool) ([]byte, store.Server, error) {
	srv, err := a.store.Server(p.ServerID)
	if err != nil {
		return nil, srv, err
	}
	chk, sel := a.resolveProject(p)
	if !chk.OK() {
		msg := strings.Join(chk.General, "; ")
		if msg == "" {
			msg = "el proyecto tiene campos con errores: ábrelo y revísalo"
		}
		return nil, srv, errors.New(msg)
	}
	o := bundle.Options{
		Project: p.Name, Slug: slugOf(p), Host: srv.Host, SSHUser: srv.User, CoolifyURL: coolifyURLFor(srv),
		AppVersion: Version, Now: time.Now(), SSHAuth: srv.AuthMethod,
	}
	if withSecrets {
		if o.Secrets, err = a.secretValues(p.ID, sel); err != nil {
			return nil, srv, vaultErr(err)
		}
	}
	sc, err := bundle.Script(o, sel)
	return sc, srv, err
}

// ExportProject guarda el instalar.sh donde diga el usuario. "" si cancela.
func (a *App) ExportProject(id string) (string, error) {
	p, err := a.store.Project(id)
	if err != nil {
		return "", err
	}
	sc, _, err := a.buildScript(p, false)
	if err != nil {
		return "", err
	}
	home, _ := os.UserHomeDir()
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:            "Guardar instalar.sh",
		DefaultDirectory: home,
		DefaultFilename:  "instalar-" + slugOf(p) + ".sh",
		Filters:          []runtime.FileFilter{{DisplayName: "Script bash (*.sh)", Pattern: "*.sh"}},
	})
	if err != nil || path == "" {
		return "", err
	}
	if err := os.WriteFile(path, sc, 0o755); err != nil {
		return "", err
	}
	return path, nil
}

// ---------------------------------------------------------------- ejecución

// RunStart es la respuesta al pedir una ejecución.
type RunStart struct {
	// started | needs_secret | bad_secret | vault_locked | vault_missing | unknown_host | host_changed | needs_sudo | bad_sudo | busy | error
	Status      string `json:"status"`
	RunID       string `json:"runId,omitempty"`
	Message     string `json:"message,omitempty"`
	SecretKind  string `json:"secretKind,omitempty"`
	KeyType     string `json:"keyType,omitempty"`
	Fingerprint string `json:"fingerprint,omitempty"`
}

// RunEvent es lo que recibe la interfaz por el evento «run».
type RunEvent struct {
	RunID     string            `json:"runId"`
	ProjectID string            `json:"projectId"`
	Kind      string            `json:"kind"` // line | ev | done
	Text      string            `json:"text,omitempty"`
	Ev        map[string]any    `json:"ev,omitempty"`
	Summary   *store.RunSummary `json:"summary,omitempty"`
}

func (a *App) projectRunning(id string) bool {
	a.runMu.Lock()
	defer a.runMu.Unlock()
	_, ok := a.runs["p:"+id]
	return ok
}

func newRunID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// RunProject aplica el proyecto (check=true: solo enseña lo que cambiaría).
// secret/accept/sudoPassword se usan cuando una llamada anterior los pidió.
func (a *App) RunProject(id string, check bool, secret, accept, sudoPassword string) RunStart {
	p, err := a.store.Project(id)
	if err != nil {
		return RunStart{Status: "error", Message: err.Error()}
	}
	if a.projectRunning(id) {
		return RunStart{Status: "busy", Message: "este proyecto ya se está ejecutando"}
	}
	// Contraseñas del proyecto: la bóveda tiene que existir y estar abierta
	// para guardar lo que se genere (al aplicar) o leer lo que escribiste.
	if _, sel := a.resolveProject(p); projectNeedsVault(sel, check) {
		st := a.vault.Status()
		if !st.Exists {
			return RunStart{Status: "vault_missing", Message: "Las contraseñas de este proyecto se guardan en la bóveda cifrada de Draupnode: créala primero."}
		}
		if !st.Unlocked {
			return RunStart{Status: "vault_locked", Message: "Desbloquea la bóveda: ahí se guardan las contraseñas de este proyecto."}
		}
	}
	script, srv, err := a.buildScript(p, true)
	if err != nil {
		if strings.HasPrefix(err.Error(), codeVaultLocked) {
			return RunStart{Status: "vault_locked"}
		}
		return RunStart{Status: "error", Message: err.Error()}
	}
	return a.launch(p, srv, script, runMode{check: check}, secret, accept, sudoPassword)
}

// runMode: qué hace una ejecución.
type runMode struct {
	check     bool
	uninstall []string // módulos que se desinstalan (vacío = instalar/aplicar)
}

func (m runMode) label() string {
	switch {
	case len(m.uninstall) > 0:
		return "desinstalar"
	case m.check:
		return "previsualizar"
	}
	return "aplicar"
}

// launch conecta (pidiendo lo que haga falta), comprueba sudo y lanza el
// script en segundo plano.
// connectSudo conecta al servidor y comprueba que se puede ser root. Si falta
// algo (contraseña, huella, sudo…) devuelve qué pedir, como RunStart.
func (a *App) connectSudo(srv store.Server, secret, accept, sudoPassword string) (*ssh.Client, runner.Sudo, *RunStart) {
	kind := "passphrase"
	if srv.AuthMethod == store.AuthPassword {
		kind = "password"
	}
	secret, st := a.secretFor(srv, secret)
	if st != "" {
		return nil, runner.Sudo{}, &RunStart{Status: st, SecretKind: kind}
	}
	dctx, dcancel := context.WithTimeout(a.context(), 30*time.Second)
	c, fail := a.connect(dctx, srv, secret, accept)
	dcancel()
	if fail != nil {
		return nil, runner.Sudo{}, &RunStart{Status: fail.Status, Message: fail.Message, SecretKind: kind, KeyType: fail.KeyType, Fingerprint: fail.Fingerprint}
	}
	// Con usuario y contraseña, la de sudo suele ser la misma: se prueba sola.
	if sudoPassword == "" && srv.AuthMethod == store.AuthPassword {
		if runner.CheckSudo(c, runner.Sudo{IsRoot: srv.User == "root"}) != nil {
			sudoPassword = secret
		}
	}
	su := runner.Sudo{IsRoot: srv.User == "root", Password: sudoPassword}
	if err := runner.CheckSudo(c, su); err != nil {
		c.Close()
		if errors.Is(err, runner.ErrBadSudoPassword) && srv.AuthMethod != store.AuthPassword {
			return nil, runner.Sudo{}, &RunStart{Status: "bad_sudo", Message: err.Error()}
		}
		return nil, runner.Sudo{}, &RunStart{Status: "needs_sudo", Message: runner.ErrSudoPassword.Error()}
	}

	return c, su, nil
}

func (a *App) launch(p store.Project, srv store.Server, script []byte, mode runMode, secret, accept, sudoPassword string) RunStart {
	id := p.ID
	c, su, fail := a.connectSudo(srv, secret, accept, sudoPassword)
	if fail != nil {
		return *fail
	}

	runID := newRunID()
	ctx, cancel := context.WithCancel(context.Background())
	a.runMu.Lock()
	a.runs[runID] = cancel
	a.runs["p:"+id] = cancel
	a.runMu.Unlock()
	go a.runInBackground(ctx, runID, p, c, script, mode, su)
	return RunStart{Status: "started", RunID: runID}
}

// CancelRun detiene una ejecución en marcha.
func (a *App) CancelRun(runID string) bool {
	a.runMu.Lock()
	cancel, ok := a.runs[runID]
	a.runMu.Unlock()
	if ok {
		cancel()
	}
	return ok
}

func (a *App) runInBackground(ctx context.Context, runID string, p store.Project, c *ssh.Client, script []byte, rm runMode, su runner.Sudo) {
	check := rm.check
	start := time.Now()
	defer func() {
		_ = c.Close()
		a.runMu.Lock()
		delete(a.runs, runID)
		delete(a.runs, "p:"+p.ID)
		a.runMu.Unlock()
	}()
	mode := rm.label()
	logDir := filepath.Join(a.store.Dir(), "runs", p.ID)
	_ = os.MkdirAll(logDir, 0o700)
	logPath := filepath.Join(logDir, start.Format("2006-01-02_15-04-05")+"-"+mode+".log")
	lf, _ := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	var lw *bufio.Writer
	if lf != nil {
		lw = bufio.NewWriter(lf)
		fmt.Fprintf(lw, "# Draupnode %s · %s · %s · %s\n", Version, p.Name, mode, start.Format(time.RFC3339))
	}
	sum := store.RunSummary{At: start, Check: check, LogFile: logPath, Uninstall: len(rm.uninstall) > 0}
	send := func(e RunEvent) {
		e.RunID, e.ProjectID = runID, p.ID
		a.emit("run", e)
	}
	var secretsMsg string
	code, err := runner.RunOpts(ctx, c, script, runner.Opts{Check: check, SecretsBack: len(rm.uninstall) == 0 || a.vault.Status().Unlocked}, su, func(e runner.Event) {
		if e.Kind == "secrets" {
			// Nunca al registro ni a la interfaz: directo a la bóveda.
			n, err := a.storeGenerated(p.ID, e.Text)
			switch {
			case err != nil:
				secretsMsg = "No se pudieron guardar en la bóveda las contraseñas generadas: " + vaultErr(err).Error() + ". Vuelve a Aplicar con la bóveda desbloqueada."
			case n > 0 && len(rm.uninstall) == 0:
				secretsMsg = fmt.Sprintf("%d contraseña(s) del servidor guardadas en tu bóveda: míralas en «Contraseñas del proyecto».", n)
			}
			return
		}
		if lw != nil {
			writeLog(lw, e)
		}
		if e.Kind == "ev" {
			switch e.Ev["ev"] {
			case "task":
				sum.Tasks++
			case "stats":
				sum.Changed = toInt(e.Ev["changed"])
				sum.Failed = toInt(e.Ev["failures"]) + toInt(e.Ev["unreachable"])
			}
		}
		send(RunEvent{Kind: e.Kind, Text: e.Text, Ev: e.Ev})
	})
	sum.Duration = time.Since(start).Milliseconds()
	switch {
	case errors.Is(err, context.Canceled):
		sum.Canceled, sum.Error = true, "cancelado"
	case err != nil:
		sum.Error = err.Error()
	case code != 0:
		sum.Error = fmt.Sprintf("terminó con errores (código %d)", code)
	default:
		sum.OK = true
	}
	// Avisos de Draupnode: salen en «Para que lo sepas» y en el registro.
	notice := func(msg string) {
		if lw != nil {
			fmt.Fprintf(lw, "NOTA DE DRAUPNODE: %s\n", msg)
		}
		send(RunEvent{Kind: "ev", Ev: map[string]any{"ev": "notice", "msg": msg}})
	}
	if secretsMsg != "" {
		notice(secretsMsg)
	}
	switch {
	case sum.OK && len(rm.uninstall) > 0:
		if err := a.store.MarkUninstalled(p.ID, rm.uninstall); err != nil {
			notice("Desinstalado, pero no se pudo actualizar el proyecto: " + err.Error())
		} else {
			names := make([]string, len(rm.uninstall))
			for i, m := range rm.uninstall {
				names[i] = m
				if mod, ok := a.cat().Get(m); ok {
					names[i] = mod.Name
				}
			}
			notice("Desinstalado del servidor: " + strings.Join(names, ", ") + ". Ya no forma parte del proyecto.")
		}
	case sum.OK && !check:
		if msg := a.afterApply(p); msg != "" {
			notice(msg)
		}
	}
	if lw != nil {
		fmt.Fprintf(lw, "# Fin: ok=%v cambios=%d fallos=%d %s\n", sum.OK, sum.Changed, sum.Failed, sum.Error)
		_ = lw.Flush()
		_ = lf.Close()
	}
	_ = a.store.SetLastRun(p.ID, sum)
	send(RunEvent{Kind: "done", Summary: &sum})
}

func writeLog(w *bufio.Writer, e runner.Event) {
	if e.Kind != "ev" {
		fmt.Fprintln(w, e.Text)
		return
	}
	ev := e.Ev
	switch ev["ev"] {
	case "stage":
		fmt.Fprintf(w, "\n==> %v\n", ev["name"])
	case "play":
		fmt.Fprintf(w, "\nPLAY %v\n", ev["name"])
	case "task":
		fmt.Fprintf(w, "TASK %v\n", ev["name"])
	case "ok":
		if ev["changed"] == true {
			fmt.Fprintln(w, "  cambiado")
		} else {
			fmt.Fprintln(w, "  ok")
		}
		if n, ok := ev["note"]; ok {
			fmt.Fprintf(w, "  NOTA: %v\n", n)
		}
	case "skipped":
		fmt.Fprintln(w, "  omitido")
	case "failed", "item_failed":
		fmt.Fprintf(w, "  FALLO: %v\n", ev["msg"])
	case "diff":
		fmt.Fprintln(w, ev["text"])
	case "stats":
		fmt.Fprintf(w, "\nRESUMEN ok=%v cambios=%v fallos=%v omitidos=%v\n", ev["ok"], ev["changed"], ev["failures"], ev["skipped"])
	}
}

func toInt(v any) int {
	switch x := v.(type) {
	case float64:
		return int(x)
	case int:
		return x
	}
	return 0
}

// RunLogs lista los registros de ejecución de un proyecto (más reciente primero).
func (a *App) RunLogs(projectID string) []string {
	ents, _ := os.ReadDir(filepath.Join(a.store.Dir(), "runs", projectID))
	var out []string
	for _, e := range ents {
		if strings.HasSuffix(e.Name(), ".log") {
			out = append(out, e.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(out)))
	if out == nil {
		out = []string{}
	}
	return out
}

// ReadRunLog devuelve un registro de ejecución.
func (a *App) ReadRunLog(projectID, name string) (string, error) {
	if strings.ContainsAny(name, `/\`) || !strings.HasSuffix(name, ".log") {
		return "", errors.New("nombre no válido")
	}
	b, err := os.ReadFile(filepath.Join(a.store.Dir(), "runs", projectID, name))
	return string(b), err
}
