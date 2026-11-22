package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"draupnode/internal/store"
)

// Historial de ejecuciones: cada Previsualizar/Aplicar/Desinstalar deja su
// registro (runs/<proyecto>/<fecha>-<modo>.log) y, al lado, su resumen
// (<…>.log.json). Se guardan los últimos maxRunLogs por plantilla en cada
// servidor.

const maxRunLogs = 60

func saveRunSummary(logPath string, sum store.RunSummary) {
	if b, err := json.Marshal(sum); err == nil {
		_ = os.WriteFile(logPath+".json", b, 0o600)
	}
}

func pruneRunLogs(dir string, keep int) {
	ents, _ := os.ReadDir(dir)
	var logs []string
	for _, e := range ents {
		if strings.HasSuffix(e.Name(), ".log") {
			logs = append(logs, e.Name())
		}
	}
	sort.Strings(logs)
	for len(logs) > keep {
		_ = os.Remove(filepath.Join(dir, logs[0]))
		_ = os.Remove(filepath.Join(dir, logs[0]+".json"))
		logs = logs[1:]
	}
}

// RunEntry es una ejecución del historial.
type RunEntry struct {
	ProjectID string    `json:"projectId"`
	Project   string    `json:"project"`
	ServerID  string    `json:"serverId"`
	Server    string    `json:"server"`
	Name      string    `json:"name"` // fichero del registro
	At        time.Time `json:"at"`
	Mode      string    `json:"mode"` // aplicar | previsualizar | desinstalar
	Known     bool      `json:"known"` // hay resumen (las de antes de la 0.40 no lo tienen)
	OK        bool      `json:"ok"`
	Canceled  bool      `json:"canceled"`
	Changed   int       `json:"changed"`
	Failed    int       `json:"failed"`
	Error     string    `json:"error,omitempty"`
	Duration  int64     `json:"durationMs"`
}

// RunHistory: las ejecuciones de las plantillas de un servidor (de todos si
// serverID está vacío; de una sola si projectID no lo está), de la más
// reciente a la más antigua.
func (a *App) RunHistory(serverID, projectID string, limit int) []RunEntry {
	out := []RunEntry{}
	names := map[string]string{}
	for _, s := range a.store.Servers() {
		names[s.ID] = s.Name
	}
	for _, p := range a.store.Projects() {
		if (serverID != "" && p.ServerID != serverID) || (projectID != "" && p.ID != projectID) {
			continue
		}
		dir := filepath.Join(a.store.Dir(), "runs", p.ID)
		for _, name := range a.RunLogs(p.ID) {
			e := RunEntry{ProjectID: p.ID, Project: p.Name, ServerID: p.ServerID, Server: names[p.ServerID], Name: name}
			base := strings.TrimSuffix(name, ".log")
			if i := strings.LastIndex(base, "-"); i > 0 {
				e.Mode = base[i+1:]
				e.At, _ = time.ParseInLocation("2006-01-02_15-04-05", base[:i], time.Local)
			}
			if b, err := os.ReadFile(filepath.Join(dir, name+".json")); err == nil {
				var s store.RunSummary
				if json.Unmarshal(b, &s) == nil {
					e.Known, e.OK, e.Canceled, e.Changed, e.Failed, e.Error, e.Duration, e.At = true, s.OK, s.Canceled, s.Changed, s.Failed, s.Error, s.Duration, s.At
				}
			}
			out = append(out, e)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].At.After(out[j].At) })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}
