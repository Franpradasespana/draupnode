package main

import (
	"regexp"
	"strings"

	"draupnode/internal/modules"
	"draupnode/internal/store"
)

// Perfiles por tipo de app: los valores de servidor que todo el mundo pone
// (Django, Laravel, Rails, Node, Flask…) y el formato de sus claves. Se usan
// al publicar desde Docker Creator y al «Leer el repositorio».

// profileValue: el valor de servidor para una variable típica de ese tipo de
// app («» = ninguno), y si es una clave que se genera (con su formato).
func profileValue(framework, k, example, domain string) (value string, generate bool, format string) {
	host := "localhost,127.0.0.1"
	url := "http://localhost"
	if domain != "" {
		host, url = domain+",localhost,127.0.0.1", "https://"+domain
	}
	switch framework {
	case "django":
		switch k {
		case "DEBUG", "DJANGO_DEBUG":
			return "false", false, ""
		case "ALLOWED_HOSTS", "DJANGO_ALLOWED_HOSTS":
			if example == "" || strings.Contains(example, "*") || strings.Contains(example, "localhost") {
				return host, false, ""
			}
		case "CSRF_TRUSTED_ORIGINS", "DJANGO_CSRF_TRUSTED_ORIGINS":
			if domain != "" {
				return url, false, ""
			}
		case "SECRET_KEY", "DJANGO_SECRET_KEY":
			return "", true, ""
		}
	case "laravel":
		switch k {
		case "APP_ENV":
			return "production", false, ""
		case "APP_DEBUG":
			return "false", false, ""
		case "APP_KEY":
			return "", true, "laravel"
		case "APP_URL":
			return url, false, ""
		case "LOG_CHANNEL":
			return "stderr", false, ""
		}
	case "rails":
		switch k {
		case "RAILS_ENV", "RACK_ENV":
			return "production", false, ""
		case "SECRET_KEY_BASE":
			return "", true, "hex-64"
		case "RAILS_LOG_TO_STDOUT", "RAILS_SERVE_STATIC_FILES":
			return "true", false, ""
		}
	case "flask", "fastapi":
		switch k {
		case "FLASK_DEBUG", "DEBUG":
			return "0", false, ""
		case "FLASK_ENV", "ENV", "ENVIRONMENT":
			return "production", false, ""
		case "SECRET_KEY":
			return "", true, ""
		}
	}
	// Para cualquier app.
	switch k {
	case "NODE_ENV":
		return "production", false, ""
	case "DEBUG", "APP_DEBUG":
		return "false", false, ""
	}
	return "", false, ""
}

// frameworkFromFiles: el tipo de app por los ficheros que se ven en el repositorio.
func frameworkFromFiles(known map[string]bool) string {
	switch {
	case known["manage.py"]:
		return "django"
	case known["artisan"]:
		return "laravel"
	case known["bin/rails"]:
		return "rails"
	case known["package.json"]:
		return "node"
	}
	return ""
}

// ---------------------------------------------------------------- errores traducidos

type errHint struct {
	re   *regexp.Regexp
	text func(m []string) string
}

var errHints = []errHint{
	{regexp.MustCompile(`database "([^"]+)" does not exist`), func(m []string) string {
		return "La base de datos «" + m[1] + "» no existe. Revisa la variable con su nombre (DB_NAME, POSTGRES_DB…): si la base la crea el propio compose, suele llamarse como el usuario; si sobra la variable, quítala."
	}},
	{regexp.MustCompile(`password authentication failed for user "([^"]+)"`), func(m []string) string {
		return "La contraseña de la base de datos no coincide para «" + m[1] + "». Si la base ya existía (su volumen) con otra contraseña, la nueva no se aplica: usa la de entonces o borra los datos al desinstalar."
	}},
	{regexp.MustCompile(`(?i)(could not translate host name|Name or service not known|getaddrinfo (ENOTFOUND|EAI_AGAIN)|Temporary failure in name resolution)\D*"?([A-Za-z0-9_.-]*)`), func(m []string) string {
		return "La app no encuentra el servidor de la base de datos (u otro servicio) por su nombre. Revisa DB_HOST (o similar): tiene que ser el nombre del servicio en el compose, o el del PostgreSQL compartido si lo usas."
	}},
	{regexp.MustCompile(`(?i)connection refused.*(5432|3306|6379)|(5432|3306|6379).*connection refused`), func(m []string) string {
		return "La base de datos (o Redis) no aceptaba conexiones: puede que aún estuviera arrancando. Vuelve a aplicar; si se repite, mira su registro en Contenedores."
	}},
	{regexp.MustCompile(`(?i)Fernet key must be 32 url-safe base64-encoded bytes|FIELD_ENCRYPTION_KEY no es v|Invalid (Fernet )?key`), func(m []string) string {
		return "Una clave no tiene el formato que espera la app (Fernet). En «Generar en el servidor» ponla como NOMBRE:fernet."
	}},
	{regexp.MustCompile(`(?i)(No application encryption key has been specified|The only supported ciphers are)`), func(m []string) string {
		return "Laravel necesita APP_KEY con su formato: en «Generar en el servidor», APP_KEY:laravel."
	}},
	{regexp.MustCompile(`ModuleNotFoundError: No module named '([^']+)'`), func(m []string) string {
		return "Falta la librería de Python «" + m[1] + "»: añádela a requirements.txt (o pyproject.toml) y vuelve a aplicar."
	}},
	{regexp.MustCompile(`Cannot find module '([^']+)'`), func(m []string) string {
		return "Falta el módulo de Node «" + m[1] + "»: comprueba que está en package.json (dependencies) y que el Dockerfile instala las dependencias."
	}},
	{regexp.MustCompile(`(?i)could not find driver`), func(m []string) string {
		return "A PHP le falta la extensión de la base de datos (pdo_pgsql o pdo_mysql) en la imagen."
	}},
	{regexp.MustCompile(`(?i)ImproperlyConfigured: (.{0,160})`), func(m []string) string {
		return "Falta o está mal una opción de Django: «" + strings.TrimSpace(m[1]) + "». Suele ser una variable sin poner o con otro nombre."
	}},
	{regexp.MustCompile(`(?i)Permission denied`), func(m []string) string {
		return "Permisos: la app no puede escribir en una carpeta. Si su imagen no corre como root, pon su UID:GID en «Dueño de la carpeta de la app» (Draupnode lo intenta solo)."
	}},
	{regexp.MustCompile(`(?i)(port is already allocated|address already in use)`), func(m []string) string {
		return "El puerto ya lo usa otra cosa en el servidor. Cambia el puerto de la app (APP_HOST_PORT o la variable que lo controle) y «Puerto de la app»."
	}},
	{regexp.MustCompile(`(?i)no space left on device`), func(m []string) string {
		return "El disco del servidor está lleno. Ficha → Contenedores → «Limpiar Docker…» libera imágenes y caché que no se usan."
	}},
	{regexp.MustCompile(`(?i)exec format error`), func(m []string) string {
		return "La imagen es de otra arquitectura (por ejemplo, ARM en un servidor x86): constrúyela en el servidor o para su arquitectura."
	}},
	{regexp.MustCompile(`(?i)(npm ERR! Missing script: "?([a-z:-]+)|Missing script: "?([a-z:-]+))`), func(m []string) string {
		return "El package.json no tiene la orden que se intenta ejecutar. Revisa cómo arranca la app (Docker Creator, paso «Arranque»)."
	}},
	{regexp.MustCompile(`(?i)SQLSTATE\[(08006|08001|HY000)\]`), func(m []string) string {
		return "Laravel no puede conectar con la base de datos: revisa DB_CONNECTION, DB_HOST, DB_DATABASE, DB_USERNAME y DB_PASSWORD."
	}},
}

// explainError: «Qué significa» para los errores más comunes de una app ("" si no se reconoce).
func explainError(msg string) string {
	var out []string
	seen := map[string]bool{}
	for _, h := range errHints {
		if m := h.re.FindStringSubmatch(msg); m != nil {
			t := h.text(m)
			if !seen[t] {
				seen[t] = true
				out = append(out, t)
			}
		}
		if len(out) == 2 {
			break
		}
	}
	return strings.Join(out, " ")
}

// syncSharedDB: las apps «Tu app» con «postgres-compartido» necesitan el
// módulo PostgreSQL compartido (se añade si falta) con una base con el nombre
// de la app; y saben a qué contenedor y red conectarse.
func (a *App) syncSharedDB(mods []store.ProjectModule) []store.ProjectModule {
	var dbs []string
	for _, m := range mods {
		if base, _ := modules.SplitID(m.ID); base == "git-app" && m.Values["git_app_db"] == "postgres-compartido" {
			if n, _ := m.Values["git_app_name"].(string); n != "" {
				dbs = append(dbs, strings.ReplaceAll(n, "-", "_"))
			}
		}
	}
	if len(dbs) == 0 {
		return mods
	}
	pi := -1
	for i, m := range mods {
		if m.ID == "postgres" {
			pi = i
		}
	}
	if pi < 0 {
		pm, ok := a.cat().Get("postgres")
		if !ok {
			return mods
		}
		vals, _ := pm.Values(map[string]any{})
		mods = append(mods, store.ProjectModule{ID: "postgres", Values: vals})
		pi = len(mods) - 1
	}
	pv := mods[pi].Values
	if pv == nil {
		pv = map[string]any{}
		mods[pi].Values = pv
	}
	have := toStrings(pv["postgres_databases"])
	for _, d := range dbs {
		if !contains(have, d) {
			have = append(have, d)
		}
	}
	pv["postgres_databases"] = have
	host, _ := pv["postgres_container"].(string)
	netw, _ := pv["postgres_network"].(string)
	for i, m := range mods {
		if base, _ := modules.SplitID(m.ID); base == "git-app" && m.Values["git_app_db"] == "postgres-compartido" {
			if host != "" {
				mods[i].Values["git_app_db_host"] = host
			}
			if netw != "" {
				mods[i].Values["git_app_db_network"] = netw
			}
		}
	}
	return mods
}
