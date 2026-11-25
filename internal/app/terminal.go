package app

import (
	"context"
	"draupnode/internal/i18n"
	"encoding/base64"
	"fmt"
	"io"
	"sync"
	"time"

	"draupnode/internal/store"

	"golang.org/x/crypto/ssh"
)

// Terminal SSH integrada: una sesión interactiva (con PTY) por pestaña.
// La salida llega a la interfaz por el evento «term» (en base64, para no
// partir caracteres UTF-8); lo que se teclea entra con TerminalInput.

// TermEvent es lo que recibe la interfaz.
type TermEvent struct {
	ID     string `json:"id"`
	Data   string `json:"data,omitempty"` // base64
	Closed bool   `json:"closed,omitempty"`
	Reason string `json:"reason,omitempty"`
}

type termSession struct {
	client  *ssh.Client
	session *ssh.Session
	stdin   io.WriteCloser
	once    sync.Once
}

func (t *termSession) close() {
	t.once.Do(func() {
		_ = t.session.Close()
		_ = t.client.Close()
	})
}

var (
	termMu   sync.Mutex
	terms    = map[string]*termSession{}
	termNext int
)

// TermStart es la respuesta de TerminalOpen.
type TermStart struct {
	RunStart
	ID string `json:"id,omitempty"`
}

// TerminalOpen conecta al servidor y abre una shell interactiva.
func (a *App) TerminalOpen(serverID, secret, accept string, cols, rows int) TermStart {
	srv, err := a.store.Server(serverID)
	if err != nil {
		return TermStart{RunStart: RunStart{Status: "error", Message: err.Error()}}
	}
	kind := "passphrase"
	if srv.AuthMethod == store.AuthPassword {
		kind = "password"
	}
	secret, st := a.secretFor(srv, secret)
	if st != "" {
		return TermStart{RunStart: RunStart{Status: st, SecretKind: kind}}
	}
	dctx, cancel := context.WithTimeout(a.context(), 30*time.Second)
	c, fail := a.connect(dctx, srv, secret, accept)
	cancel()
	if fail != nil {
		return TermStart{RunStart: RunStart{Status: fail.Status, Message: fail.Message, SecretKind: kind, KeyType: fail.KeyType, Fingerprint: fail.Fingerprint}}
	}
	s, err := c.NewSession()
	if err != nil {
		c.Close()
		return TermStart{RunStart: RunStart{Status: "error", Message: err.Error()}}
	}
	if cols <= 0 || rows <= 0 {
		cols, rows = 100, 30
	}
	modes := ssh.TerminalModes{ssh.ECHO: 1, ssh.TTY_OP_ISPEED: 38400, ssh.TTY_OP_OSPEED: 38400}
	if err := s.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		s.Close()
		c.Close()
		return TermStart{RunStart: RunStart{Status: "error", Message: i18n.T("el servidor no dio terminal: ") + err.Error()}}
	}
	stdin, _ := s.StdinPipe()
	stdout, _ := s.StdoutPipe()
	stderr, _ := s.StderrPipe()
	if err := s.Shell(); err != nil {
		s.Close()
		c.Close()
		return TermStart{RunStart: RunStart{Status: "error", Message: err.Error()}}
	}
	t := &termSession{client: c, session: s, stdin: stdin}
	termMu.Lock()
	termNext++
	id := fmt.Sprintf("t%d", termNext)
	terms[id] = t
	termMu.Unlock()

	pump := func(r io.Reader, wg *sync.WaitGroup) {
		defer wg.Done()
		buf := make([]byte, 32*1024)
		for {
			n, err := r.Read(buf)
			if n > 0 {
				a.emit("term", TermEvent{ID: id, Data: base64.StdEncoding.EncodeToString(buf[:n])})
			}
			if err != nil {
				return
			}
		}
	}
	go func() {
		var wg sync.WaitGroup
		wg.Add(2)
		go pump(stdout, &wg)
		go pump(stderr, &wg)
		err := s.Wait()
		wg.Wait()
		reason := i18n.T("Sesión terminada.")
		if err != nil {
			if _, ok := err.(*ssh.ExitError); !ok {
				reason = i18n.T("Conexión cerrada: ") + err.Error()
			}
		}
		termMu.Lock()
		delete(terms, id)
		termMu.Unlock()
		t.close()
		a.emit("term", TermEvent{ID: id, Closed: true, Reason: reason})
	}()
	// Mantener viva la conexión aunque no se teclee.
	go func() {
		tk := time.NewTicker(30 * time.Second)
		defer tk.Stop()
		for range tk.C {
			termMu.Lock()
			_, alive := terms[id]
			termMu.Unlock()
			if !alive {
				return
			}
			if _, _, err := c.SendRequest("keepalive@openssh.com", true, nil); err != nil {
				t.close()
				return
			}
		}
	}()
	return TermStart{RunStart: RunStart{Status: "ok"}, ID: id}
}

func termGet(id string) *termSession {
	termMu.Lock()
	defer termMu.Unlock()
	return terms[id]
}

// TerminalInput envía lo tecleado (texto tal cual).
func (a *App) TerminalInput(id, data string) {
	if t := termGet(id); t != nil {
		_, _ = t.stdin.Write([]byte(data))
	}
}

// TerminalResize ajusta el tamaño de la terminal remota.
func (a *App) TerminalResize(id string, cols, rows int) {
	if t := termGet(id); t != nil && cols > 0 && rows > 0 {
		_ = t.session.WindowChange(rows, cols)
	}
}

// TerminalClose cierra la sesión.
func (a *App) TerminalClose(id string) {
	if t := termGet(id); t != nil {
		t.close()
	}
}

// CloseTerminals cierra todas (al salir de la app).
func (a *App) CloseTerminals() {
	termMu.Lock()
	list := make([]*termSession, 0, len(terms))
	for _, t := range terms {
		list = append(list, t)
	}
	termMu.Unlock()
	for _, t := range list {
		t.close()
	}
}
