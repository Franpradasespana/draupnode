package main

import (
	"fmt"
	"net"

	"draupnode/internal/bundle"
	"draupnode/internal/store"
)

// Reglas del módulo «ssh» que solo la app puede comprobar, porque sabe cómo
// entra ella misma al servidor: así no se aplica nada que te deje fuera.

const sshModule = "ssh"

func sshValues(sel []bundle.Selection) map[string]any {
	for _, s := range sel {
		if s.Module.ID == sshModule {
			return s.Values
		}
	}
	return nil
}

// redirectedPort: el servidor se ve a través de un puerto local redirigido
// (p. ej. el servidor de pruebas: 127.0.0.1:2222 → 22 dentro del contenedor).
func redirectedPort(srv store.Server) bool {
	if srv.Host == "localhost" {
		return true
	}
	ip := net.ParseIP(srv.Host)
	return ip != nil && ip.IsLoopback()
}

func sshRules(srv store.Server, sel []bundle.Selection, res *ProjectCheck) {
	v := sshValues(sel)
	if v == nil {
		return
	}
	fail := func(variable, msg string) {
		if res.Errors[sshModule] == nil {
			res.Errors[sshModule] = map[string]string{}
		}
		if _, ok := res.Errors[sshModule][variable]; !ok {
			res.Errors[sshModule][variable] = msg
		}
	}
	pass, _ := v["ssh_password_auth"].(bool)
	root, _ := v["ssh_root_login"].(string)
	port, _ := v["ssh_port"].(int)
	if srv.AuthMethod == store.AuthPassword && !pass {
		fail("ssh_password_auth", "Draupnode entra en este servidor con usuario y contraseña: si la quitas te quedarías fuera. Cambia antes el servidor a una clave SSH (en Servidores).")
	}
	if srv.User == "root" {
		switch {
		case root == "no":
			fail("ssh_root_login", "Draupnode entra como root: elige «solo-con-clave» o da de alta otro usuario con sudo.")
		case srv.AuthMethod == store.AuthPassword:
			fail("ssh_root_login", "Draupnode entra como root con contraseña, y root solo podrá entrar con clave: cambia antes el servidor a una clave SSH.")
		}
	}
	if users, _ := v["ssh_allow_users"].([]string); len(users) > 0 && !contains(users, srv.User) {
		fail("ssh_allow_users", fmt.Sprintf("Falta «%s», el usuario con el que entra Draupnode: te quedarías fuera.", srv.User))
	}
	if port != 0 && redirectedPort(srv) && port != 22 {
		fail("ssh_port", "Este servidor se ve por un puerto redirigido (como el servidor de pruebas): si cambias el puerto dentro, Draupnode perdería la conexión. Déjalo en 22.")
	}
	if port != 0 && !redirectedPort(srv) && port != srv.Port {
		res.Warnings = append(res.Warnings, fmt.Sprintf(
			"El SSH pasará del puerto %d al %d. Al terminar, Draupnode cambia el puerto del servidor y te pedirá confirmar su huella otra vez. En Oracle Cloud abre también el %d en la Security List antes de aplicar.",
			srv.Port, port, port))
	}
}

// afterApply ajusta Draupnode tras una aplicación correcta (p. ej. el puerto
// SSH nuevo). Devuelve un aviso para el usuario o "".
func (a *App) afterApply(p store.Project) string {
	srv, err := a.store.Server(p.ServerID)
	if err != nil {
		return ""
	}
	_, sel := a.resolveProject(p)
	v := sshValues(sel)
	if v == nil || redirectedPort(srv) {
		return ""
	}
	port, _ := v["ssh_port"].(int)
	if port == 0 || port == srv.Port {
		return ""
	}
	old := srv.Port
	srv.Port = port
	if _, err := a.store.SaveServer(srv); err != nil {
		return "El SSH escucha ahora en el puerto " + fmt.Sprint(port) + ", pero no se pudo actualizar el servidor en Draupnode: " + err.Error()
	}
	return fmt.Sprintf("El SSH escucha ahora en el puerto %d (antes %d): actualizado en Servidores. La próxima conexión te pedirá confirmar la huella del servidor (es la misma).", port, old)
}
