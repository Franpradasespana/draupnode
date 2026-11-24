package app

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"draupnode/internal/secrets"
)

func TestVersionNueva(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want bool
	}{{"0.43.0", "0.42.9", true}, {"0.42.0", "0.42.0", false}, {"0.9.0", "0.10.0", false}, {"1.0.0", "0.99.9", true}, {"", "0.1.0", false}} {
		if got := newerVersion(c.a, c.b); got != c.want {
			t.Errorf("%s > %s = %v", c.a, c.b, got)
		}
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") != "draupnode" {
			t.Error("user-agent")
		}
		w.Write([]byte(`{"tag_name":"v99.0.0","html_url":"https://github.com/` + repoSlug + `/releases/tag/v99.0.0","body":"Novedades"}`))
	}))
	defer srv.Close()
	old := releasesURL
	releasesURL = srv.URL
	defer func() { releasesURL = old }()
	a := newTestApp(t, secrets.Memory{})
	info, err := a.CheckUpdate()
	if err != nil || !info.Newer || info.Latest != "99.0.0" || info.URL == "" {
		t.Fatalf("%+v %v", info, err)
	}
	a.SetUpdateCheck(false)
	if info, _ := a.CheckUpdate(); info.Enabled || info.Newer {
		t.Fatal("desactivado no debería consultar")
	}
	a.SaveSettings(a.store.Settings())
	if a.store.Settings().NoUpdateCheck != true {
		t.Fatal("guardar el tema no debe pisar la opción")
	}
}
