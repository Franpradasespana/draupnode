package runner

import (
	"context"
	"crypto/ed25519"
	"encoding/binary"
	"io"
	"net"
	"os/exec"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

// Servidor SSH de prueba que ejecuta de verdad los comandos con bash.
func startExecServer(t *testing.T) *ssh.Client {
	t.Helper()
	_, hpriv, _ := ed25519.GenerateKey(nil)
	hs, _ := ssh.NewSignerFromKey(hpriv)
	cfg := &ssh.ServerConfig{NoClientAuth: true}
	cfg.AddHostKey(hs)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			nc, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				_, chans, reqs, err := ssh.NewServerConn(nc, cfg)
				if err != nil {
					return
				}
				go ssh.DiscardRequests(reqs)
				for nch := range chans {
					ch, creqs, _ := nch.Accept()
					go serveSession(ch, creqs)
				}
			}()
		}
	}()
	c, err := ssh.Dial("tcp", ln.Addr().String(), &ssh.ClientConfig{User: "t", HostKeyCallback: ssh.InsecureIgnoreHostKey()})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { c.Close() })
	return c
}

func serveSession(ch ssh.Channel, reqs <-chan *ssh.Request) {
	var once sync.Once
	var cmd *exec.Cmd
	for r := range reqs {
		switch r.Type {
		case "pty-req":
			r.Reply(true, nil)
		case "signal":
			if cmd != nil && cmd.Process != nil {
				cmd.Process.Kill()
			}
		case "exec":
			n := binary.BigEndian.Uint32(r.Payload[:4])
			line := string(r.Payload[4 : 4+n])
			r.Reply(true, nil)
			once.Do(func() {
				cmd = exec.Command("bash", "-c", line)
				cmd.Stdin, cmd.Stdout, cmd.Stderr = ch, ch, ch.Stderr()
				go func() {
					err := cmd.Run()
					code := 0
					if ee, ok := err.(*exec.ExitError); ok {
						code = ee.ExitCode()
					}
					ch.SendRequest("exit-status", false, ssh.Marshal(struct{ C uint32 }{uint32(code)}))
					ch.Close()
				}()
			})
		default:
			if r.WantReply {
				r.Reply(false, nil)
			}
		}
	}
}

func TestRunEventosYCodigo(t *testing.T) {
	c := startExecServer(t)
	script := []byte(`#!/usr/bin/env bash
echo "modo=$1 eventos=$DRAUPNODE_EVENTS"
echo '@@DN {"ev":"task","name":"Instalar Docker"}'
echo '@@DN {"ev":"ok","changed":true}'
echo 'ruido sin formato' >&2
exit 3
`)
	before, _ := filepathGlob("/tmp/draupnode-*.sh")
	var got []Event
	var mu sync.Mutex
	code, err := Run(context.Background(), c, script, true, Sudo{IsRoot: true}, func(e Event) {
		mu.Lock()
		got = append(got, e)
		mu.Unlock()
	})
	if err != nil || code != 3 {
		t.Fatalf("code=%d err=%v", code, err)
	}
	var lines, evs []string
	for _, e := range got {
		if e.Kind == "ev" {
			evs = append(evs, e.Ev["ev"].(string))
		} else {
			lines = append(lines, e.Text)
		}
	}
	all := strings.Join(lines, "|")
	if !strings.Contains(all, "modo=--check eventos=1") || !strings.Contains(all, "ruido sin formato") {
		t.Fatalf("líneas: %q", lines)
	}
	if strings.Join(evs, ",") != "task,ok" {
		t.Fatalf("eventos: %v", evs)
	}
	// El script temporal se borra al terminar.
	if after, _ := filepathGlob("/tmp/draupnode-*.sh"); len(after) > len(before) {
		t.Fatalf("quedaron scripts temporales: %v", after)
	}
}

func TestRunCancelar(t *testing.T) {
	c := startExecServer(t)
	ctx, cancel := context.WithCancel(context.Background())
	started := make(chan struct{})
	var once sync.Once
	go func() {
		<-started
		cancel()
	}()
	t0 := time.Now()
	_, err := Run(ctx, c, []byte("echo empiezo; sleep 30\n"), false, Sudo{IsRoot: true}, func(e Event) {
		if e.Text == "empiezo" {
			once.Do(func() { close(started) })
		}
	})
	if err == nil || time.Since(t0) > 10*time.Second {
		t.Fatalf("no canceló: %v (%v)", err, time.Since(t0))
	}
}

func TestUploadRutaSegura(t *testing.T) {
	if safePath.MatchString("/tmp/draupnode-ab; rm -rf /.sh") || !safePath.MatchString("/tmp/draupnode-Ab12Cd34.sh") {
		t.Fatal("safePath")
	}
	_ = io.EOF
}

func filepathGlob(p string) ([]string, error) {
	out, err := exec.Command("bash", "-c", "ls "+p+" 2>/dev/null").Output()
	if err != nil {
		return nil, nil
	}
	return strings.Fields(string(out)), nil
}

func TestRunDevuelveSecretos(t *testing.T) {
	c := startExecServer(t)
	script := []byte(`#!/usr/bin/env bash
echo "back=${DRAUPNODE_SECRETS_BACK:-no}"
echo '@@DN-SECRETS c2VjcmV0bw=='
`)
	var got []Event
	var mu sync.Mutex
	_, err := RunOpts(context.Background(), c, script, Opts{SecretsBack: true}, Sudo{IsRoot: true}, func(e Event) {
		mu.Lock()
		got = append(got, e)
		mu.Unlock()
	})
	if err != nil {
		t.Fatal(err)
	}
	var sec, lines []string
	for _, e := range got {
		switch e.Kind {
		case "secrets":
			sec = append(sec, e.Text)
		case "line":
			lines = append(lines, e.Text)
		}
	}
	if len(sec) != 1 || sec[0] != "c2VjcmV0bw==" {
		t.Fatalf("secretos: %v", sec)
	}
	all := strings.Join(lines, "|")
	if strings.Contains(all, "c2VjcmV0bw") || !strings.Contains(all, "back=1") {
		t.Fatalf("líneas: %q", lines)
	}
	// Al previsualizar no se piden.
	got = nil
	RunOpts(context.Background(), c, script, Opts{Check: true, SecretsBack: true}, Sudo{IsRoot: true}, func(e Event) {
		mu.Lock()
		got = append(got, e)
		mu.Unlock()
	})
	for _, e := range got {
		if e.Kind == "line" && strings.Contains(e.Text, "back=1") {
			t.Fatal("previsualizar no debe pedir los secretos")
		}
	}
}
