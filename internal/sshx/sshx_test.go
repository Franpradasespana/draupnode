package sshx

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/pem"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

// servidor SSH mínimo en memoria: acepta una clave y responde a «exec»
// con una salida fija.
func startServer(t *testing.T, allowed ssh.PublicKey, output string) (host string, port int, hostKey ssh.PublicKey) {
	return startServerPw(t, allowed, "", output)
}

func startServerPw(t *testing.T, allowed ssh.PublicKey, password, output string) (host string, port int, hostKey ssh.PublicKey) {
	t.Helper()
	_, hpriv, _ := ed25519.GenerateKey(nil)
	hsigner, _ := ssh.NewSignerFromKey(hpriv)
	cfg := &ssh.ServerConfig{
		PublicKeyCallback: func(_ ssh.ConnMetadata, k ssh.PublicKey) (*ssh.Permissions, error) {
			if allowed != nil && bytes.Equal(k.Marshal(), allowed.Marshal()) {
				return nil, nil
			}
			return nil, errors.New("clave no autorizada")
		},
	}
	if password != "" {
		cfg.PasswordCallback = func(_ ssh.ConnMetadata, p []byte) (*ssh.Permissions, error) {
			if string(p) == password {
				return nil, nil
			}
			return nil, errors.New("contraseña incorrecta")
		}
	}
	cfg.AddHostKey(hsigner)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			nc, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				_, chans, reqs, err := ssh.NewServerConn(nc, cfg)
				if err != nil {
					return
				}
				go ssh.DiscardRequests(reqs)
				for nch := range chans {
					ch, creqs, _ := nch.Accept()
					go func() {
						for r := range creqs {
							if r.Type == "exec" {
								r.Reply(true, nil)
								ch.Write([]byte(output))
								ch.SendRequest("exit-status", false, ssh.Marshal(struct{ C uint32 }{0}))
								ch.Close()
								return
							}
							r.Reply(false, nil)
						}
					}()
				}
			}()
		}
	}()
	a := ln.Addr().(*net.TCPAddr)
	return "127.0.0.1", a.Port, hsigner.PublicKey()
}

func writeKey(t *testing.T, dir, passphrase string) (string, ssh.PublicKey) {
	t.Helper()
	pub, priv, _ := ed25519.GenerateKey(nil)
	var block *pem.Block
	var err error
	if passphrase == "" {
		block, err = ssh.MarshalPrivateKey(priv, "test")
	} else {
		block, err = ssh.MarshalPrivateKeyWithPassphrase(priv, "test", []byte(passphrase))
	}
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "id_test")
	if err := os.WriteFile(path, pem.EncodeToMemory(block), 0o600); err != nil {
		t.Fatal(err)
	}
	sp, _ := ssh.NewPublicKey(pub)
	return path, sp
}

func TestDialConFraseDePasoYHuella(t *testing.T) {
	dir := t.TempDir()
	keyPath, pub := writeKey(t, dir, "secreto")
	host, port, hostKey := startServer(t, pub, "os=Ubuntu 24.04\nsudo=yes\nbasura\n")
	hk := HostKeys{Files: []string{filepath.Join(dir, "known_hosts")}, TrustFile: filepath.Join(dir, "known_hosts")}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tg := Target{Host: host, Port: port, User: "ubuntu", AuthMethod: "key", KeyPath: keyPath}

	if ki, err := InspectKey(keyPath); err != nil || !ki.Encrypted || ki.Format != FormatOpenSSH {
		t.Fatalf("InspectKey = %+v, %v", ki, err)
	}
	if _, err := Dial(ctx, tg, hk); !errors.Is(err, ErrPassphraseNeeded) {
		t.Fatalf("sin frase: %v", err)
	}
	tg.Secret = "mala"
	if _, err := Dial(ctx, tg, hk); !errors.Is(err, ErrBadPassphrase) {
		t.Fatalf("frase mala: %v", err)
	}

	// Frase correcta, pero el servidor aún es desconocido.
	tg.Secret = "secreto"
	_, err := Dial(ctx, tg, hk)
	var uh *UnknownHostError
	if !errors.As(err, &uh) {
		t.Fatalf("esperaba UnknownHostError, llegó %v", err)
	}
	if uh.Fingerprint != ssh.FingerprintSHA256(hostKey) {
		t.Fatalf("huella %s != %s", uh.Fingerprint, ssh.FingerprintSHA256(hostKey))
	}

	// Una huella distinta no se acepta.
	tg.AcceptFingerprint = "SHA256:otra"
	if _, err := Dial(ctx, tg, hk); !errors.As(err, &uh) {
		t.Fatalf("huella equivocada aceptada: %v", err)
	}

	// Aceptar la huella correcta la guarda y conecta.
	tg.AcceptFingerprint = uh.Fingerprint
	c, err := Dial(ctx, tg, hk)
	if err != nil {
		t.Fatalf("conectar aceptando huella: %v", err)
	}
	facts, err := Probe(ctx, c)
	c.Close()
	if err != nil || facts["os"] != "Ubuntu 24.04" || facts["sudo"] != "yes" {
		t.Fatalf("probe = %v, %v", facts, err)
	}

	// La segunda vez ya es conocido, sin aceptar nada.
	tg.AcceptFingerprint = ""
	c, err = Dial(ctx, tg, hk)
	if err != nil {
		t.Fatalf("segunda conexión: %v", err)
	}
	c.Close()
}

func TestHuellaCambiada(t *testing.T) {
	dir := t.TempDir()
	keyPath, pub := writeKey(t, dir, "")
	host, port, _ := startServer(t, pub, "")
	// known_hosts con OTRA clave para ese host:puerto.
	otherPub, _, _ := ed25519.GenerateKey(nil)
	other, _ := ssh.NewPublicKey(otherPub)
	kh := filepath.Join(dir, "known_hosts")
	if err := appendKnownHost(kh, net.JoinHostPort(host, strconv.Itoa(port)), other); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := Dial(ctx, Target{Host: host, Port: port, User: "u", KeyPath: keyPath},
		HostKeys{Files: []string{kh}, TrustFile: kh})
	var hc *HostKeyChangedError
	if !errors.As(err, &hc) {
		t.Fatalf("esperaba HostKeyChangedError, llegó %v", err)
	}
}

func TestClaveRechazada(t *testing.T) {
	dir := t.TempDir()
	keyPath, _ := writeKey(t, dir, "")
	otherPub, _, _ := ed25519.GenerateKey(nil)
	other, _ := ssh.NewPublicKey(otherPub)
	host, port, hostKey := startServer(t, other, "")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := Dial(ctx, Target{Host: host, Port: port, User: "u", KeyPath: keyPath,
		AcceptFingerprint: ssh.FingerprintSHA256(hostKey)},
		HostKeys{TrustFile: filepath.Join(dir, "kh")})
	if err == nil || err.Error() != `el servidor rechazó la clave para el usuario "u"` {
		t.Fatalf("err = %v", err)
	}
}

func TestParseFacts(t *testing.T) {
	f := ParseFacts("os=Ubuntu 24.04 LTS\nmal formado\n clave con espacio=x\nmem_kb=1024\n")
	if f["os"] != "Ubuntu 24.04 LTS" || f["mem_kb"] != "1024" || len(f) != 2 {
		t.Fatalf("%v", f)
	}
}

func TestUsuarioYContrasena(t *testing.T) {
	dir := t.TempDir()
	host, port, hostKey := startServerPw(t, nil, "s3creta", "os=Debian\n")
	hk := HostKeys{TrustFile: filepath.Join(dir, "kh")}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tg := Target{Host: host, Port: port, User: "root", AuthMethod: "password",
		AcceptFingerprint: ssh.FingerprintSHA256(hostKey)}
	if _, err := Dial(ctx, tg, hk); !errors.Is(err, ErrPasswordNeeded) {
		t.Fatalf("sin contraseña: %v", err)
	}
	tg.Secret = "mala"
	if _, err := Dial(ctx, tg, hk); !errors.Is(err, ErrBadPassword) {
		t.Fatalf("contraseña mala: %v", err)
	}
	tg.Secret = "s3creta"
	c, err := Dial(ctx, tg, hk)
	if err != nil {
		t.Fatalf("contraseña buena: %v", err)
	}
	c.Close()
}

func TestClavesPuTTY(t *testing.T) {
	cases := []struct {
		file      string
		encrypted bool
		keyType   string
	}{
		{"testdata/ed25519_v3_pass.ppk", true, "ssh-ed25519"},
		{"testdata/ed25519_v3_nopass.ppk", false, "ssh-ed25519"},
		{"testdata/rsa_v2_pass.ppk", true, "ssh-rsa"},
	}
	for _, c := range cases {
		ki, err := InspectKey(c.file)
		if err != nil || ki.Format != FormatPPK || ki.Encrypted != c.encrypted || ki.KeyType != c.keyType {
			t.Fatalf("%s: %+v %v", c.file, ki, err)
		}
		if c.encrypted {
			if _, err := LoadSigner(c.file, ""); !errors.Is(err, ErrPassphraseNeeded) {
				t.Fatalf("%s sin frase: %v", c.file, err)
			}
			if _, err := LoadSigner(c.file, "mala"); !errors.Is(err, ErrBadPassphrase) {
				t.Fatalf("%s frase mala: %v", c.file, err)
			}
		}
		s, err := LoadSigner(c.file, "testkey")
		if err != nil || s.PublicKey().Type() != c.keyType {
			t.Fatalf("%s: %v", c.file, err)
		}
	}

	// Conectar de verdad con una .ppk cifrada.
	signer, _ := LoadSigner("testdata/ed25519_v3_pass.ppk", "testkey")
	host, port, hostKey := startServer(t, signer.PublicKey(), "os=Ubuntu\n")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	c, err := Dial(ctx, Target{Host: host, Port: port, User: "u", KeyPath: "testdata/ed25519_v3_pass.ppk",
		Secret: "testkey", AcceptFingerprint: ssh.FingerprintSHA256(hostKey)},
		HostKeys{TrustFile: filepath.Join(t.TempDir(), "kh")})
	if err != nil {
		t.Fatalf("conectar con .ppk: %v", err)
	}
	c.Close()
}

func TestClavePublicaRechazada(t *testing.T) {
	p := filepath.Join(t.TempDir(), "id.pub")
	os.WriteFile(p, []byte("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI test\n"), 0o600)
	if _, err := InspectKey(p); err == nil || !strings.Contains(err.Error(), "PÚBLICA") {
		t.Fatalf("err = %v", err)
	}
}

func TestSSHConfig(t *testing.T) {
	cfg := `
# comentario
Host oracle prod
    HostName 203.0.113.10
    User ubuntu
    IdentityFile "~/claves/servidor.key"
Host *.interno
    User admin
Host casa
    Port=2222
Match host x
    User nadie
`
	hosts := parseSSHConfig(strings.NewReader(cfg))
	if len(hosts) != 3 {
		t.Fatalf("%+v", hosts)
	}
	o := hosts[0]
	if o.Alias != "oracle" || o.HostName != "203.0.113.10" || o.User != "ubuntu" || o.Port != 22 || o.IdentityFile != "~/claves/servidor.key" {
		t.Fatalf("oracle: %+v", o)
	}
	if hosts[1].Alias != "prod" || hosts[1].HostName != "203.0.113.10" {
		t.Fatalf("prod: %+v", hosts[1])
	}
	if c := hosts[2]; c.Alias != "casa" || c.HostName != "casa" || c.Port != 2222 || c.User != "" {
		t.Fatalf("casa: %+v", c)
	}
}

func TestTrustHostKey(t *testing.T) {
	dir := t.TempDir()
	kh := filepath.Join(dir, "known_hosts")
	keyPath, pub := writeKey(t, dir, "")
	host, port, hostKey := startServer(t, pub, "os=x\n")
	otherPub, _, _ := ed25519.GenerateKey(nil)
	other, _ := ssh.NewPublicKey(otherPub)
	os.WriteFile(kh, []byte(knownhosts.Line([]string{"otra.maquina"}, other)+"\n"), 0o600)
	// Una clave vieja para la misma dirección se sustituye.
	oldPub, _, _ := ed25519.GenerateKey(nil)
	old, _ := ssh.NewPublicKey(oldPub)
	if err := TrustHostKey(kh, host, port, old); err != nil {
		t.Fatal(err)
	}
	if err := TrustHostKey(kh, host, port, hostKey); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(kh)
	if !strings.Contains(string(raw), "otra.maquina") || strings.Count(string(raw), "\n") != 2 {
		t.Fatalf("known_hosts:\n%s", raw)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	c, err := Dial(ctx, Target{Host: host, Port: port, User: "u", KeyPath: keyPath}, HostKeys{Files: []string{kh}, TrustFile: kh})
	if err != nil {
		t.Fatalf("debería conectar sin preguntar: %v", err)
	}
	c.Close()
}
