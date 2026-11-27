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

- ~~Copias con restic + «Traer copias al equipo»~~ hecho en la 0.10.0. Restaurar desde la app: hecho en la 0.13.0.
- Monitorización en dos módulos (métricas / registros), Grafana por túnel SSH.
- Adoptar lo que ya hay en el servidor real (`pg-compartido`, `monitoring-*`, `apps-backup`) con sus mismos nombres.
- Botón «Traer contraseñas del servidor» sin tener que Aplicar (hoy se traen al Aplicar).

### Ideas aprobadas por el usuario (2026-11-21)

- ~~**Módulo «Destino de copias»**~~ hecho en la 0.15.0. Prepara OTRO servidor (VPS, Raspberry, NAS) para recibir las copias restic de los demás. rest-server (BSD-2) en modo `--append-only` + usuario/contraseña por proyecto: el servidor de origen puede añadir copias pero no borrarlas (protege frente a ransomware o intrusión). En el módulo backups, elegir ese destino de una lista en vez de teclear la URL.
- ~~**Aviso / descarga automática de copias al abrir la app**~~ (hecho en la 0.22.0): al arrancar, comprobar la fecha de la última copia traída al equipo por proyecto. Opción por proyecto: «avisar si tiene más de N días» (aviso con botón «Traer ahora») o «traer automáticamente» (incremental, progreso en la barra de estado).

### Hecho el 2026-11-21 (0.14.0 – 0.18.0)

- 0.14.0 pantalla Docker (creador de Dockerfile) · 0.15.0 Destino de copias · 0.16.0 Caddy y nginx · 0.17.0 WireGuard · 0.18.0 Alertas al móvil. Detalle en HISTORIAL.md.

### Pendiente (anotado 2026-11-21)

- ~~Aviso / descarga automática de copias al abrir la app~~ hecho en la 0.22.0.
- Probar en un servidor con dominio real: certificados de Let's Encrypt con Caddy y con nginx/certbot.
- ~~Destino de copias: rotación~~ hecho en la 0.19.0 (la hace el propio destino, con la contraseña que le da Draupnode).
- ~~Avisar del cortafuegos del proveedor de nube~~ hecho en la 0.19.2.
- Alertas: el servidor no puede avisar de que él mismo se ha caído (se cubre con «Vigilar otros servidores» desde otro servidor o con el aviso diario).
- ~~Módulo genérico «App con Docker Compose»~~ hecho como «App desde Git» (0.23.0); las apps de la lista, como módulos propios (0.25.0–0.34.0).

### Idea del usuario (anotada 2026-11-27): plantillas de serie

- Dejar hechas algunas **plantillas de serie** con los módulos más habituales, para que quien empiece no tenga que montarlas.
- Antes hay que **averiguar qué combinaciones son las más habituales** (qué suele montar la gente en un VPS: p. ej. servidor web con dominio, PaaS tipo Coolify, servidor casero con VPN y apps, base de datos con copias, monitorización…) y decidir con el usuario la lista.
- Pendiente de decidir: si vienen dentro de la app (de solo lectura, «duplicar para editar») o se copian a Plantillas al primer arranque.

### Rediseño pedido por el usuario (anotado 2026-11-21; HECHO en la 0.35.0 y la 0.36.0)

**Idea del usuario.** El servidor es la pieza principal. Un **proyecto es una «carta a los Reyes»**: una plantilla de lo que quiero instalar y cómo, que puede existir **sin servidor**. Cuando tengo un servidor, entro en él, le **asocio un proyecto**, lo simulo, lo compruebo y lo aplico. Un mismo proyecto se puede desplegar en varios servidores. En cada servidor habría, en principio, un solo proyecto.

**Ficha del servidor** (al pulsar un servidor; hoy lleva a la lista de proyectos):
- Al abrirla, comprobación por SSH: disco libre, RAM, CPU y módulos instalados.
- Editar la conexión.
- Estado del proyecto asociado: simular, aplicar, cambios pendientes.
- Enlaces a las aplicaciones instaladas (sus URL y «Abrir»).
- Contraseñas y secretos generados.
- Registros (logs) de cada cosa.
- Tiene que hacer de «Grafana» del servidor: controlar todo su estado. Ejemplo del usuario, en su servidor privado (Coolify + nginx + PostgreSQL + dos apps Django en Docker):
  - las URL de las apps publicadas en Coolify (API de Coolify: necesita su token);
  - los PostgreSQL con sus bases y lo que pesa cada una;
  - las URL de las apps instaladas;
  - los registros de cada contenedor o servicio.
- Detectar también lo que ya hay en el servidor aunque no lo haya instalado Draupnode: `docker ps`, sitios de nginx/Caddy, bases de datos.

**Menú:**
- Arriba: Panel, Servidores, Proyectos.
- Un grupo «Utilidades»: Docker Creator y Servidor de pruebas.
- El **Catálogo abajo**, encima de Ayuda (es solo lo que se puede instalar).

**Ventana de un módulo en el Catálogo:**
- La descripción con espacio entre párrafos y a todo el ancho.
- **Enlaces a la web oficial y al código fuente** de cada programa (justo para sus creadores). Por ejemplo, Docker → docker.com y su repositorio. Campos nuevos en module.yaml (`homepage`, `source`, quizá `docs`).

**Qué cambia por dentro (análisis, 2026-11-21).** No se tira nada (módulos, Ansible, ejecución, bóveda y pantallas de módulos se reutilizan), pero hay que **partir el proyecto en dos**:
- **Proyecto (plantilla):** nombre, módulos y sus valores. Sin servidor.
- **Despliegue (proyecto en un servidor):** servidor + proyecto + todo lo que hoy es «del proyecto» pero en realidad es del servidor: slug y carpeta de secretos, contraseñas generadas en la bóveda, módulos instalados con sus valores, última ejecución, aplicado, copias traídas, aviso de copias.
- Migración: cada proyecto actual → una plantilla + un despliegue en su servidor.
- Si una plantilla está en varios servidores y se cambia → «cambios sin aplicar» en cada uno.
- Puntos que chocan con «un proyecto por servidor» y hay que resolver:
  - el «Destino de copias» crea un proyecto aparte en el otro servidor (pasaría a ser un módulo más del proyecto de ese servidor);
  - «App desde Git» admite una sola app por proyecto (habría que permitir varias: una lista);
  - Monitorización y Registros ya están por proyecto (pasarían a la ficha del servidor).
- Datos que se pueden variar por servidor sin tocar la plantilla (dominio, IP pública…): decidir si un despliegue puede sobrescribir valores de la plantilla.

**Decidido con el usuario (2026-11-21): «los proyectos son las recetas y los servidores la cocina».**
- El «Destino de copias» es una receta más («Servidor de copias»: base + Docker + Cortafuegos + Destino de copias con su rotación) que se cocina en su servidor. Desaparece el proyecto especial que se crea solo en el otro servidor.
- Una receta de apps (p. ej. base + Docker + nginx + App desde Git + Copias en el servidor, en el equipo y en otro servidor) se cocina en otro servidor.
- Como la receta no tiene servidor, **a qué servidor de copias se envían se elige al desplegar**: «¿a qué servidor con la receta de copias?». Ahí Draupnode genera el usuario, la contraseña y el certificado y los da de alta en ese servidor, como ahora. Si la misma receta está en varios servidores, cada despliegue tiene su usuario y su carpeta en el destino.
- Por tanto **un despliegue sí puede tener valores propios** (destino de copias, dominio, IP pública…) que sobrescriben los de la receta sin cambiarla.

### Módulos futuros (lista del usuario, 2026-11-20) — todos de código abierto

| Programa | Licencia | Notas para el módulo |
|---|---|---|
| WireGuard | GPL-2 | Hecho (0.17.0): abre él mismo su puerto UDP. |
| Cockpit | LGPL-2.1 | Hecho (0.31.0): solo 127.0.0.1 y VPN. |
| ufw | GPL-3 | Fuera: haría lo mismo que el Cortafuegos (y chocaría con él). |
| Samba | GPL-3 | Hecho (0.32.0): solo VPN o red local. |
| Immich | AGPL-3 | Hecho (0.34.0), como su compose oficial. |
| BorgBackup | BSD-3 | Fuera: las copias ya las hace restic (con destino solo-añadir). |
| Syncthing | MPL-2 | Hecho (0.28.0). |
| Jellyfin | GPL-2 | Hecho (0.27.0). |
| Navidrome | GPL-3 | Hecho (0.26.0). |
| Vaultwarden | AGPL-3 | Hecho (0.25.0). |
| Forgejo | GPL-3 | Hecho (0.29.0). |
| Paperless-ngx | GPL-3 | Hecho (0.30.0). |
| nginx | BSD-2 | Hecho (0.16.0), y Caddy también; no pueden ir juntos ni con Coolify. |
| Pi-hole | EUPL-1.2 | Fuera: AdGuard Home hace lo mismo (y chocarían en el puerto 53). |
| AdGuard Home | GPL-3 | Hecho (0.33.0): DNS solo en la VPN. |
| MariaDB | GPL-2 | Hecho (0.24.0). |
| Prometheus | Apache-2 | Hecho (módulo Monitorización, 0.12.0). |

Muchos son «apps» que encajan mejor desplegadas por Coolify o con un módulo genérico «App con Docker Compose» (estudio, sección 7) que con un módulo cada una.
