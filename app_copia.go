package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"draupnode/internal/copia"
	"draupnode/internal/secrets"
	"draupnode/internal/store"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Copia de seguridad de Draupnode: todo lo que hace falta para seguir en
// otro equipo (o en este, si se rompe) en un solo fichero cifrado.
//
//	draupnode.json     servidores, plantillas y lo de cada servidor
//	vault.json         la bóveda (ya va cifrada con su contraseña maestra)
//	known_hosts        las huellas de los servidores
//	modules/…          los módulos propios
//	keyring.json       las frases de paso guardadas en el llavero del sistema
//	keys/<id>/<fich.>  las claves SSH (si se elige)

// BackupStatus para Ajustes y los avisos.
type BackupStatus struct {
	LastExport *time.Time `json:"lastExport"`
}

func (a *App) BackupStatus() BackupStatus { return BackupStatus{LastExport: a.store.LastExport()} }

// ExportBackup pregunta dónde guardar y guarda la copia. "" = cancelado.
func (a *App) ExportBackup(password string, withKeys bool) (string, error) {
	data, err := a.buildBackup(password, withKeys)
	if err != nil {
		return "", err
	}
	home, _ := os.UserHomeDir()
	p, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:            "Guardar la copia de Draupnode",
		DefaultDirectory: home,
		DefaultFilename:  "draupnode-copia-" + time.Now().Format("2006-01-02") + ".draupnode",
	})
	if err != nil || p == "" {
		return "", err
	}
	if err := writeFileAtomic(p, data, 0o600); err != nil {
		return "", err
	}
	_ = a.store.SetLastExport(time.Now())
	return p, nil
}

func (a *App) buildBackup(password string, withKeys bool) ([]byte, error) {
	dir := a.store.Dir()
	files := map[string][]byte{}
	read := func(name, p string) error {
		b, err := os.ReadFile(p)
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		if err == nil {
			files[name] = b
		}
		return err
	}
	if err := read("draupnode.json", filepath.Join(dir, "draupnode.json")); err != nil {
		return nil, err
	}
	if err := read("vault.json", a.vault.Status().Path); err != nil {
		return nil, err
	}
	if err := read("known_hosts", filepath.Join(dir, "known_hosts")); err != nil {
		return nil, err
	}
	m := copia.Manifest{Version: 1, Created: time.Now().UTC(), App: Version, VaultEntries: a.vault.Status().Entries, Keys: []copia.KeyFile{}}
	mods := map[string]bool{}
	_ = filepath.WalkDir(a.userModulesDir(), func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !d.Type().IsRegular() {
			return nil
		}
		rel, _ := filepath.Rel(a.userModulesDir(), p)
		if b, err := os.ReadFile(p); err == nil {
			files["modules/"+filepath.ToSlash(rel)] = b
			mods[strings.SplitN(filepath.ToSlash(rel), "/", 2)[0]] = true
		}
		return nil
	})
	m.Modules = len(mods)

	kr := map[string]string{}
	for _, s := range a.store.Servers() {
		m.Servers++
		if s.SecretStore == "keyring" {
			if v, err := a.keyring.Get(secrets.SecretName(s.ID)); err == nil {
				kr[s.ID] = v
			}
		}
		if withKeys && s.AuthMethod == store.AuthKey && s.KeyPath != "" {
			for _, p := range []string{s.KeyPath, s.KeyPath + ".pub"} {
				b, err := os.ReadFile(p)
				if err != nil {
					continue
				}
				name := "keys/" + s.ID + "/" + filepath.Base(p)
				files[name] = b
				if p == s.KeyPath {
					m.Keys = append(m.Keys, copia.KeyFile{ServerID: s.ID, Server: s.Name, File: name, OrigPath: p})
				}
			}
		}
	}
	if len(kr) > 0 {
		b, _ := json.Marshal(kr)
		files["keyring.json"] = b
		m.Keyring = len(kr)
	}
	m.Templates = len(a.store.Recipes())
	m.Deployments = len(a.store.Projects())
	return copia.Seal(password, m, files)
}

// ChooseBackupFile abre el diálogo para elegir una copia.
func (a *App) ChooseBackupFile() (string, error) {
	home, _ := os.UserHomeDir()
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Copia de Draupnode",
		DefaultDirectory: home,
		Filters:          []runtime.FileFilter{{DisplayName: "Copias de Draupnode (*.draupnode)", Pattern: "*.draupnode"}},
	})
}

func readBackup(p, password string) (copia.Manifest, map[string][]byte, error) {
	st, err := os.Stat(p)
	if err != nil {
		return copia.Manifest{}, nil, err
	}
	if st.Size() > copia.MaxSize {
		return copia.Manifest{}, nil, copia.ErrNotBackup
	}
	data, err := os.ReadFile(p)
	if err != nil {
		return copia.Manifest{}, nil, err
	}
	return copia.Open(password, data)
}

// InspectBackup descifra la copia y dice qué lleva (sin tocar nada).
func (a *App) InspectBackup(p, password string) (copia.Manifest, error) {
	m, _, err := readBackup(p, password)
	return m, err
}

// ImportResult: lo que hay que contar al terminar de importar.
type ImportResult struct {
	Notes  []string `json:"notes"`
	Safety string   `json:"safety"` // carpeta con lo que había antes
}

// ImportBackup sustituye la configuración de este equipo por la de la copia.
// Lo que había se guarda antes en una carpeta «antes-de-importar-…».
func (a *App) ImportBackup(p, password string) (ImportResult, error) {
	var res ImportResult
	a.runMu.Lock()
	busy := len(a.runs) > 0
	a.runMu.Unlock()
	if busy {
		return res, errors.New("hay una tarea en marcha: espera a que termine")
	}
	m, files, err := readBackup(p, password)
	if err != nil {
		return res, err
	}
	conf, ok := files["draupnode.json"]
	if !ok {
		return res, copia.ErrNotBackup
	}
	dir := a.store.Dir()
	vaultPath := a.vault.Status().Path

	// 1. Lo de ahora, a un lado.
	safety := filepath.Join(dir, "antes-de-importar-"+time.Now().Format("2006-01-02-150405"))
	if err := os.MkdirAll(safety, 0o700); err != nil {
		return res, err
	}
	for _, n := range []string{"draupnode.json", "known_hosts", "modules"} {
		_ = moveIfExists(filepath.Join(dir, n), filepath.Join(safety, n))
	}
	_ = moveIfExists(vaultPath, filepath.Join(safety, filepath.Base(vaultPath)))
	res.Safety = safety

	// 2. Claves SSH: si en este equipo ya está la misma en su sitio, se usa;
	// si no, se deja en la carpeta de Draupnode y el servidor apunta allí.
	newKeyPath := map[string]string{}
	for _, k := range m.Keys {
		b, ok := files[k.File]
		if !ok {
			continue
		}
		if cur, err := os.ReadFile(k.OrigPath); err == nil && bytes.Equal(cur, b) {
			continue
		}
		dst := filepath.Join(dir, "claves", k.ServerID, filepath.Base(k.File))
		if err := os.MkdirAll(filepath.Dir(dst), 0o700); err != nil {
			return res, err
		}
		if err := writeFileAtomic(dst, b, 0o600); err != nil {
			return res, err
		}
		if pub, ok := files[k.File+".pub"]; ok {
			_ = writeFileAtomic(dst+".pub", pub, 0o644)
		}
		newKeyPath[k.ServerID] = dst
		res.Notes = append(res.Notes, fmt.Sprintf("La clave SSH de «%s» se ha dejado en %s.", k.Server, dst))
	}

	// 3. Frases de paso del llavero: al llavero de este equipo; si no hay
	// llavero, ese servidor la pedirá al conectar.
	noKeyring := map[string]bool{}
	if b, ok := files["keyring.json"]; ok {
		var kr map[string]string
		_ = json.Unmarshal(b, &kr)
		for id, v := range kr {
			if err := a.keyring.Set(secrets.SecretName(id), v); err != nil {
				noKeyring[id] = true
			}
		}
		if len(noKeyring) > 0 {
			res.Notes = append(res.Notes, fmt.Sprintf("Este equipo no tiene llavero del sistema: %d servidor(es) te pedirán su contraseña al conectar.", len(noKeyring)))
		}
	}
	if len(newKeyPath) > 0 || len(noKeyring) > 0 {
		var raw map[string]any
		if err := json.Unmarshal(conf, &raw); err == nil {
			if list, ok := raw["servers"].([]any); ok {
				for _, it := range list {
					if s, ok := it.(map[string]any); ok {
						id, _ := s["id"].(string)
						if np, ok := newKeyPath[id]; ok {
							s["keyPath"] = np
						}
						if noKeyring[id] {
							s["secretStore"] = ""
						}
					}
				}
			}
			if b, err := json.MarshalIndent(raw, "", "  "); err == nil {
				conf = b
			}
		}
	}

	// 4. Escribir y volver a abrir.
	if err := writeFileAtomic(filepath.Join(dir, "draupnode.json"), conf, 0o600); err != nil {
		return res, err
	}
	if b, ok := files["vault.json"]; ok {
		if err := writeFileAtomic(vaultPath, b, 0o600); err != nil {
			return res, err
		}
		res.Notes = append(res.Notes, "La bóveda se abre con la contraseña maestra que tenía cuando hiciste la copia.")
	}
	if b, ok := files["known_hosts"]; ok {
		_ = writeFileAtomic(filepath.Join(dir, "known_hosts"), b, 0o600)
	}
	for n, b := range files {
		if rel, ok := strings.CutPrefix(n, "modules/"); ok {
			dst := filepath.Join(a.userModulesDir(), filepath.FromSlash(rel))
			if os.MkdirAll(filepath.Dir(dst), 0o700) == nil {
				_ = writeFileAtomic(dst, b, 0o600)
			}
		}
	}
	st, err := store.Open(dir)
	if err != nil {
		return res, fmt.Errorf("la copia se ha escrito pero no se puede abrir (lo de antes está en %s): %w", safety, err)
	}
	v, err := secrets.OpenVault(vaultPath)
	if err != nil {
		return res, fmt.Errorf("la bóveda de la copia no se puede abrir (lo de antes está en %s): %w", safety, err)
	}
	a.store, a.vault = st, v
	a.catMu.Lock()
	a.catalog = nil
	a.catMu.Unlock()
	return res, nil
}

func moveIfExists(from, to string) error {
	if _, err := os.Stat(from); err != nil {
		return nil
	}
	return os.Rename(from, to)
}
