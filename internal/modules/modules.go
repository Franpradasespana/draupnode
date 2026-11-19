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

	Source string   `yaml:"-" json:"source"` // builtin | user
	Files  []string `yaml:"-" json:"files"`  // ficheros del rol (para verlos)
	role   fs.FS
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
		case TypeString, TypeInt, TypeBool, TypeList:
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
		norm, err := Normalize(*v, v.Default)
		if err != nil && v.Default != nil {
			return fmt.Errorf("variable %q: valor por defecto no válido: %w", v.Name, err)
		}
		v.Default = norm
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
// vaya después de aquello de lo que depende. Devuelve también los añadidos.
func (c *Catalog) Resolve(ids []string) (ordered []string, added []string, err error) {
	state := map[string]int{} // 0 sin ver, 1 visitando, 2 hecho
	want := map[string]bool{}
	for _, id := range ids {
		want[id] = true
	}
	var visit func(id string, chain []string) error
	visit = func(id string, chain []string) error {
		m, ok := c.mods[id]
		if !ok {
			return fmt.Errorf("el módulo %q no existe", id)
		}
		switch state[id] {
		case 1:
			return fmt.Errorf("dependencia circular: %s", strings.Join(append(chain, id), " → "))
		case 2:
			return nil
		}
		state[id] = 1
		deps := append([]string(nil), m.Depends...)
		sort.Strings(deps)
		for _, d := range deps {
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
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	for _, id := range sorted {
		if err := visit(id, nil); err != nil {
			return nil, nil, err
		}
	}
	return ordered, added, nil
}
