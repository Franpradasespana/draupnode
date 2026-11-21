package main

import (
	"strings"

	"draupnode/internal/bundle"
	"draupnode/internal/store"
)

// AlertsResult es la respuesta de «Enviar aviso de prueba» / «Ver estado».
type AlertsResult struct {
	RunStart
	OK     bool   `json:"ok"`
	Output string `json:"output,omitempty"`
}

// AlertsRun ejecuta el script de alertas del proyecto: «prueba» (manda un
// aviso) o «estado» (lo que ve ahora, sin avisar).
func (a *App) AlertsRun(projectID, what, secret, accept, sudoPassword string) AlertsResult {
	if what != "prueba" && what != "estado" {
		return AlertsResult{RunStart: RunStart{Status: "error", Message: "orden no válida"}}
	}
	p, err := a.store.Project(projectID)
	if err != nil {
		return AlertsResult{RunStart: RunStart{Status: "error", Message: err.Error()}}
	}
	if !contains(p.InstalledModules, "alerts") {
		return AlertsResult{RunStart: RunStart{Status: "error", Message: "las alertas aún no están instaladas: pulsa Aplicar"}}
	}
	if a.projectRunning(projectID) {
		return AlertsResult{RunStart: RunStart{Status: "busy", Message: "el proyecto está ocupado con otra tarea"}}
	}
	srv, err := a.store.Server(p.ServerID)
	if err != nil {
		return AlertsResult{RunStart: RunStart{Status: "error", Message: err.Error()}}
	}
	c, su, fail := a.connectSudo(srv, secret, accept, sudoPassword)
	if fail != nil {
		return AlertsResult{RunStart: *fail}
	}
	defer c.Close()
	out, errOut, err := execOut(c, su, bundle.ShellQuote(alertsScript(p))+" "+what)
	res := AlertsResult{RunStart: RunStart{Status: "ok"}, OK: err == nil, Output: strings.TrimSpace(out + errOut)}
	if err != nil && res.Output == "" {
		res.Output = err.Error()
	}
	return res
}

func alertsScript(p store.Project) string { return "/usr/local/sbin/draupnode-alertas-" + slugOf(p) }
