package dockerize

import (
	"draupnode/internal/i18n"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Spec es todo lo que decide el asistente.
type Spec struct {
	Stack     string `json:"stack"`     // python | node | java | php | go | static
	Framework string `json:"framework"` // django | flask | fastapi | next | spa | server | spring | laravel | ""
	Name      string `json:"name"`      // nombre de la imagen/servicio
	Version   string `json:"version"`   // del lenguaje
	Port      int    `json:"port"`      // puerto en el que escucha la app dentro del contenedor
	HostPort  int    `json:"hostPort"`  // puerto en el equipo/servidor (compose)
	Start     string `json:"start"`     // orden de arranque

	// Python
	PyInstall           string   `json:"pyInstall"` // requirements | pyproject
	Module              string   `json:"module"`    // módulo de Django (config, mysite…)
	ExtraPip            []string `json:"extraPip"`
	DjangoMigrate       bool     `json:"djangoMigrate"`
	DjangoCollectstatic bool     `json:"djangoCollectstatic"`
	DjangoSuperuser     bool     `json:"djangoSuperuser"`
	// Node
	NodePM    string `json:"nodePm"` // npm | yarn | pnpm
	NodeBuild bool   `json:"nodeBuild"`
	NodeLock  bool   `json:"nodeLock"`  // hay fichero de bloqueo (package-lock.json…)
	StaticDir string `json:"staticDir"` // salida de la compilación (spa)
	// Java
	JavaBuild   string `json:"javaBuild"` // maven | gradle
	JavaWrapper bool   `json:"javaWrapper"`
	// PHP
	DocRoot        string `json:"docRoot"`
	LaravelMigrate bool   `json:"laravelMigrate"`
	// Go
	GoMain string `json:"goMain"`

	SystemPackages []string `json:"systemPackages"` // paquetes de Debian extra
	Volumes        []string `json:"volumes"`        // carpetas de la app que guardan datos
	EnvKeys        []string `json:"envKeys"`
	NonRoot        bool     `json:"nonRoot"`
	HealthPath     string   `json:"healthPath"` // ruta HTTP para comprobar que responde ("" = sin comprobación)

	// Servicios
	Postgres bool   `json:"postgres"`
	MariaDB  bool   `json:"mariadb"`
	Redis    bool   `json:"redis"`
	DBMode   string `json:"dbMode"` // own (en este compose) | shared (PostgreSQL compartido de Draupnode)
	// Para «shared»: red y contenedor del PostgreSQL compartido.
	SharedNetwork string `json:"sharedNetwork"`
	SharedHost    string `json:"sharedHost"`

	// SideBySide: el proyecto ya tiene sus ficheros de Docker; los nuevos se
	// guardan al lado con «.draupnode» en el nombre y se refieren entre sí.
	SideBySide bool `json:"sideBySide"`

	// Proxy: un nginx delante de la app, en el compose. Escucha en ProxyPort
	// (80 por defecto) para el dominio ProxyDomain ("" = cualquiera) y reenvía
	// por dentro al puerto de la app, que ya no se publica.
	Proxy       bool   `json:"proxy"`
	ProxyDomain string `json:"proxyDomain"`
	ProxyPort   int    `json:"proxyPort"`
	// MaxBodyMB: tamaño máximo de subida a través de nginx.
	MaxBodyMB int `json:"maxBodyMb"`
}

// FileNames son los nombres de los ficheros generados.
type FileNames struct {
	Dockerfile, Ignore, Compose, Entrypoint, Nginx string
}

// Names devuelve los nombres con los que se guardan los ficheros.
func (s Spec) Names() FileNames {
	if s.SideBySide {
		return FileNames{"Dockerfile.draupnode", "Dockerfile.draupnode.dockerignore", "docker-compose.draupnode.yml", "docker-entrypoint.draupnode.sh", "nginx.draupnode.conf"}
	}
	return FileNames{"Dockerfile", ".dockerignore", "docker-compose.yml", "docker-entrypoint.sh", "nginx.conf"}
}

// Versions son las versiones que ofrece el asistente para cada lenguaje.
var Versions = map[string][]string{
	StackPython: {"3.13", "3.12", "3.11", "3.10"},
	StackNode:   {"22", "20", "24"},
	StackJava:   {"21", "17", "25", "11"},
	StackPHP:    {"8.3", "8.4", "8.2"},
	StackGo:     {"1.23", "1.24", "1.22"},
	StackStatic: {""},
}

// Default es la configuración de partida de cada lenguaje.
func Default(stack, name string) Spec {
	s := Spec{Stack: stack, Name: name, NonRoot: true, DBMode: "own", SharedNetwork: "apps", SharedHost: "pg-compartido", ProxyPort: 80, MaxBodyMB: 50,
		ExtraPip: []string{}, SystemPackages: []string{}, Volumes: []string{}, EnvKeys: []string{}}
	switch stack {
	case StackPython:
		s.Version, s.Port, s.PyInstall, s.Module = "3.12", 8000, "requirements", "config"
		s.Start = "python main.py"
	case StackNode:
		s.Version, s.Port, s.NodePM, s.Framework, s.StaticDir = "22", 3000, "npm", "server", "dist"
		s.Start = "npm run start"
	case StackJava:
		s.Version, s.Port, s.JavaBuild = "21", 8080, "maven"
	case StackPHP:
		s.Version, s.Port, s.DocRoot = "8.3", 80, ""
	case StackGo:
		s.Version, s.Port, s.GoMain = "1.23", 8080, "."
	case StackStatic:
		s.Port = 80
	}
	return s
}

var (
	safeRe   = regexp.MustCompile(`^[A-Za-z0-9._/:@+=, -]*$`)
	pkgRe    = regexp.MustCompile(`^[a-z0-9][a-z0-9.+-]*$`)
	pipRe    = regexp.MustCompile(`^[A-Za-z0-9._\[\]<>=!~-]+$`)
	dirRe    = regexp.MustCompile(`^[A-Za-z0-9._/-]*$`)
	moduleRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_.]*$`)
	envRe    = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
	domainRe = regexp.MustCompile(`^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$`)
)

// Validate comprueba lo que va a acabar dentro de los ficheros.
func (s *Spec) Validate() []string {
	var e []string
	if _, ok := Versions[s.Stack]; !ok {
		e = append(e, i18n.T("elige el tipo de proyecto"))
	}
	if s.Name == "" || SafeName(s.Name) != s.Name {
		e = append(e, i18n.T("el nombre solo puede tener minúsculas, números y guiones"))
	}
	if s.Port < 1 || s.Port > 65535 {
		e = append(e, i18n.T("puerto de la app no válido"))
	}
	if s.HostPort != 0 && (s.HostPort < 1 || s.HostPort > 65535) {
		e = append(e, i18n.T("puerto de publicación no válido"))
	}
	if !safeRe.MatchString(s.Start) || strings.ContainsAny(s.Start, "\"'`$\\;&|") {
		e = append(e, "la orden de arranque tiene caracteres que no se admiten (comillas, $, ;, &, |)")
	}
	if !safeRe.MatchString(s.Version) {
		e = append(e, "versión no válida")
	}
	for _, p := range s.SystemPackages {
		if !pkgRe.MatchString(p) {
			e = append(e, "paquete del sistema no válido: "+p)
		}
	}
	for _, p := range s.ExtraPip {
		if !pipRe.MatchString(p) {
			e = append(e, "paquete de Python no válido: "+p)
		}
	}
	for _, v := range s.Volumes {
		if !strings.HasPrefix(v, "/") || !dirRe.MatchString(v) {
			e = append(e, "carpeta de datos no válida: "+v)
		}
	}
	for _, k := range s.EnvKeys {
		if !envRe.MatchString(k) {
			e = append(e, "variable no válida: "+k)
		}
	}
	if s.Module != "" && !moduleRe.MatchString(s.Module) {
		e = append(e, "módulo de Django no válido")
	}
	if !dirRe.MatchString(s.StaticDir) || !dirRe.MatchString(s.DocRoot) || !dirRe.MatchString(s.GoMain) || !dirRe.MatchString(s.HealthPath) {
		e = append(e, "alguna carpeta tiene caracteres no válidos")
	}
	if s.Proxy {
		if s.ProxyDomain != "" && !domainRe.MatchString(s.ProxyDomain) {
			e = append(e, "dominio no válido (p. ej. tienda.ejemplo.com)")
		}
		if s.ProxyPort != 0 && (s.ProxyPort < 1 || s.ProxyPort > 65535) {
			e = append(e, "puerto de nginx no válido")
		}
		if s.MaxBodyMB < 0 || s.MaxBodyMB > 10240 {
			e = append(e, "tamaño máximo de subida no válido")
		}
	}
	if s.DBMode == "shared" && (!envRe.MatchString(strings.ReplaceAll(s.SharedNetwork, "-", "_")) || !envRe.MatchString(strings.ReplaceAll(s.SharedHost, "-", "_"))) {
		e = append(e, "red o contenedor del PostgreSQL compartido no válidos")
	}
	return e
}

// startArgs convierte la orden de arranque en la forma JSON de Docker
// (["gunicorn", "x", ...]): así la app recibe las señales de parada.
func startArgs(cmd string) string {
	f := strings.Fields(cmd)
	q := make([]string, len(f))
	for i, x := range f {
		q[i] = strconv.Quote(x)
	}
	return "[" + strings.Join(q, ", ") + "]"
}

// Generate devuelve los ficheros generados: nombre → contenido.
func Generate(s Spec) (map[string]string, error) {
	if errs := s.Validate(); len(errs) > 0 {
		return nil, fmt.Errorf("%s", strings.Join(errs, "; "))
	}
	// Lo que sirve Apache o nginx escucha en el 80.
	if s.Stack == StackStatic || s.Stack == StackPHP || (s.Stack == StackNode && s.Framework == "spa") {
		s.Port = 80
	}
	if s.HostPort == 0 {
		s.HostPort = s.Port
		if s.Port == 80 {
			s.HostPort = 8080
		}
	}
	n := s.Names()
	files := map[string]string{
		n.Dockerfile: dockerfile(s),
		n.Ignore:     dockerignore(s),
		n.Compose:    compose(s),
	}
	if ep := entrypoint(s); ep != "" {
		files[n.Entrypoint] = ep
	}
	if s.Proxy {
		if s.ProxyPort == 0 {
			s.ProxyPort = 80
		}
		if s.MaxBodyMB == 0 {
			s.MaxBodyMB = 50
		}
		files[n.Compose] = compose(s)
		files[n.Nginx] = nginxConf(s)
	}
	return files, nil
}

func needsEntrypoint(s Spec) bool {
	return entrypoint(s) != ""
}

func usesDB(s Spec) bool { return s.Postgres || s.MariaDB }

func header(what string) string {
	return "# " + what + " generado por Draupnode. Revísalo y cámbialo a tu gusto: es tuyo.\n"
}

func dockerfile(s Spec) string { // s ya viene normalizado por Generate
	var b strings.Builder
	b.WriteString(header("Dockerfile"))
	b.WriteString("# Un Dockerfile es la receta para construir la imagen de tu app: qué sistema\n# lleva, qué se instala y cómo arranca. Se construye con «docker build .»\n\n")
	apt := func(pkgs []string, comment string) {
		if len(pkgs) == 0 {
			return
		}
		b.WriteString("# " + comment + "\n")
		b.WriteString("RUN apt-get update && apt-get install -y --no-install-recommends " + strings.Join(pkgs, " ") + " \\\n    && rm -rf /var/lib/apt/lists/*\n\n")
	}
	user := func(name string) {
		if s.NonRoot {
			b.WriteString("# La app no corre como administrador (root): si alguien la ataca, puede hacer menos daño.\n")
			b.WriteString("USER " + name + "\n\n")
		}
	}
	expose := func() {
		b.WriteString(fmt.Sprintf("# Puerto en el que escucha la app dentro del contenedor.\nEXPOSE %d\n\n", s.Port))
	}
	health := func() {
		if s.HealthPath == "" {
			return
		}
		if s.Stack == StackJava || s.Stack == StackPHP {
			b.WriteString("# wget para la comprobación de salud.\nRUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*\n")
		}
		b.WriteString(fmt.Sprintf("# Docker comprueba cada 30 s que la app responde; si no, la marca como «unhealthy».\nHEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \\\n  CMD wget -qO- http://127.0.0.1:%d%s >/dev/null || exit 1\n\n", s.Port, s.HealthPath))
	}
	entry := func() {
		if needsEntrypoint(s) {
			b.WriteString("# Antes de arrancar se ejecuta docker-entrypoint.sh (esperar a la base, migrar…).\nENTRYPOINT [\"./" + s.Names().Entrypoint + "\"]\n")
		}
	}

	switch s.Stack {
	case StackPython:
		b.WriteString("# Imagen oficial de Python, versión «slim» (Debian reducida).\nFROM python:" + s.Version + "-slim\n\n")
		b.WriteString("# Sin ficheros .pyc y con la salida al momento (para ver los registros en Docker).\nENV PYTHONDONTWRITEBYTECODE=1 \\\n    PYTHONUNBUFFERED=1\n\n")
		pk := append([]string{}, s.SystemPackages...)
		if usesDB(s) {
			pk = append(pk, "netcat-openbsd")
		}
		if s.HealthPath != "" {
			pk = append(pk, "wget")
		}
		apt(pk, "Programas del sistema que necesita la app (y netcat para esperar a la base de datos).")
		if s.NonRoot {
			b.WriteString("# Usuario sin privilegios para la app.\nRUN useradd --create-home --shell /bin/bash app\n\n")
		}
		b.WriteString("# Carpeta de trabajo dentro del contenedor: aquí va tu código.\nWORKDIR /app\n\n")
		if s.PyInstall == "pyproject" {
			b.WriteString("# Primero las dependencias (así Docker las reutiliza si solo cambia el código).\nCOPY pyproject.toml ./\nCOPY . .\nRUN pip install --no-cache-dir .\n")
		} else {
			b.WriteString("# Primero solo requirements.txt: si no cambia, Docker reutiliza las dependencias\n# ya instaladas y la construcción es mucho más rápida.\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\n")
		}
		if len(s.ExtraPip) > 0 {
			b.WriteString("# Servidor de producción (no está en las dependencias del proyecto).\nRUN pip install --no-cache-dir " + strings.Join(s.ExtraPip, " ") + "\n")
		}
		b.WriteString("\n")
		if s.PyInstall != "pyproject" {
			b.WriteString("# Ahora el resto del código (lo que no esté en .dockerignore).\nCOPY . .\n\n")
		}
		dirs := []string{}
		if s.Framework == "django" && s.DjangoCollectstatic {
			dirs = append(dirs, "/app/staticfiles")
		}
		dirs = append(dirs, s.Volumes...)
		chown := ""
		if s.NonRoot {
			chown = " \\\n    && chown -R app:app /app"
		}
		if needsEntrypoint(s) || len(dirs) > 0 || s.NonRoot {
			cmds := []string{}
			if len(dirs) > 0 {
				cmds = append(cmds, "mkdir -p "+strings.Join(dirs, " "))
			}
			if needsEntrypoint(s) {
				cmds = append(cmds, "chmod +x "+s.Names().Entrypoint)
			}
			if len(cmds) > 0 || chown != "" {
				b.WriteString("# Carpetas de trabajo, permisos del script de arranque y dueño de los ficheros.\n")
				line := strings.Join(cmds, " \\\n    && ")
				if line == "" {
					b.WriteString("RUN chown -R app:app /app\n\n")
				} else {
					b.WriteString("RUN " + line + chown + "\n\n")
				}
			}
		}
		user("app")
		expose()
		health()
		entry()
		b.WriteString("# Orden que arranca la app.\nCMD " + startArgs(s.Start) + "\n")

	case StackNode:
		npmInstall := "npm ci"
		if !s.NodeLock {
			npmInstall = "npm install" // sin package-lock.json, npm ci no funciona
		}
		pmInstall := map[string]string{
			"npm":  npmInstall,
			"yarn": "corepack enable && yarn install --frozen-lockfile",
			"pnpm": "corepack enable && pnpm install --frozen-lockfile",
		}[s.NodePM]
		lock := map[string]string{"npm": "package-lock.json*", "yarn": "yarn.lock", "pnpm": "pnpm-lock.yaml"}[s.NodePM]
		run := map[string]string{"npm": "npm run", "yarn": "yarn", "pnpm": "pnpm"}[s.NodePM]
		if s.Framework == "spa" {
			b.WriteString("# Dos fases: en la primera se compila la web con Node; en la segunda solo se\n# copia el resultado a nginx. La imagen final es pequeña y no lleva Node.\n\n")
			b.WriteString("# --- Fase 1: compilar ---\nFROM node:" + s.Version + "-alpine AS compilar\nWORKDIR /app\n")
			b.WriteString("# Primero las dependencias (se reutilizan si no cambian).\nCOPY package.json " + lock + " ./\nRUN " + pmInstall + "\n")
			b.WriteString("COPY . .\nRUN " + run + " build\n\n")
			b.WriteString("# --- Fase 2: servir con nginx ---\nFROM nginx:1.27-alpine\n")
			b.WriteString("# La web compilada a la carpeta que sirve nginx.\nCOPY --from=compilar /app/" + strings.TrimSuffix(s.StaticDir, "/") + "/ /usr/share/nginx/html/\n")
			b.WriteString("# Para webs de una sola página (React, Vue…): cualquier ruta devuelve index.html.\nRUN printf 'server {\\n  listen 80;\\n  root /usr/share/nginx/html;\\n  location / { try_files $uri $uri/ /index.html; }\\n}\\n' > /etc/nginx/conf.d/default.conf\n\n")
			expose()
			health()
			break
		}
		b.WriteString("# Imagen oficial de Node, versión «alpine» (muy pequeña).\nFROM node:" + s.Version + "-alpine\n\n")
		b.WriteString("# Modo producción: algunas librerías funcionan más rápido y no se cargan herramientas de desarrollo.\nENV NODE_ENV=production\n\n")
		b.WriteString("WORKDIR /app\n\n")
		inst := pmInstall
		if s.NodeBuild {
			inst = strings.Replace(strings.Replace(inst, "npm ci", "npm ci --include=dev", 1), "npm install", "npm install --include=dev", 1)
		}
		b.WriteString("# Primero las dependencias (se reutilizan si package.json no cambia).\nCOPY package.json " + lock + " ./\nRUN " + inst + "\n\n")
		b.WriteString("# El resto del código.\nCOPY . .\n\n")
		if s.NodeBuild {
			b.WriteString("# Compilar (TypeScript, Next…).\nRUN " + run + " build\n\n")
		}
		if s.NonRoot {
			b.WriteString("# La imagen de Node ya trae el usuario «node», sin privilegios.\nRUN chown -R node:node /app\n")
			user("node")
		}
		expose()
		health()
		entry()
		b.WriteString("# Orden que arranca la app.\nCMD " + startArgs(s.Start) + "\n")

	case StackJava:
		b.WriteString("# Dos fases: en la primera se compila el .jar con el JDK completo; en la segunda\n# solo se ejecuta con el JRE (más pequeña y sin herramientas de compilar).\n\n")
		if s.JavaBuild == "gradle" {
			if s.JavaWrapper {
				b.WriteString("# --- Fase 1: compilar con Gradle (el gradlew del proyecto) ---\nFROM eclipse-temurin:" + s.Version + "-jdk AS compilar\nWORKDIR /app\nCOPY . .\nRUN chmod +x gradlew && ./gradlew --no-daemon clean bootJar -x test || ./gradlew --no-daemon clean build -x test\n")
			} else {
				b.WriteString("# --- Fase 1: compilar con Gradle ---\nFROM gradle:8-jdk" + s.Version + " AS compilar\nWORKDIR /app\nCOPY . .\nRUN gradle --no-daemon clean build -x test\n")
			}
			b.WriteString("# El .jar ejecutable (no el «-plain», que no lleva las dependencias).\nRUN find build/libs -name '*.jar' ! -name '*-plain.jar' -exec cp {} /app/app.jar \\;\n\n")
		} else {
			if s.JavaWrapper {
				b.WriteString("# --- Fase 1: compilar con Maven (el mvnw del proyecto) ---\nFROM eclipse-temurin:" + s.Version + "-jdk AS compilar\nWORKDIR /app\n")
				b.WriteString("# Primero solo el pom.xml: las dependencias se descargan una vez y se reutilizan.\nCOPY mvnw pom.xml ./\nCOPY .mvn .mvn\nRUN chmod +x mvnw && ./mvnw -B -q dependency:go-offline\nCOPY src src\nRUN ./mvnw -B -q package -DskipTests\n")
			} else {
				b.WriteString("# --- Fase 1: compilar con Maven ---\nFROM maven:3.9-eclipse-temurin-" + s.Version + " AS compilar\nWORKDIR /app\n")
				b.WriteString("# Primero solo el pom.xml: las dependencias se descargan una vez y se reutilizan.\nCOPY pom.xml .\nRUN mvn -B -q dependency:go-offline\nCOPY src src\nRUN mvn -B -q package -DskipTests\n")
			}
			b.WriteString("RUN cp target/*.jar /app/app.jar\n\n")
		}
		b.WriteString("# --- Fase 2: ejecutar ---\nFROM eclipse-temurin:" + s.Version + "-jre\nWORKDIR /app\n")
		if s.NonRoot {
			b.WriteString("RUN useradd --system --create-home app\n")
		}
		b.WriteString("COPY --from=compilar /app/app.jar app.jar\n\n")
		user("app")
		expose()
		health()
		b.WriteString("# Arrancar la app. Usa como máximo el 75 % de la memoria del contenedor.\nCMD [\"java\", \"-XX:MaxRAMPercentage=75\", \"-jar\", \"app.jar\"]\n")

	case StackPHP:
		b.WriteString("# Imagen oficial de PHP con el servidor web Apache.\nFROM php:" + s.Version + "-apache\n\n")
		ext := []string{}
		if s.Postgres {
			ext = append(ext, "pdo_pgsql")
		}
		if s.MariaDB {
			ext = append(ext, "pdo_mysql")
		}
		pk := append([]string{}, s.SystemPackages...)
		if s.Postgres {
			pk = append(pk, "libpq-dev")
		}
		pk = append(pk, "unzip", "libzip-dev")
		apt(pk, "Programas del sistema que necesitan las extensiones de PHP.")
		ext = append(ext, "zip")
		b.WriteString("# Extensiones de PHP (conectores de base de datos, zip para Composer).\nRUN docker-php-ext-install " + strings.Join(ext, " ") + "\n\n")
		b.WriteString("# Composer (gestor de dependencias de PHP), desde su imagen oficial.\nCOPY --from=composer:2 /usr/bin/composer /usr/bin/composer\n\n")
		if s.DocRoot != "" {
			b.WriteString("# Apache sirve la carpeta " + s.DocRoot + "/ y permite las URLs bonitas (.htaccess).\nENV APACHE_DOCUMENT_ROOT=/var/www/html/" + s.DocRoot + "\n")
			b.WriteString("RUN sed -ri 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \\\n    && a2enmod rewrite\n\n")
		}
		b.WriteString("WORKDIR /var/www/html\n\n# Primero las dependencias (se reutilizan si composer.json no cambia).\nCOPY composer.json composer.lock* ./\nRUN composer install --no-dev --no-scripts --no-autoloader --no-interaction\n\n")
		b.WriteString("# El resto del código y el cargador de clases optimizado.\nCOPY . .\nRUN composer dump-autoload --optimize")
		if s.Framework == "laravel" {
			b.WriteString(" \\\n    && chown -R www-data:www-data storage bootstrap/cache")
		} else {
			b.WriteString(" \\\n    && chown -R www-data:www-data /var/www/html")
		}
		if needsEntrypoint(s) {
			b.WriteString(" \\\n    && chmod +x " + s.Names().Entrypoint)
		}
		b.WriteString("\n\n# Apache arranca como root para abrir el puerto 80 y luego atiende como www-data.\n")
		expose()
		health()
		entry()
		b.WriteString("CMD [\"apache2-foreground\"]\n")

	case StackGo:
		b.WriteString("# Dos fases: se compila con Go y el programa resultante va a una imagen mínima\n# (distroless: sin shell ni paquetes, solo tu programa).\n\n")
		b.WriteString("# --- Fase 1: compilar ---\nFROM golang:" + s.Version + " AS compilar\nWORKDIR /src\n")
		b.WriteString("# Primero go.mod y go.sum: las dependencias se descargan una vez y se reutilizan.\nCOPY go.mod go.sum* ./\nRUN go mod download\nCOPY . .\n")
		b.WriteString("# CGO_ENABLED=0: un binario que no depende de librerías del sistema.\nRUN CGO_ENABLED=0 go build -trimpath -ldflags=\"-s -w\" -o /app " + s.GoMain + "\n\n")
		b.WriteString("# --- Fase 2: ejecutar ---\nFROM gcr.io/distroless/static-debian12")
		if s.NonRoot {
			b.WriteString(":nonroot")
		}
		b.WriteString("\nCOPY --from=compilar /app /app\n")
		expose()
		b.WriteString("CMD [\"/app\"]\n")

	case StackStatic:
		b.WriteString("# Web estática servida con nginx.\nFROM nginx:1.27-alpine\n\n# Tus ficheros a la carpeta que sirve nginx.\nCOPY . /usr/share/nginx/html/\n\n")
		expose()
		health()
	}
	return b.String()
}

func dockerignore(s Spec) string {
	common := []string{".git", ".gitignore", ".env", ".env.*", "!.env.example", "docker-compose*.yml", "compose.yaml", "Dockerfile*", ".dockerignore", "*.log", ".DS_Store", ".idea", ".vscode"}
	extra := map[string][]string{
		StackPython: {".venv", "venv", "env", "__pycache__", "**/__pycache__", "*.pyc", ".pytest_cache", ".mypy_cache", "db.sqlite3", "media", "staticfiles", "htmlcov", ".coverage"},
		StackNode:   {"node_modules", "dist", "build", ".next", "coverage", ".turbo"},
		StackJava:   {"target", "build", ".gradle", "*.iml", "out"},
		StackPHP:    {"vendor", "node_modules", "storage/logs/*", "storage/framework/cache/*"},
		StackGo:     {"bin", "*.exe", "*.test"},
		StackStatic: {"node_modules"},
	}[s.Stack]
	var b strings.Builder
	b.WriteString(header(".dockerignore"))
	b.WriteString("# Lo que NO se copia a la imagen: secretos (.env), dependencias que se instalan\n# dentro, datos locales y basura. Imagen más pequeña y sin contraseñas dentro.\n")
	for _, l := range append(common, extra...) {
		b.WriteString(l + "\n")
	}
	return b.String()
}

func entrypoint(s Spec) string {
	var steps []string
	waitDB := usesDB(s) && (s.Stack == StackPython || s.Stack == StackPHP)
	if s.Stack == StackPython && s.Framework == "django" {
		if s.DjangoMigrate {
			steps = append(steps, "echo \"[arranque] Aplicando migraciones…\"\npython manage.py migrate --noinput")
		}
		if s.DjangoCollectstatic {
			steps = append(steps, "echo \"[arranque] Recogiendo los ficheros estáticos…\"\npython manage.py collectstatic --noinput")
		}
		if s.DjangoSuperuser {
			steps = append(steps, "# Crea el administrador si pones DJANGO_SUPERUSER_USERNAME, _EMAIL y _PASSWORD en .env.\nif [ -n \"${DJANGO_SUPERUSER_USERNAME:-}\" ]; then\n  echo \"[arranque] Asegurando el administrador…\"\n  python manage.py createsuperuser --noinput 2>/dev/null || true\nfi")
		}
	}
	if s.Stack == StackPHP && s.Framework == "laravel" && s.LaravelMigrate {
		steps = append(steps, "echo \"[arranque] Aplicando migraciones…\"\nphp artisan migrate --force\nphp artisan config:cache\nphp artisan route:cache")
	}
	if len(steps) == 0 && !waitDB {
		return ""
	}
	var b strings.Builder
	b.WriteString("#!/usr/bin/env bash\n" + header("docker-entrypoint.sh"))
	b.WriteString("# Se ejecuta cada vez que arranca el contenedor, antes de la app.\nset -euo pipefail\n\n")
	if waitDB {
		port := "5432"
		if !s.Postgres {
			port = "3306"
		}
		b.WriteString("# Espera a que la base de datos acepte conexiones (como mucho 60 s).\nDB_HOST=\"${DB_HOST:-db}\"\nDB_PORT=\"${DB_PORT:-" + port + "}\"\n")
		b.WriteString("echo \"[arranque] Esperando a la base de datos ${DB_HOST}:${DB_PORT}…\"\nfor _ in $(seq 1 60); do\n  nc -z \"$DB_HOST\" \"$DB_PORT\" 2>/dev/null && break\n  sleep 1\ndone\n\n")
		if s.Stack == StackPHP {
			b.Reset()
			b.WriteString("#!/usr/bin/env bash\n" + header("docker-entrypoint.sh"))
			b.WriteString("# Se ejecuta cada vez que arranca el contenedor, antes de la app.\nset -euo pipefail\n\n")
			b.WriteString("# Espera a la base de datos (como mucho 60 s) probando a conectar con PHP.\nfor _ in $(seq 1 60); do\n  php -r '$s=@fsockopen(getenv(\"DB_HOST\")?:\"db\", (int)(getenv(\"DB_PORT\")?:" + port + ")); exit($s?0:1);' && break\n  sleep 1\ndone\n\n")
		}
	}
	for _, st := range steps {
		b.WriteString(st + "\n\n")
	}
	b.WriteString("echo \"[arranque] Arrancando: $*\"\n# exec: la app sustituye a este script y recibe las señales de parada de Docker.\nexec \"$@\"\n")
	return b.String()
}

func compose(s Spec) string {
	var b strings.Builder
	b.WriteString(header("docker-compose.yml"))
	f := ""
	if s.SideBySide {
		f = " -f " + s.Names().Compose
	}
	b.WriteString("# Arranca la app (y lo que necesita) con:   docker compose" + f + " up -d --build\n# Párala con:                              docker compose" + f + " down\n# Coolify también sabe desplegar un proyecto a partir de este fichero.\n\n")
	b.WriteString("services:\n  " + s.Name + ":\n    # Se construye con el Dockerfile de esta carpeta.\n")
	if s.SideBySide {
		b.WriteString("    build:\n      context: .\n      dockerfile: " + s.Names().Dockerfile + "\n")
	} else {
		b.WriteString("    build: .\n")
	}
	b.WriteString("    image: " + s.Name + ":latest\n    restart: unless-stopped\n")
	if s.Proxy {
		b.WriteString(fmt.Sprintf("    # No se publica: le llega todo a través de nginx (servicio «web»), por el puerto %d de dentro.\n    expose:\n      - \"%d\"\n", s.Port, s.Port))
	} else {
		// Solo en 127.0.0.1: en un servidor, Docker se salta el cortafuegos; para llegar desde fuera,
		// Caddy/nginx (dominio) o el túnel SSH de Draupnode.
		b.WriteString(fmt.Sprintf("    # «puerto del equipo:puerto de la app», solo en este equipo/servidor (127.0.0.1). Abre http://localhost:%d\n    # (para publicarlo a internet: un dominio con Caddy/nginx, o quita «127.0.0.1:»). APP_HOST_PORT en .env lo cambia.\n    ports:\n      - \"127.0.0.1:${APP_HOST_PORT:-%d}:%d\"\n", s.HostPort, s.HostPort, s.Port))
	}
	if s.Stack != StackStatic && !(s.Stack == StackNode && s.Framework == "spa") {
		b.WriteString("    # Variables de entorno (contraseñas, claves…) desde .env, que NO va en la imagen.\n")
		if len(s.EnvKeys) > 0 {
			b.WriteString("    # Tu app espera: " + strings.Join(s.EnvKeys, ", ") + ".\n")
		}
		b.WriteString("    env_file:\n      - path: .env\n        required: false\n")
	}
	env := []string{}
	// Node y Go suelen escuchar en el puerto que diga PORT (process.env.PORT):
	// sin ella, muchas apps arrancan «en el puerto undefined».
	if (s.Stack == StackNode && s.Framework != "spa") || s.Stack == StackGo {
		env = append(env, fmt.Sprintf("PORT: \"%d\"", s.Port))
	}
	dbName := strings.ReplaceAll(s.Name, "-", "_")
	if usesDB(s) {
		host, port := "db", "5432"
		if s.DBMode == "shared" && s.Postgres {
			host = s.SharedHost
		}
		if !s.Postgres {
			port = "3306"
		}
		env = append(env, "DB_HOST: "+host, "DB_PORT: \""+port+"\"", "DB_NAME: ${DB_NAME:-"+dbName+"}", "DB_USER: ${DB_USER:-"+dbName+"}",
			"DB_PASSWORD: ${DB_PASSWORD:?Falta DB_PASSWORD en .env}")
		scheme := "postgresql"
		if !s.Postgres {
			scheme = "mysql"
		}
		env = append(env, "DATABASE_URL: "+scheme+"://${DB_USER:-"+dbName+"}:${DB_PASSWORD}@"+host+":"+port+"/${DB_NAME:-"+dbName+"}")
	}
	if s.Redis {
		env = append(env, "REDIS_URL: redis://redis:6379/0")
	}
	if len(env) > 0 {
		b.WriteString("    # El puerto en el que escucha y cómo llega a sus servicios. Si tu app usa otros\n    # nombres de variable, cámbialos aquí (PORT, DATABASE_URL o DB_HOST/DB_NAME…).\n    environment:\n")
		for _, e := range env {
			b.WriteString("      " + e + "\n")
		}
	}
	deps := []string{}
	if usesDB(s) && !(s.DBMode == "shared" && s.Postgres) {
		deps = append(deps, "db")
	}
	if s.Redis {
		deps = append(deps, "redis")
	}
	if len(deps) > 0 {
		b.WriteString("    # Arranca cuando sus servicios ya responden.\n    depends_on:\n")
		for _, d := range deps {
			b.WriteString("      " + d + ":\n        condition: service_healthy\n")
		}
	}
	vols := []string{}
	for _, v := range s.Volumes {
		vn := strings.Trim(strings.ReplaceAll(strings.TrimPrefix(v, "/app/"), "/", "_"), "_")
		vols = append(vols, vn)
		if len(vols) == 1 {
			b.WriteString("    # Datos que deben sobrevivir a reconstruir la imagen (ficheros subidos…).\n    volumes:\n")
		}
		b.WriteString("      - " + vn + ":" + v + "\n")
	}
	shared := s.DBMode == "shared" && s.Postgres
	if shared {
		b.WriteString("    networks: [default, " + s.SharedNetwork + "]\n")
	}

	if usesDB(s) && !shared {
		b.WriteString("\n  db:\n")
		if s.Postgres {
			b.WriteString("    image: postgres:17-alpine\n    restart: unless-stopped\n    environment:\n")
			b.WriteString("      POSTGRES_DB: ${DB_NAME:-" + dbName + "}\n      POSTGRES_USER: ${DB_USER:-" + dbName + "}\n      POSTGRES_PASSWORD: ${DB_PASSWORD:?Falta DB_PASSWORD en .env}\n")
			b.WriteString("    # Los datos de la base, en un volumen: no se pierden al recrear el contenedor.\n    volumes:\n      - db_data:/var/lib/postgresql/data\n")
			b.WriteString("    healthcheck:\n      test: [\"CMD-SHELL\", \"pg_isready -U $${POSTGRES_USER}\"]\n      interval: 5s\n      timeout: 5s\n      retries: 12\n")
		} else {
			b.WriteString("    image: mariadb:11\n    restart: unless-stopped\n    environment:\n")
			b.WriteString("      MARIADB_DATABASE: ${DB_NAME:-" + dbName + "}\n      MARIADB_USER: ${DB_USER:-" + dbName + "}\n      MARIADB_PASSWORD: ${DB_PASSWORD:?Falta DB_PASSWORD en .env}\n      MARIADB_RANDOM_ROOT_PASSWORD: \"1\"\n")
			b.WriteString("    # Los datos de la base, en un volumen: no se pierden al recrear el contenedor.\n    volumes:\n      - db_data:/var/lib/mysql\n")
			b.WriteString("    healthcheck:\n      test: [\"CMD\", \"healthcheck.sh\", \"--connect\", \"--innodb_initialized\"]\n      interval: 5s\n      timeout: 5s\n      retries: 12\n")
		}
		vols = append(vols, "db_data")
	}
	if s.Proxy {
		site := s.ProxyDomain
		if site == "" {
			site = "localhost"
		}
		b.WriteString("\n  # nginx delante de la app: recibe en el puerto " + strconv.Itoa(s.ProxyPort) + " y reenvía por dentro a «" + s.Name + "».\n")
		b.WriteString("  # Abre http://" + site + portSuffix(s.ProxyPort) + "  (el dominio tiene que apuntar a este equipo/servidor).\n")
		b.WriteString("  # Para HTTPS, pon delante Caddy o nginx de Draupnode, o despliégalo con Coolify.\n")
		b.WriteString("  web:\n    image: nginx:1.27-alpine\n    restart: unless-stopped\n")
		b.WriteString(fmt.Sprintf("    ports:\n      - \"%d:80\"\n", s.ProxyPort))
		b.WriteString("    volumes:\n      - ./" + s.Names().Nginx + ":/etc/nginx/conf.d/default.conf:ro\n")
		b.WriteString("    depends_on:\n      - " + s.Name + "\n")
		if shared {
			b.WriteString("    networks: [default]\n")
		}
	}
	if s.Redis {
		// Valkey (BSD-3): la continuación libre de Redis, compatible (Redis dejó de ser libre en la 7.4).
		// El servicio se sigue llamando «redis» para que la app no note el cambio.
		b.WriteString("\n  redis:\n    image: valkey/valkey:9-alpine\n    restart: unless-stopped\n    healthcheck:\n      test: [\"CMD\", \"valkey-cli\", \"ping\"]\n      interval: 5s\n      timeout: 3s\n      retries: 12\n")
	}
	if len(vols) > 0 {
		b.WriteString("\nvolumes:\n")
		for _, v := range vols {
			b.WriteString("  " + v + ":\n")
		}
	}
	if shared {
		b.WriteString("\n# La red del PostgreSQL compartido que instala Draupnode (módulo PostgreSQL).\nnetworks:\n  " + s.SharedNetwork + ":\n    external: true\n")
	}
	return b.String()
}

func portSuffix(p int) string {
	if p == 80 {
		return ""
	}
	return ":" + strconv.Itoa(p)
}

// nginxConf: el nginx que va delante de la app en el compose.
func nginxConf(s Spec) string {
	name := s.ProxyDomain
	if name == "" {
		name = "_"
	}
	var b strings.Builder
	b.WriteString(header("nginx.conf"))
	b.WriteString("# nginx delante de la app: recibe las visitas y las pasa por dentro a «" + s.Name + "».\n\n")
	b.WriteString("# WebSockets: «upgrade» solo si el navegador lo pide.\nmap $http_upgrade $connection_upgrade {\n    default upgrade;\n    ''      close;\n}\n\n")
	b.WriteString("server {\n    listen 80;\n    server_name " + name + ";\n\n")
	b.WriteString(fmt.Sprintf("    # Lo máximo que se puede subir de una vez.\n    client_max_body_size %dm;\n    server_tokens off;\n\n", s.MaxBodyMB))
	b.WriteString("    location / {\n")
	b.WriteString(fmt.Sprintf("        proxy_pass http://%s:%d;\n", s.Name, s.Port))
	b.WriteString("        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n")
	b.WriteString("        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n")
	b.WriteString("        # WebSockets\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection $connection_upgrade;\n        proxy_read_timeout 300s;\n    }\n}\n")
	if s.ProxyDomain != "" {
		b.WriteString("\n# Cualquier otro nombre (o la IP a pelo) no recibe nada.\nserver {\n    listen 80 default_server;\n    server_name _;\n    return 444;\n}\n")
	}
	return b.String()
}

// PublishedPort es el puerto por el que se entra a la app desde fuera del
// compose: el de nginx si va delante, o el publicado de la app.
func PublishedPort(s Spec) int {
	if s.Proxy {
		if s.ProxyPort == 0 {
			return 80
		}
		return s.ProxyPort
	}
	if s.HostPort != 0 {
		return s.HostPort
	}
	if s.Stack == StackStatic || s.Stack == StackPHP || (s.Stack == StackNode && s.Framework == "spa") || s.Port == 80 {
		return 8080
	}
	return s.Port
}
