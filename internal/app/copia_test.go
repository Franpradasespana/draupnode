package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

func TestCopiaDeDraupnode(t *testing.T) {
	krA := secrets.Memory{}
	a := newTestApp(t, krA)
	keyDir := t.TempDir()
	key := filepath.Join(keyDir, "id_prueba")
	os.WriteFile(key, []byte("-----BEGIN OPENSSH PRIVATE KEY-----\nfalsa\n"), 0o600)
	os.WriteFile(key+".pub", []byte("ssh-ed25519 AAAA prueba"), 0o644)
	s, err := a.store.SaveServer(store.Server{Name: "web", Host: "203.0.113.10", Port: 22, User: "root", AuthMethod: store.AuthKey, KeyPath: key, KeyEncrypted: true})
	if err != nil {
		t.Fatal(err)
	}
	s.SecretStore = "keyring"
	a.store.SaveServer(s)
	krA.Set(secrets.SecretName(s.ID), "frase de la clave")
	a.vault.Create("maestra-de-prueba")
	a.vault.Set("proj:x:gen:db", "contraseña-db")
	a.SaveRecipe(store.Recipe{Name: "Tienda", Modules: []store.ProjectModule{{ID: "docker", Values: map[string]any{}}}})
	os.MkdirAll(filepath.Join(a.userModulesDir(), "mio"), 0o700)
	os.WriteFile(filepath.Join(a.userModulesDir(), "mio", "module.yaml"), []byte("id: mio\n"), 0o600)

	if _, err := a.buildBackup("corta", true); err == nil {
		t.Fatal("contraseña corta")
	}
	data, err := a.buildBackup("contraseña de la copia", true)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "frase de la clave") || strings.Contains(string(data), "203.0.113.10") {
		t.Fatal("datos en claro en la copia")
	}
	file := filepath.Join(t.TempDir(), "copia.draupnode")
	os.WriteFile(file, data, 0o600)

	// Otro equipo, sin la clave en su sitio.
	os.Remove(key)
	krB := secrets.Memory{}
	b := newTestApp(t, krB)
	b.store.SaveServer(store.Server{Name: "viejo", Host: "203.0.113.99", User: "root", AuthMethod: store.AuthPassword})
	if _, err := b.InspectBackup(file, "otra contraseña larga"); err == nil {
		t.Fatal("contraseña mala")
	}
	m, err := b.InspectBackup(file, "contraseña de la copia")
	if err != nil || m.Servers != 1 || m.Templates != 1 || m.Keyring != 1 || m.Modules != 1 || len(m.Keys) != 1 || m.VaultEntries != 1 {
		t.Fatalf("manifiesto: %+v %v", m, err)
	}
	res, err := b.ImportBackup(file, "contraseña de la copia")
	if err != nil {
		t.Fatal(err)
	}
	srvs := b.store.Servers()
	if len(srvs) != 1 || srvs[0].Name != "web" {
		t.Fatalf("servidores: %+v", srvs)
	}
	if !strings.HasPrefix(srvs[0].KeyPath, b.store.Dir()) {
		t.Fatalf("la clave debería estar en la carpeta de Draupnode: %s", srvs[0].KeyPath)
	}
	if kb, _ := os.ReadFile(srvs[0].KeyPath); !strings.Contains(string(kb), "falsa") {
		t.Fatal("clave no restaurada")
	}
	if v, _ := krB.Get(secrets.SecretName(s.ID)); v != "frase de la clave" {
		t.Fatal("frase del llavero no restaurada")
	}
	if err := b.vault.Unlock("maestra-de-prueba"); err != nil {
		t.Fatal(err)
	}
	if v, _ := b.vault.Get("proj:x:gen:db"); v != "contraseña-db" {
		t.Fatal("bóveda no restaurada")
	}
	if _, err := os.Stat(filepath.Join(b.userModulesDir(), "mio", "module.yaml")); err != nil {
		t.Fatal("módulo propio no restaurado")
	}
	if _, err := os.Stat(filepath.Join(res.Safety, "draupnode.json")); err != nil {
		t.Fatal("no guardó lo de antes")
	}
	if len(b.store.Recipes()) != 1 {
		t.Fatal("plantillas")
	}
}
