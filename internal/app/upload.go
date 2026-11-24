package app

import (
	"archive/tar"
	"bufio"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"

	"draupnode/internal/bundle"
	"draupnode/internal/modules"
	"draupnode/internal/runner"
	"draupnode/internal/store"

	"golang.org/x/crypto/ssh"
)

// Tu app con «carpeta»: el código sale de una carpeta de este equipo y
// Draupnode lo sube al servidor (tar por SSH) justo antes de aplicar. Se sube
// sin lo que no debe ir: .git, .env, entornos virtuales, node_modules… ni lo
// que diga su .dockerignore.

var dockerFileRe = regexp.MustCompile(`^(Dockerfile.*|.*compose.*\.ya?ml|docker-entrypoint.*|nginx.*\.conf|.*\.dockerignore)$`)

// Siempre fuera (además del .dockerignore).
var uploadSkip = []string{".git", ".env", ".venv", "venv", "env", "node_modules", "__pycache__", "*.pyc", ".DS_Store", ".idea", ".vscode", "*.sqlite3", "*.zip"}

// dockerignore lee los patrones del .dockerignore (sin «!» de excepción, que se ignoran).
func dockerignore(dir string) []string {
	var out []string
	f, err := os.Open(filepath.Join(dir, ".dockerignore"))
	if err != nil {
		return out
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		l := strings.TrimSpace(sc.Text())
		if l == "" || strings.HasPrefix(l, "#") || strings.HasPrefix(l, "!") {
			continue
		}
		out = append(out, strings.TrimPrefix(strings.TrimSuffix(l, "/"), "./"))
	}
	return out
}

// skipUpload: ¿se queda fuera esta ruta (relativa, con «/»)? Vale tanto el
// nombre suelto (en cualquier carpeta) como la ruta desde la raíz, y «**/».
func skipUpload(rel string, patterns []string) bool {
	base := path.Base(rel)
	// Lo que hace falta para construir y arrancar sube siempre, aunque el
	// .dockerignore lo excluya (ese fichero es para la imagen, no para la subida).
	if base == ".env.example" || base == ".dockerignore" || dockerFileRe.MatchString(base) {
		return false
	}
	for _, p := range patterns {
		p = strings.TrimPrefix(p, "**/")
		if ok, _ := path.Match(p, base); ok {
			return true
		}
		if ok, _ := path.Match(p, rel); ok {
			return true
		}
		if strings.HasPrefix(rel, p+"/") {
			return true
		}
	}
	return false
}

// tarDir escribe en w el .tar.gz de la carpeta (sin lo que se queda fuera) y
// devuelve cuántos ficheros y bytes lleva.
func tarDir(dir string, w io.Writer) (files int, size int64, err error) {
	patterns := append(append([]string{}, uploadSkip...), dockerignore(dir)...)
	gz := gzip.NewWriter(w)
	tw := tar.NewWriter(gz)
	err = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dir, p)
		rel = filepath.ToSlash(rel)
		if rel == "." {
			return nil
		}
		if skipUpload(rel, patterns) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() && !info.IsDir() {
			return nil // enlaces y demás: fuera
		}
		hdr, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		hdr.Name, hdr.Uid, hdr.Gid, hdr.Uname, hdr.Gname = rel, 0, 0, "", ""
		if info.IsDir() {
			hdr.Name += "/"
		}
		if err := tw.WriteHeader(hdr); err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		f, err := os.Open(p)
		if err != nil {
			return err
		}
		n, err := io.Copy(tw, f)
		f.Close()
		files++
		size += n
		return err
	})
	if err == nil {
		err = tw.Close()
	}
	if err == nil {
		err = gz.Close()
	}
	return files, size, err
}

// localApps: las apps «Tu app» del servidor que salen de una carpeta de este equipo.
func localApps(p store.Project) []store.ProjectModule {
	var out []store.ProjectModule
	for _, m := range p.Modules {
		if base, _ := modules.SplitID(m.ID); base == "git-app" && fmt.Sprint(m.Values["git_app_source"]) == "carpeta" {
			out = append(out, m)
		}
	}
	return out
}

// uploadLocalApps sube al servidor el código de cada «Tu app» con «carpeta».
// simDir: dónde se sube la carpeta en una simulación (no toca la app; se borra al terminar).
func simDir(slug string) string { return "/var/lib/draupnode/simulacion/" + slug }

func (a *App) uploadLocalApps(ctx context.Context, c *ssh.Client, su runner.Sudo, p store.Project, note func(string)) error {
	return a.uploadLocalAppsTo(ctx, c, su, p, "/srv/draupnode/apps", note)
}

// uploadLocalAppsTo sube cada app con «carpeta» a <base>/<nombre>.
func (a *App) uploadLocalAppsTo(ctx context.Context, c *ssh.Client, su runner.Sudo, p store.Project, base string, note func(string)) error {
	for _, m := range localApps(p) {
		dir, _ := m.Values["git_app_local_dir"].(string)
		name, _ := m.Values["git_app_name"].(string)
		if st, err := os.Stat(dir); err != nil || !st.IsDir() {
			return fmt.Errorf("%s: no encuentro la carpeta %q en este equipo", a.moduleName(m.ID), dir)
		}
		if !gitNameRe.MatchString(name) {
			return fmt.Errorf("%s: nombre de app no válido", a.moduleName(m.ID))
		}
		dest := base + "/" + name
		pr, pw := io.Pipe()
		var files int
		var size int64
		go func() {
			var err error
			files, size, err = tarDir(dir, pw)
			pw.CloseWithError(err)
		}()
		cmd := "mkdir -p " + bundle.ShellQuote(dest) + " && tar -xzf - --no-same-owner -C " + bundle.ShellQuote(dest)
		var errb strings.Builder
		if err := runner.Exec(ctx, c, su, cmd, pr, io.Discard, &errb); err != nil {
			return fmt.Errorf("%s: no se pudo subir el código: %s", a.moduleName(m.ID), firstLine(errb.String(), err))
		}
		note(fmt.Sprintf("%s: código subido desde %s (%d ficheros, %.1f MB) a %s.", a.moduleName(m.ID), dir, files, float64(size)/1e6, dest))
	}
	return nil
}
