// Package store guarda la configuración de Draupnode en el equipo del usuario.
//
// Todo vive en un directorio local (por ejemplo ~/.config/draupnode en Linux):
// nunca sale del equipo. Los secretos (frases de paso) NO se guardan aquí,
// sino en el llavero del sistema (ver package secrets).
package store

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// AuthKey usa un fichero de clave privada (con o sin contraseña).
// AuthPassword usa usuario y contraseña.
// AuthAgent usa el ssh-agent (se mantiene por compatibilidad; no se ofrece en la interfaz).
const (
	AuthKey      = "key"
	AuthPassword = "password"
	AuthAgent    = "agent"
)

// Dónde se guarda el secreto SSH de un servidor.
const (
	SecretNone    = ""
	SecretKeyring = "keyring" // llavero del sistema
	SecretVault   = "vault"   // bóveda cifrada de Draupnode
)

// Server es una conexión SSH dada de alta por el usuario.
type Server struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	User       string `json:"user"`
	AuthMethod string `json:"authMethod"`
	KeyPath    string `json:"keyPath"`
	// KeyEncrypted: la clave tiene contraseña (lo marca el usuario).
	KeyEncrypted bool `json:"keyEncrypted"`
	// SecretStore: dónde está guardada la contraseña ("" = no se guarda, se pide).
	SecretStore string       `json:"secretStore"`
	Notes       string       `json:"notes"`
	CreatedAt   time.Time    `json:"createdAt"`
	LastCheck   *CheckResult `json:"lastCheck,omitempty"`
}

// CheckResult resume la última comprobación del servidor.
type CheckResult struct {
	At       time.Time         `json:"at"`
	OK       bool              `json:"ok"`
	Error    string            `json:"error,omitempty"`
	Facts    map[string]string `json:"facts,omitempty"`
	Duration int64             `json:"durationMs"`
}

// Settings son las preferencias de la interfaz.
type Settings struct {
	Theme string `json:"theme"`
	// SecretBackend: dónde guardar contraseñas nuevas: "auto" | "keyring" | "vault".
	SecretBackend  string          `json:"secretBackend"`
	CustomPalettes json.RawMessage `json:"customPalettes,omitempty"`
}

// ProjectModule es un módulo elegido en un proyecto con sus valores.
type ProjectModule struct {
	ID     string         `json:"id"`
	Values map[string]any `json:"values"`
}

// RunSummary resume la última ejecución de un proyecto.
type RunSummary struct {
	At       time.Time `json:"at"`
	Check    bool      `json:"check"`
	OK       bool      `json:"ok"`
	Canceled bool      `json:"canceled,omitempty"`
	Changed  int       `json:"changed"`
	Failed   int       `json:"failed"`
	Tasks    int       `json:"tasks"`
	Error    string    `json:"error,omitempty"`
	LogFile  string    `json:"logFile,omitempty"`
	Duration int64     `json:"durationMs"`
	// Uninstall: fue una desinstalación (no cuenta como aplicar).
	Uninstall bool `json:"uninstall,omitempty"`
}

// Project = un servidor + los módulos que se le aplican.
type Project struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	ServerID  string          `json:"serverId"`
	Modules   []ProjectModule `json:"modules"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
	LastRun   *RunSummary     `json:"lastRun,omitempty"`
	// AppliedAt es la última vez que se aplicó entero y sin errores (o que
	// una simulación confirmó que no había nada pendiente).
	AppliedAt *time.Time `json:"appliedAt,omitempty"`
	// Collapsed: módulos cuya ventana está plegada en el editor. Es solo de la
	// interfaz: no cuenta como cambio del proyecto (ver SetCollapsed).
	Collapsed []string `json:"collapsed,omitempty"`
	// Slug da nombre a la carpeta de secretos del servidor
	// (/etc/draupnode/secretos/<slug>). Se fija la primera vez y no cambia
	// aunque se renombre el proyecto: si cambiara, se generarían contraseñas nuevas.
	Slug string `json:"slug,omitempty"`
	// InstalledModules: módulos que este proyecto ha aplicado bien alguna vez.
	// Solo crece: quitar un módulo del proyecto no lo desinstala del servidor.
	InstalledModules []string `json:"installedModules,omitempty"`
	// InstalledValues: valores con los que se instaló cada módulo (para poder
	// desinstalarlo aunque ya no esté marcado: su carpeta, su contenedor…).
	InstalledValues map[string]map[string]any `json:"installedValues,omitempty"`
}

type data struct {
	Version  int       `json:"version"`
	Servers  []Server  `json:"servers"`
	Projects []Project `json:"projects"`
	Settings Settings  `json:"settings"`
}

// Store es seguro para usarlo desde varias goroutines.
type Store struct {
	mu   sync.Mutex
	dir  string
	path string
	d    data
}

// DefaultDir devuelve el directorio de configuración según el sistema:
// Linux ~/.config/draupnode, macOS ~/Library/Application Support/draupnode,
// Windows %AppData%\draupnode.
func DefaultDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "draupnode"), nil
}

// Open carga (o crea) el almacén en dir.
func Open(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("no se pudo crear %s: %w", dir, err)
	}
	s := &Store{dir: dir, path: filepath.Join(dir, "draupnode.json")}
	s.d = data{Version: 1, Settings: Settings{Theme: "draupnir-gold", SecretBackend: "auto"}}
	raw, err := os.ReadFile(s.path)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return s, s.saveLocked()
	case err != nil:
		return nil, err
	}
	if err := json.Unmarshal(raw, &s.d); err != nil {
		return nil, fmt.Errorf("%s está dañado: %w", s.path, err)
	}
	// Proyectos aplicados antes de la 0.8.1: si no han cambiado desde la
	// última aplicación, sus módulos son los instalados.
	for i := range s.d.Projects {
		p := &s.d.Projects[i]
		if len(p.InstalledModules) == 0 && p.AppliedAt != nil && !p.UpdatedAt.After(*p.AppliedAt) {
			p.InstalledValues = map[string]map[string]any{}
			for _, m := range p.Modules {
				p.InstalledModules = append(p.InstalledModules, m.ID)
				p.InstalledValues[m.ID] = m.Values
			}
			sort.Strings(p.InstalledModules)
		}
	}
	return s, nil
}

// Dir es el directorio donde vive la configuración.
func (s *Store) Dir() string { return s.dir }

// saveLocked escribe de forma atómica (fichero temporal + rename) con permisos 0600.
func (s *Store) saveLocked() error {
	raw, err := json.MarshalIndent(s.d, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// Servers devuelve una copia ordenada por nombre.
func (s *Store) Servers() []Server {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := append([]Server(nil), s.d.Servers...)
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out
}

// Server busca por ID.
func (s *Store) Server(id string) (Server, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, srv := range s.d.Servers {
		if srv.ID == id {
			return srv, nil
		}
	}
	return Server{}, fmt.Errorf("servidor %q no encontrado", id)
}

// Validate comprueba los campos obligatorios y rellena valores por defecto.
func (srv *Server) Validate() error {
	srv.Name = strings.TrimSpace(srv.Name)
	srv.Host = strings.TrimSpace(srv.Host)
	srv.User = strings.TrimSpace(srv.User)
	srv.KeyPath = strings.TrimSpace(srv.KeyPath)
	if srv.Port == 0 {
		srv.Port = 22
	}
	if srv.AuthMethod == "" {
		srv.AuthMethod = AuthKey
	}
	switch {
	case srv.Name == "":
		return errors.New("el nombre es obligatorio")
	case srv.Host == "":
		return errors.New("la IP o el dominio es obligatorio")
	case strings.ContainsAny(srv.Host, " /@"):
		return errors.New("el host no puede llevar espacios, «/» ni «@»")
	case srv.User == "":
		return errors.New("el usuario es obligatorio")
	case srv.Port < 1 || srv.Port > 65535:
		return errors.New("el puerto debe estar entre 1 y 65535")
	case srv.AuthMethod != AuthKey && srv.AuthMethod != AuthPassword && srv.AuthMethod != AuthAgent:
		return fmt.Errorf("método de autenticación desconocido: %q", srv.AuthMethod)
	case srv.AuthMethod == AuthKey && srv.KeyPath == "":
		return errors.New("elige el fichero de clave privada")
	}
	if srv.AuthMethod != AuthKey {
		srv.KeyPath, srv.KeyEncrypted = "", false
	}
	return nil
}

// SaveServer crea (ID vacío) o actualiza un servidor.
func (s *Store) SaveServer(srv Server) (Server, error) {
	if err := srv.Validate(); err != nil {
		return Server{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if srv.ID == "" {
		srv.ID = newID()
		srv.CreatedAt = time.Now()
		s.d.Servers = append(s.d.Servers, srv)
		return srv, s.saveLocked()
	}
	for i, old := range s.d.Servers {
		if old.ID == srv.ID {
			srv.CreatedAt = old.CreatedAt
			if srv.LastCheck == nil {
				srv.LastCheck = old.LastCheck
			}
			s.d.Servers[i] = srv
			return srv, s.saveLocked()
		}
	}
	return Server{}, fmt.Errorf("servidor %q no encontrado", srv.ID)
}

// SetLastCheck guarda el resultado de la última comprobación.
func (s *Store) SetLastCheck(id string, res CheckResult) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.d.Servers {
		if s.d.Servers[i].ID == id {
			s.d.Servers[i].LastCheck = &res
			return s.saveLocked()
		}
	}
	return fmt.Errorf("servidor %q no encontrado", id)
}

// DeleteServer elimina un servidor (no si lo usa algún proyecto).
func (s *Store) DeleteServer(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, p := range s.d.Projects {
		if p.ServerID == id {
			return fmt.Errorf("lo usa el proyecto «%s»: bórralo o cámbialo de servidor antes", p.Name)
		}
	}
	for i, srv := range s.d.Servers {
		if srv.ID == id {
			s.d.Servers = append(s.d.Servers[:i], s.d.Servers[i+1:]...)
			return s.saveLocked()
		}
	}
	return fmt.Errorf("servidor %q no encontrado", id)
}

// Settings devuelve las preferencias.
func (s *Store) Settings() Settings {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.d.Settings
}

// SaveSettings guarda las preferencias.
func (s *Store) SaveSettings(st Settings) error {
	if len(st.CustomPalettes) > 0 && !json.Valid(st.CustomPalettes) {
		return errors.New("las paletas personalizadas no son JSON válido")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.d.Settings = st
	return s.saveLocked()
}

func newID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Projects devuelve los proyectos ordenados por nombre.
func (s *Store) Projects() []Project {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := append([]Project(nil), s.d.Projects...)
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out
}

// Project busca por ID.
func (s *Store) Project(id string) (Project, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, p := range s.d.Projects {
		if p.ID == id {
			return p, nil
		}
	}
	return Project{}, fmt.Errorf("proyecto %q no encontrado", id)
}

// SaveProject crea (ID vacío) o actualiza un proyecto. La validación de
// módulos y valores la hace quien llama (necesita el catálogo).
func (s *Store) SaveProject(p Project) (Project, error) {
	p.Name = strings.TrimSpace(p.Name)
	if p.Name == "" {
		return Project{}, errors.New("el nombre del proyecto es obligatorio")
	}
	if p.Modules == nil {
		p.Modules = []ProjectModule{}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	found := false
	for _, srv := range s.d.Servers {
		if srv.ID == p.ServerID {
			found = true
		}
	}
	if !found {
		return Project{}, errors.New("elige un servidor")
	}
	now := time.Now()
	p.UpdatedAt = now
	if p.ID == "" {
		p.ID, p.CreatedAt = newID(), now
		s.d.Projects = append(s.d.Projects, p)
		return p, s.saveLocked()
	}
	for i, old := range s.d.Projects {
		if old.ID == p.ID {
			p.CreatedAt = old.CreatedAt
			if p.LastRun == nil {
				p.LastRun = old.LastRun
			}
			p.AppliedAt = old.AppliedAt
			p.Collapsed = old.Collapsed               // solo lo cambia SetCollapsed
			p.InstalledModules = old.InstalledModules // solo lo cambian SetLastRun y MarkUninstalled
			p.InstalledValues = old.InstalledValues
			if old.Slug != "" {
				p.Slug = old.Slug // fijo para siempre
			}
			// Guardar sin cambios no cuenta como modificación (no pide aplicar otra vez).
			if sameContent(old, p) {
				p.UpdatedAt = old.UpdatedAt
			}
			s.d.Projects[i] = p
			return p, s.saveLocked()
		}
	}
	return Project{}, fmt.Errorf("proyecto %q no encontrado", p.ID)
}

// SetLastRun guarda el resumen de la última ejecución.
func (s *Store) SetLastRun(id string, r RunSummary) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.d.Projects {
		if s.d.Projects[i].ID == id {
			s.d.Projects[i].LastRun = &r
			// Aplicado: una aplicación completa sin errores, o una simulación
			// correcta que no encuentra nada pendiente (el servidor ya está así).
			if r.OK && !r.Canceled && !r.Uninstall && (!r.Check || r.Changed == 0) {
				at := r.At
				s.d.Projects[i].AppliedAt = &at
				pr := &s.d.Projects[i]
				if pr.InstalledValues == nil {
					pr.InstalledValues = map[string]map[string]any{}
				}
				for _, m := range pr.Modules {
					if !containsStr(pr.InstalledModules, m.ID) {
						pr.InstalledModules = append(pr.InstalledModules, m.ID)
					}
					pr.InstalledValues[m.ID] = m.Values
				}
				sort.Strings(s.d.Projects[i].InstalledModules)
			}
			return s.saveLocked()
		}
	}
	return fmt.Errorf("proyecto %q no encontrado", id)
}

// SetCollapsed guarda qué ventanas de módulo están plegadas en el editor,
// sin tocar la fecha de modificación del proyecto.
func (s *Store) SetCollapsed(id string, modules []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.d.Projects {
		if s.d.Projects[i].ID == id {
			s.d.Projects[i].Collapsed = append([]string(nil), modules...)
			sort.Strings(s.d.Projects[i].Collapsed)
			return s.saveLocked()
		}
	}
	return fmt.Errorf("proyecto %q no encontrado", id)
}

// MarkUninstalled quita módulos desinstalados del proyecto y de lo instalado,
// sin contar como cambio del proyecto.
func (s *Store) MarkUninstalled(id string, mods []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.d.Projects {
		pr := &s.d.Projects[i]
		if pr.ID != id {
			continue
		}
		var keep []ProjectModule
		for _, m := range pr.Modules {
			if !containsStr(mods, m.ID) {
				keep = append(keep, m)
			}
		}
		if keep == nil {
			keep = []ProjectModule{}
		}
		pr.Modules = keep
		var inst []string
		for _, m := range pr.InstalledModules {
			if !containsStr(mods, m) {
				inst = append(inst, m)
			}
		}
		pr.InstalledModules = inst
		for _, m := range mods {
			delete(pr.InstalledValues, m)
		}
		return s.saveLocked()
	}
	return fmt.Errorf("proyecto %q no encontrado", id)
}

// DeleteProject elimina un proyecto.
func (s *Store) DeleteProject(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, p := range s.d.Projects {
		if p.ID == id {
			s.d.Projects = append(s.d.Projects[:i], s.d.Projects[i+1:]...)
			return s.saveLocked()
		}
	}
	return fmt.Errorf("proyecto %q no encontrado", id)
}

// sameContent compara lo que se instala (nombre, servidor y módulos con sus valores).
func sameContent(a, b Project) bool {
	ja, _ := json.Marshal([]any{a.Name, a.ServerID, a.Modules})
	jb, _ := json.Marshal([]any{b.Name, b.ServerID, b.Modules})
	return string(ja) == string(jb)
}

func containsStr(l []string, x string) bool {
	for _, v := range l {
		if v == x {
			return true
		}
	}
	return false
}
