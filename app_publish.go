package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"draupnode/internal/dockerize"
	"draupnode/internal/modules"
	"draupnode/internal/store"
)

// «Publicar en un servidor» (Docker Creator): crea en el servidor una App
// desde Git que sale de esta carpeta, con todo rellenado: el compose
// generado, el puerto, las variables (las de la app y las que lee su código),
// las contraseñas para generar en su formato y lo que hay que revisar. No
// instala nada: deja el módulo listo para «Aplicar».

// PublishResult: dónde ha quedado y qué contar.
type PublishResult struct {
	ProjectID string   `json:"projectId"`
	ServerID  string   `json:"serverId"`
	ModuleID  string   `json:"moduleId"`
	Notes     []string `json:"notes"`
	Review    []string `json:"review"` // variables que hay que completar o revisar
}

var composeVarRe = regexp.MustCompile(`\$\{([A-Za-z_][A-Za-z0-9_]*)(:?[-?+][^}]*)?\}`)

// composeVars: variables que usa un compose (sin las líneas comentadas) y si
// el propio compose les da valor por defecto o ya las pone en «environment».
func composeVars(text string) (used map[string]bool, withDefault map[string]bool, setInCompose map[string]bool) {
	used, withDefault, setInCompose = map[string]bool{}, map[string]bool{}, map[string]bool{}
	setRe := regexp.MustCompile(`^\s+([A-Z][A-Z0-9_]*):\s*\S`)
	for _, l := range strings.Split(text, "\n") {
		if strings.HasPrefix(strings.TrimSpace(l), "#") {
			continue
		}
		for _, m := range composeVarRe.FindAllStringSubmatch(l, -1) {
			used[m[1]] = true
			if strings.HasPrefix(strings.TrimPrefix(m[2], ":"), "-") {
				withDefault[m[1]] = true
			}
		}
		if m := setRe.FindStringSubmatch(l); m != nil {
			setInCompose[m[1]] = true
		}
	}
	return
}

// PublishDockerApp: dir = carpeta del proyecto (con los ficheros de Docker
// Creator ya guardados), spec = lo de Docker Creator, serverID = dónde.
func (a *App) PublishDockerApp(dir string, spec dockerize.Spec, serverID string) (PublishResult, error) {
	var res PublishResult
	dir, err := projectDir(dir)
	if err != nil {
		return res, err
	}
	composeName := spec.Names().Compose
	cb, err := os.ReadFile(filepath.Join(dir, composeName))
	if err != nil {
		return res, errors.New("primero guarda los ficheros de Docker en la carpeta (falta " + composeName + ")")
	}
	if _, err := a.store.Server(serverID); err != nil {
		return res, err
	}
	p, err := a.ServerModules(serverID)
	if err != nil {
		return res, err
	}
	m, ok := a.cat().Get("git-app")
	if !ok {
		return res, errors.New("falta el módulo App desde Git")
	}

	// Nombre de la app (carpeta y contenedores en el servidor) y de la copia del módulo.
	name := strings.Trim(regexp.MustCompile(`[^a-z0-9-]+`).ReplaceAllString(strings.ToLower(spec.Name), "-"), "-")
	if len(name) < 2 || name[0] < 'a' || name[0] > 'z' {
		name = "app-" + name
	}
	if len(name) > 31 {
		name = name[:31]
	}
	modID := "git-app"
	for _, pm := range p.Modules {
		if pm.ID == "git-app" {
			inst := strings.ReplaceAll(name, "-", "")
			if !modules.InstanceRe.MatchString(inst) {
				inst = "app" + fmt.Sprint(len(p.Modules))
			}
			modID = "git-app@" + inst
		}
	}
	for _, pm := range p.Modules {
		if pm.ID == modID {
			return res, fmt.Errorf("este servidor ya tiene «%s»: ábrela en sus módulos", a.moduleName(modID))
		}
		if v, _ := pm.Values["git_app_name"].(string); v == name {
			return res, fmt.Errorf("este servidor ya tiene una app llamada «%s»", name)
		}
	}

	// Variables: las que usa el compose y las de la app (.env.example y su código).
	used, withDefault, setInCompose := composeVars(string(cb))
	keys := map[string]bool{}
	for k := range used {
		if !withDefault[k] {
			keys[k] = true
		}
	}
	for _, k := range spec.EnvKeys {
		if !setInCompose[k] {
			keys[k] = true
		}
	}
	examples := map[string]string{}
	if b, err := os.ReadFile(filepath.Join(dir, ".env.example")); err == nil {
		kv, _ := parseDotEnv(string(b))
		for _, x := range kv {
			examples[x.Key] = x.Value
		}
	}
	names := make([]string, 0, len(keys))
	for k := range keys {
		names = append(names, k)
	}
	sort.Strings(names)
	formats := dockerize.KeyFormats(dir, names)
	var env, gen []string
	for _, k := range names {
		v := GitEnvVar{Key: k}
		classifyGitVar(&v)
		switch {
		case v.Secret || formats[k] != "":
			if f := formats[k]; f != "" {
				gen = append(gen, k+":"+f)
			} else {
				gen = append(gen, k)
			}
		case v.External:
			res.Review = append(res.Review, k+": clave de otro servicio, solo la tienes tú (si la usas, ponla en «Variables secretas»)")
		default:
			val := examples[k]
			if d := serverDefault(k, val, spec); d != "" {
				val = d
			}
			// Sin valor no se pone: vacía pisaría el valor por defecto de la app.
			if val == "" {
				res.Review = append(res.Review, k+": no puesta (la app usará su valor por defecto; añádela si la necesitas)")
				continue
			}
			env = append(env, k+"="+val)
		}
	}

	vals, _ := m.Values(map[string]any{})
	vals["git_app_source"] = "carpeta"
	vals["git_app_local_dir"] = dir
	vals["git_app_name"] = name
	vals["git_app_compose"] = composeName
	// Puerto en el servidor: el del compose, o uno libre si ya lo usa otra app
	// (el compose de Docker Creator lo lee de APP_HOST_PORT).
	port := dockerize.PublishedPort(spec)
	taken := map[int]bool{}
	for _, pm := range p.Modules {
		if base, _ := modules.SplitID(pm.ID); base == "git-app" {
			taken[toInt(pm.Values["git_app_port"])] = true
		}
	}
	if taken[port] && !spec.Proxy && strings.Contains(string(cb), "APP_HOST_PORT") {
		for port = 8001; taken[port]; port++ {
		}
		env = append(env, fmt.Sprintf("APP_HOST_PORT=%d", port))
		res.Notes = append(res.Notes, fmt.Sprintf("El puerto %d ya lo usa otra app de este servidor: esta irá por el %d.", dockerize.PublishedPort(spec), port))
	}
	vals["git_app_port"] = port
	vals["git_app_env"] = env
	vals["git_app_env_generate"] = gen
	vals["git_app_update"] = true
	p.Modules = append(p.Modules, store.ProjectModule{ID: modID, Values: vals})
	if p, err = a.SaveProject(p); err != nil {
		return res, err
	}
	res.ProjectID, res.ServerID, res.ModuleID = p.ID, serverID, modID
	res.Notes = append(res.Notes, fmt.Sprintf("«%s» añadida a los módulos del servidor: sale de %s; Draupnode la sube al aplicar.", name, dir))
	if len(gen) > 0 {
		res.Notes = append(res.Notes, "Se generarán en el servidor: "+strings.Join(gen, ", ")+".")
	}
	return res, nil
}

// serverDefault: el valor de servidor para variables muy típicas (si el
// ejemplo trae uno de desarrollo).
func serverDefault(k, example string, spec dockerize.Spec) string {
	switch {
	case regexp.MustCompile(`^(DJANGO_)?DEBUG$|^APP_DEBUG$|^FLASK_DEBUG$`).MatchString(k):
		return "false"
	case k == "NODE_ENV":
		return "production"
	case k == "RAILS_ENV" || k == "APP_ENV":
		return "production"
	case k == "DB_ENGINE" && example == "" && spec.Postgres:
		return "postgres"
	case k == "DB_ENGINE" && example == "" && spec.MariaDB:
		return "mysql"
	case (k == "DJANGO_ALLOWED_HOSTS" || k == "ALLOWED_HOSTS") && example == "":
		return "localhost,127.0.0.1"
	}
	return ""
}
