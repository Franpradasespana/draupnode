package app

import (
	"reflect"
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
