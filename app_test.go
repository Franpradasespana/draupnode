package main

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

// llavero que falla siempre: simula un Linux sin GNOME Keyring/KWallet.
type noKeyring struct{}

func (noKeyring) Get(string) (string, error) { return "", secrets.ErrNotFound }
func (noKeyring) Set(string, string) error   { return secrets.ErrNotFound }
func (noKeyring) Delete(string) error        { return nil }

func newTestApp(t *testing.T, kr secrets.Keyring) *App {
	t.Helper()
	dir := t.TempDir()
	st, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	v, err := secrets.OpenVault(filepath.Join(dir, "vault.json"))
	if err != nil {
		t.Fatal(err)
	}
	return NewApp(st, kr, v)
}

func srvPassword() store.Server {
	return store.Server{Name: "x", Host: "10.0.0.1", User: "root", AuthMethod: store.AuthPassword}
}

func TestGuardarEnLlavero(t *testing.T) {
	kr := secrets.Memory{}
	a := newTestApp(t, kr)
	if a.SecretsInfo().Effective != store.SecretKeyring {
		t.Fatal("con llavero disponible debería usarlo")
	}
	v, err := a.SaveServer(srvPassword(), "pw", true, "")
	if err != nil || !v.HasSecret || v.SecretStore != store.SecretKeyring || kr[secrets.SecretName(v.ID)] != "pw" {
		t.Fatalf("%+v %v", v, err)
	}
	// Guardar sin contraseña nueva conserva la anterior.
	v, _ = a.SaveServer(v.Server, "", true, "")
	if !v.HasSecret {
		t.Fatal("perdió la contraseña")
	}
	// Desmarcar «guardar» la borra.
	v, _ = a.SaveServer(v.Server, "", false, "")
	if v.HasSecret || v.SecretStore != "" || len(kr) != 0 {
		t.Fatalf("no se borró: %+v %v", v, kr)
	}
}

func TestSinLlaveroUsaBoveda(t *testing.T) {
	a := newTestApp(t, noKeyring{})
	if a.SecretsInfo().Effective != store.SecretVault {
		t.Fatal("sin llavero debería usar la bóveda")
	}
	_, err := a.SaveServer(srvPassword(), "pw", true, "")
	if err == nil || !strings.HasPrefix(err.Error(), codeVaultMissing) {
		t.Fatalf("esperaba VAULT_MISSING, llegó %v", err)
	}
	if len(a.ListServers()) != 0 {
		t.Fatal("no debería guardar el servidor si falla la bóveda")
	}
	if err := a.VaultCreate("maestra larga 123"); err != nil {
		t.Fatal(err)
	}
	v, err := a.SaveServer(srvPassword(), "pw", true, "")
	if err != nil || v.SecretStore != store.SecretVault || !v.HasSecret {
		t.Fatalf("%+v %v", v, err)
	}
	a.VaultLock()
	if r := a.TestConnection(v.ID, "", ""); r.Status != "vault_locked" {
		t.Fatalf("con bóveda bloqueada: %+v", r)
	}
	if _, err := a.SaveServer(srvPassword(), "otra", true, ""); err == nil || !strings.HasPrefix(err.Error(), codeVaultLocked) {
		t.Fatalf("esperaba VAULT_LOCKED, llegó %v", err)
	}
	// Pasar a clave sin contraseña borra la contraseña vieja.
	s := v.Server
	s.AuthMethod, s.KeyPath = store.AuthKey, "~/.ssh/id"
	v, err = a.SaveServer(s, "", true, "")
	if err != nil || v.HasSecret || v.SecretStore != "" {
		t.Fatalf("%+v %v", v, err)
	}
}

func TestElegirAlmacenYMover(t *testing.T) {
	kr := secrets.Memory{}
	a := newTestApp(t, kr)
	if err := a.VaultCreate("maestra larga 123"); err != nil {
		t.Fatal(err)
	}
	// Con llavero disponible, el usuario elige la bóveda para este servidor.
	v, err := a.SaveServer(srvPassword(), "pw", true, store.SecretVault)
	if err != nil || v.SecretStore != store.SecretVault || len(kr) != 0 {
		t.Fatalf("%+v %v %v", v, err, kr)
	}
	// Moverla al llavero sin volver a escribirla.
	v, err = a.SaveServer(v.Server, "", true, store.SecretKeyring)
	if err != nil || v.SecretStore != store.SecretKeyring || kr[secrets.SecretName(v.ID)] != "pw" || a.vault.Has(secrets.SecretName(v.ID)) {
		t.Fatalf("mover a llavero: %+v %v", v, err)
	}
	// Y de vuelta a la bóveda, bloqueada: hay que desbloquear.
	a.VaultLock()
	if _, err := a.SaveServer(v.Server, "", true, store.SecretVault); err == nil || !strings.HasPrefix(err.Error(), codeVaultLocked) {
		t.Fatalf("esperaba VAULT_LOCKED: %v", err)
	}
	if err := a.VaultUnlock("maestra larga 123"); err != nil {
		t.Fatal(err)
	}
	v, err = a.SaveServer(v.Server, "", true, store.SecretVault)
	if err != nil || v.SecretStore != store.SecretVault || len(kr) != 0 {
		t.Fatalf("mover a bóveda: %+v %v %v", v, err, kr)
	}
	got, _ := a.vault.Get(secrets.SecretName(v.ID))
	if got != "pw" {
		t.Fatalf("contraseña movida = %q", got)
	}
	// Elegir llavero donde no lo hay da error claro.
	b := newTestApp(t, noKeyring{})
	if _, err := b.SaveServer(srvPassword(), "pw", true, store.SecretKeyring); err == nil {
		t.Fatal("aceptó el llavero sin llavero")
	}
}

func TestProyectoDependenciasYAvisos(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	srv, _ := a.SaveServer(srvPassword(), "", false, "")
	// Servidor pequeño: 1 GB de RAM y 20 GB libres.
	_ = a.store.SetLastCheck(srv.ID, store.CheckResult{OK: true, Facts: map[string]string{
		"os": "Ubuntu 24.04", "os_id": "ubuntu", "mem_kb": "1048576", "disk_free_kb": "20971520"}})

	p := store.Project{Name: "Prod", ServerID: srv.ID, Modules: []store.ProjectModule{
		{ID: "coolify", Values: map[string]any{}},
		{ID: "postgres", Values: map[string]any{"postgres_databases": []any{"Mal Nombre"}}},
	}}
	chk := a.CheckProject(p)
	if chk.Errors["postgres"]["postgres_databases"] == "" {
		t.Fatalf("debería marcar el nombre de base: %+v", chk.Errors)
	}
	if strings.Join(chk.Added, ",") != "base,docker,firewall" {
		t.Fatalf("añadidos %v", chk.Added)
	}
	if len(chk.Warnings) < 2 {
		t.Fatalf("faltan avisos de RAM/disco para Coolify: %v", chk.Warnings)
	}
	if _, err := a.SaveProject(p); err == nil {
		t.Fatal("guardó con errores")
	}
	p.Modules[1].Values["postgres_databases"] = []any{"tienda"}
	saved, err := a.SaveProject(p)
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, m := range saved.Modules {
		ids = append(ids, m.ID)
	}
	if strings.Join(ids, ",") != "base,docker,firewall,coolify,postgres" {
		t.Fatalf("módulos guardados %v", ids)
	}
	sc, _, err := a.buildScript(saved, false)
	if err != nil || !strings.Contains(string(sc), "__DRAUPNODE_PAYLOAD__") {
		t.Fatalf("script: %v", err)
	}
	_, _ = a.SaveServer(srv.Server, "pw", true, store.SecretKeyring)
	if err := a.DeleteServer(srv.ID); err == nil {
		t.Fatal("dejó borrar el servidor de un proyecto")
	}
	if v := a.ListServers()[0]; !v.HasSecret {
		t.Fatal("borró la contraseña de un servidor que no se pudo borrar")
	}
}

func TestProyectoVacioYAplicado(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	srv, _ := a.SaveServer(srvPassword(), "", false, "")
	p, err := a.SaveProject(store.Project{Name: "Nuevo", ServerID: srv.ID})
	if err != nil || len(p.Modules) != 0 {
		t.Fatalf("un proyecto nuevo sin módulos debe poder guardarse: %v", err)
	}
	p.Modules = []store.ProjectModule{{ID: "base", Values: map[string]any{}}}
	p, err = a.SaveProject(p)
	if err != nil {
		t.Fatal(err)
	}
	// Una previsualización con cambios pendientes no cuenta como aplicado;
	// una sin nada pendiente, o una aplicación correcta, sí.
	_ = a.store.SetLastRun(p.ID, store.RunSummary{At: time.Now(), Check: true, OK: true, Changed: 3})
	if got, _ := a.store.Project(p.ID); got.AppliedAt != nil {
		t.Fatal("una previsualización con cambios pendientes no es aplicar")
	}
	_ = a.store.SetLastRun(p.ID, store.RunSummary{At: time.Now(), Check: true, OK: true, Changed: 0})
	if got, _ := a.store.Project(p.ID); got.AppliedAt == nil {
		t.Fatal("una previsualización sin nada pendiente confirma que está aplicado")
	}
	_ = a.store.SetLastRun(p.ID, store.RunSummary{At: time.Now().Add(time.Second), OK: true})
	got, _ := a.store.Project(p.ID)
	if got.AppliedAt == nil || got.UpdatedAt.After(*got.AppliedAt) {
		t.Fatal("tras aplicar no debería pedir aplicar otra vez")
	}
	// Guardar lo mismo no cuenta como cambio; cambiar un valor sí.
	same, _ := a.SaveProject(got)
	if !same.UpdatedAt.Equal(got.UpdatedAt) {
		t.Fatal("guardar sin cambios movió la fecha de modificación")
	}
	time.Sleep(1100 * time.Millisecond)
	// Copia de los valores (desde la interfaz llegan siempre nuevos, por JSON).
	vals := map[string]any{}
	for k, v := range same.Modules[0].Values {
		vals[k] = v
	}
	vals["base_swap_mb"] = 0
	same.Modules = []store.ProjectModule{{ID: "base", Values: vals}}
	changed, _ := a.SaveProject(same)
	if !changed.UpdatedAt.After(*changed.AppliedAt) {
		t.Fatal("un cambio debería pedir aplicar otra vez")
	}
}

// La interfaz recorre las listas de la comprobación: nunca deben llegar como null
// (pasaba con «warnings» en un servidor ya comprobado y bloqueaba el editor).
func TestCheckProjectSinNulls(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	srv, _ := a.SaveServer(srvPassword(), "", false, "")
	_ = a.store.SetLastCheck(srv.ID, store.CheckResult{OK: true, Facts: map[string]string{
		"os_id": "ubuntu", "mem_kb": "16777216", "disk_free_kb": "209715200"}})
	for _, mods := range [][]string{{"base"}, {"coolify"}, {}} {
		var pm []store.ProjectModule
		for _, id := range mods {
			pm = append(pm, store.ProjectModule{ID: id, Values: map[string]any{}})
		}
		b, _ := json.Marshal(a.CheckProject(store.Project{Name: "x", ServerID: srv.ID, Modules: pm}))
		if strings.Contains(string(b), "null") {
			t.Fatalf("%v: hay un null en %s", mods, b)
		}
	}
	m, _ := a.cat().Get("coolify")
	if fmt.Sprint(m.FirewallPorts) != "[8000 6001 6002]" {
		t.Fatalf("Coolify debe declarar sus puertos: %v", m.FirewallPorts)
	}
}

func TestPuertosRepetidos(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	p := store.Project{Name: "x", Modules: []store.ProjectModule{
		{ID: "monitoring", Values: map[string]any{}},
		{ID: "forgejo", Values: map[string]any{"forgejo_port": 3000}},
	}}
	c := a.CheckProject(p)
	// El aviso va en el que se resuelve el segundo (cualquiera de los dos).
	if !strings.Contains(c.Errors["forgejo"]["forgejo_port"]+c.Errors["monitoring"]["monitoring_grafana_port"], "puerto 3000 ") {
		t.Fatalf("no avisa del 3000 repetido: %+v", c.Errors)
	}
	p.Modules[1].Values["forgejo_port"] = 3001
	if c := a.CheckProject(p); len(c.Errors["forgejo"])+len(c.Errors["monitoring"]) > 0 {
		t.Fatalf("con otro puerto no debería quejarse: %+v", c.Errors)
	}
	// Coolify ocupa el 8000 (fijo): una app en el 8000 choca.
	p.Modules = []store.ProjectModule{{ID: "coolify", Values: map[string]any{"coolify_admin_email": "a@example.com"}}, {ID: "backup-target", Values: map[string]any{}}}
	if c := a.CheckProject(p); !strings.Contains(c.Errors["backup-target"]["backup_target_port"]+strings.Join(c.General, " "), "8000") {
		t.Fatalf("coolify y destino de copias en el 8000: %+v %v", c.Errors, c.General)
	}
}
