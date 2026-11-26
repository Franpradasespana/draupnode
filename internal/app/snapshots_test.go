package app

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"draupnode/internal/cloudapi"
	"draupnode/internal/store"
)

// Hetzner falso con tres instantáneas de Draupnode y una hecha a mano.
func fakeSnapAPI(t *testing.T) (*httptest.Server, *[]string) {
	var mu sync.Mutex
	var deleted []string
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		p := r.URL.Path
		switch {
		case r.Method == http.MethodDelete:
			deleted = append(deleted, p)
			w.WriteHeader(204)
		case p == "/locations":
			_, _ = io.WriteString(w, `{"locations":[]}`)
		case p == "/server_types":
			_, _ = io.WriteString(w, `{"server_types":[]}`)
		case p == "/servers":
			_, _ = io.WriteString(w, `{"servers":[{"id":42,"name":"web","public_net":{"ipv4":{"ip":"203.0.113.10"}}}],"meta":{"pagination":{"next_page":null}}}`)
		case p == "/servers/42/actions/create_image":
			_, _ = io.WriteString(w, `{"action":{"id":9}}`)
		case p == "/actions/9":
			_, _ = io.WriteString(w, `{"action":{"status":"success"}}`)
		case p == "/images":
			_, _ = io.WriteString(w, `{"images":[
				{"id":1,"description":"draupnode-web-1","created":"2026-11-20T00:00:00Z","created_from":{"id":42}},
				{"id":2,"description":"draupnode-web-2","created":"2026-11-21T00:00:00Z","created_from":{"id":42}},
				{"id":3,"description":"draupnode-web-3","created":"2026-11-22T00:00:00Z","created_from":{"id":42}},
				{"id":4,"description":"a mano","created":"2026-11-19T00:00:00Z","created_from":{"id":42}}],"meta":{"pagination":{"next_page":null}}}`)
		default:
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(api.Close)
	old := newCloud
	newCloud = func(p, tok string) (*cloudapi.Client, error) {
		c, err := cloudapi.New(p, tok)
		if err == nil {
			c.BaseURL, c.Poll = api.URL, time.Millisecond
		}
		return c, err
	}
	t.Cleanup(func() { newCloud = old })
	return api, &deleted
}

func TestInstantaneas(t *testing.T) {
	_, deleted := fakeSnapAPI(t)
	a := newTestApp(t, noKeyring{})
	if err := a.vault.Create("maestra-de-prueba"); err != nil {
		t.Fatal(err)
	}
	if err := a.CloudSetToken("hetzner", "tok"); err != nil {
		t.Fatal(err)
	}
	srv, err := a.store.SaveServer(store.Server{Name: "Web principal", Host: "203.0.113.10", Port: 22, User: "root", AuthMethod: store.AuthKey, KeyPath: "/x"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.ServerSnapshots(srv.ID); err == nil {
		t.Fatal("sin vincular no hay instantáneas")
	}
	v, err := a.LinkServerCloud(srv.ID, "hetzner")
	if err != nil || v.Cloud == nil || v.Cloud.ID != "42" || !v.Cloud.SnapshotBeforeApply {
		t.Fatalf("%+v %v", v.Cloud, err)
	}
	// Guardar la conexión no pierde el vínculo.
	srv.Notes = "otra nota"
	if s2, _ := a.store.SaveServer(srv); s2.Cloud == nil {
		t.Fatal("guardar el servidor quitó el vínculo")
	}
	info, err := a.ServerSnapshots(srv.ID)
	if err != nil || len(info.Snapshots) != 4 || info.Snapshots[0].ID != "3" || info.Currency != "EUR" {
		t.Fatalf("%+v %v", info, err)
	}
	// Guardar 2: tras hacer una, se borran las de Draupnode más viejas (no la hecha a mano).
	if _, err := a.SetSnapshotOptions(srv.ID, true, 2); err != nil {
		t.Fatal(err)
	}
	srv, _ = a.store.Server(srv.ID)
	warn, err := a.takeSnapshot(context.Background(), srv, func(string) {})
	if err != nil || warn != "" {
		t.Fatalf("%q %v", warn, err)
	}
	if strings.Join(*deleted, ",") != "/images/1" {
		t.Fatalf("borradas: %v", *deleted)
	}
	if err := a.DeleteServerSnapshot(srv.ID, "99"); err == nil {
		t.Fatal("borró una instantánea que no es del servidor")
	}
	if !snapshotBeforeRun(srv, runMode{}) || snapshotBeforeRun(srv, runMode{check: true}) || !snapshotBeforeRun(srv, runMode{uninstall: []string{"x"}}) {
		t.Fatal("cuándo se hace la instantánea")
	}
	if n := snapshotName(srv, time.Date(2026, 11, 26, 10, 0, 0, 0, time.UTC)); n != "draupnode-web-20261126-100000" {
		t.Fatal(n)
	}
	srv.Cloud = nil
	srv.Name = "Ñandú  Servidor!"
	if n := snapshotName(srv, time.Date(2026, 11, 26, 10, 0, 0, 0, time.UTC)); n != "draupnode-and-servidor-20261126-100000" {
		t.Fatal(n)
	}
	if _, err := a.UnlinkServerCloud(srv.ID); err != nil {
		t.Fatal(err)
	}
}
