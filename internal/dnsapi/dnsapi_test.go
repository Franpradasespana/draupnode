package dnsapi

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sync"
	"testing"
)

func TestCandidates(t *testing.T) {
	if got := candidates("a.b.Example.com."); !reflect.DeepEqual(got, []string{"a.b.example.com", "b.example.com", "example.com"}) {
		t.Fatal(got)
	}
}

type fake struct {
	mu    sync.Mutex
	calls []string
	body  map[string]any
}

func (f *fake) srv(t *testing.T, h func(w http.ResponseWriter, r *http.Request)) *httptest.Server {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		if r.Header.Get("Authorization") != "Bearer tok" {
			w.WriteHeader(403)
			return
		}
		f.calls = append(f.calls, r.Method+" "+r.URL.RequestURI())
		if r.Body != nil {
			_ = json.NewDecoder(r.Body).Decode(&f.body)
		}
		h(w, r)
	}))
	t.Cleanup(s.Close)
	return s
}

func TestCloudflare(t *testing.T) {
	f := &fake{}
	existing := false
	s := f.srv(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/zones" && r.URL.Query().Get("name") == "example.com":
			_, _ = io.WriteString(w, `{"success":true,"result":[{"id":"z1","name":"example.com"}]}`)
		case r.URL.Path == "/zones":
			_, _ = io.WriteString(w, `{"success":true,"result":[]}`)
		case r.URL.Path == "/zones/z1/dns_records" && r.Method == http.MethodGet:
			if existing {
				_, _ = io.WriteString(w, `{"success":true,"result":[{"id":"r9","content":"198.51.100.1"}]}`)
			} else {
				_, _ = io.WriteString(w, `{"success":true,"result":[]}`)
			}
		default:
			_, _ = io.WriteString(w, `{"success":true,"result":{}}`)
		}
	})
	c, _ := New(Cloudflare, "tok")
	c.BaseURL = s.URL
	res, err := c.PointA(context.Background(), "tienda.example.com", "203.0.113.10")
	if err != nil || res.Action != "created" || res.Zone != "example.com" || f.body["content"] != "203.0.113.10" || f.body["proxied"] != false {
		t.Fatalf("%+v %v %v", res, err, f.body)
	}
	existing = true
	res, err = c.PointA(context.Background(), "tienda.example.com", "203.0.113.10")
	if err != nil || res.Action != "updated" || res.Before != "198.51.100.1" || f.calls[len(f.calls)-1] != "PATCH /zones/z1/dns_records/r9" {
		t.Fatalf("%+v %v %v", res, err, f.calls)
	}
	if _, err := c.PointA(context.Background(), "otro.net", "203.0.113.10"); err == nil {
		t.Fatal("zona que no está en la cuenta")
	}
	c.Token = "malo"
	if err := c.Verify(context.Background()); err == nil {
		t.Fatal("token malo aceptado")
	}
}

func TestDigitalOcean(t *testing.T) {
	f := &fake{}
	s := f.srv(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/domains/example.com" && r.Method == http.MethodGet:
			_, _ = io.WriteString(w, `{"domain":{"name":"example.com"}}`)
		case r.URL.Path == "/domains/example.com/records" && r.Method == http.MethodGet:
			if r.URL.Query().Get("name") == "example.com" {
				_, _ = io.WriteString(w, `{"domain_records":[{"id":3352896,"data":"203.0.113.10"}]}`)
			} else {
				_, _ = io.WriteString(w, `{"domain_records":[]}`)
			}
		case r.Method == http.MethodGet:
			w.WriteHeader(404)
		default:
			_, _ = io.WriteString(w, `{}`)
		}
	})
	c, _ := New(DigitalOcean, "tok")
	c.BaseURL = s.URL
	res, err := c.PointA(context.Background(), "web.tienda.example.com", "203.0.113.10")
	if err != nil || res.Action != "created" || f.body["name"] != "web.tienda" || f.body["data"] != "203.0.113.10" {
		t.Fatalf("%+v %v %v", res, err, f.body)
	}
	res, err = c.PointA(context.Background(), "example.com", "203.0.113.10")
	if err != nil || res.Action != "same" {
		t.Fatalf("%+v %v", res, err)
	}
}
