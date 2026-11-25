package app

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"draupnode/internal/i18n"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"path"
	"sort"
	"strings"
	"time"

	"draupnode/internal/bundle"
	"draupnode/internal/modules"
	"draupnode/internal/runner"
	"draupnode/internal/secrets"
	"draupnode/internal/store"

	"golang.org/x/crypto/ssh"
)

// Contraseñas de cada proyecto en la bóveda cifrada:
//
//	proj:<id>:gen:<fichero>   lo que generan los módulos en el servidor
//	                          (/etc/draupnode/secretos/<slug>/<fichero>), que
//	                          Draupnode trae al terminar de Aplicar
//	proj:<id>:var:<variable>  lo que escribe el usuario (variables «secret»)
//	proj:<id>:at              cuándo se trajeron por última vez
//
// Siempre en la bóveda (no en el llavero): para verlas hay que escribir la
// contraseña maestra cada vez.

func projPrefix(id string) string        { return "proj:" + id + ":" }
func genName(id, file string) string     { return projPrefix(id) + "gen:" + file }
func varName(id, variable string) string { return projPrefix(id) + "var:" + variable }

// projectNeedsVault: el proyecto genera contraseñas en el servidor o tiene
// datos secretos que escribe el usuario.
func projectNeedsVault(sel []bundle.Selection, check bool) bool {
	for _, s := range sel {
		if len(s.Module.SecretVars()) > 0 || (!check && len(s.Module.Secrets) > 0) {
			return true
		}
	}
	return false
}

// SetProjectSecret guarda (o borra, si value es "") un dato secreto que
// escribe el usuario en un módulo del proyecto.
func (a *App) SetProjectSecret(projectID, variable, value string) error {
	if _, err := a.store.Project(projectID); err != nil {
		return err
	}
	if !a.isSecretVar(variable) {
		return i18n.Errorf("%q no es un dato secreto de ningún módulo", variable)
	}
	if value == "" {
		return a.vault.Delete(varName(projectID, variable))
	}
	return vaultErr(a.vault.Set(varName(projectID, variable), value))
}

// secretKey: el nombre en la bóveda de una variable secreta de un módulo del
// servidor («git_app_token», o «git_app_token@blog» en otra copia).
func secretKey(moduleID, variable string) string {
	if _, inst := modules.SplitID(moduleID); inst != "" {
		return variable + "@" + inst
	}
	return variable
}

func (a *App) isSecretVar(name string) bool {
	name, _ = modules.SplitID(name)
	for _, m := range a.cat().All() {
		for _, v := range m.SecretVars() {
			if v.Name == name && !v.Managed {
				return true
			}
		}
	}
	return false
}

// ProjectSecretsSummary dice qué hay guardado sin desbloquear nada.
type ProjectSecretsSummary struct {
	VaultExists bool     `json:"vaultExists"`
	Generated   int      `json:"generated"` // contraseñas traídas del servidor
	Typed       []string `json:"typed"`     // variables secretas ya guardadas
	At          string   `json:"at,omitempty"`
}

func (a *App) ProjectSecretsInfo(projectID string) ProjectSecretsSummary {
	sum := ProjectSecretsSummary{VaultExists: a.vault.Status().Exists, Typed: []string{}}
	pre := projPrefix(projectID)
	for _, n := range a.vault.Names() {
		switch {
		case strings.HasPrefix(n, pre+"gen:"):
			sum.Generated++
		case strings.HasPrefix(n, pre+"var:"):
			sum.Typed = append(sum.Typed, strings.TrimPrefix(n, pre+"var:"))
		}
	}
	if a.vault.Has(pre + "at") {
		if v, err := a.vault.Get(pre + "at"); err == nil {
			sum.At = v
		}
	}
	return sum
}

// ProjectSecret es una contraseña para enseñar en la app.
type ProjectSecret struct {
	Kind   string `json:"kind"`   // generated | typed
	Module string `json:"module"` // nombre del módulo
	Label  string `json:"label"`  // qué es
	Name   string `json:"name"`   // fichero en el servidor o variable
	Value  string `json:"value"`
}

// ProjectSecrets devuelve las contraseñas del proyecto. Pide SIEMPRE la
// contraseña maestra de la bóveda, aunque ya estuviera desbloqueada.
func (a *App) ProjectSecrets(projectID, master string) ([]ProjectSecret, error) {
	p, err := a.store.Project(projectID)
	if err != nil {
		return nil, err
	}
	if err := a.vault.Unlock(master); err != nil {
		if errors.Is(err, secrets.ErrWrongMaster) {
			return nil, i18n.New("la contraseña de la bóveda no es correcta")
		}
		return nil, err
	}
	c := a.cat()
	var mods []*modules.Module
	for _, pm := range p.Modules {
		if m, ok := c.Get(pm.ID); ok {
			mods = append(mods, m)
		}
	}
	out := []ProjectSecret{}
	pre := projPrefix(projectID)
	for _, n := range a.vault.Names() {
		if !strings.HasPrefix(n, pre) {
			continue
		}
		val, err := a.vault.Get(n)
		if err != nil {
			return nil, err
		}
		rest := strings.TrimPrefix(n, pre)
		switch {
		case strings.HasPrefix(rest, "gen:"):
			file := strings.TrimPrefix(rest, "gen:")
			ps := ProjectSecret{Kind: "generated", Name: file, Label: file, Value: val}
			for _, m := range mods {
				if l := m.SecretLabel(file); l != "" {
					ps.Module, ps.Label = m.Name, l
					break
				}
			}
			out = append(out, ps)
		case strings.HasPrefix(rest, "var:"):
			v := strings.TrimPrefix(rest, "var:")
			ps := ProjectSecret{Kind: "typed", Name: v, Label: v, Value: val}
			base, inst := modules.SplitID(v) // «variable@copia» en otra copia de un módulo
			for _, m := range c.All() {
				for _, sv := range m.SecretVars() {
					if sv.Name == base {
						ps.Module, ps.Label = m.Name, sv.Label
						if inst != "" {
							ps.Module += " · " + inst
						}
					}
				}
			}
			out = append(out, ps)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Module != out[j].Module {
			return out[i].Module < out[j].Module
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

// storeGenerated guarda en la bóveda lo que devolvió el servidor (tar.gz en
// base64 de su carpeta de secretos). Lo que ya no esté en el servidor se quita.
func (a *App) storeGenerated(projectID, b64 string) (int, error) {
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return 0, err
	}
	files := map[string]string{}
	if len(raw) > 0 {
		gz, err := gzip.NewReader(bytes.NewReader(raw))
		if err != nil {
			return 0, err
		}
		tr := tar.NewReader(gz)
		for n := 0; ; n++ {
			// Un servidor comprometido no puede llenar la bóveda: como mucho 500 ficheros.
			if n > 500 {
				return 0, i18n.New("el servidor devolvió demasiados valores generados")
			}
			h, err := tr.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				return 0, err
			}
			name := path.Clean(strings.TrimPrefix(h.Name, "./"))
			if h.Typeflag != tar.TypeReg || strings.Contains(name, "/") || strings.HasPrefix(name, ".") || h.Size > 64*1024 {
				continue
			}
			b, err := io.ReadAll(tr)
			if err != nil {
				return 0, err
			}
			files[name] = strings.TrimRight(string(b), "\n")
		}
	}
	for name, val := range files {
		if err := a.vault.Set(genName(projectID, name), val); err != nil {
			return 0, err
		}
	}
	pre := projPrefix(projectID) + "gen:"
	for _, n := range a.vault.Names() {
		if strings.HasPrefix(n, pre) {
			if _, ok := files[strings.TrimPrefix(n, pre)]; !ok {
				_ = a.vault.Delete(n)
			}
		}
	}
	_ = a.vault.Set(projPrefix(projectID)+"at", time.Now().Format(time.RFC3339))
	return len(files), nil
}

// deleteProjectSecrets borra de la bóveda todo lo del proyecto (no hace falta desbloquear).
func (a *App) deleteProjectSecrets(projectID string) {
	pre := projPrefix(projectID)
	for _, n := range a.vault.Names() {
		if strings.HasPrefix(n, pre) {
			_ = a.vault.Delete(n)
		}
	}
}

// secretValues lee de la bóveda los datos secretos que escribió el usuario.
func (a *App) secretValues(projectID string, sel []bundle.Selection) (map[string]string, error) {
	out := map[string]string{}
	for _, s := range sel {
		for _, v := range s.Module.SecretVars() {
			if v.Managed {
				out[s.SecretName(v.Name)] = a.managedSecret(v.Name, s.Values)
				continue
			}
			val, err := a.vault.Get(varName(projectID, secretKey(s.Key(), v.Name)))
			switch {
			case errors.Is(err, secrets.ErrNotFound):
				val = ""
			case err != nil:
				return nil, err
			}
			out[s.SecretName(v.Name)] = val
		}
	}
	return out, nil
}

// uniqueSlug: nombre de carpeta de secretos que no use ya otro proyecto.
func (a *App) uniqueSlug(name, selfID string) string {
	base := bundle.Slug(name)
	used := map[string]bool{}
	for _, p := range a.store.Projects() {
		if p.ID != selfID {
			used[slugOf(p)] = true
		}
	}
	s := base
	for i := 2; used[s]; i++ {
		s = fmt.Sprintf("%s-%d", base, i)
	}
	return s
}

// slugOf: el fijado o, en proyectos de antes de la 0.8, el del nombre.
func slugOf(p store.Project) string {
	if p.Slug != "" {
		return p.Slug
	}
	return bundle.Slug(p.Name)
}

// FetchSecretsResult es la respuesta de FetchProjectSecrets.
type FetchSecretsResult struct {
	RunStart
	Count int `json:"count"`
}

// FetchProjectSecrets trae a la bóveda las contraseñas que generaron los
// módulos en el servidor (/etc/draupnode/secretos/<slug>), sin tener que
// Aplicar: por ejemplo tras reinstalar Draupnode o volver a asociar la
// plantilla. Si en el servidor no hay carpeta, no borra nada de la bóveda.
func (a *App) FetchProjectSecrets(projectID, secret, accept, sudoPassword string) FetchSecretsResult {
	var res FetchSecretsResult
	p, err := a.store.Project(projectID)
	if err != nil {
		res.Status, res.Message = "error", err.Error()
		return res
	}
	st := a.vault.Status()
	if !st.Exists {
		res.Status, res.Message = "vault_missing", i18n.T("Las contraseñas se guardan en la bóveda cifrada de Draupnode: créala primero.")
		return res
	}
	if !st.Unlocked {
		res.Status, res.Message = "vault_locked", i18n.T("Desbloquea la bóveda: ahí se guardan las contraseñas.")
		return res
	}
	dir := bundle.ShellQuote("/etc/draupnode/secretos/" + slugOf(p))
	cmd := "d=" + dir + "; [ -d \"$d\" ] || { echo DN-NODIR; exit 0; }; echo \"DN-OK $(tar -C \"$d\" --exclude='./.*' -cz . | base64 -w0)\""
	res.RunStart = a.withServerConn(p.ServerID, secret, accept, sudoPassword, func(c *ssh.Client, su runner.Sudo) RunStart {
		out, errOut, err := execOut(c, su, cmd)
		out = strings.TrimSpace(out)
		switch {
		case strings.Contains(out, "DN-NODIR"):
			return RunStart{Status: "error", Message: i18n.T("en el servidor no hay contraseñas de esta plantilla todavía: se generan la primera vez que pulsas Aplicar")}
		case err != nil || !strings.Contains(out, "DN-OK "):
			return RunStart{Status: "error", Message: strings.TrimSpace(firstLine(errOut, err))}
		}
		n, err := a.storeGenerated(projectID, strings.TrimSpace(out[strings.LastIndex(out, "DN-OK ")+6:]))
		if err != nil {
			return RunStart{Status: "error", Message: i18n.T("no se pudieron guardar: ") + err.Error()}
		}
		res.Count = n
		return RunStart{Status: "ok"}
	})
	return res
}
