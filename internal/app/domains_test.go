package app

import (
	"context"
	"crypto/x509"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"draupnode/internal/dnsapi"
	"draupnode/internal/store"
)

func TestCleanDomain(t *testing.T) {
	for in, want := range map[string]string{
		"Tienda.Example.com":              "tienda.example.com",
		"https://blog.example.com:8443/x": "blog.example.com",
		"example.com.":                    "example.com",
		"*.example.com":                   "",
		"203.0.113.5":                     "",
		"localhost":                       "",
		"a b.com":                         "",
	} {
		if got := cleanDomain(in); got != want {
			t.Errorf("%q → %q (quería %q)", in, got, want)
		}
	}
}

// Comprobación desde fuera contra un HTTPS y un HTTP de prueba en 127.0.0.1.
func TestCheckDomains(t *testing.T) {
	tlsSrv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	defer tlsSrv.Close()
	plain := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://"+r.Host+"/", http.StatusMovedPermanently)
	}))
	defer plain.Close()
	port := func(u string) int {
		_, p, _ := net.SplitHostPort(u[len("https://"):])
		n, _ := strconv.Atoi(p)
		return n
	}
	oldL, oldS, oldH, oldR := lookupHost, domainHTTPSPort, domainHTTPPort, domainRoots
	defer func() { lookupHost, domainHTTPSPort, domainHTTPPort, domainRoots = oldL, oldS, oldH, oldR }()
	domainHTTPSPort = port(tlsSrv.URL)
	domainHTTPPort = port("https://" + plain.Listener.Addr().String())
	roots := x509.NewCertPool()
	roots.AddCert(tlsSrv.Certificate())
	domainRoots = roots
	lookupHost = func(_ context.Context, h string) ([]string, error) {
		switch h {
		case "example.com":
			return []string{"127.0.0.1"}, nil
		case "fuera.example.net":
			return []string{"127.0.0.2"}, nil
		}
		return nil, &net.DNSError{Err: "no such host", Name: h, IsNotFound: true}
	}

	a := newTestApp(t, noKeyring{})
	srv, _ := a.store.SaveServer(store.Server{Name: "x", Host: "127.0.0.1", Port: 22, User: "root", AuthMethod: store.AuthKey, KeyPath: "/k"})
	a.saveOverview(srv.ID, map[string]any{"sites": []any{map[string]any{"server": "Caddy", "domain": "example.com"}}})
	if _, err := a.SetExtraDomains(srv.ID, []string{"no es dominio"}); err == nil {
		t.Fatal("aceptó un dominio malo")
	}
	if _, err := a.SetExtraDomains(srv.ID, []string{"https://nada.example.org/", "fuera.example.net"}); err != nil {
		t.Fatal(err)
	}
	r, err := a.CheckDomains(srv.ID)
	if err != nil || len(r.Domains) != 3 || r.ServerIP != "127.0.0.1" {
		t.Fatalf("%+v %v", r, err)
	}
	by := map[string]DomainCheck{}
	for _, d := range r.Domains {
		by[d.Domain] = d
	}
	ok := by["example.com"]
	if !ok.PointsHere || ok.Status != 200 || !ok.CertValid || ok.CertDays == nil || !ok.Redirect || ok.Source != "Caddy" {
		t.Fatalf("example.com: %+v", ok)
	}
	if d := by["nada.example.org"]; d.DNSError == "" || d.Source != "manual" {
		t.Fatalf("nada: %+v", d)
	}
	if d := by["fuera.example.net"]; d.PointsHere || len(d.IPs) != 1 {
		t.Fatalf("fuera: %+v", d)
	}
	if got := a.LastDomainChecks()[srv.ID]; len(got.Domains) != 3 || len(got.Extra) != 2 {
		t.Fatalf("%+v", got)
	}
}

func TestPointDomain(t *testing.T) {
	var body map[string]any
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/user/tokens/verify":
			_, _ = w.Write([]byte(`{"success":true}`))
		case r.URL.Path == "/zones":
			_, _ = w.Write([]byte(`{"result":[{"id":"z","name":"example.com"}]}`))
		case r.Method == http.MethodGet:
			_, _ = w.Write([]byte(`{"result":[]}`))
		default:
			_ = json.NewDecoder(r.Body).Decode(&body)
			_, _ = w.Write([]byte(`{"success":true}`))
		}
	}))
	defer api.Close()
	old := newDNS
	newDNS = func(p, tok string) (*dnsapi.Client, error) {
		c, err := dnsapi.New(p, tok)
		if err == nil {
			c.BaseURL = api.URL
		}
		return c, err
	}
	defer func() { newDNS = old }()
	a := newTestApp(t, noKeyring{})
	if err := a.vault.Create("maestra-de-prueba"); err != nil {
		t.Fatal(err)
	}
	srv, _ := a.store.SaveServer(store.Server{Name: "x", Host: "203.0.113.10", Port: 22, User: "root", AuthMethod: store.AuthKey, KeyPath: "/k"})
	a.saveDomains(srv.ID, DomainReport{Domains: []DomainCheck{{Domain: "tienda.example.com"}}})
	if err := a.SetDNSToken("cloudflare", "tok"); err != nil {
		t.Fatal(err)
	}
	if ps := a.DNSProviders(); !ps[0].HasToken || ps[1].HasToken {
		t.Fatalf("%+v", ps)
	}
	if _, err := a.PointDomain(srv.ID, "otro.example.com", "cloudflare"); err == nil {
		t.Fatal("apuntó un dominio que no es del servidor")
	}
	r, err := a.PointDomain(srv.ID, "tienda.example.com", "cloudflare")
	if err != nil || r.Action != "created" || r.IP != "203.0.113.10" || body["content"] != "203.0.113.10" {
		t.Fatalf("%+v %v %v", r, err, body)
	}
}
