package cloudapi

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeSnap imita las llamadas de instantáneas de los dos proveedores.
type fakeSnap struct {
	mu      sync.Mutex
	calls   []string
	bodies  map[string]map[string]any
	polls   int
	deleted []string
}

func (f *fakeSnap) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		f.calls = append(f.calls, r.Method+" "+r.URL.Path)
		if r.Method == http.MethodPost {
			var b map[string]any
			_ = json.NewDecoder(r.Body).Decode(&b)
			f.bodies[r.URL.Path] = b
		}
		p := r.URL.Path
		switch {
		case r.Method == http.MethodDelete:
			f.deleted = append(f.deleted, p)
			w.WriteHeader(204)
		// Hetzner
		case p == "/servers" && r.URL.Query().Get("page") == "1":
			_, _ = io.WriteString(w, `{"servers":[{"id":41,"name":"otro","public_net":{"ipv4":{"ip":"203.0.113.9"}}}],"meta":{"pagination":{"next_page":2}}}`)
		case p == "/servers" && r.URL.Query().Get("page") == "2":
			_, _ = io.WriteString(w, `{"servers":[{"id":42,"name":"web","public_net":{"ipv4":{"ip":"203.0.113.10"}}}],"meta":{"pagination":{"next_page":null}}}`)
		case p == "/servers/42/actions/create_image", p == "/servers/42/actions/rebuild":
			_, _ = io.WriteString(w, `{"action":{"id":900,"status":"running"},"image":{"id":77}}`)
		case p == "/actions/900":
			f.polls++
			st := "running"
			if f.polls > 1 {
				st = "success"
			}
			_, _ = io.WriteString(w, `{"action":{"status":"`+st+`","progress":50}}`)
		case p == "/images":
			_, _ = io.WriteString(w, `{"images":[
				{"id":77,"description":"draupnode-web-20261126-1200","created":"2026-11-26T12:00:00+00:00","image_size":1.5,"created_from":{"id":42}},
				{"id":78,"description":"a mano","created":"2026-11-27T12:00:00+00:00","image_size":null,"created_from":{"id":42}},
				{"id":79,"description":"draupnode-otro","created":"2026-11-27T12:00:00+00:00","image_size":2,"created_from":{"id":41}}],
				"meta":{"pagination":{"next_page":null}}}`)
		// DigitalOcean
		case p == "/droplets":
			_, _ = io.WriteString(w, `{"droplets":[{"id":3164444,"name":"web","networks":{"v4":[{"ip_address":"10.0.0.2","type":"private"},{"ip_address":"203.0.113.10","type":"public"}]}}],"links":{}}`)
		case p == "/droplets/3164444/actions":
			_, _ = io.WriteString(w, `{"action":{"id":36804745,"status":"in-progress"}}`)
		case p == "/actions/36804745":
			f.polls++
			st := "in-progress"
			if f.polls > 1 {
				st = "completed"
			}
			_, _ = io.WriteString(w, `{"action":{"status":"`+st+`"}}`)
		case p == "/actions/1":
			_, _ = io.WriteString(w, `{"action":{"status":"errored"}}`)
		case p == "/droplets/3164444/snapshots":
			_, _ = io.WriteString(w, `{"snapshots":[{"id":6372321,"name":"draupnode-web-1","created_at":"2026-11-25T10:00:00Z","size_gigabytes":2.34},{"id":6372322,"name":"draupnode-web-2","created_at":"2026-11-26T10:00:00Z","size_gigabytes":2.4}]}`)
		default:
			w.WriteHeader(404)
		}
	})
}

func snapClient(t *testing.T, provider string) (*Client, *fakeSnap) {
	f := &fakeSnap{bodies: map[string]map[string]any{}}
	srv := httptest.NewServer(f.handler())
	t.Cleanup(srv.Close)
	c, _ := New(provider, "tok")
	c.BaseURL, c.Poll = srv.URL, time.Millisecond
	return c, f
}

func TestHetznerSnapshots(t *testing.T) {
	c, f := snapClient(t, Hetzner)
	ctx := context.Background()
	m, err := c.FindByIP(ctx, "203.0.113.10")
	if err != nil || m.ID != "42" || m.Name != "web" {
		t.Fatalf("%+v %v", m, err)
	}
	if _, err := c.FindByIP(ctx, "198.51.100.1"); err == nil {
		t.Fatal("IP que no está: debería fallar")
	}
	var stages []string
	if err := c.TakeSnapshot(ctx, "42", "draupnode-web-x", func(s string) { stages = append(stages, s) }); err != nil {
		t.Fatal(err)
	}
	b := f.bodies["/servers/42/actions/create_image"]
	if b["type"] != "snapshot" || b["description"] != "draupnode-web-x" || len(stages) == 0 || !strings.Contains(stages[0], "50 %") {
		t.Fatalf("%v %v", b, stages)
	}
	snaps, err := c.Snapshots(ctx, "42")
	if err != nil || len(snaps) != 2 || snaps[0].ID != "78" || snaps[0].Draupnode || !snaps[1].Draupnode || snaps[1].SizeGB != 1.5 {
		t.Fatalf("%+v %v", snaps, err)
	}
	f.polls = 0
	if err := c.RestoreSnapshot(ctx, "42", "77", func(string) {}); err != nil || f.bodies["/servers/42/actions/rebuild"]["image"] != "77" {
		t.Fatalf("%v %v", err, f.bodies)
	}
	if err := c.DeleteSnapshot(ctx, "77"); err != nil || f.deleted[0] != "/images/77" {
		t.Fatalf("%v %v", err, f.deleted)
	}
}

func TestDigitalOceanSnapshots(t *testing.T) {
	c, f := snapClient(t, DigitalOcean)
	ctx := context.Background()
	m, err := c.FindByIP(ctx, "203.0.113.10")
	if err != nil || m.ID != "3164444" {
		t.Fatalf("%+v %v", m, err)
	}
	if err := c.TakeSnapshot(ctx, "3164444", "draupnode-web-3", func(string) {}); err != nil {
		t.Fatal(err)
	}
	if b := f.bodies["/droplets/3164444/actions"]; b["type"] != "snapshot" || b["name"] != "draupnode-web-3" {
		t.Fatalf("%v", b)
	}
	snaps, err := c.Snapshots(ctx, "3164444")
	if err != nil || len(snaps) != 2 || snaps[0].ID != "6372322" || !snaps[0].Draupnode {
		t.Fatalf("%+v %v", snaps, err)
	}
	f.polls = 0
	if err := c.RestoreSnapshot(ctx, "3164444", "6372321", func(string) {}); err != nil {
		t.Fatal(err)
	}
	if b := f.bodies["/droplets/3164444/actions"]; b["type"] != "restore" || b["image"] != float64(6372321) {
		t.Fatalf("%v", b)
	}
	if err := c.DeleteSnapshot(ctx, "6372321"); err != nil || f.deleted[0] != "/snapshots/6372321" {
		t.Fatalf("%v %v", err, f.deleted)
	}
	if err := c.waitAction(ctx, "1", func(string) {}, "x"); err == nil {
		t.Fatal("acción con error: debería fallar")
	}
}
