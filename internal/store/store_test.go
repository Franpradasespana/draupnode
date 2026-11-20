package store

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCrudYPersistencia(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.SaveServer(Server{Name: "x"}); err == nil {
		t.Fatal("debería fallar sin host")
	}
	srv, err := s.SaveServer(Server{Name: " Oracle ", Host: "1.2.3.4", User: "ubuntu", KeyPath: "~/.ssh/id"})
	if err != nil {
		t.Fatal(err)
	}
	if srv.ID == "" || srv.Port != 22 || srv.AuthMethod != AuthKey || srv.Name != "Oracle" {
		t.Fatalf("valores por defecto: %+v", srv)
	}
	if err := s.SetLastCheck(srv.ID, CheckResult{OK: true}); err != nil {
		t.Fatal(err)
	}
	srv.Notes = "prod"
	if _, err := s.SaveServer(srv); err != nil {
		t.Fatal(err)
	}

	// Reabrir desde disco.
	s2, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	got, err := s2.Server(srv.ID)
	if err != nil || got.Notes != "prod" || got.LastCheck == nil || !got.LastCheck.OK {
		t.Fatalf("persistencia: %+v %v", got, err)
	}
	info, _ := os.Stat(filepath.Join(dir, "draupnode.json"))
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("permisos %v", info.Mode().Perm())
	}
	if err := s2.DeleteServer(srv.ID); err != nil || len(s2.Servers()) != 0 {
		t.Fatal("borrado")
	}
	if s2.Settings().Theme != "draupnir-gold" {
		t.Fatal("tema por defecto")
	}
	if err := s2.SaveSettings(Settings{Theme: "x", CustomPalettes: []byte("{no")}); err == nil {
		t.Fatal("JSON inválido aceptado")
	}
}

func TestProyectos(t *testing.T) {
	s, _ := Open(t.TempDir())
	if _, err := s.SaveProject(Project{Name: "x", ServerID: "nada"}); err == nil {
		t.Fatal("aceptó un servidor inexistente")
	}
	srv, _ := s.SaveServer(Server{Name: "o", Host: "1.2.3.4", User: "u", AuthMethod: AuthPassword})
	p, err := s.SaveProject(Project{Name: " Prod ", ServerID: srv.ID, Modules: []ProjectModule{{ID: "docker"}}})
	if err != nil || p.ID == "" || p.Name != "Prod" {
		t.Fatalf("%+v %v", p, err)
	}
	if err := s.SetLastRun(p.ID, RunSummary{OK: true, Changed: 3}); err != nil {
		t.Fatal(err)
	}
	p.Name = "Prod 2"
	p, _ = s.SaveProject(p)
	if p.LastRun == nil || p.LastRun.Changed != 3 {
		t.Fatal("perdió la última ejecución")
	}
	if err := s.DeleteServer(srv.ID); err == nil {
		t.Fatal("dejó borrar un servidor en uso")
	}
	if err := s.DeleteProject(p.ID); err != nil || len(s.Projects()) != 0 {
		t.Fatal("borrar proyecto")
	}
	if err := s.DeleteServer(srv.ID); err != nil {
		t.Fatal(err)
	}
}

func TestPlegadoNoEsCambio(t *testing.T) {
	s, _ := Open(t.TempDir())
	srv, _ := s.SaveServer(Server{Name: "o", Host: "203.0.113.10", User: "u", AuthMethod: AuthPassword})
	p, _ := s.SaveProject(Project{Name: "P", ServerID: srv.ID, Modules: []ProjectModule{{ID: "docker"}, {ID: "base"}}})
	before := p.UpdatedAt
	if err := s.SetCollapsed(p.ID, []string{"docker", "base"}); err != nil {
		t.Fatal(err)
	}
	got, _ := s.Project(p.ID)
	if !got.UpdatedAt.Equal(before) || len(got.Collapsed) != 2 || got.Collapsed[0] != "base" {
		t.Fatalf("plegado: %+v", got)
	}
	// Un guardado desde el editor con el plegado viejo no lo pisa.
	p.Collapsed = nil
	p, _ = s.SaveProject(p)
	if len(p.Collapsed) != 2 || !p.UpdatedAt.Equal(before) {
		t.Fatalf("guardar perdió el plegado o contó como cambio: %+v", p)
	}
	// Se conserva al reabrir.
	s2, _ := Open(s.Dir())
	if got, _ := s2.Project(p.ID); len(got.Collapsed) != 2 {
		t.Fatal("no persiste")
	}
}

func TestModulosInstalados(t *testing.T) {
	s, _ := Open(t.TempDir())
	srv, _ := s.SaveServer(Server{Name: "o", Host: "203.0.113.10", User: "u", AuthMethod: AuthPassword})
	p, _ := s.SaveProject(Project{Name: "P", ServerID: srv.ID, Modules: []ProjectModule{{ID: "docker"}, {ID: "base"}}})
	s.SetLastRun(p.ID, RunSummary{Check: true, OK: true, Changed: 3}) // simulación con cambios: no instala
	if got, _ := s.Project(p.ID); len(got.InstalledModules) != 0 {
		t.Fatal("una simulación no instala nada")
	}
	s.SetLastRun(p.ID, RunSummary{OK: true, Changed: 3})
	p.Modules = []ProjectModule{{ID: "base"}} // se quita docker del proyecto
	p, _ = s.SaveProject(p)
	s.SetLastRun(p.ID, RunSummary{OK: true})
	got, _ := s.Project(p.ID)
	if strings.Join(got.InstalledModules, ",") != "base,docker" {
		t.Fatalf("docker sigue instalado en el servidor: %v", got.InstalledModules)
	}
}
