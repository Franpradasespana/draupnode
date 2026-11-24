package app

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

func TestFirstWebPrefersListOrder(t *testing.T) {
	a := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(404) }))
	defer a.Close()
	b := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	defer b.Close()

	ctx := context.Background()
	got, ok := firstWeb(ctx, []webCandidate{{"http://127.0.0.1:1", "Coolify"}, {a.URL, "Web"}, {b.URL, "Otra"}})
	if !ok || got.url != a.URL {
		t.Fatalf("quería %s (un 404 también cuenta), salió %+v %v", a.URL, got, ok)
	}
	if _, ok := firstWeb(ctx, []webCandidate{{"http://127.0.0.1:1", "Coolify"}}); ok {
		t.Fatal("un puerto cerrado no es una web")
	}
}

func TestPingServers(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	go func() {
		for {
			c, err := l.Accept()
			if err != nil {
				return
			}
			c.Close()
		}
	}()
	port := l.Addr().(*net.TCPAddr).Port
	up, _ := a.store.SaveServer(store.Server{Name: "vivo", Host: "127.0.0.1", Port: port, User: "root", AuthMethod: store.AuthPassword})
	l2, _ := net.Listen("tcp", "127.0.0.1:0")
	closed := l2.Addr().(*net.TCPAddr).Port
	l2.Close()
	down, _ := a.store.SaveServer(store.Server{Name: "caido", Host: "127.0.0.1", Port: closed, User: "root", AuthMethod: store.AuthPassword})
	got := map[string]bool{}
	for _, p := range a.PingServers() {
		got[p.ID] = p.Reachable
	}
	if !got[up.ID] || got[down.ID] || len(got) != 2 {
		t.Fatalf("%v", got)
	}
}
