// Package copia guarda y lee la copia de seguridad de Draupnode: un único
// fichero cifrado con una contraseña (Argon2id + XChaCha20-Poly1305) que
// lleva dentro un tar.gz con la configuración, la bóveda, las huellas de los
// servidores, los módulos propios y, si se quiere, las claves SSH.
//
// Formato: la línea «DRAUPNODE-COPIA 1», una línea JSON con los parámetros
// (sal, nonce…) y después los datos cifrados. La cabecera va como dato
// asociado: si alguien la toca, no se puede descifrar.
package copia

import (
	"archive/tar"
	"bufio"
	"bytes"
	"compress/gzip"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/chacha20poly1305"
)

const magic = "DRAUPNODE-COPIA 1\n"

// MinPassword es la longitud mínima de la contraseña de la copia.
const MinPassword = 10

// MaxSize limita lo que se acepta al leer (las copias son pequeñas).
const MaxSize = 64 << 20

// ErrWrongPassword: la contraseña no es la de la copia (o el fichero está dañado).
var ErrWrongPassword = errors.New("la contraseña no es correcta o el fichero está dañado")

// ErrNotBackup: el fichero no es una copia de Draupnode.
var ErrNotBackup = errors.New("este fichero no es una copia de Draupnode")

// KeyFile es una clave SSH guardada en la copia.
type KeyFile struct {
	ServerID string `json:"serverId"`
	Server   string `json:"server"`
	File     string `json:"file"`     // ruta dentro de la copia
	OrigPath string `json:"origPath"` // dónde estaba en el equipo
}

// Manifest describe lo que lleva la copia.
type Manifest struct {
	Version      int       `json:"version"`
	Created      time.Time `json:"created"`
	App          string    `json:"app"`
	Servers      int       `json:"servers"`
	Templates    int       `json:"templates"`
	Deployments  int       `json:"deployments"`
	VaultEntries int       `json:"vaultEntries"`
	Keyring      int       `json:"keyring"` // frases de paso del llavero del sistema
	Modules      int       `json:"modules"` // módulos propios
	Keys         []KeyFile `json:"keys"`
}

type header struct {
	KDF     string `json:"kdf"`
	Salt    []byte `json:"salt"`
	Time    uint32 `json:"time"`
	Memory  uint32 `json:"memoryKiB"`
	Threads uint8  `json:"threads"`
	Nonce   []byte `json:"nonce"`
}

// Parámetros de Argon2id (se rebajan en los tests).
var kdfTime, kdfMemory, kdfThreads = uint32(3), uint32(64*1024), uint8(4)

// Seal empaqueta files (ruta → contenido) y el manifiesto y los cifra.
func Seal(password string, m Manifest, files map[string][]byte) ([]byte, error) {
	if utf8.RuneCountInString(password) < MinPassword {
		return nil, fmt.Errorf("la contraseña de la copia debe tener al menos %d caracteres", MinPassword)
	}
	mj, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return nil, err
	}
	var plain bytes.Buffer
	gz := gzip.NewWriter(&plain)
	tw := tar.NewWriter(gz)
	add := func(name string, b []byte) error {
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o600, Size: int64(len(b)), ModTime: m.Created, Typeflag: tar.TypeReg}); err != nil {
			return err
		}
		_, err := tw.Write(b)
		return err
	}
	if err := add("manifest.json", mj); err != nil {
		return nil, err
	}
	names := make([]string, 0, len(files))
	for k := range files {
		names = append(names, k)
	}
	sort.Strings(names)
	for _, k := range names {
		if !safeName(k) {
			return nil, fmt.Errorf("nombre no válido en la copia: %s", k)
		}
		if err := add(k, files[k]); err != nil {
			return nil, err
		}
	}
	if err := tw.Close(); err != nil {
		return nil, err
	}
	if err := gz.Close(); err != nil {
		return nil, err
	}

	h := header{KDF: "argon2id", Salt: make([]byte, 16), Time: kdfTime, Memory: kdfMemory, Threads: kdfThreads}
	if _, err := rand.Read(h.Salt); err != nil {
		return nil, err
	}
	aead, err := chacha20poly1305.NewX(derive(password, h))
	if err != nil {
		return nil, err
	}
	h.Nonce = make([]byte, aead.NonceSize())
	if _, err := rand.Read(h.Nonce); err != nil {
		return nil, err
	}
	hj, _ := json.Marshal(h)
	head := append([]byte(magic), append(hj, '\n')...)
	return append(head, aead.Seal(nil, h.Nonce, plain.Bytes(), head)...), nil
}

// Open descifra la copia y devuelve su manifiesto y sus ficheros.
func Open(password string, data []byte) (Manifest, map[string][]byte, error) {
	var m Manifest
	if !bytes.HasPrefix(data, []byte(magic)) {
		return m, nil, ErrNotBackup
	}
	r := bufio.NewReader(bytes.NewReader(data[len(magic):]))
	hj, err := r.ReadBytes('\n')
	if err != nil {
		return m, nil, ErrNotBackup
	}
	var h header
	if json.Unmarshal(hj, &h) != nil || h.KDF != "argon2id" || len(h.Salt) < 16 || h.Memory > 1<<20 || h.Time > 20 {
		return m, nil, ErrNotBackup
	}
	head := data[:len(magic)+len(hj)]
	aead, err := chacha20poly1305.NewX(derive(password, h))
	if err != nil || len(h.Nonce) != aead.NonceSize() {
		return m, nil, ErrNotBackup
	}
	plain, err := aead.Open(nil, h.Nonce, data[len(head):], head)
	if err != nil {
		return m, nil, ErrWrongPassword
	}
	gz, err := gzip.NewReader(bytes.NewReader(plain))
	if err != nil {
		return m, nil, ErrNotBackup
	}
	tr := tar.NewReader(io.LimitReader(gz, MaxSize))
	files := map[string][]byte{}
	for {
		hd, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return m, nil, ErrNotBackup
		}
		if hd.Typeflag != tar.TypeReg || !safeName(hd.Name) {
			continue
		}
		b, err := io.ReadAll(tr)
		if err != nil {
			return m, nil, ErrNotBackup
		}
		files[hd.Name] = b
	}
	mj, ok := files["manifest.json"]
	if !ok || json.Unmarshal(mj, &m) != nil {
		return m, nil, ErrNotBackup
	}
	delete(files, "manifest.json")
	return m, files, nil
}

func derive(password string, h header) []byte {
	return argon2.IDKey([]byte(password), h.Salt, h.Time, h.Memory, h.Threads, chacha20poly1305.KeySize)
}

// safeName: ruta relativa, limpia y sin salir de la copia.
func safeName(n string) bool {
	return n != "" && !strings.HasPrefix(n, "/") && path.Clean(n) == n && !strings.HasPrefix(n, "..") && !strings.Contains(n, "/../") && !strings.Contains(n, "\\")
}
