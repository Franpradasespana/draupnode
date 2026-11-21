package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

func TestRecetasYDespliegues(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	s1, _ := a.store.SaveServer(store.Server{Name: "uno", Host: "203.0.113.10", User: "root", AuthMethod: store.AuthPassword})
	s2, _ := a.store.SaveServer(store.Server{Name: "dos", Host: "203.0.113.11", User: "root", AuthMethod: store.AuthPassword})

	r, err := a.SaveRecipe(store.Recipe{Name: "Web", Modules: []store.ProjectModule{{ID: "caddy", Values: map[string]any{"caddy_sites": []string{"a.ejemplo.com 127.0.0.1:8000"}}}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Modules) != 2 { // base se añade sola
		t.Fatalf("receta: %+v", r.Modules)
	}
	d1, err := a.DeployRecipe(r.ID, s1.ID)
	if err != nil || d1.RecipeID != r.ID || len(d1.Modules) != 2 || !d1.Overrides.Empty() {
		t.Fatalf("despliegue: %+v %v", d1, err)
	}
	if _, err := a.DeployRecipe(r.ID, s1.ID); err == nil {
		t.Fatal("no debería desplegar dos veces en el mismo servidor")
	}
	d2, _ := a.DeployRecipe(r.ID, s2.ID)

	// En el servidor dos cambia el correo de Caddy (valor propio).
	projectModule(d2, "caddy").Values["caddy_email"] = "yo@ejemplo.com"
	d2, _ = a.SaveProject(d2)
	diff, _ := a.ProjectRecipeDiff(d2.ID)
	if strings.Join(diff.Changed["caddy"], ",") != "caddy_email" {
		t.Fatalf("diferencias: %+v", diff)
	}
	// Cambiar la receta llega a los dos, y el dos conserva su correo.
	r.Modules = append(r.Modules, store.ProjectModule{ID: "firewall", Values: map[string]any{}})
	if r, err = a.SaveRecipe(r); err != nil {
		t.Fatal(err)
	}
	d1, _ = a.store.Project(d1.ID)
	d2, _ = a.store.Project(d2.ID)
	if projectModule(d1, "firewall") == nil || projectModule(d2, "firewall") == nil {
		t.Fatal("el módulo nuevo de la receta no llegó")
	}
	if projectModule(d2, "caddy").Values["caddy_email"] != "yo@ejemplo.com" || projectModule(d1, "caddy").Values["caddy_email"] != "" {
		t.Fatal("se perdió o se contagió el valor propio")
	}
	// Llevar lo del dos a la receta: el uno lo recibe.
	if _, err := a.PushToRecipe(d2.ID); err != nil {
		t.Fatal(err)
	}
	d1, _ = a.store.Project(d1.ID)
	if projectModule(d1, "caddy").Values["caddy_email"] != "yo@ejemplo.com" {
		t.Fatal("no llegó a los demás")
	}
	// Quitar un módulo solo en un servidor y volver a la receta.
	d1.Modules = []store.ProjectModule{*projectModule(d1, "base"), *projectModule(d1, "caddy")}
	d1, _ = a.SaveProject(d1)
	if diff, _ := a.ProjectRecipeDiff(d1.ID); strings.Join(diff.Removed, ",") != "firewall" {
		t.Fatalf("quitado: %+v", diff)
	}
	d1, _ = a.ResetToRecipe(d1.ID)
	if projectModule(d1, "firewall") == nil || !d1.Overrides.Empty() {
		t.Fatal("no volvió a la receta")
	}
	if a.DeleteRecipe(r.ID) == nil {
		t.Fatal("no se debe borrar una receta en uso")
	}
	if v := a.ListRecipes(); len(v) != 1 || len(v[0].Deployments) != 2 {
		t.Fatalf("lista: %+v", v)
	}
}

// Los proyectos de antes (sin recetas) se convierten al abrir.
func TestConvertirProyectosViejos(t *testing.T) {
	dir := t.TempDir()
	old := map[string]any{"version": 1, "servers": []any{map[string]any{"id": "s1", "name": "web", "host": "203.0.113.10", "port": 22, "user": "root", "authMethod": "password"}},
		"projects": []any{map[string]any{"id": "p1", "name": "Tienda", "serverId": "s1", "slug": "tienda", "modules": []any{map[string]any{"id": "base", "values": map[string]any{}}}}}}
	b, _ := json.Marshal(old)
	os.WriteFile(filepath.Join(dir, "draupnode.json"), b, 0o600)
	st, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	p, _ := st.Project("p1")
	r, err := st.Recipe(p.RecipeID)
	if err != nil || r.Name != "Tienda" || len(r.Modules) != 1 || p.Slug != "tienda" {
		t.Fatalf("conversión: %+v %+v %v", p, r, err)
	}
	st2, _ := store.Open(dir)
	if len(st2.Recipes()) != 1 {
		t.Fatal("convirtió dos veces")
	}
}
