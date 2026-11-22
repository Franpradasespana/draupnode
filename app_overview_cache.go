package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

// Última lectura de la ficha de cada servidor, guardada en este equipo
// (fichas/<servidor>.json): el Panel la enseña al momento, sin conectar ni
// pedir contraseñas, con «leído hace…».

// CachedOverview es la última ficha leída de un servidor.
type CachedOverview struct {
	At       time.Time      `json:"at"`
	Overview map[string]any `json:"overview"`
}

var cacheIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func (a *App) overviewPath(serverID string) string {
	if !cacheIDRe.MatchString(serverID) {
		return ""
	}
	return filepath.Join(a.store.Dir(), "fichas", serverID+".json")
}

func (a *App) saveOverview(serverID string, ov map[string]any) {
	p := a.overviewPath(serverID)
	if p == "" {
		return
	}
	b, err := json.Marshal(CachedOverview{At: time.Now(), Overview: ov})
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(p), 0o700)
	tmp := p + ".tmp"
	if os.WriteFile(tmp, b, 0o600) == nil {
		_ = os.Rename(tmp, p)
	}
}

func (a *App) forgetOverview(serverID string) {
	if p := a.overviewPath(serverID); p != "" {
		_ = os.Remove(p)
	}
}

// LastOverviews: la última ficha guardada de cada servidor (los que no se han
// leído nunca no salen).
func (a *App) LastOverviews() map[string]CachedOverview {
	out := map[string]CachedOverview{}
	for _, s := range a.store.Servers() {
		p := a.overviewPath(s.ID)
		if p == "" {
			continue
		}
		b, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		var c CachedOverview
		if json.Unmarshal(b, &c) == nil && c.Overview != nil {
			out[s.ID] = c
		}
	}
	return out
}
