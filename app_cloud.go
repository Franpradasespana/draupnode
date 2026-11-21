package main

import (
	"sort"
	"strconv"
	"strings"

	"draupnode/internal/bundle"
)

// Los proveedores de nube tienen un cortafuegos propio, fuera del servidor,
// que Draupnode no puede tocar: hay que abrir allí los mismos puertos.

// cloudFirewall: nombre del proveedor y dónde se abren los puertos.
var cloudFirewall = map[string][2]string{
	"oracle":       {"Oracle Cloud", "la «Security List» de su VCN (o su Network Security Group): Networking → Virtual Cloud Networks → la red → Security Lists → Add Ingress Rules"},
	"aws":          {"AWS", "el «Security Group» de la instancia (EC2 → Security Groups → Inbound rules)"},
	"gcp":          {"Google Cloud", "las reglas de cortafuegos de su VPC (VPC network → Firewall)"},
	"azure":        {"Azure", "el «Network Security Group» de la máquina (Networking → Inbound port rules)"},
	"hetzner":      {"Hetzner Cloud", "su «Firewall» de Hetzner, si le has puesto uno (Firewalls → Inbound)"},
	"digitalocean": {"DigitalOcean", "su «Cloud Firewall», si le has puesto uno (Networking → Firewalls)"},
	"ovh":          {"OVHcloud", "el «Firewall Network» o los grupos de seguridad, si los tienes activados"},
	"scaleway":     {"Scaleway", "su «Security Group» (Instances → Security groups)"},
	"linode":       {"Akamai/Linode", "su «Cloud Firewall», si le has puesto uno"},
	"vultr":        {"Vultr", "su «Firewall Group», si le has puesto uno"},
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
	return "El servidor está en " + cf[0] + ", que tiene su propio cortafuegos fuera del servidor: si no lo has hecho ya, abre también " +
		strings.Join(ports, ", ") + " en " + cf[1] + ". Draupnode no puede hacerlo por ti."
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
			w = append(w, s.Module.Name+" tiene el dominio "+domain+": añade Caddy o nginx al proyecto para que se vea en https://"+domain+" (Draupnode pondrá el sitio solo).")
			continue
		}
		sites := toStrings(proxyVals[proxyVar])
		found := false
		for _, l := range sites {
			if f := strings.Fields(l); len(f) > 0 && f[0] == domain {
				found = true
				if l != line {
					w = append(w, "El dominio "+domain+" ya está en los sitios de "+proxyName+" con otro destino («"+l+"»); "+s.Module.Name+" escucha en 127.0.0.1:"+strconv.Itoa(port)+".")
				}
			}
		}
		if !found {
			proxyVals[proxyVar] = append(sites, line)
		}
	}
	return w
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
