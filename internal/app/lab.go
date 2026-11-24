package app

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"draupnode/internal/lab"
	"draupnode/internal/sshx"
	"draupnode/internal/store"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
)

// LabStatus es el estado de la pantalla «Pruebas».
type LabStatus struct {
	Docker      lab.DockerStatus `json:"docker"`
	Server      lab.ServerStatus `json:"server"`
	Keys        []lab.KeyFile    `json:"keys"`
	Fingerprint string           `json:"fingerprint"`
	Host        string           `json:"host"`
	Port        int              `json:"port"`
	User        string           `json:"user"`
	Password    string           `json:"password"`
	CoolifyURL  string           `json:"coolifyUrl"`
	CoolifyUp   bool             `json:"coolifyUp"`          // su panel responde (está instalado)
	ServerID    string           `json:"serverId,omitempty"` // dado de alta en Draupnode
	Busy        string           `json:"busy,omitempty"`     // acción en curso
}

// LabEvent llega a la interfaz por el evento «lab».
type LabEvent struct {
	Action string `json:"action"`
	Kind   string `json:"kind"` // line | done
	Text   string `json:"text,omitempty"`
	OK     bool   `json:"ok,omitempty"`
	Error  string `json:"error,omitempty"`
}

func (a *App) lab() *lab.Lab {
	a.labMu.Lock()
	defer a.labMu.Unlock()
	if a.labMgr == nil {
		a.labMgr = lab.New(filepath.Join(a.store.Dir(), "prueba"))
	}
	return a.labMgr
}

func (a *App) labServerID() string {
	for _, s := range a.store.Servers() {
		if s.Host == lab.Host && s.Port == lab.SSHPort {
			return s.ID
		}
	}
	return ""
}

func (a *App) LabStatus() LabStatus {
	ctx, cancel := context.WithTimeout(a.context(), 15*time.Second)
	defer cancel()
	l := a.lab()
	st := LabStatus{
		Host: lab.Host, Port: lab.SSHPort, User: lab.User, Password: lab.Password,
		CoolifyURL: fmt.Sprintf("http://%s:%d", lab.Host, lab.CoolifyPort),
		ServerID:   a.labServerID(),
	}
	st.Docker = l.Docker(ctx)
	if st.Docker.Problem == lab.ProblemNone {
		st.Server = l.Server(ctx)
	} else if lab.ProbePort() {
		// Sin acceso a Docker no se puede preguntar por el contenedor, pero
		// si su SSH responde, está en marcha y se puede usar igualmente.
		st.Server = lab.ServerStatus{Exists: true, Running: true, ByPort: true}
	}
	if st.Server.Running {
		st.CoolifyUp = webResponds(ctx, st.CoolifyURL)
	}
	st.Keys, _ = l.Keys()
	if st.Keys == nil {
		st.Keys = []lab.KeyFile{}
	}
	if hk, err := l.HostKey(); err == nil {
		st.Fingerprint = ssh.FingerprintSHA256(hk)
	}
	a.labMu.Lock()
	st.Busy = a.labBusy
	a.labMu.Unlock()
	return st
}

// LabAction lanza una acción en segundo plano; el progreso llega por «lab».
// Acciones: fix-missing, fix-daemon, fix-permission, start, stop, remove.
func (a *App) LabAction(action string) error {
	a.labMu.Lock()
	if a.labBusy != "" {
		a.labMu.Unlock()
		return fmt.Errorf("espera a que termine: %s", a.labBusy)
	}
	a.labBusy = action
	a.labMu.Unlock()
	l := a.lab()
	var fn func(ctx context.Context, out func(string)) error
	switch action {
	case "fix-missing", "fix-daemon", "fix-permission":
		problem := map[string]string{"fix-missing": lab.ProblemMissing, "fix-daemon": lab.ProblemDaemon, "fix-permission": lab.ProblemPermission}[action]
		fn = func(ctx context.Context, out func(string)) error { return l.Fix(ctx, problem, out) }
	case "start":
		fn = func(ctx context.Context, out func(string)) error {
			if err := l.Start(ctx, out); err != nil {
				return err
			}
			return a.labTrust()
		}
	case "stop":
		fn = l.Stop
	case "remove":
		fn = l.Remove
	default:
		a.labMu.Lock()
		a.labBusy = ""
		a.labMu.Unlock()
		return errors.New("acción desconocida")
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()
		err := fn(ctx, func(s string) { a.emit("lab", LabEvent{Action: action, Kind: "line", Text: s}) })
		a.labMu.Lock()
		a.labBusy = ""
		a.labMu.Unlock()
		ev := LabEvent{Action: action, Kind: "done", OK: err == nil}
		if err != nil {
			ev.Error = err.Error()
		}
		a.emit("lab", ev)
	}()
	return nil
}

// labTrust deja la huella del servidor de pruebas como conocida.
func (a *App) labTrust() error {
	hk, err := a.lab().HostKey()
	if err != nil {
		return err
	}
	return sshx.TrustHostKey(filepath.Join(a.store.Dir(), "known_hosts"), lab.Host, lab.SSHPort, hk)
}

// LabRegister da de alta el servidor de pruebas en Draupnode (o lo actualiza).
func (a *App) LabRegister() (ServerView, error) {
	keys, err := a.lab().Keys()
	if err != nil {
		return ServerView{}, err
	}
	if err := a.labTrust(); err != nil {
		return ServerView{}, err
	}
	srv := store.Server{
		ID: a.labServerID(), Name: "Servidor de pruebas (Docker)", Host: lab.Host, Port: lab.SSHPort,
		User: lab.User, AuthMethod: store.AuthKey, KeyPath: keys[0].Path,
		Notes: "Ubuntu 24.04 en un contenedor Docker de este equipo (pantalla Pruebas). Se puede borrar y crear de nuevo sin miedo.",
	}
	return a.SaveServer(srv, "", false, "")
}

// OpenURL abre una dirección en el navegador.
func (a *App) OpenURL(url string) {
	// Solo webs: otro esquema (file:, smb:, el de un programa…) podría abrir
	// algo de este equipo si la dirección viene de un módulo o de un servidor.
	if !safeWebURL(url) {
		return
	}
	if a.ctx != nil {
		runtime.BrowserOpenURL(a.ctx, url)
	}
}

// safeWebURL: http:// o https:// con un host, sin espacios ni comillas.
func safeWebURL(u string) bool {
	low := strings.ToLower(u)
	if !strings.HasPrefix(low, "http://") && !strings.HasPrefix(low, "https://") {
		return false
	}
	rest := u[strings.Index(u, "://")+3:]
	return rest != "" && !strings.HasPrefix(rest, "/") && !strings.ContainsAny(u, " \"'<>\\\n\r\t")
}
