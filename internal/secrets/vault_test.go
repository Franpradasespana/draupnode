package secrets

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func fastVault(t *testing.T) (*Vault, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "vault.json")
	v, err := OpenVault(path)
	if err != nil {
		t.Fatal(err)
	}
	v.time, v.memory, v.threads = 1, 1024, 1 // rápido en tests
	return v, path
}

func TestBoveda(t *testing.T) {
	v, path := fastVault(t)
	if _, err := v.Get("x"); !errors.Is(err, ErrNoVault) {
		t.Fatalf("sin crear: %v", err)
	}
	if err := v.Create("corta"); err == nil {
		t.Fatal("aceptó una maestra corta")
	}
	if err := v.Create("una maestra larga"); err != nil {
		t.Fatal(err)
	}
	if err := v.Set("ssh-secret:1", "frase súper secreta"); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(path)
	if strings.Contains(string(raw), "súper") {
		t.Fatal("el secreto está en claro en el fichero")
	}
	if info, _ := os.Stat(path); info.Mode().Perm() != 0o600 {
		t.Fatalf("permisos %v", info.Mode().Perm())
	}

	// Reabrir: bloqueada hasta dar la maestra.
	v2, err := OpenVault(path)
	if err != nil {
		t.Fatal(err)
	}
	if !v2.Has("ssh-secret:1") || v2.Status().Unlocked {
		t.Fatal("Has/estado tras reabrir")
	}
	if _, err := v2.Get("ssh-secret:1"); !errors.Is(err, ErrLocked) {
		t.Fatalf("bloqueada: %v", err)
	}
	if err := v2.Unlock("otra maestra distinta"); !errors.Is(err, ErrWrongMaster) {
		t.Fatalf("maestra mala: %v", err)
	}
	if err := v2.Unlock("una maestra larga"); err != nil {
		t.Fatal(err)
	}
	got, err := v2.Get("ssh-secret:1")
	if err != nil || got != "frase súper secreta" {
		t.Fatalf("Get = %q, %v", got, err)
	}

	// Mover un secreto cifrado a otro nombre no debe descifrar (dato asociado).
	v2.f.Entries["ssh-secret:2"] = v2.f.Entries["ssh-secret:1"]
	if _, err := v2.Get("ssh-secret:2"); err == nil {
		t.Fatal("descifró un secreto movido de entrada")
	}

	v2.Lock()
	if _, err := v2.Get("ssh-secret:1"); !errors.Is(err, ErrLocked) {
		t.Fatal("Lock no bloqueó")
	}
	if err := v2.Delete("ssh-secret:1"); err != nil || v2.Has("ssh-secret:1") {
		t.Fatal("Delete con la bóveda bloqueada")
	}
}

func TestSugerenciasLlavero(t *testing.T) {
	apt := func(n string) bool { return n == "apt-get" }
	s := KeyringSuggestions("linux", apt)
	if len(s) != 3 || s[0].Command != "sudo apt install -y gnome-keyring libsecret-1-0 seahorse" {
		t.Fatalf("%+v", s)
	}
	dnf := func(n string) bool { return n == "dnf" }
	if s := KeyringSuggestions("linux", dnf); s[1].Command != "sudo dnf install -y kwalletmanager5" {
		t.Fatalf("%+v", s)
	}
	none := func(string) bool { return false }
	if s := KeyringSuggestions("linux", none); s[0].Command != "" {
		t.Fatalf("sin gestor de paquetes no debe inventar comando: %+v", s)
	}
	if s := KeyringSuggestions("windows", none); len(s) != 2 || s[1].Command == "" {
		t.Fatalf("%+v", s)
	}
	if s := KeyringSuggestions("darwin", none); len(s) != 2 {
		t.Fatalf("%+v", s)
	}
}
