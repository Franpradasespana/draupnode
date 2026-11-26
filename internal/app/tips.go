package app

import (
	"draupnode/internal/bundle"
	"draupnode/internal/i18n"
)

// moduleTips: consejos según qué módulos van juntos en el servidor. No son
// errores ni avisos: algo que conviene saber al combinarlos.
func moduleTips(sel []bundle.Selection) []string {
	has := map[string]bool{}
	for _, s := range sel {
		has[s.Module.ID] = true
	}
	tips := []string{}
	if has["authelia"] && has["keycloak"] {
		tips = append(tips, i18n.T("Authelia y Keycloak llevan cada uno sus propios usuarios: Authelia no puede usar los de Keycloak. Lo práctico: Keycloak para las apps que admiten OIDC o SAML (Nextcloud, Forgejo, Grafana, Immich…) y Authelia solo delante de las que no tienen inicio de sesión propio. Si quieres un único sitio de usuarios, quédate con Keycloak y quita Authelia."))
	}
	if has["beszel"] && has["monitoring"] {
		tips = append(tips, i18n.T("Beszel y «Monitorización» (Prometheus + Grafana) vigilan lo mismo: con uno basta. Beszel gasta mucho menos; Grafana da más detalle y paneles propios."))
	}
	if has["stalwart"] && has["msmtp"] {
		tips = append(tips, i18n.T("El correo del servidor (msmtp) puede salir por tu propio Stalwart: en «Correo saliente», servidor 127.0.0.1, puerto 587 y un buzón de Stalwart como usuario."))
	}
	if has["listmonk"] && !has["stalwart"] && !has["msmtp"] {
		tips = append(tips, i18n.T("Listmonk necesita un servidor SMTP para enviar: ponlo en su web (Settings → SMTP), o añade Stalwart para tener el tuyo."))
	}
	return tips
}
