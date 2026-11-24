package app

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
	res0, err := a.ApplyTemplate(s.ID, r.ID)
	if err != nil {
		t.Fatal(err)
	}
	p := res0.Project
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
	if len(got.Templates) != 1 || got.Modules[0].From != got.Templates[0] {
		t.Fatalf("plantilla: %+v", got)
	}
	if rr, _ := b.store.Recipe(got.Templates[0]); rr.Name != "Apps" {
		t.Fatal("nombre de la plantilla")
	}
	// Otra vez la misma ficha (misma carpeta): no duplica nada.
	if _, err := b.RecoverFromServer(s2.ID, string(raw)); err != nil || len(b.store.Projects()) != 1 {
		t.Fatalf("dos veces la misma: %v", err)
	}
	if _, err := b.RecoverFromServer(s2.ID, `{"slug":"../x","modulos":[{"id":"docker"}]}`); err == nil {
		t.Fatal("slug malicioso")
	}
	// Otra carpeta en un servidor que ya tiene módulos: no se mezcla.
	if _, err := b.RecoverFromServer(s2.ID, `{"slug":"vieja","modulos":[{"id":"docker"}]}`); err == nil {
		t.Fatal("otra carpeta en un servidor con módulos")
	}
	// Ficha mínima (solo carpeta y módulos), como la que se deduce sin ficha, en un servidor sin módulos.
	s3, _ := b.store.SaveServer(store.Server{Name: "otro", Host: "203.0.113.12", User: "root", AuthMethod: store.AuthPassword})
	if res, err := b.RecoverFromServer(s3.ID, `{"slug":"vieja","modulos":[{"id":"docker"},{"id":"desconocido"}]}`); err != nil || len(res.Notes) == 0 || res.Project.Name != "vieja" {
		t.Fatalf("mínima: %+v %v", res, err)
	}
}
