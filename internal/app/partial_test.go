package app

import (
	"strings"
	"testing"
	"time"

	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

func TestAplicacionAMedias(t *testing.T) {
	p := store.Project{Modules: []store.ProjectModule{{ID: "base"}, {ID: "docker"}, {ID: "git-app"}, {ID: "nginx"}}}
	sum := store.RunSummary{}
	msg := partialApply(&sum, p, []string{"draupnode_preflight", "base", "docker", "git-app"}, strings.ToUpper)
	if strings.Join(sum.Completed, ",") != "base,docker" {
		t.Fatalf("completados: %v", sum.Completed)
	}
	if msg != "Quedaron instalados: BASE, DOCKER. Falló en: GIT-APP. No se llegó a: NGINX (se instalarán al volver a aplicar)." {
		t.Fatal(msg)
	}

	a := newTestApp(t, secrets.Memory{})
	s, _ := a.store.SaveServer(store.Server{Name: "web", Host: "203.0.113.10", User: "root", AuthMethod: store.AuthPassword})
	pr, _ := a.SaveProject(store.Project{Name: "Pruebas", ServerID: s.ID, Modules: []store.ProjectModule{{ID: "base", Values: map[string]any{}}, {ID: "docker", Values: map[string]any{}}}})
	if err := a.store.SetLastRun(pr.ID, store.RunSummary{At: time.Now(), Completed: []string{"base"}, Error: "x"}); err != nil {
		t.Fatal(err)
	}
	got, _ := a.store.Project(pr.ID)
	if strings.Join(got.InstalledModules, ",") != "base" || got.AppliedAt != nil {
		t.Fatalf("instalados %v, aplicado %v", got.InstalledModules, got.AppliedAt)
	}
}
