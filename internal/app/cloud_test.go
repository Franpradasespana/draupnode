package app

import (
	"strings"
	"testing"

	"draupnode/internal/bundle"
	"draupnode/internal/store"
)

func TestAvisoNube(t *testing.T) {
	a := newTestApp(t, nil)
	wg, _ := a.cat().Get("wireguard")
	fw, _ := a.cat().Get("firewall")
	sel := []bundle.Selection{
		{Module: fw, Values: map[string]any{"firewall_tcp_ports": []string{"22", "443", "80"}}},
		{Module: wg, Values: map[string]any{"wireguard_port": 51820}},
	}
	w := cloudPortWarning(sel, "oracle")
	if !strings.Contains(w, "Oracle Cloud") || !strings.Contains(w, "80/tcp, 443/tcp, 51820/udp") || strings.Contains(w, "22/") {
		t.Fatal(w)
	}
	if cloudPortWarning(sel, "") != "" || cloudPortWarning(sel[:0], "aws") != "" {
		t.Fatal("sin nube o sin puertos no debe avisar")
	}
}

func TestSitioAutomatico(t *testing.T) {
	a := newTestApp(t, nil)
	s, _ := a.store.SaveServer(store.Server{Name: "web", Host: "203.0.113.10", User: "root", AuthMethod: store.AuthPassword})
	mods := []store.ProjectModule{
		{ID: "git-app", Values: map[string]any{"git_app_repo": "https://ejemplo.com/a.git", "git_app_domain": "tienda.ejemplo.com", "git_app_port": 8000}},
	}
	chk := a.CheckProject(store.Project{Name: "x", ServerID: s.ID, Modules: mods})
	if !strings.Contains(strings.Join(chk.Warnings, "|"), "Caddy o nginx") {
		t.Fatalf("sin proxy debería avisar: %v", chk.Warnings)
	}
	p, err := a.SaveProject(store.Project{Name: "x", ServerID: s.ID, Modules: append(mods, store.ProjectModule{ID: "caddy", Values: map[string]any{"caddy_sites": []string{"blog.ejemplo.com /srv/www"}}})})
	if err != nil {
		t.Fatal(err)
	}
	sites := toStrings(projectModule(p, "caddy").Values["caddy_sites"])
	if strings.Join(sites, "|") != "blog.ejemplo.com /srv/www|tienda.ejemplo.com 127.0.0.1:8000" {
		t.Fatalf("sitios: %v", sites)
	}
	// Guardar otra vez no lo duplica.
	p, _ = a.SaveProject(p)
	if n := len(toStrings(projectModule(p, "caddy").Values["caddy_sites"])); n != 2 {
		t.Fatalf("duplicado: %d", n)
	}
}

func TestDNSdeLaVPN(t *testing.T) {
	a := newTestApp(t, nil)
	s, _ := a.store.SaveServer(store.Server{Name: "web", Host: "203.0.113.10", User: "root", AuthMethod: store.AuthPassword})
	p, err := a.SaveProject(store.Project{Name: "x", ServerID: s.ID, Modules: []store.ProjectModule{{ID: "wireguard", Values: map[string]any{}}, {ID: "adguard", Values: map[string]any{}}}})
	if err != nil {
		t.Fatal(err)
	}
	if d := projectModule(p, "wireguard").Values["wireguard_dns"]; d != "10.8.0.1" {
		t.Fatalf("DNS de la VPN: %v", d)
	}
}
