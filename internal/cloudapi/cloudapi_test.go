package cloudapi

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

func pubKey(t *testing.T) string {
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	pk, _ := ssh.NewPublicKey(pub)
	return string(ssh.MarshalAuthorizedKey(pk))
}

// fake imita lo justo de las dos APIs y apunta lo que se le pide.
type fake struct {
	mu     sync.Mutex
	posts  map[string]map[string]any
	polls  int
	keyHas bool
}

func (f *fake) handler(t *testing.T) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer buen-token" {
			w.WriteHeader(401)
			_, _ = io.WriteString(w, `{"error":{"code":"unauthorized","message":"unable to authenticate"}}`)
			return
		}
		f.mu.Lock()
		defer f.mu.Unlock()
		if r.Method == http.MethodPost {
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			f.posts[r.URL.Path] = body
		}
		p := r.URL.Path
		switch {
		// Hetzner
		case p == "/locations":
			_, _ = io.WriteString(w, `{"locations":[{"name":"fsn1","city":"Falkenstein","country":"DE"},{"name":"hel1","city":"Helsinki","country":"FI"}]}`)
		case p == "/server_types":
			_, _ = io.WriteString(w, `{"server_types":[
				{"name":"cx32","cores":4,"memory":8,"disk":80,"architecture":"x86","prices":[{"location":"fsn1","price_monthly":{"gross":"7.5900"}}]},
				{"name":"cx22","cores":2,"memory":4,"disk":40,"architecture":"x86","prices":[{"location":"fsn1","price_monthly":{"gross":"4.5900"}},{"location":"hel1","price_monthly":{"gross":"4.5900"}}]},
				{"name":"cax11","cores":2,"memory":4,"disk":40,"architecture":"arm","prices":[{"location":"fsn1","price_monthly":{"gross":"3.9"}}]},
				{"name":"cx11","cores":1,"memory":2,"disk":20,"architecture":"x86","deprecated":true,"prices":[{"location":"fsn1","price_monthly":{"gross":"3"}}]}]}`)
		case p == "/ssh_keys" && r.Method == http.MethodGet:
			if f.keyHas {
				_, _ = io.WriteString(w, `{"ssh_keys":[{"id":7}]}`)
			} else {
				_, _ = io.WriteString(w, `{"ssh_keys":[]}`)
			}
		case p == "/ssh_keys":
			_, _ = io.WriteString(w, `{"ssh_key":{"id":8}}`)
		case p == "/servers" && r.Method == http.MethodPost:
			_, _ = io.WriteString(w, `{"server":{"id":42,"public_net":{"ipv4":{"ip":"127.0.0.1"}}}}`)
		case p == "/servers/42":
			f.polls++
			st := "initializing"
			if f.polls > 1 {
				st = "running"
			}
			_, _ = io.WriteString(w, `{"server":{"status":"`+st+`","public_net":{"ipv4":{"ip":"127.0.0.1"}}}}`)
		// DigitalOcean
		case p == "/regions":
			_, _ = io.WriteString(w, `{"regions":[{"slug":"ams3","name":"Amsterdam 3","available":true},{"slug":"old1","name":"Vieja","available":false}]}`)
		case p == "/sizes":
			_, _ = io.WriteString(w, `{"sizes":[{"slug":"s-1vcpu-1gb","memory":1024,"vcpus":1,"disk":25,"price_monthly":6,"available":true,"regions":["ams3"]}]}`)
		case strings.HasPrefix(p, "/account/keys/"):
			w.WriteHeader(404)
			_, _ = io.WriteString(w, `{"id":"not_found","message":"The resource you were accessing could not be found."}`)
		case p == "/account/keys":
			_, _ = io.WriteString(w, `{"ssh_key":{"id":9}}`)
		case p == "/droplets":
			_, _ = io.WriteString(w, `{"droplet":{"id":77}}`)
		case p == "/droplets/77":
			_, _ = io.WriteString(w, `{"droplet":{"status":"active","networks":{"v4":[{"ip_address":"10.0.0.2","type":"private"},{"ip_address":"127.0.0.1","type":"public"}]}}}`)
		default:
			t.Errorf("petición inesperada %s %s", r.Method, p)
			w.WriteHeader(500)
		}
	})
}

// sshListener: un puerto TCP que acepta conexiones, como el SSH del servidor nuevo.
func sshListener(t *testing.T) int {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { l.Close() })
	go func() {
		for {
			c, err := l.Accept()
			if err != nil {
				return
			}
			c.Close()
		}
	}()
	return l.Addr().(*net.TCPAddr).Port
}

func client(t *testing.T, provider string, f *fake) *Client {
	srv := httptest.NewServer(f.handler(t))
	t.Cleanup(srv.Close)
	c, err := New(provider, "buen-token")
	if err != nil {
		t.Fatal(err)
	}
	c.BaseURL, c.Poll, c.SSHPort = srv.URL, 10*time.Millisecond, sshListener(t)
	return c
}

func TestHetzner(t *testing.T) {
	f := &fake{posts: map[string]map[string]any{}}
	c := client(t, Hetzner, f)
	ctx := context.Background()
	cat, err := c.Catalog(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(cat.Regions) != 2 || len(cat.Sizes) != 2 || cat.Sizes[0].ID != "cx22" || cat.Sizes[0].PriceMonth != 4.59 || cat.Sizes[0].RAMMB != 4096 {
		t.Fatalf("catálogo: %+v", cat)
	}
	cr, err := c.Create(ctx, CreateRequest{Name: "web-1", Region: "fsn1", Size: "cx22", PublicKey: pubKey(t)})
	if err != nil {
		t.Fatal(err)
	}
	if cr.ID != "42" || f.posts["/ssh_keys"] == nil {
		t.Fatalf("creado %+v, posts %v", cr, f.posts)
	}
	b := f.posts["/servers"]
	if b["image"] != "ubuntu-24.04" || b["server_type"] != "cx22" || b["location"] != "fsn1" {
		t.Fatalf("cuerpo: %v", b)
	}
	var stages []string
	ip, err := c.Wait(ctx, cr.ID, func(s string) { stages = append(stages, s) })
	if err != nil || ip != "127.0.0.1" || len(stages) < 2 {
		t.Fatalf("wait: %q %v %v", ip, err, stages)
	}
	// Si la clave ya está en Hetzner, no se vuelve a subir.
	f.keyHas, f.posts = true, map[string]map[string]any{}
	if _, err := c.Create(ctx, CreateRequest{Name: "web-2", Region: "fsn1", Size: "cx22", PublicKey: pubKey(t)}); err != nil || f.posts["/ssh_keys"] != nil {
		t.Fatalf("clave repetida: %v %v", err, f.posts)
	}
}

func TestDigitalOcean(t *testing.T) {
	f := &fake{posts: map[string]map[string]any{}}
	c := client(t, DigitalOcean, f)
	ctx := context.Background()
	cat, err := c.Catalog(ctx)
	if err != nil || len(cat.Regions) != 1 || len(cat.Sizes) != 1 || cat.Sizes[0].Currency != "USD" {
		t.Fatalf("catálogo: %+v %v", cat, err)
	}
	cr, err := c.Create(ctx, CreateRequest{Name: "web-1", Region: "ams3", Size: "s-1vcpu-1gb", PublicKey: pubKey(t)})
	if err != nil || cr.ID != "77" {
		t.Fatalf("%+v %v", cr, err)
	}
	if f.posts["/droplets"]["image"] != "ubuntu-24-04-x64" || f.posts["/account/keys"] == nil {
		t.Fatalf("posts: %v", f.posts)
	}
	ip, err := c.Wait(ctx, cr.ID, func(string) {})
	if err != nil || ip != "127.0.0.1" {
		t.Fatalf("%q %v", ip, err)
	}
}

func TestErrores(t *testing.T) {
	f := &fake{posts: map[string]map[string]any{}}
	c := client(t, Hetzner, f)
	c.Token = "malo"
	if _, err := c.Catalog(context.Background()); err == nil || !strings.Contains(err.Error(), "401") {
		t.Fatalf("token malo: %v", err)
	}
	c.Token = "buen-token"
	for _, n := range []string{"Web", "-a", "a_b", strings.Repeat("a", 70)} {
		if _, err := c.Create(context.Background(), CreateRequest{Name: n, Region: "x", Size: "y", PublicKey: pubKey(t)}); err == nil {
			t.Errorf("nombre %q aceptado", n)
		}
	}
	if _, err := c.Create(context.Background(), CreateRequest{Name: "ok", Region: "x", Size: "y", PublicKey: "basura"}); err == nil {
		t.Error("clave mala aceptada")
	}
	if _, err := New("oracle", "x"); err == nil {
		t.Error("proveedor desconocido aceptado")
	}
	_ = strconv.Itoa
}
