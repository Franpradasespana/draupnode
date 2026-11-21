package main

import (
	"archive/tar"
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"draupnode/internal/bundle"
	"draupnode/internal/dockerize"
	"draupnode/internal/lab"
	"draupnode/internal/runner"
	"draupnode/internal/store"

	"golang.org/x/crypto/ssh"
)

// «Probar en el servidor de pruebas» (Docker Creator): sube el proyecto al
// servidor de pruebas (Ubuntu en Docker en este equipo; se crea si no está),
// lo arranca con el compose generado y comprueba que responde. Se ve en el
// navegador por un túnel SSH.

// DockerLabEvent llega a la interfaz por el evento «dockerlab».
type DockerLabEvent struct {
	Kind   string `json:"kind"` // stage | line | done
	Text   string `json:"text,omitempty"`
	OK     bool   `json:"ok,omitempty"`
	Error  string `json:"error,omitempty"`
	URL    string `json:"url,omitempty"`
	HTTP   int    `json:"http,omitempty"`
	Output string `json:"output,omitempty"`
}

var (
	labTestMu     sync.Mutex
	labTestCancel context.CancelFunc
)

const labTestBase = "/srv/draupnode/pruebas-docker/"

// labTestProject: «proyecto» ficticio para reutilizar el túnel por SSH.
func labTestProject(serverID string) store.Project {
	return store.Project{ID: "docker-creator", ServerID: serverID}
}

// DockerLabTest empieza la prueba en segundo plano (eventos «dockerlab»).
func (a *App) DockerLabTest(dir string, spec dockerize.Spec) error {
	dir, err := projectDir(dir)
	if err != nil {
		return err
	}
	if errs := spec.Validate(); len(errs) > 0 {
		return errors.New(strings.Join(errs, "; "))
	}
	if _, err := os.Stat(filepath.Join(dir, spec.Names().Compose)); err != nil {
		return errors.New("guarda antes los ficheros (falta " + spec.Names().Compose + ")")
	}
	labTestMu.Lock()
	if labTestCancel != nil {
		labTestMu.Unlock()
		return errors.New("ya hay una prueba en marcha")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Minute)
	labTestCancel = cancel
	labTestMu.Unlock()
	go func() {
		defer func() {
			labTestMu.Lock()
			labTestCancel = nil
			labTestMu.Unlock()
			cancel()
		}()
		ev := a.runLabTest(ctx, dir, spec)
		if ctx.Err() == context.Canceled {
			ev = DockerLabEvent{Kind: "done", Error: "Cancelado."}
		}
		a.emit("dockerlab", ev)
	}()
	return nil
}

// CancelDockerLabTest para la prueba en marcha.
func (a *App) CancelDockerLabTest() bool {
	labTestMu.Lock()
	defer labTestMu.Unlock()
	if labTestCancel == nil {
		return false
	}
	labTestCancel()
	return true
}

func (a *App) labStage(s string) { a.emit("dockerlab", DockerLabEvent{Kind: "stage", Text: s}) }

// lineWriter manda cada línea de la salida como evento.
type lineWriter struct {
	a   *App
	buf bytes.Buffer
}

func (w *lineWriter) Write(p []byte) (int, error) {
	w.buf.Write(p)
	for {
		line, err := w.buf.ReadString('\n')
		if err != nil {
			w.buf.Reset()
			w.buf.WriteString(line)
			return len(p), nil
		}
		if t := strings.TrimRight(line, "\r\n"); strings.TrimSpace(t) != "" {
			w.a.emit("dockerlab", DockerLabEvent{Kind: "line", Text: t})
		}
	}
}

func fail(msg string) DockerLabEvent { return DockerLabEvent{Kind: "done", Error: msg} }

func (a *App) runLabTest(ctx context.Context, dir string, spec dockerize.Spec) DockerLabEvent {
	out := func(s string) { a.emit("dockerlab", DockerLabEvent{Kind: "line", Text: s}) }
	l := a.lab()

	a.labStage("Comprobando Docker en este equipo")
	if st := l.Docker(ctx); st.Problem != lab.ProblemNone {
		return fail(st.Message + " Arréglalo en la pantalla «Servidor de pruebas» y vuelve a probar.")
	}

	if !l.Server(ctx).Running {
		a.labStage("Creando el servidor de pruebas (la primera vez tarda unos minutos)")
		a.labMu.Lock()
		if a.labBusy != "" {
			a.labMu.Unlock()
			return fail("La pantalla «Servidor de pruebas» está ocupada (" + a.labBusy + "): espera a que termine.")
		}
		a.labBusy = "start"
		a.labMu.Unlock()
		err := l.Start(ctx, out)
		if err == nil {
			err = a.labTrust()
		}
		a.labMu.Lock()
		a.labBusy = ""
		a.labMu.Unlock()
		if err != nil {
			return fail("No se pudo crear el servidor de pruebas: " + err.Error())
		}
	}
	if a.labServerID() == "" {
		if _, err := a.LabRegister(); err != nil {
			return fail("No se pudo dar de alta el servidor de pruebas: " + err.Error())
		}
	} else if err := a.labTrust(); err != nil {
		return fail(err.Error())
	}
	srv, err := a.store.Server(a.labServerID())
	if err != nil {
		return fail(err.Error())
	}
	c, su, rs := a.connectSudo(srv, "", "", "")
	if rs != nil {
		return fail("No se pudo conectar con el servidor de pruebas: " + rs.Message)
	}
	defer c.Close()
	w := &lineWriter{a: a}
	run := func(cmd string, stdin io.Reader) error { return runner.Exec(ctx, c, su, cmd, stdin, w, w) }

	a.labStage("Preparando Docker dentro del servidor de pruebas")
	if err := run(`if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then echo "Docker ya está instalado."; else
export DEBIAN_FRONTEND=noninteractive; apt-get update -q && apt-get install -y -q docker.io docker-compose-v2 && systemctl enable --now docker; fi`, nil); err != nil {
		return fail("No se pudo instalar Docker en el servidor de pruebas.")
	}

	a.labStage("Subiendo el proyecto")
	name := spec.Name
	remote := labTestBase + name
	tarball, notes, err := projectTar(dir, spec)
	if err != nil {
		return fail("No se pudo empaquetar el proyecto: " + err.Error())
	}
	for _, n := range notes {
		out(n)
	}
	out(fmt.Sprintf("%.1f MB", float64(tarball.Len())/1e6))
	q := bundle.ShellQuote(remote)
	if err := run("rm -rf "+q+" && mkdir -p "+q+" && tar -x -C "+q, tarball); err != nil {
		return fail("No se pudo subir el proyecto.")
	}

	a.labStage("Construyendo y arrancando (puede tardar)")
	cf := bundle.ShellQuote(spec.Names().Compose)
	proj := "dnp-" + name
	if err := run("cd "+q+" && docker compose -f "+cf+" -p "+proj+" up -d --build --quiet-pull --remove-orphans 2>&1", nil); err != nil {
		logs := labOut(ctx, c, su, "cd "+q+" && docker compose -f "+cf+" -p "+proj+" logs --tail 40 2>&1")
		return DockerLabEvent{Kind: "done", Error: "No arrancó: mira la salida (suele faltar algo en el Dockerfile o en el .env).", Output: logs}
	}

	port := dockerize.PublishedPort(spec)
	path := "/"
	if spec.HealthPath != "" && !spec.Proxy {
		path = spec.HealthPath
	}
	a.labStage(fmt.Sprintf("Comprobando que responde en el puerto %d", port))
	check := fmt.Sprintf(`python3 - <<'X'
import time, urllib.request, urllib.error
code = 0
for i in range(90):
    try:
        code = urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:%d%s", headers={"Host": %q}), timeout=5).status
    except urllib.error.HTTPError as e:
        code = e.code
    except Exception:
        code = 0
    if code and code < 500:
        break
    time.sleep(2)
print(code)
X`, port, path, hostHeader(spec, port))
	codeStr := strings.TrimSpace(labOut(ctx, c, su, check))
	code, _ := strconv.Atoi(lastLine(codeStr))
	ps := labOut(ctx, c, su, "cd "+q+" && docker compose -f "+cf+" -p "+proj+" ps --format '{{.Service}}: {{.Status}}' 2>&1; echo; docker compose -f "+cf+" -p "+proj+" logs --tail 25 2>&1")
	ev := DockerLabEvent{Kind: "done", HTTP: code, Output: ps}
	if code == 0 || code >= 500 {
		ev.Error = "Está arrancado pero no responde bien (" + httpText(code) + "). Mira los registros de abajo."
		return ev
	}
	t, st := a.openTunnel(labTestProject(srv.ID), "app", port, "", "")
	if st != nil {
		ev.Error = "Responde, pero no se pudo abrir el túnel para verlo: " + st.Message
		return ev
	}
	ev.OK, ev.URL = true, t.url()
	return ev
}

func hostHeader(spec dockerize.Spec, port int) string {
	if spec.Proxy && spec.ProxyDomain != "" {
		return spec.ProxyDomain
	}
	return "127.0.0.1:" + strconv.Itoa(port)
}

func httpText(code int) string {
	if code == 0 {
		return "no contesta"
	}
	return "HTTP " + strconv.Itoa(code)
}

func lastLine(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.LastIndexByte(s, '\n'); i >= 0 {
		return s[i+1:]
	}
	return s
}

func labOut(ctx context.Context, c *ssh.Client, su runner.Sudo, cmd string) string {
	var b bytes.Buffer
	_ = runner.Exec(ctx, c, su, cmd, nil, &b, &b)
	return strings.TrimSpace(b.String())
}

// DockerLabStop para y borra la prueba (contenedores, volúmenes, imagen y carpeta).
func (a *App) DockerLabStop(dir string, spec dockerize.Spec) error {
	id := a.labServerID()
	if id == "" {
		return nil
	}
	a.tunMu.Lock()
	if t := a.tunnels["docker-creator|app"]; t != nil {
		t.close()
		delete(a.tunnels, "docker-creator|app")
	}
	a.tunMu.Unlock()
	srv, err := a.store.Server(id)
	if err != nil {
		return err
	}
	c, su, rs := a.connectSudo(srv, "", "", "")
	if rs != nil {
		return errors.New(rs.Message)
	}
	defer c.Close()
	q := bundle.ShellQuote(labTestBase + spec.Name)
	cmd := "cd " + q + " 2>/dev/null && docker compose -f " + bundle.ShellQuote(spec.Names().Compose) + " -p dnp-" + spec.Name + " down -v --rmi local >/dev/null 2>&1; rm -rf " + q
	return runner.Exec(a.context(), c, su, cmd, nil, io.Discard, io.Discard)
}

// Carpetas que no se suben (se rehacen dentro de la imagen o no hacen falta).
var labSkipDirs = map[string]bool{".git": true, "node_modules": true, ".venv": true, "venv": true, "__pycache__": true,
	".mypy_cache": true, ".pytest_cache": true, "target": true, ".gradle": true, ".next": true, ".idea": true, ".vscode": true}

// projectTar empaqueta la carpeta del proyecto para el servidor de pruebas.
// Sin .env, crea uno de prueba a partir de .env.example (y DB_PASSWORD al
// azar si el compose la pide). Con dominio en nginx, la prueba también
// responde a 127.0.0.1 (para verla por el túnel).
func projectTar(dir string, spec dockerize.Spec) (*bytes.Buffer, []string, error) {
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	var notes []string
	var total int64
	add := func(name string, data []byte, mode int64) error {
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: mode, Size: int64(len(data)), ModTime: time.Now()}); err != nil {
			return err
		}
		_, err := tw.Write(data)
		return err
	}
	n := spec.Names()
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dir, p)
		if rel == "." {
			return nil
		}
		if d.IsDir() {
			if labSkipDirs[d.Name()] {
				return filepath.SkipDir
			}
			return nil
		}
		if !d.Type().IsRegular() {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		total += info.Size()
		if total > 1<<30 {
			return errors.New("el proyecto pasa de 1 GB (sin node_modules, .git…): demasiado para probar así")
		}
		data, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if spec.Proxy && spec.ProxyDomain != "" && rel == n.Nginx {
			data = bytes.Replace(data, []byte("server_name "+spec.ProxyDomain+";"), []byte("server_name "+spec.ProxyDomain+" localhost 127.0.0.1;"), 1)
		}
		return add(rel, data, int64(info.Mode().Perm()))
	})
	if err != nil {
		return nil, nil, err
	}
	if _, err := os.Stat(filepath.Join(dir, ".env")); err != nil {
		env, _ := os.ReadFile(filepath.Join(dir, ".env.example"))
		compose, _ := os.ReadFile(filepath.Join(dir, n.Compose))
		if bytes.Contains(compose, []byte("DB_PASSWORD:?")) && !envHas(env, "DB_PASSWORD") {
			env = append(env, []byte("\nDB_PASSWORD="+randomToken(24)+"\n")...)
		}
		if len(env) > 0 {
			if err := add(".env", env, 0o600); err != nil {
				return nil, nil, err
			}
			notes = append(notes, "No hay .env: para la prueba se ha creado uno (de .env.example y, si hacía falta, con DB_PASSWORD al azar).")
		}
	}
	if err := tw.Close(); err != nil {
		return nil, nil, err
	}
	return &buf, notes, nil
}

func envHas(env []byte, key string) bool {
	sc := bufio.NewScanner(bytes.NewReader(env))
	for sc.Scan() {
		k, v, ok := strings.Cut(strings.TrimSpace(sc.Text()), "=")
		if ok && strings.TrimSpace(k) == key && strings.TrimSpace(v) != "" {
			return true
		}
	}
	return false
}
