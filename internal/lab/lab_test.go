package lab

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/crypto/ssh"
)

func TestClaves(t *testing.T) {
	l := New(filepath.Join(t.TempDir(), "prueba"))
	keys, err := l.Keys()
	if err != nil || len(keys) < 2 {
		t.Fatalf("%v %v", keys, err)
	}
	raw, _ := os.ReadFile(keys[0].Path)
	if _, err := ssh.ParsePrivateKey(raw); err != nil {
		t.Fatalf("la clave sin contraseña no abre: %v", err)
	}
	raw, _ = os.ReadFile(keys[1].Path)
	if _, err := ssh.ParsePrivateKey(raw); err == nil {
		t.Fatal("la clave «con frase» abre sin contraseña")
	}
	if _, err := ssh.ParsePrivateKeyWithPassphrase(raw, []byte(Password)); err != nil {
		t.Fatalf("la clave con frase no abre con %q: %v", Password, err)
	}
	if info, _ := os.Stat(keys[0].Path); info.Mode().Perm() != 0o600 {
		t.Fatal("permisos de la clave")
	}
	hk, err := l.HostKey()
	if err != nil || hk.Type() != "ssh-ed25519" {
		t.Fatalf("host key: %v", err)
	}
	// Segunda llamada: no regenera.
	before, _ := os.ReadFile(keys[0].Path)
	l.Keys()
	after, _ := os.ReadFile(keys[0].Path)
	if string(before) != string(after) {
		t.Fatal("regeneró una clave existente")
	}
}

func TestClasificarErrores(t *testing.T) {
	for out, want := range map[string]string{
		"permission denied while trying to connect to the docker API at unix:///var/run/docker.sock":        ProblemPermission,
		"Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?": ProblemDaemon,
		"error during connect: this error may indicate that the docker daemon is not running":               ProblemDaemon,
		"algo raro": ProblemOther,
	} {
		if got, _ := classify(out); got != want {
			t.Fatalf("%q → %s, quería %s", out, got, want)
		}
	}
}

func TestComandoInstalacion(t *testing.T) {
	apt := func(n string) bool { return n == "apt-get" }
	c := linuxInstallCommand(apt, "usuario")
	if !strings.Contains(c, "apt-get install -y docker.io") || !strings.HasSuffix(c, "usermod -aG docker usuario") {
		t.Fatal(c)
	}
	if linuxInstallCommand(func(string) bool { return false }, "usuario") != "" {
		t.Fatal("inventó un comando")
	}
	if shellQuote("a'b") != `'a'\''b'` {
		t.Fatal(shellQuote("a'b"))
	}
}

func TestEstadoServidor(t *testing.T) {
	l := New(t.TempDir())
	l.docker = []string{"docker"}
	var got []string
	l.run = func(_ context.Context, _ []byte, out func(string), name string, args ...string) error {
		got = append(got, name+" "+strings.Join(args, " "))
		out("true|2026-11-19T21:00:00Z")
		return nil
	}
	st := l.Server(context.Background())
	if !st.Exists || !st.Running || st.StartedAt == "" {
		t.Fatalf("%+v", st)
	}
	if !strings.Contains(got[0], "inspect") || !strings.HasSuffix(got[0], Container) {
		t.Fatal(got)
	}
	// Con «sg docker» se pasa todo como un único comando entrecomillado.
	l.docker = []string{"sg", "docker", "-c"}
	got = nil
	l.Server(context.Background())
	if !strings.HasPrefix(got[0], "sg docker -c docker 'container' 'inspect'") {
		t.Fatal(got)
	}
}
