// Pruebas de integración: construyen y arrancan imágenes de verdad con Docker.
// Solo con DZ_DOCKER=1 (descargan imágenes y tardan unos minutos):
//
//	DZ_DOCKER=1 go test ./internal/dockerize -run Integracion -v
package dockerize

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func sh(t *testing.T, dir, cmd string) (string, error) {
	c := exec.Command("bash", "-c", cmd)
	c.Dir = dir
	out, err := c.CombinedOutput()
	return string(out), err
}

func get(url string) (int, string) {
	for i := 0; i < 60; i++ {
		resp, err := http.Get(url)
		if err == nil {
			b, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			return resp.StatusCode, string(b)
		}
		time.Sleep(time.Second)
	}
	return 0, ""
}

func TestIntegracionConstruir(t *testing.T) {
	if os.Getenv("DZ_DOCKER") == "" {
		t.Skip()
	}
	djangoFiles := map[string]string{
		"manage.py":       "import os,sys\nos.environ.setdefault('DJANGO_SETTINGS_MODULE','web.settings')\nfrom django.core.management import execute_from_command_line\nexecute_from_command_line(sys.argv)\n",
		"web/__init__.py": "",
		"web/settings.py": `import os
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ.get("SECRET_KEY", "x")
DEBUG = False
ALLOWED_HOSTS = ["*"]
INSTALLED_APPS = ["django.contrib.contenttypes", "django.contrib.auth", "django.contrib.staticfiles"]
ROOT_URLCONF = "web.urls"
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
if os.environ.get("DB_HOST"):
    DATABASES = {"default": {"ENGINE": "django.db.backends.postgresql", "HOST": os.environ["DB_HOST"], "NAME": os.environ["DB_NAME"], "USER": os.environ["DB_USER"], "PASSWORD": os.environ["DB_PASSWORD"]}}
else:
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": "/tmp/db.sqlite3"}}
`,
		"web/urls.py":      "from django.http import HttpResponse\nfrom django.db import connection\nfrom django.urls import path\nurlpatterns=[path('', lambda r: HttpResponse('hola django ' + connection.vendor))]\n",
		"web/wsgi.py":      "import os\nos.environ.setdefault('DJANGO_SETTINGS_MODULE','web.settings')\nfrom django.core.wsgi import get_wsgi_application\napplication=get_wsgi_application()\n",
		"requirements.txt": "Django==5.1.4\n",
	}
	cases := []struct {
		name  string
		files map[string]string
		want  string
	}{
		{"django", djangoFiles, "hola django sqlite"},
		{"flask", map[string]string{"requirements.txt": "flask==3.1.0\n", "app.py": "from flask import Flask\napp=Flask(__name__)\n@app.get('/')\ndef i(): return 'hola flask'\n"}, "hola flask"},
		{"express", map[string]string{"package.json": `{"name":"x","scripts":{"start":"node server.js"},"dependencies":{"express":"4.21.2"}}`,
			"server.js": "require('express')().get('/',(q,r)=>r.send('hola express')).listen(3000)"}, "hola express"},
		{"go", map[string]string{"go.mod": "module x\n\ngo 1.23\n", "main.go": "package main\nimport (\"fmt\";\"net/http\")\nfunc main(){http.HandleFunc(\"/\",func(w http.ResponseWriter,r *http.Request){fmt.Fprint(w,\"hola go\")});http.ListenAndServe(\":8080\",nil)}\n"}, "hola go"},
		{"php", map[string]string{"composer.json": `{"require":{"php":"^8.3"}}`, "index.php": "<?php echo 'hola php';"}, "hola php"},
		{"estatica", map[string]string{"index.html": "hola estatica"}, "hola estatica"},
	}
	port := 18900
	for _, c := range cases {
		port++
		dir := proyecto(t, c.files)
		a, _ := Analyze(dir)
		a.Spec.HostPort = port
		files, err := Generate(a.Spec)
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		for n, body := range files {
			os.WriteFile(filepath.Join(dir, n), []byte(body), 0o644)
		}
		t0 := time.Now()
		img := "dz-prueba-" + c.name
		if out, err := sh(t, dir, "docker build -q -t "+img+" ."); err != nil {
			t.Errorf("%s: construir: %v\n%s", c.name, err, lastLines(out, 15))
			continue
		}
		cid, err := sh(t, dir, fmt.Sprintf("docker run -d --rm -p 127.0.0.1:%d:%d %s", port, specPort(a.Spec), img))
		if err != nil {
			t.Errorf("%s: arrancar: %v %s", c.name, err, cid)
			continue
		}
		code, body := get(fmt.Sprintf("http://127.0.0.1:%d/", port))
		user, _ := sh(t, dir, "docker exec "+strings.TrimSpace(cid)+" id -un 2>/dev/null || echo '(sin shell)'")
		t.Logf("%-8s construida en %v · HTTP %d %q · usuario: %s", c.name, time.Since(t0).Round(time.Second), code, strings.TrimSpace(body), strings.TrimSpace(user))
		if !strings.Contains(body, c.want) {
			logs, _ := sh(t, dir, "docker logs "+strings.TrimSpace(cid))
			t.Errorf("%s: respuesta %q\n%s", c.name, body, lastLines(logs, 15))
		}
		sh(t, dir, "docker rm -f "+strings.TrimSpace(cid)+" >/dev/null; docker rmi -f "+img+" >/dev/null")
	}

	// Django con su PostgreSQL, con el docker-compose.yml generado.
	dir := proyecto(t, djangoFiles)
	os.WriteFile(filepath.Join(dir, "requirements.txt"), []byte("Django==5.1.4\npsycopg[binary]==3.2.3\n"), 0o644)
	a, _ := Analyze(dir)
	a.Spec.HostPort = 18950
	a.Spec.Name = "dzprueba"
	files, _ := Generate(a.Spec)
	for n, body := range files {
		os.WriteFile(filepath.Join(dir, n), []byte(body), 0o644)
	}
	os.WriteFile(filepath.Join(dir, ".env"), []byte("DB_PASSWORD=clave-de-prueba\n"), 0o600)
	t0 := time.Now()
	if out, err := sh(t, dir, "docker compose -p dzprueba up -d --build --quiet-pull 2>&1"); err != nil {
		t.Fatalf("compose: %v\n%s", err, lastLines(out, 20))
	}
	code, body := get("http://127.0.0.1:18950/")
	logs, _ := sh(t, dir, "docker compose -p dzprueba logs dzprueba 2>&1 | grep -E 'arranque|Applying|Booting' | head -6")
	t.Logf("compose django+postgres en %v · HTTP %d %q\n%s", time.Since(t0).Round(time.Second), code, body, logs)
	if !strings.Contains(body, "postgresql") {
		t.Error("no usa PostgreSQL")
	}
	sh(t, dir, "docker compose -p dzprueba down -v --rmi local >/dev/null 2>&1")
}

func specPort(s Spec) int {
	if s.Stack == StackStatic || s.Stack == StackPHP || (s.Stack == StackNode && s.Framework == "spa") {
		return 80
	}
	return s.Port
}

func lastLines(s string, n int) string {
	l := strings.Split(strings.TrimSpace(s), "\n")
	if len(l) > n {
		l = l[len(l)-n:]
	}
	return strings.Join(l, "\n")
}
func TestIntegracionJavaVite(t *testing.T) {
	if os.Getenv("DZ_DOCKER") == "" {
		t.Skip()
	}
	cases := []struct {
		name  string
		files map[string]string
		want  string
	}{
		{"spring", map[string]string{
			"pom.xml": `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>
<parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>3.3.5</version></parent>
<groupId>x</groupId><artifactId>demo</artifactId><version>1</version>
<properties><java.version>21</java.version></properties>
<dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies>
<build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build></project>`,
			"src/main/java/x/App.java": "package x;\nimport org.springframework.boot.SpringApplication;\nimport org.springframework.boot.autoconfigure.SpringBootApplication;\nimport org.springframework.web.bind.annotation.*;\n@SpringBootApplication @RestController public class App { @GetMapping(\"/\") String h(){return \"hola spring\";} public static void main(String[] a){SpringApplication.run(App.class,a);} }\n",
		}, "hola spring"},
		{"vite", map[string]string{
			"package.json": `{"name":"x","private":true,"scripts":{"build":"vite build"},"devDependencies":{"vite":"5.4.11"}}`,
			"index.html":   "<!doctype html><html><body><div id=app>hola vite</div><script type=module src=/main.js></script></body></html>",
			"main.js":      "console.log('x')",
		}, "hola vite"},
	}
	port := 18960
	for _, c := range cases {
		port++
		dir := proyecto(t, c.files)
		a, _ := Analyze(dir)
		a.Spec.HostPort = port
		files, err := Generate(a.Spec)
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		for n, body := range files {
			os.WriteFile(filepath.Join(dir, n), []byte(body), 0o644)
		}
		t0 := time.Now()
		img := "dz-prueba-" + c.name
		if out, err := sh(t, dir, "docker build -q -t "+img+" ."); err != nil {
			t.Errorf("%s: construir: %v\n%s", c.name, err, lastLines(out, 15))
			continue
		}
		cid, _ := sh(t, dir, fmt.Sprintf("docker run -d --rm -p 127.0.0.1:%d:%d %s", port, specPort(a.Spec), img))
		code, body := get(fmt.Sprintf("http://127.0.0.1:%d/", port))
		user, _ := sh(t, dir, "docker exec "+strings.TrimSpace(cid)+" id -un 2>/dev/null")
		size, _ := sh(t, dir, "docker image inspect -f '{{.Size}}' "+img)
		t.Logf("%-7s construida en %v · HTTP %d contiene=%v · usuario %s · imagen %s bytes", c.name, time.Since(t0).Round(time.Second), code, strings.Contains(body, c.want), strings.TrimSpace(user), strings.TrimSpace(size))
		sh(t, dir, "docker rm -f "+strings.TrimSpace(cid)+" >/dev/null; docker rmi -f "+img+" >/dev/null")
	}
}

// nginx delante de la app, con el compose generado: entra por el dominio y
// el puerto de nginx; la app no se publica.
func TestIntegracionNginxDelante(t *testing.T) {
	if os.Getenv("DZ_DOCKER") == "" {
		t.Skip()
	}
	dir := proyecto(t, map[string]string{"requirements.txt": "flask==3.1.0\n", "app.py": "from flask import Flask, request\napp=Flask(__name__)\n@app.get('/')\ndef i(): return 'hola por nginx ' + request.headers.get('X-Forwarded-For', '-')\n"})
	a, _ := Analyze(dir)
	a.Spec.Name = "dzproxy"
	a.Spec.Proxy, a.Spec.ProxyDomain, a.Spec.ProxyPort = true, "tienda.ejemplo.com", 18990
	files, err := Generate(a.Spec)
	if err != nil {
		t.Fatal(err)
	}
	for n, body := range files {
		os.WriteFile(filepath.Join(dir, n), []byte(body), 0o644)
	}
	defer sh(t, dir, "docker compose down -v --rmi local >/dev/null 2>&1")
	if out, err := sh(t, dir, "docker compose up -d --build --quiet-pull 2>&1"); err != nil {
		t.Fatalf("compose: %v\n%s", err, lastLines(out, 20))
	}
	var body, otro string
	for i := 0; i < 60; i++ {
		body, _ = sh(t, dir, "curl -s -H 'Host: tienda.ejemplo.com' http://127.0.0.1:18990/")
		if strings.Contains(body, "hola por nginx") {
			break
		}
		time.Sleep(time.Second)
	}
	otro, _ = sh(t, dir, "curl -s -o /dev/null -w '%{http_code}' -H 'Host: otro.ejemplo.com' http://127.0.0.1:18990/")
	ps, _ := sh(t, dir, "docker compose ps --format '{{.Service}} {{.Ports}}'")
	t.Logf("por el dominio: %q · otro dominio: %s\n%s", body, otro, ps)
	if !strings.Contains(body, "hola por nginx") || otro != "000" || strings.Contains(ps, ":8000->") {
		t.Fatal("nginx delante no funciona como debe")
	}
}
