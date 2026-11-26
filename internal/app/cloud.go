package app

import (
	"draupnode/internal/i18n"
	"sort"
	"strconv"
	"strings"

	"draupnode/internal/bundle"
)

// Los proveedores de nube tienen un cortafuegos propio, fuera del servidor,
// que Draupnode no puede tocar: hay que abrir allí los mismos puertos.

// cloudFirewall: nombre del proveedor y dónde se abren los puertos.
var cloudFirewall = map[string][2]string{
	"oracle":       {"Oracle Cloud", i18n.N("la «Security List» de su VCN (o su Network Security Group): Networking → Virtual Cloud Networks → la red → Security Lists → Add Ingress Rules")},
	"aws":          {"AWS", i18n.N("el «Security Group» de la instancia (EC2 → Security Groups → Inbound rules)")},
	"gcp":          {"Google Cloud", i18n.N("las reglas de cortafuegos de su VPC (VPC network → Firewall)")},
	"azure":        {"Azure", i18n.N("el «Network Security Group» de la máquina (Networking → Inbound port rules)")},
	"hetzner":      {"Hetzner Cloud", i18n.N("su «Firewall» de Hetzner, si le has puesto uno (Firewalls → Inbound)")},
	"digitalocean": {"DigitalOcean", i18n.N("su «Cloud Firewall», si le has puesto uno (Networking → Firewalls)")},
	"ovh":          {"OVHcloud", i18n.N("el «Firewall Network» o los grupos de seguridad, si los tienes activados")},
	"scaleway":     {"Scaleway", i18n.N("su «Security Group» (Instances → Security groups)")},
	"linode":       {"Akamai/Linode", i18n.N("su «Cloud Firewall», si le has puesto uno")},
	"vultr":        {"Vultr", i18n.N("su «Firewall Group», si le has puesto uno")},
}

// CloudName devuelve el nombre legible del proveedor ("" si no se conoce).
func CloudName(id string) string { return cloudFirewall[id][0] }

// cloudPortWarning: aviso con los puertos que los módulos necesitan abiertos
// también en el cortafuegos del proveedor. "" si no es una nube conocida o
// no hace falta ninguno (el 22 ya viene abierto).
func cloudPortWarning(sel []bundle.Selection, cloud string) string {
	cf, ok := cloudFirewall[cloud]
	if !ok {
		return ""
	}
	set := map[string]bool{}
	for _, s := range sel {
		for _, p := range ModulePorts(s.Module, s.Values) {
			if p != "22" {
				set[p+"/tcp"] = true
			}
		}
		for _, name := range s.Module.UDPPortsFrom {
			if n := toInt(s.Values[name]); n > 0 {
				set[strconv.Itoa(n)+"/udp"] = true
			}
		}
		if s.Module.ID == "firewall" {
			for _, p := range toStrings(s.Values["firewall_tcp_ports"]) {
				if p != "22" {
					set[p+"/tcp"] = true
				}
			}
		}
	}
	if len(set) == 0 {
		return ""
	}
	ports := make([]string, 0, len(set))
	for p := range set {
		ports = append(ports, p)
	}
	sort.Slice(ports, func(i, j int) bool {
		return atoi(strings.Split(ports[i], "/")[0]) < atoi(strings.Split(ports[j], "/")[0])
	})
	return i18n.Sprintf("El servidor está en %s, que tiene su propio cortafuegos fuera del servidor: si no lo has hecho ya, abre también %s en %s. Draupnode no puede hacerlo por ti.",
		cf[0], strings.Join(ports, ", "), i18n.T(cf[1]))
}

// syncProxySites: las apps con dominio (proxy_site) se añaden a los sitios
// de Caddy o nginx del proyecto (cambia sus valores, que se guardan con el
// proyecto). Sin Caddy ni nginx, avisa. Las líneas que ya están no se tocan.
func syncProxySites(sel []bundle.Selection) []string {
	var proxyVals map[string]any
	proxyVar, proxyName := "", ""
	for _, s := range sel {
		switch s.Module.ID {
		case "caddy":
			proxyVals, proxyVar, proxyName = s.Values, "caddy_sites", "Caddy"
		case "nginx":
			proxyVals, proxyVar, proxyName = s.Values, "nginx_sites", "nginx"
		}
	}
	var w []string
	for _, s := range sel {
		ps := s.Module.ProxySite
		if ps == nil {
			continue
		}
		domain, _ := s.Values[ps.Domain].(string)
		port := toInt(s.Values[ps.Port])
		if domain == "" || port <= 0 {
			continue
		}
		line := domain + " 127.0.0.1:" + strconv.Itoa(port)
		if proxyVals == nil {
			w = append(w, s.Module.Name+i18n.T(" tiene el dominio ")+domain+i18n.T(": añade también Caddy o nginx para que se vea en https://")+domain+i18n.T(" (Draupnode pondrá el sitio solo)."))
			continue
		}
		sites := toStrings(proxyVals[proxyVar])
		found := false
		for _, l := range sites {
			if f := strings.Fields(l); len(f) > 0 && f[0] == domain {
				found = true
				if l != line {
					w = append(w, i18n.T("El dominio ")+domain+i18n.T(" ya está en los sitios de ")+proxyName+i18n.T(" con otro destino («")+l+"»); "+s.Module.Name+i18n.T(" escucha en 127.0.0.1:")+strconv.Itoa(port)+".")
				}
			}
		}
		if !found {
			proxyVals[proxyVar] = append(sites, line)
		}
	}
	return w
}

// syncAuthelia: con Authelia y Caddy en el servidor, Caddy pide iniciar
// sesión en Authelia antes de entrar en los dominios que se eligieron en el
// módulo Authelia (variables gestionadas de Caddy). Sin Authelia, se vacían.
func syncAuthelia(sel []bundle.Selection) []string {
	var caddy, auth map[string]any
	for _, s := range sel {
		switch s.Module.ID {
		case "caddy":
			caddy = s.Values
		case "authelia":
			auth = s.Values
		}
	}
	if caddy == nil {
		if auth != nil && len(toStrings(auth["authelia_protect"])) > 0 {
			return []string{i18n.T("Authelia protege tus apps a través de Caddy: añade el módulo Caddy (con nginx no se hace sola).")}
		}
		return nil
	}
	if auth == nil {
		caddy["caddy_forward_auth"], caddy["caddy_forward_auth_to"] = []string{}, ""
		return nil
	}
	caddy["caddy_forward_auth"] = toStrings(auth["authelia_protect"])
	caddy["caddy_forward_auth_to"] = "127.0.0.1:" + strconv.Itoa(toInt(auth["authelia_port"]))
	return nil
}

// syncVPNDNS: con AdGuard Home y WireGuard en el proyecto, los dispositivos
// de la VPN usan AdGuard como DNS (la .1 de la red de la VPN), salvo que el
// usuario haya puesto otro.
func syncVPNDNS(sel []bundle.Selection) {
	var wg map[string]any
	ad := false
	for _, s := range sel {
		switch s.Module.ID {
		case "wireguard":
			wg = s.Values
		case "adguard":
			ad = true
		}
	}
	if wg == nil || !ad {
		return
	}
	if d, _ := wg["wireguard_dns"].(string); d != "" {
		return
	}
	if n, _ := wg["wireguard_network"].(string); strings.HasSuffix(n, ".0/24") {
		wg["wireguard_dns"] = strings.TrimSuffix(n, ".0/24") + ".1"
	}
}
