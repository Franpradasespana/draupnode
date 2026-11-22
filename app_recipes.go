package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"draupnode/internal/store"
)

// Plantillas (recetas): un conjunto de módulos con sus opciones, sin
// servidor. Desde la 0.50 los módulos son del servidor (su único
// store.Project): aplicar una plantilla solo le añade sus módulos, que
// recuerdan de qué plantilla vinieron (ProjectModule.From). Editar la plantilla
// no cambia los servidores; desde un servidor se pueden llevar módulos a una
// plantilla o crear una nueva con ellos.

// RecipeServer: un servidor en el que se aplicó la plantilla.
type RecipeServer struct {
	ServerID   string `json:"serverId"`
	ServerName string `json:"serverName"`
	ProjectID  string `json:"projectId"`
}

// RecipeView es una plantilla con los servidores en los que se aplicó.
type RecipeView struct {
	store.Recipe
	Servers []RecipeServer `json:"servers"`
}

// ListRecipes devuelve las plantillas con dónde se han aplicado.
func (a *App) ListRecipes() []RecipeView {
	names := map[string]string{}
	for _, s := range a.store.Servers() {
		names[s.ID] = s.Name
	}
	by := map[string][]RecipeServer{}
	for _, p := range a.store.Projects() {
		for _, t := range p.Templates {
			by[t] = append(by[t], RecipeServer{ServerID: p.ServerID, ServerName: names[p.ServerID], ProjectID: p.ID})
		}
	}
	out := []RecipeView{}
	for _, r := range a.store.Recipes() {
		l := by[r.ID]
		if l == nil {
			l = []RecipeServer{}
		}
		sort.Slice(l, func(i, j int) bool { return l[i].ServerName < l[j].ServerName })
		out = append(out, RecipeView{Recipe: r, Servers: l})
	}
	return out
}

// CheckRecipe valida una plantilla (sin servidor).
func (a *App) CheckRecipe(r store.Recipe) ProjectCheck {
	res, _ := a.resolveModules(store.Project{Name: r.Name, Modules: r.Modules}, true)
	return res
}

// SaveRecipe guarda una plantilla (no toca los servidores en los que se aplicó).
func (a *App) SaveRecipe(r store.Recipe) (store.Recipe, error) {
	if len(r.Modules) > 0 {
		chk, sel := a.resolveModules(store.Project{Name: r.Name, Modules: r.Modules}, true)
		if len(chk.General) > 0 {
			return store.Recipe{}, errors.New(strings.Join(chk.General, "; "))
		}
		if len(chk.Errors) > 0 {
			return store.Recipe{}, errors.New("revisa los campos marcados en rojo")
		}
		r.Modules = make([]store.ProjectModule, 0, len(sel))
		for _, s := range sel {
			r.Modules = append(r.Modules, store.ProjectModule{ID: s.Key(), Values: s.Values})
		}
	}
	return a.store.SaveRecipe(r)
}

// DeleteRecipe borra una plantilla. Los servidores en los que se aplicó
// conservan sus módulos.
func (a *App) DeleteRecipe(id string) error { return a.store.DeleteRecipe(id) }

// ServerModules devuelve los módulos del servidor (los crea vacíos la
// primera vez).
func (a *App) ServerModules(serverID string) (store.Project, error) {
	if p, ok := a.store.ServerProject(serverID); ok {
		return p, nil
	}
	srv, err := a.store.Server(serverID)
	if err != nil {
		return store.Project{}, err
	}
	return a.SaveProject(store.Project{Name: srv.Name, ServerID: serverID})
}

// TemplateResult: el servidor tras aplicar/guardar una plantilla y qué contar.
type TemplateResult struct {
	Project store.Project `json:"project"`
	Recipe  store.Recipe  `json:"recipe"`
	Notes   []string      `json:"notes"`
}

// ApplyTemplate añade al servidor los módulos de una plantilla (no instala
// nada: se instalan al Aplicar). Los que el servidor ya tiene conservan su
// configuración.
func (a *App) ApplyTemplate(serverID, recipeID string) (TemplateResult, error) {
	var res TemplateResult
	r, err := a.store.Recipe(recipeID)
	if err != nil {
		return res, err
	}
	p, err := a.ServerModules(serverID)
	if err != nil {
		return res, err
	}
	if a.projectRunning(p.ID) {
		return res, errors.New("hay una tarea en marcha en este servidor: espera a que termine")
	}
	var added, kept []string
	for _, m := range cloneModules(r.Modules) {
		if projectModule(p, m.ID) != nil {
			kept = append(kept, a.moduleName(m.ID))
			continue
		}
		if m.Values == nil {
			m.Values = map[string]any{}
		}
		m.From = r.ID
		p.Modules = append(p.Modules, m)
		added = append(added, a.moduleName(m.ID))
	}
	if !contains(p.Templates, r.ID) {
		p.Templates = append(p.Templates, r.ID)
	}
	if p, err = a.SaveProject(p); err != nil {
		return res, err
	}
	if len(added) > 0 {
		res.Notes = append(res.Notes, "Añadidos: "+strings.Join(added, ", ")+". Se instalan al pulsar Aplicar.")
	} else {
		res.Notes = append(res.Notes, "El servidor ya tenía todos sus módulos: no se ha añadido ninguno.")
	}
	if len(kept) > 0 {
		res.Notes = append(res.Notes, "Ya estaban (se mantiene su configuración): "+strings.Join(kept, ", ")+".")
	}
	res.Project, res.Recipe = p, r
	return res, nil
}

// ModulesToTemplate guarda módulos del servidor (con sus opciones) en una
// plantilla: en una existente (recipeID; los sustituye si ya los tenía) o en
// una nueva (newName). Esos módulos pasan a «venir» de ella. No cambia nada
// en el servidor.
func (a *App) ModulesToTemplate(serverID string, moduleIDs []string, recipeID, newName string) (TemplateResult, error) {
	var res TemplateResult
	p, ok := a.store.ServerProject(serverID)
	if !ok {
		return res, errors.New("este servidor no tiene módulos")
	}
	if len(moduleIDs) == 0 {
		return res, errors.New("elige al menos un módulo")
	}
	var r store.Recipe
	if recipeID != "" {
		var err error
		if r, err = a.store.Recipe(recipeID); err != nil {
			return res, err
		}
	} else {
		newName = strings.TrimSpace(newName)
		if newName == "" {
			return res, errors.New("ponle un nombre a la plantilla nueva")
		}
		for _, x := range a.store.Recipes() {
			if strings.EqualFold(x.Name, newName) {
				return res, fmt.Errorf("ya hay una plantilla «%s»: elígela en «añadir a una existente»", x.Name)
			}
		}
		r = store.Recipe{Name: newName}
	}
	chosen := map[string]bool{}
	for _, id := range moduleIDs {
		chosen[id] = true
	}
	mods := []store.ProjectModule{}
	for _, m := range r.Modules {
		if !chosen[m.ID] {
			mods = append(mods, m)
		}
	}
	for _, m := range cloneModules(p.Modules) {
		if chosen[m.ID] {
			mods = append(mods, store.ProjectModule{ID: m.ID, Values: m.Values})
		}
	}
	r.Modules = mods
	saved, err := a.SaveRecipe(r)
	if err != nil {
		return res, err
	}
	for i := range p.Modules {
		if chosen[p.Modules[i].ID] {
			p.Modules[i].From = saved.ID
		}
	}
	if !contains(p.Templates, saved.ID) {
		p.Templates = append(p.Templates, saved.ID)
	}
	if p, err = a.store.SaveProject(p); err != nil {
		return res, err
	}
	res.Project, res.Recipe = p, saved
	if recipeID == "" {
		res.Notes = []string{fmt.Sprintf("Plantilla «%s» creada con %d módulo(s).", saved.Name, len(moduleIDs))}
	} else {
		res.Notes = []string{fmt.Sprintf("Plantilla «%s» actualizada. Los demás servidores en los que se aplicó no cambian.", saved.Name)}
	}
	return res, nil
}

// ForgetTemplate quita una plantilla de la lista de aplicadas del servidor
// (sus módulos se quedan; solo se olvida de dónde venían).
func (a *App) ForgetTemplate(serverID, recipeID string) (store.Project, error) {
	p, ok := a.store.ServerProject(serverID)
	if !ok {
		return p, errors.New("este servidor no tiene módulos")
	}
	var keep []string
	for _, t := range p.Templates {
		if t != recipeID {
			keep = append(keep, t)
		}
	}
	p.Templates = keep
	for i := range p.Modules {
		if p.Modules[i].From == recipeID {
			p.Modules[i].From = ""
		}
	}
	return a.store.SaveProject(p)
}

// ---------------------------------------------------------------- diferencias

func cloneModules(m []store.ProjectModule) []store.ProjectModule {
	b, _ := json.Marshal(m)
	var out []store.ProjectModule
	_ = json.Unmarshal(b, &out)
	if out == nil {
		out = []store.ProjectModule{}
	}
	return out
}
