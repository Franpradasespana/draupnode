package app

import (
	"os"
	"testing"

	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

func TestFichaGuardada(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	s, _ := a.store.SaveServer(store.Server{Name: "web", Host: "203.0.113.10", User: "root", AuthMethod: store.AuthPassword})
	if len(a.LastOverviews()) != 0 {
		t.Fatal("no debería haber fichas")
	}
	a.saveOverview(s.ID, map[string]any{"docker": true})
	a.saveOverview("../fuera", map[string]any{"docker": true})
	got := a.LastOverviews()
	if c, ok := got[s.ID]; len(got) != 1 || !ok || c.Overview["docker"] != true || c.At.IsZero() {
		t.Fatalf("%+v", got)
	}
	if err := a.DeleteServer(s.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(a.overviewPath(s.ID)); !os.IsNotExist(err) {
		t.Fatal("la ficha debería irse con el servidor")
	}
}
