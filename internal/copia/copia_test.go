package copia

import (
	"bytes"
	"testing"
	"time"
)

func init() { kdfTime, kdfMemory, kdfThreads = 1, 1024, 1 }

func TestCopiaIdaYVuelta(t *testing.T) {
	m := Manifest{Version: 1, Created: time.Now().UTC().Truncate(time.Second), Servers: 2, Keys: []KeyFile{{ServerID: "a", File: "keys/a/id"}}}
	files := map[string][]byte{"draupnode.json": []byte(`{"servers":[]}`), "modules/mio/module.yaml": []byte("id: mio\n"), "keys/a/id": []byte("CLAVE")}
	if _, err := Seal("corta", m, files); err == nil {
		t.Fatal("contraseña corta")
	}
	if _, err := Seal("una contraseña larga", m, map[string][]byte{"../fuera": nil}); err == nil {
		t.Fatal("ruta que sale de la copia")
	}
	data, err := Seal("una contraseña larga", m, files)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(data, []byte("CLAVE")) || bytes.Contains(data, []byte("servers")) {
		t.Fatal("hay datos en claro")
	}
	if _, _, err := Open("otra contraseña larga", data); err != ErrWrongPassword {
		t.Fatalf("contraseña mala: %v", err)
	}
	if _, _, err := Open("x", []byte("hola")); err != ErrNotBackup {
		t.Fatalf("no es copia: %v", err)
	}
	// Tocar la cabecera la invalida (va como dato asociado).
	bad := append([]byte{}, data...)
	i := bytes.Index(bad, []byte(`"time":1`))
	bad[i+7] = '2'
	if _, _, err := Open("una contraseña larga", bad); err == nil {
		t.Fatal("cabecera manipulada")
	}
	got, gf, err := Open("una contraseña larga", data)
	if err != nil {
		t.Fatal(err)
	}
	if got.Servers != 2 || len(got.Keys) != 1 || !got.Created.Equal(m.Created) {
		t.Fatalf("manifiesto: %+v", got)
	}
	if len(gf) != 3 || string(gf["keys/a/id"]) != "CLAVE" || string(gf["modules/mio/module.yaml"]) != "id: mio\n" {
		t.Fatalf("ficheros: %v", gf)
	}
}
