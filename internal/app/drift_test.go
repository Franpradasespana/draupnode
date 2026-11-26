package app

import (
	"reflect"
	"strings"
	"testing"

	"draupnode/internal/store"
)

func TestDriftState(t *testing.T) {
	out := "timer draupnode-copia-x.timer\ncontainer dn-kuma\nbasura\n\ncontainer \n"
	got := parseState(out)
	want := []string{"container:dn-kuma", "timer:draupnode-copia-x.timer"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseState = %v", got)
	}
	items := stoppedSince(want, []string{"container:dn-kuma", "container:nuevo"})
	if len(items) != 1 || items[0].Kind != "timer" || items[0].Name != "draupnode-copia-x.timer" || items[0].Key != "timer:draupnode-copia-x.timer" {
		t.Fatalf("stoppedSince = %+v", items)
	}
}

func TestPendingChanges(t *testing.T) {
	p := store.Project{
		Modules:          []store.ProjectModule{{ID: "base", Values: map[string]any{"a": 1.0, "b": "x"}}},
		InstalledModules: []string{"base"},
		InstalledValues:  map[string]map[string]any{"base": {"b": "x", "a": 1.0}},
	}
	if pendingChanges(p) {
		t.Fatal("mismos valores en otro orden: no hay nada pendiente")
	}
	p.Modules[0].Values["a"] = 2.0
	if !pendingChanges(p) {
		t.Fatal("valor cambiado: pendiente")
	}
	p.Modules[0].Values["a"] = 1.0
	p.Modules = append(p.Modules, store.ProjectModule{ID: "docker"})
	if !pendingChanges(p) {
		t.Fatal("módulo sin instalar: pendiente")
	}
}

func TestCleanDiff(t *testing.T) {
	in := "--- before: /etc/caddy/Caddyfile\n+++ after: /root/.ansible/tmp/ansible-local-1/tmpx/Caddyfile.j2\n@@ -1 +1 @@\n-a\n+b\n"
	want := "--- before: /etc/caddy/Caddyfile\n+++ after: /etc/caddy/Caddyfile\n@@ -1 +1 @@\n-a\n+b\n"
	if got := cleanDiff(in); got != want {
		t.Fatalf("%q", got)
	}
}

func TestComposeUpdateCmd(t *testing.T) {
	cmd := composeUpdateCmd(ImageCompose{Project: "dn-x", Dir: "/srv/a b", Files: "/srv/a b/c.yml,/srv/a b/d.yml"})
	for _, want := range []string{"cd '/srv/a b'", "-p 'dn-x'", "-f '/srv/a b/c.yml' -f '/srv/a b/d.yml'", "pull -q --ignore-buildable", "up -d"} {
		if !strings.Contains(cmd, want) {
			t.Fatalf("falta %q en %s", want, cmd)
		}
	}
}

func TestUpdateImagesSoloLoConocido(t *testing.T) {
	a := newTestApp(t, noKeyring{})
	srv, _ := a.store.SaveServer(store.Server{Name: "x", Host: "203.0.113.1", Port: 22, User: "root", AuthMethod: store.AuthKey, KeyPath: "/k"})
	if r := a.UpdateImages(srv.ID, []string{"p"}, "", "", ""); r.Status != "error" {
		t.Fatal("sin comprobar antes no debería actualizar")
	}
	a.saveImages(srv.ID, ImageReport{Images: []ImageInfo{
		{Image: "a", Compose: []ImageCompose{{Project: "web", Dir: "/srv/web"}}},
		{Image: "b", Coolify: true, Compose: []ImageCompose{{Project: "coolify-app", Dir: "/data"}}},
	}})
	for _, p := range []string{"otro", "coolify-app"} {
		if r := a.UpdateImages(srv.ID, []string{p}, "", "", ""); r.Status != "error" || !strings.Contains(r.Message, p) {
			t.Fatalf("%s: %+v", p, r.RunStart)
		}
	}
	if got := a.LastImageChecks()[srv.ID]; len(got.Images) != 2 {
		t.Fatalf("%+v", got)
	}
}
