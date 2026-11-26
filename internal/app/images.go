package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"

	"draupnode/internal/bundle"
	"draupnode/internal/i18n"
	"draupnode/internal/overview"
	"draupnode/internal/runner"
)

// Imágenes Docker con versión nueva: el servidor pregunta a cada registro por
// el digest de la etiqueta que usa cada contenedor (imagenes.py) y se guarda el
// resultado en este equipo (imagenes/<servidor>.json). «Actualizar» hace
// docker compose pull + up -d del proyecto Compose de esos contenedores.

// ImageCompose es un proyecto Compose que usa una imagen.
type ImageCompose struct {
	Project string `json:"project"`
	Dir     string `json:"dir"`
	Files   string `json:"files"`
}

// ImageInfo es una imagen y si tiene versión nueva.
type ImageInfo struct {
	Image      string         `json:"image"`
	Containers []string       `json:"containers"`
	Compose    []ImageCompose `json:"compose"`
	Coolify    bool           `json:"coolify"`
	// Status: new | same | local (construida en el servidor) | pinned (fijada por digest) | unknown
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}

// ImageReport es la última comprobación de un servidor.
type ImageReport struct {
	At     time.Time   `json:"at"`
	Images []ImageInfo `json:"images"`
}

// ImagesResult es la respuesta de CheckImages y UpdateImages.
type ImagesResult struct {
	RunStart
	Report *ImageReport `json:"report,omitempty"`
	Output string       `json:"output,omitempty"`
}

func (a *App) imagesPath(serverID string) string {
	if !cacheIDRe.MatchString(serverID) {
		return ""
	}
	return filepath.Join(a.store.Dir(), "imagenes", serverID+".json")
}

func (a *App) saveImages(serverID string, r ImageReport) {
	p := a.imagesPath(serverID)
	if p == "" {
		return
	}
	b, err := json.Marshal(r)
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(p), 0o700)
	if os.WriteFile(p+".tmp", b, 0o600) == nil {
		_ = os.Rename(p+".tmp", p)
	}
}

func (a *App) loadImages(serverID string) (ImageReport, bool) {
	var r ImageReport
	p := a.imagesPath(serverID)
	if p == "" {
		return r, false
	}
	b, err := os.ReadFile(p)
	return r, err == nil && json.Unmarshal(b, &r) == nil
}

// LastImageChecks: la última comprobación de imágenes de cada servidor.
func (a *App) LastImageChecks() map[string]ImageReport {
	out := map[string]ImageReport{}
	for _, s := range a.store.Servers() {
		if r, ok := a.loadImages(s.ID); ok {
			out[s.ID] = r
		}
	}
	return out
}

func (a *App) readImages(c *ssh.Client, su runner.Sudo) (ImageReport, error) {
	out, errOut, err := execOut(c, su, "command -v docker >/dev/null || { echo '{\"images\":[]}'; exit 0; }; python3 - <<'DRAUPNODE_IMG'\n"+overview.Images+"\nDRAUPNODE_IMG")
	if err != nil && strings.TrimSpace(out) == "" {
		return ImageReport{}, errText(strings.TrimSpace(firstLine(errOut, err)))
	}
	var r ImageReport
	if err := json.Unmarshal([]byte(lastJSONLine(out)), &r); err != nil {
		return ImageReport{}, errText(i18n.T("respuesta no válida del servidor: ") + err.Error())
	}
	r.At = time.Now()
	if r.Images == nil {
		r.Images = []ImageInfo{}
	}
	return r, nil
}

// CheckImages mira si hay versión nueva de las imágenes de los contenedores.
func (a *App) CheckImages(serverID, secret, accept, sudoPassword string) ImagesResult {
	var res ImagesResult
	res.RunStart = a.withServerConn(serverID, secret, accept, sudoPassword, func(c *ssh.Client, su runner.Sudo) RunStart {
		r, err := a.readImages(c, su)
		if err != nil {
			return RunStart{Status: "error", Message: err.Error()}
		}
		a.saveImages(serverID, r)
		res.Report = &r
		return RunStart{Status: "ok"}
	})
	return res
}

// composeUpdateCmd: bajar las imágenes nuevas de un proyecto Compose y
// recrear sus contenedores (las imágenes que se construyen en el servidor no
// se bajan).
func composeUpdateCmd(c ImageCompose) string {
	args := "docker compose -p " + bundle.ShellQuote(c.Project)
	for _, f := range strings.Split(c.Files, ",") {
		if f = strings.TrimSpace(f); f != "" {
			args += " -f " + bundle.ShellQuote(f)
		}
	}
	return "echo " + bundle.ShellQuote("== "+c.Project) + "; ( cd " + bundle.ShellQuote(c.Dir) + " && { " +
		args + " pull -q --ignore-buildable 2>&1 || " + args + " pull -q 2>&1; } && " + args + " up -d 2>&1 )"
}

// UpdateImages actualiza las imágenes de los proyectos Compose elegidos (los
// de la última comprobación; los de Coolify los actualiza Coolify) y vuelve a
// comprobar.
func (a *App) UpdateImages(serverID string, projects []string, secret, accept, sudoPassword string) ImagesResult {
	last, ok := a.loadImages(serverID)
	if !ok {
		return ImagesResult{RunStart: RunStart{Status: "error", Message: i18n.T("comprueba antes las imágenes del servidor")}}
	}
	known := map[string]ImageCompose{}
	for _, im := range last.Images {
		if im.Coolify {
			continue
		}
		for _, c := range im.Compose {
			known[c.Project] = c
		}
	}
	var cmds []string
	for _, p := range projects {
		c, ok := known[p]
		if !ok {
			return ImagesResult{RunStart: RunStart{Status: "error", Message: i18n.Sprintf("«%s» no es un proyecto Compose de este servidor", p)}}
		}
		if c.Dir == "" {
			return ImagesResult{RunStart: RunStart{Status: "error", Message: i18n.Sprintf("no se sabe en qué carpeta está «%s»", p)}}
		}
		cmds = append(cmds, composeUpdateCmd(c))
	}
	if len(cmds) == 0 {
		return ImagesResult{RunStart: RunStart{Status: "error", Message: i18n.T("no hay nada que actualizar")}}
	}
	var res ImagesResult
	res.RunStart = a.withServerConn(serverID, secret, accept, sudoPassword, func(c *ssh.Client, su runner.Sudo) RunStart {
		out, errOut, err := execOut(c, su, strings.Join(cmds, "; ")+"; docker image prune -f >/dev/null 2>&1; true")
		res.Output = strings.TrimSpace(out + "\n" + errOut)
		if err != nil {
			return RunStart{Status: "error", Message: firstLine(errOut, err)}
		}
		if r, err := a.readImages(c, su); err == nil {
			a.saveImages(serverID, r)
			res.Report = &r
		}
		return RunStart{Status: "ok"}
	})
	return res
}
