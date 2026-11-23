package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"draupnode/internal/secrets"
)

func writePack(t *testing.T, dir string, files map[string]string) string {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for n, c := range files {
		tw.WriteHeader(&tar.Header{Name: n, Mode: 0o644, Size: int64(len(c)), Typeflag: tar.TypeReg})
		tw.Write([]byte(c))
	}
	tw.Close()
	gz.Close()
	p := filepath.Join(dir, "x"+modShareExt)
	os.WriteFile(p, buf.Bytes(), 0o644)
	return p
}

func TestCompartirModulo(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	if _, err := a.CreateUserModule("mis-cosas", ""); err != nil {
		t.Fatal(err)
	}
	// Algo delicado en una tarea, para que la revisión lo vea.
	tasks := "---\n- name: Instalar\n  ansible.builtin.apt:\n    name: htop\n- name: Script de fuera\n  ansible.builtin.shell: curl -fsSL https://get.example.org/instalar.sh | sh\n- name: Clave\n  ansible.builtin.lineinfile:\n    path: /root/.ssh/authorized_keys\n    line: ssh-ed25519 AAAA\n"
	if _, err := a.SaveUserModuleFile("mis-cosas", "role/tasks/main.yml", tasks); err != nil {
		t.Fatal(err)
	}
	b, err := a.packModule("mis-cosas")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	p := filepath.Join(dir, "mis-cosas"+modShareExt)
	os.WriteFile(p, b, 0o644)

	// En otro Draupnode: se revisa y se importa.
	o := newTestApp(t, secrets.Memory{})
	r := o.inspectModulePath(p)
	if !r.OK || !r.Integrity || r.ID != "mis-cosas" || r.Conflict != "" {
		t.Fatalf("revisión: %+v", r)
	}
	w := strings.Join(r.Warnings, " | ")
	if !strings.Contains(w, "descarga un script") || !strings.Contains(w, "authorized_keys") && !strings.Contains(w, "claves SSH") {
		t.Fatalf("avisos: %s", w)
	}
	if !strings.Contains(strings.Join(r.Tasks, ","), "shell × 1") || len(r.Commands) != 1 || !strings.Contains(strings.Join(r.Hosts, ","), "get.example.org") {
		t.Fatalf("resumen: %v %v %v", r.Tasks, r.Commands, r.Hosts)
	}
	um, err := o.ImportModuleFile(p, "", false)
	if err != nil || um.ID != "mis-cosas" || len(um.Problems) > 0 {
		t.Fatalf("importar: %v %+v", err, um)
	}
	if _, ok := o.cat().Get("mis-cosas"); !ok {
		t.Fatal("no está en el catálogo")
	}
	// Otra vez: choca con el suyo; sustituirlo o importarlo con otro nombre.
	if r := o.inspectModulePath(p); r.Conflict != "user" {
		t.Fatalf("conflicto: %q", r.Conflict)
	}
	if _, err := o.ImportModuleFile(p, "", false); err == nil {
		t.Fatal("debería pedir sustituir o renombrar")
	}
	if _, err := o.ImportModuleFile(p, "", true); err != nil {
		t.Fatal(err)
	}
	um, err = o.ImportModuleFile(p, "otras-cosas", false)
	if err != nil || um.ID != "otras-cosas" {
		t.Fatalf("%v %+v", err, um)
	}
	y, _ := o.ReadUserModuleFile("otras-cosas", "module.yaml")
	if !strings.Contains(y, "id: otras-cosas") || strings.Contains(y, "mis_cosas_") {
		t.Fatalf("no se renombró:\n%s", y)
	}
	// Con el nombre de uno incluido: solo con otro nombre.
	if _, err := o.ImportModuleFile(p, "docker", false); err == nil {
		t.Fatal("no debería pisar un módulo incluido")
	}
}

func TestImportarModuloMalo(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	dir := t.TempDir()
	man := `{"formato":1,"id":"x","ficheros":{"module.yaml":"00"}}`
	cases := map[string]map[string]string{
		"huella":     {modShareManifest: man, "modulo/module.yaml": "id: x\n"},
		"ruta":       {modShareManifest: man, "modulo/../../.bashrc": "malo"},
		"fuera-rol":  {modShareManifest: man, "modulo/etc/passwd": "malo"},
		"manifiesto": {"modulo/module.yaml": "id: x\n"},
	}
	want := map[string]string{"huella": "huella", "ruta": "ruta no permitida", "fuera-rol": "ruta no permitida", "manifiesto": "le falta"}
	for name, files := range cases {
		r := a.inspectModulePath(writePack(t, dir, files))
		if r.OK || !strings.Contains(strings.Join(r.Problems, " "), want[name]) {
			t.Fatalf("%s: %+v", name, r.Problems)
		}
	}
	// Un enlace simbólico dentro del tar tampoco pasa.
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	tw.WriteHeader(&tar.Header{Name: "modulo/role/x", Linkname: "/etc/shadow", Typeflag: tar.TypeSymlink})
	tw.Close()
	gz.Close()
	p := filepath.Join(dir, "enlace"+modShareExt)
	os.WriteFile(p, buf.Bytes(), 0o644)
	if r := a.inspectModulePath(p); r.OK || !strings.Contains(strings.Join(r.Problems, " "), "no es un fichero normal") {
		t.Fatalf("enlace: %+v", r.Problems)
	}
	if _, err := a.ImportModuleFile(p, "", false); err == nil {
		t.Fatal("importó algo que no pasa la revisión")
	}
}
