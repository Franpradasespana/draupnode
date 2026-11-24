package app

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"draupnode/internal/dockerize"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Creador de Dockerfile: la pantalla «Docker» (antes «Editor»). Analiza la
// carpeta de un proyecto, genera los ficheros de Docker y, si hay Docker en
// este equipo, prueba a construir la imagen.

// DockerInfo son los datos fijos del asistente.
type DockerInfo struct {
	Versions map[string][]string `json:"versions"`
	Docker   bool                `json:"docker"` // hay orden docker en este equipo
}

func (a *App) DockerInfo() DockerInfo {
	_, err := exec.LookPath("docker")
	return DockerInfo{Versions: dockerize.Versions, Docker: err == nil}
}

// ChooseProjectDir abre el diálogo para elegir la carpeta del proyecto.
func (a *App) ChooseProjectDir() (string, error) {
	home, _ := os.UserHomeDir()
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Carpeta del proyecto",
		DefaultDirectory: home,
	})
}

// AnalyzeProject mira la carpeta y propone la configuración. stack fuerza el
// lenguaje ("" = el detectado).
func (a *App) AnalyzeProject(dir, stack string) (*dockerize.Analysis, error) {
	dir, err := projectDir(dir)
	if err != nil {
		return nil, err
	}
	return dockerize.AnalyzeAs(dir, stack)
}

// DefaultDockerSpec: la configuración de partida de un lenguaje (cuando el
// análisis no lo reconoció y el usuario lo elige a mano).
func (a *App) DefaultDockerSpec(stack, name string) dockerize.Spec {
	return dockerize.Default(stack, dockerize.SafeName(name))
}

// DockerFile es un fichero generado.
type DockerFile struct {
	Name    string `json:"name"`
	Content string `json:"content"`
	Exists  bool   `json:"exists"` // ya hay uno con ese nombre (se sustituiría)
}

// DockerPreview es la vista previa: los ficheros o los errores.
type DockerPreview struct {
	Files  []DockerFile `json:"files"`
	Errors []string     `json:"errors"`
}

// GenerateDocker genera los ficheros sin guardarlos.
func (a *App) GenerateDocker(dir string, spec dockerize.Spec) DockerPreview {
	files, errs := genFiles(spec)
	if len(errs) > 0 {
		return DockerPreview{Files: []DockerFile{}, Errors: errs}
	}
	d, _ := projectDir(dir)
	return DockerPreview{Files: orderFiles(d, spec, files), Errors: []string{}}
}

func genFiles(spec dockerize.Spec) (map[string]string, []string) {
	if errs := spec.Validate(); len(errs) > 0 {
		return nil, errs
	}
	files, err := dockerize.Generate(spec)
	if err != nil {
		return nil, []string{err.Error()}
	}
	return files, nil
}

// orderFiles: Dockerfile, compose, entrypoint, .dockerignore.
func orderFiles(dir string, spec dockerize.Spec, files map[string]string) []DockerFile {
	n := spec.Names()
	rank := map[string]int{n.Dockerfile: 0, n.Compose: 1, n.Nginx: 2, n.Entrypoint: 3, n.Ignore: 4}
	names := make([]string, 0, len(files))
	for k := range files {
		names = append(names, k)
	}
	sort.Slice(names, func(i, j int) bool { return rank[names[i]] < rank[names[j]] })
	out := make([]DockerFile, 0, len(names))
	for _, k := range names {
		f := DockerFile{Name: k, Content: files[k]}
		if dir != "" {
			if _, err := os.Stat(filepath.Join(dir, k)); err == nil {
				f.Exists = true
			}
		}
		out = append(out, f)
	}
	return out
}

func projectDir(dir string) (string, error) {
	dir = strings.TrimSpace(dir)
	if dir == "" || !filepath.IsAbs(dir) {
		return "", errors.New("elige la carpeta del proyecto")
	}
	dir = filepath.Clean(dir)
	st, err := os.Stat(dir)
	if err != nil || !st.IsDir() {
		return "", errors.New("la carpeta no existe: " + dir)
	}
	return dir, nil
}

// WriteDockerFiles genera (otra vez, aquí: no se fía de lo que traiga la
// interfaz) y guarda los ficheros en la carpeta del proyecto. Si alguno ya
// existe, solo lo sustituye con overwrite. Devuelve los nombres guardados.
func (a *App) WriteDockerFiles(dir string, spec dockerize.Spec, overwrite bool) ([]string, error) {
	dir, err := projectDir(dir)
	if err != nil {
		return nil, err
	}
	files, errs := genFiles(spec)
	if len(errs) > 0 {
		return nil, errors.New(strings.Join(errs, "; "))
	}
	list := orderFiles(dir, spec, files)
	if !overwrite {
		var ex []string
		for _, f := range list {
			if f.Exists {
				ex = append(ex, f.Name)
			}
		}
		if len(ex) > 0 {
			return nil, errors.New("ya existen: " + strings.Join(ex, ", "))
		}
	}
	saved := []string{}
	for _, f := range list {
		mode := os.FileMode(0o644)
		if f.Name == spec.Names().Entrypoint {
			mode = 0o755
		}
		if err := writeFileAtomic(filepath.Join(dir, f.Name), []byte(f.Content), mode); err != nil {
			return saved, fmt.Errorf("%s: %w", f.Name, err)
		}
		saved = append(saved, f.Name)
	}
	return saved, nil
}

func writeFileAtomic(path string, data []byte, mode os.FileMode) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".draupnode-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), mode); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// ---------------------------------------------------------------- probar a construir

// DockerBuildEvent llega a la interfaz por el evento «dockerbuild».
type DockerBuildEvent struct {
	Kind  string `json:"kind"` // line | done
	Text  string `json:"text,omitempty"`
	OK    bool   `json:"ok,omitempty"`
	Error string `json:"error,omitempty"`
	Image string `json:"image,omitempty"`
	Secs  int    `json:"secs,omitempty"`
}

var (
	buildMu     sync.Mutex
	buildCancel context.CancelFunc
)

// BuildDockerImage construye la imagen con el Dockerfile guardado, en este
// equipo, en segundo plano (eventos «dockerbuild»). La etiqueta es
// draupnode-prueba/<nombre>:latest.
func (a *App) BuildDockerImage(dir string, spec dockerize.Spec) error {
	dir, err := projectDir(dir)
	if err != nil {
		return err
	}
	if errs := spec.Validate(); len(errs) > 0 {
		return errors.New(strings.Join(errs, "; "))
	}
	df := spec.Names().Dockerfile
	if _, err := os.Stat(filepath.Join(dir, df)); err != nil {
		return errors.New("guarda antes los ficheros (falta " + df + ")")
	}
	if _, err := exec.LookPath("docker"); err != nil {
		return errors.New("no hay Docker en este equipo: instálalo desde la pantalla «Servidor de pruebas»")
	}
	buildMu.Lock()
	if buildCancel != nil {
		buildMu.Unlock()
		return errors.New("ya se está construyendo una imagen")
	}
	ctx, cancel := context.WithCancel(a.context())
	buildCancel = cancel
	buildMu.Unlock()

	image := "draupnode-prueba/" + spec.Name + ":latest"
	go func() {
		defer func() {
			buildMu.Lock()
			buildCancel = nil
			buildMu.Unlock()
			cancel()
		}()
		t0 := time.Now()
		cmd := exec.CommandContext(ctx, "docker", "build", "--progress=plain", "-f", df, "-t", image, ".")
		cmd.Dir = dir
		cmd.Env = append(os.Environ(), "DOCKER_BUILDKIT=1")
		pr, pw := io.Pipe()
		cmd.Stdout, cmd.Stderr = pw, pw
		done := make(chan struct{})
		var tail []string
		go func() {
			defer close(done)
			sc := bufio.NewScanner(pr)
			sc.Buffer(make([]byte, 64<<10), 1<<20)
			for sc.Scan() {
				line := sc.Text()
				tail = append(tail, line)
				if len(tail) > 30 {
					tail = tail[1:]
				}
				a.emit("dockerbuild", DockerBuildEvent{Kind: "line", Text: line})
			}
		}()
		err := cmd.Start()
		if err == nil {
			err = cmd.Wait()
		}
		pw.Close()
		<-done
		ev := DockerBuildEvent{Kind: "done", OK: err == nil, Image: image, Secs: int(time.Since(t0).Seconds())}
		if err != nil {
			ev.Error = buildError(ctx, err, strings.Join(tail, "\n"))
		}
		a.emit("dockerbuild", ev)
	}()
	return nil
}

func buildError(ctx context.Context, err error, tail string) string {
	if ctx.Err() != nil {
		return "Cancelado."
	}
	low := strings.ToLower(tail)
	switch {
	case strings.Contains(low, "permission denied") && strings.Contains(low, "docker.sock"):
		return "Tu usuario no puede usar Docker todavía: mira la pantalla «Servidor de pruebas» (puede que haga falta reiniciar el equipo)."
	case strings.Contains(low, "cannot connect to the docker daemon"):
		return "Docker no está en marcha en este equipo."
	}
	return "La construcción ha fallado (" + err.Error() + "). Mira las últimas líneas de la salida."
}

// CancelDockerBuild para la construcción en marcha.
func (a *App) CancelDockerBuild() bool {
	buildMu.Lock()
	defer buildMu.Unlock()
	if buildCancel == nil {
		return false
	}
	buildCancel()
	return true
}

// OpenProjectDir abre la carpeta en el gestor de archivos.
func (a *App) OpenProjectDir(dir string) error {
	dir, err := projectDir(dir)
	if err != nil {
		return err
	}
	runtime.BrowserOpenURL(a.ctx, "file://"+dir)
	return nil
}

// SaveTextFile pregunta dónde guardar un texto (p. ej. la configuración
// WireGuard de un dispositivo) y lo guarda con permisos 600. "" = cancelado.
func (a *App) SaveTextFile(defaultName, content string) (string, error) {
	home, _ := os.UserHomeDir()
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:            "Guardar",
		DefaultDirectory: home,
		DefaultFilename:  filepath.Base(defaultName),
	})
	if err != nil || path == "" {
		return "", err
	}
	return path, writeFileAtomic(path, []byte(content), 0o600)
}
