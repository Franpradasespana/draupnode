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

### Hecho el 2026-11-20 (0.7.0)

- Orden de las ventanas calculado en la interfaz, plegado recordado por proyecto y módulo, opciones de Coolify (administrador al instalar + actualizaciones automáticas) y puertos de Coolify abiertos por el Cortafuegos (probado). Detalle en HISTORIAL.md.
- Estudio de módulos nuevos: `docs/ESTUDIO_MODULOS.md` (orden propuesto y decisiones pendientes del usuario).

### Hecho el 2026-11-20 (0.8.0)

- Formato de módulos ampliado (secret, conflicts, after, checks, firewall_ports_from, secrets), contraseñas por proyecto en la bóveda con visor protegido y módulo «SSH seguro + fail2ban». Detalle en HISTORIAL.md.

### Siguiente (según docs/ESTUDIO_MODULOS.md)

- ~~Copias con restic + «Traer copias al equipo»~~ hecho en la 0.10.0. Pendiente: «Restaurar» desde la app (hoy, con el LEEME y restic).
- Monitorización en dos módulos (métricas / registros), Grafana por túnel SSH.
- Adoptar lo que ya hay en el servidor real (`pg-compartido`, `monitoring-*`, `apps-backup`) con sus mismos nombres.
- Botón «Traer contraseñas del servidor» sin tener que Aplicar (hoy se traen al Aplicar).

### Módulos futuros (lista del usuario, 2026-11-20) — todos de código abierto

| Programa | Licencia | Notas para el módulo |
|---|---|---|
| WireGuard | GPL-2 | VPN; puerto UDP desde variable (`firewall_ports_from` necesitaría UDP). |
| Cockpit | LGPL-2.1 | Panel web del sistema en 9090: choca con nada nuestro (Prometheus va en 19090), pero debe quedarse en 127.0.0.1 + túnel como Grafana. |
| ufw | GPL-3 | `conflicts: [firewall]` (dos cortafuegos sobre iptables). |
| Samba | GPL-3 | Carpetas compartidas; puertos 139/445 solo en red local/VPN. |
| Immich | AGPL-3 | Fotos; compose oficial con su PostgreSQL (vectores) y Redis. Pesado (ML). |
| BorgBackup | BSD-3 | Solapa con restic: ¿alternativa o fuera? |
| Syncthing | MPL-2 | Sincronización; interfaz 8384 por túnel. |
| Jellyfin | GPL-2 | Vídeo; 8096. Transcodificación pesada. |
| Navidrome | GPL-3 | Música; 4533. |
| Vaultwarden | AGPL-3 | Contraseñas; necesita HTTPS (proxy/Coolify). |
| Forgejo | GPL-3 (MIT antes de v9) | Git; SSH propio en otro puerto. |
| Paperless-ngx | GPL-3 | Documentos (OCR); con su Redis y PostgreSQL. |
| nginx | BSD-2 | `conflicts: [coolify]` (80/443). Mejor Caddy como se decidió, o los dos. |
| Pi-hole | EUPL-1.2 | DNS (53): `conflicts: [adguard]`; cuidado con systemd-resolved. |
| AdGuard Home | GPL-3 | Igual que Pi-hole. |
| MariaDB | GPL-2 | Como el PostgreSQL compartido (una base y usuario por app). |
| Prometheus | Apache-2 | Hecho (módulo Monitorización, 0.12.0). |

Muchos son «apps» que encajan mejor desplegadas por Coolify o con un módulo genérico «App con Docker Compose» (estudio, sección 7) que con un módulo cada una.
