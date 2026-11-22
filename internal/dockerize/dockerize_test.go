package dockerize

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// proyecto crea una carpeta de ejemplo con estos ficheros.
func proyecto(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "Mi Proyecto")
	for name, body := range files {
		p := filepath.Join(dir, name)
		os.MkdirAll(filepath.Dir(p), 0o755)
		os.WriteFile(p, []byte(body), 0o644)
	}
	return dir
}

func TestDetectar(t *testing.T) {
	cases := []struct {
		name  string
		files map[string]string
		check func(s Spec) bool
	}{
		{"django", map[string]string{"manage.py": "", "web/settings.py": "", "web/wsgi.py": "", "requirements.txt": "Django==5.1\npsycopg2==2.9\nredis\n", ".python-version": "3.11.4\n",
			".env.example": "# comentario\nSECRET_KEY=x\nexport DEBUG=1\n", ".env": "SECRET_KEY=no-debe-leerse\n"},
			func(s Spec) bool {
				return s.Framework == "django" && s.Module == "web" && s.Version == "3.11" && s.Postgres && s.Redis && strings.Contains(s.Start, "web.wsgi") &&
					strings.Join(s.ExtraPip, ",") == "gunicorn" && strings.Contains(strings.Join(s.SystemPackages, ","), "libpq-dev") && strings.Join(s.EnvKeys, ",") == "SECRET_KEY,DEBUG"
			}},
		{"fastapi", map[string]string{"requirements.txt": "fastapi\nuvicorn\n", "app.py": ""}, func(s Spec) bool {
			return s.Framework == "fastapi" && s.Start == "uvicorn app:app --host 0.0.0.0 --port 8000"
		}},
		{"express", map[string]string{"package.json": `{"scripts":{"start":"node server.js"},"dependencies":{"express":"4","pg":"8"},"engines":{"node":">=20"}}`, "yarn.lock": ""},
			func(s Spec) bool {
				return s.Framework == "server" && s.NodePM == "yarn" && s.Version == "20" && s.Postgres && s.Start == "yarn run start"
			}},
		{"vite", map[string]string{"package.json": `{"scripts":{"build":"vite build"},"devDependencies":{"vite":"5","react":"18"}}`},
			func(s Spec) bool { return s.Framework == "spa" && s.StaticDir == "dist" && s.NodeBuild }},
		{"spring", map[string]string{"pom.xml": "<project><properties><java.version>17</java.version></properties><dependency>spring-boot-starter-web</dependency><dependency>postgresql</dependency></project>", "mvnw": ""},
			func(s Spec) bool {
				return s.Framework == "spring" && s.Version == "17" && s.JavaBuild == "maven" && s.JavaWrapper && s.Postgres
			}},
		{"gradle", map[string]string{"build.gradle.kts": "java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }"},
			func(s Spec) bool { return s.JavaBuild == "gradle" && s.Version == "21" }},
		{"laravel", map[string]string{"composer.json": `{"require":{"php":"^8.2","laravel/framework":"^11"}}`, "artisan": "", ".env.example": "DB_CONNECTION=mysql\n"},
			func(s Spec) bool {
				return s.Framework == "laravel" && s.Version == "8.2" && s.MariaDB && s.DocRoot == "public"
			}},
		{"go", map[string]string{"go.mod": "module x\n\ngo 1.22\n\nrequire github.com/jackc/pgx/v5 v5.0.0\n", "cmd/servidor/main.go": ""},
			func(s Spec) bool { return s.Version == "1.22" && s.GoMain == "./cmd/servidor" && s.Postgres }},
		{"estatica", map[string]string{"index.html": "<h1>hola</h1>"}, func(s Spec) bool { return s.Stack == StackStatic }},
	}
	for _, c := range cases {
		a, err := Analyze(proyecto(t, c.files))
		if err != nil {
			t.Fatal(err)
		}
		if a.Name != "mi-proyecto" || !c.check(a.Spec) {
			t.Errorf("%s: %+v · %v · %v", c.name, a.Spec, a.Evidence, a.Warnings)
		}
		files, err := Generate(a.Spec)
		if err != nil {
			t.Errorf("%s: %v", c.name, err)
			continue
		}
		var y map[string]any
		if err := yaml.Unmarshal([]byte(files["docker-compose.yml"]), &y); err != nil {
			t.Errorf("%s: compose no es YAML válido: %v", c.name, err)
		}
		if !strings.Contains(files["Dockerfile"], "FROM ") || strings.Contains(files["Dockerfile"], "no-debe-leerse") {
			t.Errorf("%s: Dockerfile raro", c.name)
		}
		for _, f := range files {
			if strings.Contains(f, "no-debe-leerse") {
				t.Errorf("%s: se ha leído el .env", c.name)
			}
		}
	}
}

func TestValidar(t *testing.T) {
	s := Default(StackPython, "app")
	s.Start = "gunicorn x; rm -rf /"
	if _, err := Generate(s); err == nil {
		t.Fatal("aceptó ; en la orden")
	}
	s = Default(StackPython, "app")
	s.SystemPackages = []string{"curl && evil"}
	if _, err := Generate(s); err == nil {
		t.Fatal("aceptó un paquete raro")
	}
	s = Default(StackNode, "app")
	s.Framework = "spa"
	f, _ := Generate(s)
	if !strings.Contains(f["docker-compose.yml"], `"127.0.0.1:${APP_HOST_PORT:-8080}:80"`) || strings.Contains(f["docker-compose.yml"], "env_file") {
		t.Fatalf("spa: %s", f["docker-compose.yml"])
	}
	s = Default(StackPython, "app")
	s.Framework, s.Postgres, s.DBMode = "django", true, "shared"
	f, _ = Generate(s)
	if !strings.Contains(f["docker-compose.yml"], "DB_HOST: pg-compartido") || strings.Contains(f["docker-compose.yml"], "  db:\n") || !strings.Contains(f["docker-compose.yml"], "external: true") {
		t.Fatalf("compartido: %s", f["docker-compose.yml"])
	}
}

func TestAlLado(t *testing.T) {
	s := Default(StackPython, "app")
	s.Framework, s.DjangoMigrate, s.SideBySide = "django", true, true
	f, err := Generate(s)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := f["Dockerfile.draupnode"]; !ok {
		t.Fatalf("nombres: %v", f)
	}
	if !strings.Contains(f["Dockerfile.draupnode"], `ENTRYPOINT ["./docker-entrypoint.draupnode.sh"]`) || !strings.Contains(f["Dockerfile.draupnode"], "chmod +x docker-entrypoint.draupnode.sh") {
		t.Fatal(f["Dockerfile.draupnode"])
	}
	if !strings.Contains(f["docker-compose.draupnode.yml"], "dockerfile: Dockerfile.draupnode") || f["docker-entrypoint.draupnode.sh"] == "" || f["Dockerfile.draupnode.dockerignore"] == "" {
		t.Fatal(f["docker-compose.draupnode.yml"])
	}
}

func TestNginxDelante(t *testing.T) {
	s := Default(StackPython, "tienda")
	s.Proxy, s.ProxyDomain = true, "tienda.ejemplo.com"
	f, err := Generate(s)
	if err != nil {
		t.Fatal(err)
	}
	c, n := f["docker-compose.yml"], f["nginx.conf"]
	if !strings.Contains(c, "expose:") || strings.Contains(c, "\"8000:8000\"") || !strings.Contains(c, "\"80:80\"") || !strings.Contains(c, "./nginx.conf:/etc/nginx/conf.d/default.conf:ro") {
		t.Fatalf("compose:\n%s", c)
	}
	if !strings.Contains(n, "server_name tienda.ejemplo.com;") || !strings.Contains(n, "proxy_pass http://tienda:8000;") || !strings.Contains(n, "return 444;") {
		t.Fatalf("nginx.conf:\n%s", n)
	}
	s.ProxyDomain, s.ProxyPort = "", 8081
	f, _ = Generate(s)
	if !strings.Contains(f["docker-compose.yml"], "\"8081:80\"") || !strings.Contains(f["nginx.conf"], "server_name _;") || strings.Contains(f["nginx.conf"], "444") {
		t.Fatal("sin dominio y en otro puerto")
	}
	s.ProxyDomain = "no válido;"
	if _, err := Generate(s); err == nil {
		t.Fatal("dominio inválido aceptado")
	}
	s.Proxy = false
	if _, ok := mustGen(t, s)["nginx.conf"]; ok {
		t.Fatal("sin proxy no debe haber nginx.conf")
	}
}

func mustGen(t *testing.T, s Spec) map[string]string {
	s.ProxyDomain = ""
	f, err := Generate(s)
	if err != nil {
		t.Fatal(err)
	}
	return f
}
