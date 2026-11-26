package app

import (
	"strings"
	"testing"

	"draupnode/internal/bundle"
	"draupnode/internal/modules"
)

func TestModuleTips(t *testing.T) {
	sel := func(ids ...string) []bundle.Selection {
		var out []bundle.Selection
		for _, id := range ids {
			out = append(out, bundle.Selection{Module: &modules.Module{ID: id}})
		}
		return out
	}
	if n := len(moduleTips(sel("authelia", "caddy"))); n != 0 {
		t.Fatalf("sin Keycloak no hay consejo: %d", n)
	}
	tips := moduleTips(sel("authelia", "keycloak", "beszel", "monitoring", "listmonk"))
	if len(tips) != 3 || !strings.Contains(tips[0], "Keycloak") || !strings.Contains(tips[2], "SMTP") {
		t.Fatalf("%q", tips)
	}
}
