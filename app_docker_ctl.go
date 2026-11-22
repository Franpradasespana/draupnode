package main

import (
	"encoding/json"
	"regexp"
	"strings"

	"draupnode/internal/bundle"
	"draupnode/internal/runner"

	"golang.org/x/crypto/ssh"
)

// Controles de Docker en la ficha del servidor: parar, arrancar y reiniciar
// un contenedor, ver cuánto ocupa Docker y limpiar lo que no se usa. La
// limpieza nunca toca los volúmenes (ahí están los datos).

// DockerResult: resultado de una acción de Docker.
type DockerResult struct {
	RunStart
	Output string        `json:"output,omitempty"`
	Usage  []DockerUsage `json:"usage,omitempty"`
}

// DockerUsage: una fila de «docker system df».
type DockerUsage struct {
	Type        string `json:"type"`
	Total       string `json:"total"`
	Active      string `json:"active"`
	Size        string `json:"size"`
	Reclaimable string `json:"reclaimable"`
}

var containerNameRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$`)

func (a *App) dockerExec(serverID, cmd, secret, accept, sudoPassword string) DockerResult {
	var res DockerResult
	res.RunStart = a.withServerConn(serverID, secret, accept, sudoPassword, func(c *ssh.Client, su runner.Sudo) RunStart {
		out, errOut, err := execOut(c, su, cmd)
		res.Output = strings.TrimSpace(out + "\n" + errOut)
		if err != nil {
			return RunStart{Status: "error", Message: firstLine(errOut, err)}
		}
		return RunStart{Status: "ok"}
	})
	return res
}

// ContainerAction: start | stop | restart de un contenedor.
func (a *App) ContainerAction(serverID, name, action, secret, accept, sudoPassword string) DockerResult {
	if !containerNameRe.MatchString(name) {
		return DockerResult{RunStart: RunStart{Status: "error", Message: "nombre de contenedor no válido"}}
	}
	switch action {
	case "start", "stop", "restart":
	default:
		return DockerResult{RunStart: RunStart{Status: "error", Message: "acción no válida"}}
	}
	return a.dockerExec(serverID, "docker "+action+" "+bundle.ShellQuote(name), secret, accept, sudoPassword)
}

// DockerDiskUsage: cuánto ocupa Docker y cuánto se puede recuperar.
func (a *App) DockerDiskUsage(serverID, secret, accept, sudoPassword string) DockerResult {
	res := a.dockerExec(serverID, "docker system df --format '{{json .}}'", secret, accept, sudoPassword)
	if res.Status != "ok" {
		return res
	}
	for _, l := range strings.Split(res.Output, "\n") {
		var r struct{ Type, TotalCount, Active, Size, Reclaimable string }
		if json.Unmarshal([]byte(strings.TrimSpace(l)), &r) == nil && r.Type != "" {
			res.Usage = append(res.Usage, DockerUsage{Type: r.Type, Total: r.TotalCount, Active: r.Active, Size: r.Size, Reclaimable: r.Reclaimable})
		}
	}
	res.Output = ""
	return res
}

// DockerPrune limpia lo que se pida: «images» (imágenes que no usa ningún
// contenedor), «build» (caché de construcción) y «containers» (contenedores
// parados). Los volúmenes nunca.
func (a *App) DockerPrune(serverID string, what []string, secret, accept, sudoPassword string) DockerResult {
	var cmds []string
	for _, w := range what {
		switch w {
		case "images":
			cmds = append(cmds, "echo '== Imágenes sin usar'; docker image prune -a -f")
		case "build":
			cmds = append(cmds, "echo '== Caché de construcción'; docker builder prune -a -f")
		case "containers":
			cmds = append(cmds, "echo '== Contenedores parados'; docker container prune -f")
		}
	}
	if len(cmds) == 0 {
		return DockerResult{RunStart: RunStart{Status: "error", Message: "elige qué limpiar"}}
	}
	res := a.dockerExec(serverID, "{ "+strings.Join(cmds, "; ")+"; } 2>&1 | grep -E '^==|Total reclaimed|untagged' | head -n 80", secret, accept, sudoPassword)
	return res
}

// RemoveOrphanApp borra una app que Draupnode ya no gestiona (se quedó al
// cambiar el nombre o quitar una App desde Git): sus contenedores (proyecto
// dn-<nombre>), su carpeta /srv/draupnode/apps/<nombre> y, con purge, sus
// volúmenes (los datos: su base de datos…). No toca ninguna app gestionada.
func (a *App) RemoveOrphanApp(serverID, name string, purge bool, secret, accept, sudoPassword string) DockerResult {
	if !gitNameRe.MatchString(name) {
		return DockerResult{RunStart: RunStart{Status: "error", Message: "nombre de app no válido"}}
	}
	if _, ok := a.cat().Get(name); ok {
		return DockerResult{RunStart: RunStart{Status: "error", Message: "es un módulo del catálogo: desinstálalo desde sus módulos"}}
	}
	if p, ok := a.store.ServerProject(serverID); ok {
		for _, m := range p.Modules {
			if n, _ := m.Values["git_app_name"].(string); n == name {
				return DockerResult{RunStart: RunStart{Status: "error", Message: "esa app la gestiona Draupnode: desinstálala desde sus módulos"}}
			}
		}
	}
	down := "docker compose -p " + bundle.ShellQuote("dn-"+name) + " down --remove-orphans"
	if purge {
		down += " -v"
	}
	dir := bundle.ShellQuote("/srv/draupnode/apps/" + name)
	cmd := "echo '== Contenedores'; " + down + " 2>&1; echo '== Carpeta'; rm -rf " + dir + " && echo borrada " + dir
	return a.dockerExec(serverID, cmd, secret, accept, sudoPassword)
}

// ServerUpgrade instala las actualizaciones pendientes del sistema (apt).
func (a *App) ServerUpgrade(serverID, secret, accept, sudoPassword string) DockerResult {
	cmd := "export DEBIAN_FRONTEND=noninteractive; apt-get update -q >/dev/null 2>&1; " +
		"apt-get -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade 2>&1 | tail -n 25; " +
		"[ -f /var/run/reboot-required ] && echo '== Hace falta reiniciar el servidor para terminar.' || true"
	return a.dockerExec(serverID, cmd, secret, accept, sudoPassword)
}

// ServerReboot reinicia el servidor (vuelve en un par de minutos).
func (a *App) ServerReboot(serverID, secret, accept, sudoPassword string) DockerResult {
	return a.dockerExec(serverID, "nohup sh -c 'sleep 2; systemctl reboot' >/dev/null 2>&1 & echo reiniciando", secret, accept, sudoPassword)
}
