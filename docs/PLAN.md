# Plan por fases

## Fase 1 · Base y conexiones SSH ✅ (0.1.0–0.2.0)

- Proyecto Go + Wails + Svelte; estructura, Makefile, tests.
- Servidores: alta/edición/borrado, almacenados en local (0600).
- SSH con fichero de clave (con o sin frase de paso) o ssh-agent.
- Frase de paso opcional en el llavero del sistema; si no, se pide en cada conexión.
- Huellas: primera conexión → se muestra y se confirma; huella cambiada → se bloquea.
- «Probar conexión»: sistema, kernel, arquitectura, CPU, RAM, disco, sudo, python3/docker/git/curl/ansible.
- Temas: 12 paletas de las láminas + Draupnir Gold (por defecto), Muspelheim, Niflheim; editor con vista previa en vivo, avisos de contraste, importar/exportar JSON.

## Fase 2 · Módulos, proyectos y ejecución ✅ (0.3.0, sin probar aún en servidor real)

- **Formato de módulo** (`module.yaml` + rol de Ansible): id, nombre, versión, variables (texto, número, booleano, lista, dominio, puerto, `secret: generate`), dependencias, requisitos (SO, RAM, disco, puertos), comprobaciones previas y finales.
- **Catálogo** con los módulos incluidos y los del usuario (carpeta local).
- **Proyecto** = servidor + módulos + valores. Formularios generados desde las variables; orden por dependencias.
- **Secretos**: ~~generados en local con Ansible Vault~~ → se generan en el propio servidor (`/etc/draupnode/secretos/<proyecto>/`, solo root) y nunca viajan.
- **Ejecución**: subir el bundle por SSH (stdin, sin SFTP), instalar Ansible en un venv del servidor, `ansible-playbook -c local`, progreso tarea a tarea en directo; modo previsualizar (`--check --diff`).
- **Exportar**: un único `instalar.sh` autocontenido (bundle en base64 + arranque de Ansible) que hace lo mismo sin la app.
- Primeros módulos, a partir de `1 PUBLICACION_COOLIFY`: base del servidor (paquetes, usuario, ufw/iptables de Oracle, swap), Docker (con el arreglo de containerd-snapshotter), Coolify, app desde GitHub/GitLab vía API de Coolify, PostgreSQL compartido, monitorización (Grafana + Prometheus + Loki + exporters).

## Fase 3 · Editor y terminal

- Editor Monaco para módulos (YAML, Jinja2, sh, compose) con validación.
- Terminal SSH integrada (xterm.js) con pestañas por servidor.
- Historial de ejecuciones con sus logs.

## Fase 4 · Distribución

- GitHub Actions: instaladores para Windows (NSIS), macOS (.app/.dmg) y Linux (AppImage/.deb).
- Más módulos: k3s, OpenTofu/Terraform, copias de seguridad, Let's Encrypt fuera de Coolify.
- Repositorios de módulos de la comunidad.

### Pendiente de la fase 2 (siguiente iteración)

- Módulo «App desde GitHub/GitLab» vía API de Coolify (necesita el token que se crea en su panel).
- Módulos de monitorización (Grafana + Prometheus + Loki) y copias de seguridad (restic + systemd), como en los scripts actuales.
- Importar contraseñas de una instalación existente (`/srv/apps/secretos.env`).
