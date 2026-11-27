package app

import (
	"testing"

	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

// Cada plantilla de serie tiene que pasar la validación del catálogo: si un
// módulo cambia y la rompe, salta aquí y no en la app del usuario.
func TestPlantillasDeSerieValidas(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	ids := map[string]bool{}
	for _, tpl := range builtinTemplates() {
		if ids[tpl.ID] {
			t.Fatalf("id repetido %q", tpl.ID)
		}
		ids[tpl.ID] = true
		r, err := a.builtinRecipe(tpl)
		if err != nil {
			t.Fatalf("%s: %v", tpl.ID, err)
		}
		got := map[string]bool{}
		for _, m := range r.Modules {
			got[m.ID] = true
		}
		for _, m := range tpl.Modules {
			if !got[m] {
				t.Fatalf("%s: falta %s", tpl.ID, m)
			}
		}
	}
}

func TestPlantillasDeSerieCicloDeVida(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	n := len(builtinTemplates())
	a.ensureBuiltinTemplates()
	a.ensureBuiltinTemplates() // no duplica
	if got := len(a.store.Recipes()); got != n {
		t.Fatalf("plantillas: %d, quería %d", got, n)
	}
	var coolify, webs store.Recipe
	for _, r := range a.store.Recipes() {
		switch r.Builtin {
		case "coolify":
			coolify = r
		case "webs-https":
			webs = r
		}
	}
	for _, m := range coolify.Modules {
		if m.ID == "postgres" && m.Values["postgres_network"] != "coolify" {
			t.Fatalf("coolify: postgres en %v", m.Values["postgres_network"])
		}
	}
	// Guardarla desde la interfaz (sin la marca) la conserva.
	webs.Notes = "mías"
	saved, err := a.SaveRecipe(store.Recipe{ID: webs.ID, Name: webs.Name, Notes: webs.Notes, Modules: webs.Modules})
	if err != nil || saved.Builtin != "webs-https" {
		t.Fatalf("%v %+v", err, saved)
	}
	// Tocada por el usuario: no se pisa aunque cambie lo de serie.
	r, _ := a.store.Recipe(webs.ID)
	r.BuiltinHash = "viejo-pero-distinto"
	_, _ = a.store.SaveRecipe(r)
	a.ensureBuiltinTemplates()
	if r, _ = a.store.Recipe(webs.ID); r.Notes != "mías" {
		t.Fatalf("pisó lo del usuario: %q", r.Notes)
	}
	// Sin tocar y con una versión vieja guardada: se actualiza.
	c, _ := a.store.Recipe(coolify.ID)
	c.Notes = "texto viejo de serie"
	c.BuiltinHash = recipeHash(c)
	_, _ = a.store.SaveRecipe(c)
	a.ensureBuiltinTemplates()
	if c, _ = a.store.Recipe(coolify.ID); c.Notes == "texto viejo de serie" {
		t.Fatal("no se actualizó la plantilla sin tocar")
	}
	// Borrada: no vuelve sola; «Recuperar» la trae.
	if err := a.DeleteRecipe(coolify.ID); err != nil {
		t.Fatal(err)
	}
	a.ensureBuiltinTemplates()
	if a.BuiltinMissing() != 1 {
		t.Fatalf("faltan %d", a.BuiltinMissing())
	}
	if got := a.RestoreBuiltinTemplates(); got != 1 || a.BuiltinMissing() != 0 {
		t.Fatalf("recuperadas %d, faltan %d", got, a.BuiltinMissing())
	}
}
