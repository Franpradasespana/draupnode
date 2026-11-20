package main

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"draupnode/internal/bundle"
	"draupnode/internal/store"
)

// Desinstalar módulos del servidor. Quitar un módulo del proyecto no lo
// desinstala: esto sí (ejecuta tasks/uninstall.yml de cada uno).

// UninstallCheck dice si se pueden desinstalar unos módulos y qué implica.
type UninstallCheck struct {
	OK       bool            `json:"ok"`
	Error    string          `json:"error,omitempty"`
	Modules  []UninstallInfo `json:"modules"`
	HasData  bool            `json:"hasData"` // alguno puede borrar también datos
	Server   string          `json:"server"`
	Selected []string        `json:"selected"` // los que siguen marcados en el proyecto
}

type UninstallInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Warning string `json:"warning,omitempty"`
	Data    string `json:"data,omitempty"`
}

// CheckUninstall revisa una desinstalación antes de pedir confirmación.
func (a *App) CheckUninstall(projectID string, mods []string) UninstallCheck {
	res := UninstallCheck{Modules: []UninstallInfo{}, Selected: []string{}}
	p, err := a.store.Project(projectID)
	if err != nil {
		res.Error = err.Error()
		return res
	}
	if srv, err := a.store.Server(p.ServerID); err == nil {
		res.Server = fmt.Sprintf("%s (%s@%s)", srv.Name, srv.User, srv.Host)
	}
	sel, err := a.uninstallSelection(p, mods)
	for _, s := range sel {
		res.Modules = append(res.Modules, UninstallInfo{ID: s.Module.ID, Name: s.Module.Name, Warning: s.Module.UninstallWarning, Data: s.Module.UninstallData})
		if s.Module.UninstallData != "" {
			res.HasData = true
		}
	}
	for _, pm := range p.Modules {
		if contains(mods, pm.ID) {
			res.Selected = append(res.Selected, pm.ID)
		}
	}
	if err != nil {
		res.Error = err.Error()
		return res
	}
	res.OK = true
	return res
}

// uninstallSelection valida y prepara los módulos a desinstalar, con los
// valores con los que se instalaron.
func (a *App) uninstallSelection(p store.Project, mods []string) ([]bundle.Selection, error) {
	if len(mods) == 0 {
		return nil, errors.New("elige qué desinstalar")
	}
	c := a.cat()
	// Orden por dependencias, solo con los pedidos.
	order, _, err := c.Resolve(mods)
	if err != nil {
		return nil, err
	}
	present := map[string]bool{} // instalados o marcados en el proyecto
	for _, m := range p.InstalledModules {
		present[m] = true
	}
	for _, pm := range p.Modules {
		present[pm.ID] = true
	}
	var sel []bundle.Selection
	var problems []string
	for _, id := range order {
		if !contains(mods, id) {
			continue
		}
		m, _ := c.Get(id)
		vals := p.InstalledValues[id]
		for _, pm := range p.Modules {
			if pm.ID == id && vals == nil {
				vals = pm.Values
			}
		}
		v, _ := m.Values(vals)
		sel = append(sel, bundle.Selection{Module: m, Values: v})
		switch {
		case !contains(p.InstalledModules, id):
			problems = append(problems, fmt.Sprintf("%s no está instalado por este proyecto: no hay nada que desinstalar", m.Name))
		case m.NoUninstall != "":
			problems = append(problems, fmt.Sprintf("%s no se puede desinstalar: %s", m.Name, m.NoUninstall))
		case !m.Uninstallable:
			problems = append(problems, fmt.Sprintf("%s todavía no tiene desinstalación", m.Name))
		}
		// Lo que depende de él tiene que irse también.
		for other := range present {
			if contains(mods, other) {
				continue
			}
			if om, ok := c.Get(other); ok && contains(om.Depends, id) {
				problems = append(problems, fmt.Sprintf("%s lo necesita %s: desinstala (o quita) antes %s", m.Name, om.Name, om.Name))
			}
		}
		if id == sshModule {
			if port, _ := v["ssh_port"].(int); port != 22 {
				problems = append(problems, fmt.Sprintf("SSH seguro tiene el puerto %d: al desinstalarlo el SSH volvería al 22 y Draupnode perdería la conexión. Cambia antes el puerto a 22 y aplica", port))
			}
		}
	}
	if len(problems) > 0 {
		return sel, errors.New(strings.Join(problems, ". ") + ".")
	}
	return sel, nil
}

// UninstallModules desinstala módulos del servidor del proyecto. purge:
// borra también sus datos. Los parámetros secret/accept/sudoPassword
// funcionan igual que en RunProject.
func (a *App) UninstallModules(projectID string, mods []string, purge bool, secret, accept, sudoPassword string) RunStart {
	p, err := a.store.Project(projectID)
	if err != nil {
		return RunStart{Status: "error", Message: err.Error()}
	}
	if a.projectRunning(projectID) {
		return RunStart{Status: "busy", Message: "este proyecto ya se está ejecutando"}
	}
	sel, err := a.uninstallSelection(p, mods)
	if err != nil {
		return RunStart{Status: "error", Message: err.Error()}
	}
	srv, err := a.store.Server(p.ServerID)
	if err != nil {
		return RunStart{Status: "error", Message: err.Error()}
	}
	script, err := bundle.Script(bundle.Options{
		Project: p.Name, Slug: slugOf(p), Host: srv.Host, SSHUser: srv.User, CoolifyURL: coolifyURLFor(srv),
		AppVersion: Version, Now: time.Now(), SSHAuth: srv.AuthMethod, Uninstall: true, Purge: purge,
	}, sel)
	if err != nil {
		return RunStart{Status: "error", Message: err.Error()}
	}
	ids := make([]string, len(sel))
	for i, s := range sel {
		ids[i] = s.Module.ID
	}
	return a.launch(p, srv, script, runMode{uninstall: ids}, secret, accept, sudoPassword)
}
