package main

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"draupnode/internal/bundle"
	"draupnode/internal/modules"
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
	return a.checkUninstallOf(p, mods)
}

func (a *App) checkUninstallOf(p store.Project, mods []string) UninstallCheck {
	res := UninstallCheck{Modules: []UninstallInfo{}, Selected: []string{}}
	if srv, err := a.store.Server(p.ServerID); err == nil {
		res.Server = fmt.Sprintf("%s (%s@%s)", srv.Name, srv.User, srv.Host)
	}
	sel, err := a.uninstallSelection(p, mods)
	for _, s := range sel {
		res.Modules = append(res.Modules, UninstallInfo{ID: s.Key(), Name: a.moduleName(s.Key()), Warning: s.Module.UninstallWarning, Data: s.Module.UninstallData})
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
		_, inst := modules.SplitID(id)
		sel = append(sel, bundle.Selection{Module: m, Values: v, ID: id, Instance: inst})
		switch {
		case !contains(p.InstalledModules, id):
			problems = append(problems, fmt.Sprintf("%s no está instalado con esta plantilla en este servidor: no hay nada que desinstalar", m.Name))
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
		return RunStart{Status: "busy", Message: "ya hay una tarea en marcha con esta plantilla en este servidor"}
	}
	sel, err := a.uninstallSelection(p, mods)
	if err != nil {
		return RunStart{Status: "error", Message: err.Error()}
	}
	srv, err := a.store.Server(p.ServerID)
	if err != nil {
		return RunStart{Status: "error", Message: err.Error()}
	}
	ids0 := make([]string, len(sel))
	for i, s := range sel {
		ids0[i] = s.Key()
	}
	marker := a.markerAfterUninstall(p, ids0)
	script, err := bundle.Script(bundle.Options{
		Project: p.Name, Slug: slugOf(p), Host: srv.Host, SSHUser: srv.User, CoolifyURL: coolifyURLFor(srv),
		AppVersion: Version, Now: time.Now(), SSHAuth: srv.AuthMethod, Uninstall: true, Purge: purge,
		Marker: marker, MarkerDelete: marker == nil,
	}, sel)
	if err != nil {
		return RunStart{Status: "error", Message: err.Error()}
	}
	ids := make([]string, len(sel))
	for i, s := range sel {
		ids[i] = s.Key()
	}
	return a.launch(p, srv, script, runMode{uninstall: ids}, secret, accept, sudoPassword)
}

// UninstallAllPlan: lo que haría «Desinstalar todo» en el servidor de un
// proyecto (sus módulos).
type UninstallAllPlan struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
	// Remove: los instalados que se desinstalan (en el orden del catálogo).
	Remove []string `json:"remove"`
	// Keep: los instalados que se quedan, con el motivo en Warning.
	Keep []UninstallInfo `json:"keep"`
	// Unmark: marcados pero nunca instalados; solo se quitan de la lista.
	Unmark []string `json:"unmark"`
	// Check: la comprobación de la desinstalación (con Unmark ya quitados).
	Check UninstallCheck `json:"check"`
}

// PlanUninstallAll prepara «Desinstalar todo»: todos los módulos instalados
// que se pueden desinstalar, menos los que necesita uno que se queda (y el
// SSH, que es la conexión). No toca nada.
func (a *App) PlanUninstallAll(projectID string) UninstallAllPlan {
	res := UninstallAllPlan{Remove: []string{}, Keep: []UninstallInfo{}, Unmark: []string{}}
	p, err := a.store.Project(projectID)
	if err != nil {
		res.Error = err.Error()
		return res
	}
	c := a.cat()
	reason := map[string]string{}
	cand := map[string]bool{}
	for _, id := range p.InstalledModules {
		m, ok := c.Get(id)
		switch {
		case !ok:
			reason[id] = "ya no está en el catálogo"
		case m.NoUninstall != "":
			reason[id] = m.NoUninstall
		case !m.Uninstallable:
			reason[id] = "todavía no tiene desinstalación"
		case id == sshModule:
			vals := p.InstalledValues[id]
			v, _ := m.Values(vals)
			if port, _ := v["ssh_port"].(int); port != 22 {
				reason[id] = fmt.Sprintf("tiene el SSH en el puerto %d; al quitarlo volvería al 22 y se perdería la conexión", port)
				continue
			}
			cand[id] = true
		default:
			cand[id] = true
		}
	}
	// Lo que necesita un módulo que se queda, se queda también (hasta que no cambie nada).
	for changed := true; changed; {
		changed = false
		for _, id := range p.InstalledModules {
			if cand[id] {
				continue
			}
			om, ok := c.Get(id)
			if !ok {
				continue
			}
			for _, d := range om.Depends {
				if cand[d] {
					delete(cand, d)
					reason[d] = "lo necesita " + om.Name + ", que se queda"
					changed = true
				}
			}
		}
	}
	for _, pm := range p.Modules {
		if !contains(p.InstalledModules, pm.ID) {
			res.Unmark = append(res.Unmark, pm.ID)
		}
	}
	var ids []string
	for id := range cand {
		ids = append(ids, id)
	}
	if len(ids) > 0 {
		order, _, err := c.Resolve(ids)
		if err != nil {
			res.Error = err.Error()
			return res
		}
		for _, id := range order {
			if cand[id] {
				res.Remove = append(res.Remove, id)
			}
		}
	}
	for _, id := range p.InstalledModules {
		if r, ok := reason[id]; ok {
			res.Keep = append(res.Keep, UninstallInfo{ID: id, Name: a.moduleName(id), Warning: r})
		}
	}
	res.Check = a.checkUninstallOf(withoutModules(p, res.Unmark), res.Remove)
	res.OK = true
	return res
}

func withoutModules(p store.Project, ids []string) store.Project {
	var mods []store.ProjectModule
	for _, m := range p.Modules {
		if !contains(ids, m.ID) {
			mods = append(mods, m)
		}
	}
	p.Modules = mods
	return p
}

// UninstallAll ejecuta «Desinstalar todo» (lo que dice PlanUninstallAll):
// quita de la lista los módulos que nunca se instalaron y desinstala el resto.
func (a *App) UninstallAll(projectID string, purge bool, secret, accept, sudoPassword string) RunStart {
	plan := a.PlanUninstallAll(projectID)
	if !plan.OK {
		return RunStart{Status: "error", Message: plan.Error}
	}
	if len(plan.Remove) == 0 {
		return RunStart{Status: "error", Message: "no hay nada instalado que se pueda desinstalar"}
	}
	if !plan.Check.OK {
		return RunStart{Status: "error", Message: plan.Check.Error}
	}
	if a.projectRunning(projectID) {
		return RunStart{Status: "busy", Message: "ya hay una tarea en marcha con esta plantilla en este servidor"}
	}
	if len(plan.Unmark) > 0 {
		p, err := a.store.Project(projectID)
		if err != nil {
			return RunStart{Status: "error", Message: err.Error()}
		}
		if _, err := a.store.SaveProject(withoutModules(p, plan.Unmark)); err != nil {
			return RunStart{Status: "error", Message: err.Error()}
		}
	}
	return a.UninstallModules(projectID, plan.Remove, purge, secret, accept, sudoPassword)
}
