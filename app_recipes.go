package main

import (
	"encoding/json"
	"errors"
	"sort"
	"strings"

	"draupnode/internal/store"
)

// Recetas y despliegues: un proyecto («receta») dice qué módulos y con qué
// opciones; lo que hay en un servidor es su despliegue (store.Project con
// RecipeID), que puede tener valores propios (dominio, destino de copias…).

// Deployment resume un despliegue de una receta.
type Deployment struct {
	ProjectID  string `json:"projectId"`
	ServerID   string `json:"serverId"`
	ServerName string `json:"serverName"`
	Applied    bool   `json:"applied"`
	Pending    bool   `json:"pending"`    // cambiado desde la última vez que se aplicó
	SameRecipe bool   `json:"sameRecipe"` // sin diferencias con la receta
}

// RecipeView es una receta con dónde está desplegada.
type RecipeView struct {
	store.Recipe
	Deployments []Deployment `json:"deployments"`
}

// ListRecipes devuelve las recetas con sus despliegues.
func (a *App) ListRecipes() []RecipeView {
	servers := map[string]string{}
	for _, s := range a.store.Servers() {
		servers[s.ID] = s.Name
	}
	byRecipe := map[string][]Deployment{}
	for _, p := range a.store.Projects() {
		if p.RecipeID == "" {
			continue
		}
		byRecipe[p.RecipeID] = append(byRecipe[p.RecipeID], Deployment{
			ProjectID: p.ID, ServerID: p.ServerID, ServerName: servers[p.ServerID],
			Applied: p.AppliedAt != nil, Pending: p.AppliedAt == nil || p.UpdatedAt.After(*p.AppliedAt),
			SameRecipe: p.Overrides.Empty(),
		})
	}
	out := []RecipeView{}
	for _, r := range a.store.Recipes() {
		d := byRecipe[r.ID]
		if d == nil {
			d = []Deployment{}
		}
		sort.Slice(d, func(i, j int) bool { return d[i].ServerName < d[j].ServerName })
		out = append(out, RecipeView{Recipe: r, Deployments: d})
	}
	return out
}

// CheckRecipe valida una receta (sin servidor).
func (a *App) CheckRecipe(r store.Recipe) ProjectCheck {
	res, _ := a.resolveModules(store.Project{Name: r.Name, Modules: r.Modules}, true)
	return res
}

// SaveRecipe guarda una receta y lleva sus cambios a sus despliegues (cada
// uno conserva lo que tiene distinto). Los despliegues quedan con «cambios
// sin aplicar» si algo les cambia.
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
			r.Modules = append(r.Modules, store.ProjectModule{ID: s.Module.ID, Values: s.Values})
		}
	}
	saved, err := a.store.SaveRecipe(r)
	if err != nil {
		return saved, err
	}
	var errs []string
	for _, p := range a.store.Projects() {
		if p.RecipeID != saved.ID {
			continue
		}
		p.Modules = applyOverrides(saved.Modules, p.Overrides)
		if _, err := a.SaveProject(p); err != nil {
			errs = append(errs, p.Name+": "+err.Error())
		}
	}
	if len(errs) > 0 {
		return saved, errors.New("la plantilla se guardó, pero algún servidor necesita que lo revises: " + strings.Join(errs, "; "))
	}
	return saved, nil
}

// DeleteRecipe borra una receta que no está en ningún servidor.
func (a *App) DeleteRecipe(id string) error { return a.store.DeleteRecipe(id) }

// DeployRecipe asocia una receta a un servidor: crea su despliegue (no aplica nada).
func (a *App) DeployRecipe(recipeID, serverID string) (store.Project, error) {
	r, err := a.store.Recipe(recipeID)
	if err != nil {
		return store.Project{}, err
	}
	if _, err := a.store.Server(serverID); err != nil {
		return store.Project{}, err
	}
	for _, p := range a.store.Projects() {
		if p.RecipeID == recipeID && p.ServerID == serverID {
			return store.Project{}, errors.New("este servidor ya tiene esa plantilla")
		}
	}
	p, err := a.SaveProject(store.Project{Name: r.Name, ServerID: serverID, RecipeID: r.ID})
	if err != nil {
		return p, err
	}
	p.Modules = applyOverrides(r.Modules, nil)
	if len(p.Modules) == 0 {
		return p, nil
	}
	return a.SaveProject(p)
}

// RecipeDiff explica en qué se diferencia un despliegue de su receta.
type RecipeDiff struct {
	RecipeID   string              `json:"recipeId"`
	RecipeName string              `json:"recipeName"`
	Added      []string            `json:"added"`
	Removed    []string            `json:"removed"`
	Changed    map[string][]string `json:"changed"` // módulo → variables
}

func (a *App) ProjectRecipeDiff(projectID string) (RecipeDiff, error) {
	p, err := a.store.Project(projectID)
	if err != nil {
		return RecipeDiff{}, err
	}
	r, err := a.store.Recipe(p.RecipeID)
	if err != nil {
		return RecipeDiff{}, err
	}
	o := diffModules(p.Modules, r.Modules)
	d := RecipeDiff{RecipeID: r.ID, RecipeName: r.Name, Added: o.Added, Removed: o.Removed, Changed: map[string][]string{}}
	if d.Added == nil {
		d.Added = []string{}
	}
	if d.Removed == nil {
		d.Removed = []string{}
	}
	for m, vals := range o.Values {
		if contains(d.Added, m) {
			continue
		}
		for k := range vals {
			d.Changed[m] = append(d.Changed[m], k)
		}
		sort.Strings(d.Changed[m])
	}
	return d, nil
}

// PushToRecipe lleva lo de este despliegue a su receta (y desde ahí a los
// demás servidores que la usan, que conservan lo suyo).
func (a *App) PushToRecipe(projectID string) (store.Recipe, error) {
	p, err := a.store.Project(projectID)
	if err != nil {
		return store.Recipe{}, err
	}
	r, err := a.store.Recipe(p.RecipeID)
	if err != nil {
		return store.Recipe{}, err
	}
	r.Modules = cloneModules(p.Modules)
	return a.SaveRecipe(r)
}

// ResetToRecipe deja el despliegue igual que su receta.
func (a *App) ResetToRecipe(projectID string) (store.Project, error) {
	p, err := a.store.Project(projectID)
	if err != nil {
		return p, err
	}
	r, err := a.store.Recipe(p.RecipeID)
	if err != nil {
		return p, err
	}
	p.Modules = applyOverrides(r.Modules, nil)
	return a.SaveProject(p)
}

// ---------------------------------------------------------------- diferencias

func valueKey(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func cloneModules(m []store.ProjectModule) []store.ProjectModule {
	b, _ := json.Marshal(m)
	var out []store.ProjectModule
	_ = json.Unmarshal(b, &out)
	if out == nil {
		out = []store.ProjectModule{}
	}
	return out
}

// diffModules: lo que tiene dep distinto de rec.
func diffModules(dep, rec []store.ProjectModule) *store.Overrides {
	o := &store.Overrides{Values: map[string]map[string]any{}}
	rm := map[string]map[string]any{}
	for _, m := range rec {
		rm[m.ID] = m.Values
	}
	dm := map[string]bool{}
	for _, m := range dep {
		dm[m.ID] = true
		rv, ok := rm[m.ID]
		if !ok {
			o.Added = append(o.Added, m.ID)
			o.Values[m.ID] = m.Values
			continue
		}
		for k, v := range m.Values {
			if rvv, ok := rv[k]; !ok || valueKey(rvv) != valueKey(v) {
				if o.Values[m.ID] == nil {
					o.Values[m.ID] = map[string]any{}
				}
				o.Values[m.ID][k] = v
			}
		}
	}
	for _, m := range rec {
		if !dm[m.ID] {
			o.Removed = append(o.Removed, m.ID)
		}
	}
	if len(o.Values) == 0 {
		o.Values = nil
	}
	if o.Empty() {
		return nil
	}
	return o
}

// applyOverrides: la receta con lo propio del despliegue encima.
func applyOverrides(rec []store.ProjectModule, o *store.Overrides) []store.ProjectModule {
	out := []store.ProjectModule{}
	for _, m := range cloneModules(rec) {
		if o != nil && contains(o.Removed, m.ID) {
			continue
		}
		if m.Values == nil {
			m.Values = map[string]any{}
		}
		if o != nil {
			for k, v := range o.Values[m.ID] {
				m.Values[k] = v
			}
		}
		out = append(out, m)
	}
	if o != nil {
		for _, id := range o.Added {
			vals := map[string]any{}
			for k, v := range o.Values[id] {
				vals[k] = v
			}
			out = append(out, store.ProjectModule{ID: id, Values: vals})
		}
	}
	return out
}
