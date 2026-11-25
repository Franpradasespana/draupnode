// Package runner sube el instalar.sh de un proyecto por SSH, lo ejecuta como
// root y va devolviendo cada línea y cada evento de Ansible.
package runner

import (
	"bufio"
	"bytes"
	"context"
	"draupnode/internal/i18n"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
	"sync"

	"golang.org/x/crypto/ssh"
)

// Event es una línea de salida o un evento «@@DN {json}» del callback.
type Event struct {
	Kind string         `json:"kind"` // line | ev | secrets (lo generado en el servidor, en base64: nunca se enseña ni se guarda)
	Text string         `json:"text,omitempty"`
	Ev   map[string]any `json:"ev,omitempty"`
}

// Sudo indica cómo hacerse root.
type Sudo struct {
	IsRoot   bool   // ya se conecta como root
	Password string // "" = sudo sin contraseña (sudo -n)
}

// ErrSudoPassword: el usuario necesita contraseña para sudo y no se ha dado.
var ErrSudoPassword = i18n.Err("tu usuario necesita contraseña para usar sudo")

// ErrBadSudoPassword: la contraseña de sudo no es correcta.
var ErrBadSudoPassword = i18n.Err("la contraseña de sudo no es correcta")

func runWithStdin(c *ssh.Client, cmd string, stdin []byte) (string, error) {
	s, err := c.NewSession()
	if err != nil {
		return "", err
	}
	defer s.Close()
	s.Stdin = bytes.NewReader(stdin)
	out := &syncBuffer{}
	s.Stdout, s.Stderr = out, out
	err = s.Run(cmd)
	return out.String(), err
}

// syncBuffer: stdout y stderr se copian en goroutines distintas.
type syncBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (w *syncBuffer) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.b.Write(p)
}

func (w *syncBuffer) String() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.b.String()
}

// CheckSudo comprueba que se puede ser root con lo que hay.
func CheckSudo(c *ssh.Client, su Sudo) error {
	if su.IsRoot {
		return nil
	}
	if su.Password == "" {
		if _, err := runWithStdin(c, "sudo -n true", nil); err != nil {
			return ErrSudoPassword
		}
		return nil
	}
	// -k: olvida credenciales en caché para comprobar de verdad la contraseña.
	if _, err := runWithStdin(c, "sudo -k -S -p '' true", []byte(su.Password+"\n")); err != nil {
		return ErrBadSudoPassword
	}
	return nil
}

var safePath = regexp.MustCompile(`^/tmp/draupnode-[A-Za-z0-9]+\.sh$`)

// Upload sube el script a un fichero temporal (0600) y devuelve su ruta.
func Upload(c *ssh.Client, script []byte) (string, error) {
	out, err := runWithStdin(c, `umask 077; f=$(mktemp /tmp/draupnode-XXXXXXXX.sh) && cat > "$f" && echo "$f"`, script)
	if err != nil {
		return "", i18n.Errorf("no se pudo subir el script: %v %s", err, strings.TrimSpace(out))
	}
	p := strings.TrimSpace(out)
	if !safePath.MatchString(p) {
		return "", fmt.Errorf("ruta temporal inesperada: %q", p)
	}
	return p, nil
}

// Run sube el script y lo ejecuta. emit recibe cada línea/evento.
// Devuelve el código de salida del script (o error si no se pudo lanzar).
func Run(ctx context.Context, c *ssh.Client, script []byte, check bool, su Sudo, emit func(Event)) (int, error) {
	return RunOpts(ctx, c, script, Opts{Check: check}, su, emit)
}

// Opts ajusta una ejecución.
type Opts struct {
	Check bool
	// SecretsBack: al terminar, el script devuelve lo que hay en la carpeta de
	// secretos del proyecto (evento Kind "secrets"). Solo al Aplicar.
	SecretsBack bool
}

// RunOpts es Run con opciones.
func RunOpts(ctx context.Context, c *ssh.Client, script []byte, o Opts, su Sudo, emit func(Event)) (int, error) {
	check := o.Check
	path, err := Upload(c, script)
	if err != nil {
		return -1, err
	}
	s, err := c.NewSession()
	if err != nil {
		return -1, err
	}
	defer s.Close()
	// Con terminal (PTY): si se cancela y se cierra la sesión, el servidor
	// manda SIGHUP y Ansible se detiene en vez de seguir en segundo plano.
	if err := s.RequestPty("dumb", 40, 200, ssh.TerminalModes{ssh.ECHO: 0, ssh.ONLCR: 0}); err != nil {
		return -1, i18n.Errorf("no se pudo abrir terminal: %w", err)
	}
	stdin, err := s.StdinPipe()
	if err != nil {
		return -1, err
	}
	pr, pw := io.Pipe()
	s.Stdout, s.Stderr = pw, pw

	sudo := "sudo -n"
	switch {
	case su.IsRoot:
		sudo = ""
	case su.Password != "":
		sudo = "sudo -S -p ''"
	}
	arg := ""
	if check {
		arg = " --check"
	}
	// «stty -echo» antes del aviso @@DN-READY: la contraseña de sudo no se
	// repite en la salida aunque haya terminal.
	extra := ""
	if o.SecretsBack && !check {
		extra = " DRAUPNODE_SECRETS_BACK=1"
	}
	// DRAUPNODE_CLIENT_IP: la IP desde la que se conecta este equipo (sudo
	// borra SSH_CLIENT); fail2ban la deja siempre entrar.
	cmd := fmt.Sprintf(`stty -echo 2>/dev/null; echo @@DN-READY; %s env DRAUPNODE_EVENTS=1%s DRAUPNODE_CLIENT_IP="${SSH_CLIENT%%%% *}" bash %s%s; rc=$?; rm -f %s; exit $rc`,
		sudo, extra, path, arg, path)
	if err := s.Start(cmd); err != nil {
		return -1, err
	}

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		sc := bufio.NewScanner(pr)
		sc.Buffer(make([]byte, 64*1024), 1024*1024)
		for sc.Scan() {
			line := strings.TrimRight(sc.Text(), "\r")
			switch {
			case line == "@@DN-READY":
				if su.Password != "" && !su.IsRoot {
					_, _ = io.WriteString(stdin, su.Password+"\n")
				}
				// Nada más necesita leer del teclado: se cierra la entrada.
				_ = stdin.Close()
			case strings.HasPrefix(line, "@@DN-SECRETS "):
				emit(Event{Kind: "secrets", Text: strings.TrimSpace(line[len("@@DN-SECRETS "):])})
			case strings.HasPrefix(line, "@@DN "):
				var ev map[string]any
				if json.Unmarshal([]byte(line[5:]), &ev) == nil {
					emit(Event{Kind: "ev", Ev: ev})
				} else {
					emit(Event{Kind: "line", Text: line})
				}
			default:
				if su.Password != "" {
					line = strings.ReplaceAll(line, su.Password, "••••••")
				}
				emit(Event{Kind: "line", Text: line})
			}
		}
	}()

	done := make(chan error, 1)
	go func() { done <- s.Wait() }()
	var werr error
	select {
	case <-ctx.Done():
		_ = s.Signal(ssh.SIGTERM)
		_ = s.Close()
		<-done
		werr = ctx.Err()
	case werr = <-done:
	}
	pw.Close()
	wg.Wait()

	if ctx.Err() != nil {
		// Que no quede el script en /tmp si se cortó a medias.
		_, _ = runWithStdin(c, "rm -f "+path, nil)
		return -1, ctx.Err()
	}
	var ee *ssh.ExitError
	switch {
	case werr == nil:
		return 0, nil
	case errors.As(werr, &ee):
		return ee.ExitStatus(), nil
	}
	return -1, werr
}

// Exec ejecuta cmd como root (sin terminal: la salida llega tal cual, también
// binaria) con la entrada y salidas dadas. Para tareas cortas de la app
// (listar copias, traerlas…), no para aplicar proyectos.
func Exec(ctx context.Context, c *ssh.Client, su Sudo, cmd string, stdin io.Reader, stdout, stderr io.Writer) error {
	s, err := c.NewSession()
	if err != nil {
		return err
	}
	defer s.Close()
	prefix := "sudo -n "
	switch {
	case su.IsRoot:
		prefix = ""
	case su.Password != "":
		prefix = "sudo -S -p '' "
		if stdin == nil {
			stdin = strings.NewReader("")
		}
		stdin = io.MultiReader(strings.NewReader(su.Password+"\n"), stdin)
	}
	if stdin != nil {
		s.Stdin = stdin
	}
	s.Stdout, s.Stderr = stdout, stderr
	if err := s.Start(prefix + "sh -c " + shellQuote(cmd)); err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- s.Wait() }()
	select {
	case <-ctx.Done():
		_ = s.Signal(ssh.SIGTERM)
		_ = s.Close()
		<-done
		return ctx.Err()
	case err := <-done:
		return err
	}
}

func shellQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'" }
