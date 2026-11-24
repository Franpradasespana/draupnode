package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"draupnode/internal/bundle"
	"draupnode/internal/modules"
	"draupnode/internal/store"
)

// Ficha de la plantilla en el servidor (/etc/draupnode/plantillas/<slug>.json):
// qué módulos y con qué opciones (sin contraseñas) dejó instalados Draupnode.
// Con ella se puede «adoptar» un servidor: recuperar sus plantillas aunque se
// haya perdido la configuración de Draupnode o se gestione desde otro equipo.

type serverMarker struct {
	Draupnode string         `json:"draupnode"`
	At        time.Time      `json:"at"`
	Name      string         `json:"nombre"`
	Template  string         `json:"plantilla"`
	Slug      string         `json:"slug"`
	Modules   []markerModule `json:"modulos"`
}

type markerModule struct {
	ID     string         `json:"id"`
	Values map[string]any `json:"values"`
}

// publicValues quita las variables secretas o que calcula Draupnode.
func publicValues(m *modules.Module, v map[string]any) map[string]any {
	out := map[string]any{}
	for _, vr := range m.Variables {
		if vr.Type == modules.TypeSecret || vr.Managed {
			continue
		}
		if x, ok := v[vr.Name]; ok {
			out[vr.Name] = x
		}
	}
	return out
}

func (a *App) markerJSON(p store.Project, mods []markerModule) []byte {
	var tpls []string
	for _, id := range p.Templates {
		if r, err := a.store.Recipe(id); err == nil {
			tpls = append(tpls, r.Name)
		}
	}
	tpl := strings.Join(tpls, ", ")
	sort.Slice(mods, func(i, j int) bool { return mods[i].ID < mods[j].ID })
	b, _ := json.MarshalIndent(serverMarker{Draupnode: Version, At: time.Now().UTC(), Name: p.Name, Template: tpl, Slug: slugOf(p), Modules: mods}, "", "  ")
	return b
}

// markerForApply: lo que queda instalado si Aplicar termina bien.
func (a *App) markerForApply(p store.Project, sel []bundle.Selection) []byte {
	mods := make([]markerModule, 0, len(sel))
	for _, s := range sel {
		mods = append(mods, markerModule{ID: s.Key(), Values: publicValues(s.Module, s.Values)})
	}
	return a.markerJSON(p, mods)
}

// markerAfterUninstall: lo que queda tras desinstalar (nil = nada: se borra la ficha).
func (a *App) markerAfterUninstall(p store.Project, removed []string) []byte {
	gone := map[string]bool{}
	for _, id := range removed {
		gone[id] = true
	}
	var mods []markerModule
	for _, id := range p.InstalledModules {
		if gone[id] {
			continue
		}
		m, ok := a.cat().Get(id)
		if !ok {
			continue
		}
		mods = append(mods, markerModule{ID: id, Values: publicValues(m, p.InstalledValues[id])})
	}
	if len(mods) == 0 {
		return nil
	}
	return a.markerJSON(p, mods)
}

// RecoverResult: la plantilla recuperada y lo que hay que contar.
type RecoverResult struct {
	Project store.Project `json:"project"`
	Notes   []string      `json:"notes"`
}

// RecoverFromServer crea la plantilla y su despliegue en el servidor a partir
// de la ficha que dejó Draupnode allí (markerJSON), marcando sus módulos como
// ya instalados. No conecta ni cambia nada en el servidor.
func (a *App) RecoverFromServer(serverID, markerJSON string) (RecoverResult, error) {
	var res RecoverResult
	var m serverMarker
	if err := json.Unmarshal([]byte(markerJSON), &m); err != nil {
		return res, errors.New("la ficha del servidor no es válida")
	}
	if m.Slug == "" || bundle.Slug(m.Slug) != m.Slug {
		return res, errors.New("la ficha no tiene un nombre de carpeta válido")
	}
	if _, err := a.store.Server(serverID); err != nil {
		return res, err
	}
	// Desde la 0.50 un servidor tiene un solo conjunto de módulos, con su
	// carpeta en el servidor (slug): solo se recupera si aún no tiene módulos
	// en este Draupnode, o si la ficha es de esa misma carpeta.
	existing, hasMods := a.store.ServerProject(serverID)
	if hasMods && slugOf(existing) != m.Slug && len(existing.Modules) > 0 {
		return res, fmt.Errorf("este servidor ya tiene módulos en Draupnode (carpeta «%s»); esta ficha es de otra («%s»): añade sus módulos a mano", slugOf(existing), m.Slug)
	}
	name := strings.TrimSpace(m.Name)
	if name == "" {
		name = m.Slug
	}
	tplName := strings.TrimSpace(m.Template)
	if tplName == "" {
		tplName = name
	}
	var mods []store.ProjectModule
	installed := map[string]map[string]any{}
	c := a.cat()
	for _, mm := range m.Modules {
		mod, ok := c.Get(mm.ID)
		if !ok {
			res.Notes = append(res.Notes, fmt.Sprintf("El módulo «%s» no está en este Draupnode: no se ha añadido.", mm.ID))
			continue
		}
		v := mm.Values
		if v == nil {
			v = map[string]any{}
		}
		v = publicValues(mod, v)
		mods = append(mods, store.ProjectModule{ID: mm.ID, Values: v})
		installed[mm.ID] = v
	}
	if len(mods) == 0 {
		return res, errors.New("la ficha no tiene ningún módulo que conozca este Draupnode")
	}
	// Plantilla: la que ya exista con ese nombre y esos módulos (y no esté ya en
	// este servidor); si no, una nueva.
	ids := func(ms []store.ProjectModule) string {
		var l []string
		for _, x := range ms {
			l = append(l, x.ID)
		}
		sort.Strings(l)
		return strings.Join(l, ",")
	}
	var rec store.Recipe
	for _, r := range a.store.Recipes() {
		if r.Name != tplName || ids(r.Modules) != ids(mods) {
			continue
		}
		rec = r
		break
	}
	if rec.ID == "" {
		n := tplName
		for _, r := range a.store.Recipes() {
			if r.Name == n {
				n = tplName + " (recuperada)"
			}
		}
		var err error
		if rec, err = a.store.SaveRecipe(store.Recipe{Name: n, Modules: mods}); err != nil {
			return res, err
		}
		res.Notes = append(res.Notes, fmt.Sprintf("Se ha creado la plantilla «%s».", rec.Name))
	}
	for i := range mods {
		mods[i].From = rec.ID
	}
	var p store.Project
	var err error
	if hasMods {
		// Mismo servidor sin módulos (o de la misma carpeta): se le ponen estos.
		existing.Modules, existing.Templates = mods, []string{rec.ID}
		p, err = a.SaveProject(existing)
	} else {
		p, err = a.SaveProject(store.Project{Name: name, ServerID: serverID, Templates: []string{rec.ID}, Modules: mods})
	}
	if err != nil {
		return res, err
	}
	at := m.At
	if at.IsZero() {
		at = time.Now()
	}
	if err := a.store.Adopt(p.ID, m.Slug, installed, at); err != nil {
		return res, err
	}
	res.Project, _ = a.store.Project(p.ID)
	return res, nil
}
