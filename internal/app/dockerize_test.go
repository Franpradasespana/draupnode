package app

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestDockerizeGuardar(t *testing.T) {
	a := &App{}
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "manage.py"), []byte("import os\nos.environ.setdefault('DJANGO_SETTINGS_MODULE','web.settings')\n"), 0o644)
	os.MkdirAll(filepath.Join(dir, "web"), 0o755)
	os.WriteFile(filepath.Join(dir, "web", "settings.py"), []byte(""), 0o644)
	os.WriteFile(filepath.Join(dir, "web", "wsgi.py"), []byte(""), 0o644)
	os.WriteFile(filepath.Join(dir, "requirements.txt"), []byte("Django\npsycopg\n"), 0o644)

	if _, err := a.AnalyzeProject("relativa", ""); err == nil {
		t.Fatal("una ruta relativa debería rechazarse")
	}
	an, err := a.AnalyzeProject(dir, "")
	if err != nil || an.Spec.Framework != "django" || an.Spec.SideBySide {
		t.Fatalf("análisis: %+v %v", an, err)
	}
	pv := a.GenerateDocker(dir, an.Spec)
	if len(pv.Errors) > 0 || len(pv.Files) < 3 || pv.Files[0].Name != "Dockerfile" {
		t.Fatalf("vista previa: %+v", pv)
	}
	saved, err := a.WriteDockerFiles(dir, an.Spec, false)
	if err != nil {
		t.Fatal(err)
	}
	if st, err := os.Stat(filepath.Join(dir, "docker-entrypoint.sh")); err != nil || st.Mode().Perm() != 0o755 {
		t.Fatalf("entrypoint: %v %v", st, err)
	}
	if _, err := a.WriteDockerFiles(dir, an.Spec, false); err == nil || !strings.Contains(err.Error(), "ya existen") {
		t.Fatalf("debería negarse a sustituir: %v", err)
	}
	if _, err := a.WriteDockerFiles(dir, an.Spec, true); err != nil {
		t.Fatal(err)
	}
	t.Logf("guardados: %v", saved)

	// Con un Dockerfile propio, el siguiente análisis guarda al lado.
	an2, _ := a.AnalyzeProject(dir, "")
	if !an2.Spec.SideBySide {
		t.Fatal("con Dockerfile existente debería guardar al lado")
	}
	pv2 := a.GenerateDocker(dir, an2.Spec)
	if pv2.Files[0].Name != "Dockerfile.draupnode" || pv2.Files[0].Exists {
		t.Fatalf("al lado: %+v", pv2.Files[0])
	}
	// Forzar otro lenguaje.
	an3, err := a.AnalyzeProject(dir, "node")
	if err != nil || an3.Spec.Stack != "node" {
		t.Fatalf("forzar node: %+v %v", an3, err)
	}
	// Lo que llega de la interfaz se valida.
	bad := an.Spec
	bad.Start = "gunicorn; rm -rf /"
	if pv := a.GenerateDocker(dir, bad); len(pv.Errors) == 0 {
		t.Fatal("una orden con ; debería rechazarse")
	}
	if _, err := a.WriteDockerFiles(dir, bad, true); err == nil {
		t.Fatal("no debería guardar algo inválido")
	}
}

// Con Docker de verdad (DZ_DOCKER=1): construye la imagen desde la app.
func TestDockerizeConstruir(t *testing.T) {
	if os.Getenv("DZ_DOCKER") == "" {
		t.Skip()
	}
	ev := make(chan DockerBuildEvent, 1000)
	a := &App{emit: func(n string, d any) {
		if n == "dockerbuild" {
			ev <- d.(DockerBuildEvent)
		}
	}}
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "index.html"), []byte("hola"), 0o644)
	an, _ := a.AnalyzeProject(dir, "")
	an.Spec.Name = "dz-app-prueba"
	if err := a.BuildDockerImage(dir, an.Spec); err == nil {
		t.Fatal("sin guardar no debería construir")
	}
	if _, err := a.WriteDockerFiles(dir, an.Spec, false); err != nil {
		t.Fatal(err)
	}
	if err := a.BuildDockerImage(dir, an.Spec); err != nil {
		t.Fatal(err)
	}
	lines := 0
	for e := range ev {
		if e.Kind == "line" {
			lines++
			continue
		}
		if !e.OK {
			t.Fatalf("falló: %s", e.Error)
		}
		t.Logf("%s en %d s, %d líneas", e.Image, e.Secs, lines)
		break
	}
	exec.Command("docker", "rmi", "-f", "draupnode-prueba/dz-app-prueba:latest").Run()
}
