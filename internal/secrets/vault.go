package secrets

import (
	"crypto/rand"
	"draupnode/internal/i18n"
	"encoding/json"
	"errors"
	"os"
	"sort"
	"sync"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/chacha20poly1305"
)

// Bóveda cifrada propia de Draupnode, para equipos sin llavero del sistema
// (o si el usuario prefiere no usarlo).
//
//   - Clave derivada de una contraseña maestra con Argon2id
//     (64 MiB de memoria, 3 pasadas, 4 hilos; resistente a GPU/ASIC).
//   - Cada secreto se cifra con XChaCha20-Poly1305 (cifrado autenticado),
//     con nonce aleatorio de 192 bits y el nombre del secreto como dato
//     asociado: no se puede mover un secreto cifrado a otra entrada.
//   - La contraseña maestra nunca se guarda; la clave derivada solo vive
//     en memoria mientras la bóveda está desbloqueada.

// ErrLocked indica que la bóveda existe pero está bloqueada.
var ErrLocked = i18n.Err("la bóveda está bloqueada")

// ErrNoVault indica que la bóveda aún no se ha creado.
var ErrNoVault = i18n.Err("la bóveda cifrada aún no se ha creado")

// ErrWrongMaster indica que la contraseña maestra no es correcta.
var ErrWrongMaster = i18n.Err("la contraseña maestra no es correcta")

// MinMasterLen es la longitud mínima de la contraseña maestra.
const MinMasterLen = 10

const checkPlain = "draupnode-vault-v1"

type kdfParams struct {
	Alg     string `json:"alg"`
	Salt    []byte `json:"salt"`
	Time    uint32 `json:"time"`
	Memory  uint32 `json:"memoryKiB"`
	Threads uint8  `json:"threads"`
}

type sealed struct {
	Nonce []byte `json:"nonce"`
	Data  []byte `json:"data"`
}

type vaultFile struct {
	Version int               `json:"version"`
	Cipher  string            `json:"cipher"`
	KDF     kdfParams         `json:"kdf"`
	Check   sealed            `json:"check"`
	Entries map[string]sealed `json:"entries"`
}

// Vault es segura para usar desde varias goroutines.
type Vault struct {
	mu   sync.Mutex
	path string
	key  []byte // nil = bloqueada
	f    *vaultFile
	// Parámetros de Argon2 (se pueden rebajar en tests).
	time, memory uint32
	threads      uint8
}

// OpenVault prepara la bóveda en path (no la crea si no existe).
func OpenVault(path string) (*Vault, error) {
	v := &Vault{path: path, time: 3, memory: 64 * 1024, threads: 4}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return v, nil
	}
	if err != nil {
		return nil, err
	}
	var f vaultFile
	if err := json.Unmarshal(raw, &f); err != nil {
		return nil, i18n.Errorf("la bóveda %s está dañada: %w", path, err)
	}
	if f.Entries == nil {
		f.Entries = map[string]sealed{}
	}
	v.f = &f
	return v, nil
}

// Status de la bóveda para la interfaz.
type Status struct {
	Exists   bool   `json:"exists"`
	Unlocked bool   `json:"unlocked"`
	Path     string `json:"path"`
	Entries  int    `json:"entries"`
}

func (v *Vault) Status() Status {
	v.mu.Lock()
	defer v.mu.Unlock()
	s := Status{Exists: v.f != nil, Unlocked: v.key != nil, Path: v.path}
	if v.f != nil {
		s.Entries = len(v.f.Entries)
	}
	return s
}

func (v *Vault) derive(master string, p kdfParams) []byte {
	return argon2.IDKey([]byte(master), p.Salt, p.Time, p.Memory, p.Threads, chacha20poly1305.KeySize)
}

func seal(key []byte, name, plain string) (sealed, error) {
	aead, err := chacha20poly1305.NewX(key)
	if err != nil {
		return sealed{}, err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return sealed{}, err
	}
	return sealed{Nonce: nonce, Data: aead.Seal(nil, nonce, []byte(plain), []byte(name))}, nil
}

func open(key []byte, name string, s sealed) (string, error) {
	aead, err := chacha20poly1305.NewX(key)
	if err != nil {
		return "", err
	}
	plain, err := aead.Open(nil, s.Nonce, s.Data, []byte(name))
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// Create crea la bóveda con una contraseña maestra y la deja desbloqueada.
func (v *Vault) Create(master string) error {
	if utf8.RuneCountInString(master) < MinMasterLen {
		return i18n.Errorf("la contraseña maestra debe tener al menos %d caracteres", MinMasterLen)
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.f != nil {
		return i18n.New("la bóveda ya existe")
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return err
	}
	p := kdfParams{Alg: "argon2id", Salt: salt, Time: v.time, Memory: v.memory, Threads: v.threads}
	key := v.derive(master, p)
	check, err := seal(key, "__check__", checkPlain)
	if err != nil {
		return err
	}
	f := &vaultFile{Version: 1, Cipher: "xchacha20-poly1305", KDF: p, Check: check, Entries: map[string]sealed{}}
	if err := writeFile(v.path, f); err != nil {
		return err
	}
	v.f, v.key = f, key
	return nil
}

// Unlock comprueba la contraseña maestra y guarda la clave en memoria.
func (v *Vault) Unlock(master string) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.f == nil {
		return ErrNoVault
	}
	key := v.derive(master, v.f.KDF)
	if got, err := open(key, "__check__", v.f.Check); err != nil || got != checkPlain {
		return ErrWrongMaster
	}
	v.key = key
	return nil
}

// Lock borra la clave de memoria.
func (v *Vault) Lock() {
	v.mu.Lock()
	defer v.mu.Unlock()
	for i := range v.key {
		v.key[i] = 0
	}
	v.key = nil
}

// Has dice si hay un secreto con ese nombre (no necesita desbloquear).
func (v *Vault) Has(name string) bool {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.f == nil {
		return false
	}
	_, ok := v.f.Entries[name]
	return ok
}

func (v *Vault) ready() error {
	if v.f == nil {
		return ErrNoVault
	}
	if v.key == nil {
		return ErrLocked
	}
	return nil
}

func (v *Vault) Get(name string) (string, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if err := v.ready(); err != nil {
		return "", err
	}
	s, ok := v.f.Entries[name]
	if !ok {
		return "", ErrNotFound
	}
	plain, err := open(v.key, name, s)
	if err != nil {
		return "", i18n.New("el secreto de la bóveda está dañado o manipulado")
	}
	return plain, nil
}

func (v *Vault) Set(name, value string) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	if err := v.ready(); err != nil {
		return err
	}
	s, err := seal(v.key, name, value)
	if err != nil {
		return err
	}
	v.f.Entries[name] = s
	return writeFile(v.path, v.f)
}

// Delete no necesita desbloquear: borrar no revela nada.
func (v *Vault) Delete(name string) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.f == nil {
		return nil
	}
	if _, ok := v.f.Entries[name]; !ok {
		return nil
	}
	delete(v.f.Entries, name)
	return writeFile(v.path, v.f)
}

// Names lista los nombres guardados (sin valores).
func (v *Vault) Names() []string {
	v.mu.Lock()
	defer v.mu.Unlock()
	var out []string
	if v.f != nil {
		for k := range v.f.Entries {
			out = append(out, k)
		}
	}
	sort.Strings(out)
	return out
}

func writeFile(path string, f *vaultFile) error {
	raw, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
