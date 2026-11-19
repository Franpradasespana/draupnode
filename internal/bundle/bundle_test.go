package bundle

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"draupnode/internal/modules"
)

func selection(t *testing.T, ids []string, vals map[string]map[string]any) []Selection {
	t.Helper()
	c, err := modules.Load("")
	if err != nil {
		t.Fatal(err)
	}
	ord, _, err := c.Resolve(ids)
	if err != nil {
		t.Fatal(err)
	}
	var sel []Selection
	for _, id := range ord {
		m, _ := c.Get(id)
		v, errs := m.Values(vals[id])
		if len(errs) > 0 {
			t.Fatal(errs)
		}
		sel = append(sel, Selection{Module: m, Values: v})
	}
	return sel
}

func opts() Options {
	return Options{Project: "Oracle «producción»", Slug: Slug("Oracle «producción»"), Host: "203.0.113.10", SSHUser: "ubuntu", AppVersion: "test", Now: time.Unix(0, 0)}
}

func TestSlug(t *testing.T) {
	for in, want := range map[string]string{"Oracle «producción»": "oracle-produccion", "  ": "proyecto", "Mi App 2": "mi-app-2"} {
		if got := Slug(in); got != want {
			t.Fatalf("Slug(%q) = %q", in, got)
		}
	}
}

func TestSiteYAML(t *testing.T) {
	sel := selection(t, []string{"coolify", "postgres"}, map[string]map[string]any{
		"postgres": {"postgres_databases": []any{"tienda"}, "postgres_container": "pg-compartido"},
		"base":     {"base_timezone": "Europe/Madrid"},
	})
	y, err := SiteYAML(opts(), sel)
	if err != nil {
		t.Fatal(err)
	}
	s := string(y)
	for _, want := range []string{
		"role: draupnode_preflight", "preflight_ram_mb: 1800", "preflight_disk_gb: 30",
		`draupnode_secrets_dir: !unsafe "/etc/draupnode/secretos/oracle-produccion"`,
		`- !unsafe "tienda"`, "base_swap_mb: 2048", "coolify_open_ports: true",
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("falta %q en:\n%s", want, s)
		}
	}
	if strings.Index(s, "role: docker") > strings.Index(s, "role: coolify") {
		t.Fatal("docker debe ir antes que coolify")
	}
}

// El script se desempaqueta igual que lo hará en el servidor.
func TestScriptDesempaqueta(t *testing.T) {
	sel := selection(t, []string{"postgres"}, nil)
	sc, err := Script(opts(), sel)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	p := filepath.Join(dir, "instalar.sh")
	os.WriteFile(p, sc, 0o755)
	if out, err := exec.Command("bash", "-n", p).CombinedOutput(); err != nil {
		t.Fatalf("bash -n: %v %s", err, out)
	}
	out := filepath.Join(dir, "x")
	os.Mkdir(out, 0o755)
	cmd := exec.Command("bash", "-c", `LINEA=$(awk '/^__DRAUPNODE_PAYLOAD__$/ { print NR + 1; exit }' "$1"); tail -n +"$LINEA" "$1" | base64 -d | tar -xz -C "$2"`, "_", p, out)
	if b, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("desempaquetar: %v %s", err, b)
	}
	for _, f := range []string{"site.yml", "ansible.cfg", "callback_plugins/draupnode.py", "roles/draupnode_preflight/tasks/main.yml",
		"roles/base/tasks/main.yml", "roles/docker/handlers/main.yml", "roles/postgres/templates/docker-compose.yml.j2"} {
		if _, err := os.Stat(filepath.Join(out, f)); err != nil {
			t.Fatalf("falta %s", f)
		}
	}
	if !strings.Contains(string(sc), "Módulos, en este orden: base → docker → postgres") {
		t.Fatal("cabecera")
	}
}
