package app

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"draupnode/internal/modules"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"gopkg.in/yaml.v3"
)

// Compartir módulos propios: exportar uno a un fichero .draupnode-modulo
// (tar.gz con sus ficheros y un manifiesto con la huella de cada uno) e
// importarlo en otro Draupnode. Un módulo ejecuta tareas como root en los
// servidores, así que antes de importarlo se revisa: que el fichero esté
// entero y no traiga rutas raras, que se cargue bien y qué hace (tareas,
// órdenes, descargas y lo delicado), para que la persona lo lea antes.

const (
	modShareExt      = ".draupnode-modulo"
	modShareManifest = "draupnode-modulo.json"
	modShareFormat   = 1
	modShareMaxFiles = 300
	modShareMaxFile  = 2 << 20  // 2 MB por fichero
	modShareMaxTotal = 20 << 20 // 20 MB en total
)

type modManifest struct {
	Format    int               `json:"formato"`
	ID        string            `json:"id"`
	Name      string            `json:"nombre"`
	Version   string            `json:"version"`
	Draupnode string            `json:"draupnode"`
	Exported  time.Time         `json:"exportado"`
	Files     map[string]string `json:"ficheros"` // ruta → sha256
}

// packModule empaqueta un módulo propio.
func (a *App) packModule(id string) ([]byte, error) {
	dir, err := a.modDir(id)
	if err != nil {
		return nil, err
	}
	um := a.userModule(id)
	if len(um.Files) == 0 {
		return nil, fmt.Errorf("no tienes un módulo «%s»", id)
	}
	if len(um.Problems) > 0 {
		return nil, fmt.Errorf("el módulo tiene problemas; arréglalos antes de exportarlo: %s", strings.Join(um.Problems, "; "))
	}
	var head struct {
		ID      string `yaml:"id"`
		Version string `yaml:"version"`
	}
	files := map[string][]byte{}
	for _, f := range um.Files {
		b, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(f)))
		if err != nil {
			return nil, err
		}
		files[f] = b
	}
	_ = yaml.Unmarshal(files["module.yaml"], &head)
	if head.ID == "" {
		head.ID = id
	}
	man := modManifest{Format: modShareFormat, ID: head.ID, Name: um.Name, Version: head.Version, Draupnode: Version, Exported: time.Now().UTC(), Files: map[string]string{}}
	for f, b := range files {
		sum := sha256.Sum256(b)
		man.Files[f] = hex.EncodeToString(sum[:])
	}
	mj, _ := json.MarshalIndent(man, "", "  ")
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	put := func(name string, b []byte) error {
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(b)), ModTime: man.Exported, Typeflag: tar.TypeReg}); err != nil {
			return err
		}
		_, err := tw.Write(b)
		return err
	}
	if err := put(modShareManifest, mj); err != nil {
		return nil, err
	}
	for _, f := range um.Files {
		if err := put("modulo/"+f, files[f]); err != nil {
			return nil, err
		}
	}
	if err := tw.Close(); err != nil {
		return nil, err
	}
	if err := gz.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ExportUserModule guarda un módulo propio en un fichero para pasárselo a
// otra persona. Devuelve la ruta ("" si se cancela).
func (a *App) ExportUserModule(id string) (string, error) {
	b, err := a.packModule(id)
	if err != nil {
		return "", err
	}
	home, _ := os.UserHomeDir()
	p, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title: "Exportar el módulo «" + id + "»", DefaultDirectory: home, DefaultFilename: id + modShareExt,
		Filters: []runtime.FileFilter{{DisplayName: "Módulos de Draupnode (*" + modShareExt + ")", Pattern: "*" + modShareExt}},
	})
	if err != nil || p == "" {
		return "", err
	}
	if !strings.HasSuffix(p, modShareExt) {
		p += modShareExt
	}
	return p, os.WriteFile(p, b, 0o644)
}

// ModuleImportFile es un fichero del módulo que se va a importar.
type ModuleImportFile struct {
	Path string `json:"path"`
	Size int    `json:"size"`
	Text string `json:"text,omitempty"` // para leerlo antes de importar (si es texto)
}

// ModuleImportReport es la revisión de un módulo antes de importarlo.
type ModuleImportReport struct {
	File        string             `json:"file"`
	OK          bool               `json:"ok"` // se puede importar (sin Problems)
	ID          string             `json:"id"`
	Name        string             `json:"name"`
	Version     string             `json:"version"`
	Description string             `json:"description"`
	Draupnode   string             `json:"draupnode"` // versión que lo exportó
	Exported    string             `json:"exported"`
	Integrity   bool               `json:"integrity"` // las huellas coinciden con el manifiesto
	Files       []ModuleImportFile `json:"files"`
	Problems    []string           `json:"problems"` // impiden importarlo
	Warnings    []string           `json:"warnings"` // cosas delicadas que conviene leer
	Tasks       []string           `json:"tasks"`    // tipos de tarea: «apt × 3»
	Commands    []string           `json:"commands"` // órdenes de shell/command
	Hosts       []string           `json:"hosts"`    // sitios de internet que aparecen
	Images      []string           `json:"images"`   // imágenes de Docker que descargará (cada una es software que se ejecuta)
	Depends     []string           `json:"depends"`
	// Conflict: "" | "user" (ya tienes uno con ese id) | "builtin" (es el de un módulo incluido).
	Conflict string `json:"conflict"`
}

// InspectModuleFile pide un fichero .draupnode-modulo y lo revisa (no
// importa nada). Report vacío (sin File) si se cancela.
func (a *App) InspectModuleFile() (ModuleImportReport, error) {
	home, _ := os.UserHomeDir()
	p, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Importar un módulo", DefaultDirectory: home,
		Filters: []runtime.FileFilter{{DisplayName: "Módulos de Draupnode (*" + modShareExt + ")", Pattern: "*" + modShareExt}},
	})
	if err != nil || p == "" {
		return ModuleImportReport{}, err
	}
	return a.inspectModulePath(p), nil
}

// readModulePack abre el fichero con límites y solo deja pasar rutas seguras.
func readModulePack(p string) (modManifest, map[string][]byte, error) {
	var man modManifest
	f, err := os.Open(p)
	if err != nil {
		return man, nil, err
	}
	defer f.Close()
	gz, err := gzip.NewReader(io.LimitReader(f, modShareMaxTotal))
	if err != nil {
		return man, nil, errors.New("no es un módulo de Draupnode (no es un .tar.gz)")
	}
	tr := tar.NewReader(gz)
	files := map[string][]byte{}
	total, haveMan := 0, false
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return man, nil, errors.New("el fichero está dañado: " + err.Error())
		}
		if h.Typeflag == tar.TypeDir {
			continue
		}
		if h.Typeflag != tar.TypeReg {
			return man, nil, fmt.Errorf("trae algo que no es un fichero normal (%s): por seguridad no se importa", h.Name)
		}
		if h.Size > modShareMaxFile {
			return man, nil, fmt.Errorf("%s es demasiado grande (%d KB; máximo %d KB)", h.Name, h.Size/1024, modShareMaxFile/1024)
		}
		if len(files) >= modShareMaxFiles {
			return man, nil, fmt.Errorf("trae demasiados ficheros (máximo %d)", modShareMaxFiles)
		}
		b, err := io.ReadAll(io.LimitReader(tr, modShareMaxFile+1))
		if err != nil {
			return man, nil, errors.New("el fichero está dañado: " + err.Error())
		}
		total += len(b)
		if total > modShareMaxTotal {
			return man, nil, errors.New("es demasiado grande en total")
		}
		if h.Name == modShareManifest {
			if json.Unmarshal(b, &man) != nil {
				return man, nil, errors.New("su manifiesto no se puede leer")
			}
			haveMan = true
			continue
		}
		rel, ok := strings.CutPrefix(h.Name, "modulo/")
		if !ok || !safeModPath(rel) {
			return man, nil, fmt.Errorf("trae una ruta no permitida (%s): por seguridad no se importa", h.Name)
		}
		if _, dup := files[rel]; dup {
			return man, nil, fmt.Errorf("trae %s dos veces", rel)
		}
		files[rel] = b
	}
	if !haveMan {
		return man, nil, errors.New("no es un módulo de Draupnode (le falta " + modShareManifest + ")")
	}
	if man.Format != modShareFormat {
		return man, nil, fmt.Errorf("es de un formato que esta versión no conoce (%d); actualiza Draupnode", man.Format)
	}
	return man, files, nil
}

// safeModPath: module.yaml o algo dentro de role/, sin «..», rutas absolutas
// ni caracteres raros.
func safeModPath(rel string) bool {
	clean := path.Clean(rel)
	if rel == "" || clean != rel || strings.HasPrefix(clean, "/") || strings.HasPrefix(clean, "..") || strings.Contains(clean, "/../") || strings.ContainsAny(clean, "\\\x00:") {
		return false
	}
	return clean == "module.yaml" || (strings.HasPrefix(clean, "role/") && len(clean) > len("role/"))
}

func (a *App) inspectModulePath(p string) ModuleImportReport {
	r := ModuleImportReport{File: p, Files: []ModuleImportFile{}, Problems: []string{}, Warnings: []string{}, Tasks: []string{}, Commands: []string{}, Hosts: []string{}, Images: []string{}, Depends: []string{}}
	man, files, err := readModulePack(p)
	if err != nil {
		r.Problems = append(r.Problems, err.Error())
		return r
	}
	r.Draupnode, r.Version, r.Name, r.ID = man.Draupnode, man.Version, man.Name, man.ID
	if !man.Exported.IsZero() {
		r.Exported = man.Exported.Local().Format("02/01/2006 15:04")
	}
	// Integridad: cada fichero con su huella, y ninguno de más ni de menos.
	r.Integrity = true
	for f, b := range files {
		sum := sha256.Sum256(b)
		if man.Files[f] != hex.EncodeToString(sum[:]) {
			r.Integrity = false
			r.Problems = append(r.Problems, f+": no coincide con su huella del manifiesto (el fichero se ha cambiado o está dañado)")
		}
	}
	for f := range man.Files {
		if _, ok := files[f]; !ok {
			r.Integrity = false
			r.Problems = append(r.Problems, f+": está en el manifiesto pero no en el fichero")
		}
	}
	names := make([]string, 0, len(files))
	for f := range files {
		names = append(names, f)
	}
	sort.Slice(names, func(i, j int) bool {
		if (names[i] == "module.yaml") != (names[j] == "module.yaml") {
			return names[i] == "module.yaml"
		}
		return names[i] < names[j]
	})
	for _, f := range names {
		mf := ModuleImportFile{Path: f, Size: len(files[f])}
		if utf8.Valid(files[f]) && len(files[f]) <= 256<<10 {
			mf.Text = string(files[f])
		}
		r.Files = append(r.Files, mf)
	}
	if files["module.yaml"] == nil || files["role/tasks/main.yml"] == nil {
		r.Problems = append(r.Problems, "le falta module.yaml o role/tasks/main.yml")
		return r
	}
	var head struct {
		ID          string   `yaml:"id"`
		Name        string   `yaml:"name"`
		Version     string   `yaml:"version"`
		Description string   `yaml:"description"`
		Depends     []string `yaml:"depends"`
	}
	if err := yaml.Unmarshal(files["module.yaml"], &head); err != nil {
		r.Problems = append(r.Problems, "module.yaml: "+err.Error())
		return r
	}
	r.ID, r.Name, r.Version, r.Description, r.Depends = head.ID, head.Name, head.Version, head.Description, append(r.Depends, head.Depends...)
	if !modIDRe.MatchString(r.ID) {
		r.Problems = append(r.Problems, fmt.Sprintf("su id («%s») no es válido", r.ID))
		return r
	}
	for _, f := range names {
		if strings.HasSuffix(f, ".yml") || strings.HasSuffix(f, ".yaml") {
			var v any
			if err := yaml.Unmarshal(files[f], &v); err != nil {
				r.Problems = append(r.Problems, f+": "+err.Error())
			}
		}
	}
	// Que el catálogo lo cargue: se prueba en una carpeta aparte con los
	// módulos propios de este equipo (por si depende de alguno).
	if tmp, err := os.MkdirTemp("", "draupnode-importar-"); err == nil {
		defer os.RemoveAll(tmp)
		_ = copyDir(a.userModulesDir(), tmp)
		_ = os.RemoveAll(filepath.Join(tmp, r.ID))
		if writeModFiles(filepath.Join(tmp, r.ID), files) == nil {
			if c, err := modules.Load(tmp); err != nil {
				r.Problems = append(r.Problems, err.Error())
			} else {
				for _, e := range c.Errors {
					if strings.HasPrefix(e, r.ID+":") {
						r.Problems = append(r.Problems, strings.TrimSpace(strings.TrimPrefix(e, r.ID+":")))
					}
				}
			}
		}
	}
	switch {
	case modules.IsBuiltin(r.ID):
		r.Conflict = "builtin"
	default:
		if dir, err := a.modDir(r.ID); err == nil {
			if _, err := os.Stat(dir); err == nil {
				r.Conflict = "user"
			}
		}
	}
	reviewModule(&r, files)
	r.OK = len(r.Problems) == 0
	return r
}

func writeModFiles(dir string, files map[string][]byte) error {
	for k, b := range files {
		if !safeModPath(k) {
			return fmt.Errorf("ruta no permitida: %s", k)
		}
		p := filepath.Join(dir, filepath.FromSlash(k))
		if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
			return err
		}
		if err := os.WriteFile(p, b, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func copyDir(src, dst string) error {
	return filepath.WalkDir(src, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(src, p)
		t := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(t, 0o700)
		}
		if !d.Type().IsRegular() {
			return nil
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return nil
		}
		return os.WriteFile(t, b, 0o644)
	})
}

// Lo delicado: no impide importar, pero se enseña para que se lea.
var modRisks = []struct {
	re  *regexp.Regexp
	msg string
}{
	{regexp.MustCompile(`(?i)(curl|wget)[^\n|]*\|\s*(sudo\s+)?(ba|z)?sh\b`), "descarga un script de internet y lo ejecuta tal cual"},
	{regexp.MustCompile(`(?i)\brm\s+-[a-z]*r[a-z]*\s+(--no-preserve-root\s+)?/(\s|\*|$|")`), "borra desde la raíz del disco"},
	{regexp.MustCompile(`authorized_keys`), "toca las claves SSH autorizadas (podría dar acceso al servidor a otra persona)"},
	{regexp.MustCompile(`sudoers`), "cambia quién puede usar sudo"},
	{regexp.MustCompile(`/etc/(shadow|passwd)\b`), "lee o cambia las cuentas del sistema (/etc/passwd o /etc/shadow)"},
	{regexp.MustCompile(`(?i)PermitRootLogin|PasswordAuthentication`), "cambia la configuración del SSH"},
	{regexp.MustCompile(`(?i)iptables\s+(-F|--flush|-P\s+INPUT\s+ACCEPT)|ufw\s+disable`), "vacía o desactiva el cortafuegos"},
	{regexp.MustCompile(`chmod\s+(-R\s+)?0?777`), "deja ficheros con permisos para todo el mundo (777)"},
	{regexp.MustCompile(`(?i)base64\s+(-d|--decode)|\beval\s`), "ejecuta código oculto (base64 o eval)"},
	{regexp.MustCompile(`/dev/tcp/|\bnc\s+-[a-z]*e\b|ncat\s+-e`), "abre una conexión de shell hacia fuera"},
	{regexp.MustCompile(`(?m)^\s*-?\s*(ansible\.builtin\.)?user:\s*$`), "crea o cambia usuarios del sistema"},
	{regexp.MustCompile(`(?m)^\s*-?\s*(ansible\.builtin\.)?(cron|systemd_timer):\s*$|crontab`), "programa tareas periódicas"},
	{regexp.MustCompile(`(?i)privileged:\s*true|--privileged`), "arranca contenedores con todos los permisos del servidor (privileged)"},
	{regexp.MustCompile(`/var/run/docker\.sock`), "da a un contenedor el control de Docker (docker.sock)"},
	{regexp.MustCompile(`(?m)^\s*-?\s*(ansible\.builtin\.)?(get_url|unarchive|git|pip|npm|ansible\.builtin\.script):|\bpip3?\s+install\b|\bnpm\s+(i|install)\b`), "descarga e instala software de internet (además de las imágenes de Docker)"},
	{regexp.MustCompile(`(?i)network_mode:\s*"?host|pid:\s*"?host|cap_add:`), "da a un contenedor acceso a la red, los procesos o permisos especiales del servidor"},
	{regexp.MustCompile(`(?m)^\s*-\s*"?/:/`), "monta todo el disco del servidor dentro de un contenedor"},
}

// Caracteres invisibles o que cambian el sentido del texto: sirven para que el
// código que se lee no sea el que se ejecuta («Trojan Source»).
var hiddenRunes = regexp.MustCompile("[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]")

var imageRe = regexp.MustCompile(`(?m)^\s*-?\s*image:\s*["']?([^"'\s#]+)`)

var (
	modURLRe = regexp.MustCompile(`https?://([A-Za-z0-9.-]+\.[A-Za-z]{2,})`)
	// Claves de una tarea que no son el módulo que ejecuta.
	taskKeywords = map[string]bool{"name": true, "when": true, "become": true, "become_user": true, "register": true, "notify": true, "tags": true,
		"loop": true, "loop_control": true, "vars": true, "args": true, "changed_when": true, "failed_when": true, "ignore_errors": true,
		"no_log": true, "environment": true, "delegate_to": true, "until": true, "retries": true, "delay": true, "check_mode": true,
		"listen": true, "run_once": true, "async": true, "poll": true, "diff": true, "throttle": true, "timeout": true, "rescue": true, "always": true}
)

// reviewModule resume qué hace el rol y busca lo delicado.
func reviewModule(r *ModuleImportReport, files map[string][]byte) {
	counts := map[string]int{}
	seenWarn, seenHost, seenCmd := map[string]bool{}, map[string]bool{}, map[string]bool{}
	var walk func(tasks []any, file string)
	walk = func(tasks []any, file string) {
		for _, t := range tasks {
			m, ok := t.(map[string]any)
			if !ok {
				continue
			}
			for _, k := range []string{"block", "rescue", "always"} {
				if sub, ok := m[k].([]any); ok {
					walk(sub, file)
				}
			}
			if _, ok := m["block"]; ok {
				continue
			}
			for k, v := range m {
				if taskKeywords[k] || strings.HasPrefix(k, "with_") {
					continue
				}
				short := strings.TrimPrefix(strings.TrimPrefix(k, "ansible.builtin."), "ansible.posix.")
				counts[short]++
				if short == "shell" || short == "command" || short == "raw" || short == "script" {
					cmd := ""
					switch x := v.(type) {
					case string:
						cmd = x
					case map[string]any:
						cmd, _ = x["cmd"].(string)
						if cmd == "" {
							cmd, _ = x["argv"].(string)
						}
					}
					cmd = strings.Join(strings.Fields(cmd), " ")
					if len(cmd) > 160 {
						cmd = cmd[:157] + "…"
					}
					if cmd != "" && !seenCmd[cmd] {
						seenCmd[cmd] = true
						r.Commands = append(r.Commands, cmd)
					}
				}
				break
			}
		}
	}
	paths := make([]string, 0, len(files))
	for f := range files {
		paths = append(paths, f)
	}
	sort.Strings(paths)
	for _, f := range paths {
		b := files[f]
		if strings.HasPrefix(f, "role/tasks/") || strings.HasPrefix(f, "role/handlers/") {
			var tasks []any
			if yaml.Unmarshal(b, &tasks) == nil {
				walk(tasks, f)
			}
		}
		if !utf8.Valid(b) || bytes.IndexByte(b, 0) >= 0 {
			if !seenWarn["bin:"+f] {
				seenWarn["bin:"+f] = true
				r.Warnings = append(r.Warnings, fmt.Sprintf("no es texto y no se puede revisar (podría ser un programa) (%s)", f))
			}
			continue
		}
		s := string(b)
		if hiddenRunes.MatchString(s) {
			r.Warnings = append(r.Warnings, fmt.Sprintf("tiene caracteres invisibles o que cambian el sentido del texto: lo que lees podría no ser lo que se ejecuta (%s)", f))
		}
		for _, l := range strings.Split(s, "\n") {
			if len(l) > 1000 {
				r.Warnings = append(r.Warnings, fmt.Sprintf("tiene líneas larguísimas, donde es fácil esconder código (%s)", f))
				break
			}
		}
		for _, m := range imageRe.FindAllStringSubmatch(s, -1) {
			if img := m[1]; !seenHost["img:"+img] {
				seenHost["img:"+img] = true
				r.Images = append(r.Images, img)
			}
		}
		for _, rk := range modRisks {
			if rk.re.MatchString(s) && !seenWarn[rk.msg] {
				seenWarn[rk.msg] = true
				r.Warnings = append(r.Warnings, fmt.Sprintf("%s (%s)", rk.msg, f))
			}
		}
		for _, m := range modURLRe.FindAllStringSubmatch(s, -1) {
			h := strings.ToLower(m[1])
			if !seenHost[h] {
				seenHost[h] = true
				r.Hosts = append(r.Hosts, h)
			}
		}
	}
	type kv struct {
		k string
		n int
	}
	var list []kv
	for k, n := range counts {
		list = append(list, kv{k, n})
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].n != list[j].n {
			return list[i].n > list[j].n
		}
		return list[i].k < list[j].k
	})
	for _, x := range list {
		r.Tasks = append(r.Tasks, fmt.Sprintf("%s × %d", x.k, x.n))
	}
	sort.Strings(r.Hosts)
	sort.Strings(r.Images)
}

// ImportModuleFile importa un módulo revisado con InspectModuleFile.
// newID: con otro nombre (obligatorio si choca con uno incluido); overwrite:
// sustituye el tuyo que tiene el mismo id. Se vuelve a revisar al importar.
func (a *App) ImportModuleFile(p, newID string, overwrite bool) (UserModule, error) {
	r := a.inspectModulePath(p)
	if !r.OK {
		return UserModule{}, errors.New(strings.Join(r.Problems, "; "))
	}
	_, files, err := readModulePack(p)
	if err != nil {
		return UserModule{}, err
	}
	id := r.ID
	if newID = strings.TrimSpace(newID); newID != "" && newID != r.ID {
		if !modIDRe.MatchString(newID) {
			return UserModule{}, fmt.Errorf("nombre no válido: %q (minúsculas, números y guiones)", newID)
		}
		files = renameModuleFiles(files, r.ID, newID)
		id = newID
	}
	if modules.IsBuiltin(id) {
		return UserModule{}, fmt.Errorf("«%s» es un módulo incluido: impórtalo con otro nombre", id)
	}
	dir, err := a.modDir(id)
	if err != nil {
		return UserModule{}, err
	}
	if _, err := os.Stat(dir); err == nil {
		if !overwrite {
			return UserModule{}, fmt.Errorf("ya tienes un módulo «%s»: elige otro nombre o sustitúyelo", id)
		}
	}
	// Se escribe aparte y se cambia de golpe: si algo falla, el tuyo sigue igual.
	// Con un punto delante: el catálogo no las carga si se quedan a medias.
	tmp := filepath.Join(filepath.Dir(dir), "."+id+".importando")
	_ = os.RemoveAll(tmp)
	if err := writeModFiles(tmp, files); err != nil {
		_ = os.RemoveAll(tmp)
		return UserModule{}, err
	}
	old := filepath.Join(filepath.Dir(dir), "."+id+".anterior")
	_ = os.RemoveAll(old)
	if _, err := os.Stat(dir); err == nil {
		if err := os.Rename(dir, old); err != nil {
			_ = os.RemoveAll(tmp)
			return UserModule{}, err
		}
	}
	if err := os.Rename(tmp, dir); err != nil {
		_ = os.Rename(old, dir)
		return UserModule{}, err
	}
	_ = os.RemoveAll(old)
	a.ReloadModules()
	return a.userModule(id), nil
}

// renameModuleFiles cambia el id y el prefijo de sus variables (como al
// copiar un módulo incluido).
func renameModuleFiles(files map[string][]byte, from, to string) map[string][]byte {
	out := map[string][]byte{}
	oldP, newP := modules.VarPrefix(from), modules.VarPrefix(to)
	for k, b := range files {
		s := strings.ReplaceAll(string(b), oldP, newP)
		if k == "module.yaml" {
			s = regexp.MustCompile(`(?m)^id:\s*\S+`).ReplaceAllString(s, "id: "+to)
		}
		out[k] = []byte(s)
	}
	return out
}
