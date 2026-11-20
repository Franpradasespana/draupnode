# Historial de cambios

## 2026-11-19 · 0.1.0 · Arranque del proyecto (fase 1)

- Nombre: **Draupnode** (de Draupnir, el anillo de los enanos que crea copias idénticas de sí mismo). Libre en GitHub a fecha de hoy.
- Pila: Go 1.27 + Wails 2.17 + Svelte 5 (TypeScript). Go instalado en `~/.local/go` (sin sudo).
- Backend:
  - `internal/store`: configuración en `draupnode.json` (escritura atómica, permisos 0600).
  - `internal/secrets`: frases de paso en el llavero del sistema (`zalando/go-keyring`).
  - `internal/sshx`: conexión con clave + frase de paso o ssh-agent; known_hosts propio + `~/.ssh/known_hosts`;
    errores tipados (falta frase, frase incorrecta, huella desconocida, huella cambiada); `Probe` con datos del servidor.
  - Tests con un servidor SSH en memoria: frase correcta/incorrecta, confianza en huella, huella cambiada, clave rechazada.
- Interfaz: Panel, Servidores (alta/edición, probar conexión con diálogos de frase y huella), Ajustes (15 temas + editor de paletas), pantallas «pronto» para Catálogo, Proyectos, Editor y Terminal.
- Paletas: las 12 de `DEV/1 IMAGENES/Draupnode` + Draupnir Gold (por defecto), Muspelheim y Niflheim.
  Los colores derivados (texto sobre acento, texto de la barra lateral en temas mixtos) se calculan por contraste.
- Modo demo en navegador (`make demo`) con datos simulados para diseñar sin backend.
- Icono de la app: el anillo Draupnir con sus ocho gotas.
- Pendiente: instalar `libgtk-3-dev libwebkit2gtk-4.1-dev pkg-config` (sudo) para compilar la app de escritorio en Linux.

## 2026-11-19 · Icono definitivo y primera compilación en Linux

- Icono a partir de `DEV/1 IMAGENES/Draupnode/icono.jpeg`: recortado al anillo (sin el texto, que no se lee en pequeño) y con esquinas redondeadas tipo macOS → `build/appicon.png`.
  - Wails genera con él el `.icns` de macOS y el `.ico` de Windows.
  - Linux: icono de ventana embebido (`linux.Options.Icon`) + lanzador `build/linux/draupnode.desktop` con `StartupWMClass=draupnode`, que es lo que usa GNOME/Ubuntu para el dock (en Wayland ignora el icono de la ventana).
  - macOS: mismo icono en «Acerca de».
  - Barra superior de la app: versión 128 px del recorte.
- `make install-linux` (sin sudo): binario en `~/.local/bin`, icono en `~/.local/share/icons` y lanzador en `~/.local/share/applications`.
- Instaladas por el usuario las librerías GTK/WebKitGTK 4.1; la app compila y arranca en Ubuntu 26.04.

## 2026-11-19 · 0.2.0 · Contraseñas, PuTTY, bóveda y claves del sistema

Petición del usuario tras la primera prueba:
- **Claves PuTTY `.ppk`** (v2 y v3, cifradas o no) con `github.com/kayrus/putty`, además de OpenSSH y PEM/PKCS#8 (`.key`, `.pem`). Si eliges una `.pub` avisa de que es la pública.
- **Usuario y contraseña** como segunda forma de entrar (password + keyboard-interactive).
- Formulario: casillas siempre visibles «La clave tiene contraseña» (al marcarla aparece el campo; se marca sola si la clave está cifrada) y, a su derecha, «Guardar contraseña».
- **Dónde se guardan las contraseñas** (Ajustes → Contraseñas guardadas): Automático (recomendado), Llavero del sistema (detecta si existe y cuál: GNOME Keyring, KWallet, Llavero de macOS, Credenciales de Windows) o **Bóveda cifrada de Draupnode**.
  - Bóveda: `vault.json` con Argon2id (64 MiB, 3 pasadas, 4 hilos) + XChaCha20-Poly1305, nonce aleatorio por secreto y el nombre como dato asociado; contraseña maestra ≥ 10 caracteres, nunca se guarda; la clave derivada solo vive en memoria mientras está desbloqueada.
  - Cada servidor recuerda en qué almacén está su contraseña (`secretStore`).
  - Si hace falta la bóveda y no existe o está bloqueada, la app pide crearla o desbloquearla y reintenta.
- **Claves encontradas**: desplegable con las claves privadas de `~/.ssh` y de los `IdentityFile` de `~/.ssh/config`; botón «Importar de ~/.ssh/config» que rellena host, usuario, puerto y clave.
- Se quita ssh-agent de la interfaz (se mantiene en el backend por compatibilidad) y el mensaje «Todo en local…» de la barra lateral.
- Tests nuevos: `.ppk` (generadas con puttygen en `internal/sshx/testdata`, contraseña `testkey`), usuario/contraseña, lectura de `~/.ssh/config`, bóveda (cifrado en disco, maestra errónea, bloqueo, secreto movido de entrada) y lógica de guardado de `app.go` (`go test -tags webkit2_41 .`).

## 2026-11-19 · Elegir dónde guardar cada contraseña

- Al guardar un servidor con «Guardar contraseña» marcado (o al marcarlo en la ventana que la pide al conectar), se abre la ventana **«¿Dónde guardar la contraseña?»**: llavero del sistema (con su nombre real en Linux, Windows o macOS) o bóveda cifrada de Draupnode. Si no hay llavero, esa opción sale desactivada.
- Si no hay llavero, la ventana y Ajustes sugieren qué instalar según el sistema: Linux → GNOME Keyring, KWallet o KeePassXC, con el comando de su gestor de paquetes (apt, dnf, pacman o zypper, detectado); Windows → Administrador de credenciales o KeePassXC (`winget`); macOS → Llavero o KeePassXC (`brew`). Botón para copiar el comando.
- `SaveServer` recibe el almacén elegido; si una contraseña guardada cambia de sitio se mueve sin volver a escribirla (pidiendo desbloquear la bóveda si hace falta).
- La tarjeta del servidor dice exactamente dónde está su contraseña («Contraseña en GNOME Keyring…»).
- Demo en navegador: `?sinllavero` en la URL simula un equipo sin llavero.

## 2026-11-19 · 0.3.0 · Fase 2: catálogo, proyectos y ejecución con Ansible

- **Módulos** (`internal/modules`): carpeta con `module.yaml` (id, nombre, categoría, descripción, dependencias, requisitos de SO/RAM/disco y variables tipadas: texto, número, sí/no, opción, lista; con patrón, mínimo/máximo) + `role/` de Ansible. Las variables deben empezar por `<id>_`. Incluidos dentro del ejecutable; los del usuario en `~/.config/draupnode/modules/` (mandan sobre los incluidos con el mismo id). Orden por dependencias con detección de ciclos.
- **Módulos incluidos**, sacados de `1 PUBLICACION_COOLIFY/1_instalar_servidor.sh`: Sistema base (paquetes, zona horaria, swap, unattended-upgrades), Cortafuegos (iptables + netfilter-persistent, como las imágenes de Oracle), Docker (get.docker.com + containerd-snapshotter desactivado antes de Coolify), Coolify (instalador oficial + puertos 8000/6001/6002) y PostgreSQL compartido (Docker, una base y usuario por app, contraseñas generadas EN el servidor con `lookup('password')` en `/etc/draupnode/secretos/<proyecto>/`).
- **Generador** (`internal/bundle`): un único `instalar.sh` autocontenido (bash + tar.gz en base64) que crea un venv con `ansible-core<2.19` en `/opt/draupnode/venv` si no existe y ejecuta `ansible-playbook -c local`. Incluye un rol `draupnode_preflight` (SO, RAM, disco, carpeta de secretos) y un callback `draupnode` que imprime `@@DN {json}` por evento. Los valores del usuario van como `!unsafe` (Ansible no los interpreta como plantilla). `--check` = previsualizar.
- **Ejecución** (`internal/runner`): sube el script por SSH (`mktemp` 0600), lo lanza con `sudo -n` (o `sudo -S` con la contraseña de sudo, sin eco gracias a `stty -echo`), con PTY para que cancelar detenga Ansible en el servidor, y borra el script al terminar.
- **App**: `ListModules/ReloadModules/ModuleFile/OpenModulesDir`, `ListProjects/CheckProject/SaveProject/DeleteProject`, `RunProject/CancelRun` (eventos «run» en directo), `ExportProject`, `RunLogs/ReadRunLog` (registros en `~/.config/draupnode/runs/<proyecto>/`). No se puede borrar un servidor que use un proyecto.
- **Interfaz**: Catálogo (tarjetas por categoría, detalle con variables y ficheros del rol), Proyectos (lista y editor: módulos con dependencias automáticas, formularios generados, validación en vivo, avisos de requisitos frente a la última comprobación del servidor), panel de ejecución en directo (tareas por módulo, notas, diferencias en previsualizar, registro completo, cancelar), Exportar instalar.sh.
- Verificado: tests de Go (incluido un servidor SSH que ejecuta bash de verdad, con `-race`), `ansible-playbook --syntax-check` del bundle completo y ejecución real del preflight + callback en modo `--check`. **Sin probar todavía contra un servidor real.**
- Fallos encontrados y corregidos al probar: escritura concurrente stdout/stderr en la subida del script; `structuredClone` sobre estado reactivo al marcar módulos; tareas de swap y `/etc/docker` en modo previsualizar; borrar servidor eliminaba su contraseña aunque el borrado fallara.

## 2026-11-19 · Servidor Ubuntu de pruebas en Docker

- `pruebas/servidor-ubuntu/` (Dockerfile + `servidor.sh arrancar|estado|ssh|parar|borrar`): Ubuntu 24.04 con systemd, SSH, sudo y python3, en un contenedor `--privileged` (para systemd, iptables y Docker dentro de Docker; `/var/lib/docker` en un volumen). Solo escucha en 127.0.0.1: SSH en el 2222 y el panel de Coolify en el 18000.
- Usuario `ubuntu` con sudo sin contraseña (como Oracle) y usuario `prueba` con sudo con contraseña; contraseña de ambos: `draupnode`.
- Genera en `claves/` (ignorado por git): clave sin contraseña, clave con contraseña `draupnode` y su `.ppk`, y una huella de servidor fija para que recrear el contenedor no dé «huella cambiada».
- Si tu usuario no está en el grupo `docker`, el script usa `sudo docker`.

## 2026-11-19 · 0.4.0 · Pantalla «Pruebas»: servidor Ubuntu en Docker con botones

- Nuevo paquete `internal/lab` y pantalla **Pruebas**:
  1. **Docker en este equipo**: detecta si falta, si el servicio está parado o si no hay permiso. En Linux lo arregla con un botón usando `pkexec` (ventana gráfica de contraseña): instalar `docker.io` (o el paquete de dnf/pacman/zypper), `systemctl enable --now docker`, `usermod -aG docker`. Si el usuario ya está en el grupo pero no ha cerrado sesión, usa `sg docker -c` para no tener que reiniciar sesión. En Windows/macOS, enlace a Docker Desktop.
  2. **Servidor de pruebas**: Crear y arrancar / Arrancar / Parar / Borrar, con el progreso en directo (evento «lab»).
  3. **Usarlo en Draupnode**: «Dar de alta» crea el servidor (127.0.0.1:2222, ubuntu, clave sin contraseña) y deja su huella confiada (`sshx.TrustHostKey`); datos de conexión, claves y huella.
- Las claves de prueba se generan en Go (también la de contraseña `draupnode`; la `.ppk` si hay puttygen) en `~/.config/draupnode/prueba/`. El Dockerfile pasa a `internal/lab/Dockerfile` (va dentro del ejecutable); `pruebas/servidor-ubuntu/servidor.sh` usa ese mismo Dockerfile y las mismas claves.
- Motivo: `!` en Claude Code no permite escribir la contraseña de sudo; con pkexec la pide el sistema en una ventana.

- 0.4.1: si Docker no responde por permisos, el servidor de pruebas se detecta por su puerto 2222 (se puede dar de alta igualmente). Ubuntu 26.04 no trae `sg`: si el usuario ya está en el grupo docker, se avisa de cerrar sesión en vez de ofrecer otra vez «Darme permiso».

### 2026-11-19 — Laboratorio: «Sin permiso» tras darse de alta en docker
- En Ubuntu 26.04 no existen `sg` ni `newgrp`, y `systemd --user` sobrevive al cierre de sesión con los grupos viejos: cerrar sesión no basta. Los mensajes ahora piden reiniciar el equipo.

### 2026-11-19 — Panel: servidores clicables → sus proyectos
- Cada servidor del Panel es clicable (muestra cuántos proyectos tiene) y abre **Proyectos** filtrado por ese servidor.
- En Proyectos, barra «Servidor: [desplegable] · Ver todos» cuando hay filtro; «Nuevo proyecto» trae ya elegido el servidor filtrado. Entrar a Proyectos desde el menú lateral quita el filtro.
- Los proyectos pertenecen a un servidor (`serverId` obligatorio); un servidor puede tener varios proyectos.
- En **Servidores** también: pulsar la tarjeta de un servidor (fuera de sus botones) abre sus proyectos; cada tarjeta muestra cuántos tiene.

## 2026-11-19 · 0.5.0 · Barra de estado, ayuda con capturas y Coolify en Pruebas

- **Barra de estado** (abajo, en todas las pantallas): servidor elegido (desplegable; sigue al servidor del proyecto o la lista que estés viendo), `usuario@host`, si su SSH responde ahora («En línea · N ms» / «No responde», se mira cada 30 s sin autenticarse), resultado de la última prueba de conexión, lo que se está previsualizando/aplicando (pulsable), nº de proyectos y botón **Abrir Coolify / Abrir la web**. Backend: `ServerLive(id)` en `app_status.go` busca en orden Coolify (`:8000`; en el de pruebas `127.0.0.1:18000`), `https://host` y `http://host`.
- **Pruebas**: el botón «Panel de Coolify» salía en cuanto el contenedor arrancaba aunque Coolify no estuviera instalado (el contenedor es un Ubuntu limpio). Ahora `LabStatus.coolifyUp` comprueba que el panel responde; si no, se explica cómo instalarlo (proyecto con el módulo Coolify → Aplicar).
- **Ayuda** (botón al pie del menú lateral): abre la ayuda de la pantalla actual, con secciones «Cómo funciona», Panel, Servidores, Proyectos, Catálogo, Pruebas y Ajustes; pasos con capturas ampliables. Textos en `frontend/src/lib/help.ts`.
- **Capturas**: `make capturas` (`frontend/scripts/capturas.mjs`) arranca la demo del navegador con datos de ejemplo y saca las capturas con Chrome/Chromium sin ventana por el protocolo DevTools (sin dependencias nuevas) a `frontend/src/assets/ayuda/*.webp`. Rehacerlas tras cambiar pantallas.

### 2026-11-19 — Proyectos: «Aplicar» desactivado en un proyecto nuevo · datos reales fuera de la demo
- Previsualizar, Aplicar y Exportar estaban desactivados hasta pulsar «Guardar» (botón pequeño arriba): ahora guardan solos antes de ejecutar. Solo se desactivan si no hay módulos marcados, hay campos con errores o ya se está ejecutando. Al guardar un proyecto nuevo ya no se vuelve a montar el editor (cortaba la ejecución recién lanzada).
- La demo del navegador, las capturas de la ayuda, los placeholders del formulario y los tests ya no usan la IP ni nombres reales: IPs de documentación (203.0.113.x, RFC 5737) y nombres genéricos («Servidor web»). Capturas rehechas.

### 2026-11-19 — Editor de proyectos: Guardar al lado del nombre, guardado automático y «Aplicar» solo si hace falta
- Proyecto nuevo: «Guardar» junto al nombre y el servidor; módulos y botones desactivados hasta guardar. Se puede guardar sin módulos (para ejecutar sigue haciendo falta al menos uno).
- Proyecto ya creado: en ese sitio aparece «Eliminar»; cada cambio se guarda solo (700 ms después), con «Guardando… / Cambios guardados / No se guarda hasta corregir los campos en rojo» arriba a la derecha.
- «Aplicar» solo se muestra si el proyecto no se ha aplicado nunca o ha cambiado desde la última aplicación correcta; si no, «Aplicado hace…, sin cambios desde entonces». Nuevo `Project.appliedAt` (lo pone `SetLastRun` con una aplicación completa sin errores); guardar sin cambios ya no mueve `updatedAt`.

### 2026-11-19 — Primera prueba real (servidor de pruebas): Sistema base + Cortafuegos
- **Fallo al previsualizar**: «python3-apt must be installed to use check mode». `instalar.sh` ahora instala `python3-apt` en Debian/Ubuntu si falta, en cada ejecución (no solo la primera vez, para los servidores ya preparados).
- **Cortafuegos al previsualizar** sin iptables instalado (su instalación solo se simula): en vez de fallar, nota «Al aplicar se abrirán los puertos TCP…».
- **Swap en contenedores**: dentro de un contenedor (el servidor de pruebas) el swap es el del equipo anfitrión; `base` lo omite con una nota (`ansible_virtualization_type` docker/podman/lxc/container).
- Probado con el instalar.sh del proyecto contra el servidor de pruebas: previsualizar 0 fallos; aplicar 0 fallos (8 cambios: paquetes, zona horaria, unattended-upgrades, iptables 22/80/443 guardadas); segunda previsualización 0 cambios.

### 2026-11-19 — Resultado de una ejecución explicado
- Al terminar, recuadro con el veredicto en lenguaje normal: previsualización «Todo correcto, no se ha cambiado nada; si pulsas Aplicar se harán estos N cambios: …»; con fallos, qué tareas fallaron; aplicación correcta/con errores igual.
- Leyenda de estados y nombres más claros: «ya está bien», «se cambiará» / «hecho», «no hace falta», «fallo». Las notas van bajo «Para que lo sepas» (avisos, no errores).
- Quitado el mensaje «El servidor ya está como pide el proyecto…» (confundía): sin cambios pendientes solo se dice «Todo correcto».
- Mensajes del resultado más claros: simulación con cambios → «Simulación completada. Todavía no se ha aplicado nada… pulsa Aplicar» + lista; simulación sin nada pendiente → «Configuración ya aplicada en el servidor. No es necesario pulsar Aplicar», y además cuenta como aplicado (`appliedAt`), así que el botón Aplicar desaparece; aplicación → «Configuración aplicada en el servidor».

## 2026-11-19 · 0.6.0 · Coolify probado en el servidor de pruebas e interfaz adaptable

- **Probado de verdad** en el servidor de pruebas un proyecto con Coolify (trae Sistema base, Docker y Cortafuegos): simulación 0 fallos → aplicar 0 fallos (10 cambios, Docker dentro del contenedor + instalador oficial de Coolify) → panel responde en http://127.0.0.1:18000 → segunda simulación 0 cambios.
- Arreglos que salieron al probar:
  - Comprobación de espacio libre: usaba `ansible_mounts`, donde en contenedores (y algunos servidores) no aparece «/». Ahora `df -Pk /`.
  - Simulación sin Docker instalado: el handler «Reiniciar Docker» fallaba (el servicio no existe aún); se salta. Igual para abrir los puertos de Coolify sin iptables.
  - Dirección del panel de Coolify: nueva variable `draupnode_coolify_url` (en el servidor de pruebas, el puerto 18000). En la simulación la nota dice «Cuando se aplique, el panel estará en…».
- **Interfaz adaptable**: ventana mínima 600×480 (antes 960×640, más de media pantalla). Por debajo de 900 px el menú lateral se pliega en un botón ☰ (se abre por encima y se cierra al elegir); la barra de estado oculta lo secundario; el editor de proyecto pone «Eliminar» junto al nombre; la ayuda pasa su índice arriba. Comprobado con capturas a 680 y 600 px.

### 2026-11-20 · 0.6.1 — Editor de proyectos: ventanas de módulos congeladas y puertos de Coolify
- **Fallo**: tras el primer cambio, marcar/desmarcar módulos no ponía ni quitaba su ventana (p. ej. Docker, PostgreSQL). Causa: con un servidor ya comprobado, `CheckProject` devolvía `warnings: null` (slice nil de Go) y la interfaz hacía `.length` sobre null; el error cortaba el repintado del editor. Arreglado en los dos lados (Go siempre `[]`, interfaz con `?.`) + test que comprueba que la comprobación no lleva ningún null. No salía en la demo porque el simulador devolvía `[]`; se reprodujo con `wails dev` + Chrome sin ventana contra el backend real.
- Las ventanas aparecen/desaparecen al instante (antes esperaban a la comprobación del backend).
- Un módulo que necesita otro marcado queda bloqueado (candado + «lo necesita X»); antes la casilla se desmarcaba sin efecto y quedaba descuadrada.
- **Puertos de Coolify**: nuevo campo de módulo `firewall_ports`. Al marcar Coolify se añaden 8000, 6001 y 6002 a la lista del Cortafuegos (y se quitan al desmarcarlo si ningún otro los pide), así que lo que se ve es lo que se abre. Quitada la casilla «Abrir los puertos del panel» y la tarea de iptables propia de Coolify.
- Las listas de los formularios se actualizan si cambian desde fuera.

## 2026-11-20 · 0.7.0 · Editor más estable, opciones de Coolify y estudio de módulos

- **Orden de las ventanas**: el editor calcula él mismo el orden de ejecución (igual que `Catalog.Resolve` en Go: ids ordenados y, delante de cada uno, sus dependencias). Una ventana nueva aparece ya en su sitio; antes salía al final y saltaba cuando respondía el backend.
- **Plegado recordado**: qué ventanas de módulo están plegadas se guarda por proyecto (`Project.collapsed`, método `SetProjectCollapsed`). No cuenta como cambio del proyecto (no mueve `updatedAt` ni pide Aplicar) y el guardado automático del editor no lo pisa. Test `TestPlegadoNoEsCambio`.
- **Coolify** (variables nuevas; solo cuentan en la primera instalación, después se cambian en su panel):
  - *Correo y nombre del administrador*: si hay correo, se crea el administrador al instalar (`ROOT_USER_EMAIL`/`ROOT_USERNAME`/`ROOT_USER_PASSWORD` del instalador oficial) con una contraseña generada EN el servidor (24 letras y números + `-Aa9`, porque Coolify exige mayúsculas, minúsculas, números y símbolo). Queda en `/etc/draupnode/secretos/<proyecto>/coolify_admin` (0600, solo root); la nota final dice cómo leerla. Vacío = como antes, el primero que entra crea el usuario.
  - *Actualizaciones automáticas* sí/no (`AUTOUPDATE=false`).
  - Si Coolify ya estaba instalado, la nota lo dice en vez de prometer nada.
- **Cortafuegos**: probado en el servidor de pruebas que abre 8000/6001/6002 y los guarda en `/etc/iptables/rules.v4`. Quita las reglas antiguas con la etiqueta `draupnode-coolify` (las abría el módulo Coolify hasta la 0.6.0), que quedaban duplicadas. Segunda simulación: 0 cambios.
- **Estudio de módulos nuevos** en `docs/ESTUDIO_MODULOS.md`: cambios de formato previos (tipo `secret`, `conflicts`, avisos de choques, puertos desde variable, listas de varias columnas), orden propuesto (SSH endurecido + fail2ban, restic, monitorización, importar secretos, apps por API de Coolify, nginx/Caddy…) y decisiones pendientes.
- Probado en un servidor de pruebas desechable (Ubuntu limpio): instalación de Coolify con correo de administrador y sin actualizaciones automáticas → 0 fallos; el usuario existe en la base de Coolify, la contraseña guardada en el servidor es la que acepta y no aparece en el registro de la ejecución; `.env` con `AUTOUPDATE=false`.

### 2026-11-20 — Enlaces clicables en los mensajes de una ejecución
- Las direcciones http(s) de las notas («Para que lo sepas») y de los mensajes de las tareas se abren en el navegador al pulsarlas (componente `Linkify`; la puntuación final como «).» no entra en el enlace). P. ej. el panel de Coolify en la nota «Coolify ya estaba instalado…».

## 2026-11-20 · 0.8.0 · Formato de módulos ampliado, contraseñas por proyecto y SSH seguro + fail2ban

**Formato de `module.yaml`** (lo que pedía `docs/ESTUDIO_MODULOS.md`, sección 0):
- `type: secret`: dato que escribe el usuario (token, clave). Se guarda en la bóveda por proyecto (`proj:<id>:var:<variable>`), nunca en `draupnode.json`. Al Aplicar viaja en `secretos.yml` dentro del script temporal (0600, se borra al terminar); el `instalar.sh` exportado no lo lleva y lo pide al ejecutarse (`read -s`) o lo lee de `DN_SECRET_<NOMBRE>`. Valores `!unsafe`. En el editor: campo de contraseña con «Guardar / Cambiar / Borrar».
- `conflicts: [...]`: módulos que no pueden ir juntos (en los dos sentidos). El editor los bloquea con candado («choca con…») y el backend lo rechaza.
- `after: [...]`: orden blando: si ese módulo está en el proyecto, este va detrás (sin añadirlo). Lo usa SSH para ir después del Cortafuegos.
- `checks: [{container_free: <variable>}]`: el preflight busca un contenedor con ese nombre que no lleve la etiqueta `draupnode.proyecto=<proyecto>`. Al previsualizar avisa; al aplicar se detiene sin tocar nada. PostgreSQL lo usa (y su compose lleva ya la etiqueta): así saldría el choque con el `pg-compartido` del servidor real.
- `firewall_ports_from: [<variable int>]`: puertos que salen de un valor (el puerto SSH). El editor ajusta la lista del Cortafuegos al marcar/desmarcar o cambiar el valor (el 22 no se quita nunca); el backend avisa si falta un puerto en la lista.
- `secrets: [{file, label}]`: nombre legible de los ficheros que genera el módulo en el servidor (admite `*`).

**Contraseñas del proyecto** (petición del usuario):
- Al Aplicar, el script devuelve la carpeta `/etc/draupnode/secretos/<proyecto>/` (sin ficheros ocultos) en una línea `@@DN-SECRETS` que el runner aparta: no se enseña ni se guarda en el registro, va directa a la bóveda (`proj:<id>:gen:<fichero>`). Lo que ya no está en el servidor se quita.
- Si el proyecto genera contraseñas o tiene datos secretos, Aplicar exige la bóveda: la crea o desbloquea antes de empezar (`vault_missing` / `vault_locked`).
- Recuadro «Contraseñas del proyecto» en el editor: «Ver contraseñas» pide SIEMPRE la contraseña de la bóveda, las enseña tapadas con botones de mostrar y copiar (las de varias líneas «Clave: valor», como el administrador de Coolify, fila a fila) y se ocultan solas a los 2 minutos. Por proyecto: cada uno tiene las suyas aunque compartan servidor. Borrar el proyecto las borra de la bóveda.
- **Arreglo**: la carpeta de secretos salía del nombre del proyecto; renombrarlo habría generado contraseñas nuevas. Ahora `Project.slug` se fija al crearlo (único entre proyectos) y no cambia. Los proyectos anteriores se quedan con el de su nombre actual.

**Módulo «SSH seguro + fail2ban»** (`ssh`):
- `sshd_config.d/01-draupnode.conf` (manda sobre `50-cloud-init.conf` y similares): puerto, root (no / solo con clave), contraseña sí/no, intentos, `AllowUsers`. Se valida con `sshd -t`; si falla, se restaura lo anterior y no se recarga. Ubuntu 24.04+ (ssh.socket): `daemon-reload` + reinicio del socket; las conexiones abiertas no se cortan. Comprueba que escucha en el puerto nuevo.
- Para no quedarse fuera: la app no deja quitar la contraseña si entra con ella, prohibir root si entra como root, una lista de usuarios sin el suyo, ni cambiar el puerto en un servidor con puerto redirigido (el de pruebas). El rol además comprueba que el usuario tiene claves autorizadas. Si cambia el puerto, se abre en iptables antes (si no lo abrió ya el Cortafuegos) y, al terminar bien, Draupnode actualiza el puerto del servidor (aviso en «Para que lo sepas»).
- fail2ban (`sshd` con backend systemd + `recidive`), nunca bloquea la IP desde la que conecta Draupnode (el runner pasa `DRAUPNODE_CLIENT_IP`; el script exportado la saca de `SSH_CLIENT` o `who -m`, y si no puede lo dice).
- Avisos de Draupnode (contraseñas guardadas, puerto cambiado) salen en «Para que lo sepas» (evento `notice`).

**Probado** en un servidor Ubuntu 24.04 limpio y desechable, con la app por dentro (conexión, Aplicar, bóveda):
- base + Cortafuegos + SSH + Docker: 0 fallos; `sshd -T` con puerto 22, sin contraseña, sin root, 4 intentos; fail2ban con `sshd` y `recidive` y la IP del equipo en `ignoreip`; segunda simulación 0 cambios.
- Contenedor ajeno «pg-compartido»: la simulación avisa y Aplicar se detiene. Quitado: PostgreSQL instalado, 2 contraseñas traídas a la bóveda e iguales a las del servidor, ninguna en los registros, simulación final 0 cambios. Con la bóveda cerrada, Aplicar la pide.
- Cambio de puerto 22 → 2200: escucha en 2200, el 22 deja de responder, la sesión abierta sigue; una sola regla de iptables; relanzar = 0 cambios.
- `sshd -t` rechazando (opción inválida en otro fichero): configuración intacta y SSH sin reiniciar.
- Fallos encontrados al probar y arreglados: el `instalar.sh` exportado se paraba con `set -u` si no había `SSH_CLIENT` (al lanzarlo con sudo); `docker inspect` de un contenedor inexistente imprime `[]` y se tomaba como existente; el aviso en bucle salía como «All items completed»; PostgreSQL fallaba al previsualizar si su carpeta aún no existía (fallo anterior).
- Interfaz comprobada con Chrome sin ventana sobre la demo: orden (SSH tras el Cortafuegos), puertos al marcar/cambiar/desmarcar, recuadro de contraseñas, sin errores de JavaScript.

### 2026-11-20 · 0.8.1 — Colores de estado de los módulos y aviso al quitar uno instalado
- Lista de módulos del editor: **verde** = instalado en el servidor por este proyecto; **azul** = marcado, se instalará al aplicar; **ámbar** = lo necesita otro módulo marcado; borde verde discontinuo sin marcar = sigue instalado pero el proyecto ya no lo gestiona. Leyenda arriba de la lista. Colores fijos nuevos `--info` y `--warning` (con versión para temas oscuros).
- Nuevo `Project.installedModules`: lo rellena una aplicación correcta (o una simulación sin nada pendiente) y solo crece. Los proyectos aplicados antes y sin cambios desde entonces se rellenan al abrir.
- **Quitar un módulo del proyecto NO lo desinstala del servidor** (Ansible solo ejecuta lo marcado). Al desmarcar uno instalado, la app lo explica y pide confirmar. Desinstalar queda como posible mejora (cada módulo necesitaría su rol de desinstalación).

## 2026-11-20 · 0.9.0 · Desinstalar módulos del servidor

- Un módulo se puede desinstalar si su rol trae `tasks/uninstall.yml`. En `module.yaml`: `uninstall_warning` (qué pasa), `uninstall_data` (qué datos se borran si se marca «Borrar también los datos») y `no_uninstall` (por qué no se puede).
- **Al desmarcar un módulo instalado**: «Solo quitar del proyecto» (sigue instalado; borde discontinuo con botón «Desinstalar del servidor…») o «Desinstalar del servidor». Para desinstalar hay que escribir DESINSTALAR; casilla «Borrar también los datos» si el módulo tiene datos.
- Reglas (backend, `app_uninstall.go`): solo lo instalado por el proyecto; no si otro módulo instalado o marcado depende de él (Docker con PostgreSQL/Coolify encima); Sistema base nunca; «SSH seguro» solo con el puerto 22 (también lo comprueba el rol). El SSH en sí nunca se toca: desinstalar «SSH seguro» solo quita el endurecimiento y fail2ban.
- Se desinstala con los valores con los que se instaló (`Project.installedValues`), aunque ya esté desmarcado. Playbook propio (orden inverso, `include_role … tasks_from: uninstall`, sin preflight). Al terminar bien: fuera del proyecto y de lo instalado, sin contar como cambio; la desinstalación no cuenta como «aplicado». Las contraseñas de la bóveda se sincronizan con lo que queda en el servidor.
- Qué hace cada uno:
  - **Cortafuegos**: quita las reglas con etiqueta draupnode/draupnode-coolify salvo el 22 y el puerto actual del SSH; iptables sigue instalado.
  - **Docker**: para y purga los paquetes y su repositorio. Datos: vacía `/var/lib/docker` y `/var/lib/containerd` (no borra la carpeta: puede ser un punto de montaje).
  - **Coolify**: quita sus contenedores. Datos: volúmenes, red, `/data/coolify` y su contraseña de administrador. Sin datos, reinstalar lo deja como estaba (ahora «instalado» = existe el contenedor `coolify`, no la carpeta).
  - **PostgreSQL**: `docker compose down`. Datos: `-v`, su carpeta y sus contraseñas. Sin datos, reinstalar recupera las bases y las mismas contraseñas.
  - **SSH seguro**: quita `01-draupnode.conf` (con `sshd -t`), recarga, comprueba el 22 y desinstala fail2ban.
- `docker inspect --type container` en todas las comprobaciones (sin él, la red «coolify» contaba como contenedor).
- **Probado** en un Ubuntu 24.04 limpio y desechable con la app por dentro: instalar todo (Cortafuegos, SSH, Docker, PostgreSQL, Coolify con administrador) → Docker bloqueado → PostgreSQL sin datos y reinstalado (la tabla de prueba y la contraseña siguen) → Coolify sin datos y reinstalado (responde) → PostgreSQL + Coolify borrando datos (no queda nada, ni en la bóveda) → SSH seguro (el SSH sigue respondiendo) → Cortafuegos (queda el 22) → Docker borrando datos (carpetas vacías) → simulación final 0 cambios. Diálogo probado en la demo (dos pasos, sin errores de JavaScript).
