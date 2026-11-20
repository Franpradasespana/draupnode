package bundle

import (
	"io/fs"
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
		`- !unsafe "tienda"`, "base_swap_mb: 2048",
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

func TestCoolifyURL(t *testing.T) {
	if got := (Options{Host: "203.0.113.10"}).coolifyURL(); got != "http://203.0.113.10:8000" {
		t.Fatal(got)
	}
	if got := (Options{Host: "2001:db8::1"}).coolifyURL(); got != "http://[2001:db8::1]:8000" {
		t.Fatal(got)
	}
	if got := (Options{Host: "127.0.0.1", CoolifyURL: "http://127.0.0.1:18000"}).coolifyURL(); got != "http://127.0.0.1:18000" {
		t.Fatal(got)
	}
}

func TestSecretosYComprobaciones(t *testing.T) {
	dir := t.TempDir()
	d := filepath.Join(dir, "tok")
	os.MkdirAll(filepath.Join(d, "role", "tasks"), 0o755)
	os.WriteFile(filepath.Join(d, "role", "tasks", "main.yml"), []byte("---\n[]\n"), 0o644)
	os.WriteFile(filepath.Join(d, "module.yaml"), []byte("id: tok\nname: Tok\nvariables:\n  - name: tok_api\n    label: Token de la API\n    type: secret\n"), 0o644)
	c, _ := modules.Load(dir)
	tok, _ := c.Get("tok")
	sel := append(selection(t, []string{"postgres"}, nil), Selection{Module: tok, Values: map[string]any{}})

	site, _ := SiteYAML(opts(), sel)
	for _, want := range []string{"vars_files:", "- secretos.yml", "preflight_containers:", `name: !unsafe "pg-compartido"`} {
		if !strings.Contains(string(site), want) {
			t.Fatalf("site.yml sin %q:\n%s", want, site)
		}
	}
	// Exportado: el secreto no va dentro y el script lo pide.
	sc, _ := Script(opts(), sel)
	if strings.Contains(string(sc), "s3cr3t") || !strings.Contains(string(sc), "pedir tok_api DN_SECRET_TOK_API 'Token de la API'") {
		t.Fatal("el exportado debe pedir el secreto")
	}
	// Desde la app: va en secretos.yml (dentro del payload).
	o := opts()
	o.Secrets = map[string]string{"tok_api": `s3cr3t"{{x}}`}
	pl, _ := Payload(o, sel)
	out := t.TempDir()
	cmd := exec.Command("tar", "-xz", "-C", out)
	cmd.Stdin = strings.NewReader(string(pl))
	if b, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v %s", err, b)
	}
	b, err := os.ReadFile(filepath.Join(out, "secretos.yml"))
	if err != nil || !strings.Contains(string(b), `tok_api: !unsafe "s3cr3t\"{{x}}"`) {
		t.Fatalf("secretos.yml: %v %s", err, b)
	}
	if !strings.Contains(string(sc), "@@DN-SECRETS") || !strings.Contains(string(sc), "DRAUPNODE_CLIENT_IP") {
		t.Fatal("falta la devolución de secretos o la IP del cliente")
	}
}

// El instalar.sh exportado pide el secreto (aquí por variable de entorno) y
// escribe un secretos.yml válido. Se usa la función «pedir» del script real.
func TestPedirSecretoEnBash(t *testing.T) {
	dir := t.TempDir()
	d := filepath.Join(dir, "tok")
	os.MkdirAll(filepath.Join(d, "role", "tasks"), 0o755)
	os.WriteFile(filepath.Join(d, "role", "tasks", "main.yml"), []byte("---\n[]\n"), 0o644)
	os.WriteFile(filepath.Join(d, "module.yaml"), []byte("id: tok\nname: Tok\nvariables:\n  - name: tok_api\n    type: secret\n"), 0o644)
	c, _ := modules.Load(dir)
	tok, _ := c.Get("tok")
	sc := string(must(Script(opts(), []Selection{{Module: tok, Values: map[string]any{}}})))
	a := strings.Index(sc, "  pedir() {")
	b := strings.Index(sc[a:], "\n  }\n")
	if a < 0 || b < 0 {
		t.Fatal("no encuentro pedir() en el script")
	}
	fn := sc[a : a+b+4]
	work := t.TempDir()
	cmd := exec.Command("bash", "-c", "set -e; cd \"$1\"; "+fn+"\npedir tok_api DN_SECRET_TOK_API 'Token'; cat secretos.yml", "_", work)
	cmd.Env = append(os.Environ(), `DN_SECRET_TOK_API=a'b"c\d`)
	out, err := cmd.CombinedOutput()
	if err != nil || strings.TrimSpace(string(out)) != `tok_api: !unsafe "a'b\"c\\d"` {
		t.Fatalf("%v %q", err, out)
	}
}

func must(b []byte, err error) []byte {
	if err != nil {
		panic(err)
	}
	return b
}

// Ejecutado a mano sin SSH_CLIENT (p. ej. con sudo): con «set -u» no debe
// fallar, y debe pasar la IP a sudo. sudo es aquí un falso que enseña su orden.
func TestScriptSinSSHClient(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("como root no pasa por sudo")
	}
	dir := t.TempDir()
	p := filepath.Join(dir, "instalar.sh")
	os.WriteFile(p, must(Script(opts(), selection(t, []string{"base"}, nil))), 0o755)
	os.WriteFile(filepath.Join(dir, "sudo"), []byte("#!/bin/sh\necho \"SUDO $*\"\n"), 0o755)
	for _, env := range [][]string{{}, {"SSH_CLIENT=203.0.113.7 51000 22"}} {
		cmd := exec.Command("bash", p)
		cmd.Env = append([]string{"PATH=" + dir + ":/usr/bin:/bin", "HOME=" + dir}, env...)
		out, err := cmd.CombinedOutput()
		if err != nil || !strings.Contains(string(out), "SUDO env DRAUPNODE_CLIENT_IP=") {
			t.Fatalf("%v %v %s", env, err, out)
		}
		if len(env) > 0 && !strings.Contains(string(out), "DRAUPNODE_CLIENT_IP=203.0.113.7 bash") {
			t.Fatalf("no pasó la IP: %s", out)
		}
	}
}

func TestPlaybookDesinstalar(t *testing.T) {
	sel := selection(t, []string{"postgres"}, nil) // base, docker, postgres
	o := opts()
	o.Uninstall, o.Purge = true, true
	if _, err := SiteYAML(o, sel); err == nil || !strings.Contains(err.Error(), "Sistema base") {
		t.Fatalf("base no se puede desinstalar: %v", err)
	}
	sel = sel[1:] // docker, postgres
	site, err := SiteYAML(o, sel)
	if err != nil {
		t.Fatal(err)
	}
	y := string(site)
	ip, id := strings.Index(y, "name: postgres"), strings.Index(y, "name: docker")
	if ip < 0 || id < 0 || ip > id || !strings.Contains(y, "tasks_from: uninstall") || !strings.Contains(y, "draupnode_uninstall_purge: true") || strings.Contains(y, "draupnode_preflight") {
		t.Fatalf("orden inverso / purge:\n%s", y)
	}
	sc, _ := Script(o, sel)
	if !strings.Contains(string(sc), "DESINSTALAR postgres → docker") {
		t.Fatal("cabecera")
	}
}

// En las plantillas y tareas «{#» abre un comentario de Jinja: en bash
// (${#var}) hay que escribirlo de otra forma.
func TestPlantillasSinComentarioJinja(t *testing.T) {
	c, _ := modules.Load("")
	for _, m := range c.All() {
		for _, f := range m.Files {
			b, _ := fs.ReadFile(m.Role(), f)
			if strings.Contains(string(b), "{#") {
				t.Errorf("%s/%s contiene «{#»", m.ID, f)
			}
		}
	}
}
