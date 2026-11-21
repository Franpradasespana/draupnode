package main

import (
	"strings"
	"testing"

	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

func TestEditorDeModulos(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	if _, err := a.CreateUserModule("Mal", ""); err == nil {
		t.Fatal("id no válido")
	}
	if _, err := a.CreateUserModule("docker", ""); err == nil {
		t.Fatal("no debe chocar con uno incluido")
	}
	um, err := a.CreateUserModule("mi-cosa", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(um.Problems) != 0 || um.Files[0] != "module.yaml" || len(um.Files) != 3 {
		t.Fatalf("esqueleto: %+v", um)
	}
	if m, ok := a.cat().Get("mi-cosa"); !ok || m.Source != "user" || !m.Uninstallable {
		t.Fatal("el esqueleto debería cargarse en el catálogo")
	}
	if _, err := a.CreateUserModule("mi-cosa", ""); err == nil {
		t.Fatal("repetido")
	}
	// Rutas fuera del módulo o del rol.
	for _, bad := range []string{"../x.yml", "/etc/passwd", "role/../../x", "otra.yml", "role\\x"} {
		if _, err := a.SaveUserModuleFile("mi-cosa", bad, "x"); err == nil {
			t.Fatalf("debería rechazar %q", bad)
		}
	}
	// Romper el YAML y la validación.
	um, err = a.SaveUserModuleFile("mi-cosa", "role/tasks/main.yml", "- name: [sin cerrar\n")
	if err != nil || len(um.Problems) == 0 {
		t.Fatalf("yaml roto: %+v %v", um, err)
	}
	src, _ := a.ReadUserModuleFile("mi-cosa", "module.yaml")
	um, _ = a.SaveUserModuleFile("mi-cosa", "module.yaml", strings.Replace(src, "mi_cosa_mensaje", "otro_nombre", 1))
	if !strings.Contains(strings.Join(um.Problems, " "), "debe empezar por") {
		t.Fatalf("variable sin prefijo: %+v", um.Problems)
	}
	if _, err := a.DeleteUserModuleFile("mi-cosa", "module.yaml"); err == nil {
		t.Fatal("module.yaml es obligatorio")
	}
	// Copia de uno incluido: id y variables renombrados, se carga bien.
	um, err = a.CreateUserModule("navidrome-mio", "navidrome")
	if err != nil || len(um.Problems) != 0 {
		t.Fatalf("copia: %+v %v", um, err)
	}
	m, ok := a.cat().Get("navidrome-mio")
	if !ok || !strings.Contains(m.Name, "mi versión") || m.Variables[0].Name[:13] != "navidrome_mio" {
		t.Fatalf("copia cargada: %+v", m)
	}
	if orig, _ := a.cat().Get("navidrome"); orig == nil || orig.Source != "builtin" {
		t.Fatal("el incluido debe seguir")
	}
	// No se borra si una plantilla lo usa.
	a.SaveRecipe(store.Recipe{Name: "Música", Modules: []store.ProjectModule{{ID: "navidrome-mio", Values: map[string]any{}}}})
	if err := a.DeleteUserModule("navidrome-mio"); err == nil || !strings.Contains(err.Error(), "Música") {
		t.Fatalf("en uso: %v", err)
	}
	if err := a.DeleteUserModule("mi-cosa"); err != nil {
		t.Fatal(err)
	}
	if len(a.ListUserModules()) != 1 {
		t.Fatal("lista")
	}
}
