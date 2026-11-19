// Package lab gestiona el servidor Ubuntu de PRUEBAS en Docker del propio
// equipo: detecta Docker (y qué le falta), crea el contenedor, sus claves SSH
// y lo deja listo para darlo de alta en Draupnode.
package lab

import (
	"bufio"
	"bytes"
	"context"
	"crypto/ed25519"
	_ "embed"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

//go:embed Dockerfile
var Dockerfile []byte

// Datos fijos del servidor de pruebas (el script pruebas/servidor-ubuntu/servidor.sh usa los mismos).
const (
	Container   = "draupnode-prueba"
	Image       = "draupnode/servidor-prueba:24.04"
	Volume      = "draupnode-prueba-docker"
	Host        = "127.0.0.1"
	SSHPort     = 2222
	CoolifyPort = 18000
	User        = "ubuntu"
	Password    = "draupnode" // de los usuarios ubuntu/prueba y de la clave «con frase»
)

// Problemas de Docker que se pueden detectar.
const (
	ProblemNone       = ""
	ProblemMissing    = "missing"    // no está instalado
	ProblemDaemon     = "daemon"     // instalado pero el servicio no responde
	ProblemPermission = "permission" // el usuario no puede usarlo
	ProblemOther      = "other"
)

// DockerStatus describe Docker en este equipo.
type DockerStatus struct {
	OS        string `json:"os"`
	Installed bool   `json:"installed"`
	Version   string `json:"version,omitempty"`
	Problem   string `json:"problem"`
	Message   string `json:"message,omitempty"`
	// NeedsRelogin: el usuario ya está en el grupo docker, pero su sesión
	// no lo tiene y no hay «sg» para activarlo: hay que reiniciar (en Ubuntu
	// systemd --user sobrevive al cierre de sesión y conserva los grupos viejos).
	NeedsRelogin   bool   `json:"needsRelogin"`
	ViaGroup       bool   `json:"viaGroup"`       // se usa «sg docker» (añadido al grupo sin cerrar sesión)
	CanAutoFix     bool   `json:"canAutoFix"`     // Linux con pkexec: la app puede arreglarlo pidiendo la contraseña
	InstallCommand string `json:"installCommand"` // para hacerlo a mano en Linux
	DownloadURL    string `json:"downloadUrl,omitempty"`
}

// ServerStatus describe el contenedor de pruebas.
type ServerStatus struct {
	Exists    bool   `json:"exists"`
	Running   bool   `json:"running"`
	StartedAt string `json:"startedAt,omitempty"`
	// ByPort: Docker no se puede consultar (p. ej. sin permiso), pero el SSH
	// del servidor de pruebas responde en su puerto.
	ByPort bool `json:"byPort,omitempty"`
}

// ProbePort comprueba si algo escucha en el puerto SSH del servidor de pruebas.
func ProbePort() bool {
	c, err := net.DialTimeout("tcp", net.JoinHostPort(Host, strconv.Itoa(SSHPort)), 2*time.Second)
	if err != nil {
		return false
	}
	c.Close()
	return true
}

// KeyFile es una de las claves de prueba.
type KeyFile struct {
	Path       string `json:"path"`
	Label      string `json:"label"`
	Passphrase string `json:"passphrase,omitempty"`
}

// Lab es el gestor; Dir es donde guarda las claves.
type Lab struct {
	Dir string
	// run ejecuta un programa (sustituible en tests).
	run func(ctx context.Context, stdin []byte, out func(string), name string, args ...string) error
	// docker es el prefijo para ejecutar docker (p. ej. ["docker"] o ["sg","docker","-c"]).
	docker []string
}

// New crea el gestor con las claves en dir.
func New(dir string) *Lab {
	return &Lab{Dir: dir, run: runCmd}
}

func runCmd(ctx context.Context, stdin []byte, out func(string), name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	if stdin != nil {
		cmd.Stdin = bytes.NewReader(stdin)
	}
	pr, pw := io.Pipe()
	cmd.Stdout, cmd.Stderr = pw, pw
	if err := cmd.Start(); err != nil {
		return err
	}
	done := make(chan struct{})
	go func() {
		sc := bufio.NewScanner(pr)
		sc.Buffer(make([]byte, 64*1024), 1024*1024)
		for sc.Scan() {
			if out != nil {
				out(sc.Text())
			}
		}
		close(done)
	}()
	err := cmd.Wait()
	pw.Close()
	<-done
	return err
}

func (l *Lab) capture(ctx context.Context, stdin []byte, name string, args ...string) (string, error) {
	var b strings.Builder
	err := l.run(ctx, stdin, func(s string) { b.WriteString(s + "\n") }, name, args...)
	return strings.TrimSpace(b.String()), err
}

// ---------------------------------------------------------------- Docker

func currentUser() string {
	if u, err := user.Current(); err == nil {
		return u.Username
	}
	return os.Getenv("USER")
}

var userRe = regexp.MustCompile(`^[a-z_][a-z0-9_-]{0,31}$`)

func shellQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'" }

// inDockerGroup: el usuario figura en el grupo docker (aunque su sesión aún no lo tenga).
func inDockerGroup() bool {
	g, err := user.LookupGroup("docker")
	if err != nil {
		return false
	}
	u, err := user.Current()
	if err != nil {
		return false
	}
	ids, err := u.GroupIds()
	if err != nil {
		return false
	}
	for _, id := range ids {
		if id == g.Gid {
			return true
		}
	}
	return false
}

func linuxInstallCommand(look func(string) bool, who string) string {
	tail := " && systemctl enable --now docker && usermod -aG docker " + who
	switch {
	case look("apt-get"):
		return "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io" + tail
	case look("dnf"):
		return "dnf install -y docker" + tail
	case look("pacman"):
		return "pacman -S --noconfirm docker" + tail
	case look("zypper"):
		return "zypper install -y docker" + tail
	}
	return ""
}

func lookPath(n string) bool { _, err := exec.LookPath(n); return err == nil }

// classify interpreta el error de «docker version».
func classify(out string) (string, string) {
	low := strings.ToLower(out)
	switch {
	case strings.Contains(low, "permission denied"):
		return ProblemPermission, "Docker está instalado, pero tu usuario no tiene permiso para usarlo."
	case strings.Contains(low, "cannot connect to the docker daemon"), strings.Contains(low, "is the docker daemon running"),
		strings.Contains(low, "error during connect"), strings.Contains(low, "the system cannot find the file specified"):
		return ProblemDaemon, "Docker está instalado, pero su servicio no está en marcha."
	}
	return ProblemOther, out
}

// Docker detecta el estado de Docker y deja preparado cómo invocarlo.
func (l *Lab) Docker(ctx context.Context) DockerStatus {
	st := DockerStatus{OS: runtime.GOOS}
	who := currentUser()
	switch runtime.GOOS {
	case "linux":
		if userRe.MatchString(who) {
			st.InstallCommand = linuxInstallCommand(lookPath, who)
		}
		st.CanAutoFix = lookPath("pkexec") && st.InstallCommand != ""
	case "darwin":
		st.DownloadURL = "https://docs.docker.com/desktop/setup/install/mac-install/"
	case "windows":
		st.DownloadURL = "https://docs.docker.com/desktop/setup/install/windows-install/"
	}
	if !lookPath("docker") {
		st.Problem, st.Message = ProblemMissing, "Docker no está instalado en este equipo."
		return st
	}
	st.Installed = true
	ver, err := l.capture(ctx, nil, "docker", "version", "--format", "{{.Server.Version}}")
	if err == nil {
		l.docker = []string{"docker"}
		st.Version = ver
		return st
	}
	st.Problem, st.Message = classify(ver)
	// Añadido al grupo docker pero sin haber cerrado sesión: «sg docker» lo activa ya.
	if st.Problem == ProblemPermission && runtime.GOOS == "linux" && inDockerGroup() {
		if lookPath("sg") {
			if v, err := l.capture(ctx, nil, "sg", "docker", "-c", "docker version --format '{{.Server.Version}}'"); err == nil {
				l.docker = []string{"sg", "docker", "-c"}
				return DockerStatus{OS: st.OS, Installed: true, Version: v, ViaGroup: true, CanAutoFix: st.CanAutoFix, InstallCommand: st.InstallCommand}
			}
		}
		st.NeedsRelogin = true
		st.Message = "Ya tienes permiso para usar Docker, pero el sistema solo lo aplica al arrancar: reinicia el equipo (cerrar sesión no siempre basta)."
	}
	return st
}

// dockerCmd ejecuta «docker args…» con el prefijo que funcione.
func (l *Lab) dockerCmd(ctx context.Context, stdin []byte, out func(string), args ...string) error {
	if len(l.docker) == 0 {
		if st := l.Docker(ctx); st.Problem != ProblemNone {
			return errors.New(st.Message)
		}
	}
	if l.docker[0] == "sg" {
		q := make([]string, len(args))
		for i, a := range args {
			q[i] = shellQuote(a)
		}
		return l.run(ctx, stdin, out, "sg", "docker", "-c", "docker "+strings.Join(q, " "))
	}
	return l.run(ctx, stdin, out, "docker", args...)
}

func (l *Lab) dockerOut(ctx context.Context, stdin []byte, args ...string) (string, error) {
	var b strings.Builder
	err := l.dockerCmd(ctx, stdin, func(s string) { b.WriteString(s + "\n") }, args...)
	return strings.TrimSpace(b.String()), err
}

// Fix intenta resolver un problema de Docker en Linux pidiendo la contraseña
// con la ventana del sistema (pkexec).
func (l *Lab) Fix(ctx context.Context, problem string, out func(string)) error {
	if runtime.GOOS != "linux" || !lookPath("pkexec") {
		return errors.New("en este sistema hay que hacerlo a mano")
	}
	who := currentUser()
	if !userRe.MatchString(who) {
		return fmt.Errorf("nombre de usuario raro: %q", who)
	}
	var err error
	switch problem {
	case ProblemMissing:
		cmd := linuxInstallCommand(lookPath, who)
		if cmd == "" {
			return errors.New("no reconozco el gestor de paquetes de esta distribución")
		}
		out("Instalando Docker (te pedirá tu contraseña)…")
		err = l.run(ctx, nil, out, "pkexec", "sh", "-c", cmd)
	case ProblemDaemon:
		out("Arrancando el servicio de Docker (te pedirá tu contraseña)…")
		err = l.run(ctx, nil, out, "pkexec", "systemctl", "enable", "--now", "docker")
	case ProblemPermission:
		out("Añadiendo tu usuario al grupo docker (te pedirá tu contraseña)…")
		err = l.run(ctx, nil, out, "pkexec", "usermod", "-aG", "docker", who)
	default:
		return errors.New("no sé arreglar esto automáticamente")
	}
	if err != nil {
		var ee *exec.ExitError
		if errors.As(err, &ee) && (ee.ExitCode() == 126 || ee.ExitCode() == 127) {
			return errors.New("cancelado: no se dio la contraseña")
		}
		return err
	}
	l.docker = nil // que se vuelva a detectar
	return nil
}

// ---------------------------------------------------------------- claves

// Keys devuelve las claves de prueba (generándolas si faltan).
func (l *Lab) Keys() ([]KeyFile, error) {
	if err := os.MkdirAll(l.Dir, 0o700); err != nil {
		return nil, err
	}
	if err := genKey(filepath.Join(l.Dir, "id_prueba"), "", "draupnode-prueba"); err != nil {
		return nil, err
	}
	if err := genKey(filepath.Join(l.Dir, "id_prueba_con_frase"), Password, "draupnode-prueba-frase"); err != nil {
		return nil, err
	}
	if err := genKey(filepath.Join(l.Dir, "ssh_host_ed25519_key"), "", "servidor-prueba"); err != nil {
		return nil, err
	}
	keys := []KeyFile{
		{Path: filepath.Join(l.Dir, "id_prueba"), Label: "Clave sin contraseña"},
		{Path: filepath.Join(l.Dir, "id_prueba_con_frase"), Label: "Clave con contraseña", Passphrase: Password},
	}
	ppk := filepath.Join(l.Dir, "id_prueba_con_frase.ppk")
	if _, err := os.Stat(ppk); err != nil && lookPath("puttygen") {
		pf := filepath.Join(l.Dir, ".frase")
		if os.WriteFile(pf, []byte(Password+"\n"), 0o600) == nil {
			_ = exec.Command("puttygen", filepath.Join(l.Dir, "id_prueba_con_frase"), "--old-passphrase", pf,
				"--new-passphrase", pf, "-O", "private", "-o", ppk).Run()
			_ = os.Remove(pf)
		}
	}
	if _, err := os.Stat(ppk); err == nil {
		keys = append(keys, KeyFile{Path: ppk, Label: "Clave PuTTY (.ppk) con contraseña", Passphrase: Password})
	}
	return keys, nil
}

func genKey(path, passphrase, comment string) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	}
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		return err
	}
	var block *pem.Block
	if passphrase == "" {
		block, err = ssh.MarshalPrivateKey(priv, comment)
	} else {
		block, err = ssh.MarshalPrivateKeyWithPassphrase(priv, comment, []byte(passphrase))
	}
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, pem.EncodeToMemory(block), 0o600); err != nil {
		return err
	}
	sp, err := ssh.NewPublicKey(pub)
	if err != nil {
		return err
	}
	line := strings.TrimSpace(string(ssh.MarshalAuthorizedKey(sp))) + " " + comment + "\n"
	return os.WriteFile(path+".pub", []byte(line), 0o644)
}

// HostKey devuelve la clave pública fija del servidor de pruebas.
func (l *Lab) HostKey() (ssh.PublicKey, error) {
	raw, err := os.ReadFile(filepath.Join(l.Dir, "ssh_host_ed25519_key.pub"))
	if err != nil {
		return nil, err
	}
	k, _, _, _, err := ssh.ParseAuthorizedKey(raw)
	return k, err
}

// ---------------------------------------------------------------- contenedor

// Server devuelve el estado del contenedor.
func (l *Lab) Server(ctx context.Context) ServerStatus {
	out, err := l.dockerOut(ctx, nil, "container", "inspect", "-f", "{{.State.Running}}|{{.State.StartedAt}}", Container)
	if err != nil {
		return ServerStatus{}
	}
	running, started, _ := strings.Cut(out, "|")
	return ServerStatus{Exists: true, Running: running == "true", StartedAt: started}
}

// Start construye la imagen, crea o arranca el contenedor y deja SSH listo.
func (l *Lab) Start(ctx context.Context, out func(string)) error {
	if _, err := l.Keys(); err != nil {
		return fmt.Errorf("claves: %w", err)
	}
	out("==> Construyendo la imagen Ubuntu 24.04 (la primera vez tarda unos minutos)")
	err := l.dockerCmd(ctx, Dockerfile, out, "build", "--progress=plain", "-t", Image, "-")
	if err != nil {
		// Docker sin BuildKit no conoce --progress.
		out("(reintentando sin --progress)")
		if err = l.dockerCmd(ctx, Dockerfile, out, "build", "-t", Image, "-"); err != nil {
			return fmt.Errorf("no se pudo construir la imagen: %w", err)
		}
	}
	st := l.Server(ctx)
	switch {
	case st.Running:
		out("==> El contenedor ya está en marcha")
	case st.Exists:
		out("==> Arrancando el contenedor")
		if err := l.dockerCmd(ctx, nil, out, "start", Container); err != nil {
			return err
		}
	default:
		out("==> Creando el contenedor")
		err := l.dockerCmd(ctx, nil, out, "run", "-d", "--name", Container, "--hostname", "servidor-prueba",
			"--privileged", "--cgroupns=host", "-v", "/sys/fs/cgroup:/sys/fs/cgroup:rw",
			"--tmpfs", "/run", "--tmpfs", "/run/lock",
			"-v", Volume+":/var/lib/docker",
			"-p", fmt.Sprintf("%s:%d:22", Host, SSHPort),
			"-p", fmt.Sprintf("%s:%d:8000", Host, CoolifyPort),
			Image)
		if err != nil {
			return fmt.Errorf("no se pudo crear el contenedor: %w", err)
		}
	}
	out("==> Esperando a que arranque systemd")
	for i := 0; i < 40; i++ {
		s, _ := l.dockerOut(ctx, nil, "exec", Container, "systemctl", "is-system-running")
		if s == "running" || s == "degraded" {
			break
		}
		time.Sleep(time.Second)
	}
	out("==> Instalando las claves SSH")
	if err := l.installKeys(ctx); err != nil {
		return fmt.Errorf("claves en el contenedor: %w", err)
	}
	out(fmt.Sprintf("Listo: ssh -p %d %s@%s", SSHPort, User, Host))
	return nil
}

func (l *Lab) installKeys(ctx context.Context) error {
	var auth []byte
	for _, n := range []string{"id_prueba.pub", "id_prueba_con_frase.pub"} {
		b, err := os.ReadFile(filepath.Join(l.Dir, n))
		if err != nil {
			return err
		}
		auth = append(auth, b...)
	}
	for _, u := range []string{"ubuntu", "prueba"} {
		script := fmt.Sprintf(`install -d -m 700 -o %[1]s -g %[1]s /home/%[1]s/.ssh && cat > /home/%[1]s/.ssh/authorized_keys && chown %[1]s:%[1]s /home/%[1]s/.ssh/authorized_keys && chmod 600 /home/%[1]s/.ssh/authorized_keys`, u)
		if _, err := l.dockerOut(ctx, auth, "exec", "-i", Container, "sh", "-c", script); err != nil {
			return err
		}
	}
	priv, err := os.ReadFile(filepath.Join(l.Dir, "ssh_host_ed25519_key"))
	if err != nil {
		return err
	}
	pub, err := os.ReadFile(filepath.Join(l.Dir, "ssh_host_ed25519_key.pub"))
	if err != nil {
		return err
	}
	if _, err := l.dockerOut(ctx, priv, "exec", "-i", Container, "sh", "-c",
		"umask 077 && cat > /etc/ssh/ssh_host_ed25519_key"); err != nil {
		return err
	}
	if _, err := l.dockerOut(ctx, pub, "exec", "-i", Container, "sh", "-c",
		"cat > /etc/ssh/ssh_host_ed25519_key.pub && rm -f /etc/ssh/ssh_host_rsa_key* /etc/ssh/ssh_host_ecdsa_key* && printf 'HostKey /etc/ssh/ssh_host_ed25519_key\\n' > /etc/ssh/sshd_config.d/10-hostkey.conf && systemctl restart ssh"); err != nil {
		return err
	}
	return nil
}

// Stop para el contenedor (se conserva lo instalado).
func (l *Lab) Stop(ctx context.Context, out func(string)) error {
	out("==> Parando el contenedor")
	return l.dockerCmd(ctx, nil, out, "stop", Container)
}

// Remove borra el contenedor y su volumen (las claves se conservan).
func (l *Lab) Remove(ctx context.Context, out func(string)) error {
	out("==> Borrando el contenedor")
	if l.Server(ctx).Exists {
		if err := l.dockerCmd(ctx, nil, out, "rm", "-f", Container); err != nil {
			return err
		}
	}
	out("==> Borrando el volumen de Docker interno")
	_ = l.dockerCmd(ctx, nil, out, "volume", "rm", Volume)
	return nil
}
