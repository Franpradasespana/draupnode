package app

import (
	"archive/tar"
	"bufio"
	"bytes"
	"context"
	"draupnode/internal/i18n"
	"encoding/json"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"draupnode/internal/bundle"
	"draupnode/internal/runner"
	"draupnode/internal/store"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
)

// Copias de seguridad (módulo «backups»): ver las copias, hacer una ahora y
// traerlas a este equipo por la misma conexión SSH.

const backupsModule = "backups"

// backupPaths son las rutas del módulo en el servidor para un proyecto.
type backupPaths struct {
	Repo, Password, Script, Unit string
	Remote                       bool
}

func (a *App) backupPathsFor(p store.Project) (backupPaths, error) {
	if !contains(p.InstalledModules, backupsModule) {
		return backupPaths{}, i18n.New("las copias de seguridad no están instaladas en este servidor: marca «Copias de seguridad» y pulsa Aplicar")
	}
	m, ok := a.cat().Get(backupsModule)
	if !ok {
		return backupPaths{}, i18n.New("falta el módulo de copias")
	}
	v, _ := m.Values(p.InstalledValues[backupsModule])
	dir, _ := v["backups_dir"].(string)
	remote, _ := v["backups_remote_type"].(string)
	slug := slugOf(p)
	return backupPaths{
		Repo:     dir + "/" + slug + "/restic-repo",
		Password: bundle.SecretsDir(slug) + "/restic",
		Script:   "/usr/local/sbin/draupnode-copia-" + slug,
		Unit:     "draupnode-copia-" + slug,
		Remote:   remote != "" && remote != "no",
	}, nil
}

// BackupResult es la respuesta de las acciones de copias. Si Status no es
// «ok», la interfaz pide lo que falte (como en RunProject) y reintenta.
type BackupResult struct {
	RunStart
	Snapshots []Snapshot        `json:"snapshots,omitempty"`
	Output    string            `json:"output,omitempty"`
	OK        bool              `json:"ok"`
	Fetch     *store.FetchInfo  `json:"fetch,omitempty"`
	Verify    *BackupVerifyInfo `json:"verify,omitempty"`
}

// BackupVerifyInfo es el resultado de probar a restaurar la última copia.
type BackupVerifyInfo struct {
	At       int64    `json:"at"`
	Duration int64    `json:"duration"`
	OK       bool     `json:"ok"`
	Check    bool     `json:"check"`
	Partial  bool     `json:"partial"`
	Files    int64    `json:"files"`
	Bytes    int64    `json:"bytes"`
	Dumps    int      `json:"dumps"`
	DumpsBad []string `json:"dumpsBad"`
	Error    string   `json:"error"`
}

// Snapshot es una copia de restic.
type Snapshot struct {
	ID    string    `json:"id"`
	Time  time.Time `json:"time"`
	Tags  []string  `json:"tags"`
	Paths []string  `json:"paths"`
	Host  string    `json:"host"`
	Bytes int64     `json:"bytes,omitempty"` // tamaño de lo copiado (restic 0.17+)
}

// withServer conecta al servidor del proyecto y marca el proyecto como ocupado.
func (a *App) withServer(projectID, secret, accept, sudoPassword string, fn func(p store.Project, bp backupPaths, c *ssh.Client, su runner.Sudo) BackupResult) BackupResult {
	p, err := a.store.Project(projectID)
	if err != nil {
		return BackupResult{RunStart: RunStart{Status: "error", Message: err.Error()}}
	}
	bp, err := a.backupPathsFor(p)
	if err != nil {
		return BackupResult{RunStart: RunStart{Status: "error", Message: err.Error()}}
	}
	if a.projectRunning(projectID) {
		return BackupResult{RunStart: RunStart{Status: "busy", Message: i18n.T("este servidor está ocupado con otra tarea")}}
	}
	srv, err := a.store.Server(p.ServerID)
	if err != nil {
		return BackupResult{RunStart: RunStart{Status: "error", Message: err.Error()}}
	}
	c, su, fail := a.connectSudo(srv, secret, accept, sudoPassword)
	if fail != nil {
		return BackupResult{RunStart: *fail}
	}
	defer c.Close()
	_, cancel := context.WithCancel(context.Background())
	a.runMu.Lock()
	a.runs["p:"+projectID] = cancel
	a.runMu.Unlock()
	defer func() {
		a.runMu.Lock()
		delete(a.runs, "p:"+projectID)
		a.runMu.Unlock()
		cancel()
	}()
	r := fn(p, bp, c, su)
	if r.Status == "" {
		r.Status = "ok"
	}
	return r
}

func execOut(c *ssh.Client, su runner.Sudo, cmd string) (string, string, error) {
	var out, errb bytes.Buffer
	err := runner.Exec(context.Background(), c, su, cmd, nil, &out, &errb)
	return out.String(), errb.String(), err
}

// BackupSnapshots lista las copias (remote: las del destino remoto).
func (a *App) BackupSnapshots(projectID string, remote bool, secret, accept, sudoPassword string) BackupResult {
	return a.withServer(projectID, secret, accept, sudoPassword, func(p store.Project, bp backupPaths, c *ssh.Client, su runner.Sudo) BackupResult {
		arg := "snapshots"
		if remote {
			if !bp.Remote {
				return BackupResult{RunStart: RunStart{Status: "error", Message: i18n.T("las copias de este servidor no tienen destino remoto")}}
			}
			arg = "remoto"
		}
		out, errOut, err := execOut(c, su, bundle.ShellQuote(bp.Script)+" "+arg)
		if err != nil {
			return BackupResult{RunStart: RunStart{Status: "error", Message: i18n.T("no se pudieron leer las copias: ") + firstLine(errOut, err)}}
		}
		snaps, err := parseSnapshots(out)
		if err != nil {
			return BackupResult{RunStart: RunStart{Status: "error", Message: i18n.T("respuesta de restic no válida: ") + err.Error()}}
		}
		return BackupResult{OK: true, Snapshots: snaps}
	})
}

func parseSnapshots(out string) ([]Snapshot, error) {
	var raw []struct {
		ShortID  string    `json:"short_id"`
		Time     time.Time `json:"time"`
		Tags     []string  `json:"tags"`
		Paths    []string  `json:"paths"`
		Hostname string    `json:"hostname"`
		Summary  *struct {
			TotalBytesProcessed int64 `json:"total_bytes_processed"`
		} `json:"summary"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &raw); err != nil {
		return nil, err
	}
	snaps := make([]Snapshot, 0, len(raw))
	for _, r := range raw {
		s := Snapshot{ID: r.ShortID, Time: r.Time, Tags: r.Tags, Paths: r.Paths, Host: r.Hostname}
		if r.Summary != nil {
			s.Bytes = r.Summary.TotalBytesProcessed
		}
		if s.Tags == nil {
			s.Tags = []string{}
		}
		snaps = append(snaps, s)
	}
	sort.Slice(snaps, func(i, j int) bool { return snaps[i].Time.After(snaps[j].Time) })
	return snaps, nil
}

// BackupNow hace una copia ahora (lo mismo que el temporizador diario).
func (a *App) BackupNow(projectID, secret, accept, sudoPassword string) BackupResult {
	return a.withServer(projectID, secret, accept, sudoPassword, func(p store.Project, bp backupPaths, c *ssh.Client, su runner.Sudo) BackupResult {
		u := bundle.ShellQuote(bp.Unit + ".service")
		out, errOut, err := execOut(c, su, `t=$(date +%s); systemctl start `+u+`; rc=$?; journalctl -u `+u+` -o cat --no-pager --since @$t; exit $rc`)
		res := BackupResult{OK: err == nil, Output: strings.TrimSpace(out + errOut)}
		if err != nil && res.Output == "" {
			res.Output = err.Error()
		}
		return res
	})
}

// BackupVerify prueba ahora a restaurar la última copia en una carpeta aparte
// (lo mismo que hace el temporizador semanal) y devuelve el resultado.
func (a *App) BackupVerify(projectID, secret, accept, sudoPassword string) BackupResult {
	return a.withServer(projectID, secret, accept, sudoPassword, func(p store.Project, bp backupPaths, c *ssh.Client, su runner.Sudo) BackupResult {
		name := strings.TrimPrefix(bp.Unit, "draupnode-copia-")
		u := bundle.ShellQuote(bp.Unit + "-prueba.service")
		js := bundle.ShellQuote("/var/lib/draupnode/copias-prueba/" + name + ".json")
		cmd := `if [ -f /etc/systemd/system/` + bp.Unit + `-prueba.service ]; then systemctl start ` + u + `; else ` + bundle.ShellQuote(bp.Script) + ` prueba >/dev/null; fi; cat ` + js
		out, errOut, _ := execOut(c, su, cmd)
		var v BackupVerifyInfo
		if err := json.Unmarshal([]byte(lastJSONLine(out)), &v); err != nil {
			msg := strings.TrimSpace(errOut)
			if msg == "" {
				msg = i18n.T("la prueba no dejó resultado (vuelve a aplicar el módulo Copias para tener la prueba)")
			}
			return BackupResult{RunStart: RunStart{Status: "error", Message: msg}}
		}
		return BackupResult{OK: v.OK, Verify: &v}
	})
}

// ChooseBackupFolder abre el diálogo para elegir dónde traer las copias.
func (a *App) ChooseBackupFolder(projectID string) (string, error) {
	p, err := a.store.Project(projectID)
	if err != nil {
		return "", err
	}
	def := ""
	if p.BackupsFetched != nil {
		def = filepath.Dir(p.BackupsFetched.Dir)
	} else if home, err := os.UserHomeDir(); err == nil {
		def = home
	}
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:                i18n.T("¿Dónde guardar las copias?"),
		DefaultDirectory:     def,
		CanCreateDirectories: true,
	})
}

// DefaultBackupFolder: la carpeta donde se trajeron la última vez o
// ~/Draupnode-copias/<proyecto>.
func (a *App) DefaultBackupFolder(projectID string) string {
	p, err := a.store.Project(projectID)
	if err != nil {
		return ""
	}
	if p.BackupsFetched != nil {
		return p.BackupsFetched.Dir
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Draupnode-copias", slugOf(p))
}

// BackupFetchProgress es el evento «backupfetch».
type BackupFetchProgress struct {
	ProjectID string `json:"projectId"`
	Done      int64  `json:"done"`
	Total     int64  `json:"total"`
	Stage     string `json:"stage"`
}

// FetchBackups trae a dest (en este equipo) el repositorio de copias y su
// contraseña. Solo descarga lo que falta: los ficheros de restic no cambian
// una vez escritos. Lo que ya no está en el servidor (copias viejas) se borra.
func (a *App) FetchBackups(projectID, dest, secret, accept, sudoPassword string) BackupResult {
	dest = strings.TrimSpace(dest)
	if dest == "" || !filepath.IsAbs(dest) {
		return BackupResult{RunStart: RunStart{Status: "error", Message: i18n.T("elige una carpeta de este equipo")}}
	}
	return a.withServer(projectID, secret, accept, sudoPassword, func(p store.Project, bp backupPaths, c *ssh.Client, su runner.Sudo) BackupResult {
		progress := func(stage string, done, total int64) {
			a.emit("backupfetch", BackupFetchProgress{ProjectID: projectID, Done: done, Total: total, Stage: stage})
		}
		info, err := fetchRepo(c, su, bp, dest, progress)
		if err != nil {
			return BackupResult{RunStart: RunStart{Status: "error", Message: err.Error()}}
		}
		info.At = time.Now()
		_ = a.store.SetBackupsFetched(projectID, info)
		return BackupResult{OK: true, Fetch: &info}
	})
}

func fetchRepo(c *ssh.Client, su runner.Sudo, bp backupPaths, dest string, progress func(string, int64, int64)) (store.FetchInfo, error) {
	info := store.FetchInfo{Dir: dest}
	repoDir := filepath.Join(dest, "restic-repo")
	if err := os.MkdirAll(repoDir, 0o700); err != nil {
		return info, err
	}
	_ = os.Chmod(dest, 0o700)

	// 1. Qué hay en el servidor.
	progress(i18n.T("Mirando qué hay en el servidor"), 0, 0)
	out, errOut, err := execOut(c, su, "cd "+bundle.ShellQuote(bp.Repo)+" && find . -type f -printf '%P\\t%s\\n'")
	if err != nil {
		return info, i18n.Errorf("no se pudo leer el repositorio del servidor (%s): %s", bp.Repo, firstLine(errOut, err))
	}
	remote := map[string]int64{}
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		name, size, ok := strings.Cut(line, "\t")
		if !ok {
			continue
		}
		n, _ := strconv.ParseInt(size, 10, 64)
		if safeRel(name) {
			remote[name] = n
			info.Bytes += n
		}
	}
	if len(remote) == 0 {
		return info, i18n.New("el repositorio del servidor está vacío: haz antes una copia")
	}

	// 2. Qué falta aquí (o tiene otro tamaño).
	var need []string
	var total int64
	for name, size := range remote {
		st, err := os.Stat(filepath.Join(repoDir, filepath.FromSlash(name)))
		if err != nil || st.Size() != size {
			need = append(need, name)
			total += size
		}
	}
	sort.Strings(need)

	// 3. Traerlo en un tar (sin comprimir: los datos de restic ya lo están).
	if len(need) > 0 {
		var done int64
		last := time.Now()
		pr, pw := io.Pipe()
		var errb bytes.Buffer
		go func() {
			err := runner.Exec(context.Background(), c, su, "tar -C "+bundle.ShellQuote(bp.Repo)+" -cf - -T -",
				strings.NewReader(strings.Join(need, "\n")+"\n"), pw, &errb)
			pw.CloseWithError(err)
		}()
		tr := tar.NewReader(bufio.NewReaderSize(pr, 1<<20))
		for {
			h, err := tr.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				return info, i18n.Errorf("al traer las copias: %v %s", err, strings.TrimSpace(errb.String()))
			}
			if h.Typeflag != tar.TypeReg || !safeRel(h.Name) {
				continue
			}
			target := filepath.Join(repoDir, filepath.FromSlash(h.Name))
			if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
				return info, err
			}
			tmp := target + ".parcial"
			f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
			if err != nil {
				return info, err
			}
			n, err := io.Copy(f, tr)
			f.Close()
			if err != nil {
				os.Remove(tmp)
				return info, err
			}
			if err := os.Rename(tmp, target); err != nil {
				return info, err
			}
			info.Files++
			done += n
			if time.Since(last) > 150*time.Millisecond {
				progress("Trayendo copias", done, total)
				last = time.Now()
			}
		}
		progress("Trayendo copias", total, total)
	}

	// 4. Borrar aquí lo que ya no está en el servidor (copias viejas, bloqueos).
	_ = filepath.WalkDir(repoDir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(repoDir, p)
		if _, ok := remote[filepath.ToSlash(rel)]; !ok {
			_ = os.Remove(p)
		}
		return nil
	})

	// 5. La contraseña y unas instrucciones.
	progress(i18n.T("Guardando la contraseña"), 0, 0)
	pass, errOut, err := execOut(c, su, "cat "+bundle.ShellQuote(bp.Password))
	if err != nil {
		return info, i18n.Errorf("no se pudo leer la contraseña de las copias: %s", firstLine(errOut, err))
	}
	if err := os.WriteFile(filepath.Join(dest, "restic-password"), []byte(strings.TrimSpace(pass)+"\n"), 0o600); err != nil {
		return info, err
	}
	_ = os.WriteFile(filepath.Join(dest, "ULTIMA_COPIA.txt"), []byte(time.Now().Format("2006-01-02 15:04:05")+"\n"), 0o600)
	_ = os.WriteFile(filepath.Join(dest, "LEEME.txt"), []byte(leeme(dest)), 0o600)
	return info, nil
}

// safeRel: ruta relativa sin «..» ni nada raro (viene del servidor).
func safeRel(name string) bool {
	if name == "" || strings.HasPrefix(name, "/") || strings.Contains(name, "\\") {
		return false
	}
	clean := path.Clean(name)
	return clean == name && clean != "." && !strings.HasPrefix(clean, "../") && clean != ".."
}

func firstLine(s string, err error) string {
	s = strings.TrimSpace(s)
	if s == "" && err != nil {
		return err.Error()
	}
	if i := strings.IndexByte(s, '\n'); i > 0 {
		s = s[:i]
	}
	return s
}

func leeme(dest string) string {
	return `Copias de seguridad traídas por Draupnode
==========================================

restic-repo/      el repositorio de restic (cifrado)
restic-password   su contraseña: SIN ELLA NO SE PUEDE ABRIR. Guárdala también
                  en tu gestor de contraseñas.

Para verlas o restaurarlas necesitas restic (código abierto):
  Ubuntu/Debian: sudo apt install restic   ·   https://restic.net

  export RESTIC_REPOSITORY="` + filepath.Join(dest, "restic-repo") + `"
  export RESTIC_PASSWORD_FILE="` + filepath.Join(dest, "restic-password") + `"
  restic snapshots                           # lista las copias
  restic restore latest --target /tmp/restaurado
  restic ls --tag postgres latest /          # dónde están los volcados de PostgreSQL
  restic dump --tag postgres latest /postgres-pg-compartido/BASE.dump > BASE.dump
  pg_restore -d BASE BASE.dump               # (una base; los usuarios están en usuarios-y-permisos.sql)

Cada vez que pulses «Traer copias al equipo» solo se descarga lo nuevo.
`
}

// ---------------------------------------------------------------- restaurar

// SnapEntry es un fichero o carpeta dentro de una copia.
type SnapEntry struct {
	Name  string    `json:"name"`
	Path  string    `json:"path"`
	Type  string    `json:"type"` // dir | file | symlink…
	Size  int64     `json:"size"`
	Mtime time.Time `json:"mtime"`
}

// BackupRestoreResult amplía BackupResult con el listado de una carpeta.
type BackupRestoreResult struct {
	BackupResult
	Entries []SnapEntry `json:"entries,omitempty"`
}

var snapIDRe = regexp.MustCompile(`^[0-9a-f]{8,64}$`)
var dbNameRe = regexp.MustCompile(`^[a-z_][a-z0-9_-]{0,62}$`)

func badRequest(msg string) BackupResult {
	return BackupResult{RunStart: RunStart{Status: "error", Message: msg}}
}

// scriptErr traduce un fallo del script de copias; si es de una versión
// anterior sin estas órdenes, pide aplicar el proyecto.
func scriptErr(prefix, errOut string, err error) BackupResult {
	msg := firstLine(errOut, err)
	if strings.Contains(errOut, "Uso:") {
		msg = i18n.T("el script de copias del servidor es de una versión anterior: pulsa Aplicar en este servidor para actualizarlo")
	}
	return badRequest(prefix + msg)
}

func validPath(p string) bool {
	return strings.HasPrefix(p, "/") && !strings.ContainsAny(p, "\n\x00") && path.Clean(p) == p
}

// BackupLs lista una carpeta de una copia.
func (a *App) BackupLs(projectID, snapID, dir, secret, accept, sudoPassword string) BackupRestoreResult {
	if !snapIDRe.MatchString(snapID) || !validPath(dir) {
		return BackupRestoreResult{BackupResult: badRequest(i18n.T("copia o carpeta no válida"))}
	}
	var entries []SnapEntry
	r := a.withServer(projectID, secret, accept, sudoPassword, func(p store.Project, bp backupPaths, c *ssh.Client, su runner.Sudo) BackupResult {
		out, errOut, err := execOut(c, su, bundle.ShellQuote(bp.Script)+" ls "+snapID+" "+bundle.ShellQuote(dir))
		if err != nil {
			return scriptErr(i18n.T("no se pudo leer la copia: "), errOut, err)
		}
		entries = parseLs(out, dir)
		return BackupResult{OK: true}
	})
	if entries == nil {
		entries = []SnapEntry{}
	}
	return BackupRestoreResult{BackupResult: r, Entries: entries}
}

// parseLs lee la salida JSON (una línea por objeto) de «restic ls --json»
// y se queda con lo que está directamente dentro de dir.
func parseLs(out, dir string) []SnapEntry {
	entries := []SnapEntry{}
	for _, line := range strings.Split(out, "\n") {
		var n struct {
			StructType string    `json:"struct_type"`
			Name       string    `json:"name"`
			Type       string    `json:"type"`
			Path       string    `json:"path"`
			Size       int64     `json:"size"`
			Mtime      time.Time `json:"mtime"`
		}
		if json.Unmarshal([]byte(line), &n) != nil || n.StructType != "node" || n.Path == dir || path.Dir(n.Path) != dir {
			continue
		}
		entries = append(entries, SnapEntry{Name: n.Name, Path: n.Path, Type: n.Type, Size: n.Size, Mtime: n.Mtime})
	}
	sort.Slice(entries, func(i, j int) bool {
		if (entries[i].Type == "dir") != (entries[j].Type == "dir") {
			return entries[i].Type == "dir"
		}
		return entries[i].Name < entries[j].Name
	})
	return entries
}

// BackupRestore restaura rutas de una copia en el servidor, en target
// («/» = en su sitio original, sobrescribiendo).
func (a *App) BackupRestore(projectID, snapID, target string, paths []string, secret, accept, sudoPassword string) BackupResult {
	if !snapIDRe.MatchString(snapID) || !validPath(target) || len(paths) == 0 {
		return badRequest(i18n.T("copia, destino o rutas no válidas"))
	}
	args := []string{snapID, bundle.ShellQuote(target)}
	for _, p := range paths {
		if !validPath(p) {
			return badRequest(i18n.T("ruta no válida: ") + p)
		}
		args = append(args, bundle.ShellQuote(p))
	}
	return a.withServer(projectID, secret, accept, sudoPassword, func(p store.Project, bp backupPaths, c *ssh.Client, su runner.Sudo) BackupResult {
		out, errOut, err := execOut(c, su, bundle.ShellQuote(bp.Script)+" restaurar "+strings.Join(args, " "))
		if err != nil {
			return scriptErr(i18n.T("no se pudo restaurar: "), errOut, err)
		}
		return BackupResult{OK: true, Output: strings.TrimSpace(out + "\n" + errOut)}
	})
}

// BackupRestoreDB restaura una base de PostgreSQL desde un volcado
// (<carpeta>/<base>.dump) de una copia: en una base nueva (newName) o
// sustituyendo la actual (replace).
func (a *App) BackupRestoreDB(projectID, snapID, dumpPath, container, dbName string, replace bool, secret, accept, sudoPassword string) BackupResult {
	if !snapIDRe.MatchString(snapID) || !validPath(dumpPath) || !strings.HasSuffix(dumpPath, ".dump") || !dbNameRe.MatchString(container) || !dbNameRe.MatchString(dbName) {
		return badRequest(i18n.T("datos no válidos para restaurar la base"))
	}
	mode := ""
	if replace {
		mode = " sustituir"
	}
	return a.withServer(projectID, secret, accept, sudoPassword, func(p store.Project, bp backupPaths, c *ssh.Client, su runner.Sudo) BackupResult {
		out, errOut, err := execOut(c, su, bundle.ShellQuote(bp.Script)+" restaurar-bd "+snapID+" "+bundle.ShellQuote(dumpPath)+" "+container+" "+dbName+mode)
		if err != nil {
			return scriptErr(i18n.T("no se pudo restaurar la base: "), errOut, err)
		}
		return BackupResult{OK: true, Output: strings.TrimSpace(out + "\n" + errOut)}
	})
}

// BackupDownload descarga a dest (en este equipo) rutas de una copia, dentro
// de una carpeta con la fecha y el id de la copia. No toca el servidor.
func (a *App) BackupDownload(projectID, snapID string, paths []string, dest, secret, accept, sudoPassword string) BackupResult {
	dest = strings.TrimSpace(dest)
	if !snapIDRe.MatchString(snapID) || len(paths) == 0 || dest == "" || !filepath.IsAbs(dest) {
		return badRequest(i18n.T("copia, rutas o carpeta no válidas"))
	}
	for _, p := range paths {
		if !validPath(p) {
			return badRequest(i18n.T("ruta no válida: ") + p)
		}
	}
	return a.withServer(projectID, secret, accept, sudoPassword, func(p store.Project, bp backupPaths, c *ssh.Client, su runner.Sudo) BackupResult {
		root := filepath.Join(dest, "copia-"+snapID)
		if err := os.MkdirAll(root, 0o700); err != nil {
			return badRequest(err.Error())
		}
		var done int64
		files := 0
		last := time.Now()
		for _, sp := range paths {
			pr, pw := io.Pipe()
			var errb bytes.Buffer
			go func() {
				err := runner.Exec(context.Background(), c, su, bundle.ShellQuote(bp.Script)+" dump "+snapID+" "+bundle.ShellQuote(sp), nil, pw, &errb)
				pw.CloseWithError(err)
			}()
			tr := tar.NewReader(bufio.NewReaderSize(pr, 1<<20))
			for {
				h, err := tr.Next()
				if err == io.EOF {
					break
				}
				if err != nil {
					pr.CloseWithError(err)
					return scriptErr(i18n.T("no se pudo descargar: "), errb.String(), err)
				}
				name := strings.TrimPrefix(path.Clean("/"+h.Name), "/")
				if name == "" || !safeRel(name) {
					continue
				}
				target := filepath.Join(root, filepath.FromSlash(name))
				switch h.Typeflag {
				case tar.TypeDir:
					_ = os.MkdirAll(target, 0o700)
				case tar.TypeReg:
					if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
						return badRequest(err.Error())
					}
					f, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
					if err != nil {
						return badRequest(err.Error())
					}
					n, err := io.Copy(f, tr)
					f.Close()
					if err != nil {
						return badRequest(err.Error())
					}
					_ = os.Chtimes(target, h.ModTime, h.ModTime)
					done += n
					files++
					if time.Since(last) > 150*time.Millisecond {
						a.emit("backupfetch", BackupFetchProgress{ProjectID: projectID, Done: done, Stage: "Descargando " + name})
						last = time.Now()
					}
				}
			}
		}
		_ = os.Chmod(root, 0o700)
		return BackupResult{OK: true, Output: i18n.Sprintf("%d fichero(s), %d bytes, en %s", files, done, root), Fetch: &store.FetchInfo{Dir: root, Bytes: done, Files: files, At: time.Now()}}
	})
}

// SetBackupsAuto: qué hacer al abrir la app si las copias de este equipo son
// viejas: off | warn | fetch, a partir de days días.
func (a *App) SetBackupsAuto(projectID, mode string, days int) error {
	if mode != "off" && mode != "warn" && mode != "fetch" {
		return i18n.New("modo no válido")
	}
	if days < 1 || days > 365 {
		return i18n.New("los días deben estar entre 1 y 365")
	}
	return a.store.SetBackupsAuto(projectID, store.BackupsAuto{Mode: mode, Days: days})
}

// BackupDue: un proyecto cuyas copias en este equipo están viejas (o nunca se trajeron).
type BackupDue struct {
	ProjectID string `json:"projectId"`
	Name      string `json:"name"`
	Mode      string `json:"mode"` // warn | fetch
	Days      int    `json:"days"` // umbral
	Age       int    `json:"age"`  // días desde la última vez (-1 = nunca)
	Dest      string `json:"dest"` // carpeta donde se traen
}

// BackupsDue lista, al abrir la app, los proyectos con copias que conviene traer.
func (a *App) BackupsDue() []BackupDue {
	out := []BackupDue{}
	for _, p := range a.store.Projects() {
		if !contains(p.InstalledModules, "backups") {
			continue
		}
		auto := store.BackupsAuto{Mode: "warn", Days: 7}
		if p.BackupsAuto != nil {
			auto = *p.BackupsAuto
		}
		if auto.Mode == "off" {
			continue
		}
		age := -1
		if p.BackupsFetched != nil {
			age = int(time.Since(p.BackupsFetched.At).Hours() / 24)
			if age < auto.Days {
				continue
			}
		}
		out = append(out, BackupDue{ProjectID: p.ID, Name: p.Name, Mode: auto.Mode, Days: auto.Days, Age: age, Dest: a.DefaultBackupFolder(p.ID)})
	}
	return out
}
