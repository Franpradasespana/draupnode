package app

import (
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"draupnode/internal/cloudapi"
)

// Crear un servidor en Hetzner contra una API falsa: pide el token a la
// bóveda, crea una clave solo para él y lo da de alta con root y su IP.
func TestCrearServidorEnLaNube(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			w.WriteHeader(401)
			return
		}
		switch r.URL.Path {
		case "/locations":
			_, _ = io.WriteString(w, `{"locations":[{"name":"fsn1","city":"Falkenstein","country":"DE"}]}`)
		case "/server_types":
			_, _ = io.WriteString(w, `{"server_types":[{"name":"cx22","cores":2,"memory":4,"disk":40,"architecture":"x86","prices":[{"location":"fsn1","price_monthly":{"gross":"4.59"}}]}]}`)
		case "/ssh_keys":
			if r.Method == http.MethodGet {
				_, _ = io.WriteString(w, `{"ssh_keys":[]}`)
			} else {
				_, _ = io.WriteString(w, `{"ssh_key":{"id":1}}`)
			}
		case "/servers":
			_, _ = io.WriteString(w, `{"server":{"id":5}}`)
		case "/servers/5":
			_, _ = io.WriteString(w, `{"server":{"status":"running","public_net":{"ipv4":{"ip":"127.0.0.1"}}}}`)
		default:
			w.WriteHeader(404)
		}
	}))
	defer api.Close()
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
	old := newCloud
	newCloud = func(p, tok string) (*cloudapi.Client, error) {
		c, err := cloudapi.New(p, tok)
		if err == nil {
			c.BaseURL, c.Poll, c.SSHPort = api.URL, 10*time.Millisecond, l.Addr().(*net.TCPAddr).Port
		}
		return c, err
	}
	defer func() { newCloud = old }()

	a := newTestApp(t, noKeyring{})
	if err := a.CloudSetToken("hetzner", "tok"); err == nil || !strings.HasPrefix(err.Error(), codeVaultMissing) {
		t.Fatalf("sin bóveda debería pedirla: %v", err)
	}
	if err := a.vault.Create("maestra-de-prueba"); err != nil {
		t.Fatal(err)
	}
	if err := a.CloudSetToken("hetzner", "malo"); err == nil {
		t.Fatal("token malo aceptado")
	}
	if err := a.CloudSetToken("hetzner", "tok"); err != nil {
		t.Fatal(err)
	}
	ps := a.CloudProviders()
	if len(ps) != 2 || !ps[0].HasToken || ps[1].HasToken {
		t.Fatalf("proveedores: %+v", ps)
	}
	cat, err := a.CloudCatalog("hetzner")
	if err != nil || len(cat.Sizes) != 1 {
		t.Fatalf("catálogo: %+v %v", cat, err)
	}
	v, err := a.CloudCreateServer(CloudCreateRequest{Provider: "hetzner", Name: "web-1", Region: "fsn1", Size: "cx22", NewKey: true})
	if err != nil {
		t.Fatal(err)
	}
	if v.Cloud == nil || v.Cloud.Provider != "hetzner" || v.Cloud.ID != "5" || !v.Cloud.SnapshotBeforeApply || v.Cloud.KeepSnapshots != DefaultKeepSnapshots {
		t.Fatalf("vínculo con el proveedor: %+v", v.Cloud)
	}
	if v.Host != "127.0.0.1" || v.User != "root" || v.Port != 22 || v.KeyEncrypted || !strings.Contains(v.Notes, "Hetzner") {
		t.Fatalf("servidor: %+v", v)
	}
	if fi, err := os.Stat(v.KeyPath); err != nil || fi.Mode().Perm() != 0o600 {
		t.Fatalf("clave nueva: %v %v", fi, err)
	}
	if _, err := os.Stat(v.KeyPath + ".pub"); err != nil {
		t.Fatal(err)
	}
	if _, err := a.CloudCreateServer(CloudCreateRequest{Provider: "hetzner", Name: "Mal_Nombre", Region: "fsn1", Size: "cx22", NewKey: true}); err == nil {
		t.Fatal("nombre malo aceptado")
	}
}
