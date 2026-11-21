package main

import (
	"encoding/json"
	"strings"
	"testing"

	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

func TestFichaYRecuperar(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	s, _ := a.store.SaveServer(store.Server{Name: "web", Host: "203.0.113.10", User: "root", AuthMethod: store.AuthPassword})
	r, _ := a.SaveRecipe(store.Recipe{Name: "Apps", Modules: []store.ProjectModule{{ID: "git-app", Values: map[string]any{"git_app_repo": "https://ejemplo.org/x.git", "git_app_env_secret": "SECRETO"}}}})
	p, err := a.DeployRecipe(r.ID, s.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, sel := a.resolveProject(p)
	raw := a.markerForApply(p, sel)
	if strings.Contains(string(raw), "SECRETO") {
		t.Fatal("la ficha no debe llevar datos secretos")
	}
	var m serverMarker
	json.Unmarshal(raw, &m)
	if m.Template != "Apps" || m.Slug != slugOf(p) || len(m.Modules) < 2 {
		t.Fatalf("ficha: %+v", m)
	}
	// Al desinstalar el único módulo instalado, la ficha se borra.
	if a.markerAfterUninstall(p, []string{"git-app"}) != nil {
		t.Fatal("sin módulos instalados no hay ficha")
	}

	// Otro Draupnode (configuración perdida): recupera la plantilla.
	b := newTestApp(t, secrets.Memory{})
	s2, _ := b.store.SaveServer(store.Server{Name: "web", Host: "203.0.113.10", User: "root", AuthMethod: store.AuthPassword})
	res, err := b.RecoverFromServer(s2.ID, string(raw))
	if err != nil {
		t.Fatal(err)
	}
	got := res.Project
	if slugOf(got) != m.Slug || got.AppliedAt == nil || len(got.InstalledModules) != len(m.Modules) {
		t.Fatalf("recuperado: %+v", got)
	}
	if d, _ := b.ProjectRecipeDiff(got.ID); d.RecipeName != "Apps" || len(d.Added)+len(d.Removed)+len(d.Changed) != 0 {
		t.Fatal("plantilla")
	}
	if _, err := b.RecoverFromServer(s2.ID, string(raw)); err == nil {
		t.Fatal("dos veces la misma")
	}
	if _, err := b.RecoverFromServer(s2.ID, `{"slug":"../x","modulos":[{"id":"docker"}]}`); err == nil {
		t.Fatal("slug malicioso")
	}
	// Ficha mínima (solo carpeta y módulos), como la que se deduce sin ficha.
	if res, err := b.RecoverFromServer(s2.ID, `{"slug":"vieja","modulos":[{"id":"docker"},{"id":"desconocido"}]}`); err != nil || len(res.Notes) == 0 || res.Project.Name != "vieja" {
		t.Fatalf("mínima: %+v %v", res, err)
	}
}
