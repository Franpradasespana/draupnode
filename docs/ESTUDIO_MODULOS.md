# Estudio: módulos nuevos para el catálogo

Fecha: 2026-11-20 · Estado: propuesta, nada implementado.

Punto de partida: los 5 módulos incluidos (`base`, `firewall`, `docker`, `coolify`, `postgres`) y lo que ya
funcionaba en los scripts antiguos (`1 PUBLICACION_COOLIFY/1_instalar_servidor.sh`, `2_alta_apps.sh`,
`3_monitorizacion.sh`, `traer_copias.sh`, y `deploy_all.sh` / `deploy_monitoring.sh` de la publicación anterior).

En los ejemplos se usan 203.0.113.x y ejemplo.com.

---

## 0. Antes de añadir módulos: huecos del formato `module.yaml`

Varios de los módulos propuestos necesitan cosas que el formato actual no tiene. Conviene resolverlo primero,
porque si no cada módulo se inventaría su propio apaño.

| Hueco | Lo necesitan | Propuesta |
|---|---|---|
| **Variable de tipo `secret`** (la escribe el usuario y no se genera en el servidor): token de la API de Coolify, claves de S3/B2 para restic, token de DNS para Let's Encrypt, SMTP de las alertas | coolify_apps, backups (destino remoto), letsencrypt (DNS-01), alertas | Nuevo `type: secret`. Se guarda en el almacén que ya existe (llavero o bóveda, como las contraseñas de SSH), nunca en `draupnode.json` ni en el `instalar.sh` exportado. Al **Aplicar** se pasa por la entrada estándar del SSH (o en un fichero temporal 0600 que se borra); al **Exportar** el script lo pide por teclado (`read -s`) o lo lee de una variable de entorno. |
| **Conflictos** (`conflicts: [...]`) | nginx frente a Coolify (los dos quieren los puertos 80/443), k3s frente a Coolify | Campo nuevo. El editor bloquea el módulo con candado («choca con X»), igual que ya hace con las dependencias. |
| **Comprobación de que algo ya existe** (contenedor con el mismo nombre, puerto ocupado) | postgres, monitoring, nginx | El preflight acepta en cada módulo una lista `preflight_checks` (p. ej. `container_free: pg-compartido`, `port_free: 80`), que se convierte en avisos en la simulación y en error al aplicar. Así el choque con el `pg-compartido` del servidor real se detectaría en la simulación. |
| **Datos que se pasan de un módulo a otro** (la red Docker, la carpeta de secretos, el nombre del contenedor de Postgres) | monitoring (postgres-exporter), backups (volcar Postgres) | Ya funciona en la práctica, porque todos los roles comparten las variables del playbook. Falta documentarlo y que el editor muestre «usa el valor de PostgreSQL» en vez de pedirlo otra vez. |
| **Tareas programadas** (timers de systemd) | backups, letsencrypt (si va fuera de Docker), actualizaciones | Un rol común `draupnode_timer` (servicio + timer) que usen todos, en vez de copiar plantillas. |

**Servidor de pruebas:** el contenedor (`internal/lab/Dockerfile`) arranca **systemd de verdad** como PID 1,
con `--privileged` y un volumen para `/var/lib/docker`. Por tanto funcionan los timers de systemd, iptables y
Docker dentro de Docker (Coolify ya se probó ahí). Lo que **no** se puede probar en él:
- Let's Encrypt real (no hay dominio público que apunte al contenedor). Se puede probar contra **Pebble**
  (la CA de pruebas de Let's Encrypt) o con `--staging` contra un dominio de verdad en el servidor real.
- fail2ban sobre ataques reales (sí sobre intentos fallidos simulados desde el propio equipo).
- cAdvisor puede dar métricas raras en Docker dentro de Docker (cgroups anidados); el resto de la
  monitorización sí.
- k3s necesita más privilegios/cgroups; probable que falle o requiera ajustes (`--snapshotter=native`).

---

## 1. Endurecer SSH + fail2ban (`ssh_hardening`)

- **Qué hace:** `sshd_config.d/50-draupnode.conf` con `PermitRootLogin no`, `PasswordAuthentication no`
  (opcional), `MaxAuthTries 3`, `LoginGraceTime 30`, `AllowUsers` opcional; cambia el puerto si se pide.
  Instala **fail2ban** con la cárcel `sshd` (y `recidive`).
- **Por qué:** es lo primero que se hace en cualquier servidor nuevo y ninguno de los scripts lo hacía.
- **Depende de:** `base`. Si cambia el puerto, lo añade al Cortafuegos con `firewall_ports` dinámico (hoy
  `firewall_ports` es fijo: habría que permitir que salga de una variable, p. ej. `firewall_ports_from: ssh_port`).
- **Variables:** `ssh_port` (22), `ssh_password_auth` (sí/no, por defecto no), `ssh_allow_users` (lista),
  `ssh_fail2ban` (sí), `ssh_fail2ban_bantime` (1h), `ssh_fail2ban_maxretry` (5).
- **Puertos:** el de SSH. **Secretos:** ninguno.
- **Riesgos:** **dejarse fuera a uno mismo.** Hay que: validar con `sshd -t` antes de recargar; no quitar
  la contraseña si el servidor está dado de alta en Draupnode con usuario+contraseña (la app lo sabe:
  avisar y bloquear la opción); si cambia el puerto, abrirlo en el cortafuegos **antes** de cambiar sshd y
  actualizar el puerto del servidor en Draupnode al terminar. En Oracle Cloud, recordar la Security List.
- **Probar en el servidor de pruebas:** sí (es el mismo sshd; el puerto 2222 está mapeado al 22, así que
  probar el cambio de puerto requeriría mapear otro puerto o dejarlo para el servidor real).
- **Complejidad:** baja-media (lo delicado es no cortar la conexión). **Prioridad: alta.**

## 2. Copias de seguridad con restic (`backups`)

- **Qué hace:** instala restic, genera su contraseña en el servidor
  (`/etc/draupnode/secretos/<proyecto>/restic`), crea `backup.sh` y un timer diario (03:30 con
  `RandomizedDelaySec`), igual que `1_instalar_servidor.sh`: volcado de **todas** las bases con
  `pg_dumpall` por stdin (si está el módulo postgres), carpetas elegidas y la carpeta de secretos;
  `forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune` y `restic check`.
- **Destinos:** local (`/srv/draupnode/backups/restic-repo`) por defecto; opcional S3/B2/SFTP (necesita la
  variable `secret`). Lo local solo protege de errores, no de perder el servidor.
- **Traer las copias al equipo:** botón en la app (equivale a `traer_copias.sh`): rsync/SFTP por la misma
  conexión SSH a una carpeta elegida, con permisos 700/600. Encaja muy bien en una app de escritorio y es
  la parte que más valor da.
- **Restaurar:** botón «Ver copias» (`restic snapshots`) y «Restaurar en…» (fase posterior).
- **Depende de:** `base`; usa `postgres` si está marcado (no es dependencia obligatoria).
- **Variables:** `backups_paths` (lista), `backups_time` (03:30), `backups_keep_daily/weekly/monthly`,
  `backups_destination` (local / s3 / b2 / sftp), `backups_remote_url`, `backups_remote_key` (secret),
  `backups_include_postgres` (sí).
- **Puertos:** ninguno. **Secretos:** contraseña de restic (generada en el servidor) + credenciales del destino.
- **Riesgos:** sin la contraseña de restic las copias no sirven → la app tiene que avisar de forma clara de
  descargarla/guardarla (y ofrecer guardarla en el llavero/bóveda del usuario). En el servidor real ya hay
  un repositorio en `/srv/apps/backups/restic-repo` y un timer `apps-backup`: el módulo usa otros nombres
  (`draupnode-backup-<proyecto>`) para no pisarlo, y en la simulación avisa si encuentra el antiguo.
- **Probar:** sí, entero (systemd funciona en el contenedor). Se puede forzar la copia con
  `systemctl start` y comprobar `restic snapshots`.
- **Complejidad:** media. **Prioridad: alta** (ya está pendiente en PLAN.md).

## 3. Monitorización (`monitoring`)

- **Qué hace:** lo de `3_monitorizacion.sh` / `deploy_monitoring.sh`: Prometheus, node-exporter, cAdvisor,
  postgres-exporter (si hay postgres), blackbox (URLs a vigilar), Loki + Promtail y Grafana, con los
  5 paneles ya hechos (`recursos`, `postgres`, `accesos-url`, `disponibilidad`, `logs-apps`) metidos en el
  rol como ficheros. Versiones de imagen fijadas como ahora.
- **Publicación de Grafana:**
  - con Coolify: configuración dinámica de Traefik (lo que hace hoy `3_monitorizacion.sh`) en
    `https://monitoring.ejemplo.com`;
  - con el módulo nginx: un `location /monitoring` o un subdominio;
  - sin ninguno: solo en `127.0.0.1:3000` y se abre con un **túnel SSH desde la app** (botón «Abrir Grafana»
    en la barra de estado, como el de Coolify). Esta última opción es la más segura y no necesita dominio.
- **Depende de:** `docker`. Opcional: `postgres`, `coolify` o `nginx` para publicarla.
- **Variables:** `monitoring_dir`, `monitoring_publish` (túnel / coolify / nginx), `monitoring_domain`,
  `monitoring_urls` (lista para blackbox), `monitoring_retention_days` (15), `monitoring_logs` (rutas para
  Promtail).
- **Puertos:** ninguno público si va por túnel. **Secretos:** contraseña de admin de Grafana (generada en el
  servidor; la app la muestra o la guarda en el llavero), usuario de solo lectura para postgres-exporter.
- **Riesgos:** el servidor real ya tiene contenedores `monitoring-*` → mismos nombres chocarían: usar prefijo
  configurable (`dn-monitoring-…`) y avisar en la simulación. cAdvisor necesita `containerd-snapshotter:false`
  (ya lo hace el módulo docker). Consumo: unos 600-800 MB de RAM entre todo → `min_ram_mb` alto o dividir en
  dos módulos: **monitoring_metrics** (Prometheus + exporters + Grafana) y **monitoring_logs** (Loki + Promtail).
- **Probar:** sí, salvo que cAdvisor puede dar datos incompletos dentro de Docker.
- **Complejidad:** media-alta (muchos ficheros, pero ya existen y funcionan). **Prioridad: alta.**

## 4. Apps desde GitHub en Coolify (`coolify_apps`)

- **Qué hace:** lo de `2_alta_apps.sh` por la API de Coolify (`/api/v1`): por cada app de una lista
  (repositorio, rama, carpeta base, fichero compose, subdominio), la crea si no existe, le pone el dominio
  (Coolify pide el certificado), le carga sus variables de entorno y la despliega. Idempotente.
- **Dónde se ejecuta:** en el servidor, contra `http://127.0.0.1:8000/api/v1` (así no hace falta abrir el 8000
  hacia fuera), con `ansible.builtin.uri`.
- **Depende de:** `coolify` (+ `postgres` si las apps usan base de datos: el módulo puede crear la base y el
  usuario de cada app y meter `DATABASE_URL` en sus variables automáticamente).
- **Variables:** `coolify_api_token` (**secret**), `coolify_base_domain`, `coolify_apps` → aquí hace falta un
  **tipo de variable nuevo: lista de objetos** (tabla con columnas). Hoy solo hay listas de texto; se puede
  empezar con una línea `nombre|repo|rama|subdominio` validada por patrón, como `apps.conf`, y más adelante
  una tabla de verdad.
- **Puertos:** ninguno nuevo. **Secretos:** el token (lo escribe el usuario) + las variables de cada app
  (generadas en el servidor, como hace hoy `secretos.env`).
- **Riesgos:** pasos manuales inevitables antes (crear el usuario de Coolify, conectar la GitHub App, crear
  el token) → el módulo debe comprobar el token al principio y, si falta, explicar exactamente qué hacer.
  La API de Coolify cambia entre versiones → comprobar la versión y fallar con un mensaje claro.
- **Probar:** sí en el servidor de pruebas (Coolify ya funciona allí), con un repositorio público de ejemplo;
  el dominio y el certificado no (se probaría con la IP).
- **Complejidad:** alta. **Prioridad: media-alta** (ya está pendiente en PLAN.md; es lo que más trabajo ahorra
  al usuario, pero depende de pasos manuales).

## 5. Importar secretos de una instalación existente (`import_secrets`)

- **Qué hace:** lee un `secretos.env` ya existente (por defecto `/srv/apps/secretos.env`) y copia cada valor a
  `/etc/draupnode/secretos/<proyecto>/<nombre>` **solo si no existe**, para que postgres y las apps reutilicen
  las contraseñas de siempre en vez de generar otras.
- **Mejor como opción que como módulo:** encaja como variable de `postgres` / `coolify_apps`
  («Importar contraseñas de: ruta») o como acción del proyecto, porque necesita un mapa nombre-antiguo →
  nombre-nuevo. Propuesta: módulo pequeño con `import_secrets_file` y `import_secrets_map` (lista
  `VARIABLE_ANTIGUA=fichero_nuevo`), que se ordena antes que el resto.
- **Riesgos:** la simulación nunca debe mostrar los valores (`no_log`). No borrar nunca el fichero original.
- **Probar:** sí, con un `secretos.env` de ejemplo. **Complejidad:** baja. **Prioridad: media** (solo vale
  para migrar el servidor actual).

## 6. Proxy nginx + Let's Encrypt, sin Coolify (`nginx_proxy`)

- **Qué hace:** lo de `deploy_all.sh`: nginx en Docker (o del sistema) delante de las apps, con certificados de
  Let's Encrypt (certbot por webroot, certificado autofirmado provisional mientras llega el real, renovación
  con timer + recarga), cabeceras de seguridad y **rate-limit** (`limit_req_zone` para rutas de login, 10 r/m,
  `burst=5`, `429`).
- **Por qué:** para servidores pequeños donde Coolify sobra (1 GB de RAM), o para quien no lo quiere.
- **Depende de:** `docker` (si va en contenedor), `firewall`. **Choca con:** `coolify` (los dos quieren 80/443)
  → necesita el campo `conflicts`.
- **Variables:** `nginx_sites` (lista `dominio → destino`, p. ej. `app.ejemplo.com → http://mi-app:8000`),
  `nginx_email_le`, `nginx_rate_limit_paths` (lista), `nginx_staging` (sí/no, para pruebas).
- **Puertos:** 80, 443. **Secretos:** ninguno (la cuenta ACME se crea en el servidor).
- **Riesgos:** si el DNS no apunta todavía al servidor, el certificado falla → comprobar el DNS antes
  (resolver el dominio y comparar con la IP del servidor) y quedarse con el autofirmado avisando. Límites de
  Let's Encrypt → `staging` por defecto en el servidor de pruebas.
- **Probar:** nginx y rate-limit sí; Let's Encrypt solo con Pebble o en el servidor real con staging.
- **Complejidad:** media-alta. **Prioridad: media.**
- Variante más simple a valorar: **Caddy** en lugar de nginx+certbot (pide y renueva los certificados solo,
  configuración de 3 líneas por sitio). Menos piezas y menos fallos; se pierde lo ya probado de `deploy_all.sh`.

## 7. Apps con Docker Compose sin Coolify (`compose_app`)

- **Qué hace:** clona (o actualiza) un repositorio y lanza su `docker-compose.yml` con un `.env` generado
  (contraseñas en el servidor), conectado a la red `apps` y a Postgres. Lo de `update_app.sh`.
- **Depende de:** `docker`; opcional `postgres`, `nginx_proxy`.
- **Riesgos:** repos privados → clave de despliegue (deploy key) generada en el servidor y mostrada para
  pegarla en GitHub. **Complejidad:** media. **Prioridad: media-baja** (va de la mano de nginx_proxy).

## 8. Otros módulos pequeños (baja complejidad, buen valor)

| Módulo | Qué hace | Probar en pruebas | Prioridad |
|---|---|---|---|
| `users` | Crear usuarios con su clave pública y sudo opcional (para no trabajar siempre con `ubuntu`) | Sí | media |
| `logrotate_docker` | Límite de tamaño de logs de Docker (`log-opts max-size`) + logrotate de carpetas elegidas. Probablemente mejor como opción del módulo `docker` | Sí | media |
| `alerts` | Aviso por correo/Telegram si falla la copia, se llena el disco o una URL cae (systemd `OnFailure` + script). Necesita `secret` | Sí (sin envío real, o con un bot de prueba) | media |
| `redis` | Redis compartido en la red `apps`, contraseña generada en el servidor (igual que postgres) | Sí | baja |
| `wireguard` | VPN para administrar sin abrir puertos (SSH solo por la VPN). Genera las claves y la app descarga el `.conf` | Parcial (necesita módulo del kernel del anfitrión) | baja |

## 9. Kubernetes ligero (`k3s`) y OpenTofu

- **k3s:** instalador oficial, kubeconfig descargado a la app. Choca con Coolify (puertos y Traefik propio).
  Difícil de probar en el contenedor (cgroups anidados). **Complejidad media, prioridad baja**: es otro
  público distinto.
- **OpenTofu/Terraform** (crear la máquina en Oracle/Hetzner antes de prepararla): es otra fase entera (no
  ejecuta en el servidor sino en el equipo, necesita credenciales de la nube). **Fuera de los módulos
  actuales**; dejarlo para después de la 1.0.

---

## Orden recomendado

1. **Formato:** tipo `secret`, campo `conflicts`, comprobaciones de choque en el preflight (contenedores y
   puertos), `firewall_ports` que salga de una variable, rol común de timers. Sin esto, lo demás queda cojo.
2. **ssh_hardening + fail2ban** — pequeño, se prueba entero y protege cualquier servidor.
3. **backups (restic) + botón «Traer copias al equipo»** — reaprovecha `1_instalar_servidor.sh` y
   `traer_copias.sh`.
4. **monitoring** (métricas primero, logs después), publicado por túnel SSH desde la app.
5. **import_secrets** — justo antes de usar Draupnode con el servidor real.
6. **coolify_apps** (API de Coolify) — con lista en formato línea al principio.
7. **nginx_proxy** (o Caddy) + **compose_app**, para servidores sin Coolify.
8. Pequeños: `users`, logs de Docker (dentro de `docker`), `alerts`, `redis`.
9. Más adelante: `wireguard`, `k3s`, OpenTofu.

## Decisiones que tiene que tomar el usuario

1. **Secretos que escribe el usuario** (token de Coolify, claves de S3…): ¿de acuerdo con guardarlos en el
   llavero/bóveda y pasarlos al servidor solo al aplicar (y pedirlos por teclado en el `instalar.sh`
   exportado)?
2. **Copias:** ¿solo locales + «traer al equipo», o también un destino remoto (S3/B2/otro servidor por SFTP)? ¿Cuál?
3. **Grafana:** ¿publicarla con dominio (por Coolify/nginx) o solo por túnel SSH desde la app?
4. **Monitorización:** ¿un módulo o dos (métricas / registros) para servidores con poca RAM?
5. **Proxy sin Coolify:** ¿nginx (lo ya probado en `deploy_all.sh`) o Caddy (más sencillo)?
6. **SSH:** ¿quitar el acceso con contraseña por defecto? ¿Cambiar el puerto 22 se ofrece o no?
7. **Servidor real con lo antiguo** (`pg-compartido`, `monitoring-*`, `apps-backup`): ¿Draupnode debe
   **adoptar** lo existente (mismos nombres, no tocar los datos) o instalar lo suyo al lado con otros nombres?
   Esto decide cómo se hacen postgres, monitoring y backups.
8. **k3s y OpenTofu:** ¿entran antes de la 1.0 o se dejan fuera?
