package app

import (
	"bytes"
	"draupnode/internal/i18n"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"draupnode/internal/modules"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"gopkg.in/yaml.v3"
)

// Editor de módulos propios: crear (vacío o copiando uno incluido), editar
// sus ficheros, comprobarlos y borrarlos. Todo dentro de la carpeta de
// módulos del usuario; los incluidos solo se pueden copiar.

var modIDRe = regexp.MustCompile(`^[a-z][a-z0-9-]{1,40}$`)

// UserModule es un módulo de la carpeta del usuario.
type UserModule struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Files    []string `json:"files"`
	Problems []string `json:"problems"`         // errores: no se puede usar
	Notes    []string `json:"notes"`            // avisos: se puede usar
	UsedBy   []string `json:"usedBy,omitempty"` // plantillas que lo usan
}

func (a *App) modDir(id string) (string, error) {
	if !modIDRe.MatchString(id) {
		return "", i18n.Errorf("nombre de módulo no válido: %q (minúsculas, números y guiones)", id)
	}
	return filepath.Join(a.userModulesDir(), id), nil
}

// modFile: ruta segura de un fichero del módulo (module.yaml, module.en.yaml o dentro de role/).
func (a *App) modFile(id, rel string) (string, error) {
	dir, err := a.modDir(id)
	if err != nil {
		return "", err
	}
	rel = strings.TrimSpace(filepath.ToSlash(rel))
	clean := path.Clean(rel)
	if rel == "" || clean != rel || strings.HasPrefix(clean, "/") || strings.HasPrefix(clean, "..") || strings.Contains(clean, "/../") || strings.ContainsAny(clean, "\\\x00") {
		return "", i18n.Errorf("ruta no válida: %q", rel)
	}
	if clean != "module.yaml" && clean != "module.en.yaml" && !strings.HasPrefix(clean, "role/") {
		return "", i18n.New("los ficheros van en module.yaml, module.en.yaml (textos en inglés) o dentro de role/ (tasks/, templates/, files/, handlers/…)")
	}
	return filepath.Join(dir, filepath.FromSlash(clean)), nil
}

// ListUserModules: los módulos propios con sus ficheros y lo que les pasa.
func (a *App) ListUserModules() []UserModule {
	out := []UserModule{}
	ents, _ := os.ReadDir(a.userModulesDir())
	for _, e := range ents {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") || !modIDRe.MatchString(e.Name()) {
			continue
		}
		out = append(out, a.userModule(e.Name()))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (a *App) userModule(id string) UserModule {
	dir := filepath.Join(a.userModulesDir(), id)
	um := UserModule{ID: id, Name: id, Files: []string{}, Problems: []string{}, Notes: []string{}}
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() && d.Type().IsRegular() {
			rel, _ := filepath.Rel(dir, p)
			um.Files = append(um.Files, filepath.ToSlash(rel))
		}
		return nil
	})
	sort.Slice(um.Files, func(i, j int) bool {
		// module.yaml primero, después el rol en orden.
		if (um.Files[i] == "module.yaml") != (um.Files[j] == "module.yaml") {
			return um.Files[i] == "module.yaml"
		}
		return um.Files[i] < um.Files[j]
	})
	var head struct {
		ID   string `yaml:"id"`
		Name string `yaml:"name"`
	}
	if raw, err := os.ReadFile(filepath.Join(dir, "module.yaml")); err == nil {
		if yaml.Unmarshal(raw, &head) == nil && head.Name != "" {
			um.Name = head.Name
		}
	}
	// Sintaxis YAML de cada fichero .yml/.yaml (los .j2 son plantillas: no).
	for _, f := range um.Files {
		if strings.HasSuffix(f, ".yml") || strings.HasSuffix(f, ".yaml") {
			raw, _ := os.ReadFile(filepath.Join(dir, filepath.FromSlash(f)))
			var v any
			if err := yaml.Unmarshal(raw, &v); err != nil {
				um.Problems = append(um.Problems, f+": "+err.Error())
			}
		}
	}
	// Lo que diga el catálogo al cargarlo.
	c, _ := modules.Load(a.userModulesDir())
	if c != nil {
		for _, e := range c.Errors {
			if strings.HasPrefix(e, id+":") {
				um.Problems = append(um.Problems, strings.TrimSpace(strings.TrimPrefix(e, id+":")))
			}
		}
	}
	if head.ID != "" && head.ID != id {
		um.Notes = append(um.Notes, i18n.Sprintf("el id de module.yaml («%s») no coincide con la carpeta («%s»): se usará «%s»", head.ID, id, head.ID))
	}
	if modules.IsBuiltin(head.ID) {
		um.Notes = append(um.Notes, i18n.Sprintf("tiene el mismo id que el módulo incluido «%s»: lo sustituye", head.ID))
	}
	mid := head.ID
	if mid == "" {
		mid = id
	}
	for _, r := range a.store.Recipes() {
		for _, m := range r.Modules {
			if m.ID == mid {
				um.UsedBy = append(um.UsedBy, r.Name)
			}
		}
	}
	return um
}

// ReadUserModuleFile lee un fichero del módulo.
func (a *App) ReadUserModuleFile(id, rel string) (string, error) {
	p, err := a.modFile(id, rel)
	if err != nil {
		return "", err
	}
	st, err := os.Stat(p)
	if err != nil {
		return "", err
	}
	if st.Size() > 1<<20 {
		return "", i18n.New("el fichero pasa de 1 MB: ábrelo con tu editor")
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return "", err
	}
	if bytes.IndexByte(b, 0) >= 0 {
		return "", i18n.New("es un fichero binario: no se puede editar aquí")
	}
	return string(b), nil
}

// SaveUserModuleFile guarda (o crea) un fichero y recarga el catálogo.
// Devuelve el módulo con lo que le pasa ahora.
func (a *App) SaveUserModuleFile(id, rel, content string) (UserModule, error) {
	p, err := a.modFile(id, rel)
	if err != nil {
		return UserModule{}, err
	}
	if _, err := os.Stat(filepath.Join(a.userModulesDir(), id)); err != nil {
		return UserModule{}, i18n.Errorf("no existe el módulo %q", id)
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return UserModule{}, err
	}
	if err := writeFileAtomic(p, []byte(content), 0o644); err != nil {
		return UserModule{}, err
	}
	a.ReloadModules()
	return a.userModule(id), nil
}

// DeleteUserModuleFile borra un fichero (module.yaml y tasks/main.yml no).
func (a *App) DeleteUserModuleFile(id, rel string) (UserModule, error) {
	if rel == "module.yaml" || rel == "role/tasks/main.yml" {
		return UserModule{}, i18n.New("este fichero es obligatorio")
	}
	p, err := a.modFile(id, rel)
	if err != nil {
		return UserModule{}, err
	}
	if err := os.Remove(p); err != nil {
		return UserModule{}, err
	}
	a.ReloadModules()
	return a.userModule(id), nil
}

// CreateUserModule crea un módulo nuevo: vacío (con un ejemplo comentado) o
// como copia de uno incluido (from), con su id y sus variables renombrados.
func (a *App) CreateUserModule(id, from string) (UserModule, error) {
	dir, err := a.modDir(id)
	if err != nil {
		return UserModule{}, err
	}
	if _, err := os.Stat(dir); err == nil {
		return UserModule{}, i18n.Errorf("ya tienes un módulo «%s»", id)
	}
	if from == "" && modules.IsBuiltin(id) {
		return UserModule{}, i18n.Errorf("«%s» ya es un módulo incluido: elige otro nombre", id)
	}
	files := map[string][]byte{}
	if from == "" {
		files = skeletonModule(id)
	} else {
		src, err := modules.BuiltinFiles(from)
		if err != nil {
			return UserModule{}, err
		}
		oldP, newP := modules.VarPrefix(from), modules.VarPrefix(id)
		for k, b := range src {
			s := strings.ReplaceAll(string(b), oldP, newP)
			if k == "module.yaml" {
				s = regexp.MustCompile(`(?m)^id:\s*\S+`).ReplaceAllString(s, "id: "+id)
				s = regexp.MustCompile(`(?m)^name:\s*"?([^"\n]*)"?`).ReplaceAllString(s, `name: "$1 (mi versión)"`)
			}
			if k == "module.en.yaml" {
				s = regexp.MustCompile(`(?m)^name:\s*"?([^"\n]*)"?`).ReplaceAllString(s, `name: "$1 (my version)"`)
			}
			files[k] = []byte(s)
		}
	}
	for k, b := range files {
		p := filepath.Join(dir, filepath.FromSlash(k))
		if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
			return UserModule{}, err
		}
		if err := os.WriteFile(p, b, 0o644); err != nil {
			return UserModule{}, err
		}
	}
	a.ReloadModules()
	return a.userModule(id), nil
}

// DeleteUserModule borra un módulo propio si ninguna plantilla lo usa.
func (a *App) DeleteUserModule(id string) error {
	dir, err := a.modDir(id)
	if err != nil {
		return err
	}
	if um := a.userModule(id); len(um.UsedBy) > 0 {
		return i18n.Errorf("lo usan estas plantillas: %s. Quítalo de ellas antes", strings.Join(um.UsedBy, ", "))
	}
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	a.ReloadModules()
	return nil
}

// OpenUserModuleDir abre la carpeta del módulo en el gestor de archivos.
func (a *App) OpenUserModuleDir(id string) error {
	dir, err := a.modDir(id)
	if err != nil {
		return err
	}
	runtime.BrowserOpenURL(a.ctx, "file://"+dir)
	return nil
}

func skeletonModule(id string) map[string][]byte {
	v := modules.VarPrefix(id)
	return map[string][]byte{
		"module.yaml": []byte(`# Módulo propio de Draupnode. Guarda (Ctrl+S) y mira abajo si hay algún problema.
id: ` + id + `
name: "Mi módulo"
version: 1.0.0
# Categoría: aparece agrupado con las demás del mismo nombre.
category: 8 · Mis módulos
description: "Una línea que diga qué hace."
details: |
  Lo que hace con más detalle, y qué hay que saber para usarlo.
# Módulos que tienen que estar antes (se añaden solos al elegirlo).
depends: [base]
requires:
  os: [ubuntu, debian]
  min_ram_mb: 512
# Opciones del formulario. Cada nombre empieza por «` + v + `».
# Tipos: string, int, bool, select (con options), list, secret.
variables:
  - name: ` + v + `paquetes
    label: Paquetes que instalar
    help: Uno por línea.
    type: list
    default: [htop, ncdu]
  - name: ` + v + `mensaje
    label: Mensaje del día
    type: string
    default: "Servidor preparado con Draupnode"
# Puertos que abre en el Cortafuegos (si está en la plantilla).
# firewall_ports: [8080]
# Enlaces a su web oficial y su código (los del catálogo).
# links:
#   - label: "Web oficial"
#     url: https://ejemplo.org
uninstall_warning: "Quita los paquetes y el mensaje del día."
# Cómo probarlo (sale en Ayuda → «Probar cada módulo»).
prueba:
  lab: "Sí."
  pasos:
    - "En el servidor de pruebas → Módulos, añade este módulo y pulsa «Aplicar»."
    - "Abre «Terminal» (se conecta de nuevo y enseña el mensaje del día)."
  comprobar:
    - "Sale tu mensaje al entrar y «htop --version» responde."
`),
		"role/tasks/main.yml": []byte(`---
# Tareas de Ansible que se ejecutan en el servidor (como root) al Aplicar.
# Las opciones del formulario llegan como variables: {{ ` + v + `paquetes }}…
# Al Simular se ejecuta en modo simulación (ansible_check_mode).

- name: Instalar paquetes
  ansible.builtin.apt:
    name: "{{ ` + v + `paquetes }}"
    state: present
    update_cache: true
    lock_timeout: 600

- name: Mensaje del día
  ansible.builtin.copy:
    dest: /etc/motd
    content: "{{ ` + v + `mensaje }}\n"
    mode: "0644"
`),
		"role/tasks/uninstall.yml": []byte(`---
# Se ejecuta al pulsar «Desinstalar». Si no existe este fichero, el módulo
# no se puede desinstalar desde Draupnode.
# draupnode_uninstall_purge es true si el usuario marcó «borrar también los datos».

- name: Quitar paquetes
  ansible.builtin.apt:
    name: "{{ ` + v + `paquetes }}"
    state: absent

- name: Quitar el mensaje del día
  ansible.builtin.file:
    path: /etc/motd
    state: absent
`),
	}
}
