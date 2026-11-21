package main

import (
	"strings"
	"testing"

	"draupnode/internal/bundle"
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
