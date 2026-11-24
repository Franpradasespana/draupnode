package app

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"strings"
	"testing"

	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

func tarB64(t *testing.T, files map[string]string) string {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for n, v := range files {
		tw.WriteHeader(&tar.Header{Name: "./" + n, Mode: 0o600, Size: int64(len(v)), Typeflag: tar.TypeReg})
		tw.Write([]byte(v))
	}
	tw.Close()
	gz.Close()
	return base64.StdEncoding.EncodeToString(buf.Bytes())
}

func TestCarpetaDeSecretosFija(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	srv, _ := a.SaveServer(srvPassword(), "", false, "")
	srv2, _ := a.SaveServer(srvPassword(), "", false, "")
	p1, _ := a.SaveProject(store.Project{Name: "Web", ServerID: srv.ID})
	p2, _ := a.SaveProject(store.Project{Name: "web", ServerID: srv2.ID}) // un conjunto de módulos por servidor
	if p1.Slug != "web" || p2.Slug != "web-2" {
		t.Fatalf("slugs %q %q", p1.Slug, p2.Slug)
	}
	p1.Name = "Otro nombre"
	p1, _ = a.SaveProject(p1)
	if p1.Slug != "web" {
		t.Fatalf("renombrar cambió la carpeta de secretos: %q", p1.Slug)
	}
}

func TestContrasenasDelProyecto(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	srv, _ := a.SaveServer(srvPassword(), "", false, "")
	p, _ := a.SaveProject(store.Project{Name: "BD", ServerID: srv.ID, Modules: []store.ProjectModule{{ID: "postgres", Values: map[string]any{}}}})
	if a.ProjectSecretsInfo(p.ID).VaultExists {
		t.Fatal("no hay bóveda todavía")
	}
	if st := a.RunProject(p.ID, false, "", "", ""); st.Status != "vault_missing" {
		t.Fatalf("aplicar sin bóveda: %+v", st)
	}
	if st := a.RunProject(p.ID, true, "", "", ""); st.Status == "vault_missing" || st.Status == "vault_locked" {
		t.Fatalf("previsualizar no necesita la bóveda: %+v", st)
	}
	master := "una maestra larga"
	if err := a.VaultCreate(master); err != nil {
		t.Fatal(err)
	}
	n, err := a.storeGenerated(p.ID, tarB64(t, map[string]string{"postgres_superusuario": "abc\n", "postgres_tienda": "def"}))
	if err != nil || n != 2 {
		t.Fatalf("%d %v", n, err)
	}
	if info := a.ProjectSecretsInfo(p.ID); info.Generated != 2 || info.At == "" {
		t.Fatalf("info %+v", info)
	}
	if _, err := a.ProjectSecrets(p.ID, "mal"); err == nil {
		t.Fatal("abrió con la maestra equivocada")
	}
	list, err := a.ProjectSecrets(p.ID, master)
	if err != nil || len(list) != 2 {
		t.Fatalf("%v %+v", err, list)
	}
	byName := map[string]ProjectSecret{}
	for _, s := range list {
		byName[s.Name] = s
	}
	if s := byName["postgres_superusuario"]; s.Value != "abc" || s.Label != "Superusuario «postgres»" || s.Module != "PostgreSQL compartido" {
		t.Fatalf("superusuario %+v", s)
	}
	if byName["postgres_tienda"].Label != "Usuario de la base" {
		t.Fatalf("comodín %+v", byName["postgres_tienda"])
	}
	// Lo que ya no está en el servidor se quita; los de otro proyecto no se tocan.
	srvOtro, _ := a.SaveServer(srvPassword(), "", false, "")
	other, _ := a.SaveProject(store.Project{Name: "Otro", ServerID: srvOtro.ID})
	a.storeGenerated(other.ID, tarB64(t, map[string]string{"x": "1"}))
	a.storeGenerated(p.ID, tarB64(t, map[string]string{"postgres_superusuario": "abc"}))
	if list, _ := a.ProjectSecrets(p.ID, master); len(list) != 1 {
		t.Fatalf("sincronizar: %+v", list)
	}
	if err := a.DeleteProject(p.ID); err != nil {
		t.Fatal(err)
	}
	for _, n := range a.vault.Names() {
		if strings.Contains(n, p.ID) {
			t.Fatalf("quedó %s en la bóveda", n)
		}
	}
	if a.ProjectSecretsInfo(other.ID).Generated != 1 {
		t.Fatal("borró los del otro proyecto")
	}
}

func TestReglasSSH(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	pw, _ := a.SaveServer(srvPassword(), "", false, "") // root con contraseña
	chk := a.CheckProject(store.Project{Name: "x", ServerID: pw.ID, Modules: []store.ProjectModule{{ID: "ssh", Values: map[string]any{}}}})
	if chk.Errors["ssh"]["ssh_password_auth"] == "" || chk.Errors["ssh"]["ssh_root_login"] == "" {
		t.Fatalf("debe impedir quedarse fuera: %+v", chk.Errors)
	}
	key := store.Server{Name: "k", Host: "203.0.113.20", Port: 22, User: "ubuntu", AuthMethod: store.AuthKey, KeyPath: "/dev/null"}
	ks, err := a.store.SaveServer(key)
	if err != nil {
		t.Fatal(err)
	}
	p := store.Project{Name: "y", ServerID: ks.ID, Modules: []store.ProjectModule{
		{ID: "firewall", Values: map[string]any{}},
		{ID: "ssh", Values: map[string]any{"ssh_port": 2200, "ssh_allow_users": []any{"otro"}}},
	}}
	chk = a.CheckProject(p)
	if chk.Errors["ssh"]["ssh_allow_users"] == "" || len(chk.Errors["ssh"]) != 1 {
		t.Fatalf("AllowUsers sin el usuario: %+v", chk.Errors)
	}
	w := strings.Join(chk.Warnings, " | ")
	if !strings.Contains(w, "del puerto 22 al 2200") || !strings.Contains(w, "puerto 2200 y no está en la lista del Cortafuegos") {
		t.Fatalf("avisos: %s", w)
	}
	// Servidor de pruebas (puerto redirigido): no se puede cambiar el puerto.
	lab := store.Server{Name: "l", Host: "127.0.0.1", Port: 2222, User: "ubuntu", AuthMethod: store.AuthKey, KeyPath: "/dev/null"}
	ls, _ := a.store.SaveServer(lab)
	p.ServerID = ls.ID
	p.Modules[1].Values = map[string]any{"ssh_port": 2200}
	if a.CheckProject(p).Errors["ssh"]["ssh_port"] == "" {
		t.Fatal("en el servidor de pruebas no se debe poder cambiar el puerto")
	}
	// Tras aplicar, el servidor real pasa al puerto nuevo.
	p.ServerID = ks.ID
	if msg := a.afterApply(p); !strings.Contains(msg, "2200") {
		t.Fatalf("afterApply: %q", msg)
	}
	if s, _ := a.store.Server(ks.ID); s.Port != 2200 {
		t.Fatalf("puerto %d", s.Port)
	}
}

func TestRutasSegurasYCopias(t *testing.T) {
	for name, ok := range map[string]bool{"data/ab/abcd": true, "config": true, "../x": false, "/etc/passwd": false, "a/../b": false, "": false, ".": false, `a\b`: false} {
		if safeRel(name) != ok {
			t.Errorf("safeRel(%q) != %v", name, ok)
		}
	}
	snaps, err := parseSnapshots(`[{"short_id":"aa","time":"2026-11-19T03:30:00Z","tags":["x"],"paths":["/a"],"hostname":"h"},
		{"short_id":"bb","time":"2026-11-20T03:30:00Z","paths":["/b"],"hostname":"h","summary":{"total_bytes_processed":42}}]`)
	if err != nil || len(snaps) != 2 || snaps[0].ID != "bb" || snaps[0].Bytes != 42 || snaps[0].Tags == nil {
		t.Fatalf("%v %+v", err, snaps)
	}
}

func TestListadoDeUnaCopia(t *testing.T) {
	out := `{"time":"2026-11-20T03:30:00Z","paths":["/x"],"struct_type":"snapshot"}
{"name":"postgres-pg","type":"dir","path":"/postgres-pg","size":0,"mtime":"2026-11-20T03:30:00Z","struct_type":"node"}
{"name":"tienda.dump","type":"file","path":"/postgres-pg/tienda.dump","size":4096,"mtime":"2026-11-20T03:30:00Z","struct_type":"node"}
{"name":"a","type":"dir","path":"/postgres-pg/a","size":0,"mtime":"2026-11-20T03:30:00Z","struct_type":"node"}
{"name":"b.txt","type":"file","path":"/postgres-pg/a/b.txt","size":1,"mtime":"2026-11-20T03:30:00Z","struct_type":"node"}`
	e := parseLs(out, "/postgres-pg")
	if len(e) != 2 || e[0].Name != "a" || e[1].Size != 4096 {
		t.Fatalf("%+v", e)
	}
	for p, ok := range map[string]bool{"/": true, "/etc/x": true, "x": false, "/a/../b": false, "/a/": false, "/a\nb": false} {
		if validPath(p) != ok {
			t.Errorf("validPath(%q) != %v", p, ok)
		}
	}
}
