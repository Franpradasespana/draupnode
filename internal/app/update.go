package app

import (
	"context"
	"draupnode/internal/i18n"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Aviso de versión nueva: al abrir, mira la última versión publicada en
// GitHub (sin enviar ningún dato: una petición anónima a la API pública).
// Se puede desactivar en Ajustes.

const repoSlug = "Franpradasespana/draupnode"

// UpdateInfo: la última versión publicada.
type UpdateInfo struct {
	Current string `json:"current"`
	Latest  string `json:"latest"`
	Newer   bool   `json:"newer"`
	URL     string `json:"url"`
	Notes   string `json:"notes,omitempty"`
	Enabled bool   `json:"enabled"`
}

var releasesURL = "https://api.github.com/repos/" + repoSlug + "/releases/latest"

// CheckUpdate consulta la última versión (si está activado).
func (a *App) CheckUpdate() (UpdateInfo, error) {
	info := UpdateInfo{Current: Version, Enabled: !a.store.Settings().NoUpdateCheck}
	if !info.Enabled {
		return info, nil
	}
	ctx, cancel := context.WithTimeout(a.context(), 8*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, releasesURL, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "draupnode")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return info, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return info, nil // aún no hay versiones publicadas
	}
	if resp.StatusCode != http.StatusOK {
		return info, errors.New(i18n.T("GitHub respondió ") + resp.Status)
	}
	var rel struct {
		Tag  string `json:"tag_name"`
		URL  string `json:"html_url"`
		Body string `json:"body"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(nil, resp.Body, 1<<20)).Decode(&rel); err != nil {
		return info, err
	}
	info.Latest = strings.TrimPrefix(rel.Tag, "v")
	if strings.HasPrefix(rel.URL, "https://github.com/"+repoSlug+"/") {
		info.URL = rel.URL
	}
	if len(rel.Body) > 2000 {
		rel.Body = rel.Body[:2000] + "…"
	}
	info.Notes = rel.Body
	info.Newer = newerVersion(info.Latest, Version)
	return info, nil
}

// SetUpdateCheck activa o desactiva la consulta al abrir.
func (a *App) SetUpdateCheck(enabled bool) error {
	s := a.store.Settings()
	s.NoUpdateCheck = !enabled
	return a.store.SaveSettings(s)
}

// newerVersion: ¿a (x.y.z) es posterior a b?
func newerVersion(a, b string) bool {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < 3; i++ {
		var x, y int
		if i < len(pa) {
			x, _ = strconv.Atoi(strings.SplitN(pa[i], "-", 2)[0])
		}
		if i < len(pb) {
			y, _ = strconv.Atoi(strings.SplitN(pb[i], "-", 2)[0])
		}
		if x != y {
			return x > y
		}
	}
	return false
}
