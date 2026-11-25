package modules

import (
	"gopkg.in/yaml.v3"
)

// Translation son los textos de un módulo en otro idioma (module.en.yaml).
// Todo es opcional: lo que falte se queda en español. Las variables van por
// su nombre; los enlaces y los ficheros de secretos, en el mismo orden que en
// module.yaml.
type Translation struct {
	Name             string                    `yaml:"name"`
	Category         string                    `yaml:"category"`
	Description      string                    `yaml:"description"`
	Details          string                    `yaml:"details"`
	UninstallWarning string                    `yaml:"uninstall_warning"`
	UninstallData    string                    `yaml:"uninstall_data"`
	NoUninstall      string                    `yaml:"no_uninstall"`
	Variables        map[string]VarTranslation `yaml:"variables"`
	Links            []string                  `yaml:"links"`
	Secrets          []string                  `yaml:"secrets"`
	Prueba           *Prueba                   `yaml:"prueba"`
}

// VarTranslation son los textos de una variable.
type VarTranslation struct {
	Label       string `yaml:"label"`
	Help        string `yaml:"help"`
	PatternHelp string `yaml:"pattern_help"`
	Placeholder string `yaml:"placeholder"`
}

func set(dst *string, v string) {
	if v != "" {
		*dst = v
	}
}

func (m *Module) applyTranslation(raw []byte) error {
	var t Translation
	if err := yaml.Unmarshal(raw, &t); err != nil {
		return err
	}
	set(&m.Name, t.Name)
	set(&m.Category, t.Category)
	set(&m.Description, t.Description)
	set(&m.Details, t.Details)
	set(&m.UninstallWarning, t.UninstallWarning)
	set(&m.UninstallData, t.UninstallData)
	set(&m.NoUninstall, t.NoUninstall)
	for i := range m.Variables {
		v := &m.Variables[i]
		if tv, ok := t.Variables[v.Name]; ok {
			set(&v.Label, tv.Label)
			set(&v.Help, tv.Help)
			set(&v.PatternHelp, tv.PatternHelp)
			set(&v.Placeholder, tv.Placeholder)
		}
	}
	for i := range m.Links {
		if i < len(t.Links) {
			set(&m.Links[i].Label, t.Links[i])
		}
	}
	for i := range m.Secrets {
		if i < len(t.Secrets) {
			set(&m.Secrets[i].Label, t.Secrets[i])
		}
	}
	if t.Prueba != nil && m.Prueba != nil {
		p := *m.Prueba
		set(&p.Lab, t.Prueba.Lab)
		if len(t.Prueba.Pasos) > 0 {
			p.Pasos = t.Prueba.Pasos
		}
		if len(t.Prueba.Comprobar) > 0 {
			p.Comprobar = t.Prueba.Comprobar
		}
		if len(t.Prueba.Necesita) > 0 {
			p.Necesita = t.Prueba.Necesita
		}
		if len(t.Prueba.Problemas) > 0 {
			p.Problemas = t.Prueba.Problemas
		}
		m.Prueba = &p
	}
	return nil
}
