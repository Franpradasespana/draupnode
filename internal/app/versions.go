package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"draupnode/internal/i18n"
	"draupnode/internal/modules"
	"draupnode/internal/store"
)

// Historial de la configuración: cada vez que cambian los módulos de un
// servidor o de una plantilla se guarda la versión anterior con un resumen de
// lo que cambió, para verlo y poder volver a ella.

// MaxConfigVersions: cuántas versiones se guardan de cada servidor o plantilla.
const MaxConfigVersions = 100

// ConfigVersion es una versión guardada de la configuración (la que quedó
// después del cambio).
type ConfigVersion struct {
	ID      string                `json:"id"`
	At      time.Time             `json:"at"`
	Reason  string                `json:"reason,omitempty"`
	Changes []string              `json:"changes"`
	Modules []store.ProjectModule `json:"modules"`
}

func (a *App) versionsPath(kind, id string) string {
	if (kind != "p" && kind != "r") || !cacheIDRe.MatchString(id) {
		return ""
	}
	return filepath.Join(a.store.Dir(), "versiones", kind+"-"+id+".json")
}

// deleteVersions borra el historial de un servidor o plantilla que ya no existe.
func (a *App) deleteVersions(kind, id string) {
	if p := a.versionsPath(kind, id); p != "" {
		_ = os.Remove(p)
	}
}

func (a *App) loadVersions(kind, id string) []ConfigVersion {
	var v []ConfigVersion
	if p := a.versionsPath(kind, id); p != "" {
		if b, err := os.ReadFile(p); err == nil {
			_ = json.Unmarshal(b, &v)
		}
	}
	return v
}

// ConfigHistory: las versiones de la configuración de un servidor (kind «p»,
// id del proyecto) o de una plantilla («r»), la más nueva primero.
func (a *App) ConfigHistory(kind, id string) []ConfigVersion {
	v := a.loadVersions(kind, id)
	sort.SliceStable(v, func(i, j int) bool { return v[i].At.After(v[j].At) })
	if v == nil {
		v = []ConfigVersion{}
	}
	return v
}

// recordVersion apunta un cambio si los módulos han cambiado de verdad.
func (a *App) recordVersion(kind, id, reason string, before, after []store.ProjectModule) {
	p := a.versionsPath(kind, id)
	if p == "" || sameModules(before, after) {
		return
	}
	v := a.loadVersions(kind, id)
	if len(v) == 0 && len(before) > 0 {
		// La primera vez, también cómo estaba antes (para poder volver).
		v = append(v, ConfigVersion{ID: newRunID(), At: time.Now().Add(-time.Second), Reason: i18n.T("Cómo estaba antes de empezar el historial"), Changes: []string{}, Modules: before})
	}
	v = append(v, ConfigVersion{ID: newRunID(), At: time.Now(), Reason: reason, Changes: a.describeChanges(before, after), Modules: after})
	if len(v) > MaxConfigVersions {
		v = v[len(v)-MaxConfigVersions:]
	}
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(p), 0o700)
	if os.WriteFile(p+".tmp", b, 0o600) == nil {
		_ = os.Rename(p+".tmp", p)
	}
}

func sameModules(a, b []store.ProjectModule) bool {
	norm := func(ms []store.ProjectModule) string {
		type m struct {
			ID     string
			Values map[string]any
		}
		out := make([]m, 0, len(ms))
		for _, x := range ms {
			out = append(out, m{x.ID, x.Values})
		}
		sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
		j, _ := json.Marshal(out)
		return string(j)
	}
	return norm(a) == norm(b)
}

// describeChanges: lo cambiado, en frases cortas («Vaultwarden · Dominio: (vacío) → vw.ejemplo.com»).
func (a *App) describeChanges(before, after []store.ProjectModule) []string {
	old := map[string]store.ProjectModule{}
	for _, m := range before {
		old[m.ID] = m
	}
	now := map[string]bool{}
	var out []string
	for _, m := range after {
		now[m.ID] = true
		o, had := old[m.ID]
		if !had {
			out = append(out, i18n.Sprintf("Añadido «%s»", a.moduleName(m.ID)))
			continue
		}
		mod, _ := a.cat().Get(m.ID)
		keys := map[string]bool{}
		for k := range m.Values {
			keys[k] = true
		}
		for k := range o.Values {
			keys[k] = true
		}
		names := make([]string, 0, len(keys))
		for k := range keys {
			names = append(names, k)
		}
		sort.Strings(names)
		for _, k := range names {
			ov, nv := o.Values[k], m.Values[k]
			if jsonEq(ov, nv) {
				continue
			}
			label, secret := k, false
			if mod != nil {
				for _, v := range mod.Variables {
					if v.Name == k {
						label, secret = v.Label, v.Type == modules.TypeSecret
					}
				}
			}
			if secret {
				out = append(out, i18n.Sprintf("%s · %s: cambiada", a.moduleName(m.ID), label))
				continue
			}
			out = append(out, fmt.Sprintf("%s · %s: %s → %s", a.moduleName(m.ID), label, showValue(ov), showValue(nv)))
		}
	}
	for _, m := range before {
		if !now[m.ID] {
			out = append(out, i18n.Sprintf("Quitado «%s»", a.moduleName(m.ID)))
		}
	}
	if out == nil {
		out = []string{}
	}
	return out
}

func jsonEq(x, y any) bool {
	a, _ := json.Marshal(x)
	b, _ := json.Marshal(y)
	return string(a) == string(b)
}

func showValue(v any) string {
	var s string
	switch x := v.(type) {
	case nil:
		return i18n.T("(vacío)")
	case bool:
		if x {
			return i18n.T("sí")
		}
		return i18n.T("no")
	case string:
		if x == "" {
			return i18n.T("(vacío)")
		}
		s = x
	case []any:
		if len(x) == 0 {
			return i18n.T("(vacío)")
		}
		parts := make([]string, len(x))
		for i, e := range x {
			parts[i] = fmt.Sprint(e)
		}
		s = strings.Join(parts, ", ")
	case []string:
		if len(x) == 0 {
			return i18n.T("(vacío)")
		}
		s = strings.Join(x, ", ")
	case float64:
		s = strings.TrimSuffix(strings.TrimSuffix(fmt.Sprintf("%f", x), "000000"), ".")
	default:
		b, _ := json.Marshal(x)
		s = string(b)
	}
	if r := []rune(s); len(r) > 60 {
		s = string(r[:59]) + "…"
	}
	return s
}

// saveProjectV guarda los módulos de un servidor y apunta el cambio.
func (a *App) saveProjectV(p store.Project, reason string) (store.Project, error) {
	var before []store.ProjectModule
	if p.ID != "" {
		if old, err := a.store.Project(p.ID); err == nil {
			before = cloneModules(old.Modules) // copia: los mapas pueden ser los mismos que se van a guardar
		}
	}
	saved, err := a.store.SaveProject(p)
	if err == nil {
		a.recordVersion("p", saved.ID, reason, before, saved.Modules)
	}
	return saved, err
}

// saveRecipeV guarda una plantilla y apunta el cambio.
func (a *App) saveRecipeV(r store.Recipe, reason string) (store.Recipe, error) {
	var before []store.ProjectModule
	if r.ID != "" {
		if old, err := a.store.Recipe(r.ID); err == nil {
			before = cloneModules(old.Modules)
			if r.Builtin == "" { // la interfaz no la manda: se conserva la marca «de serie»
				r.Builtin, r.BuiltinHash = old.Builtin, old.BuiltinHash
			}
		}
	}
	saved, err := a.store.SaveRecipe(r)
	if err == nil {
		a.recordVersion("r", saved.ID, reason, before, saved.Modules)
	}
	return saved, err
}

// RestoreConfigVersion vuelve a dejar los módulos de un servidor («p») o de
// una plantilla («r») como estaban en una versión guardada. Solo cambia la
// configuración: en el servidor no se toca nada hasta Aplicar. La vuelta
// atrás también queda en el historial, así que se puede deshacer.
func (a *App) RestoreConfigVersion(kind, id, versionID string) error {
	var ver *ConfigVersion
	for _, v := range a.loadVersions(kind, id) {
		if v.ID == versionID {
			v := v
			ver = &v
		}
	}
	if ver == nil {
		return i18n.New("esa versión ya no está en el historial")
	}
	reason := i18n.Sprintf("Vuelta a la versión del %s", ver.At.Local().Format("02/01/2006 15:04"))
	switch kind {
	case "p":
		p, err := a.store.Project(id)
		if err != nil {
			return err
		}
		p.Modules = cloneModules(ver.Modules)
		_, err = a.saveProjectWith(p, reason)
		return err
	case "r":
		r, err := a.store.Recipe(id)
		if err != nil {
			return err
		}
		r.Modules = cloneModules(ver.Modules)
		_, err = a.saveRecipeV(r, reason)
		return err
	}
	return i18n.New("versión desconocida")
}
