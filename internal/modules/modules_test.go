package modules

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestCatalogoIncluido(t *testing.T) {
	c, err := Load("")
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Errors) > 0 {
		t.Fatalf("errores: %v", c.Errors)
	}
	for _, id := range []string{"base", "firewall", "docker", "coolify", "postgres", "backups", "backup-target", "caddy", "nginx", "wireguard", "alerts", "git-app", "mariadb", "vaultwarden", "navidrome"} {
		m, ok := c.Get(id)
		if !ok || m.Source != "builtin" || len(m.Files) == 0 {
			t.Fatalf("falta %s: %+v", id, m)
		}
	}
	ord, added, err := c.Resolve([]string{"coolify"})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(ord, []string{"base", "docker", "firewall", "coolify"}) {
		t.Fatalf("orden %v", ord)
	}
	if !reflect.DeepEqual(added, []string{"base", "docker", "firewall"}) {
		t.Fatalf("añadidos %v", added)
	}
	if _, _, err := c.Resolve([]string{"nada"}); err == nil {
		t.Fatal("aceptó un módulo inexistente")
	}
}

func TestValores(t *testing.T) {
	c, _ := Load("")
	pg, _ := c.Get("postgres")
	vals, errs := pg.Values(map[string]any{"postgres_databases": []any{"tienda", "blog", "tienda", ""}})
	if len(errs) > 0 {
		t.Fatal(errs)
	}
	if !reflect.DeepEqual(vals["postgres_databases"], []string{"tienda", "blog"}) || vals["postgres_version"] != "16" {
		t.Fatalf("%v", vals)
	}
	_, errs = pg.Values(map[string]any{"postgres_databases": []any{"Mal Nombre"}, "postgres_version": "9"})
	if errs["postgres_databases"] == "" || errs["postgres_version"] == "" {
		t.Fatalf("debería fallar: %v", errs)
	}
	base, _ := c.Get("base")
	vals, errs = base.Values(map[string]any{"base_swap_mb": float64(1024), "base_auto_updates": false})
	if len(errs) > 0 || vals["base_swap_mb"] != 1024 || vals["base_auto_updates"] != false {
		t.Fatalf("%v %v", vals, errs)
	}
	if _, errs = base.Values(map[string]any{"base_swap_mb": float64(-1)}); errs["base_swap_mb"] == "" {
		t.Fatal("aceptó swap negativo")
	}
	fw, _ := c.Get("firewall")
	if _, errs = fw.Values(map[string]any{"firewall_tcp_ports": []any{"80", "70000"}}); !strings.Contains(errs["firewall_tcp_ports"], "70000") {
		t.Fatalf("puerto malo: %v", errs)
	}
}

func TestModulosDelUsuario(t *testing.T) {
	dir := t.TempDir()
	mk := func(id, yml string, withTasks bool) {
		os.MkdirAll(filepath.Join(dir, id, "role", "tasks"), 0o755)
		os.WriteFile(filepath.Join(dir, id, "module.yaml"), []byte(yml), 0o644)
		if withTasks {
			os.WriteFile(filepath.Join(dir, id, "role", "tasks", "main.yml"), []byte("---\n"), 0o644)
		}
	}
	mk("mi-app", "id: mi-app\nname: Mi app\ndepends: [docker]\nvariables:\n  - name: mi_app_puerto\n    type: int\n    default: 8080\n", true)
	mk("rota", "id: rota\nname: Rota\nvariables:\n  - name: otra_cosa\n", true)
	mk("sintareas", "id: sintareas\nname: X\n", false)
	c, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	if m, ok := c.Get("mi-app"); !ok || m.Source != "user" {
		t.Fatal("no cargó el módulo del usuario")
	}
	if len(c.Errors) != 2 {
		t.Fatalf("errores esperados 2: %v", c.Errors)
	}
}

// writeMod crea un módulo de usuario mínimo en dir.
func writeMod(t *testing.T, dir, id, yml string) {
	t.Helper()
	d := filepath.Join(dir, id)
	os.MkdirAll(filepath.Join(d, "role", "tasks"), 0o755)
	os.WriteFile(filepath.Join(d, "role", "tasks", "main.yml"), []byte("---\n[]\n"), 0o644)
	os.WriteFile(filepath.Join(d, "module.yaml"), []byte("id: "+id+"\nname: "+id+"\n"+yml), 0o644)
}

func TestFormatoNuevo(t *testing.T) {
	dir := t.TempDir()
	writeMod(t, dir, "zeta", "after: [aaa]\nconflicts: [coolify]\n")
	writeMod(t, dir, "aaa", "variables:\n  - name: aaa_token\n    type: secret\n    required: true\n  - name: aaa_puerto\n    type: int\n    default: 9000\nfirewall_ports_from: [aaa_puerto]\nsecrets:\n  - file: aaa_*\n    label: Clave de aaa\n")
	writeMod(t, dir, "malo", "variables:\n  - name: malo_x\n    type: string\nfirewall_ports_from: [malo_x]\n")
	c, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Errors) != 1 || !strings.Contains(c.Errors[0], "malo") {
		t.Fatalf("firewall_ports_from con texto debería fallar: %v", c.Errors)
	}
	// «after»: zeta va detrás de aaa solo si aaa está en el proyecto.
	ord, _, _ := c.Resolve([]string{"zeta", "aaa"})
	if !reflect.DeepEqual(ord, []string{"aaa", "zeta"}) {
		t.Fatalf("orden con after: %v", ord)
	}
	if ord, _, _ := c.Resolve([]string{"zeta"}); !reflect.DeepEqual(ord, []string{"zeta"}) {
		t.Fatalf("after no debe añadir módulos: %v", ord)
	}
	// El SSH va después del Cortafuegos si están los dos.
	ord, _, _ = c.Resolve([]string{"ssh", "firewall"})
	if !reflect.DeepEqual(ord, []string{"base", "firewall", "ssh"}) {
		t.Fatalf("orden ssh: %v", ord)
	}
	if cl := c.Clashes([]string{"coolify", "zeta"}); len(cl) != 1 {
		t.Fatalf("choque: %v", cl)
	}
	if cl := c.Clashes([]string{"zeta", "aaa"}); len(cl) != 0 {
		t.Fatalf("choque falso: %v", cl)
	}
	m, _ := c.Get("aaa")
	vals, errs := m.Values(map[string]any{"aaa_token": "no debe guardarse"})
	if _, ok := vals["aaa_token"]; ok || len(errs) != 0 {
		t.Fatalf("un secreto no va en los valores: %v %v", vals, errs)
	}
	if len(m.SecretVars()) != 1 || m.SecretLabel("aaa_x") != "Clave de aaa" || m.SecretLabel("otro") != "" {
		t.Fatal("secretos del módulo")
	}
}
