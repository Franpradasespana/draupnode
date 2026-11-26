package app

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"

	"draupnode/internal/bundle"
	"draupnode/internal/i18n"
	"draupnode/internal/runner"
)

// Explorador de ficheros del servidor: listar, ver y editar ficheros de
// texto, subir, descargar, crear carpetas, renombrar y borrar. Va por SSH con
// sudo (como el resto de Draupnode), no por SFTP: así llega también a /etc o
// /srv aunque se entre con un usuario normal.

// MaxEditBytes: lo más grande que se abre en el editor.
const MaxEditBytes = 2 << 20

// FileEntry es una entrada de una carpeta.
type FileEntry struct {
	Name   string `json:"name"`
	Type   string `json:"type"` // dir | file | link | other
	Size   int64  `json:"size"`
	Mode   string `json:"mode"`
	Owner  string `json:"owner"`
	Mtime  int64  `json:"mtime"`
	Target string `json:"target,omitempty"` // enlaces: a dónde apuntan
	Dir    bool   `json:"dir"`              // enlaces a carpetas cuentan como carpeta
}

// FilesResult es la respuesta de las operaciones del explorador.
type FilesResult struct {
	RunStart
	Path    string      `json:"path,omitempty"`
	Entries []FileEntry `json:"entries,omitempty"`
	Content string      `json:"content,omitempty"`
	Size    int64       `json:"size,omitempty"`
	Binary  bool        `json:"binary,omitempty"`
	Saved   string      `json:"saved,omitempty"` // descargas: dónde quedó en este equipo
	Count   int         `json:"count,omitempty"` // subidas: cuántos ficheros
}

// cleanRemotePath: una ruta absoluta limpia del servidor ("" si no vale).
func cleanRemotePath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" || !strings.HasPrefix(p, "/") || strings.ContainsAny(p, "\x00\n\r") {
		return ""
	}
	return path.Clean(p)
}

// protectedPath: lo que nunca se borra ni se renombra desde aquí.
func protectedPath(p string) bool {
	switch p {
	case "/", "/bin", "/boot", "/dev", "/etc", "/home", "/lib", "/lib64", "/opt", "/proc", "/root", "/run",
		"/sbin", "/srv", "/sys", "/tmp", "/usr", "/var", "/var/lib", "/var/lib/docker", "/etc/draupnode", "/srv/draupnode":
		return true
	}
	return false
}

const listScript = `import json, os, pwd, stat, sys
p = sys.argv[1]
out = []
for n in sorted(os.listdir(p)):
    f = os.path.join(p, n)
    try:
        st = os.lstat(f)
    except OSError:
        continue
    t = "dir" if stat.S_ISDIR(st.st_mode) else "file" if stat.S_ISREG(st.st_mode) else "link" if stat.S_ISLNK(st.st_mode) else "other"
    e = {"name": n, "type": t, "size": st.st_size, "mode": stat.filemode(st.st_mode), "mtime": int(st.st_mtime), "dir": t == "dir"}
    try:
        e["owner"] = pwd.getpwuid(st.st_uid).pw_name
    except KeyError:
        e["owner"] = str(st.st_uid)
    if t == "link":
        e["target"] = os.readlink(f)
        e["dir"] = os.path.isdir(f)
    out.append(e)
print(json.dumps(out))
`

func (a *App) withFiles(serverID, secret, accept, sudoPassword string, fn func(c *ssh.Client, su runner.Sudo) FilesResult) FilesResult {
	var res FilesResult
	st := a.withServerConn(serverID, secret, accept, sudoPassword, func(c *ssh.Client, su runner.Sudo) RunStart {
		res = fn(c, su)
		if res.Status == "" {
			res.Status = "ok"
		}
		return res.RunStart
	})
	res.RunStart = st
	return res
}

func filesErr(msg string) FilesResult {
	return FilesResult{RunStart: RunStart{Status: "error", Message: msg}}
}

// FilesList lista una carpeta del servidor.
func (a *App) FilesList(serverID, dir, secret, accept, sudoPassword string) FilesResult {
	p := cleanRemotePath(dir)
	if p == "" {
		return filesErr(i18n.T("ruta no válida (tiene que empezar por /)"))
	}
	return a.withFiles(serverID, secret, accept, sudoPassword, func(c *ssh.Client, su runner.Sudo) FilesResult {
		out, errOut, err := execOut(c, su, "python3 - "+bundle.ShellQuote(p)+" <<'DRAUPNODE_LS'\n"+listScript+"DRAUPNODE_LS")
		if err != nil {
			return filesErr(filesErrText(errOut, err))
		}
		var e []FileEntry
		if err := json.Unmarshal([]byte(lastJSONLine(out)), &e); err != nil {
			return filesErr(i18n.T("respuesta no válida del servidor: ") + err.Error())
		}
		if e == nil {
			e = []FileEntry{}
		}
		return FilesResult{Path: p, Entries: e}
	})
}

func filesErrText(errOut string, err error) string {
	s := errOut
	if strings.TrimSpace(s) == "" && err != nil {
		s = err.Error()
	}
	switch {
	case strings.Contains(s, "No such file") || strings.Contains(s, "FileNotFoundError"):
		return i18n.T("no existe")
	case strings.Contains(s, "Not a directory") || strings.Contains(s, "NotADirectoryError"):
		return i18n.T("no es una carpeta")
	case strings.Contains(s, "Permission denied") || strings.Contains(s, "PermissionError"):
		return i18n.T("sin permiso")
	}
	// La última línea con algo (en Python, la del error; no «Traceback…»).
	lines := strings.Split(strings.TrimSpace(s), "\n")
	return strings.TrimSpace(lines[len(lines)-1])
}

// FilesRead lee un fichero para verlo o editarlo (hasta MaxEditBytes).
func (a *App) FilesRead(serverID, file, secret, accept, sudoPassword string) FilesResult {
	p := cleanRemotePath(file)
	if p == "" {
		return filesErr(i18n.T("ruta no válida (tiene que empezar por /)"))
	}
	return a.withFiles(serverID, secret, accept, sudoPassword, func(c *ssh.Client, su runner.Sudo) FilesResult {
		q := bundle.ShellQuote(p)
		sz, errOut, err := execOut(c, su, "test -f "+q+" && stat -c %s "+q)
		if err != nil {
			if strings.TrimSpace(errOut) == "" {
				return filesErr(i18n.T("no es un fichero"))
			}
			return filesErr(filesErrText(errOut, err))
		}
		var size int64
		for _, ch := range strings.TrimSpace(sz) {
			size = size*10 + int64(ch-'0')
		}
		if size > MaxEditBytes {
			return FilesResult{Path: p, Size: size, Binary: true, RunStart: RunStart{Status: "ok", Message: i18n.T("es demasiado grande para abrirlo aquí: descárgalo")}}
		}
		var out, eb bytes.Buffer
		if err := runner.Exec(context.Background(), c, su, "cat "+q, nil, &out, &eb); err != nil {
			return filesErr(filesErrText(eb.String(), err))
		}
		b := out.Bytes()
		if bytes.IndexByte(b, 0) >= 0 || !utf8.Valid(b) {
			return FilesResult{Path: p, Size: size, Binary: true, RunStart: RunStart{Status: "ok", Message: i18n.T("no es un fichero de texto: descárgalo")}}
		}
		return FilesResult{Path: p, Size: size, Content: string(b)}
	})
}

// FilesWrite guarda un fichero de texto. Si ya existía, conserva su dueño y
// sus permisos; se escribe en uno temporal y se cambia de golpe.
func (a *App) FilesWrite(serverID, file, content, secret, accept, sudoPassword string) FilesResult {
	p := cleanRemotePath(file)
	if p == "" || p == "/" {
		return filesErr(i18n.T("ruta no válida (tiene que empezar por /)"))
	}
	if len(content) > MaxEditBytes {
		return filesErr(i18n.T("demasiado grande"))
	}
	return a.withFiles(serverID, secret, accept, sudoPassword, func(c *ssh.Client, su runner.Sudo) FilesResult {
		if err := writeRemote(c, su, p, strings.NewReader(content)); err != nil {
			return filesErr(err.Error())
		}
		return FilesResult{Path: p, Size: int64(len(content))}
	})
}

// writeRemote escribe lo que llega por r en el fichero p del servidor.
func writeRemote(c *ssh.Client, su runner.Sudo, p string, r io.Reader) error {
	q := bundle.ShellQuote(p)
	cmd := `f=` + q + `; d=$(dirname "$f"); [ -d "$d" ] || { echo "no existe la carpeta $d" >&2; exit 1; }
t=$(mktemp "$d/.draupnode.XXXXXX") || exit 1
cat > "$t" || { rm -f "$t"; exit 1; }
if [ -e "$f" ]; then chmod --reference="$f" "$t"; chown --reference="$f" "$t"; else chmod 0644 "$t"; fi
mv -f "$t" "$f"`
	var eb bytes.Buffer
	if err := runner.Exec(context.Background(), c, su, cmd, r, io.Discard, &eb); err != nil {
		return errText(filesErrText(eb.String(), err))
	}
	return nil
}

// FilesMkdir crea una carpeta (y las de antes si faltan).
func (a *App) FilesMkdir(serverID, dir, secret, accept, sudoPassword string) FilesResult {
	p := cleanRemotePath(dir)
	if p == "" || p == "/" {
		return filesErr(i18n.T("ruta no válida (tiene que empezar por /)"))
	}
	return a.withFiles(serverID, secret, accept, sudoPassword, func(c *ssh.Client, su runner.Sudo) FilesResult {
		if _, errOut, err := execOut(c, su, "mkdir -p "+bundle.ShellQuote(p)); err != nil {
			return filesErr(filesErrText(errOut, err))
		}
		return FilesResult{Path: p}
	})
}

// FilesRename cambia de nombre o mueve (no pisa uno que ya exista).
func (a *App) FilesRename(serverID, from, to, secret, accept, sudoPassword string) FilesResult {
	f, t := cleanRemotePath(from), cleanRemotePath(to)
	if f == "" || t == "" {
		return filesErr(i18n.T("ruta no válida (tiene que empezar por /)"))
	}
	if protectedPath(f) {
		return filesErr(i18n.T("es una carpeta del sistema: no se toca desde aquí"))
	}
	return a.withFiles(serverID, secret, accept, sudoPassword, func(c *ssh.Client, su runner.Sudo) FilesResult {
		if _, errOut, err := execOut(c, su, "if [ -e "+bundle.ShellQuote(t)+" ]; then echo 'ya existe' >&2; exit 1; fi; mv "+bundle.ShellQuote(f)+" "+bundle.ShellQuote(t)); err != nil {
			if strings.Contains(errOut, "ya existe") {
				return filesErr(i18n.T("ya hay algo con ese nombre"))
			}
			return filesErr(filesErrText(errOut, err))
		}
		return FilesResult{Path: t}
	})
}

// FilesDelete borra un fichero o una carpeta entera.
func (a *App) FilesDelete(serverID, target, secret, accept, sudoPassword string) FilesResult {
	p := cleanRemotePath(target)
	if p == "" {
		return filesErr(i18n.T("ruta no válida (tiene que empezar por /)"))
	}
	if protectedPath(p) {
		return filesErr(i18n.T("es una carpeta del sistema: no se toca desde aquí"))
	}
	return a.withFiles(serverID, secret, accept, sudoPassword, func(c *ssh.Client, su runner.Sudo) FilesResult {
		if _, errOut, err := execOut(c, su, "rm -rf --one-file-system -- "+bundle.ShellQuote(p)); err != nil {
			return filesErr(filesErrText(errOut, err))
		}
		return FilesResult{Path: p}
	})
}

// FilesDownload trae al equipo un fichero (o una carpeta, en .tar.gz). Pregunta dónde guardarlo.
func (a *App) FilesDownload(serverID, target string, isDir bool, secret, accept, sudoPassword string) FilesResult {
	p := cleanRemotePath(target)
	if p == "" || p == "/" {
		return filesErr(i18n.T("ruta no válida (tiene que empezar por /)"))
	}
	name := path.Base(p)
	if isDir {
		name += ".tar.gz"
	}
	home, _ := os.UserHomeDir()
	dest, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: i18n.T("Guardar"), DefaultDirectory: filepath.Join(home, "Descargas"), DefaultFilename: name})
	if err != nil || dest == "" {
		return FilesResult{RunStart: RunStart{Status: "canceled"}}
	}
	return a.downloadTo(serverID, p, isDir, dest, secret, accept, sudoPassword)
}

func (a *App) downloadTo(serverID, p string, isDir bool, dest, secret, accept, sudoPassword string) FilesResult {
	return a.withFiles(serverID, secret, accept, sudoPassword, func(c *ssh.Client, su runner.Sudo) FilesResult {
		cmd := "cat " + bundle.ShellQuote(p)
		if isDir {
			cmd = "tar -C " + bundle.ShellQuote(path.Dir(p)) + " -czf - " + bundle.ShellQuote(path.Base(p))
		}
		tmp := dest + ".descargando"
		f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
		if err != nil {
			return filesErr(err.Error())
		}
		var eb bytes.Buffer
		ctx, cancel := context.WithTimeout(context.Background(), 6*time.Hour)
		defer cancel()
		cw := &countWriter{w: f}
		err = runner.Exec(ctx, c, su, cmd, nil, cw, &eb)
		cerr := f.Close()
		if err == nil {
			err = cerr
		}
		if err != nil {
			_ = os.Remove(tmp)
			return filesErr(filesErrText(eb.String(), err))
		}
		if err := os.Rename(tmp, dest); err != nil {
			return filesErr(err.Error())
		}
		return FilesResult{Path: p, Saved: dest, Size: cw.n}
	})
}

type countWriter struct {
	w io.Writer
	n int64
}

func (c *countWriter) Write(b []byte) (int, error) {
	n, err := c.w.Write(b)
	c.n += int64(n)
	return n, err
}

// FilesUpload sube ficheros de este equipo a una carpeta del servidor
// (pregunta cuáles). No pisa los que ya existan.
func (a *App) FilesUpload(serverID, dir, secret, accept, sudoPassword string) FilesResult {
	d := cleanRemotePath(dir)
	if d == "" {
		return filesErr(i18n.T("ruta no válida (tiene que empezar por /)"))
	}
	home, _ := os.UserHomeDir()
	files, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{Title: i18n.T("Subir al servidor"), DefaultDirectory: home})
	if err != nil || len(files) == 0 {
		return FilesResult{RunStart: RunStart{Status: "canceled"}}
	}
	return a.uploadFiles(serverID, d, files, secret, accept, sudoPassword)
}

func (a *App) uploadFiles(serverID, d string, files []string, secret, accept, sudoPassword string) FilesResult {
	return a.withFiles(serverID, secret, accept, sudoPassword, func(c *ssh.Client, su runner.Sudo) FilesResult {
		n := 0
		for _, lf := range files {
			name := filepath.Base(lf)
			target := path.Join(d, name)
			if out, _, _ := execOut(c, su, "[ -e "+bundle.ShellQuote(target)+" ] && echo si; true"); strings.TrimSpace(out) == "si" {
				return FilesResult{Path: d, Count: n, RunStart: RunStart{Status: "error", Message: i18n.Sprintf("ya existe %s en el servidor: no se ha pisado (subidos %d)", name, n)}}
			}
			f, err := os.Open(lf)
			if err != nil {
				return filesErr(err.Error())
			}
			err = writeRemote(c, su, target, f)
			f.Close()
			if err != nil {
				return FilesResult{Path: d, Count: n, RunStart: RunStart{Status: "error", Message: name + ": " + err.Error()}}
			}
			n++
		}
		return FilesResult{Path: d, Count: n}
	})
}
