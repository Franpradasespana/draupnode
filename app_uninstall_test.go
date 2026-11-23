package main

import (
	"strings"
	"testing"

	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

func TestDesinstalarReglas(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	srv, _ := a.store.SaveServer(store.Server{Name: "k", Host: "203.0.113.20", Port: 22, User: "ubuntu", AuthMethod: store.AuthKey, KeyPath: "/dev/null"})
	p, err := a.SaveProject(store.Project{Name: "P", ServerID: srv.ID, Modules: []store.ProjectModule{
		{ID: "postgres", Values: map[string]any{"postgres_dir": "/srv/otra"}}, {ID: "ssh", Values: map[string]any{"ssh_port": 2200}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if c := a.CheckUninstall(p.ID, []string{"postgres"}); c.OK || !strings.Contains(c.Error, "no está instalado") {
		t.Fatalf("sin aplicar: %+v", c)
	}
	a.store.SetLastRun(p.ID, store.RunSummary{OK: true})
	p, _ = a.store.Project(p.ID)

	cases := map[string]string{
		"base":   "no se puede desinstalar",
		"docker": "lo necesita PostgreSQL compartido",
		"ssh":    "puerto 2200",
	}
	for mod, want := range cases {
		if c := a.CheckUninstall(p.ID, []string{mod}); c.OK || !strings.Contains(c.Error, want) {
			t.Fatalf("%s: %+v", mod, c)
		}
	}
	c := a.CheckUninstall(p.ID, []string{"postgres"})
	if !c.OK || !c.HasData || len(c.Modules) != 1 || c.Modules[0].Warning == "" {
		t.Fatalf("postgres: %+v", c)
	}
	// Desmarcado del proyecto: se desinstala con los valores con los que se instaló.
	p.Modules = p.Modules[:0]
	for _, m := range []string{"base", "docker", "firewall"} {
		p.Modules = append(p.Modules, store.ProjectModule{ID: m, Values: map[string]any{}})
	}
	p, _ = a.store.SaveProject(p)
	sel, err := a.uninstallSelection(p, []string{"postgres", "docker"})
	if err != nil || len(sel) != 2 || sel[0].Module.ID != "docker" || sel[1].Values["postgres_dir"] != "/srv/otra" {
		t.Fatalf("%v %+v", err, sel)
	}
	// Tras desinstalar: fuera del proyecto y de lo instalado, sin contar como cambio.
	before := p.UpdatedAt
	a.store.MarkUninstalled(p.ID, []string{"postgres", "docker"})
	p, _ = a.store.Project(p.ID)
	for _, m := range p.Modules {
		if m.ID == "docker" {
			t.Fatal("docker sigue en el proyecto")
		}
	}
	if strings.Contains(strings.Join(p.InstalledModules, ","), "docker") || p.InstalledValues["postgres"] != nil || !p.UpdatedAt.Equal(before) {
		t.Fatalf("%+v", p)
	}
	// Una desinstalación no cuenta como aplicar.
	a.store.SetLastRun(p.ID, store.RunSummary{OK: true, Uninstall: true})
	if q, _ := a.store.Project(p.ID); strings.Contains(strings.Join(q.InstalledModules, ","), "docker") {
		t.Fatal("la desinstalación marcó módulos como instalados")
	}
}

func TestDesinstalarTodo(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	srv, _ := a.store.SaveServer(store.Server{Name: "k", Host: "203.0.113.21", Port: 22, User: "ubuntu", AuthMethod: store.AuthKey, KeyPath: "/dev/null"})
	p, err := a.SaveProject(store.Project{Name: "P", ServerID: srv.ID, Modules: []store.ProjectModule{
		{ID: "postgres", Values: map[string]any{}}, {ID: "ssh", Values: map[string]any{"ssh_port": 2200}}, {ID: "firewall", Values: map[string]any{}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	a.store.SetLastRun(p.ID, store.RunSummary{OK: true})
	p, _ = a.store.Project(p.ID)
	// Marcado después y nunca aplicado: solo se quita de la lista.
	p.Modules = append(p.Modules, store.ProjectModule{ID: "navidrome", Values: map[string]any{}})
	p, _ = a.store.SaveProject(p)

	plan := a.PlanUninstallAll(p.ID)
	if !plan.OK {
		t.Fatal(plan.Error)
	}
	rm := strings.Join(plan.Remove, ",")
	for _, want := range []string{"postgres", "docker", "firewall"} {
		if !contains(plan.Remove, want) {
			t.Fatalf("falta %s en %s", want, rm)
		}
	}
	if contains(plan.Remove, "base") || contains(plan.Remove, "ssh") {
		t.Fatalf("base y SSH en otro puerto se quedan: %s", rm)
	}
	keep := map[string]string{}
	for _, k := range plan.Keep {
		keep[k.ID] = k.Warning
	}
	if !strings.Contains(keep["ssh"], "2200") || keep["base"] == "" {
		t.Fatalf("motivos: %+v", plan.Keep)
	}
	if !contains(plan.Unmark, "navidrome") || contains(plan.Unmark, "postgres") {
		t.Fatalf("sin aplicar: %+v", plan.Unmark)
	}
	// Su comprobación se hace ya sin los que nunca se instalaron.
	if !plan.Check.OK || len(plan.Check.Modules) != len(plan.Remove) || !plan.Check.HasData {
		t.Fatalf("el plan no pasa: %+v", plan.Check)
	}
}
