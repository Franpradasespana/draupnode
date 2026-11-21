package main

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"sync"
	"time"

	"draupnode/internal/lab"
	"draupnode/internal/modules"
	"draupnode/internal/secrets"
	"draupnode/internal/sshx"
	"draupnode/internal/store"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
)

// Version de la aplicación.
const Version = "0.21.0"

// Prefijos que la interfaz reconoce en los errores para abrir el diálogo
// de la bóveda (crear o desbloquear) y reintentar.
const (
	codeVaultLocked  = "VAULT_LOCKED: "
	codeVaultMissing = "VAULT_MISSING: "
)

// App es el objeto que la interfaz llama (Wails genera los enlaces JS).
type App struct {
	ctx     context.Context
	store   *store.Store
	keyring secrets.Keyring
	vault   *secrets.Vault

	catMu   sync.Mutex
	catalog *modules.Catalog

	runMu   sync.Mutex
	runs    map[string]context.CancelFunc // ejecuciones en marcha
	labMu   sync.Mutex
	labMgr  *lab.Lab
	labBusy string

	tunMu   sync.Mutex
	tunnels map[string]*tunnel // túneles SSH abiertos (Grafana, Prometheus), por proyecto

	// emit envía eventos a la interfaz (sustituible en tests).
	emit func(name string, data any)
}

// NewApp crea la aplicación con el almacén ya abierto.
func NewApp(st *store.Store, kr secrets.Keyring, v *secrets.Vault) *App {
	a := &App{store: st, keyring: kr, vault: v, runs: map[string]context.CancelFunc{}, tunnels: map[string]*tunnel{}}
	a.emit = func(name string, data any) {
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, name, data)
		}
	}
	return a
}

func (a *App) startup(ctx context.Context) { a.ctx = ctx }

func (a *App) context() context.Context {
	if a.ctx != nil {
		return a.ctx
	}
	return context.Background()
}

// ---------------------------------------------------------------- info

type AppInfo struct {
	Version   string `json:"version"`
	ConfigDir string `json:"configDir"`
	OS        string `json:"os"`
}

func (a *App) AppInfo() AppInfo {
	return AppInfo{Version: Version, ConfigDir: a.store.Dir(), OS: goruntime.GOOS}
}

// ---------------------------------------------------------------- dónde guardar contraseñas

type KeyringInfo struct {
	Available bool   `json:"available"`
	Name      string `json:"name"`
	// Suggestions: qué instalar si no hay llavero (según el sistema).
	Suggestions []secrets.Suggestion `json:"suggestions,omitempty"`
}

// SecretsInfo explica a la interfaz qué almacenes hay y cuál se usará.
type SecretsInfo struct {
	Keyring   KeyringInfo    `json:"keyring"`
	Vault     secrets.Status `json:"vault"`
	Backend   string         `json:"backend"`   // preferencia: auto | keyring | vault
	Effective string         `json:"effective"` // el que se usará: keyring | vault
}

func (a *App) SecretsInfo() SecretsInfo {
	kr := KeyringInfo{Available: secrets.Available(a.keyring), Name: secrets.SystemKeyringName()}
	if !kr.Available {
		kr.Suggestions = secrets.KeyringSuggestions(goruntime.GOOS, func(n string) bool {
			_, err := exec.LookPath(n)
			return err == nil
		})
	}
	b := a.store.Settings().SecretBackend
	if b == "" {
		b = "auto"
	}
	eff := store.SecretVault
	if (b == "auto" || b == "keyring") && kr.Available {
		eff = store.SecretKeyring
	}
	return SecretsInfo{Keyring: kr, Vault: a.vault.Status(), Backend: b, Effective: eff}
}

func (a *App) SetSecretBackend(b string) error {
	if b != "auto" && b != "keyring" && b != "vault" {
		return errors.New("opción no válida")
	}
	st := a.store.Settings()
	st.SecretBackend = b
	return a.store.SaveSettings(st)
}

func (a *App) VaultCreate(master string) error { return a.vault.Create(master) }
func (a *App) VaultUnlock(master string) error { return a.vault.Unlock(master) }
func (a *App) VaultLock()                      { a.vault.Lock() }

func (a *App) backend(name string) secrets.Keyring {
	if name == store.SecretVault {
		return a.vault
	}
	return a.keyring
}

func vaultErr(err error) error {
	switch {
	case errors.Is(err, secrets.ErrLocked):
		return errors.New(codeVaultLocked + err.Error())
	case errors.Is(err, secrets.ErrNoVault):
		return errors.New(codeVaultMissing + err.Error())
	}
	return err
}

// ---------------------------------------------------------------- servidores

// ServerView añade a Server si tiene la contraseña guardada.
type ServerView struct {
	store.Server
	HasSecret bool `json:"hasSecret"`
}

func (a *App) view(s store.Server) ServerView {
	has := false
	switch s.SecretStore {
	case store.SecretVault:
		has = a.vault.Has(secrets.SecretName(s.ID))
	case store.SecretKeyring:
		_, err := a.keyring.Get(secrets.SecretName(s.ID))
		has = err == nil
	}
	return ServerView{Server: s, HasSecret: has}
}

func (a *App) ListServers() []ServerView {
	out := []ServerView{}
	for _, s := range a.store.Servers() {
		out = append(out, a.view(s))
	}
	return out
}

func needsSecret(s store.Server) bool {
	return s.AuthMethod == store.AuthPassword || (s.AuthMethod == store.AuthKey && s.KeyEncrypted)
}

func (a *App) forgetSecret(id string) {
	name := secrets.SecretName(id)
	_ = a.keyring.Delete(name)
	_ = a.vault.Delete(name)
}

// SaveServer crea o actualiza un servidor.
//   - saveSecret=false            → no se guarda contraseña (se pedirá al conectar).
//   - saveSecret=true y secret    → se guarda en storeChoice.
//   - saveSecret=true sin secret  → se conserva la que hubiera; si storeChoice
//     es otro almacén, se mueve allí sin tener que volver a escribirla.
//
// storeChoice: "keyring" (llavero del sistema), "vault" (bóveda de Draupnode)
// o "" (la preferencia de Ajustes).
func (a *App) SaveServer(srv store.Server, secret string, saveSecret bool, storeChoice string) (ServerView, error) {
	var old *store.Server
	if srv.ID != "" {
		if o, err := a.store.Server(srv.ID); err == nil {
			old = &o
		}
	}
	info := a.SecretsInfo()
	target := info.Effective
	switch storeChoice {
	case "":
	case store.SecretKeyring:
		if !info.Keyring.Available {
			return ServerView{}, errors.New("este equipo no tiene llavero del sistema disponible; elige la bóveda cifrada")
		}
		target = storeChoice
	case store.SecretVault:
		target = storeChoice
	default:
		return ServerView{}, errors.New("almacén de contraseñas no válido")
	}
	oldStore := ""
	if old != nil {
		oldStore = old.SecretStore
	}
	authChanged := old != nil && old.AuthMethod != srv.AuthMethod
	keep := saveSecret && needsSecret(srv) && !authChanged
	// ¿Hay que mover una contraseña ya guardada a otro almacén?
	move := keep && secret == "" && oldStore != "" && oldStore != target
	if move {
		v, err := a.backend(oldStore).Get(secrets.SecretName(srv.ID))
		if err != nil {
			return ServerView{}, vaultErr(err)
		}
		secret = v
	}
	// Si va a hacer falta la bóveda, comprobarlo ANTES de guardar nada.
	if keep && secret != "" && target == store.SecretVault {
		if st := a.vault.Status(); !st.Exists {
			return ServerView{}, vaultErr(secrets.ErrNoVault)
		} else if !st.Unlocked {
			return ServerView{}, vaultErr(secrets.ErrLocked)
		}
	}
	srv.SecretStore = oldStore
	saved, err := a.store.SaveServer(srv)
	if err != nil {
		return ServerView{}, err
	}
	name := secrets.SecretName(saved.ID)
	switch {
	case !needsSecret(saved) || !saveSecret || (authChanged && secret == ""):
		a.forgetSecret(saved.ID)
		saved.SecretStore = ""
	case secret != "":
		if err := a.backend(target).Set(name, secret); err != nil {
			return a.view(saved), vaultErr(err)
		}
		// Que no quede una copia en el otro almacén.
		other := store.SecretKeyring
		if target == store.SecretKeyring {
			other = store.SecretVault
		}
		_ = a.backend(other).Delete(name)
		saved.SecretStore = target
	}
	saved, err = a.store.SaveServer(saved)
	if err != nil {
		return ServerView{}, err
	}
	return a.view(saved), nil
}

func (a *App) DeleteServer(id string) error {
	// Primero el servidor (falla si lo usa un proyecto); después su contraseña.
	if err := a.store.DeleteServer(id); err != nil {
		return err
	}
	a.forgetSecret(id)
	return nil
}

// ---------------------------------------------------------------- claves y ~/.ssh

type KeyResult struct {
	sshx.KeyInfo
	Error string `json:"error,omitempty"`
}

func (a *App) InspectKey(path string) KeyResult {
	ki, err := sshx.InspectKey(path)
	if err != nil {
		return KeyResult{KeyInfo: ki, Error: err.Error()}
	}
	return KeyResult{KeyInfo: ki}
}

// FindKeys lista las claves privadas de ~/.ssh y de ~/.ssh/config.
func (a *App) FindKeys() []sshx.KeyInfo {
	k := sshx.FindKeys()
	if k == nil {
		k = []sshx.KeyInfo{}
	}
	return k
}

// SSHConfigHosts lista los «Host» de ~/.ssh/config para importarlos.
func (a *App) SSHConfigHosts() []sshx.ConfigHost {
	h := sshx.ReadSSHConfig()
	if h == nil {
		h = []sshx.ConfigHost{}
	}
	return h
}

// PickKeyFile abre el diálogo del sistema para elegir la clave privada.
func (a *App) PickKeyFile() (string, error) {
	dir := sshx.ExpandHome("~/.ssh")
	if _, err := os.Stat(dir); err != nil {
		dir = sshx.ExpandHome("~")
	}
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Elige tu clave privada SSH (.key, .pem, .ppk, id_*)",
		DefaultDirectory: dir,
		ShowHiddenFiles:  true,
		Filters: []runtime.FileFilter{
			{DisplayName: "Todos los ficheros", Pattern: "*"},
			{DisplayName: "Claves (*.key, *.pem, *.ppk, id_*)", Pattern: "*.key;*.pem;*.ppk;id_*"},
		},
	})
}

// ---------------------------------------------------------------- probar conexión

// TestResult es la respuesta de «Probar conexión».
type TestResult struct {
	// ok | needs_secret | bad_secret | vault_locked | vault_missing | unknown_host | host_changed | error
	Status string `json:"status"`
	// SecretKind: "passphrase" (contraseña de la clave) o "password" (del usuario).
	SecretKind  string            `json:"secretKind,omitempty"`
	Message     string            `json:"message"`
	KeyType     string            `json:"keyType,omitempty"`
	Fingerprint string            `json:"fingerprint,omitempty"`
	Facts       map[string]string `json:"facts,omitempty"`
	DurationMs  int64             `json:"durationMs"`
}

func (a *App) hostKeys() sshx.HostKeys {
	own := filepath.Join(a.store.Dir(), "known_hosts")
	return sshx.HostKeys{
		Files:     []string{sshx.ExpandHome("~/.ssh/known_hosts"), own},
		TrustFile: own,
	}
}

// TestConnection conecta, verifica la huella y recoge datos del servidor.
// Si secret va vacío se usa el guardado (si lo hay).
func (a *App) TestConnection(id, secret, acceptFingerprint string) TestResult {
	start := time.Now()
	srv, err := a.store.Server(id)
	if err != nil {
		return TestResult{Status: "error", Message: err.Error()}
	}
	kind := "passphrase"
	if srv.AuthMethod == store.AuthPassword {
		kind = "password"
	}
	secret, st := a.secretFor(srv, secret)
	if st != "" {
		return TestResult{Status: st, SecretKind: kind, Message: "Desbloquea la bóveda para usar la contraseña guardada."}
	}
	ctx, cancel := context.WithTimeout(a.context(), 30*time.Second)
	defer cancel()
	res := a.test(ctx, srv, secret, acceptFingerprint)
	res.SecretKind = kind
	res.DurationMs = time.Since(start).Milliseconds()
	if res.Status == "ok" || res.Status == "error" || res.Status == "host_changed" {
		msg := ""
		if res.Status != "ok" {
			msg = res.Message
		}
		_ = a.store.SetLastCheck(id, store.CheckResult{
			At: time.Now(), OK: res.Status == "ok", Error: msg,
			Facts: res.Facts, Duration: res.DurationMs,
		})
	}
	return res
}

// connect abre la conexión SSH; si no se puede, explica por qué en un TestResult.
func (a *App) connect(ctx context.Context, srv store.Server, secret, accept string) (*ssh.Client, *TestResult) {
	c, err := sshx.Dial(ctx, sshx.Target{
		Host: srv.Host, Port: srv.Port, User: srv.User,
		AuthMethod: srv.AuthMethod, KeyPath: srv.KeyPath,
		Secret: secret, AcceptFingerprint: accept,
	}, a.hostKeys())
	var uh *sshx.UnknownHostError
	var hc *sshx.HostKeyChangedError
	switch {
	case errors.Is(err, sshx.ErrPassphraseNeeded), errors.Is(err, sshx.ErrPasswordNeeded):
		return nil, &TestResult{Status: "needs_secret", Message: err.Error()}
	case errors.Is(err, sshx.ErrBadPassphrase), errors.Is(err, sshx.ErrBadPassword):
		return nil, &TestResult{Status: "bad_secret", Message: err.Error()}
	case errors.As(err, &uh):
		return nil, &TestResult{Status: "unknown_host", Message: "Es la primera vez que te conectas a este servidor. Comprueba que la huella es la suya antes de confiar.",
			KeyType: uh.KeyType, Fingerprint: uh.Fingerprint}
	case errors.As(err, &hc):
		return nil, &TestResult{Status: "host_changed", Message: hc.Error(), Fingerprint: hc.Fingerprint}
	case err != nil:
		return nil, &TestResult{Status: "error", Message: err.Error()}
	}
	return c, nil
}

// secretFor devuelve el secreto guardado del servidor si no se ha dado uno.
// status != "" si la bóveda está bloqueada.
func (a *App) secretFor(srv store.Server, given string) (string, string) {
	if given != "" || srv.SecretStore == "" {
		return given, ""
	}
	v, err := a.backend(srv.SecretStore).Get(secrets.SecretName(srv.ID))
	switch {
	case errors.Is(err, secrets.ErrLocked):
		return "", "vault_locked"
	case err == nil:
		return v, ""
	}
	return "", ""
}

func (a *App) test(ctx context.Context, srv store.Server, secret, accept string) TestResult {
	c, fail := a.connect(ctx, srv, secret, accept)
	if fail != nil {
		return *fail
	}
	defer c.Close()
	facts, err := sshx.Probe(ctx, c)
	if err != nil {
		return TestResult{Status: "error", Message: "conectado, pero falló la comprobación: " + err.Error()}
	}
	return TestResult{Status: "ok", Message: "Conexión correcta", Facts: facts}
}

// ---------------------------------------------------------------- ajustes de interfaz

func (a *App) GetSettings() store.Settings { return a.store.Settings() }

// SaveSettings guarda tema y paletas (la preferencia de contraseñas va aparte).
func (a *App) SaveSettings(s store.Settings) error {
	s.SecretBackend = a.store.Settings().SecretBackend
	return a.store.SaveSettings(s)
}
