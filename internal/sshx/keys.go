package sshx

import (
	"bufio"
	"bytes"
	"crypto/ed25519"
	"crypto/x509"
	"draupnode/internal/i18n"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/kayrus/putty"
	"golang.org/x/crypto/ssh"
)

// Formatos de clave privada admitidos.
const (
	FormatOpenSSH = "openssh" // -----BEGIN OPENSSH PRIVATE KEY-----
	FormatPEM     = "pem"     // -----BEGIN RSA/EC/DSA PRIVATE KEY----- y PKCS#8 (.key de Oracle)
	FormatPPK     = "ppk"     // PuTTY-User-Key-File-2/3
)

// KeyInfo describe un fichero de clave privada.
type KeyInfo struct {
	Path      string `json:"path"`
	Name      string `json:"name"`
	Format    string `json:"format"`
	KeyType   string `json:"keyType,omitempty"`
	Encrypted bool   `json:"encrypted"`
	Comment   string `json:"comment,omitempty"`
	// De dónde salió en la búsqueda: "ssh-dir" o "ssh-config".
	Source string `json:"source,omitempty"`
}

func isPPK(raw []byte) bool { return bytes.HasPrefix(raw, []byte("PuTTY-User-Key-File-")) }

func looksLikePrivateKey(raw []byte) bool {
	return isPPK(raw) || bytes.Contains(raw, []byte("PRIVATE KEY-----"))
}

// InspectKey lee un fichero de clave sin necesitar la frase de paso.
func InspectKey(path string) (KeyInfo, error) {
	path = ExpandHome(path)
	info := KeyInfo{Path: path, Name: filepath.Base(path)}
	raw, err := os.ReadFile(path)
	if err != nil {
		return info, i18n.Errorf("no se puede leer la clave: %w", err)
	}
	if isPPK(raw) {
		k, err := putty.New(raw)
		if err != nil {
			return info, i18n.Errorf("fichero .ppk no válido: %w", err)
		}
		info.Format, info.KeyType, info.Comment = FormatPPK, k.Algo, k.Comment
		info.Encrypted = k.Encryption != "none"
		if k.Version < 2 {
			return info, i18n.New("formato PuTTY v1 no soportado: conviértelo con PuTTYgen")
		}
		return info, nil
	}
	if !looksLikePrivateKey(raw) {
		if bytes.HasPrefix(bytes.TrimSpace(raw), []byte("ssh-")) || bytes.HasPrefix(bytes.TrimSpace(raw), []byte("ecdsa-")) {
			return info, i18n.New("eso es una clave PÚBLICA (.pub); elige la privada")
		}
		return info, i18n.New("el fichero no parece una clave privada SSH")
	}
	info.Format = FormatPEM
	if bytes.Contains(raw, []byte("BEGIN OPENSSH PRIVATE KEY")) {
		info.Format = FormatOpenSSH
	}
	signer, err := ssh.ParsePrivateKey(raw)
	var missing *ssh.PassphraseMissingError
	switch {
	case errors.As(err, &missing):
		info.Encrypted = true
		if missing.PublicKey != nil {
			info.KeyType = missing.PublicKey.Type()
		}
	case err != nil:
		return info, i18n.Errorf("clave privada no válida: %w", err)
	default:
		info.KeyType = signer.PublicKey().Type()
	}
	return info, nil
}

// LoadSigner abre una clave (OpenSSH, PEM/PKCS#8 o PuTTY .ppk).
func LoadSigner(path, passphrase string) (ssh.Signer, error) {
	raw, err := os.ReadFile(ExpandHome(path))
	if err != nil {
		return nil, i18n.Errorf("no se puede leer la clave: %w", err)
	}
	if isPPK(raw) {
		return loadPPK(raw, passphrase)
	}
	signer, err := ssh.ParsePrivateKey(raw)
	var missing *ssh.PassphraseMissingError
	if errors.As(err, &missing) {
		if passphrase == "" {
			return nil, ErrPassphraseNeeded
		}
		signer, err = ssh.ParsePrivateKeyWithPassphrase(raw, []byte(passphrase))
		if errors.Is(err, x509.IncorrectPasswordError) {
			return nil, ErrBadPassphrase
		}
	}
	if err != nil {
		return nil, i18n.Errorf("el fichero no parece una clave privada SSH: %w", err)
	}
	return signer, nil
}

func loadPPK(raw []byte, passphrase string) (ssh.Signer, error) {
	k, err := putty.New(raw)
	if err != nil {
		return nil, i18n.Errorf("fichero .ppk no válido: %w", err)
	}
	encrypted := k.Encryption != "none"
	if encrypted && passphrase == "" {
		return nil, ErrPassphraseNeeded
	}
	var pass []byte
	if encrypted {
		pass = []byte(passphrase)
	}
	priv, err := k.ParseRawPrivateKey(pass)
	if err != nil {
		if encrypted {
			return nil, ErrBadPassphrase
		}
		return nil, i18n.Errorf("no se pudo leer la clave .ppk: %w", err)
	}
	if p, ok := priv.(*ed25519.PrivateKey); ok {
		priv = *p
	}
	return ssh.NewSignerFromKey(priv)
}

// skipNames son ficheros de ~/.ssh que nunca son claves privadas.
var skipNames = map[string]bool{"config": true, "known_hosts": true, "known_hosts.old": true, "authorized_keys": true, "authorized_keys2": true, "environment": true}

// FindKeys busca claves privadas en ~/.ssh y en los IdentityFile de ~/.ssh/config.
func FindKeys() []KeyInfo {
	seen := map[string]bool{}
	var out []KeyInfo
	add := func(path, source string) {
		path = filepath.Clean(ExpandHome(path))
		if seen[path] {
			return
		}
		seen[path] = true
		st, err := os.Stat(path)
		if err != nil || st.IsDir() || st.Size() > 64*1024 {
			return
		}
		ki, err := InspectKey(path)
		if err != nil {
			return
		}
		ki.Source = source
		out = append(out, ki)
	}
	dir := ExpandHome("~/.ssh")
	if entries, err := os.ReadDir(dir); err == nil {
		for _, e := range entries {
			n := e.Name()
			if e.IsDir() || skipNames[n] || strings.HasSuffix(n, ".pub") || strings.HasPrefix(n, ".") {
				continue
			}
			add(filepath.Join(dir, n), "ssh-dir")
		}
	}
	for _, h := range ReadSSHConfig() {
		if h.IdentityFile != "" {
			add(h.IdentityFile, "ssh-config")
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// ConfigHost es una entrada «Host» de ~/.ssh/config.
type ConfigHost struct {
	Alias        string `json:"alias"`
	HostName     string `json:"hostName"`
	User         string `json:"user"`
	Port         int    `json:"port"`
	IdentityFile string `json:"identityFile"`
}

// ReadSSHConfig lee ~/.ssh/config (solo lo necesario; ignora comodines).
func ReadSSHConfig() []ConfigHost {
	f, err := os.Open(ExpandHome("~/.ssh/config"))
	if err != nil {
		return nil
	}
	defer f.Close()
	return parseSSHConfig(f)
}

func parseSSHConfig(r interface{ Read([]byte) (int, error) }) []ConfigHost {
	var out []ConfigHost
	var cur []*ConfigHost
	flush := func() {
		for _, h := range cur {
			if h.HostName == "" {
				h.HostName = h.Alias
			}
			out = append(out, *h)
		}
		cur = nil
	}
	sc := bufio.NewScanner(r)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val := splitConfigLine(line)
		switch strings.ToLower(key) {
		case "host":
			flush()
			for _, a := range strings.Fields(val) {
				if strings.ContainsAny(a, "*?!") {
					continue
				}
				cur = append(cur, &ConfigHost{Alias: a, Port: 22})
			}
		case "match":
			flush()
		case "hostname":
			for _, h := range cur {
				h.HostName = unquote(val)
			}
		case "user":
			for _, h := range cur {
				h.User = unquote(val)
			}
		case "port":
			if p, err := strconv.Atoi(unquote(val)); err == nil {
				for _, h := range cur {
					h.Port = p
				}
			}
		case "identityfile":
			for _, h := range cur {
				if h.IdentityFile == "" {
					h.IdentityFile = unquote(val)
				}
			}
		}
	}
	flush()
	return out
}

func splitConfigLine(line string) (string, string) {
	i := strings.IndexAny(line, " \t=")
	if i < 0 {
		return line, ""
	}
	return line[:i], strings.TrimLeft(line[i:], " \t=")
}

func unquote(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		return s[1 : len(s)-1]
	}
	return s
}
