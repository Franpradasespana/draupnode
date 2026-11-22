// Package dockerize analiza la carpeta de un proyecto (Python, Node, Java,
// PHP, Go o web estática) y genera su Dockerfile, docker-compose.yml,
// .dockerignore y, si hace falta, docker-entrypoint.sh, comentados en español
// para quien no conoce Docker.
//
// Solo lee: nunca escribe en la carpeta (eso lo hace quien llama, cuando el
// usuario lo confirma) y nunca abre ficheros de secretos (.env): las
// variables de entorno se sacan de .env.example.
package dockerize

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// Analysis es lo que se ha deducido del proyecto. Sirve de valores iniciales
// del asistente: el usuario puede cambiarlo todo.
type Analysis struct {
	Dir      string   `json:"dir"`
	Name     string   `json:"name"` // para la imagen y los contenedores
	Spec     Spec     `json:"spec"`
	Evidence []string `json:"evidence"` // en qué se ha basado («hay manage.py»…)
	Warnings []string `json:"warnings"`
	// Ficheros que ya existen y se generarían.
	Existing []string `json:"existing"`
	// Otras opciones posibles (si hay varias pistas, p. ej. Node y Python).
	Alternatives []string `json:"alternatives"`
}

// Lenguajes y frameworks que se reconocen.
const (
	StackPython = "python"
	StackNode   = "node"
	StackJava   = "java"
	StackPHP    = "php"
	StackGo     = "go"
	StackStatic = "static"
)

func exists(dir, name string) bool {
	_, err := os.Stat(filepath.Join(dir, name))
	return err == nil
}

func read(dir, name string) string {
	b, err := os.ReadFile(filepath.Join(dir, name))
	if err != nil || len(b) > 2<<20 {
		return ""
	}
	return string(b)
}

var nameRe = regexp.MustCompile(`[^a-z0-9]+`)

// SafeName convierte el nombre de una carpeta en uno válido para Docker.
func SafeName(s string) string {
	s = strings.Trim(nameRe.ReplaceAllString(strings.ToLower(s), "-"), "-")
	if s == "" {
		s = "app"
	}
	if len(s) > 40 {
		s = strings.Trim(s[:40], "-")
	}
	return s
}

// Analyze mira la carpeta y propone una configuración.
func Analyze(dir string) (*Analysis, error) { return AnalyzeAs(dir, "") }

// AnalyzeAs es Analyze, pero tratando el proyecto como el lenguaje indicado
// (si el usuario elige otro distinto del detectado). "" = el detectado.
func AnalyzeAs(dir, stack string) (*Analysis, error) {
	if _, ok := Versions[stack]; stack != "" && !ok {
		return nil, os.ErrInvalid
	}
	st, err := os.Stat(dir)
	if err != nil {
		return nil, err
	}
	if !st.IsDir() {
		return nil, os.ErrInvalid
	}
	a := &Analysis{Dir: dir, Name: SafeName(filepath.Base(dir)), Evidence: []string{}, Warnings: []string{}, Existing: []string{}, Alternatives: []string{}}
	for _, f := range []string{"Dockerfile", "docker-compose.yml", "compose.yaml", ".dockerignore", "docker-entrypoint.sh"} {
		if exists(dir, f) {
			a.Existing = append(a.Existing, f)
		}
	}
	// Si ya tiene Dockerfile o compose, lo nuevo se guarda al lado.
	sideBySide := exists(dir, "Dockerfile") || exists(dir, "docker-compose.yml") || exists(dir, "compose.yaml")
	defer func() { a.Spec.SideBySide = sideBySide }()

	var found []string
	if exists(dir, "requirements.txt") || exists(dir, "pyproject.toml") || exists(dir, "Pipfile") || exists(dir, "manage.py") {
		found = append(found, StackPython)
	}
	if exists(dir, "package.json") {
		found = append(found, StackNode)
	}
	if exists(dir, "pom.xml") || exists(dir, "build.gradle") || exists(dir, "build.gradle.kts") {
		found = append(found, StackJava)
	}
	if exists(dir, "composer.json") || exists(dir, "index.php") {
		found = append(found, StackPHP)
	}
	if exists(dir, "go.mod") {
		found = append(found, StackGo)
	}
	if len(found) == 0 && exists(dir, "index.html") {
		found = append(found, StackStatic)
	}
	if stack != "" && (len(found) == 0 || found[0] != stack) {
		rest := []string{}
		for _, f := range found {
			if f != stack {
				rest = append(rest, f)
			}
		}
		found = append([]string{stack}, rest...)
	}
	if len(found) == 0 {
		a.Warnings = append(a.Warnings, "No he reconocido el tipo de proyecto: elígelo tú en el primer paso.")
		a.Spec = Default(StackPython, a.Name)
		a.Spec.Stack = ""
		return a, nil
	}
	// Con varias pistas (p. ej. Django con un package.json para el CSS) manda
	// el backend; el resto queda como alternativa. PHP (composer.json, artisan)
	// también manda sobre el package.json de sus estilos (Laravel con Vite).
	if stack == "" && len(found) > 1 && found[0] == StackNode {
		for i, f := range found {
			if f == StackPHP {
				found = append([]string{StackPHP}, append(append([]string{}, found[:i]...), found[i+1:]...)...)
				break
			}
		}
	}
	main := found[0]
	a.Alternatives = found[1:]
	switch main {
	case StackPython:
		a.Spec = detectPython(dir, a)
	case StackNode:
		a.Spec = detectNode(dir, a)
	case StackJava:
		a.Spec = detectJava(dir, a)
	case StackPHP:
		a.Spec = detectPHP(dir, a)
	case StackGo:
		a.Spec = detectGo(dir, a)
	case StackStatic:
		a.Spec = Default(StackStatic, a.Name)
		a.Evidence = append(a.Evidence, "Hay un index.html y ningún lenguaje de servidor: web estática servida con nginx.")
	}
	a.Spec.Name = a.Name
	a.Spec.EnvKeys = envKeys(dir)
	if len(a.Spec.EnvKeys) > 0 {
		a.Evidence = append(a.Evidence, "Variables de entorno sacadas de .env.example: "+strings.Join(a.Spec.EnvKeys, ", ")+".")
	}
	// Variables que lee el código y no están en el .env.example (p. ej. DB_ENGINE en settings.py).
	if extra := CodeEnvKeys(dir, a.Spec.EnvKeys); len(extra) > 0 {
		a.Spec.EnvKeys = append(a.Spec.EnvKeys, extra...)
		a.Evidence = append(a.Evidence, "Variables que lee tu código y no están en .env.example: "+strings.Join(extra, ", ")+".")
	}
	if exists(dir, ".env") {
		a.Evidence = append(a.Evidence, "Hay un .env: no se lee ni se mete en la imagen (va en .dockerignore); el compose lo usa al arrancar.")
	}
	return a, nil
}

// envKeys saca los nombres (nunca los valores) de .env.example o similares.
func envKeys(dir string) []string {
	for _, f := range []string{".env.example", ".env.sample", ".env.template", ".env.dist"} {
		s := read(dir, f)
		if s == "" {
			continue
		}
		var keys []string
		seen := map[string]bool{}
		for _, line := range strings.Split(s, "\n") {
			line = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "export "))
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			k, _, ok := strings.Cut(line, "=")
			k = strings.TrimSpace(k)
			if ok && regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`).MatchString(k) && !seen[k] {
				seen[k] = true
				keys = append(keys, k)
			}
		}
		return keys
	}
	return []string{}
}

func has(deps string, names ...string) bool {
	for _, n := range names {
		if regexp.MustCompile(`(?mi)^\s*"?` + regexp.QuoteMeta(n) + `\b`).MatchString(deps) {
			return true
		}
	}
	return false
}

var pyVerRe = regexp.MustCompile(`(\d+\.\d+)`)

func detectPython(dir string, a *Analysis) Spec {
	s := Default(StackPython, a.Name)
	deps := strings.ToLower(read(dir, "requirements.txt") + "\n" + read(dir, "pyproject.toml") + "\n" + read(dir, "Pipfile"))
	switch {
	case exists(dir, "requirements.txt"):
		a.Evidence = append(a.Evidence, "Python: hay requirements.txt.")
	case exists(dir, "pyproject.toml"):
		s.PyInstall = "pyproject"
		a.Evidence = append(a.Evidence, "Python: hay pyproject.toml (se instala con «pip install .»).")
	case exists(dir, "Pipfile"):
		a.Warnings = append(a.Warnings, "Hay un Pipfile pero no requirements.txt: genera uno con «pipenv requirements > requirements.txt».")
	}
	for _, f := range []string{".python-version", "runtime.txt"} {
		if m := pyVerRe.FindString(read(dir, f)); m != "" {
			s.Version = m
			a.Evidence = append(a.Evidence, "Versión de Python "+m+" (de "+f+").")
			break
		}
	}
	switch {
	case exists(dir, "manage.py") || has(deps, "django"):
		s.Framework = "django"
		s.Port = 8000
		s.DjangoMigrate, s.DjangoCollectstatic = true, true
		if mod := findDjangoModule(dir); mod != "" {
			s.Module = mod
			a.Evidence = append(a.Evidence, "Django: manage.py y "+mod+"/wsgi.py.")
		} else {
			a.Evidence = append(a.Evidence, "Django (manage.py).")
		}
		s.Start = "gunicorn " + s.Module + ".wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 120"
		if !has(deps, "gunicorn") {
			s.ExtraPip = append(s.ExtraPip, "gunicorn")
			a.Warnings = append(a.Warnings, "No está gunicorn en las dependencias: el Dockerfile lo instala aparte (mejor añádelo a requirements.txt).")
		}
		if exists(dir, "media") {
			s.Volumes = append(s.Volumes, "/app/media")
		}
	case has(deps, "fastapi"):
		s.Framework = "fastapi"
		mod := findPyApp(dir)
		s.Start = "uvicorn " + mod + ":app --host 0.0.0.0 --port 8000"
		a.Evidence = append(a.Evidence, "FastAPI (en las dependencias).")
		if !has(deps, "uvicorn") {
			s.ExtraPip = append(s.ExtraPip, "uvicorn")
		}
	case has(deps, "flask"):
		s.Framework = "flask"
		mod := findPyApp(dir)
		s.Start = "gunicorn " + mod + ":app --bind 0.0.0.0:8000 --workers 3"
		a.Evidence = append(a.Evidence, "Flask (en las dependencias).")
		if !has(deps, "gunicorn") {
			s.ExtraPip = append(s.ExtraPip, "gunicorn")
		}
	default:
		s.Start = "python " + findPyApp(dir) + ".py"
	}
	if has(deps, "psycopg2") && !has(deps, "psycopg2-binary") {
		s.SystemPackages = append(s.SystemPackages, "libpq-dev", "gcc")
		a.Evidence = append(a.Evidence, "psycopg2 (sin -binary) necesita compilar: se añaden libpq-dev y gcc.")
	}
	if has(deps, "mysqlclient") {
		s.SystemPackages = append(s.SystemPackages, "default-libmysqlclient-dev", "pkg-config", "gcc")
	}
	detectDBs(deps, &s, a, []string{"psycopg", "psycopg2", "psycopg2-binary", "asyncpg"}, []string{"mysqlclient", "pymysql", "mysql-connector-python", "mariadb"}, []string{"redis", "celery", "django-redis", "rq"})
	return s
}

func findDjangoModule(dir string) string {
	ents, _ := os.ReadDir(dir)
	for _, e := range ents {
		if e.IsDir() && exists(filepath.Join(dir, e.Name()), "wsgi.py") && exists(filepath.Join(dir, e.Name()), "settings.py") {
			return e.Name()
		}
	}
	for _, e := range ents {
		if e.IsDir() && exists(filepath.Join(dir, e.Name()), "wsgi.py") {
			return e.Name()
		}
	}
	return "config"
}

func findPyApp(dir string) string {
	for _, f := range []string{"main", "app", "wsgi", "server", "run"} {
		if exists(dir, f+".py") {
			return f
		}
	}
	return "main"
}

func detectDBs(deps string, s *Spec, a *Analysis, pg, my, redis []string) {
	if has(deps, pg...) {
		s.Postgres = true
		a.Evidence = append(a.Evidence, "Usa PostgreSQL (por sus dependencias).")
	}
	if has(deps, my...) {
		s.MariaDB = true
		a.Evidence = append(a.Evidence, "Usa MySQL/MariaDB (por sus dependencias).")
	}
	if has(deps, redis...) {
		s.Redis = true
		a.Evidence = append(a.Evidence, "Usa Redis (por sus dependencias).")
	}
}

type packageJSON struct {
	Scripts         map[string]string `json:"scripts"`
	Dependencies    map[string]string `json:"dependencies"`
	DevDependencies map[string]string `json:"devDependencies"`
	Engines         map[string]string `json:"engines"`
	Main            string            `json:"main"`
}

func detectNode(dir string, a *Analysis) Spec {
	s := Default(StackNode, a.Name)
	var pj packageJSON
	_ = json.Unmarshal([]byte(read(dir, "package.json")), &pj)
	all := map[string]bool{}
	for k := range pj.Dependencies {
		all[k] = true
	}
	for k := range pj.DevDependencies {
		all[k] = true
	}
	switch {
	case exists(dir, "pnpm-lock.yaml"):
		s.NodePM = "pnpm"
	case exists(dir, "yarn.lock"):
		s.NodePM = "yarn"
	default:
		s.NodePM = "npm"
	}
	s.NodeLock = exists(dir, "package-lock.json") || exists(dir, "yarn.lock") || exists(dir, "pnpm-lock.yaml")
	a.Evidence = append(a.Evidence, "Node: hay package.json (gestor "+s.NodePM+").")
	if !s.NodeLock {
		a.Warnings = append(a.Warnings, "No hay package-lock.json: se instala con «npm install» y cada construcción puede bajar versiones distintas. Mejor súbelo al proyecto.")
	}
	if v := regexp.MustCompile(`\d+`).FindString(pj.Engines["node"] + read(dir, ".nvmrc")); v != "" {
		s.Version = v
		a.Evidence = append(a.Evidence, "Versión de Node "+v+".")
	}
	server := all["express"] || all["fastify"] || all["@nestjs/core"] || all["koa"] || all["hapi"] || all["@hapi/hapi"]
	_, hasBuild := pj.Scripts["build"]
	_, hasStart := pj.Scripts["start"]
	switch {
	case all["next"]:
		s.Framework = "next"
		s.Port = 3000
		s.NodeBuild = hasBuild
		s.Start = s.NodePM + " run start"
		a.Evidence = append(a.Evidence, "Next.js: se compila y se arranca con «start».")
	case (all["vite"] || all["react-scripts"] || all["@angular/core"] || all["@vue/cli-service"]) && !server && hasBuild:
		s.Framework = "spa"
		s.Port = 80
		s.NodeBuild = true
		s.StaticDir = "dist"
		if all["react-scripts"] {
			s.StaticDir = "build"
		}
		if all["@angular/core"] {
			s.StaticDir = "dist/" + a.Name + "/browser"
			a.Warnings = append(a.Warnings, "Angular: revisa la carpeta de salida de la compilación (dist/<proyecto>/browser).")
		}
		a.Evidence = append(a.Evidence, "Web que se compila («build») y se sirve como estática con nginx (sale de "+s.StaticDir+"/).")
	default:
		s.Framework = "server"
		s.NodeBuild = hasBuild && (all["typescript"] || all["@nestjs/core"])
		switch {
		case hasStart:
			s.Start = s.NodePM + " run start"
		case pj.Main != "":
			s.Start = "node " + pj.Main
		default:
			s.Start = "node index.js"
		}
		a.Evidence = append(a.Evidence, "Servidor Node: se arranca con «"+s.Start+"».")
	}
	deps := strings.Join(keys(all), "\n")
	detectDBs(deps, &s, a, []string{"pg", "postgres", "@prisma/client", "typeorm"}, []string{"mysql", "mysql2", "mariadb"}, []string{"redis", "ioredis", "bull", "bullmq"})
	if s.Framework == "spa" {
		s.Postgres, s.MariaDB, s.Redis = false, false, false
	}
	return s
}

func keys(m map[string]bool) []string {
	var out []string
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

var (
	javaVerRe   = regexp.MustCompile(`<(?:java\.version|maven\.compiler\.release|maven\.compiler\.source)>\s*(?:1\.)?(\d+)\s*<`)
	gradleVerRe = regexp.MustCompile(`(?:languageVersion\s*(?:=|\.set\()\s*JavaLanguageVersion\.of\(|sourceCompatibility\s*=\s*(?:JavaVersion\.VERSION_)?['"]?(?:1[._])?)(\d+)`)
)

func detectJava(dir string, a *Analysis) Spec {
	s := Default(StackJava, a.Name)
	var deps string
	if exists(dir, "pom.xml") {
		pom := read(dir, "pom.xml")
		deps = pom
		s.JavaBuild = "maven"
		if m := javaVerRe.FindStringSubmatch(pom); m != nil {
			s.Version = m[1]
		}
		a.Evidence = append(a.Evidence, "Java con Maven (pom.xml).")
	} else {
		g := read(dir, "build.gradle") + read(dir, "build.gradle.kts")
		deps = g
		s.JavaBuild = "gradle"
		if m := gradleVerRe.FindStringSubmatch(g); m != nil {
			s.Version = m[1]
		}
		a.Evidence = append(a.Evidence, "Java con Gradle.")
	}
	s.JavaWrapper = exists(dir, "mvnw") || exists(dir, "gradlew")
	if strings.Contains(deps, "spring-boot") {
		s.Framework = "spring"
		a.Evidence = append(a.Evidence, "Spring Boot: se compila un .jar y se arranca con java -jar.")
	}
	a.Evidence = append(a.Evidence, "Versión de Java "+s.Version+".")
	lower := strings.ToLower(deps)
	s.Postgres = strings.Contains(lower, "postgresql")
	s.MariaDB = strings.Contains(lower, "mysql") || strings.Contains(lower, "mariadb")
	s.Redis = strings.Contains(lower, "redis")
	return s
}

func detectPHP(dir string, a *Analysis) Spec {
	s := Default(StackPHP, a.Name)
	composer := strings.ToLower(read(dir, "composer.json"))
	if strings.Contains(composer, "laravel/framework") || exists(dir, "artisan") {
		s.Framework = "laravel"
		s.DocRoot = "public"
		s.LaravelMigrate = true
		a.Evidence = append(a.Evidence, "Laravel (artisan): Apache sirve la carpeta public/.")
	} else {
		a.Evidence = append(a.Evidence, "PHP con Apache.")
	}
	if m := regexp.MustCompile(`"php"\s*:\s*"[^\d]*(\d+\.\d+)`).FindStringSubmatch(composer); m != nil {
		s.Version = m[1]
	}
	env := strings.ToLower(read(dir, ".env.example"))
	s.Postgres = strings.Contains(env, "db_connection=pgsql") || strings.Contains(composer, "pgsql")
	s.MariaDB = strings.Contains(env, "db_connection=mysql") || strings.Contains(env, "db_connection=mariadb")
	s.Redis = strings.Contains(env, "redis_host") || strings.Contains(composer, "predis")
	return s
}

func detectGo(dir string, a *Analysis) Spec {
	s := Default(StackGo, a.Name)
	if m := regexp.MustCompile(`(?m)^go\s+(\d+\.\d+)`).FindStringSubmatch(read(dir, "go.mod")); m != nil {
		s.Version = m[1]
	}
	if !exists(dir, "main.go") {
		if ents, err := os.ReadDir(filepath.Join(dir, "cmd")); err == nil && len(ents) > 0 {
			s.GoMain = "./cmd/" + ents[0].Name()
		}
	}
	a.Evidence = append(a.Evidence, "Go (go.mod), versión "+s.Version+": se compila en una imagen y se ejecuta en otra mínima.")
	mod := strings.ToLower(read(dir, "go.mod"))
	s.Postgres = strings.Contains(mod, "jackc/pgx") || strings.Contains(mod, "lib/pq")
	s.MariaDB = strings.Contains(mod, "go-sql-driver/mysql")
	s.Redis = strings.Contains(mod, "redis")
	return s
}
