package main

import (
	"fmt"
	"strings"

	"draupnode/internal/overview"
)

// Historial de CPU, memoria, disco y apps: un temporizador de systemd en el
// servidor (draupnode-historial) toma una muestra cada 5 minutos con
// historial.py. Así el historial existe aunque Draupnode esté cerrado; la ficha
// lo lee al actualizarse.

const (
	historyScript = "/usr/local/lib/draupnode/historial.py"
	historyData   = "/var/lib/draupnode/historial"
	historyUnit   = "draupnode-historial"
)

func historyInstallCmd() string {
	unit := "[Unit]\nDescription=Draupnode: muestra de CPU, memoria, disco y apps para el historial\n\n" +
		"[Service]\nType=oneshot\nNice=10\nIOSchedulingClass=idle\nExecStart=/usr/bin/python3 " + historyScript + " muestra\n"
	timer := "[Unit]\nDescription=Draupnode: historial cada 5 minutos\n\n" +
		"[Timer]\nOnBootSec=2min\nOnUnitActiveSec=5min\nAccuracySec=30s\n\n[Install]\nWantedBy=timers.target\n"
	return strings.Join([]string{
		"set -e",
		"command -v python3 >/dev/null || { echo 'el servidor no tiene python3 (aplica el módulo «Sistema base»)' >&2; exit 1; }",
		"install -d -m 755 /usr/local/lib/draupnode",
		"install -d -m 750 " + historyData,
		"cat > " + historyScript + " <<'DRAUPNODE_HIST'\n" + overview.Historial + "\nDRAUPNODE_HIST",
		"chmod 644 " + historyScript,
		"cat > /etc/systemd/system/" + historyUnit + ".service <<'DRAUPNODE_HIST'\n" + unit + "DRAUPNODE_HIST",
		"cat > /etc/systemd/system/" + historyUnit + ".timer <<'DRAUPNODE_HIST'\n" + timer + "DRAUPNODE_HIST",
		"systemctl daemon-reload",
		"systemctl enable --now " + historyUnit + ".timer >/dev/null 2>&1",
		// La primera muestra ya, para que la ficha no salga vacía.
		"systemctl start " + historyUnit + ".service",
		"echo 'Historial activado: una muestra cada 5 minutos.'",
	}, "\n")
}

func historyRemoveCmd(keepData bool) string {
	cmd := fmt.Sprintf("systemctl disable --now %[1]s.timer >/dev/null 2>&1 || true; rm -f /etc/systemd/system/%[1]s.timer /etc/systemd/system/%[1]s.service %[2]s; systemctl daemon-reload", historyUnit, historyScript)
	if !keepData {
		cmd += "; rm -rf " + historyData
	}
	return cmd + "; echo 'Historial desactivado.'"
}

// ServerHistory activa (o vuelve a instalar, para actualizarlo) o quita el
// historial del servidor. Al quitarlo, keepData conserva lo guardado.
func (a *App) ServerHistory(serverID string, enable, keepData bool, secret, accept, sudoPassword string) DockerResult {
	if enable {
		return a.dockerExec(serverID, historyInstallCmd(), secret, accept, sudoPassword)
	}
	return a.dockerExec(serverID, historyRemoveCmd(keepData), secret, accept, sudoPassword)
}

// markHistoryOutdated: si el historial.py del servidor es anterior al de esta
// Draupnode, la ficha ofrece actualizarlo.
func markHistoryOutdated(ov map[string]any) {
	h, ok := ov["history"].(map[string]any)
	if !ok || h["installed"] != true {
		return
	}
	v, _ := h["version"].(float64)
	if int(v) < overview.HistoryVersion {
		h["outdated"] = true
	}
}
