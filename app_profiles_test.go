package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"draupnode/internal/dockerize"
	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

func TestPerfilesPorTipoDeApp(t *testing.T) {
	if v, _, _ := profileValue("laravel", "APP_ENV", "local", ""); v != "production" {
		t.Fatal(v)
	}
	if _, gen, f := profileValue("laravel", "APP_KEY", "", ""); !gen || f != "laravel" {
		t.Fatal("APP_KEY")
	}
	if _, gen, f := profileValue("rails", "SECRET_KEY_BASE", "", ""); !gen || f != "hex-64" {
		t.Fatal("rails")
	}
	if v, _, _ := profileValue("django", "DJANGO_ALLOWED_HOSTS", "*", "club.ejemplo.com"); v != "club.ejemplo.com,localhost,127.0.0.1" {
		t.Fatal(v)
	}
	if v, _, _ := profileValue("node", "NODE_ENV", "development", ""); v != "production" {
		t.Fatal(v)
	}
}

func TestErroresTraducidos(t *testing.T) {
	cases := map[string]string{
		`FATAL:  database "prueba" does not exist`:                         "«prueba» no existe",
		`Bind for 127.0.0.1:3000 failed: port is already allocated`:        "El puerto ya lo usa",
		`ModuleNotFoundError: No module named 'psycopg'`:                   "«psycopg»",
		`ValueError: Fernet key must be 32 url-safe base64-encoded bytes.`: "NOMBRE:fernet",
		`todo bien`: "",
	}
	for in, want := range cases {
		got := explainError(in)
		if (want == "" && got != "") || (want != "" && !strings.Contains(got, want)) {
			t.Errorf("%q → %q", in, got)
		}
	}
}

func TestPostgresCompartido(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	srv, _ := a.SaveServer(srvPassword(), "", false, "")
	p, err := a.SaveProject(store.Project{Name: "web", ServerID: srv.ID, Modules: []store.ProjectModule{
		{ID: "git-app", Values: map[string]any{"git_app_repo": "https://ejemplo.org/x.git", "git_app_name": "mi-tienda", "git_app_db": "postgres-compartido"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	pg := projectModule(p, "postgres")
	if pg == nil || strings.Join(toStrings(pg.Values["postgres_databases"]), ",") != "mi_tienda" {
		t.Fatalf("postgres: %+v", pg)
	}
	if v := projectModule(p, "git-app").Values; v["git_app_db_host"] != "pg-compartido" || v["git_app_db_network"] != "apps" {
		t.Fatalf("conexión: %v", v)
	}
	chk, _ := a.resolveProject(p)
	order := strings.Join(chk.Order, ",")
	if strings.Index(order, "postgres") > strings.Index(order, "git-app") {
		t.Fatalf("PostgreSQL antes que la app: %s", order)
	}
}

func TestLaravelNoEsNode(t *testing.T) {
	d := t.TempDir()
	for f, c := range map[string]string{"artisan": "", "composer.json": `{"require":{"laravel/framework":"^12.0"}}`, "package.json": `{"scripts":{"build":"vite build"}}`} {
		os.WriteFile(filepath.Join(d, f), []byte(c), 0o644)
	}
	an, err := dockerize.Analyze(d)
	if err != nil || an.Spec.Stack != dockerize.StackPHP || an.Spec.Framework != "laravel" {
		t.Fatalf("%+v %v", an.Spec, err)
	}
}
