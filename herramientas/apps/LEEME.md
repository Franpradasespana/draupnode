# Módulos de apps

Los módulos que van en Docker con el mismo patrón (carpeta en /srv/draupnode/apps/<id>,
docker-compose, puerto en 127.0.0.1, dominio opcional con Caddy/nginx, contraseñas
generadas en el servidor) se generan con este script a partir de sus fichas:

- `apps.py`: Vaultwarden, Navidrome, Jellyfin, Syncthing, Forgejo, Paperless-ngx, Immich.
- `nuevas.py` (0.63): Portainer, registro de imágenes, Dozzle, Valkey, Adminer, Uptime Kuma,
  ntfy, Healthchecks, Keycloak, OpenBao, Nextcloud, Wiki.js, Vikunja, Umami.
- `pruebas/<id>.yaml`: la guía «Cómo probarlo» de cada una (se pega al final de su module.yaml).

    python3 herramientas/apps/gen.py internal/modules/builtin vaultwarden navidrome …

Para cambiar algo común a todos (por ejemplo, los reintentos al descargar
imágenes), cambia `gen.py` y vuelve a generarlos; para una app, su ficha.
No edites a mano sus ficheros en `internal/modules/builtin/<app>`: se pisan
al volver a generar.

Opciones de una ficha además de las básicas: `category`, `depends`, `no_proxy` (sin dominio,
p. ej. una base de datos), `no_public`, `probe: 'tcp'` (comprobar que escucha en vez de pedir
una página), `db_dir` (carpeta de PostgreSQL a la que no se cambian permisos), `pre_tasks`,
`mid_tasks` (después de generar contraseñas y antes del compose), `post_tasks` y
`uninstall_extra`.

Solo software libre (ver la licencia en cada ficha). Por eso, por ejemplo, Valkey en lugar
de Redis (no libre desde la 7.4), OpenBao en lugar de Vault y OpenTofu en lugar de Terraform
(BUSL desde 2023).
