package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"

	"draupnode/internal/i18n"
	"draupnode/internal/store"
)

// Plantillas de serie: las que trae Draupnode hechas, con los módulos más
// habituales (estudio en docs/PLANTILLAS_DE_SERIE.md). Al abrir la app se
// crean como plantillas normales del usuario, con la marca Builtin:
//   - si el usuario borra una, no vuelve sola (BuiltinSeen); «Recuperar las
//     de serie» la trae otra vez;
//   - si no la ha tocado y una versión nueva de Draupnode la mejora (o cambia
//     el idioma), se actualiza; si la ha cambiado, se respeta lo suyo.

type builtinTemplate struct {
	ID      string
	Name    string
	Notes   string
	Modules []string
	Values  map[string]map[string]any
}

// La base que llevan todas: así cada una vale sola.
var builtinBase = []string{"base", "chrony", "firewall", "ssh", "backups", "alerts"}

func builtinTemplates() []builtinTemplate {
	with := func(extra ...string) []string { return append(append([]string{}, builtinBase...), extra...) }
	return []builtinTemplate{
		{ID: "servidor-seguro", Name: i18n.T("Servidor seguro"), Modules: with(),
			Notes: i18n.T("El punto de partida para cualquier servidor: sistema al día, hora exacta, cortafuegos, SSH seguro con fail2ban, copias diarias cifradas y alertas al móvil. Todas las demás plantillas ya lo llevan. Servidor mínimo: 1 GB de RAM.")},
		{ID: "webs-https", Name: i18n.T("Webs con HTTPS"), Modules: with("docker", "caddy", "git-app", "postgres", "monitoring", "uptime-kuma", "umami"),
			Values: map[string]map[string]any{"git-app": {"git_app_db": "postgres-compartido"}},
			Notes:  i18n.T("Para publicar tu web o tu app desde Git con dominio y HTTPS automático (Caddy), con PostgreSQL compartido, gráficas del servidor (Grafana), aviso si la web cae (Uptime Kuma) y estadísticas de visitas (Umami). En el servidor tendrás que poner el repositorio y el dominio. Servidor mínimo: 3 GB de RAM.")},
		{ID: "coolify", Name: i18n.T("Plataforma de apps (Coolify)"), Modules: with("docker", "coolify", "postgres", "monitoring", "uptime-kuma"),
			Values: map[string]map[string]any{"postgres": {"postgres_network": "coolify"}},
			Notes:  i18n.T("Despliega tus apps desde el panel de Coolify (como Heroku o Vercel, pero tuyo), con un PostgreSQL compartido en la red de Coolify, gráficas del servidor y aviso si algo cae. Coolify trae su propio proxy: no se puede sumar a las plantillas que llevan Caddy. Servidor mínimo: 4 GB de RAM.")},
		{ID: "familia", Name: i18n.T("Familia: contraseñas, fotos y archivos"), Modules: with("docker", "caddy", "vaultwarden", "immich", "nextcloud"),
			Notes: i18n.T("Gestor de contraseñas (Vaultwarden), fotos y vídeos del móvil (Immich) y tu nube de archivos (Nextcloud), con HTTPS. Servidor mínimo: 4 GB de RAM (6-8 GB si Immich reconoce caras y objetos).")},
		{ID: "multimedia", Name: i18n.T("Multimedia"), Modules: with("docker", "caddy", "jellyfin", "navidrome", "audiobookshelf"),
			Notes: i18n.T("Películas y series (Jellyfin), música (Navidrome) y audiolibros y pódcasts (Audiobookshelf), con HTTPS. Servidor mínimo: 2 GB de RAM (más si Jellyfin tiene que convertir vídeo).")},
		{ID: "vpn", Name: i18n.T("Acceso privado (VPN sin anuncios)"), Modules: with("wireguard", "adguard"),
			Notes: i18n.T("Entra en tu servidor y en tus apps desde fuera sin abrir nada más (WireGuard), y navega sin anuncios ni rastreadores cuando estés conectado (AdGuard Home). Servidor mínimo: 1 GB de RAM.")},
		{ID: "vigilancia", Name: i18n.T("Vigilancia"), Modules: with("docker", "monitoring", "logs", "uptime-kuma", "ntfy", "dozzle"),
			Notes: i18n.T("Gráficas del servidor y de cada contenedor (Prometheus y Grafana), registros (Loki), aviso si una web cae (Uptime Kuma), tu propio servidor de avisos (ntfy) y los registros de Docker a mano (Dozzle). Servidor mínimo: 2 GB de RAM.")},
		{ID: "vigilancia-ligera", Name: i18n.T("Vigilancia ligera"), Modules: with("docker", "beszel", "uptime-kuma", "ntfy"),
			Notes: i18n.T("Lo esencial para servidores pequeños: uso del servidor y de los contenedores (Beszel), aviso si una web cae (Uptime Kuma) y avisos al móvil (ntfy). Servidor mínimo: 1 GB de RAM.")},
		{ID: "desarrollo", Name: i18n.T("Taller de desarrollo"), Modules: with("docker", "caddy", "forgejo", "registry", "postgres", "valkey", "git-app"),
			Values: map[string]map[string]any{"git-app": {"git_app_db": "postgres-compartido"}},
			Notes:  i18n.T("Tu propio GitHub (Forgejo), registro de imágenes Docker, PostgreSQL y Valkey compartidos, y tu app desplegada desde Git. Para las Actions, añade después «Forgejo Runner» con la dirección y el token de tu Forgejo. Servidor mínimo: 4 GB de RAM.")},
		{ID: "oficina", Name: i18n.T("Oficina y documentos"), Modules: with("docker", "caddy", "paperless", "vikunja", "wikijs", "freshrss", "linkwarden"),
			Notes: i18n.T("Papeles escaneados con búsqueda (Paperless-ngx), tareas y proyectos (Vikunja), wiki (Wiki.js), noticias RSS (FreshRSS) y marcadores (Linkwarden), con HTTPS. Servidor mínimo: 4 GB de RAM.")},
		{ID: "seguridad-reforzada", Name: i18n.T("Seguridad reforzada"), Modules: with("docker", "crowdsec", "lynis", "aide", "auditd", "trivy", "authelia"),
			Notes: i18n.T("Para sumar a cualquier otra en servidores expuestos o con datos delicados: bloqueo de ataques (CrowdSec), revisión de seguridad (Lynis), vigilancia de ficheros del sistema (AIDE), registro de auditoría (auditd), vulnerabilidades de tus contenedores (Trivy) e inicio de sesión con doble factor (Authelia). Añade alrededor de 1 GB de RAM.")},
	}
}

// builtinRecipe: la plantilla tal y como la guardaría Draupnode, con las
// dependencias y los valores por defecto ya puestos.
func (a *App) builtinRecipe(t builtinTemplate) (store.Recipe, error) {
	mods := make([]store.ProjectModule, 0, len(t.Modules))
	for _, id := range t.Modules {
		v := map[string]any{}
		for k, x := range t.Values[id] {
			v[k] = x
		}
		mods = append(mods, store.ProjectModule{ID: id, Values: v})
	}
	r := store.Recipe{Name: t.Name, Notes: t.Notes, Modules: mods, Builtin: t.ID}
	chk, sel := a.resolveModules(store.Project{Name: r.Name, Modules: r.Modules}, true)
	if len(chk.General) > 0 {
		return r, errors.New(strings.Join(chk.General, "; "))
	}
	if len(chk.Errors) > 0 {
		b, _ := json.Marshal(chk.Errors)
		return r, errors.New(string(b))
	}
	r.Modules = make([]store.ProjectModule, 0, len(sel))
	for _, s := range sel {
		r.Modules = append(r.Modules, store.ProjectModule{ID: s.Key(), Values: s.Values})
	}
	r.BuiltinHash = recipeHash(r)
	return r, nil
}

// recipeHash: huella de lo que el usuario puede cambiar en una plantilla.
func recipeHash(r store.Recipe) string {
	b, _ := json.Marshal(struct {
		Name    string
		Notes   string
		Modules []store.ProjectModule
	}{strings.TrimSpace(r.Name), r.Notes, r.Modules})
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:8])
}

// ensureBuiltinTemplates crea las plantillas de serie que falten (salvo las
// que el usuario borró) y actualiza las que no ha tocado.
func (a *App) ensureBuiltinTemplates() {
	seen := map[string]bool{}
	for _, id := range a.store.BuiltinSeen() {
		seen[id] = true
	}
	have := map[string]store.Recipe{}
	for _, r := range a.store.Recipes() {
		if r.Builtin != "" {
			have[r.Builtin] = r
		}
	}
	changed := false
	for _, t := range builtinTemplates() {
		want, err := a.builtinRecipe(t)
		if err != nil {
			continue // el catálogo ya no la admite: se queda como estaba
		}
		if r, ok := have[t.ID]; ok {
			if !seen[t.ID] {
				seen[t.ID], changed = true, true
			}
			if recipeHash(r) != r.BuiltinHash || r.BuiltinHash == want.BuiltinHash {
				continue // la ha cambiado el usuario, o ya está al día
			}
			r.Name, r.Notes, r.Modules, r.BuiltinHash = want.Name, want.Notes, want.Modules, want.BuiltinHash
			_, _ = a.saveRecipeV(r, i18n.Sprintf("Actualizada con Draupnode %s", Version))
			continue
		}
		if seen[t.ID] {
			continue // la borró el usuario
		}
		if _, err := a.saveRecipeV(want, i18n.T("Plantilla de serie")); err == nil {
			seen[t.ID], changed = true, true
		}
	}
	if changed {
		ids := make([]string, 0, len(seen))
		for id := range seen {
			ids = append(ids, id)
		}
		_ = a.store.SetBuiltinSeen(ids)
	}
}

// BuiltinMissing: cuántas plantillas de serie ha borrado el usuario.
func (a *App) BuiltinMissing() int {
	have := map[string]bool{}
	for _, r := range a.store.Recipes() {
		have[r.Builtin] = true
	}
	n := 0
	for _, t := range builtinTemplates() {
		if !have[t.ID] {
			n++
		}
	}
	return n
}

// RestoreBuiltinTemplates vuelve a crear las plantillas de serie borradas
// (las que siguen ahí no se tocan). Devuelve cuántas ha creado.
func (a *App) RestoreBuiltinTemplates() int {
	before := a.BuiltinMissing()
	have := map[string]bool{}
	for _, r := range a.store.Recipes() {
		have[r.Builtin] = true
	}
	var keep []string
	for _, id := range a.store.BuiltinSeen() {
		if have[id] {
			keep = append(keep, id)
		}
	}
	_ = a.store.SetBuiltinSeen(keep)
	a.ensureBuiltinTemplates()
	return before - a.BuiltinMissing()
}
