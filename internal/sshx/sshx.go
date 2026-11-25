// Package sshx abre conexiones SSH con clave privada (con o sin frase de paso)
// o con ssh-agent, y verifica la huella del servidor (known_hosts).
package sshx

import (
	"context"
	"crypto/ed25519"
	"draupnode/internal/i18n"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
	"golang.org/x/crypto/ssh/knownhosts"
)

// Target describe a qué conectarse y cómo autenticarse.
type Target struct {
	Host       string
	Port       int
	User       string
	AuthMethod string // "key" | "password" | "agent"
	KeyPath    string
	// Secret es la frase de paso de la clave (AuthMethod "key") o la
	// contraseña del usuario (AuthMethod "password").
	Secret string
	// AcceptFingerprint: si el servidor es desconocido y presenta exactamente
	// esta huella (SHA256:...), se confía en él y se guarda en TrustFile.
	AcceptFingerprint string
}

// HostKeys indica dónde buscar huellas conocidas y dónde guardar las nuevas.
type HostKeys struct {
	// Ficheros que se leen (p. ej. ~/.ssh/known_hosts y el propio de Draupnode).
	Files []string
	// Fichero propio de Draupnode donde se añaden las huellas aceptadas.
	TrustFile string
}

// ErrPassphraseNeeded: la clave está cifrada y no se ha dado frase de paso.
var ErrPassphraseNeeded = i18n.Err("la clave privada está protegida con contraseña")

// ErrBadPassphrase: la frase de paso no descifra la clave.
var ErrBadPassphrase = i18n.Err("la contraseña de la clave no es correcta")

// ErrPasswordNeeded: se entra con usuario y contraseña y no se ha dado.
var ErrPasswordNeeded = i18n.Err("falta la contraseña del usuario")

// ErrBadPassword: el servidor rechazó el usuario o la contraseña.
var ErrBadPassword = i18n.Err("el servidor rechazó el usuario o la contraseña")

// UnknownHostError: el servidor no está en known_hosts; hay que confirmar su huella.
type UnknownHostError struct {
	Host        string
	KeyType     string
	Fingerprint string
}

func (e *UnknownHostError) Error() string {
	return i18n.Sprintf("servidor desconocido %s (%s %s)", e.Host, e.KeyType, e.Fingerprint)
}

// HostKeyChangedError: la huella NO coincide con la guardada. Puede ser una
// reinstalación del servidor... o un ataque (man-in-the-middle). No se conecta.
type HostKeyChangedError struct {
	Host        string
	Fingerprint string
	File        string
	Line        int
}

func (e *HostKeyChangedError) Error() string {
	return i18n.Sprintf("¡la huella de %s ha CAMBIADO! (ahora %s; guardada en %s:%d). "+
		"Si has reinstalado el servidor, borra esa línea; si no, podría ser un ataque",
		e.Host, e.Fingerprint, e.File, e.Line)
}

// ExpandHome sustituye un «~» inicial por el directorio del usuario.
func ExpandHome(p string) string {
	if p == "~" || strings.HasPrefix(p, "~/") || strings.HasPrefix(p, `~\`) {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, p[1:])
		}
	}
	return p
}

func authMethods(t Target) ([]ssh.AuthMethod, func(), error) {
	switch t.AuthMethod {
	case "agent":
		sock := os.Getenv("SSH_AUTH_SOCK")
		if sock == "" {
			return nil, nil, i18n.New("no hay ssh-agent activo (SSH_AUTH_SOCK vacío)")
		}
		conn, err := net.Dial("unix", sock)
		if err != nil {
			return nil, nil, i18n.Errorf("no se pudo abrir el ssh-agent: %w", err)
		}
		ag := agent.NewClient(conn)
		return []ssh.AuthMethod{ssh.PublicKeysCallback(ag.Signers)}, func() { conn.Close() }, nil
	case "password":
		if t.Secret == "" {
			return nil, nil, ErrPasswordNeeded
		}
		pass := t.Secret
		// Muchos servidores piden la contraseña como «keyboard-interactive».
		ki := ssh.KeyboardInteractive(func(_, _ string, qs []string, echos []bool) ([]string, error) {
			ans := make([]string, len(qs))
			for i := range qs {
				if !echos[i] {
					ans[i] = pass
				}
			}
			return ans, nil
		})
		return []ssh.AuthMethod{ssh.Password(pass), ki}, func() {}, nil
	default:
		signer, err := LoadSigner(t.KeyPath, t.Secret)
		if err != nil {
			return nil, nil, err
		}
		return []ssh.AuthMethod{ssh.PublicKeys(signer)}, func() {}, nil
	}
}

var (
	dummyOnce sync.Once
	dummyKey  ssh.PublicKey
)

// knownAlgorithms devuelve los tipos de clave que ya conocemos para ese host,
// para pedirle al servidor precisamente esos y no confundir «otro tipo de
// clave» con «clave cambiada».
func knownAlgorithms(cb ssh.HostKeyCallback, addr string) []string {
	dummyOnce.Do(func() {
		pub, _, _ := ed25519.GenerateKey(nil)
		dummyKey, _ = ssh.NewPublicKey(pub)
	})
	fake := &net.TCPAddr{IP: net.IPv4(0, 0, 0, 0), Port: 0}
	var ke *knownhosts.KeyError
	if err := cb(addr, fake, dummyKey); !errors.As(err, &ke) {
		return nil
	}
	seen := map[string]bool{}
	var algos []string
	add := func(a string) {
		if !seen[a] {
			seen[a] = true
			algos = append(algos, a)
		}
	}
	for _, w := range ke.Want {
		if w.Key.Type() == ssh.KeyAlgoRSA {
			add(ssh.KeyAlgoRSASHA512)
			add(ssh.KeyAlgoRSASHA256)
		}
		add(w.Key.Type())
	}
	return algos
}

func hostKeyCallback(t Target, hk HostKeys, addr string) (ssh.HostKeyCallback, []string, error) {
	var files []string
	for _, f := range hk.Files {
		if _, err := os.Stat(f); err == nil {
			files = append(files, f)
		}
	}
	var known ssh.HostKeyCallback
	var algos []string
	if len(files) > 0 {
		cb, err := knownhosts.New(files...)
		if err != nil {
			return nil, nil, fmt.Errorf("known_hosts ilegible: %w", err)
		}
		known = cb
		algos = knownAlgorithms(cb, addr)
	}
	cb := func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		fp := ssh.FingerprintSHA256(key)
		if known != nil {
			err := known(hostname, remote, key)
			if err == nil {
				return nil
			}
			var ke *knownhosts.KeyError
			if !errors.As(err, &ke) {
				return err
			}
			if len(ke.Want) > 0 {
				return &HostKeyChangedError{Host: hostname, Fingerprint: fp,
					File: ke.Want[0].Filename, Line: ke.Want[0].Line}
			}
		}
		if t.AcceptFingerprint != "" && t.AcceptFingerprint == fp {
			return appendKnownHost(hk.TrustFile, hostname, key)
		}
		return &UnknownHostError{Host: hostname, KeyType: key.Type(), Fingerprint: fp}
	}
	return cb, algos, nil
}

func appendKnownHost(file, hostname string, key ssh.PublicKey) error {
	if file == "" {
		return i18n.New("no hay fichero donde guardar la huella")
	}
	if err := os.MkdirAll(filepath.Dir(file), 0o700); err != nil {
		return err
	}
	f, err := os.OpenFile(file, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = fmt.Fprintln(f, knownhosts.Line([]string{knownhosts.Normalize(hostname)}, key))
	return err
}

// Dial conecta y autentica. El llamador debe cerrar el cliente.
func Dial(ctx context.Context, t Target, hk HostKeys) (*ssh.Client, error) {
	if t.Port == 0 {
		t.Port = 22
	}
	addr := net.JoinHostPort(t.Host, strconv.Itoa(t.Port))
	auths, closeAuth, err := authMethods(t)
	if err != nil {
		return nil, err
	}
	defer closeAuth()
	cb, algos, err := hostKeyCallback(t, hk, addr)
	if err != nil {
		return nil, err
	}
	cfg := &ssh.ClientConfig{
		User:              t.User,
		Auth:              auths,
		HostKeyCallback:   cb,
		HostKeyAlgorithms: algos,
		Timeout:           15 * time.Second,
	}
	d := net.Dialer{Timeout: 15 * time.Second}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, i18n.Errorf("no se pudo conectar a %s: %w", addr, err)
	}
	if dl, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(dl)
	}
	c, chans, reqs, err := ssh.NewClientConn(conn, addr, cfg)
	if err != nil {
		conn.Close()
		var uh *UnknownHostError
		var hc *HostKeyChangedError
		switch {
		case errors.As(err, &uh):
			return nil, uh
		case errors.As(err, &hc):
			return nil, hc
		case strings.Contains(err.Error(), "unable to authenticate") && t.AuthMethod == "password":
			return nil, ErrBadPassword
		case strings.Contains(err.Error(), "unable to authenticate"):
			return nil, i18n.Errorf("el servidor rechazó la clave para el usuario %q", t.User)
		}
		return nil, i18n.Errorf("fallo en la conexión SSH: %w", err)
	}
	_ = conn.SetDeadline(time.Time{})
	return ssh.NewClient(c, chans, reqs), nil
}

// Output ejecuta un comando y devuelve su salida estándar.
func Output(ctx context.Context, c *ssh.Client, cmd string) (string, error) {
	sess, err := c.NewSession()
	if err != nil {
		return "", err
	}
	defer sess.Close()
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			_ = sess.Close()
		case <-done:
		}
	}()
	out, err := sess.Output(cmd)
	if ctx.Err() != nil {
		return string(out), ctx.Err()
	}
	return string(out), err
}

// TrustHostKey guarda en el known_hosts propio la clave de host:puerto,
// sustituyendo la que hubiera para esa misma dirección. Solo para servidores
// cuya clave conocemos de antemano (el servidor de pruebas de Draupnode).
func TrustHostKey(file, host string, port int, key ssh.PublicKey) error {
	addr := knownhosts.Normalize(net.JoinHostPort(host, strconv.Itoa(port)))
	line := knownhosts.Line([]string{addr}, key)
	raw, err := os.ReadFile(file)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	var keep []string
	for _, l := range strings.Split(string(raw), "\n") {
		t := strings.TrimSpace(l)
		if t == "" || strings.HasPrefix(t, addr+" ") {
			continue
		}
		keep = append(keep, l)
	}
	keep = append(keep, line)
	if err := os.MkdirAll(filepath.Dir(file), 0o700); err != nil {
		return err
	}
	return os.WriteFile(file, []byte(strings.Join(keep, "\n")+"\n"), 0o600)
}
