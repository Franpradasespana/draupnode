package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

func TestHistorial(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	s, _ := a.store.SaveServer(store.Server{Name: "web", Host: "203.0.113.10", User: "root", AuthMethod: store.AuthPassword})
	p, _ := a.SaveProject(store.Project{Name: "Tienda", ServerID: s.ID, Modules: []store.ProjectModule{{ID: "docker", Values: map[string]any{}}}})
	dir := filepath.Join(a.store.Dir(), "runs", p.ID)
	os.MkdirAll(dir, 0o700)
	// Una antigua sin resumen y una con resumen.
	os.WriteFile(filepath.Join(dir, "2026-11-01_10-00-00-previsualizar.log"), []byte("x"), 0o600)
	lp := filepath.Join(dir, "2026-11-02_10-00-00-aplicar.log")
	os.WriteFile(lp, []byte("y"), 0o600)
	saveRunSummary(lp, store.RunSummary{At: time.Date(2026, 11, 2, 10, 0, 0, 0, time.Local), OK: false, Failed: 2, Error: "terminó con errores"})
	h := a.RunHistory(s.ID, "", 0)
	if len(h) != 2 || h[0].Mode != "aplicar" || !h[0].Known || h[0].Failed != 2 || h[1].Known || h[1].Mode != "previsualizar" || h[1].At.Day() != 1 {
		t.Fatalf("%+v", h)
	}
	if len(a.RunHistory("otro", "", 0)) != 0 {
		t.Fatal("otro servidor")
	}
	if all := a.RunHistory("", "", 1); len(all) != 1 || all[0].Server != "web" || all[0].ServerID != s.ID {
		t.Fatalf("todos los servidores: %+v", all)
	}
	for i := 0; i < 5; i++ {
		os.WriteFile(filepath.Join(dir, "2026-11-1"+string(rune('0'+i))+"_10-00-00-aplicar.log"), []byte("z"), 0o600)
	}
	pruneRunLogs(dir, 3)
	if n := len(a.RunLogs(p.ID)); n != 3 {
		t.Fatalf("quedan %d", n)
	}
	if _, err := os.Stat(lp + ".json"); !os.IsNotExist(err) {
		t.Fatal("el resumen de una borrada debería irse con ella")
	}
}
