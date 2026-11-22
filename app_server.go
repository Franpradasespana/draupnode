package main

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"

	"draupnode/internal/bundle"
	"draupnode/internal/overview"
	"draupnode/internal/runner"

	"golang.org/x/crypto/ssh"
)

// Ficha del servidor: su estado completo (sistema, contenedores, bases de
// datos, apps de Coolify, sitios web, servicios y puertos) y sus registros.

// ServerOverviewResult es la respuesta de ServerOverview.
type ServerOverviewResult struct {
	RunStart
	Overview map[string]any `json:"overview,omitempty"`
}

func (a *App) withServerConn(serverID, secret, accept, sudoPassword string, fn func(c *ssh.Client, su runner.Sudo) RunStart) RunStart {
	srv, err := a.store.Server(serverID)
	if err != nil {
		return RunStart{Status: "error", Message: err.Error()}
	}
	c, su, fail := a.connectSudo(srv, secret, accept, sudoPassword)
	if fail != nil {
		return *fail
	}
	defer c.Close()
	return fn(c, su)
}

// ServerOverview conecta y saca el estado del servidor (solo lee).
func (a *App) ServerOverview(serverID, secret, accept, sudoPassword string) ServerOverviewResult {
	var res ServerOverviewResult
	res.RunStart = a.withServerConn(serverID, secret, accept, sudoPassword, func(c *ssh.Client, su runner.Sudo) RunStart {
		out, errOut, err := execOut(c, su, "command -v python3 >/dev/null || { echo 'NOPY'; exit 0; }; python3 - <<'DRAUPNODE_OV'\n"+overview.Script+"\nDRAUPNODE_OV")
		if strings.TrimSpace(out) == "NOPY" {
			return RunStart{Status: "error", Message: "el servidor no tiene python3 (aplica el módulo «Sistema base»)"}
		}
		if err != nil && out == "" {
			return RunStart{Status: "error", Message: strings.TrimSpace(firstLine(errOut, err))}
		}
		var ov map[string]any
		if err := json.Unmarshal([]byte(lastJSONLine(out)), &ov); err != nil {
			return RunStart{Status: "error", Message: "respuesta no válida del servidor: " + err.Error()}
		}
		res.Overview = ov
		a.refreshFacts(serverID, ov)
		a.saveOverview(serverID, ov)
		return RunStart{Status: "ok"}
	})
	return res
}

func lastJSONLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if strings.HasPrefix(strings.TrimSpace(lines[i]), "{") {
			return lines[i]
		}
	}
	return s
}

// refreshFacts actualiza la última comprobación del servidor con lo visto.
func (a *App) refreshFacts(serverID string, ov map[string]any) {
	srv, err := a.store.Server(serverID)
	if err != nil || srv.LastCheck == nil || srv.LastCheck.Facts == nil {
		return
	}
	f := srv.LastCheck.Facts
	if sys, ok := ov["system"].(map[string]any); ok {
		if v, ok := sys["memTotal"].(float64); ok {
			f["mem_kb"] = strconv.FormatInt(int64(v)/1024, 10)
		}
	}
	if disks, ok := ov["disks"].([]any); ok {
		for _, d := range disks {
			if m, ok := d.(map[string]any); ok && m["mount"] == "/" {
				f["disk_free_kb"] = strconv.FormatInt(int64(m["free"].(float64))/1024, 10)
				f["disk_total_kb"] = strconv.FormatInt(int64(m["size"].(float64))/1024, 10)
			}
		}
	}
	if d, ok := ov["docker"].(bool); ok {
		f["has_docker"] = map[bool]string{true: "yes", false: "no"}[d]
	}
	_ = a.store.SetLastCheck(serverID, *srv.LastCheck)
}

var logNameRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}$`)

// ServerLogsResult son las últimas líneas de un registro.
type ServerLogsResult struct {
	RunStart
	Text string `json:"text,omitempty"`
}

// ServerLogs: las últimas líneas del registro de un contenedor («container»),
// de un servicio de systemd («unit») o de todo el sistema («system»).
func (a *App) ServerLogs(serverID, kind, name string, lines int, secret, accept, sudoPassword string) ServerLogsResult {
	if lines <= 0 || lines > 5000 {
		lines = 300
	}
	n := strconv.Itoa(lines)
	var cmd string
	switch kind {
	case "container":
		if !logNameRe.MatchString(name) {
			return ServerLogsResult{RunStart: RunStart{Status: "error", Message: "nombre de contenedor no válido"}}
		}
		cmd = "docker logs --timestamps --tail " + n + " " + bundle.ShellQuote(name) + " 2>&1"
	case "unit":
		if !logNameRe.MatchString(name) {
			return ServerLogsResult{RunStart: RunStart{Status: "error", Message: "nombre de servicio no válido"}}
		}
		cmd = "journalctl --no-pager -o short-iso -n " + n + " -u " + bundle.ShellQuote(name) + " 2>&1"
	case "system":
		cmd = "journalctl --no-pager -o short-iso -n " + n + " 2>&1"
	default:
		return ServerLogsResult{RunStart: RunStart{Status: "error", Message: "tipo de registro no válido"}}
	}
	var res ServerLogsResult
	res.RunStart = a.withServerConn(serverID, secret, accept, sudoPassword, func(c *ssh.Client, su runner.Sudo) RunStart {
		out, errOut, err := execOut(c, su, cmd)
		res.Text = strings.TrimRight(out+errOut, "\n")
		if err != nil && res.Text == "" {
			return RunStart{Status: "error", Message: err.Error()}
		}
		return RunStart{Status: "ok"}
	})
	return res
}
