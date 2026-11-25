package modules

import (
	"io/fs"
	"path"
	"testing"

	"draupnode/internal/i18n"

	"gopkg.in/yaml.v3"
)

// TestTraduccionModulos: cada módulo incluido tiene su module.en.yaml y
// traduce todos los textos que tiene en español.
func TestTraduccionModulos(t *testing.T) {
	ents, err := fs.ReadDir(builtinFS, "builtin")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range ents {
		dir := path.Join("builtin", e.Name())
		raw, err := fs.ReadFile(builtinFS, path.Join(dir, "module.en.yaml"))
		if err != nil {
			t.Errorf("%s: falta module.en.yaml (python3 herramientas/i18n/modulos_en.py)", e.Name())
			continue
		}
		var tr Translation
		if err := yaml.Unmarshal(raw, &tr); err != nil {
			t.Errorf("%s: module.en.yaml: %v", e.Name(), err)
			continue
		}
		var m Module
		src, _ := fs.ReadFile(builtinFS, path.Join(dir, "module.yaml"))
		if err := yaml.Unmarshal(src, &m); err != nil {
			t.Fatal(err)
		}
		need := func(what, es, en string) {
			if es != "" && en == "" {
				t.Errorf("%s: sin traducir: %s", e.Name(), what)
			}
		}
		need("name", m.Name, tr.Name)
		need("category", m.Category, tr.Category)
		need("description", m.Description, tr.Description)
		need("details", m.Details, tr.Details)
		need("uninstall_warning", m.UninstallWarning, tr.UninstallWarning)
		need("uninstall_data", m.UninstallData, tr.UninstallData)
		need("no_uninstall", m.NoUninstall, tr.NoUninstall)
		for _, v := range m.Variables {
			tv := tr.Variables[v.Name]
			need(v.Name+".label", v.Label, tv.Label)
			need(v.Name+".help", v.Help, tv.Help)
			need(v.Name+".pattern_help", v.PatternHelp, tv.PatternHelp)
			need(v.Name+".placeholder", v.Placeholder, tv.Placeholder)
		}
		if len(tr.Links) != len(m.Links) || len(tr.Secrets) != len(m.Secrets) {
			t.Errorf("%s: links o secrets no tienen los mismos elementos que en module.yaml", e.Name())
		}
		if m.Prueba != nil {
			if tr.Prueba == nil || len(tr.Prueba.Pasos) != len(m.Prueba.Pasos) || len(tr.Prueba.Comprobar) != len(m.Prueba.Comprobar) ||
				len(tr.Prueba.Necesita) != len(m.Prueba.Necesita) || len(tr.Prueba.Problemas) != len(m.Prueba.Problemas) {
				t.Errorf("%s: prueba sin traducir o con otro número de líneas", e.Name())
			}
		}
	}
}

// TestCatalogoEnIngles: el catálogo carga en inglés sin errores y cambia
// los textos, pero no los ids ni las variables.
func TestCatalogoEnIngles(t *testing.T) {
	defer i18n.Set(i18n.ES)
	i18n.Set(i18n.ES)
	es, err := Load(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	i18n.Set(i18n.EN)
	en, err := Load(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(en.All()) != len(es.All()) || len(en.Errors) > 0 {
		t.Fatalf("en inglés: %d módulos (%d en español), errores %v", len(en.All()), len(es.All()), en.Errors)
	}
	b, _ := es.Get("base")
	c, _ := en.Get("base")
	if b.Name == c.Name || c.ID != "base" || len(c.Variables) != len(b.Variables) || c.Variables[0].Name != b.Variables[0].Name {
		t.Fatalf("base: %q / %q", b.Name, c.Name)
	}
}
