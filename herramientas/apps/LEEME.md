# Módulos de apps

Los módulos de la categoría «7 · Apps» que van en Docker (Vaultwarden, Navidrome,
Jellyfin, Syncthing, Forgejo, Paperless-ngx, Immich) siguen todos el mismo
patrón y se generan con este script a partir de sus fichas en `apps.py`:

    python3 herramientas/apps/gen.py internal/modules/builtin vaultwarden navidrome …

Para cambiar algo común a todos (por ejemplo, los reintentos al descargar
imágenes), cambia `gen.py` y vuelve a generarlos; para una app, su ficha.
No edites a mano sus ficheros en `internal/modules/builtin/<app>`: se pisan
al volver a generar.
