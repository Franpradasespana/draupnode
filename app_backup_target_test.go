package main

import (
	"encoding/base64"
	"strings"
	"testing"

	"draupnode/internal/secrets"
	"draupnode/internal/store"

	"golang.org/x/crypto/bcrypt"
)

func TestDestinoDeCopias(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	s1, _ := a.store.SaveServer(store.Server{Name: "web", Host: "203.0.113.10", Port: 22, User: "root", AuthMethod: store.AuthPassword})
	s2, _ := a.store.SaveServer(store.Server{Name: "copias", Host: "203.0.113.40", Port: 2222, User: "root", AuthMethod: store.AuthPassword})
	src, err := a.SaveProject(store.Project{Name: "Tienda", ServerID: s1.ID, Modules: []store.ProjectModule{{ID: "backups", Values: map[string]any{}}}})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := a.CreateBackupTarget(src.ID, s2.ID, 8000); err == nil || !strings.HasPrefix(err.Error(), codeVaultMissing) {
		t.Fatalf("sin bóveda debería pedirla: %v", err)
	}
	if err := a.vault.Create("maestra-de-prueba"); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 200; i++ {
		if p := RandomTargetPort(); p < targetPortMin || p > targetPortMax {
			t.Fatalf("puerto fuera del rango: %d", p)
		}
	}
	if _, err := a.CreateBackupTarget(src.ID, s1.ID, 8000); err == nil {
		t.Fatal("el mismo servidor debería rechazarse")
	}

	res, err := a.CreateBackupTarget(src.ID, s2.ID, 8000)
	if err != nil {
		t.Fatal(err)
	}
	if !res.TargetIsNew || res.URL != "https://203.0.113.40:8000/tienda" {
		t.Fatalf("%+v", res)
	}
	tgt, _ := a.store.Project(res.TargetProjectID)
	tv := projectModule(tgt, targetModule).Values
	clients := toStrings(tv["backup_target_clients"])
	if len(clients) != 1 || !strings.HasPrefix(clients[0], "tienda:$2") {
		t.Fatalf("clientes: %v", clients)
	}
	fw := projectModule(tgt, "firewall")
	if fw == nil || strings.Join(toStrings(fw.Values["firewall_tcp_ports"]), ",") != "22,2222,8000" {
		t.Fatalf("cortafuegos: %+v", fw)
	}
	if projectModule(tgt, "docker") == nil {
		t.Fatal("debería añadir Docker (dependencia)")
	}

	// El origen apunta al destino, con la contraseña cuya huella tiene el destino.
	src, _ = a.store.Project(src.ID)
	bv := projectModule(src, "backups").Values
	if bv["backups_remote_type"] != "rest-server" || bv["backups_remote"] != res.URL || bv["backups_remote_user"] != "tienda" || bv["backups_remote_append_only"] != true {
		t.Fatalf("origen: %+v", bv)
	}
	pass, _ := a.vault.Get(varName(src.ID, "backups_remote_password"))
	hash := strings.TrimPrefix(clients[0], "tienda:")
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(pass)) != nil {
		t.Fatal("la huella del destino no corresponde a la contraseña del origen")
	}
	cert := bv["backups_remote_cacert"].(string)
	if cert != tv["backup_target_tls_cert"] || !certValidFor(cert, "203.0.113.40") {
		t.Fatal("certificado")
	}
	if k, _ := a.vault.Get(varName(tgt.ID, "backup_target_tls_key")); k == "" {
		t.Fatal("falta la clave del certificado en la bóveda")
	} else if raw, _ := base64.StdEncoding.DecodeString(k); !strings.Contains(string(raw), "PRIVATE KEY") {
		t.Fatal("clave mal guardada")
	}
	if strings.Contains(tgt.Name, "Tienda") || !strings.Contains(tgt.Name, "copias") {
		t.Fatalf("nombre del destino: %s", tgt.Name)
	}

	// Un segundo origen reutiliza el destino y su certificado; repetir el
	// primero cambia su contraseña sin duplicar la línea.
	s3, _ := a.store.SaveServer(store.Server{Name: "blog", Host: "203.0.113.11", User: "root", AuthMethod: store.AuthPassword})
	src2, _ := a.SaveProject(store.Project{Name: "Blog", ServerID: s3.ID, Modules: []store.ProjectModule{{ID: "backups", Values: map[string]any{}}}})
	res2, err := a.CreateBackupTarget(src2.ID, s2.ID, 9999)
	if err != nil || res2.TargetIsNew || res2.TargetProjectID != tgt.ID || !strings.HasSuffix(res2.URL, ":8000/blog") {
		t.Fatalf("segundo: %+v %v", res2, err)
	}
	if _, err := a.CreateBackupTarget(src.ID, s2.ID, 8000); err != nil {
		t.Fatal(err)
	}
	tgt, _ = a.store.Project(tgt.ID)
	tv = projectModule(tgt, targetModule).Values
	if n := len(toStrings(tv["backup_target_clients"])); n != 2 {
		t.Fatalf("debería haber 2 clientes, hay %d", n)
	}
	if tv["backup_target_tls_cert"] != cert {
		t.Fatal("no debería regenerar el certificado")
	}
	// Con la bóveda cerrada, no toca nada.
	a.vault.Lock()
	if _, err := a.CreateBackupTarget(src.ID, s2.ID, 8000); err == nil || !strings.HasPrefix(err.Error(), codeVaultLocked) {
		t.Fatalf("bóveda cerrada: %v", err)
	}
}
