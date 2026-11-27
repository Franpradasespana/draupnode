package app

import (
	"strings"
	"testing"

	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

func modVal(p store.Project, mod, key string) any {
	for _, m := range p.Modules {
		if m.ID == mod {
			return m.Values[key]
		}
	}
	return nil
}

func TestHistorialConfiguracion(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	srv, _ := a.store.SaveServer(store.Server{Name: "h", Host: "203.0.113.21", Port: 22, User: "ubuntu", AuthMethod: store.AuthKey, KeyPath: "/dev/null"})
	p, err := a.SaveProject(store.Project{Name: "P", ServerID: srv.ID, Modules: []store.ProjectModule{{ID: "postgres", Values: map[string]any{"postgres_dir": "/srv/uno"}}}})
	if err != nil {
		t.Fatal(err)
	}
	// Al crearlo queda la primera versión; guardar lo mismo otra vez no apunta nada.
	if _, err := a.SaveProject(p); err != nil {
		t.Fatal(err)
	}
	if h := a.ConfigHistory("p", p.ID); len(h) != 1 {
		t.Fatalf("debería haber solo la versión inicial: %+v", h)
	}
	for i := range p.Modules {
		if p.Modules[i].ID == "postgres" {
			p.Modules[i].Values["postgres_dir"] = "/srv/dos"
		}
	}
	if p, err = a.SaveProject(p); err != nil {
		t.Fatal(err)
	}
	h := a.ConfigHistory("p", p.ID)
	if len(h) != 2 || !strings.Contains(strings.Join(h[0].Changes, "|"), "/srv/uno → /srv/dos") {
		t.Fatalf("historial: %+v", h)
	}
	// Volver a la versión anterior.
	if err := a.RestoreConfigVersion("p", p.ID, h[1].ID); err != nil {
		t.Fatal(err)
	}
	p, _ = a.store.Project(p.ID)
	if v := modVal(p, "postgres", "postgres_dir"); v != "/srv/uno" {
		t.Fatalf("tras volver: %v", v)
	}
	h = a.ConfigHistory("p", p.ID)
	if len(h) != 3 || !strings.HasPrefix(h[0].Reason, "Vuelta a la versión") {
		t.Fatalf("la vuelta atrás debe quedar apuntada: %+v", h[0])
	}
	if err := a.RestoreConfigVersion("p", p.ID, "no-existe"); err == nil {
		t.Fatal("versión inexistente debería fallar")
	}
	if err := a.DeleteProject(p.ID); err != nil {
		t.Fatal(err)
	}
	if h := a.ConfigHistory("p", p.ID); len(h) != 0 {
		t.Fatalf("al borrar se va el historial: %+v", h)
	}
}

func TestHistorialPlantilla(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	r, err := a.SaveRecipe(store.Recipe{Name: "R", Modules: []store.ProjectModule{{ID: "docker", Values: map[string]any{}}}})
	if err != nil {
		t.Fatal(err)
	}
	r.Modules = append(r.Modules, store.ProjectModule{ID: "postgres", Values: map[string]any{}})
	if r, err = a.SaveRecipe(r); err != nil {
		t.Fatal(err)
	}
	h := a.ConfigHistory("r", r.ID)
	if len(h) < 2 || !strings.Contains(strings.Join(h[0].Changes, "|"), "Añadido") {
		t.Fatalf("historial plantilla: %+v", h)
	}
	if err := a.RestoreConfigVersion("r", r.ID, h[len(h)-1].ID); err != nil {
		t.Fatal(err)
	}
	r, _ = a.store.Recipe(r.ID)
	for _, m := range r.Modules {
		if m.ID == "postgres" {
			t.Fatalf("postgres debería haberse quitado: %+v", r.Modules)
		}
	}
}
