// Package modules carga el catálogo de módulos de Draupnode.
//
// Un módulo es una carpeta con:
//
//	module.yaml      qué es, variables, dependencias y requisitos
//	role/            un rol de Ansible normal (tasks/main.yml, templates/, handlers/…)
//
// Los módulos incluidos van dentro del ejecutable (builtin/). El usuario puede
// añadir los suyos en la carpeta «modules» de la configuración; si uno suyo
// tiene el mismo id que uno incluido, manda el suyo.
package modules

import (
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

//go:embed all:builtin
var builtinFS embed.FS

// Tipos de variable que entiende el generador de formularios.
const (
	TypeString = "string"
	TypeInt    = "int"
	TypeBool   = "bool"
	TypeSelect = "select"
	TypeList   = "list" // lista de textos
	// TypeSecret lo escribe el usuario (un token, una clave): se guarda en la
	// bóveda por proyecto, nunca en draupnode.json ni en el instalar.sh exportado.
	TypeSecret = "secret"
)

// Variable es un dato que el usuario rellena en el formulario del módulo.
type Variable struct {
	Name     string   `yaml:"name" json:"name"`
	Label    string   `yaml:"label" json:"label"`
	Help     string   `yaml:"help" json:"help,omitempty"`
	Type     string   `yaml:"type" json:"type"`
	Default  any      `yaml:"default" json:"default"`
	Options  []string `yaml:"options" json:"options,omitempty"`
	Required bool     `yaml:"required" json:"required,omitempty"`
	// Pattern se aplica al texto (o a cada elemento de una lista).
	Pattern     string `yaml:"pattern" json:"pattern,omitempty"`
	PatternHelp string `yaml:"pattern_help" json:"patternHelp,omitempty"`
	Min         *int   `yaml:"min" json:"min,omitempty"`
	Max         *int   `yaml:"max" json:"max,omitempty"`
	Placeholder string `yaml:"placeholder" json:"placeholder,omitempty"`
	// Managed: lo rellena Draupnode (no sale en los formularios ni se pide en
	// el instalar.sh exportado). Hoy solo para datos secretos calculados al
	// Aplicar, como las contraseñas de copias que necesita el destino para rotar.
	Managed bool `yaml:"managed" json:"managed,omitempty"`
}

// Requires son los requisitos mínimos del servidor.
type Requires struct {
	OS        []string `yaml:"os" json:"os,omitempty"` // ids de /etc/os-release: ubuntu, debian…
	MinRAMMB  int      `yaml:"min_ram_mb" json:"minRamMb,omitempty"`
	MinDiskGB int      `yaml:"min_disk_gb" json:"minDiskGb,omitempty"`
}

// Module es la definición de un módulo.
type Module struct {
	ID          string     `yaml:"id" json:"id"`
	Name        string     `yaml:"name" json:"name"`
	Version     string     `yaml:"version" json:"version"`
	Category    string     `yaml:"category" json:"category"`
	Description string     `yaml:"description" json:"description"`
	Details     string     `yaml:"details" json:"details,omitempty"`
	Depends     []string   `yaml:"depends" json:"depends"`
	Requires    Requires   `yaml:"requires" json:"requires"`
	Variables   []Variable `yaml:"variables" json:"variables"`
	// FirewallPorts son puertos TCP que el módulo necesita abiertos: al
	// marcarlo se añaden a la lista del Cortafuegos (y se quitan al desmarcarlo).
	FirewallPorts []int `yaml:"firewall_ports" json:"firewallPorts,omitempty"`
	// FirewallPortsFrom: variables del módulo (tipo int) cuyo valor es un
	// puerto que también hay que abrir (p. ej. el puerto de SSH elegido).
	FirewallPortsFrom []string `yaml:"firewall_ports_from" json:"firewallPortsFrom,omitempty"`
	// UDPPortsFrom: variables (int) con puertos UDP que abre el propio módulo
	// (el Cortafuegos solo maneja TCP). Sirven para avisar del cortafuegos del
	// proveedor de nube.
	UDPPortsFrom []string `yaml:"udp_ports_from" json:"udpPortsFrom,omitempty"`
	// ProxySite: si la variable Domain tiene un dominio, Draupnode añade
	// «dominio 127.0.0.1:<Port>» a los sitios de Caddy o nginx del proyecto.
	ProxySite *ProxySite `yaml:"proxy_site" json:"proxySite,omitempty"`
	// Links: web oficial, código fuente y documentación de lo que instala
	// (se enseñan en el Catálogo: es lo justo para quien lo crea).
	Links []Link `yaml:"links" json:"links,omitempty"`
	// Conflicts: módulos que no pueden ir juntos (en los dos sentidos).
	Conflicts []string `yaml:"conflicts" json:"conflicts,omitempty"`
	// After: si estos módulos están en el proyecto, este va detrás (sin obligar a marcarlos).
	After []string `yaml:"after" json:"after,omitempty"`
	// Checks: comprobaciones previas en el servidor (avisos al previsualizar, error al aplicar).
	Checks []Check `yaml:"checks" json:"checks,omitempty"`
	// Secrets: nombres legibles de los ficheros que el módulo genera en la
	// carpeta de secretos del servidor (admite * como comodín).
	Secrets []SecretFile `yaml:"secrets" json:"secrets,omitempty"`
	// Desinstalación: el rol trae tasks/uninstall.yml. UninstallWarning explica
	// qué se pierde; UninstallData (si no está vacío) describe los datos que
	// se borran solo si el usuario marca «borrar también los datos».
	Uninstallable    bool   `yaml:"-" json:"uninstallable"`
	UninstallWarning string `yaml:"uninstall_warning" json:"uninstallWarning,omitempty"`
	UninstallData    string `yaml:"uninstall_data" json:"uninstallData,omitempty"`
	// NoUninstall explica por qué un módulo no se puede desinstalar.
	NoUninstall string `yaml:"no_uninstall" json:"noUninstall,omitempty"`

	Source string   `yaml:"-" json:"source"` // builtin | user
	Files  []string `yaml:"-" json:"files"`  // ficheros del rol (para verlos)
	role   fs.FS
}

// Link es un enlace a la web de un programa.
type Link struct {
	Label string `yaml:"label" json:"label"`
	URL   string `yaml:"url" json:"url"`
}

// ProxySite: variables con el dominio y el puerto local de una app.
type ProxySite struct {
	Domain string `yaml:"domain" json:"domain"`
	Port   string `yaml:"port" json:"port"`
}

// Check es una comprobación previa. Hoy: ContainerFree = variable con el
// nombre de un contenedor Docker que no debe existir ya fuera de este proyecto.
type Check struct {
	ContainerFree string `yaml:"container_free" json:"containerFree,omitempty"`
}

// SecretFile describe un fichero de la carpeta de secretos del servidor.
type SecretFile struct {
	File  string `yaml:"file" json:"file"`
	Label string `yaml:"label" json:"label"`
}

// SecretLabel devuelve el nombre legible de un fichero de secretos, o "".
func (m *Module) SecretLabel(file string) string {
	for _, s := range m.Secrets {
		if ok, _ := path.Match(s.File, file); ok {
			return s.Label
		}
	}
	return ""
}

// Role devuelve el sistema de ficheros del rol de Ansible.
func (m *Module) Role() fs.FS { return m.role }

var (
	idRe  = regexp.MustCompile(`^[a-z][a-z0-9-]{1,39}$`)
	varRe = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)
)

// VarPrefix es el prefijo obligatorio de sus variables («coolify_», «base_»…),
// para que dos módulos nunca pisen variables del otro.
func VarPrefix(id string) string { return strings.ReplaceAll(id, "-", "_") + "_" }

func (m *Module) validate() error {
	if !idRe.MatchString(m.ID) {
		return fmt.Errorf("id %q no válido (minúsculas, números y guiones)", m.ID)
	}
	if m.Name == "" {
		return errors.New("falta name")
	}
	for _, p := range m.FirewallPorts {
		if p < 1 || p > 65535 {
			return fmt.Errorf("firewall_ports: %d no es un puerto válido", p)
		}
	}
	vars := map[string]*Variable{}
	for i := range m.Variables {
		vars[m.Variables[i].Name] = &m.Variables[i]
	}
	seen := map[string]bool{}
	for i := range m.Variables {
		v := &m.Variables[i]
		if !varRe.MatchString(v.Name) || !strings.HasPrefix(v.Name, VarPrefix(m.ID)) {
			return fmt.Errorf("variable %q: debe empezar por %q", v.Name, VarPrefix(m.ID))
		}
		if seen[v.Name] {
			return fmt.Errorf("variable %q repetida", v.Name)
		}
		seen[v.Name] = true
		if v.Type == "" {
			v.Type = TypeString
		}
		switch v.Type {
		case TypeString, TypeInt, TypeBool, TypeList, TypeSecret:
		case TypeSelect:
			if len(v.Options) == 0 {
				return fmt.Errorf("variable %q: un select necesita options", v.Name)
			}
		default:
			return fmt.Errorf("variable %q: tipo %q desconocido", v.Name, v.Type)
		}
		if v.Pattern != "" {
			if _, err := regexp.Compile(v.Pattern); err != nil {
				return fmt.Errorf("variable %q: pattern no válido: %w", v.Name, err)
			}
		}
		if v.Label == "" {
			v.Label = v.Name
		}
		if v.Type == TypeSecret {
			v.Default = nil // un secreto nunca tiene valor por defecto
			continue
		}
		norm, err := Normalize(*v, v.Default)
		if err != nil && v.Default != nil {
			return fmt.Errorf("variable %q: valor por defecto no válido: %w", v.Name, err)
		}
		v.Default = norm
	}
	for _, name := range m.FirewallPortsFrom {
		if v := vars[name]; v == nil || v.Type != TypeInt {
			return fmt.Errorf("firewall_ports_from: %q no es una variable numérica del módulo", name)
		}
	}
	for _, l := range m.Links {
		if l.Label == "" || !strings.HasPrefix(l.URL, "https://") || strings.ContainsAny(l.URL, " \"'<>") {
			return fmt.Errorf("links: cada enlace necesita label y una dirección https:// (%q)", l.URL)
		}
	}
	if ps := m.ProxySite; ps != nil {
		if v := vars[ps.Domain]; v == nil || v.Type != TypeString {
			return fmt.Errorf("proxy_site.domain: %q no es una variable de texto del módulo", ps.Domain)
		}
		if v := vars[ps.Port]; v == nil || v.Type != TypeInt {
			return fmt.Errorf("proxy_site.port: %q no es una variable numérica del módulo", ps.Port)
		}
	}
	for _, name := range m.UDPPortsFrom {
		if v := vars[name]; v == nil || v.Type != TypeInt {
			return fmt.Errorf("udp_ports_from: %q no es una variable numérica del módulo", name)
		}
	}
	for _, c := range m.Checks {
		if c.ContainerFree == "" {
			return errors.New("checks: cada comprobación necesita container_free")
		}
		if v := vars[c.ContainerFree]; v == nil || v.Type != TypeString {
			return fmt.Errorf("checks: %q no es una variable de texto del módulo", c.ContainerFree)
		}
	}
	for _, sf := range m.Secrets {
		if sf.File == "" || strings.ContainsAny(sf.File, "/\\") {
			return fmt.Errorf("secrets: fichero %q no válido", sf.File)
		}
	}
	return nil
}

func load(fsys fs.FS, dir, source string) (*Module, error) {
	raw, err := fs.ReadFile(fsys, path.Join(dir, "module.yaml"))
	if err != nil {
		return nil, err
	}
	var m Module
	if err := yaml.Unmarshal(raw, &m); err != nil {
		return nil, fmt.Errorf("module.yaml: %w", err)
	}
	if err := m.validate(); err != nil {
		return nil, err
	}
	role, err := fs.Sub(fsys, path.Join(dir, "role"))
	if err != nil {
		return nil, err
	}
	if _, err := fs.Stat(role, "tasks/main.yml"); err != nil {
		return nil, errors.New("falta role/tasks/main.yml")
	}
	if _, err := fs.Stat(role, "tasks/uninstall.yml"); err == nil {
		m.Uninstallable = true
	}
	_ = fs.WalkDir(role, ".", func(p string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			m.Files = append(m.Files, p)
		}
		return nil
	})
	m.Source, m.role = source, role
	return &m, nil
}

// Catalog es el conjunto de módulos disponibles.
type Catalog struct {
	mods   map[string]*Module
	Errors []string // módulos del usuario que no se pudieron cargar
}

// Load carga los incluidos y los de userDir (puede no existir).
func Load(userDir string) (*Catalog, error) {
	c := &Catalog{mods: map[string]*Module{}}
	entries, err := fs.ReadDir(builtinFS, "builtin")
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		m, err := load(builtinFS, path.Join("builtin", e.Name()), "builtin")
		if err != nil {
			return nil, fmt.Errorf("módulo incluido %s: %w", e.Name(), err)
		}
		c.mods[m.ID] = m
	}
	if userDir != "" {
		if ents, err := os.ReadDir(userDir); err == nil {
			ufs := os.DirFS(userDir)
			for _, e := range ents {
				if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
					continue
				}
				m, err := load(ufs, e.Name(), "user")
				if err != nil {
					c.Errors = append(c.Errors, fmt.Sprintf("%s: %v", e.Name(), err))
					continue
				}
				c.mods[m.ID] = m
			}
		}
	}
	for _, m := range c.mods {
		for _, d := range m.Depends {
			if c.mods[d] == nil {
				c.Errors = append(c.Errors, fmt.Sprintf("%s: depende de %q, que no existe", m.ID, d))
			}
		}
		for _, d := range m.Conflicts {
			if contains(m.Depends, d) {
				c.Errors = append(c.Errors, fmt.Sprintf("%s: depende de %q y a la vez choca con él", m.ID, d))
			}
		}
	}
	sort.Strings(c.Errors)
	return c, nil
}

// Get devuelve un módulo por id.
func (c *Catalog) Get(id string) (*Module, bool) {
	m, ok := c.mods[id]
	return m, ok
}

// All devuelve los módulos ordenados por categoría y nombre.
func (c *Catalog) All() []*Module {
	out := make([]*Module, 0, len(c.mods))
	for _, m := range c.mods {
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Category != out[j].Category {
			return out[i].Category < out[j].Category
		}
		return out[i].Name < out[j].Name
	})
	return out
}

// Resolve añade las dependencias que falten y ordena para que cada módulo
// vaya después de aquello de lo que depende (y de sus «after» que estén en el
// proyecto). Devuelve también los añadidos. La interfaz repite este mismo
// algoritmo (ProjectEditor.svelte) para pintar el orden al instante.
func (c *Catalog) Resolve(ids []string) (ordered []string, added []string, err error) {
	want := map[string]bool{}
	for _, id := range ids {
		want[id] = true
	}
	// 1) Conjunto completo: lo elegido + sus dependencias.
	all := map[string]bool{}
	var collect func(id string) error
	collect = func(id string) error {
		m, ok := c.mods[id]
		if !ok {
			return fmt.Errorf("el módulo %q no existe", id)
		}
		if all[id] {
			return nil
		}
		all[id] = true
		for _, d := range m.Depends {
			if err := collect(d); err != nil {
				return err
			}
		}
		return nil
	}
	for _, id := range ids {
		if err := collect(id); err != nil {
			return nil, nil, err
		}
	}
	// 2) Orden: antes de cada uno, sus dependencias y sus «after» presentes.
	state := map[string]int{} // 0 sin ver, 1 visitando, 2 hecho
	var visit func(id string, chain []string) error
	visit = func(id string, chain []string) error {
		switch state[id] {
		case 1:
			return fmt.Errorf("dependencia circular: %s", strings.Join(append(chain, id), " → "))
		case 2:
			return nil
		}
		state[id] = 1
		m := c.mods[id]
		prev := append([]string(nil), m.Depends...)
		for _, a := range m.After {
			if all[a] {
				prev = append(prev, a)
			}
		}
		sort.Strings(prev)
		for _, d := range prev {
			if err := visit(d, append(chain, id)); err != nil {
				return err
			}
		}
		state[id] = 2
		ordered = append(ordered, id)
		if !want[id] {
			added = append(added, id)
		}
		return nil
	}
	sorted := append([]string(nil), ids...)
	sort.Strings(sorted)
	for _, id := range sorted {
		if err := visit(id, nil); err != nil {
			return nil, nil, err
		}
	}
	return ordered, added, nil
}

// Clashes devuelve los pares de módulos que chocan entre sí (en cualquiera de
// los dos sentidos), como mensajes para el usuario.
func (c *Catalog) Clashes(ids []string) []string {
	in := map[string]bool{}
	for _, id := range ids {
		in[id] = true
	}
	var out []string
	seen := map[string]bool{}
	for _, id := range ids {
		m := c.mods[id]
		if m == nil {
			continue
		}
		for _, other := range m.Conflicts {
			if !in[other] {
				continue
			}
			a, b := id, other
			if b < a {
				a, b = b, a
			}
			if seen[a+"|"+b] {
				continue
			}
			seen[a+"|"+b] = true
			out = append(out, fmt.Sprintf("%s y %s no pueden ir juntos", c.mods[a].Name, c.mods[b].Name))
		}
	}
	sort.Strings(out)
	return out
}

func contains(l []string, s string) bool {
	for _, x := range l {
		if x == s {
			return true
		}
	}
	return false
}
