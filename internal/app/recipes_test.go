package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

func TestPlantillasYModulosDelServidor(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	s1, _ := a.store.SaveServer(store.Server{Name: "uno", Host: "203.0.113.10", User: "root", AuthMethod: store.AuthPassword})
	s2, _ := a.store.SaveServer(store.Server{Name: "dos", Host: "203.0.113.11", User: "root", AuthMethod: store.AuthPassword})

	r, err := a.SaveRecipe(store.Recipe{Name: "Web", Modules: []store.ProjectModule{{ID: "caddy", Values: map[string]any{"caddy_sites": []string{"a.ejemplo.com 127.0.0.1:8000"}}}}})
	if err != nil || len(r.Modules) != 2 { // base se añade sola
		t.Fatalf("plantilla: %+v %v", r.Modules, err)
	}
	// Aplicar la plantilla añade sus módulos al servidor, marcando de dónde vienen.
	res, err := a.ApplyTemplate(s1.ID, r.ID)
	if err != nil {
		t.Fatal(err)
	}
	p1 := res.Project
	if len(p1.Modules) != 2 || projectModule(p1, "caddy").From != r.ID || strings.Join(p1.Templates, ",") != r.ID {
		t.Fatalf("aplicada: %+v", p1)
	}
	// Un servidor tiene un solo conjunto de módulos.
	if _, err := a.SaveProject(store.Project{Name: "otro", ServerID: s1.ID}); err == nil {
		t.Fatal("dos conjuntos de módulos en un servidor")
	}
	// Un módulo añadido en el servidor no viene de ninguna plantilla; los suyos conservan su configuración al reaplicar.
	p1.Modules = append(p1.Modules, store.ProjectModule{ID: "firewall", Values: map[string]any{}})
	projectModule(p1, "caddy").Values["caddy_email"] = "yo@ejemplo.com"
	if p1, err = a.SaveProject(p1); err != nil {
		t.Fatal(err)
	}
	if res, _ = a.ApplyTemplate(s1.ID, r.ID); projectModule(res.Project, "caddy").Values["caddy_email"] != "yo@ejemplo.com" || len(res.Project.Modules) != 3 || len(res.Project.Templates) != 1 {
		t.Fatalf("reaplicar: %+v", res.Project)
	}
	if projectModule(res.Project, "firewall").From != "" || projectModule(res.Project, "caddy").From != r.ID {
		t.Fatal("origen de los módulos")
	}
	// Editar la plantilla no cambia los servidores.
	r.Modules = append(r.Modules, store.ProjectModule{ID: "docker", Values: map[string]any{}})
	if r, err = a.SaveRecipe(r); err != nil {
		t.Fatal(err)
	}
	if p, _ := a.store.ServerProject(s1.ID); projectModule(p, "docker") != nil {
		t.Fatal("la plantilla no debe tocar el servidor")
	}
	// Llevar módulos del servidor a una plantilla nueva y a la existente.
	nr, err := a.ModulesToTemplate(s1.ID, []string{"firewall", "caddy"}, "", "Seguridad")
	if err != nil || len(nr.Recipe.Modules) != 3 || projectModule(nr.Project, "firewall").From != nr.Recipe.ID { // + base, que necesita Caddy
		t.Fatalf("nueva: %+v %v", nr, err)
	}
	if _, err := a.ModulesToTemplate(s1.ID, []string{"firewall"}, "", "seguridad"); err == nil {
		t.Fatal("nombre repetido")
	}
	up, err := a.ModulesToTemplate(s1.ID, []string{"caddy"}, r.ID, "")
	if err != nil || projectModule(store.Project{Modules: up.Recipe.Modules}, "caddy").Values["caddy_email"] != "yo@ejemplo.com" || projectModule(store.Project{Modules: up.Recipe.Modules}, "docker") == nil {
		t.Fatalf("existente: %+v %v", up.Recipe.Modules, err)
	}
	// Otro servidor: la plantilla le llega ya con lo nuevo.
	if res, _ = a.ApplyTemplate(s2.ID, r.ID); projectModule(res.Project, "docker") == nil {
		t.Fatal("servidor dos")
	}
	if v := a.ListRecipes(); len(v) != 2 {
		t.Fatalf("lista: %+v", v)
	}
	// Borrar una plantilla deja los módulos en los servidores.
	if err := a.DeleteRecipe(r.ID); err != nil {
		t.Fatal(err)
	}
	p2, _ := a.store.ServerProject(s2.ID)
	if len(p2.Modules) != 3 || len(p2.Templates) != 0 || projectModule(p2, "docker").From != "" {
		t.Fatalf("tras borrar: %+v", p2)
	}
}

// Datos de la 0.36–0.49 (un despliegue por plantilla): al abrir se juntan
// en los módulos de cada servidor, y antes se guarda una copia.
func TestConvertirAModulosDelServidor(t *testing.T) {
	dir := t.TempDir()
	old := map[string]any{"version": 2,
		"servers": []any{map[string]any{"id": "s1", "name": "web", "host": "203.0.113.10", "port": 22, "user": "root", "authMethod": "password"}},
		"recipes": []any{map[string]any{"id": "r1", "name": "Base"}, map[string]any{"id": "r2", "name": "Apps"}},
		"projects": []any{
			map[string]any{"id": "p1", "name": "Base", "serverId": "s1", "slug": "base", "recipeId": "r1", "createdAt": "2026-11-01T10:00:00Z",
				"modules": []any{map[string]any{"id": "base", "values": map[string]any{}}, map[string]any{"id": "docker", "values": map[string]any{}}}, "installedModules": []any{"base", "docker"}},
			map[string]any{"id": "p2", "name": "Apps", "serverId": "s1", "slug": "apps", "recipeId": "r2", "createdAt": "2026-11-02T10:00:00Z",
				"modules": []any{map[string]any{"id": "docker", "values": map[string]any{}}, map[string]any{"id": "git-app", "values": map[string]any{"git_app_repo": "https://ejemplo.org/x.git"}}}, "installedModules": []any{"git-app"}},
		}}
	b, _ := json.Marshal(old)
	os.WriteFile(filepath.Join(dir, "draupnode.json"), b, 0o600)
	st, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(st.Projects()) != 1 {
		t.Fatalf("debería quedar uno por servidor: %d", len(st.Projects()))
	}
	p, _ := st.ServerProject("s1")
	ids := []string{}
	for _, m := range p.Modules {
		ids = append(ids, m.ID+"<"+m.From)
	}
	if p.ID != "p1" || p.Slug != "base" || p.Name != "web" || strings.Join(ids, ",") != "base<r1,docker<r1,git-app<r2" ||
		strings.Join(p.Templates, ",") != "r1,r2" || strings.Join(p.InstalledModules, ",") != "base,docker,git-app" || p.RecipeID != "" {
		t.Fatalf("convertido: %+v (%v)", p, ids)
	}
	if _, err := os.Stat(filepath.Join(dir, "draupnode.json.antes-0.50")); err != nil {
		t.Fatal("falta la copia de antes")
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
	r, err := st.Recipe(p.Templates[0])
	if err != nil || r.Name != "Tienda" || len(r.Modules) != 1 || p.Slug != "tienda" || p.Modules[0].From != r.ID {
		t.Fatalf("conversión: %+v %+v %v", p, r, err)
	}
	st2, _ := store.Open(dir)
	if len(st2.Recipes()) != 1 {
		t.Fatal("convirtió dos veces")
	}
}
