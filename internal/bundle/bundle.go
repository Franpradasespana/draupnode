// Package bundle genera el «instalar.sh» único de un proyecto: un script bash
// autocontenido que prepara Ansible en el servidor (si no está) y aplica los
// módulos elegidos en local (-c local). Draupnode usa este mismo script para
// «Aplicar» por SSH y para «Exportar».
package bundle

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"embed"
	"encoding/base64"
	"fmt"
	"io/fs"
	"path"
	"regexp"
	"sort"
	"strings"
	"text/template"
	"time"

	"draupnode/internal/modules"

	"gopkg.in/yaml.v3"
)

//go:embed all:files
var staticFS embed.FS

// Selection es un módulo elegido con sus valores ya validados.
type Selection struct {
	Module *modules.Module
	Values map[string]any
}

// Options describe el proyecto que se empaqueta.
type Options struct {
	Project    string // nombre visible
	Slug       string // para rutas: /etc/draupnode/secretos/<slug>
	Host       string // IP o dominio con el que se conecta Draupnode
	SSHUser    string // usuario de conexión (se añade al grupo docker, etc.)
	// CoolifyURL es la dirección del panel de Coolify vista desde este equipo
	// (en el servidor de pruebas el puerto 8000 se publica en otro). Vacío = http://Host:8000.
	CoolifyURL string
	AppVersion string
	Now        time.Time
}

func (o Options) coolifyURL() string {
	if o.CoolifyURL != "" {
		return o.CoolifyURL
	}
	h := o.Host
	if strings.Contains(h, ":") && !strings.HasPrefix(h, "[") {
		h = "[" + h + "]" // IPv6
	}
	return "http://" + h + ":8000"
}

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

// Slug convierte un nombre en algo apto para rutas.
func Slug(s string) string {
	s = strings.ToLower(s)
	r := strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n")
	s = slugRe.ReplaceAllString(r.Replace(s), "-")
	s = strings.Trim(s, "-")
	if len(s) > 40 {
		s = strings.Trim(s[:40], "-")
	}
	if s == "" {
		s = "proyecto"
	}
	return s
}

// SecretsDir es donde los módulos guardan lo que generan en el servidor.
func SecretsDir(slug string) string { return "/etc/draupnode/secretos/" + slug }

// unsafeNode marca los textos del usuario como !unsafe: Ansible no los
// interpreta como plantillas (un «{{» escrito por el usuario queda literal).
func valueNode(v any) *yaml.Node {
	switch x := v.(type) {
	case string:
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!unsafe", Value: x, Style: yaml.DoubleQuotedStyle}
	case []string:
		n := &yaml.Node{Kind: yaml.SequenceNode}
		for _, it := range x {
			n.Content = append(n.Content, valueNode(it))
		}
		return n
	case bool:
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!bool", Value: fmt.Sprint(x)}
	case int:
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!int", Value: fmt.Sprint(x)}
	case nil:
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!null", Value: "null"}
	}
	return valueNode(fmt.Sprint(v))
}

func mapNode(keys []string, vals map[string]*yaml.Node) *yaml.Node {
	n := &yaml.Node{Kind: yaml.MappingNode}
	for _, k := range keys {
		n.Content = append(n.Content, &yaml.Node{Kind: yaml.ScalarNode, Value: k}, vals[k])
	}
	return n
}

// plain es un texto fijo de Draupnode (nombres de rol, hosts…), sin etiqueta.
func plain(s string) *yaml.Node { return &yaml.Node{Kind: yaml.ScalarNode, Value: s} }

// str es un texto que viene del usuario: !unsafe.
func str(s string) *yaml.Node { return valueNode(s) }

// requirements combina los requisitos: SO que admiten TODOS, y el máximo de RAM y disco.
func requirements(sel []Selection) (osList []string, ram, disk int) {
	var allowed map[string]bool
	for _, s := range sel {
		r := s.Module.Requires
		if r.MinRAMMB > ram {
			ram = r.MinRAMMB
		}
		if r.MinDiskGB > disk {
			disk = r.MinDiskGB
		}
		if len(r.OS) == 0 {
			continue
		}
		next := map[string]bool{}
		for _, o := range r.OS {
			if allowed == nil || allowed[o] {
				next[o] = true
			}
		}
		allowed = next
	}
	for o := range allowed {
		osList = append(osList, o)
	}
	sort.Strings(osList)
	if allowed != nil && len(osList) == 0 {
		osList = []string{"ninguno-compatible"}
	}
	return
}

// SiteYAML genera el playbook principal.
func SiteYAML(o Options, sel []Selection) ([]byte, error) {
	osList, ram, disk := requirements(sel)
	osNodes := make([]string, len(osList))
	copy(osNodes, osList)

	roles := &yaml.Node{Kind: yaml.SequenceNode}
	roles.Content = append(roles.Content, mapNode([]string{"role", "vars"}, map[string]*yaml.Node{
		"role": plain("draupnode_preflight"),
		"vars": mapNode([]string{"preflight_os", "preflight_ram_mb", "preflight_disk_gb"}, map[string]*yaml.Node{
			"preflight_os":      valueNode(osNodes),
			"preflight_ram_mb":  valueNode(ram),
			"preflight_disk_gb": valueNode(disk),
		}),
	}))
	for _, s := range sel {
		keys := make([]string, 0, len(s.Values))
		for k := range s.Values {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		vals := map[string]*yaml.Node{}
		for _, k := range keys {
			vals[k] = valueNode(s.Values[k])
		}
		entry := map[string]*yaml.Node{"role": plain(s.Module.ID), "vars": mapNode(keys, vals)}
		roles.Content = append(roles.Content, mapNode([]string{"role", "vars"}, entry))
	}
	play := mapNode([]string{"name", "hosts", "connection", "gather_facts", "vars", "roles"}, map[string]*yaml.Node{
		"name":         str("Draupnode · " + o.Project),
		"hosts":        plain("localhost"),
		"connection":   plain("local"),
		"gather_facts": valueNode(true),
		"vars": mapNode([]string{"draupnode_project", "draupnode_host", "draupnode_ssh_user", "draupnode_secrets_dir", "draupnode_coolify_url"}, map[string]*yaml.Node{
			"draupnode_coolify_url": str(o.coolifyURL()),
			"draupnode_project":     str(o.Slug),
			"draupnode_host":        str(o.Host),
			"draupnode_ssh_user":    str(o.SSHUser),
			"draupnode_secrets_dir": str(SecretsDir(o.Slug)),
		}),
		"roles": roles,
	})
	doc := &yaml.Node{Kind: yaml.DocumentNode, Content: []*yaml.Node{{Kind: yaml.SequenceNode, Content: []*yaml.Node{play}}}}
	var buf bytes.Buffer
	buf.WriteString("# Generado por Draupnode. Se reescribe en cada ejecución.\n")
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	if err := enc.Encode(doc); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

type tarWriter struct {
	tw  *tar.Writer
	now time.Time
}

func (t *tarWriter) add(name string, data []byte, mode int64) error {
	if err := t.tw.WriteHeader(&tar.Header{Name: name, Mode: mode, Size: int64(len(data)), ModTime: t.now, Typeflag: tar.TypeReg}); err != nil {
		return err
	}
	_, err := t.tw.Write(data)
	return err
}

func (t *tarWriter) addFS(fsys fs.FS, prefix string) error {
	return fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		data, err := fs.ReadFile(fsys, p)
		if err != nil {
			return err
		}
		return t.add(path.Join(prefix, p), data, 0o644)
	})
}

// Payload empaqueta en .tar.gz todo lo que necesita ansible-playbook.
func Payload(o Options, sel []Selection) ([]byte, error) {
	site, err := SiteYAML(o, sel)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	t := &tarWriter{tw: tar.NewWriter(gz), now: o.Now}
	static, _ := fs.Sub(staticFS, "files")
	if err := t.addFS(static, ""); err != nil {
		return nil, err
	}
	if err := t.add("site.yml", site, 0o644); err != nil {
		return nil, err
	}
	for _, s := range sel {
		if err := t.addFS(s.Module.Role(), "roles/"+s.Module.ID); err != nil {
			return nil, fmt.Errorf("módulo %s: %w", s.Module.ID, err)
		}
	}
	if err := t.tw.Close(); err != nil {
		return nil, err
	}
	if err := gz.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

var scriptTmpl = template.Must(template.New("s").Parse(`#!/usr/bin/env bash
# =============================================================================
#  instalar.sh · generado por Draupnode {{.AppVersion}} el {{.Date}}
#  Proyecto: {{.Project}}
#  Módulos, en este orden: {{.ModuleList}}
#
#  Uso, en el servidor:
#     sudo bash instalar.sh            aplica la configuración
#     sudo bash instalar.sh --check    solo enseña lo que cambiaría
#
#  Se puede relanzar sin miedo: lo que ya está bien no se toca.
#  Lo que generan los módulos (contraseñas…) queda en {{.SecretsDir}} (solo root).
# =============================================================================
set -euo pipefail

MODO=()
for a in "$@"; do
  case "$a" in
    --check) MODO=(--check --diff) ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $a (usa --check o --help)" >&2; exit 2 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  exec sudo bash "$0" "$@"
fi

etapa() {
  if [ -n "${DRAUPNODE_EVENTS:-}" ]; then
    printf '@@DN {"ev":"stage","name":"%s"}\n' "$1"
  else
    printf '\n==> %s\n' "$1"
  fi
}

DN_HOME=/opt/draupnode
VENV="$DN_HOME/venv"
ANSIBLE_SPEC='ansible-core>=2.16,<2.19'

. /etc/os-release 2>/dev/null || true
case " ${ID:-} ${ID_LIKE:-} " in
  *" debian "*|*" ubuntu "*) FAMILIA=debian ;;
  *" rhel "*|*" fedora "*|*" centos "*) FAMILIA=rhel ;;
  *) FAMILIA=otra ;;
esac

if [ ! -x "$VENV/bin/ansible-playbook" ]; then
  etapa "Preparando Ansible en $VENV (solo la primera vez, 1-2 minutos)"
  case "$FAMILIA" in
    debian)
      export DEBIAN_FRONTEND=noninteractive
      apt-get -o DPkg::Lock::Timeout=600 update -qq
      apt-get -o DPkg::Lock::Timeout=600 install -y -qq python3 python3-venv python3-pip ca-certificates >/dev/null
      ;;
    rhel)
      dnf install -y -q python3 python3-pip ca-certificates >/dev/null
      ;;
    *)
      command -v python3 >/dev/null || { echo "Falta python3 y no sé instalarlo en ${PRETTY_NAME:-este sistema}." >&2; exit 1; }
      ;;
  esac
  mkdir -p "$DN_HOME"
  rm -rf "$VENV"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q --disable-pip-version-check "$ANSIBLE_SPEC"
fi

# El módulo apt de Ansible usa python3-apt del sistema (para previsualizar
# lo necesita ya instalado). Se comprueba siempre, no solo la primera vez.
if [ "$FAMILIA" = debian ] && ! /usr/bin/python3 -c 'import apt' >/dev/null 2>&1; then
  etapa "Instalando python3-apt (lo necesita Ansible)"
  export DEBIAN_FRONTEND=noninteractive
  apt-get -o DPkg::Lock::Timeout=600 update -qq
  apt-get -o DPkg::Lock::Timeout=600 install -y -qq python3-apt >/dev/null
fi

etapa "Desempaquetando el proyecto"
TRABAJO="$(mktemp -d /tmp/draupnode.XXXXXX)"
trap 'rm -rf "$TRABAJO"' EXIT
LINEA=$(awk '/^__DRAUPNODE_PAYLOAD__$/ { print NR + 1; exit }' "$0")
tail -n +"$LINEA" "$0" | base64 -d | tar -xz -C "$TRABAJO"
cd "$TRABAJO"

export ANSIBLE_CONFIG="$TRABAJO/ansible.cfg"
export ANSIBLE_LOCALHOST_WARNING=False
export ANSIBLE_INVENTORY_UNPARSED_WARNING=False
if [ -n "${DRAUPNODE_EVENTS:-}" ]; then
  export ANSIBLE_STDOUT_CALLBACK=draupnode
fi
export PYTHONUNBUFFERED=1

etapa "Ejecutando Ansible"
"$VENV/bin/ansible-playbook" -i localhost, -c local site.yml "${MODO[@]}"
exit 0
__DRAUPNODE_PAYLOAD__
`))

// Script genera el instalar.sh completo.
func Script(o Options, sel []Selection) ([]byte, error) {
	payload, err := Payload(o, sel)
	if err != nil {
		return nil, err
	}
	ids := make([]string, len(sel))
	for i, s := range sel {
		ids[i] = s.Module.ID
	}
	var buf bytes.Buffer
	err = scriptTmpl.Execute(&buf, map[string]string{
		"AppVersion": o.AppVersion,
		"Date":       o.Now.Format("2006-01-02 15:04"),
		"Project":    oneLine(o.Project),
		"ModuleList": strings.Join(ids, " → "),
		"SecretsDir": SecretsDir(o.Slug),
	})
	if err != nil {
		return nil, err
	}
	b64 := base64.StdEncoding.EncodeToString(payload)
	for i := 0; i < len(b64); i += 76 {
		end := i + 76
		if end > len(b64) {
			end = len(b64)
		}
		buf.WriteString(b64[i:end])
		buf.WriteByte('\n')
	}
	return buf.Bytes(), nil
}

func oneLine(s string) string { return strings.NewReplacer("\n", " ", "\r", " ").Replace(s) }
