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

## 2026-11-20 · 0.10.0 · Copias de seguridad con restic

Todo de código abierto (petición del usuario): restic (BSD-2) desde los repositorios de Ubuntu/Debian; destinos remotos por protocolos que se montan con software libre: SFTP (OpenSSH), rest-server (el de restic) y S3 compatible (MinIO, Garage, SeaweedFS).

- **Módulo «Copias de seguridad (restic)»** (`backups`, categoría 5 · Copias; va después de Docker/PostgreSQL/Coolify si están):
  - Repositorio en `{backups_dir}/<proyecto>/restic-repo` (por defecto `/srv/draupnode/copias`); contraseña generada en el servidor (`secretos/<proyecto>/restic`) y traída a la bóveda como las demás.
  - Script `/usr/local/sbin/draupnode-copia-<proyecto>` (`copia`, `snapshots`, `remoto`) + `draupnode-copia-<proyecto>.service/.timer` (hora elegida, `RandomizedDelaySec=10min`, `Persistent=true`). Nombres por proyecto: no choca con el `apps-backup` de los scripts antiguos (la nota avisa si lo encuentra).
  - Cada copia: `pg_dumpall` del contenedor de PostgreSQL elegido (si existe), base de datos + `.env` + claves SSH de Coolify (si está), carpeta de secretos del proyecto y las carpetas elegidas (las que no existen se avisan y se saltan); `forget --prune` con lo que se conserva (diarias/semanales/mensuales) y `restic check` opcional.
  - Destino remoto opcional con `restic copy`: SFTP (clave ed25519 generada en el servidor; la pública va a la bóveda y a la nota para autorizarla en el destino), rest-server (usuario + contraseña) o S3 (Access Key + Secret Key). La contraseña/Secret Key es la primera variable `type: secret` de un módulo incluido. Si el destino no estaba listo al aplicar, la copia crea el repositorio remoto en cuanto puede.
  - Primera copia al aplicar (opcional). Desinstalación: quita script y temporizador; con «borrar datos», el repositorio local y su contraseña (el remoto nunca se toca).
- **Recuadro «Copias de seguridad»** en el proyecto (si el módulo está instalado): «Hacer copia ahora» (enseña lo que hizo), «Ver copias» / «Ver copias remotas» (fecha, qué, rutas, tamaño), «Traer copias al equipo»: elige carpeta (por defecto `~/Draupnode-copias/<proyecto>`), descarga por la misma conexión SSH solo los ficheros que faltan (los de restic no cambian) con barra de progreso, borra los que ya no están en el servidor, guarda `restic-password` y un `LEEME.txt` con cómo restaurar; carpeta 700, ficheros 600. Recuerda dónde y cuándo se trajeron.
- `runner.Exec` (orden como root sin terminal, salida binaria) y `connectSudo` separado de `launch`; en la interfaz, `lib/connect.ts` (`withConnection`) pide contraseña/huella/sudo/bóveda para cualquier llamada.
- **Arreglos** que salieron al probar: el módulo Docker escribía el almacenamiento clásico pero no reiniciaba Docker hasta el final, así que las imágenes de los módulos siguientes se bajaban con el anterior (ahora `flush_handlers` justo después); test que impide `{#` en plantillas (en Jinja abre un comentario; rompía `${#array[@]}` de bash).
- **Probado** con la app por dentro en un Ubuntu 24.04 limpio y desechable + otro Ubuntu como destino SFTP + rest-server oficial con usuario + SeaweedFS como S3 con credenciales:
  - SFTP: al aplicar, aviso de la clave a autorizar; autorizada, «Hacer copia ahora» creó el repositorio remoto (4 copias en el servidor y 4 en el destino).
  - Traer al equipo: 15 ficheros; con el restic de este equipo, 4 copias, `restic check` sin errores y el volcado de PostgreSQL restaurado contiene el dato de prueba; la segunda vez, 0 ficheros nuevos; carpeta 700 con LEEME.
  - rest-server y S3: copias en el destino; la contraseña no aparece en ningún registro; con una clave S3 errónea falla (la autenticación es real).
  - Dos proyectos en el mismo servidor con su temporizador cada uno; desinstalar las copias de uno (borrando datos) no toca las del otro.
  - Interfaz comprobada en la demo (copia ahora, lista, traer con progreso; sin errores de JavaScript).

## 2026-11-20 · 0.11.0 · Página de proyecto con tarjetas, asistente al aplicar y página de cada módulo

Petición del usuario: configurar bajando por una página larga era tedioso y los campos no se veían claros.

- **Página del proyecto**: arriba, siempre, la ruta «Servidor (usuario@host) › Proyecto [› Módulo]» (cada parte lleva atrás). Debajo:
  - «Instalado en <servidor>»: tarjetas de los módulos instalados por el proyecto (verde; borde discontinuo si ya no lo gestiona). Pulsar una abre su página.
  - «Añadir módulos»: catálogo en tarjetas por categoría. Pulsar marca/desmarca (azul = se instalará; ámbar = la necesita otro; candado = no compatible). Sin formularios.
  - Barra de acciones fija: «N módulos para instalar: …» · Exportar · Previsualizar · «Configurar y aplicar…» (o «Aplicar cambios» si solo cambió configuración).
- **Asistente al aplicar** (`ApplyWizard`): una ventana por módulo nuevo con opciones, con pasos numerados (en rojo si tienen errores), Anterior/Siguiente (no deja pasar con errores) y un resumen final («Se instalará, en este orden», configuraciones cambiadas, avisos) con «Previsualizar» y «Finalizar y aplicar». Arriba, servidor › proyecto.
- **Página de un módulo** (`ModuleDetail`): estado («Instalado · aplicado hace…» / fuera del proyecto / se instalará), descripción y «Cómo funciona»; lo propio de cada uno (copias: el recuadro de copias; Coolify: abrir su panel; sus contraseñas, filtradas por módulo); su configuración con «Cambios sin aplicar» + «Aplicar cambios»; abajo «Quitar del proyecto» / «Volver al proyecto» (con los valores con los que se instaló) y «Desinstalar…».
- **Formularios más claros** (`ModuleForm`): una fila por opción, etiqueta en negrita y explicación a la izquierda, control a la derecha, con borde más marcado; sí/no como interruptor; en ventanas estrechas, en una columna.
- «¿Cambió la configuración de un instalado?» compara sin depender del orden de las claves (`sameValues`).
- La demo rellena con valores por defecto las opciones vacías de los datos de ejemplo. Capturas de la ayuda rehechas; textos de la ayuda de Proyectos actualizados.
- Ya no hay ventanas plegables en el editor (`SetProjectCollapsed` queda sin uso en la interfaz).
- Comprobado en la demo con Chrome sin ventana: marcar dos módulos, asistente de 3 pasos, aplicar, abrir la página de un módulo instalado; sin errores de JavaScript.

### 2026-11-20 · 0.11.1 — Ordenar los módulos: «Instalados» / «Por categoría»
- Una sola sección «Módulos» con botón de orden: «Instalados» (primero los instalados en orden alfabético y debajo «Sin instalar», también alfabético) o «Por categoría» (todo agrupado, instalados y sin instalar juntos con sus colores). El botón muestra el modo al que cambia y se recuerda (localStorage). Pulsar un instalado abre su página; uno sin instalar lo marca.

## 2026-11-20 · 0.12.0 · Monitorización (métricas) y Registros (Loki)

Todo de código abierto: Prometheus, node-exporter, cAdvisor, postgres-exporter (Apache-2), **Grafana OSS** (`grafana/grafana-oss`, AGPL; no la imagen `grafana/grafana`, que es la edición Enterprise), Loki (AGPL) y **Grafana Alloy** (Apache-2; sustituye a Promtail, obsoleto).

- **Módulo «Monitorización (métricas)»** (`monitoring`, categoría 6 · Monitorización; depende de Docker, va después de PostgreSQL): compose `draupnode-monitor` en `/srv/draupnode/monitor` con `dn-prometheus`, `dn-node-exporter`, `dn-cadvisor` (opcional), `dn-postgres-exporter` (si hay un PostgreSQL de este proyecto: usa su contraseña de superusuario) y `dn-grafana`. Grafana y Prometheus solo en 127.0.0.1 (puertos 3000 y 19090, configurables); nunca en el Cortafuegos. Contraseña de admin generada en el servidor → bóveda («Acceso a Grafana»). Paneles «Recursos» y «PostgreSQL» reaprovechados de los scripts antiguos, **sin los nombres reales de las bases** (filtro genérico). Telemetría de Grafana desactivada. Avisa si encuentra la monitorización antigua (`monitoring-*`) y no la toca.
- **Módulo «Registros (Loki)»** (`logs`, depende de la Monitorización): compose `draupnode-logs` con `dn-loki` (retención configurable, compactor) y `dn-alloy` (salida de cada contenedor por la API de Docker → `job="contenedor"`, `container`, `app` = proyecto de compose; y journald → `job="sistema"`, `unit`). Añade la fuente Loki y el panel «Registros de los contenedores» a Grafana (filtro de apps leído de Loki, sin nombres fijos; fila nueva de journald; quitada una fila que era de una app concreta de los scripts antiguos).
- Desinstalación de los dos (la Monitorización no se puede quitar mientras estén los Registros).
- **En la app**: túnel SSH por proyecto (`app_monitor.go`: puerto local aleatorio en 127.0.0.1 → 127.0.0.1:<puerto> del servidor, se reutiliza mientras la conexión viva, se cierra al salir). Página del módulo: «Abrir Grafana» (abre el navegador en el panel) y «Ver estado»: CPU, RAM, disco de «/», núcleos, carga, contenedores en marcha, tiempo encendido y si responde cada fuente; se refresca cada 30 s. En la página de Registros, «Abrir Grafana» va al panel de registros.
- Mejoras que salieron al probar: node-exporter monta «/» con `rslave` solo si es un montaje compartido (en contenedores no lo es y Docker lo rechazaba); `docker compose up --quiet-pull` en todos los módulos (si fallaba, el mensaje era el progreso de las descargas y no el error); disco sin datos se muestra «—» en vez de 0 %.
- **Probado** con la app por dentro en un Ubuntu 24.04 limpio y desechable (PostgreSQL + Monitorización + Registros): aplicar 0 fallos en 50 s; túnel a Grafana: 401 sin contraseña, 200 con la de la bóveda; paneles PostgreSQL, Recursos y Registros; fuentes Prometheus y Loki «OK»; 4 objetivos arriba; Loki con `job` contenedor y sistema; contraseña fuera de los registros; redirecciones de Grafana relativas (funcionan con el puerto local del túnel); desinstalación en orden (bloqueo correcto) sin dejar nada. Interfaz comprobada en la demo.
- Lista de programas del usuario anotada en PLAN.md con licencias y choques.

## 2026-11-20 · 0.13.0 · Restaurar copias desde la app

- **Volcados de PostgreSQL base a base**: la copia diaria ya no guarda un único `pg_dumpall`; guarda en una sola copia la carpeta `postgres-<contenedor>/` con `<base>.dump` por cada base (`pg_dump -Fc`, se puede restaurar una sola) y `usuarios-y-permisos.sql` (`pg_dumpall --globals-only`). Se prepara en `/var/tmp/draupnode-volcado-<proyecto>` y se borra al terminar. Las copias antiguas (con `.sql` único) se pueden seguir explorando y descargando.
- **Script de copias**: órdenes nuevas `ls`, `dump`, `restaurar` y `restaurar-bd`, con validación de cada argumento (id de copia, rutas absolutas sin `..`, nombres de base). Si el servidor tiene el script de una versión anterior, la app pide pulsar Aplicar para actualizarlo.
- **Ventana «Restaurar…»** (en cada copia de «Ver copias»):
  - Explorar la copia carpeta a carpeta, marcar ficheros o carpetas.
  - **Descargar a este equipo** (`restic dump --archive tar` por SSH → `copia-<id>/` en la carpeta elegida, 700/600; no toca el servidor).
  - **Restaurar en el servidor**: en una carpeta aparte (por defecto `/srv/draupnode/restaurado/<id>`) o en su sitio original escribiendo RESTAURAR.
  - **Restaurar base…** junto a cada `.dump`: en una base nueva (por defecto `<base>_restaurada_<fecha>`, con el dueño original; se niega si el nombre ya existe) o **sustituir la actual** escribiendo su nombre (corta conexiones, borra y crea de nuevo). Antes de tocar nada comprueba que la copia se puede abrir.
- LEEME de «Traer copias al equipo» actualizado con cómo sacar una base del nuevo formato.
- **Probado** en un Ubuntu 24.04 limpio y desechable con la app por dentro (PostgreSQL con «tienda» y «blog» + copias): base nueva con los 250 pedidos y el dueño original; nombre repetido rechazado; «tienda» rota (10 pedidos) y con una conexión abierta → sustituida con los 250 y la app vuelve a entrar; «blog» intacta; fichero modificado recuperado en carpeta aparte (sin tocar el original) y en su sitio; volcados descargados a este equipo (cabecera PGDMP, permisos 600); rutas con `..` y nombres con comillas rechazados antes de llegar al servidor. Ventana probada en la demo (sin errores de JavaScript).

### 2026-11-20 — Creador de Dockerfile (en curso: falta la pantalla)
- Petición del usuario: el menú «Editor» pasa a ser un asistente que genera Dockerfile, docker-compose.yml, .dockerignore y docker-entrypoint.sh para cualquier proyecto, para quien no sabe Docker.
- Hecho: paquete `internal/dockerize`. `Analyze(dir)` detecta Python (Django/Flask/FastAPI), Node (servidor, Next, web compilada Vite/React/Angular), Java (Maven/Gradle, Spring Boot), PHP (Laravel), Go y web estática; versión, arranque, puerto, bases (PostgreSQL/MariaDB/Redis) y variables (solo de .env.example; nunca lee .env). `Generate(spec)` produce los ficheros comentados en español, valida todo lo que entra en ellos y, si el proyecto ya tiene Dockerfile, guarda al lado (`Dockerfile.draupnode`…).
- Probado: tests de detección y generación; integración real con Docker (`DZ_DOCKER=1`): Django, Flask, Express, Go, PHP, estática, Spring Boot y Vite construyen, arrancan y responden; Django + PostgreSQL con el compose generado migra y responde. Con un proyecto Django real (solo lectura) sale casi igual que su Dockerfile hecho a mano.
- Falta: funciones de la app (elegir carpeta, analizar, generar, guardar, «Probar a construir») y la pantalla del asistente. → Hecho en la 0.14.0.

## 2026-11-21 · 0.14.0 · Pantalla «Docker» (creador de Dockerfile)

- El menú «Editor» (que estaba como «pronto») pasa a ser **Docker**: asistente de 5 pasos (Carpeta → Tipo y versión → Arranque → Servicios → Vista previa), con los pasos clicables una vez elegida la carpeta.
- `app_dockerize.go`: `DockerInfo` (versiones por lenguaje y si hay Docker en este equipo), `ChooseProjectDir`, `AnalyzeProject` (con lenguaje forzado: `dockerize.AnalyzeAs`), `DefaultDockerSpec`, `GenerateDocker` (vista previa, marca los que se sustituirían), `WriteDockerFiles` (vuelve a generar en Go —no se fía de la interfaz—, escritura atómica, entrypoint 755, se niega a sustituir sin permiso), `BuildDockerImage` (`docker build` en segundo plano → `draupnode-prueba/<nombre>:latest`, eventos «dockerbuild», mensajes claros si falta permiso o Docker está parado), `CancelDockerBuild`, `OpenProjectDir`.
- `Analyze` ahora marca «guardar al lado» (`.draupnode`) si el proyecto ya tiene Dockerfile o compose.
- Ayuda de la pantalla con dos capturas; `capturas.mjs` admite `CAPTURAS=docker,…` para rehacer solo algunas y falla si hay errores de JavaScript.
- **Probado**: test de la app (analizar, vista previa, guardar, negarse a sustituir, guardar al lado, lenguaje forzado, rechazo de órdenes con `;`); construcción real con Docker desde la app (`DZ_DOCKER=1`); recorrido completo en la demo con Chrome sin ventana, sin errores de JavaScript.

## 2026-11-21 · 0.15.0 · Destino de copias (guardar también en otro servidor)

- **Módulo «Destino de copias (rest-server)»** (`backup-target`, categoría 5 · Copias): rest-server 0.13 (de los autores de restic, BSD-2) en Docker con HTTPS, `--append-only` (desde el origen se pueden añadir copias pero no borrarlas ni cambiarlas) y `--private-repos` (cada proyecto de origen solo ve su carpeta). Usuarios en `.htpasswd` con huellas bcrypt; certificado y clave propios en `{carpeta}/tls`. Abre su puerto en el Cortafuegos (`firewall_ports_from`). Desinstalar quita el contenedor; «borrar datos» borra también las copias guardadas.
- **«Guardar también en otro servidor…»** en la página del módulo Copias (`CreateBackupTarget`, ventana `BackupTargetDialog`): eliges otro de tus servidores y Draupnode, sin tocar aún ningún servidor:
  - crea (o reutiliza, uno por servidor) el proyecto «Destino de copias · <servidor>» con Docker + Cortafuegos + rest-server; si otro proyecto de ese servidor ya tiene el Cortafuegos, le añade el puerto a ese (dos Cortafuegos se pisarían) y lo avisa;
  - genera AQUÍ un certificado propio (ECDSA, 20 años, para la IP o el nombre del servidor; la clave a la bóveda del destino) y una contraseña para el proyecto de origen (a su bóveda; al destino solo llega la huella bcrypt);
  - deja el módulo Copias del origen en `rest-server` con la URL, el usuario, el certificado y «el destino solo deja añadir».
  - Te dice el orden: aplicar primero el destino y después el origen. Con la bóveda cerrada lo pide antes de tocar nada. Rechaza el mismo servidor y los que se conectan por 127.0.0.1.
- **Módulo Copias**: variables nuevas `backups_remote_cacert` (certificado del destino, `--cacert`) y `backups_remote_append_only` (no intenta borrar copias viejas en el destino: allí se acumulan, hay que vigilar el disco).
- Al volver de la ventana, el editor recarga el proyecto (si no, el borrador viejo pisaba lo nuevo al guardarse solo).
- Demo: puede traer una bóveda ya creada; `capturas.mjs` admite datos por captura (`seed`) y la acción `type`. Captura y ayuda nuevas.
- **Probado** con dos Ubuntu 24.04 desechables (origen y destino) y la app por dentro: destino aplicado (0 fallos), origen aplicado, copia hecha y copiada al destino; desde el origen `restic forget --prune` en el destino NO borra nada; sin contraseña y con otro usuario → 401; sin el certificado propio restic se niega («certificate signed by unknown authority»). Test unitario de la configuración automática (huella = contraseña, certificado válido para la IP, reutilizar destino y certificado, no duplicar usuarios, bóveda cerrada).

## 2026-11-21 · 0.16.0 · Caddy y nginx (publicar apps en tu dominio con HTTPS)

Dos módulos que hacen lo mismo, para elegir (categoría 3 · Plataformas). No pueden ir juntos ni con Coolify (los tres usan 80/443); abren 80 y 443 en el Cortafuegos. «Sitios»: una línea por sitio, `dominio destino` (destino `127.0.0.1:PUERTO` = proxy a una app, o `/carpeta` = web estática). Antes de instalar comprueban que 80/443 están libres.

- **Caddy** (Apache-2, paquete del sistema): Caddyfile generado y **validado antes de ponerlo** (`caddy validate`; si falla, sigue la configuración anterior) y recarga sin cortar conexiones. HTTPS automático de Let's Encrypt (correo opcional); `.localhost` usa la CA interna de Caddy (pruebas). Opcional: compresión zstd/gzip y cabeceras de seguridad (HSTS, nosniff, SAMEORIGIN, Referrer-Policy, sin `Server`). Registros por sitio con rotación.
- **nginx** (BSD-2) + **certbot** (Apache-2): un fichero por sitio (`sites-available/draupnode-<dominio>.conf`; los del usuario no se tocan), proxy con WebSockets y cabeceras `X-Forwarded-*`, tamaño máximo de subida, `server_tokens off`. `nginx -t` antes de recargar y, si falla, vuelve a la configuración anterior. Quita la página de bienvenida y añade un servidor por defecto que **rechaza dominios desconocidos** (444) para que no acaben en uno de tus sitios. Con HTTPS, `certbot --nginx --redirect` por dominio; si el DNS aún no apunta, ese sitio se queda en http y la nota lo dice (no falla todo). No pisa el bloque HTTPS de certbot si el sitio no ha cambiado. Quitar un sitio de la lista lo quita del servidor.
- **Probado** en dos Ubuntu 24.04 desechables con la app por dentro: Caddy sirve proxy y estática por HTTPS con las cabeceras, un segundo Aplicar no cambia nada; nginx sirve proxy y estática, no enseña su versión, dominio desconocido → conexión cortada, quitar un sitio lo borra; desinstalar los dos (con datos) no deja nada. Sin probar: certificados reales de Let's Encrypt (hace falta un dominio que apunte al servidor).

## 2026-11-21 · 0.17.0 · WireGuard (tu VPN)

- **Módulo «WireGuard (VPN)»** (`wireguard`, categoría 1 · Sistema; GPL-2): interfaz `wg0` con `wg-quick@wg0`. «Dispositivos»: un nombre por línea; cada uno tiene su clave privada, su clave precompartida y su dirección (`.2`, `.3`…; el servidor es la `.1`). Las claves se generan **en el servidor** la primera vez (`/etc/draupnode/secretos/<proyecto>/.wireguard`, solo root) y la configuración de cada dispositivo (`wireguard_<nombre>.conf`) vuelve a la bóveda al aplicar.
- Opciones: puerto UDP (por defecto 51820), red /24 (comprueba que el servidor no la use ya), dirección pública (vacío = la de Draupnode), «Todo el tráfico por la VPN» (reenvío + NAT por la interfaz de salida; DNS opcional) o solo la red de la VPN.
- Abre su puerto UDP en iptables con su propia etiqueta (`draupnode-wireguard`; el Cortafuegos solo maneja TCP) y lo guarda con netfilter-persistent; si cambias el puerto, quita la regla vieja. Los cambios se aplican con `wg syncconf` (no corta a los conectados). Quitar un dispositivo de la lista borra sus claves y su acceso.
- **En la app**: panel «Dispositivos de la VPN» en la página del módulo: pide la contraseña de la bóveda y enseña cada configuración con su **código QR** (para la app WireGuard del móvil; siempre negro sobre blanco), «Guardar .conf» (ventana de guardar del sistema, permisos 600: `SaveTextFile`) y «Copiar». Se oculta sola a los 3 minutos. QR generado en la app con `qrcode-generator` (MIT).
- Desinstalar para la VPN, quita `wg0`, su regla UDP y su configuración; «borrar datos» borra también las claves (si no, al reinstalar los dispositivos siguen valiendo).
- **Probado** en dos Ubuntu 24.04 desechables con la app por dentro: servidor con dos dispositivos; el otro contenedor hace de portátil con la configuración que trajo la bóveda y llega al servidor por la VPN (ping 0 % de pérdida, handshake hecho); quitar el móvil lo quita de `wg0` y de los secretos sin cortar al portátil; desinstalar (con datos) no deja `wg0` ni la regla. Panel comprobado en la demo.

## 2026-11-21 · 0.18.0 · Alertas al móvil

- **Módulo «Alertas al móvil»** (`alerts`, categoría 6 · Monitorización; no necesita la Monitorización): script de Python del propio servidor (`/usr/local/sbin/draupnode-alertas-<proyecto>`) lanzado por un temporizador de systemd cada N minutos. Comprueba, según lo marcado: discos por encima del % (no cuenta los ficheros sueltos que montan los contenedores), memoria (dos comprobaciones seguidas), copias de Draupnode fallidas o con más de 36 h sin hacerse, contenedores reiniciándose sin parar / «unhealthy» / parados con error (no los parados a mano), servicios de systemd en «failed» y **otros servidores** (`dirección:puerto`, dos fallos seguidos).
- Avisa una vez al empezar un problema, lo recuerda cada N horas si sigue y avisa con «✓ Resuelto» cuando se arregla (estado en `/var/lib/draupnode/alertas-<proyecto>`; si el aviso no sale, lo reintenta en la siguiente vuelta). Aviso diario opcional a las 9:00 («Todo bien…» o la lista de problemas), para notar si el servidor se ha caído.
- Canales (código abierto o gratuitos): **ntfy** (ntfy.sh o tu servidor; con token opcional; título en UTF-8 codificado RFC 2047, prioridad alta en los problemas) o **Telegram** (token del bot en la bóveda + número de chat). Con ntfy y el tema vacío, el servidor genera uno secreto de 28 caracteres que vuelve a la bóveda.
- **En la app** (página del módulo): «Enviar aviso de prueba», «Qué ve ahora» (`AlertsRun`) y «Suscribirse en el móvil» (pide la contraseña de la bóveda y enseña la dirección del tema con su QR).
- **Probado** en dos Ubuntu 24.04 desechables con la app por dentro y un ntfy falso en el otro servidor: aviso de prueba, disco por encima del umbral (un ext4 de 40 MB montado para la prueba) y servidor que no responde llegan con su tema secreto; una tercera comprobación no repite; al arreglarlo llegan los dos «Resuelto»; «Qué ve ahora» → «Sin problemas.»; desinstalar quita temporizadores y script. Sin probar: Telegram y ntfy.sh de verdad (la prueba no manda nada fuera).

## 2026-11-21 · 0.18.1 · Destino de copias: puerto al azar

- Petición del usuario: el puerto del destino ya no es el 8000 fijo. La ventana propone uno al azar entre 20000 y 60999, lo enseña y deja cambiarlo (o pedir «Otro»). Si el servidor ya es destino, se usa su puerto y se dice cuál es. Sin puerto, el backend también elige uno al azar (`RandomTargetPort`).

## 2026-11-21 · 0.19.0 · Destino de copias: rotación

- Petición del usuario: que en el destino las copias viejas se borren solas pasados X días, con opciones. Nuevas opciones del módulo «Destino de copias»: **Borrar las copias viejas** (sí por defecto), **conservar los últimos N días** (30), **una al mes durante N meses** (12) y la **hora** (05:30, lejos de la de las copias).
- La hace el propio destino (temporizador `draupnode-rotar-<proyecto>`, `restic forget --prune --group-by '' --keep-within Nd --keep-within-monthly Mm --retry-lock 2h`). Necesita la contraseña de las copias de cada origen: Draupnode se la da al Aplicar el destino (variable nueva de tipo «la rellena Draupnode», `managed`, que no sale en los formularios ni se pide en el instalar.sh exportado), sacándola de la bóveda, donde llega al aplicar el origen. Se guarda en `/etc/draupnode/secretos/<proyecto>/.rotacion/<origen>` (solo root). Si un origen aún no la tiene, la nota de Aplicar lo dice («aplica su proyecto y vuelve a aplicar este»). Con la rotación desactivada la contraseña no sale de este equipo y en el destino no se borra nada.
- Dos detalles de restic que salieron al probar: `--keep-monthly 12` guarda los últimos 12 meses *que tienen copias* (aunque sean de hace años) → se usa `--keep-within-monthly`; y sin `--group-by ''` cada grupo de rutas cuenta sus días por separado.
- **Probado** con dos Ubuntu desechables: destino → origen → destino otra vez (se activa la rotación); una copia «de 2020» añadida desde el origen se borra al rotar y las de hoy se quedan; sigue sin poderse borrar desde el origen.

## 2026-11-21 · 0.19.1 · Destino de copias: «Aplicar los dos ahora»

- Petición del usuario: dar la opción de aplicar los dos proyectos a la vez. Al terminar «Preparar», la ventana ofrece «Lo haré yo» (va al proyecto destino) o **«Aplicar los dos ahora»**: aplica el destino, después el origen y, si la rotación está activada, otra vez el destino (para darle la contraseña de las copias que acaba de traer el origen). Enseña cada paso con lo que está haciendo; si uno falla, se para y ofrece ir al proyecto. Pide lo que haga falta de cada servidor (frase de la clave, huella…) como al aplicar a mano.
- Probado en la demo (los tres pasos y el aviso final, sin errores de JavaScript); captura nueva en la ayuda.

## 2026-11-21 · 0.19.2 · Aviso del cortafuegos del proveedor de nube

- Petición del usuario: lo que no puede hacer Draupnode (abrir puertos en el cortafuegos de la nube), que lo avise para que lo haga el usuario.
- Al probar la conexión se detecta el proveedor por los datos DMI (`cloud=` en los datos del servidor: Oracle, AWS, Google, Azure, Hetzner, DigitalOcean, OVH, Scaleway, Linode, Vultr).
- Al revisar o aplicar un proyecto en una nube conocida, un aviso dice qué puertos abrir allí (los TCP del Cortafuegos y de los módulos, sin el 22, y los UDP de los módulos con `udp_ports_from` nuevo en module.yaml, como WireGuard) y **dónde** se hace en ese proveedor (p. ej. Oracle: Security List de la VCN, con la ruta de menús).
- La página de WireGuard y la ventana del Destino de copias lo dicen siempre (con el proveedor si se conoce); también las notas al aplicar de los dos módulos.

## 2026-11-21 · 0.20.0 · «Docker Creator» y nginx delante de la app

- Petición del usuario: el menú «Docker» se llama ahora **Docker Creator** (menú, título y ayuda).
- Petición del usuario: en el paso «Servicios», **«Poner nginx delante»** (dominio y puerto normal). Añade al compose un servicio `web` con `nginx:1.27-alpine` que escucha en el puerto 80 (o el elegido) para el dominio indicado y reenvía por dentro al puerto de la app, que deja de publicarse (`expose`). Genera `nginx.conf` (o `nginx.draupnode.conf` si se guarda al lado): cabeceras `X-Forwarded-*`, WebSockets, tamaño máximo de subida, `server_tokens off` y, con dominio, un servidor por defecto que rechaza otros nombres (444). Sin dominio responde a cualquiera. Para HTTPS se recomienda el módulo Caddy/nginx de Draupnode o Coolify.
- **Probado** con Docker de verdad (`DZ_DOCKER=1`): una app Flask con nginx delante responde por el dominio en el puerto de nginx (con la IP del cliente en `X-Forwarded-For`), otro dominio se rechaza y la app no tiene puerto publicado. Tests unitarios del compose y del nginx.conf. Pantalla comprobada en la demo.

## 2026-11-21 · 0.21.0 · Docker Creator: «Probar en el servidor de pruebas»

- Petición del usuario: un botón para probar lo generado en el servidor de pruebas, creándolo si no existe.
- `DockerLabTest` (eventos «dockerlab», cancelable): comprueba Docker en este equipo → crea/arranca el servidor de pruebas si hace falta y lo da de alta → instala Docker dentro si le falta (`docker.io` + `docker-compose-v2`) → sube la carpeta en un tar por SSH a `/srv/draupnode/pruebas-docker/<nombre>` (sin `.git`, `node_modules`, `.venv`, cachés…; máximo 1 GB; si no hay `.env`, uno de prueba desde `.env.example` con `DB_PASSWORD` al azar si el compose la exige; el `.env` del proyecto, si existe, sí se sube: el servidor de pruebas está en este mismo equipo) → `docker compose -p dnp-<nombre> up -d --build` → espera hasta 3 min a que responda (con el dominio de nginx si lo hay) → túnel SSH para «Abrir en el navegador». Si falla enseña el estado y los últimos registros. `DockerLabStop` («Parar la prueba») baja los contenedores con sus volúmenes e imagen y borra la carpeta.
- Con nginx y dominio, la copia de la prueba responde también a localhost/127.0.0.1 (para poder verla por el túnel); los ficheros del proyecto no se tocan.
- **Probado** con el servidor de pruebas real de este equipo (con una copia de su configuración): app Flask con nginx delante y dominio → construida, responde por el dominio, el túnel llega a la app; `node_modules` no se sube; «Parar» no deja contenedores ni carpeta. El servidor de pruebas se dejó parado como estaba.

## 2026-11-21 · 0.22.0 · Copias en este equipo: aviso o descarga al abrir la app

- Idea aprobada por el usuario. Por proyecto con el módulo Copias instalado, en su página («Traer copias al equipo»): «Al abrir Draupnode, si las de este equipo tienen más de N días: avisarme / traerlas solas / no hacer nada». Por defecto: avisar a los 7 días (también si nunca se trajeron). Se guarda en `Project.backupsAuto` (`SetBackupsAuto`; el editor no lo pisa al guardarse solo).
- Al abrir la app (`BackupsDue` + aviso arriba de todas las pantallas): «Copias de X: las de este equipo son de hace N días / nunca las has traído» con «Traer ahora» y ocultar. Las marcadas como «traerlas solas» se descargan en segundo plano a su carpeta de siempre, con el progreso en el aviso, **sin preguntar nada**: si hiciera falta una contraseña (frase de la clave, sudo…), se quedan como aviso.
- Probado: test (umbral, nunca traídas, modo, que el editor no pise la opción, «no hacer nada») y demo (un proyecto avisado y otro traído solo, sin errores de JavaScript).

## 2026-11-21 · 0.23.0 · Módulo «App desde Git (Docker Compose)»

- Despliega una app desde su repositorio con su `docker-compose.yml` (por ejemplo, el de Docker Creator) en `/srv/draupnode/apps/<nombre>`, con `docker compose -p dn-<nombre> up -d --build`. Al volver a aplicar trae lo último de la rama (`fetch` + `reset --hard`) y reconstruye.
- Repositorio privado (dirección `git@…`): genera una **deploy key** en el servidor que llega a «Contraseñas del proyecto»; si aún no está añadida, el Aplicar falla enseguida diciendo cuál añadir (ssh en `BatchMode`, sin quedarse esperando una contraseña; se encontró al probar) y con límite de tiempo.
- `.env`: variables normales (`CLAVE=valor`), **generadas en el servidor** una vez (SECRET_KEY, DB_PASSWORD… → bóveda) y secretas con valor del usuario (en la bóveda). Comprueba que responde en su puerto.
- **Dominio automático** (`proxy_site` nuevo en module.yaml, para este y los futuros módulos de apps): si la app tiene dominio y el proyecto tiene Caddy o nginx, se añade sola la línea `dominio 127.0.0.1:puerto` a sus «Sitios» (sin duplicar; avisa si el dominio ya apunta a otro sitio); sin Caddy ni nginx, avisa de que falta.
- Opcional: abrir un puerto a internet (va al Cortafuegos).
- **Probado** en dos Ubuntu desechables: repositorio privado por SSH en el otro servidor → primer Aplicar pide la deploy key → añadida → la app responde por `https://tienda.localhost` a través de Caddy (sitio añadido solo) con el `.env` (valor normal + SECRET_KEY de 40 generada); un cambio en el repositorio llega al volver a aplicar; desinstalar con datos no deja contenedores ni carpeta. Test unitario del sitio automático.

## 2026-11-21 · 0.24.0 · MariaDB compartido (y copias de MariaDB y de las apps)

- **Módulo «MariaDB compartido»** (`mariadb`, GPL-2; versiones LTS 11.4 y 10.11): como el PostgreSQL compartido. Contenedor `mariadb-compartido` en la red Docker `apps` (sin puertos publicados), una base y un usuario por app con contraseñas generadas en el servidor (→ bóveda). La contraseña nunca va en la línea de órdenes (`MYSQL_PWD` por entorno). Puede ir junto al PostgreSQL.
- **Módulo Copias**: «Volcar MariaDB» (una base por fichero `.sql`, con `mariadb-dump --single-transaction --routines --triggers`, en `mariadb-<contenedor>/`) y «Copiar las apps de Draupnode» (`/srv/draupnode/apps`: código, `.env` y datos de las apps instaladas con Draupnode).
- **Probado** en un Ubuntu desechable: base `tienda` creada; su usuario entra con la contraseña de la bóveda y crea/lee una tabla; la copia diaria incluye el volcado de MariaDB; desinstalar con datos no deja nada.

## 2026-11-21 · 0.25.0 · Apps: «Abrir» por túnel SSH y Vaultwarden

- Base común de los módulos de apps (categoría 7 · Apps, generados con el mismo patrón): Docker con datos en `/srv/draupnode/apps/<app>` (entran en las copias), puerto solo en `127.0.0.1` (opcional: abrir uno a internet, al Cortafuegos), dominio automático en Caddy/nginx (`proxy_site`), «Actualizar al aplicar» (`pull_policy: always`), comprobación de que responde y desinstalar con o sin datos.
- **«Abrir (túnel SSH)»** en la página de cualquier app instalada (`OpenAppTunnel`): la abre en el navegador de este equipo sin publicarla; y «https://dominio» si tiene.
- **Vaultwarden** (AGPL-3.0, compatible con Bitwarden): registro abierto/cerrado, token de /admin generado en el servidor (→ bóveda), `DOMAIN` con el dominio.
- **Probado** (junto con Navidrome, Jellyfin y Syncthing) en un Ubuntu desechable: las cuatro responden por el túnel; Vaultwarden también por https con Caddy (sitio añadido solo); desinstalar con datos no deja contenedores ni carpetas.

## 2026-11-21 · 0.26.0 · Navidrome (música)

- **Navidrome** (GPL-3.0): tu música desde el navegador o apps Subsonic; lee la carpeta elegida (por defecto `/srv/musica`, solo lectura) y la revisa cada hora. El primero que entra es el administrador. Probado (ver 0.25.0).

## 2026-11-21 · 0.27.0 · Jellyfin (películas y series)

- **Jellyfin** (GPL-2.0): configuración y caché en su carpeta, vídeos de la carpeta elegida (por defecto `/srv/media`, solo lectura), `JellyfinPublishedServerUrl` con el dominio. Pide 1,5 GB de RAM. Probado (ver 0.25.0).

## 2026-11-21 · 0.28.0 · Syncthing (sincronizar carpetas)

- **Syncthing** (MPL-2.0): panel solo local (`Abrir` o VPN), sincronización por 22000/TCP y UDP (TCP al Cortafuegos; recuerda la nube), datos con el usuario 1000. Probado (ver 0.25.0).

## 2026-11-21 · 0.29.0 · Forgejo (tu GitHub)

- **Forgejo 15** (GPL-3.0) con SQLite, instalación cerrada (`INSTALL_LOCK`), registro cerrado salvo que se abra, `ROOT_URL` con el dominio, Git por SSH en su propio puerto (2222 por defecto, al Cortafuegos). Draupnode crea el usuario **«administrador»** («admin» es un nombre reservado en Forgejo: salió al probar) con contraseña generada en el servidor (→ bóveda, con el usuario).
- **Probado** en un Ubuntu desechable: la API responde 200 con el administrador generado; desinstalar con datos no deja nada.

## 2026-11-21 · 0.30.0 · Paperless-ngx (documentos)

- **Paperless-ngx** (GPL-3.0) con su PostgreSQL 16 y Redis propios (en su carpeta, entran en las copias), OCR en el idioma elegido (español+inglés por defecto), usuario «admin» con contraseña generada (y clave secreta y contraseña de la base, ocultas), carpeta `consume` que se importa sola, `PAPERLESS_URL` con el dominio. Pide 2 GB de RAM; la primera vez tarda en arrancar.
- **Probado** en un Ubuntu desechable: `/api/token/` da token con el admin generado, responde por el túnel; desinstalar con datos no deja nada.

## 2026-11-21 · 0.31.0 · Cockpit (panel del servidor)

- **Cockpit** (LGPL-2.1) del sistema, escuchando **solo en 127.0.0.1 y en la VPN** (socket de systemd); se abre con «Abrir» (túnel), la VPN o dominio (con `Origins` y `X-Forwarded-Proto` para Caddy/nginx). Usuario propio (por defecto «panel») con contraseña generada en el servidor (→ bóveda) y sudo opcional.
- Salió al probar: crear la carpeta del ajuste del socket; la contraseña se pone con `chpasswd` (`password_hash` necesita passlib, que no está); si un `daemon-reload` deja el socket sin escuchar, se reinicia; al desinstalar se cierran las sesiones del usuario antes de borrarlo.
- **Probado** en un Ubuntu desechable: escucha en 127.0.0.1 y 10.8.0.1 (nunca en 0.0.0.0), entra con el usuario generado, responde por el túnel; desinstalar con datos no deja nada.

## 2026-11-21 · 0.32.0 · Samba (carpetas compartidas)

- **Samba** (GPL-3) del sistema: carpetas «nombre /ruta», un usuario (sin SSH) con contraseña generada (→ bóveda), SMB2 o más, cifrado si el cliente puede, sin NetBIOS ni impresoras. Escucha **solo en el servidor, la VPN y las interfaces de red local indicadas**; no abre nada en el Cortafuegos. La VPN se le da por su IP (por el nombre `wg0` Samba no escucha: es punto a punto; salió al probar). `testparm` antes de poner la configuración.
- **Probado**: el usuario sube y lista ficheros; otro usuario → LOGON_FAILURE; escucha en 10.8.0.1 y 127.0.0.1.

## 2026-11-21 · 0.33.0 · AdGuard Home (sin anuncios en la VPN)

- **AdGuard Home** (GPL-3) en Docker con red del servidor: DNS **solo en la IP de la VPN** (nunca un DNS abierto a internet), panel solo en 127.0.0.1 («Abrir», VPN o dominio). Se configura solo por su API de instalación (usuario admin con contraseña generada → bóveda) con DNS cifrado hacia fuera (Quad9 y Cloudflare por DoH).
- Con AdGuard en el proyecto, **la VPN lo usa como DNS** (`wireguard_dns` se pone solo a la .1 si estaba vacío). El DNS de WireGuard ahora se aplica también sin «Todo el tráfico».
- Salió al probar: la API de AdGuard rechaza el puerto como texto (se manda el JSON ya formado).
- **Probado**: DNS en 10.8.0.1:53 y en ningún otro sitio; doubleclick.net → 0.0.0.0, example.com se resuelve; el panel deja entrar con el usuario generado; la configuración del dispositivo lleva `DNS = 10.8.0.1`.

## 2026-11-21 · 0.34.0 · Immich (fotos y vídeos) y generador de módulos de apps

- **Immich v3** (AGPL-3.0) como su compose oficial: servidor, aprendizaje automático, Valkey 9 y su PostgreSQL con vectores (contraseña generada en el servidor); fotos en `/srv/draupnode/apps/immich/library`. Pide 4 GB de RAM y la primera vez descarga unos 3 GB. El primero que entra es el administrador.
- Los módulos de apps en Docker se generan con `herramientas/apps/gen.py` desde sus fichas (`apps.py`), ahora en el repositorio (LEEME en esa carpeta). Todos reintentan la descarga de imágenes (3 veces, cada 30 s): al probar, el registro de GitHub contestó «demasiadas peticiones».
- PLAN.md: tabla de programas al día (hechos y los que se dejan fuera a propósito: Pi-hole, ufw, Borg).
- **Probado** en un Ubuntu desechable (con las imágenes cargadas desde este equipo, por el límite de descargas de ghcr.io en el contenedor): `/api/server/ping` → pong, alta del administrador e inicio de sesión con token; desinstalar con datos no deja nada.

## 2026-11-21 · 0.35.0 · Menú reordenado y Catálogo con enlaces y párrafos

Primer paso del rediseño pedido (ver PLAN.md, «Rediseño pedido por el usuario»).
- **Menú:** arriba Panel, Servidores y Proyectos; debajo, el grupo **«Utilidades»** con Docker Creator, Servidor de pruebas (antes «Pruebas») y Terminal; el **Catálogo abajo**, encima de Ayuda.
- **Enlaces** a la web oficial, la documentación y el código fuente de lo que instala cada módulo (campo nuevo `links` en module.yaml; el test exige que todos los incluidos los tengan). Se ven en la ficha del Catálogo y en la página del módulo dentro del proyecto. También en los módulos de apps generados (`herramientas/apps`).
- **Texto de los módulos en párrafos de verdad y a todo el ancho** (`ModuleText`): une las líneas que el fichero corta a mano, empieza párrafo tras una línea en blanco o al acabar una frase, y deja los ejemplos sangrados como líneas aparte en monoespaciada.
- El catálogo de la demo es ahora una copia completa de los módulos reales.

## 2026-11-21 · 0.36.0 · Recetas y servidores: el servidor es la pieza principal

Pasos 2, 3 y 4 del rediseño pedido (PLAN.md): «los proyectos son las recetas y los servidores la cocina».

- **Proyecto = receta** (`store.Recipe`): nombre, para qué es, módulos y opciones, **sin servidor**. Pantalla «Proyectos» = lista de recetas con en qué servidores están y su estado; editor de recetas (módulos por categoría, opciones por módulo, sin datos secretos: esos van en cada servidor), «Asociar a un servidor».
- **Despliegue** = la receta en un servidor: es el «proyecto» de antes (`store.Project`, con `recipeId`), así que aplicar, contraseñas, copias, apps, desinstalar… siguen igual. Puede tener **datos propios** (`overrides`: módulos añadidos o quitados y opciones cambiadas) que se calculan solos al guardar. Al cambiar la receta, sus servidores reciben el cambio (con «cambios sin aplicar») y conservan lo suyo. En la pantalla del proyecto de un servidor: de qué receta sale, «Igual que la receta» o qué tiene distinto, **«Llevar a la receta»** (y a los demás servidores), **«Volver a la receta»** y «Quitar del servidor» (no toca lo instalado).
- **Conversión automática** al abrir: cada proyecto de antes pasa a ser una receta con sus módulos y un despliegue en su servidor con el mismo id (sus contraseñas, registros y copias siguen siendo suyos). Formato de datos versión 2.
- **«Servidor de copias»** es ahora una receta más: «Guardar también en otro servidor…» la crea si no existe y la despliega en el servidor elegido.
- **Ficha del servidor** (al pulsar un servidor; antes llevaba a la lista de proyectos). Al abrirla se conecta por SSH y, **solo leyendo** (`internal/overview`, Python en el servidor), enseña:
  - CPU (medida al momento), carga, memoria y swap, discos y tiempo encendido;
  - avisos de contenedores caídos o reiniciándose y servicios con fallos (con su registro);
  - sus proyectos (estado, datos propios, «Abrir»), «Asociar» uno y «Crear un proyecto nuevo»;
  - **apps y direcciones**: las de Draupnode (con «Abrir» por túnel o su dominio), el **panel y las apps de Coolify con sus dominios** (leídos de su base de datos, sin token) y los **sitios de nginx y Caddy**, aunque no los instalara Draupnode;
  - **bases de datos** de cada PostgreSQL y MariaDB/MySQL en Docker y **lo que pesa cada una**;
  - **contenedores** con estado, CPU, memoria, puertos y de quién son (Draupnode, Coolify, compose), con su **registro**;
  - puertos abiertos a la red, registro del sistema y de SSH, y las contraseñas generadas de sus proyectos;
  - «Actualizar» y «Editar conexión».
  - Registros (`ServerLogs`): contenedor, servicio de systemd o todo el sistema, últimas 400 líneas; los nombres se validan.
- Navegación: Servidores → ficha → proyecto del servidor; la barra de estado, el panel y los avisos llevan a la ficha o al proyecto en su servidor.
- **Probado**: tests de recetas (desplegar, valores propios, cambio de receta que llega a todos sin pisar lo propio, llevar a la receta, volver a la receta, no borrar una receta en uso) y de la conversión de datos viejos. En un Ubuntu desechable: receta con PostgreSQL (dos bases) y nginx → asociada → aplicada; la ficha encuentra el PostgreSQL con sus bases y tamaños, un Coolify (su base, con dos apps y su panel), el sitio de nginx y un contenedor que se reinicia sin parar; registros de contenedor y de servicio; un nombre malicioso se rechaza. El destino de copias sigue funcionando como receta. Demo: ficha, proyecto en el servidor, editor de recetas y el resto de pantallas sin errores de JavaScript.

## 2026-11-21 · 0.36.1 · Ficha del servidor: lo que deja pasar el cortafuegos

- «Puertos abiertos a la red» solo mostraba lo que tiene un programa escuchando (`ss`), y confundía: con el
  cortafuegos abriendo 22/80/443 y nada en el 80/443, salía solo «22/tcp».
- Ahora la sección «Puertos» tiene dos partes:
  - **El cortafuegos deja pasar**: se lee con `iptables -S` (cadena INPUT y las de ufw; sin las reglas
    limitadas a un origen o a una interfaz, como las de la VPN). Los puertos abiertos sin nada escuchando
    salen atenuados y con una nota.
  - **Programas escuchando hacia fuera**: lo de antes, con aviso si algo escucha pero el cortafuegos no lo deja pasar.
  - Si no hay cortafuegos activo (política ACCEPT y sin DROP/REJECT), lo dice.
- Probado con reglas falsas de iptables (las del módulo Cortafuegos, una de la VPN y un rango multiport de ufw).

## 2026-11-21 · 0.36.2 · Errores a la vista en el proyecto; puertos de Docker

- El editor del proyecto solo decía «1 error» en la tarjeta del módulo y desactivaba los botones sin decir por qué
  (p. ej. «App desde Git» sin la dirección del repositorio, que es obligatoria). Ahora, bajo los botones, sale la
  lista: módulo · opción: qué le pasa, con «Corregir» que abre el módulo. «Previsualizar» y «Configurar y aplicar…»
  se desactivan igual que «Aplicar» mientras haya errores (antes fallaban al guardar).
- Ficha del servidor: los puertos que publica Docker (docker-proxy) no pasan por la cadena INPUT, así que se llega
  a ellos aunque el cortafuegos no los liste. Ya no se avisa de que «el cortafuegos no los deja pasar»: se avisa
  de que Docker se lo salta.

## 2026-11-21 · 0.37.0 · Avisos en su sitio y menú con servidores y proyectos

- **Avisos**: nueva entrada en el menú, encima de Catálogo, con el número de avisos. Junta las copias que hace
  tiempo (o nunca) que no se traen a este equipo y los proyectos cuya última aplicación falló, con «Traer ahora»,
  «Abrir» y ocultar hasta la próxima vez que se abra la app.
  - La franja «Copias de … nunca las has traído» ya no sale en todas las pantallas: solo en el Panel. En las demás,
    una campana arriba con el número lleva a «Avisos».
  - El estado de los avisos es compartido (`lib/alerts.svelte.ts`); se quita `BackupsDueBanner`.
- **Menú desplegable**: «Servidores» y «Proyectos» tienen una flecha que despliega la lista de servidores y de
  recetas para entrar directo en cada uno. Lo desplegado se recuerda en este equipo; el menú hace scroll si hay muchos.
- Capturas de la demo: `avisos` y `avisos-campana`.

## 2026-11-21 · 0.37.1 · Proyecto en un servidor: una sola fila y nombres más claros

- La cabecera del proyecto dentro de un servidor va en una sola fila: dónde estás (servidor › proyecto), si es
  igual o distinto del proyecto y los botones. Se quita la tarjeta aparte «Proyecto … en …», que repetía lo mismo.
- Nombres: «Editar la receta» → **«Editar proyecto»**; «Quitar del servidor» → **«Desasociar el proyecto del
  servidor»** (con su diálogo: deja claro que NO desinstala nada); «Llevar/Volver a la receta» → «Llevar/Volver al
  proyecto»; «Distinto/Igual que la receta» → «… del/que el proyecto».

## 2026-11-21 · 0.38.0 · «Proyectos» pasa a llamarse «Plantillas»

- Los conceptos, tal como se entienden mejor: una **plantilla** es lo que se quiere instalar (módulos y opciones),
  existe sin servidor y por sí sola no instala nada; se instala al **asociarla** a un servidor y pulsar **Aplicar**.
  Lo que se cambie dentro de un servidor es solo de ese servidor.
- Menú, títulos, botones, avisos, ayuda, textos de los módulos y mensajes del programa:
  - «Proyectos» → «Plantillas»; «Nuevo proyecto» → «Nueva plantilla»; en la ficha del servidor, «Plantillas aplicadas».
  - «Editar plantilla», «Llevar a la plantilla», «Volver a la plantilla», «Desasociar la plantilla del servidor»,
    «Igual que / Distinto de la plantilla».
  - Dentro de un módulo, «Quitar del proyecto» → «Dejar de gestionarlo» y «Volver al proyecto» → «Volver a
    gestionarlo» (no tienen que ver con la plantilla: Draupnode deja de gestionar o vuelve a gestionar ese módulo
    en ese servidor); su estado «Fuera del proyecto» → «Sin gestionar».
  - «Contraseñas del proyecto» → «Contraseñas»; los mensajes que hablaban de «este proyecto» hablan de «este servidor».
- «Proyecto» se queda solo en Docker Creator, donde es la carpeta de código de tu app.
- Por dentro (código, datos guardados) sigue llamándose Project/Recipe: no cambia nada de lo guardado.

## 2026-11-21 · 0.38.1 · Editor de plantillas: franja de guardar fija y módulos nuevos por revisar

- «Guardar» y «Eliminar» pasan a una franja fija abajo, siempre visible al bajar por la página. La franja se
  colorea con el color de acento si hay cambios sin guardar (o en rojo si hay opciones con errores) y dice qué falta.
- Al añadir un módulo con opciones, su sección se abre, se desplaza hasta ella y queda marcada «Nuevo: revisa sus
  opciones» (borde de color) hasta pulsar «Valores revisados» o guardar. La franja de abajo lista los que faltan,
  con enlace a cada uno. Recuerda que son valores predeterminados que se pueden retocar al aplicar en un servidor.
- Ayuda: paso «Guardar y revisar» con captura `plantilla-cambios`.

## 2026-11-21 · 0.39.0 · Copia de Draupnode y «Traer del servidor»

- **Copia de Draupnode** (Ajustes): todo lo de Draupnode vivía solo en este equipo. «Exportar copia…» lo guarda en
  un único fichero `.draupnode` cifrado con una contraseña propia (Argon2id + XChaCha20-Poly1305, con la cabecera
  como dato asociado): `draupnode.json`, la bóveda (tal cual, sigue abriéndose con su contraseña maestra),
  `known_hosts`, los módulos propios, las frases de paso del llavero del sistema y, si se marca, las claves SSH.
  - «Importar una copia…» la descifra, enseña lo que trae y, al confirmar, sustituye la configuración. Lo de antes
    se mueve a `antes-de-importar-<fecha>/`. Si la clave SSH ya está igual en su ruta original se usa; si no, se
    deja en `claves/<servidor>/` y el servidor apunta allí. Las frases de paso van al llavero; si no hay llavero,
    el servidor la pedirá al conectar. Sin reiniciar la app.
  - Aviso en «Avisos» si nunca se ha hecho la copia o tiene más de 30 días.
  - Paquete `internal/copia` con su test (ida y vuelta, contraseña mala, cabecera manipulada, rutas que salen de la
    copia) y test de exportar/importar entre dos instalaciones.
- **«Traer del servidor»** en Contraseñas: lee `/etc/draupnode/secretos/<slug>` y lo guarda en la bóveda sin tener
  que Aplicar (tras importar una copia, volver a asociar la plantilla…). Si en el servidor no hay carpeta, no borra
  nada. Probado contra un Ubuntu desechable.

## 2026-11-21 · 0.40.0 · Terminal SSH e historial de ejecuciones

- **Terminal** (Utilidades → Terminal, o «Terminal» en la ficha del servidor): consola SSH con xterm.js
  (`@xterm/xterm` 6.0.0 + `addon-fit`, MIT). Una pestaña por sesión (varias, también del mismo servidor); la
  pantalla se queda montada, así las sesiones siguen vivas al cambiar de pantalla; «Reconectar» si se corta.
  - Backend `app_terminal.go`: sesión con PTY `xterm-256color`, salida por el evento «term» en base64 (sin partir
    UTF-8), `TerminalInput/Resize/Close`, keepalive cada 30 s, se cierran todas al salir de la app. Usa la misma
    conexión que el resto (clave, contraseña guardada, huella). Probado contra un Ubuntu desechable (eco, tamaño de
    ventana con `stty size`, cierre con `exit`).
- **Historial de ejecuciones**: cada Previsualizar/Aplicar/Desinstalar deja junto a su registro un resumen
  (`<registro>.log.json`); se guardan los 60 últimos por plantilla y servidor. En la ficha del servidor (todas sus
  plantillas) y en cada plantilla dentro del servidor: fecha, tipo, resultado y duración; pulsando se ve el registro.
- Captura de la demo `terminal` (con una acción nueva `js` en `capturas.mjs`).

## 2026-11-21 · 0.41.0 · Editor de módulos

- **Utilidades → Editor de módulos** (también «Mis módulos» en el Catálogo): crea módulos propios partiendo de un
  ejemplo comentado (instala paquetes y pone un mensaje del día, con su desinstalación) o de una **copia de
  cualquier módulo incluido** (se renombran su id y el prefijo de sus variables; nombre «… (mi versión)»).
  - Editor CodeMirror 6 (`codemirror` 6.0.2, `@codemirror/lang-yaml`, `@codemirror/legacy-modes` para Jinja2 y
    shell; MIT) con los colores del tema, Ctrl+S para guardar, una pestaña por fichero, ficheros nuevos y borrar.
  - Al guardar se comprueba: sintaxis YAML de cada fichero y la validación del Catálogo (prefijo de variables,
    tipos, puertos…); en rojo lo que impide usarlo, en ámbar avisos (id distinto de la carpeta, sustituye a uno
    incluido). No se puede borrar un módulo que usa alguna plantilla.
  - Rutas confinadas a la carpeta del módulo (`module.yaml` y `role/…`), con test de rutas maliciosas.
  - Probado de verdad: el ejemplo se aplica y se desinstala en un Ubuntu desechable.
- Captura `modulos` y ayuda de la pantalla.

## 2026-11-21 · 0.42.0 · Adoptar lo que ya hay en un servidor

- **Ficha de la plantilla en el servidor**: al terminar bien Aplicar, el script deja
  `/etc/draupnode/plantillas/<slug>.json` (carpeta 700, fichero 600) con la plantilla, el nombre, la versión de
  Draupnode y los módulos con sus opciones **sin datos secretos**. Al desinstalar se actualiza, y se borra al
  quitar el último módulo.
- **Ficha del servidor → «Lo que ya hay en este servidor»** (el estado lee fichas, carpetas de secretos, apps y
  programas instalados):
  - Plantillas aplicadas con Draupnode que este no conoce (otro equipo, configuración perdida): **«Recuperar»**
    crea (o reutiliza) la plantilla y su despliegue con la misma carpeta de secretos, la marca como ya instalada
    sin aplicar nada y ofrece traer sus contraseñas.
  - Carpetas de secretos de antes de la 0.42 (sin ficha): se recuperan con los módulos que se deducen.
  - Programas instalados fuera de las plantillas (Docker, nginx, Caddy, Coolify, WireGuard, fail2ban, Cockpit,
    Samba, restic…), con lo que pasaría al añadir su módulo.
- Arreglado: «¿igual a la plantilla?» fallaba por dentro (puntero nulo) cuando el servidor era idéntico a ella.
- Probado de verdad: aplicar → ficha en el servidor → verla en el estado → recuperarla en otro Draupnode con sus
  valores → desinstalar y desaparece.

## 2026-11-21 · 0.43.0 · Distribución: instaladores, aviso de versión nueva y README

- **GitHub Actions** (`.github/workflows/`):
  - `release.yml`: al subir una etiqueta `vX.Y.Z` compila en Windows (instalador NSIS + `.zip`), macOS
    (`.dmg` universal, Intel y Apple Silicon) y Linux (`.deb` y `.tar.gz`) y crea la Release con ellos. A mano
    («Run workflow») solo compila y deja los ficheros como artefactos. Probado: Linux y macOS compilan y
    empaquetan; en Windows compila y faltaba NSIS en la máquina de GitHub (añadido con choco).
  - `pruebas.yml`: tests de Go y de tipos de la interfaz en cada push a `main` (pasan).
  - Los instaladores no están firmados (SmartScreen y Gatekeeper avisan la primera vez; el README dice cómo abrirlos).
- **Aviso de versión nueva**: al abrir, consulta de forma anónima la última Release en la API de GitHub
  (`User-Agent: draupnode`, sin datos del usuario, 8 s de límite) y, si hay una más nueva, sale en Avisos con
  «Descargar». Se puede desactivar en Ajustes → Datos de la aplicación. Test con un servidor HTTP falso.
- **README** reescrito: descargas por sistema, qué hace hoy la app, cómo publicar una versión, dónde guarda cada cosa.

## 2026-11-21 · 0.44.0 · Ficha que se actualiza sola y aviso de servidores caídos

- **Ficha del servidor → «Actualizar sola»** (No / 30 s / 1 min / 5 min, 1 min por defecto; se recuerda en este
  equipo): vuelve a leer el servidor sin pedir nada mientras la ficha está a la vista. Si hace falta una contraseña
  que no está guardada (o la bóveda está cerrada), lo dice junto a «Leído hace…» y espera a «Actualizar».
- **Servidores que no responden**: mientras Draupnode está abierto, cada 2 minutos comprueba (sin entrar, solo
  conectando al puerto SSH, `PingServers` en paralelo) todos los servidores. Tras 2 fallos seguidos sale en Avisos
  («no responde por SSH desde…», con «Ficha»); cuando vuelve, se quita solo y avisa. El servidor de pruebas no
  cuenta. Para enterarse con la app cerrada sigue estando el módulo Alertas («Vigilar otros servidores»).
- Test de `PingServers` (uno escuchando y otro cerrado) y captura `avisos-caido`.

## 2026-11-22 · 0.44.1 · Arreglos tras probar la 0.39–0.44

- **Terminal**: el botón «Reconectar» no se leía (borde sobre el fondo negro, letras del color del tema claro):
  ahora es un botón relleno con el color de acento.
- **Plantilla dentro de un servidor**: más espacio entre las tarjetas de módulos y «Historial de ejecuciones».
- **Ficha del servidor → «Lo que ya hay en este servidor»** se ve siempre. Si no hay nada que recuperar lo explica
  (el botón «Recuperar» solo sale cuando el servidor tiene plantillas que este Draupnode no conoce).
- **Ficha → Disco**: no salía nada en servidores cuya raíz es `overlay` (el servidor de pruebas, que es un contenedor,
  o algunos VPS). Ahora se descarta `overlay` salvo en `/`, y `/` va primero. En el servidor de pruebas el tamaño
  es el del disco del equipo, porque el contenedor lo comparte.

## 2026-11-22 · 0.45.0 · Panel nuevo: qué conviene mirar

El usuario no le veía utilidad al Panel (solo contaba cosas y repetía la lista de servidores). Ahora responde a
«¿va todo bien y qué tengo que mirar?»:

- **Contadores de verdad y clicables**: Servidores (cuántos responden ahora; si solo hay uno, abre su ficha),
  Plantillas (en uso en cuántos servidores, cuántas sin aplicar → Plantillas), Contenedores (en marcha / con
  problemas, de la última ficha de cada servidor → el servidor con problemas) y Avisos (→ Avisos).
- **Necesita atención**: los avisos, lo grave primero, como mucho 4 y «Ver los N avisos». Avisos nuevos (también
  en la pantalla Avisos, el menú y la campana), sacados de la última ficha leída: disco ≥ 85 % (grave ≥ 95 %),
  contenedores reiniciándose / muertos / no sanos, servicios caídos, copias que fallaron, sin hacer o con más de
  26 h; y plantillas asociadas sin aplicar o con cambios sin aplicar. Si no hay nada: «Todo en orden».
- **Una tarjeta por servidor**: responde o no (ping cada 2 min; el de pruebas parado no cuenta como caído), CPU,
  RAM y disco, contenedores, última copia, sus plantillas (pulsables, marcando las que tienen cambios), apps
  (Draupnode por túnel y Coolify por su URL), Grafana si tiene Monitorización, Terminal y Ficha.
- **Última ficha guardada en este equipo** (`fichas/<servidor>.json`, `LastOverviews`): el Panel la enseña al
  momento sin conectar («Leído hace…») y la vuelve a leer sola cada 5 min si la contraseña está guardada (si no,
  lo dice y ↻ la lee preguntando). Se borra al borrar el servidor.
- **Ficha del servidor → copias**: la lectura incluye las copias del módulo Copias (`draupnode-copia-*`):
  si la última fue bien y hace cuánto (hora real del servicio o, tras reiniciar, la del temporizador).
- **Actividad reciente**: las últimas 6 ejecuciones de todos los servidores (`RunHistory` con servidor vacío
  = todos; ahora lleva el nombre del servidor).
- Fuera: la barra de «%», «Última comprobación» y «Primeros pasos» (solo sale si no hay ningún servidor).
- Tests: `TestFichaGuardada` y el historial de todos los servidores. Capturas `panel` y `copias-aviso` rehechas.

## 2026-11-22 · 0.45.1 · Tarjetas de servidor clicables enteras

- Panel: toda la tarjeta de un servidor abre su ficha (como los contadores), no solo el nombre. Sus botones
  (apps, plantillas, Grafana, Terminal, ↻) siguen haciendo lo suyo. También con el teclado (Tab + Intro).

## 2026-11-22 · 0.46.0 · Ficha del servidor por pestañas

La ficha era una sola página de ~2.600 px con 10 bloques (las copias sin sitio propio, las contraseñas repetidas
al final con el mismo párrafo, Disco descuadrado, barra de arriba con demasiados botones). Ahora:

- **Cabecera fija**: punto y «responde · N ms» (o «no responde» / «parado» si es el de pruebas), usuario@IP, sistema,
  nombre de la máquina y tiempo encendido; «Leído hace…», «Actualizar», «Terminal» y «⋯» (Editar conexión,
  Actualizar sola).
- **Pestañas** (se recuerda la última; número rojo/ámbar si hay algo que mirar, gris = cuántos hay):
  - **Resumen**: CPU, memoria, disco (`/` grande y el resto debajo) y contenedores (pulsable); «Necesita atención»
    (no responde, contenedores, servicios, disco, copias, plantillas sin aplicar, con enlaces) o «Todo en orden»;
    plantillas y apps en dos columnas; actividad reciente (5).
  - **Plantillas**: lista completa, asociar/crear, **Contraseñas** de todas juntas con la explicación una sola vez
    (`ProjectSecrets` con `title`: «Todavía ninguna.») y «Lo que ya hay en este servidor».
  - **Apps y bases**: direcciones y bases de datos.
  - **Contenedores**: tabla con «Solo los que no están en marcha o fallan».
  - **Copias** (si hay módulo Copias o copias en el servidor): tabla de estado (última, plantilla o «recuperar»,
    registro del servicio) y el panel de copias de cada plantilla (copia ahora, ver, restaurar, traer).
  - **Red y seguridad**: cortafuegos, lo que escucha hacia fuera y, nuevo, lo que solo escucha dentro.
  - **Registros**: sistema, SSH, servicios caídos e historial completo.
- Ayuda de Servidores reescrita; capturas rehechas (las que entran en la ficha pulsan antes «Resumen»).

## 2026-11-22 · 0.46.1 · Botones de la ficha fuera del menú

- Petición del usuario: «Editar conexión» y «Actualizar sola» vuelven a estar a la vista, como antes; quitado el
  menú «⋯». Todos los botones van en la barra de arriba, junto a «← Servidores» (al lado del nombre no cabían y
  bajaban a otra línea).

## 2026-11-22 · 0.47.0 · La plantilla en el servidor, más clara

El usuario no entendía la pantalla: mezclaba los módulos de la plantilla con todo el catálogo (25 tarjetas, los
suyos solo se distinguían por el color), dos filas de botones arriba, no decía qué haría Aplicar y el botón
«Instalados / Por categoría» confundía. Ahora, de arriba abajo:

- **Cabecera**: nombre, estado en palabras (Sin aplicar · Cambios sin aplicar · Aplicada hace… · Falló la última
  vez), «en Servidor · usuario@IP · plantilla «…»» y solo **Previsualizar** y **Aplicar** / **Configurar y aplicar…**.
- **Qué pasará al aplicar**: Instalar (en orden), Cambiar la configuración de…, Volver a aplicar (si cambió la
  plantilla), Se quedan como están (sin gestionar); o «Todo aplicado». Errores con «Corregir», avisos y el fallo
  de la última aplicación.
- **Módulos de esta plantilla**: solo los suyos, en filas numeradas en orden de instalación, con icono y estado en
  palabras (Instalado · Se instalará · lo necesita X · Cambios sin aplicar · Falta un dato · Instalado, sin
  gestionar); pulsar abre su página; ✕ quita uno aún no instalado.
- **Añadir módulos**: el catálogo en una ventana, con buscador (sin acentos) y por categorías. En las tarjetas
  «La necesita otro» (ámbar) pasa a «Añadido» (azul, igual que los elegidos); la nota dice quién lo necesita.
  También en el editor de plantillas.
- Debajo: **Respecto a la plantilla** (igual / distinto con Llevar y Volver), **Contraseñas** en corto,
  **Historial** y **Otras acciones** (Exportar instalar.sh, Editar plantilla, Desasociar del servidor).
- Iconos de módulos en `lib/icons.ts` (compartidos). Quitado el orden «Instalados / Por categoría».
- Ayuda reescrita («La plantilla en el servidor, de arriba abajo», «Añadir módulos»); capturas rehechas.

## 2026-11-22 · 0.48.0 · Lo visto al aplicar en el servidor de pruebas

- **Aplicación a medias**: al aplicar «Pruebas» falló la app de Git y Draupnode no apuntaba nada como instalado
  (solo lo hacía si todo iba bien), así que no se sabía qué había quedado. Ahora `RunSummary.Completed` guarda los
  módulos que terminaron enteros antes del fallo (o de cancelar) y quedan como instalados (sin fecha de
  aplicada); el aviso final dice «Quedaron instalados: … Falló en: … No se llegó a: … (se instalarán al volver a
  aplicar)». Test `TestAplicacionAMedias`.
- **App desde Git con repositorio privado por https**: nueva opción «Token de acceso» (tipo secreto, en la bóveda).
  Se pasa por el entorno y git lo recibe con `GIT_CONFIG_COUNT/KEY/VALUE` (cabecera `Authorization`), así no
  queda en `.git/config` ni en la orden (`git -c` no valía: `timeout git` se salta una función de shell).
  Necesita git ≥ 2.31 (Ubuntu 22.04+, Debian 12+). Probado contra GitHub: sin token no se envía nada; con un
  token falso la descarga falla. El mensaje de fallo explica qué hacer según el caso (https sin token, token que
  no sirve, deploy key).
- **Asistente al aplicar** con alto fijo (`Modal height`): los botones Anterior/Siguiente/Finalizar no se mueven
  al cambiar de paso; lo largo se desplaza dentro.
- **Recuadro de la ejecución** («Previsualización terminada»…) separado del siguiente.
- **Plantilla en el servidor, nuevo orden** (petición del usuario): título · dos columnas «Acciones» (Exportar,
  Editar plantilla, Desasociar, con su explicación) y «Contraseñas» · Qué pasará al aplicar · Módulos de esta
  plantilla · Respecto a la plantilla · Historial. «Volver a la plantilla» pasa a **«Resetear plantilla»** y las
  diferencias van una por renglón (Añadido solo aquí / Quitado solo aquí / Opciones propias: con el nombre de
  cada opción).

## 2026-11-22 · 0.49.0 · App desde Git: qué variables necesita y si ha arrancado; Grafana en Apps

- **«Leer el repositorio»** (opciones del módulo App desde Git, también en el asistente): `GitAppInspect` baja el
  repositorio en el servidor (clon superficial en una carpeta temporal que se borra; token por stdin y cabecera
  `GIT_CONFIG_*`, o la deploy key si ya existe) y saca, con python3, los nombres de `.env.example` (y
  .env.sample/.template/.dist) con su valor de ejemplo y las `${VAR}` del compose (con o sin valor por defecto).
  Nunca lee `.env`. Clasifica por el nombre: contraseña/clave de la app (SECRET_KEY, *_PASSWORD, *_SALT…) →
  «Generar en el servidor»; clave de otro servicio (API_KEY, *_TOKEN, STRIPE, SMTP, AWS_…) → la pone el usuario
  en «Variables secretas»; el resto → «Variables (.env)» con el ejemplo («revísalo») o vacía. Las que el compose
  ya trae con valor por defecto se dejan. Componente `GitRepoReader`; tests `TestClasificarVariables`. Probado el
  guion en el servidor de pruebas con un repositorio local (variables, rama que no existe).
- **Al aplicar**: antes de arrancar, `docker compose config` lista las variables sin valor y, si hay, para con
  «El docker-compose usa variables que no tienen valor: …» (una vacía a propósito se escribe «CLAVE=»). Después de
  `up`, espera hasta 2 min a que todos los contenedores estén en marcha (sin «starting»/«restarting»); si alguno
  se cae o no está sano, falla diciendo cuál, su estado/código y sus últimas líneas de registro. Si la app no
  contesta en su puerto tras 90 s, ahora es un fallo (antes solo una nota). Probadas las órdenes en el servidor
  de pruebas (aviso con comillas escapadas de Compose 2.40).
- **Ficha → Apps**: sale **Grafana** cuando la plantilla tiene Monitorización (se abre por túnel SSH; antes no
  salía porque solo se listaban los módulos con dominio).
- **Ficha → Resumen**: «Necesita atención» no se muestra si no hay nada.

## 2026-11-22 · 0.50.0 · Los módulos son del servidor; las plantillas solo los añaden

Decisión del usuario: un servidor tiene módulos, no plantillas. La plantilla es un atajo para añadir varios
módulos de una vez; editarla no cambia los servidores. Desde un servidor se pueden llevar módulos a una plantilla
(existente o nueva).

- **Modelo**: un solo `store.Project` por servidor (sus módulos). `ProjectModule.From` = plantilla de la que vino
  (vacío = añadido en el servidor); `Project.Templates` = plantillas aplicadas. `RecipeID`/`Overrides` solo se leen
  para convertir. `SaveProject` no deja crear un segundo conjunto en un servidor.
- **Conversión de datos (v2 → v3)** al abrir: antes se copia `draupnode.json` a `draupnode.json.antes-0.50`. Por
  servidor se junta todo en el despliegue más antiguo (conserva id, carpeta en el servidor, contraseñas e
  historial); cada módulo recuerda su plantilla; los instalados se suman. Probado con una copia de los datos reales
  del usuario (1 servidor, 1 plantilla: queda igual, con sus 4 módulos «de Pruebas»). Si un servidor tenía varias
  plantillas, las contraseñas y registros de las demás quedan con su id antiguo (no se pierden, pero no se ven).
- **API**: `ServerModules`, `ApplyTemplate` (añade los que faltan; los que ya están conservan su configuración),
  `ModulesToTemplate` (a una existente: sustituye esos módulos y deja el resto; o nueva con nombre), `ForgetTemplate`.
  `SaveRecipe` ya no toca servidores; `DeleteRecipe` se puede aunque esté aplicada (los servidores conservan sus
  módulos y olvidan su origen). Quitados `DeployRecipe`, `ProjectRecipeDiff`, `PushToRecipe`, `ResetToRecipe` y el
  cálculo de diferencias. `ListRecipes` devuelve `servers` (dónde se aplicó). «Recuperar» solo si el servidor no
  tiene módulos (o son de la misma carpeta); «Destino de copias» usa los módulos del servidor destino.
- **Ficha del servidor**: la pestaña «Plantillas» pasa a **«Módulos»**: el editor de módulos dentro de la ficha
  (estado, Previsualizar/Aplicar, **Plantillas** — aplicar una, las aplicadas como chips que abren su edición,
  «Guardar módulos en una plantilla…» con casillas y destino, Exportar instalar.sh —, Contraseñas, Qué pasará,
  la lista con «de «plantilla»» en cada módulo, Añadir módulos, historial) y abajo «Lo que ya hay en este
  servidor». Resumen: tarjeta «Módulos» (cuántos, sin aplicar, plantillas aplicadas pulsables para editarlas).
  `openDeployment` y los avisos llevan a esa pestaña (`ui.serverTab`).
- Plantillas: la lista dice en qué servidores se aplicó; el editor «Aplicar en un servidor…». Panel, tarjetas,
  barra de estado, lista de servidores y avisos cuentan módulos («N módulos sin aplicar») en vez de plantillas.
- Tests: `TestPlantillasYModulosDelServidor`, `TestConvertirAModulosDelServidor`, adaptados recuperar y
  contraseñas. Demo del navegador convertida igual. Ayuda y capturas rehechas.

## 2026-11-22 · 0.50.1 · «Leer el repositorio» dice qué ha leído

- El usuario probó con `https://github.com/twbs/bootstrap.git` y solo veía «Último cambio: ac35207 feat(collapse)…»
  (Bootstrap no tiene compose ni .env.example, y la pantalla no lo decía claro). Ahora pone «Leído: <dirección>
  (rama …) · último cambio: …» y, si en esa rama no está el fichero compose, un aviso de que con ese repositorio
  no se puede arrancar la app (revisar dirección, rama y fichero; o crearlo con Docker Creator) sin tocar las
  opciones. «No usa variables» solo sale si hay compose.

## 2026-11-22 · 0.50.2 · «Previsualizar» pasa a llamarse «Simular»

- Petición del usuario: en botones, asistente, barra de estado, recuadro de la ejecución («Simulación»), historial
  y ayuda. Por dentro (nombre de los ficheros de registro y `check`) sigue siendo «previsualizar», para no romper
  los registros que ya hay; el historial lo enseña como «simular».

## 2026-11-22 · 0.50.3 · «Cambios guardados» solo después de guardar

- En los módulos del servidor salía «Cambios guardados» nada más abrir, sin haber cambiado nada. Ahora solo
  aparece después de que se guarde algo en esa pantalla. (Y el último «previsualizar» de la ayuda → «simular».)

## 2026-11-22 · 0.51.0 · App desde Git: usar un .env de este equipo; «Dejar de gestionarlo» explicado

- **«Usar un .env de este equipo…»** junto a «Leer el repositorio», para repositorios sin `.env.example`
  (`ChooseEnvFile` + `GitAppImportEnv`). Se lee el fichero en este equipo (máx. 256 KB; CLAVE=valor, «export»,
  comillas, comentarios; la última repetida gana). Las que parecen contraseñas o claves (las mismas reglas que
  «Leer el repositorio») se guardan **cifradas en la bóveda** en «Variables secretas con valor tuyo», juntándolas
  con las que ya hubiera; el resto vuelve a «Variables (.env)» con su valor (sustituye las mismas claves). Si el
  .env trae el valor, se quita de «Generar en el servidor». Valores de varias líneas o con «;» no se pueden guardar
  así y se avisa. Pide crear/abrir la bóveda si hace falta. El fichero no se copia a ningún sitio. Tests
  `TestLeerEnvDelEquipo`, `TestImportarEnvALaBoveda`.
- **«Dejar de gestionarlo»** dice lo que hace: quita el módulo de Draupnode sin desinstalarlo (sigue funcionando;
  Draupnode ya no cambia su configuración al aplicar ni lo desinstala).
- En la página de un módulo ya no sale debajo «Lo que ya hay en este servidor» (no es del módulo); en la lista de
  módulos sale separado.

## 2026-11-22 · 0.51.1 · «Cambios guardados» solo si has cambiado algo, en verde

- Solo aparece cuando se guarda algo que has cambiado tú (escribir o marcar en un formulario —eventos que suben
  hasta el editor—, añadir/quitar/volver a gestionar un módulo, o rellenar con «Leer el repositorio» / «Usar un
  .env»), en verde, y se quita a los 5 s. Lo que se ajusta solo al abrir no cuenta.
- «Leer el repositorio»: «último commit `da55035`: «mensaje»» (el usuario confundió el hash con un color).

## 2026-11-22 · 0.51.2 · Barra fija «Cambios sin aplicar» y foco en la ejecución

- Petición del usuario: cuando hay algo por aplicar (módulos nuevos, configuración cambiada o la lista cambiada),
  abajo aparece una barra fija (sticky) con «Cambios sin aplicar · instalar … · configuración de …» y Simular /
  Aplicar (o «Configurar y aplicar…»); si falta algún dato, lo dice en rojo. También en la página de un módulo.
- Al empezar una simulación o una aplicación, la pantalla se desplaza sola al recuadro «… en curso».

## 2026-11-22 · 0.52.0 · App desde Git: construcción en directo y vigilada, orden después de arrancar, varias apps

Tras probar `nickjj/docker-django-example`: la construcción se quedó 12 min colgada sin que se viera nada
(`NODE_ENV=produccion` dejaba esbuild vigilando ficheros) y después la app no arrancó por permisos (código bajado
como root, la app corre con el usuario 1000).

- **Construcción en directo**: el módulo construye aparte (`docker compose build --progress=plain`) escribiendo en
  `/var/lib/draupnode/progreso/<servidor>.log`; durante la ejecución, `followProgress` lo lee cada 3 s por otra
  sesión SSH y lo manda como evento `progress` (se ve bajo la tarea en curso, últimas 8 líneas, y va al registro con
  «  | »). Sirve para cualquier módulo que escriba ahí.
- **Vigilancia**: se para si pasa «Tiempo máximo para construir» (30 min por defecto, `git_app_build_minutes`) o 10
  min sin escribir nada, y dice en qué paso se quedó y qué suele ser (modo desarrollo/watch). Probado en el servidor
  de pruebas con un `RUN sleep` (umbral rebajado).
- **Orden después de arrancar** (`git_app_post_command` + `git_app_post_service`, «web» por defecto): se ejecuta en
  cada aplicación con `docker compose exec -T`, ya en marcha (migrate…); si falla, sale su salida.
- **Dueño de la carpeta de la app** (`git_app_owner`, UID:GID): `chown -R` tras bajar el código.
- **Varias apps de Git en un servidor**: módulos `repeatable` (de momento App desde Git). Otra copia es
  `git-app@nombre` (nombre: minúsculas y números); `Catalog.Get` entiende el sufijo (y Resolve/Clashes); `Selection`
  lleva `ID`/`Instance`; cada copia recibe `draupnode_instance`; sus datos secretos van en secretos.yml como
  `<var>__<nombre>` y en la bóveda como `<var>@<nombre>`, y el rol los recibe con su nombre de siempre (expresión
  Jinja sin !unsafe; probado con Ansible real). Sus valores generados: `git_app_<nombre>_env_*`. Dos copias con el
  mismo nombre de app → error en ese campo. En la interfaz: «Añadir módulos» → pulsar otra vez «App desde Git» pide
  el nombre; se ve como «App desde Git · blog» con su página, su asistente y sus contraseñas. Test `TestDosAppsDeGit`.

## 2026-11-22 · 0.53.0 · App desde Git revisa sola los errores típicos; controles de Docker

Lo aprendido con `nickjj/docker-django-example` (NODE_ENV mal escrito, puerto abierto a internet, código montado
como root encima de la app, falta de migrate) y que la Simulación decía «todo bien» con la app caída.

- **Revisor en el servidor** (`files/revisar.py` del rol): `compose` lee `docker compose config --format json` con
  el .env que quedaría (en la simulación, uno temporal con los generados como «con valor») y saca variables sin
  valor (para), puertos publicados en 0.0.0.0 (aviso: Docker se salta el cortafuegos) y servicios que montan la
  carpeta del código (aviso); `permisos` mira con qué usuario corre cada imagen (`docker image inspect`, y si es un
  nombre, `id -u/-g` dentro) y, si no es root y monta carpetas de la app, las crea y se las da (si «Dueño de la
  carpeta» está vacío); `estado` lista contenedores de la app que no están en marcha. Probado en el servidor de
  pruebas con la app Django real y una copia de su carpeta.
- **La Simulación ya comprueba la app** (sin tocarla): si es la primera vez, si hay commits nuevos (`git
  ls-remote`), la revisión del compose y qué contenedores están parados. Probado con una simulación real de
  Ansible sobre los módulos del servidor de pruebas.
- **Avisos antes de aplicar** (`gitEnvWarnings`): NODE_ENV fuera de production/development/test, DEBUG/APP_DEBUG…
  verdadero, RAILS_ENV/APP_ENV/FLASK_ENV de desarrollo, variables vacías. Test `TestAvisosDelEnv`.
- **«Leer el repositorio» reconoce el tipo de app** (manage.py, artisan, bin/rails, prisma/schema.prisma,
  alembic.ini, en la raíz o un nivel por debajo) y, si la orden después de arrancar está vacía, la rellena
  (`python3 manage.py migrate`…) con el primer servicio que se construye. Probado con el repositorio real.
- **Controles de Docker** en la ficha → Contenedores: arrancar, parar (con confirmación) y reiniciar cada
  contenedor (`ContainerAction`); «Limpiar Docker…» (`DockerDiskUsage` + `DockerPrune`): enseña lo que ocupa y lo
  recuperable y borra imágenes sin usar, caché de construcción y, si se marca, contenedores parados. Los volúmenes
  nunca.

## 2026-11-22 · 0.53.1 · «Variables (.env)» en filas, con lo que hay que tocar resaltado

- Petición del usuario: la lista de texto pasa a filas (nombre | valor | ✕), con «Añadir variable» y «Editar como
  texto» (`EnvEditor`). Cada fila se revisa al momento y, si hay que tocarla, sale resaltada (rojo: hay que
  arreglarla; ámbar: conviene revisarla) con el motivo: nombre no válido o repetido, vacía, NODE_ENV fuera de
  production/development/test, valor de ejemplo (changeme, insecure, example.com…), DEBUG activado, entorno de
  desarrollo, puerto publicado a todo internet, carpeta del código montada, healthcheck desactivado, localhost, o
  algo que parece contraseña escrito a la vista. Arriba: «N variables para revisar».
- Estado del servidor de pruebas visto con el usuario: la app «prueba» arranca y sirve la portada; falla
  `python3 manage.py migrate` por `POSTGRES_DB=` vacía (Django recibe un nombre de base en blanco). Quedó la app
  vieja «app» (dn-app) huérfana al cambiar el nombre.

## 2026-11-22 · 0.53.2 · Servidor de pruebas rehecho y la app Django funcionando

- A petición del usuario, el servidor de pruebas se borró entero (contenedor + Docker interno) y se creó de nuevo
  (lab Remove/Start + huella). En la configuración: módulos sin cambios (Sistema base, Docker, Cortafuegos, App desde
  Git «prueba», Monitorización), estado «nada instalado», y el .env de la app corregido (puerto solo en 127.0.0.1,
  `DOCKER_RESTART_POLICY=unless-stopped`, fuera lo de desarrollo y `POSTGRES_DB`; migrate después de arrancar).
  Copia de antes en `~/.config/draupnode/antes-de-limpiar-<fecha>/`. Comprobado instalando con el instalar.sh
  exportado: 0 fallos, 18 migraciones, web y estáticos 200, Grafana 200, todo en 127.0.0.1, permisos 1000:1000
  puestos solos.
- Fallo encontrado y corregido: «Leer el repositorio» cogía variables de líneas **comentadas** del compose
  (`# POSTGRES_DB: "${POSTGRES_DB}"`), y esa variable (con otro valor que el de la base que se crea) rompía el
  migrate. Ahora se ignoran los comentarios.

## 2026-11-22 · 0.53.3 · La barra fija ya no tapa «Lo que ya hay en este servidor»

- La barra «Cambios sin aplicar» se quedaba fija dentro del editor de módulos y, al bajar del todo, se montaba
  sobre «Lo que ya hay en este servidor» (que iba después, fuera del editor). Ahora esa sección se pinta dentro del
  editor (`after`), antes de la barra: al final de la página la barra queda debajo de todo.

## 2026-11-22 · 0.54.0 · Publicar sin GitHub desde Docker Creator (probado con un proyecto Django real)

Objetivo del usuario: que alguien sin saber de Docker ni de git pueda publicar su proyecto. Probado con una copia de
un proyecto Django real del usuario en el servidor de pruebas: instalado sin fallos, 110 migraciones en PostgreSQL, claves Fernet y
AES válidas, DEBUG=False, web 200, junto a la app Django de antes (8000) en el 8001.

- **App desde Git con «carpeta»** (`git_app_source` = git | carpeta, `git_app_local_dir`): antes de aplicar,
  Draupnode sube la carpeta por SSH (tar.gz por stdin, `app_upload.go`) a `/srv/draupnode/apps/<nombre>`, sin
  .git/.env/.venv/node_modules/__pycache__/*.sqlite3/*.zip ni lo del `.dockerignore`. En la simulación no se sube.
  Se comprueba antes que la carpeta y su compose existen. El formulario solo enseña los campos de cada caso y
  «Elegir…» para la carpeta. El instalar.sh exportado no puede subirla (lo dice si falta).
- **Claves con formato** en «Generar en el servidor»: `NOMBRE:fernet`, `:base64-32`, `:hex-32` (32 bytes al azar).
- **Docker Creator**:
  - Lee también las **variables que usa el código** (`os.environ.get`, `getenv`, `process.env`, `env(…)`…) que no
    están en `.env.example` (`CodeEnvKeys`; en la prueba: DB_ENGINE, FILES_ENCRYPTION_KEY…).
  - Deduce el **formato de las claves** mirando el código cerca de donde se leen (`KeyFormats`: `Fernet(clave)` →
    fernet; `b64decode` + 32 → base64-32; hex). Una clave derivada (`Fernet(base64…(…))`) no cuenta.
  - El puerto del compose queda en **127.0.0.1** y se puede cambiar con `APP_HOST_PORT`.
  - **«Publicar en un servidor»** (`PublishDockerApp`): añade la App desde Git (con «carpeta») a los módulos del
    servidor elegido, otra copia si ya hay una; puerto libre si el suyo está ocupado; variables: las del compose
    sin valor por defecto + las de la app (ejemplo o código), con valores de servidor típicos (DEBUG=false,
    DB_ENGINE=postgres…); las que no tienen valor **no se ponen** (vacías pisarían el valor por defecto) y salen en
    «para revisar»; contraseñas y claves → generar (en su formato); las de otros servicios (correo, VAPID…) → para
    revisar.
- Tests: `TestSubirCarpeta`, `TestVariablesYFormatosDelCodigo`.

## 2026-11-22 · 0.54.1 · Guía «Publicar tu app paso a paso»

- Petición del usuario: que quede registrado cómo se crea, configura y sube una app. Nueva sección en la ayuda,
  «Publicar tu app paso a paso» (entre Docker Creator y Terminal), con 9 pasos y la variante con GitHub: antes de
  empezar, crear los ficheros de Docker, probarlo, publicar en un servidor, revisar su configuración, simular y
  aplicar, abrir la app, actualizarla y qué hacer si algo falla. Capturas nuevas `publicar` y `publicar-modulo`.
  La misma guía, en `docs/GUIA_PUBLICAR.md`, enlazada desde el README. La de Docker Creator remite a ella.

## 2026-11-22 · 0.55.0 · Apps huérfanas, PostgreSQL compartido, perfiles por tipo de app y errores traducidos

Probado de punta a punta en el servidor de pruebas con dos proyectos públicos reales, publicados como lo haría
alguien sin saber de Docker (Docker Creator → «PostgreSQL compartido» → Publicar → Aplicar): el esqueleto oficial de
Laravel (`laravel/laravel`) y `HugoDF/express-postgres-starter` (Express + PostgreSQL). Los dos en marcha y
respondiendo, cada uno con su base en el PostgreSQL compartido (Laravel: production, debug apagado, APP_KEY
`base64:` de 32 bytes, 3 migraciones sobre pgsql; Node: su migración creó sus tablas).

- **Apps huérfanas** («Lo que ya hay en este servidor»): carpetas de `/srv/draupnode/apps` y proyectos `dn-…` que no
  son de una App desde Git del servidor ni de un módulo del catálogo; «Borrar…» (`RemoveOrphanApp`): `docker
  compose -p dn-<nombre> down` (con `-v` si se confirma borrar los datos) y su carpeta. No deja borrar una app
  gestionada ni un módulo del catálogo.
- **PostgreSQL compartido en App desde Git** (`git_app_db` = propia | postgres-compartido): al guardar
  (`syncSharedDB`) se añade el módulo PostgreSQL si falta, con una base con el nombre de la app, y la app sabe su
  contenedor y su red; el rol lee la contraseña que generó el módulo, pone en el .env DATABASE_URL, DB_HOST/PORT/
  NAME/USER/PASSWORD, DB_DATABASE/USERNAME/CONNECTION (Laravel) y POSTGRES_* (las que ponga el usuario mandan) y
  conecta los contenedores de la app a la red. App desde Git va después de PostgreSQL (`after`). «Publicar» lo
  activa si en Docker Creator se eligió «PostgreSQL compartido» (y no pone esas variables).
- **Perfiles por tipo de app** (`profileValue`): Django (DEBUG, ALLOWED_HOSTS, CSRF_TRUSTED_ORIGINS, SECRET_KEY),
  Laravel (APP_ENV, APP_DEBUG, APP_KEY:laravel, APP_URL, LOG_CHANNEL=stderr), Rails (RAILS_ENV, SECRET_KEY_BASE:hex-64,
  RAILS_LOG_TO_STDOUT, RAILS_SERVE_STATIC_FILES), Flask/FastAPI, Node (NODE_ENV). En «Publicar» y en «Leer el
  repositorio» (que ahora reconoce también package.json). Formatos nuevos `:laravel` y `:hex-64`.
- **Errores traducidos** (`explainError`): a los fallos se les añade «Qué significa: …» para base inexistente,
  contraseña de la base, host no encontrado, conexión rechazada, clave Fernet, APP_KEY de Laravel, librería de
  Python o módulo de Node que falta, extensión PHP, ImproperlyConfigured, permisos, puerto ocupado, disco lleno,
  arquitectura y SQLSTATE de Laravel.
- Fallos encontrados con las pruebas reales y corregidos:
  - Docker Creator tomaba **Laravel por una web de Node** (por su package.json de Vite): PHP manda ahora.
  - Opciones con nombre de secreto (AUTH_PASSWORD_BROKER, …_TIMEOUT, …_TABLE) se generaban al azar: ahora no
    (`configNameRe`); y una contraseña que el compose no usa (REDIS_PASSWORD, MAIL_PASSWORD) es de otro servicio y no
    se genera (haría que la app intente entrar con ella).
  - La subida respetaba el .dockerignore generado, que excluye el compose y el Dockerfile: los ficheros de Docker
    suben siempre.
  - «Publicar» solo miraba los puertos de otras apps de Git: ahora todos los de los módulos y los que escuchan en
    el servidor (última ficha) — el 3000 era de Grafana.
  - Las apps de Node y Go reciben `PORT` en el compose (si no, «App started on port undefined»).
- Tests: `TestPerfilesPorTipoDeApp`, `TestErroresTraducidos`, `TestPostgresCompartido`, `TestLaravelNoEsNode`.

## 2026-11-22 · 0.56.0 · Leer el repositorio mira el código, simular apps de una carpeta y el estado del sistema en la ficha

- **«Leer el repositorio» mira también el código** (como Docker Creator con una carpeta): encuentra las variables
  que el código lee y no salen en .env.example ni en el compose (`inCode`), y el formato de las claves por lo que hay
  cerca de donde se leen (Fernet, base64 de 32 bytes, hex). Probado con un proyecto Django real: FIELD_ENCRYPTION_KEY
  → fernet y FILES_ENCRYPTION_KEY → base64-32. Las variables sin valor que el compose no exige ya no se ponen vacías
  (pisarían el valor por defecto de la app): salen como «no se pone».
- **Simular una app con «carpeta» antes de subirla**: la simulación sube el código a una carpeta temporal
  (`/var/lib/draupnode/simulacion/<plantilla>/<app>`), revisa ahí el compose, las variables y los puertos, y la borra al
  terminar; la app de verdad no se toca. Antes solo decía «se subirá».
- **Estado del sistema en la ficha** (overview.py: `updates`, `clock`, `security`, `certs`):
  - Resumen: actualizaciones pendientes (y de seguridad), si hace falta reiniciar, intentos fallidos de SSH en 24 h
    (de cuántas IPs, y fail2ban), si la hora está sincronizada y el certificado HTTPS que antes caduca.
  - «Necesita atención» y los avisos: reinicio pendiente, actualizaciones de seguridad, certificado a menos de 21 días
    (o sin HTTPS), hora sin sincronizar, y muchos intentos de SSH sin fail2ban.
  - Red y seguridad: intentos de SSH con las IPs que más insisten, caducidad de cada certificado, y las
    actualizaciones con «Instalar actualizaciones…» (`ServerUpgrade`) y «Reiniciar el servidor…» (`ServerReboot`).

## 2026-11-23 · 0.57.0 · Historial de CPU/memoria/disco con previsión del disco lleno, uso por app y «Tu app»

- **Historial del servidor** (Resumen de la ficha): «Empezar a guardar el historial» instala en el servidor
  `internal/overview/historial.py` como `/usr/local/lib/draupnode/historial.py` y el temporizador
  `draupnode-historial` (cada 5 minutos, `Nice=10`), que guarda en `/var/lib/draupnode/historial/`:
  - `muestras.jsonl`: CPU (media desde la muestra anterior), memoria, disco `/` y CPU/memoria de cada app; 48 h.
  - `horas.jsonl`: resumen de cada hora (medias, máximos y el último disco); 1 año.
  - Funciona aunque Draupnode esté cerrado. La ficha lo lee con el mismo código (overview.py lleva historial.py delante).
  - Gráficas de 24 horas o 30 días (en 30 días, la banda clara es el máximo de cada hora), con guía y valor al pasar el ratón.
  - **Previsión del disco**: recta por mínimos cuadrados con lo usado en los últimos 7 días (al menos 12 h de muestras;
    si se amplía el disco, solo cuenta lo del tamaño nuevo). Crecer menos de 50 MB al día es «estable». Si se llena
    antes de 14 días sale en «Necesita atención» y en los avisos (rojo a menos de 3).
  - Avisa si el temporizador está parado o el recolector del servidor es de una versión anterior (y lo actualiza).
    «Dejar de guardar…» lo quita y borra lo guardado. `ServerHistory` en app_metrics.go.
- **Uso por app** (Apps y bases): los contenedores sumados por app (proyecto de Compose, app de Coolify o contenedor
  suelto; la misma clave que el historial) con CPU y memoria de ahora y, con historial, una minigráfica de 24 h
  con la media y el máximo. La ficha trae ahora `cpuP`/`memB` numéricos y `app` en cada contenedor.
- El módulo «App desde Git» se llama ahora **«Tu app (Git o carpeta)»** (el id sigue siendo `git-app`).
- Servidor de pruebas: el contenedor se crea con `--restart unless-stopped` (y los ya creados se actualizan al
  arrancar), así «Reiniciar el servidor» lo para y vuelve solo como una máquina de verdad. Probados en él
  «Instalar actualizaciones» (2 paquetes en 7 s) y «Reiniciar» (vuelve en 8 s con todas las apps).
  La salida de «Instalar actualizaciones» ya no lleva el ruido de «Reading database…».
- Probado en el servidor de pruebas: el temporizador queda activo y la ficha lee el historial y el uso por app.
- Ayuda: «Historial y disco lleno» y «Uso por app», con capturas nuevas (servidor-historial, servidor-apps).

## 2026-11-23 · 0.58.0 · «Desinstalar todo» en la ficha del servidor

- Pestaña «Módulos» de la ficha → **«Desinstalar todo…»**: quita del servidor todo lo que puso Draupnode y se puede
  desinstalar, para dejarlo como recién preparado.
  - `PlanUninstallAll` decide qué se va y qué se queda con su motivo: lo que no tiene desinstalación o no se puede
    quitar (Sistema base), «SSH seguro» si usa otro puerto que el 22 (se perdería la conexión) y lo que necesita un
    módulo que se queda. Los módulos marcados que nunca se instalaron solo salen de la lista. Trae ya la comprobación
    de la desinstalación (`checkUninstallOf`, sin esos módulos).
  - `UninstallAll` los quita de la lista y lanza la desinstalación normal (con su progreso). Al terminar bien, la
    interfaz quita también el historial del servidor.
  - El diálogo (UninstallDialog con `all`) enseña lo que se va y lo que se queda, trae marcado «Borrar también los
    datos» y se confirma escribiendo el nombre del servidor.
  - El sistema y el SSH no se tocan, y el cortafuegos deja abierto el puerto del SSH. Las apps huérfanas siguen en
    «Lo que ya hay en el servidor». Para reinstalar el sistema entero, el panel del proveedor; en el servidor de
    pruebas, «Borrar» y «Crear y arrancar».
- Probado de punta a punta en un servidor desechable (otro contenedor con la imagen de pruebas): aplicados PostgreSQL,
  Cortafuegos y Docker (1 min 39 s), activado el historial y marcado Navidrome sin aplicar; «Desinstalar todo» quitó
  Docker, Cortafuegos y PostgreSQL con sus datos (18 tareas, 0 fallos), dejó Sistema base, sacó Navidrome de la lista
  y el servidor quedó sin Docker ni temporizadores de Draupnode. Test `TestDesinstalarTodo`.
- Ayuda: «Desinstalar todo».

## 2026-11-23 · 0.58.1 · «Desinstalar todo» solo si hay algo que quitar

- El botón sale solo cuando `PlanUninstallAll` tiene algo que desinstalar (antes salía con cualquier módulo instalado,
  y con solo el Sistema base avisaba «No hay nada…» al pulsarlo).

## 2026-11-23 · 0.58.2 · Ayuda revisada y capturas al día

- Revisada la ayuda contra las pantallas: todas tienen su apartado. Nuevos «Red y seguridad» y «La campana»;
  «Lo que se ve en la ficha del servidor» (Avisos) ahora lista todos los avisos (disco lleno a este ritmo, reinicio,
  actualizaciones de seguridad, certificados, hora, intentos de SSH). Las capturas servidor-red, avisos-caido y
  avisos-campana se sacaban pero no salían en la ayuda; ahora sí.
- Las 31 capturas rehechas con la versión actual (salían «App desde Git» y pantallas viejas). La de «Tu app» se
  buscaba por el nombre antiguo.
- La demo del navegador ya no dice «v0.2.0»: pone «demo navegador».

## 2026-11-23 · 0.59.0 · README con imágenes, compartir módulos y guía para probar cada módulo

- **README**: GIF con un recorrido por la app (`docs/img/draupnode.gif`, 8 pantallas, 678 KB; `make gif` lo rehace con
  `herramientas/gif_readme.py` a partir de las capturas de la ayuda) y una galería de 6 capturas. «Qué hace» reescrito
  con el modelo actual (módulos del servidor, plantillas como atajo, ficha por pestañas, historial, uso por app,
  «Tu app» con carpeta, Desinstalar todo).
- **Compartir módulos** (Editor de módulos, `app_modshare.go`):
  - «Exportar…»: un fichero `<id>.draupnode-modulo` (tar.gz) con sus ficheros y `draupnode-modulo.json` (formato,
    id, versión, Draupnode que lo exportó y la huella SHA-256 de cada fichero). Solo módulos sin problemas.
  - «Importar…» lo revisa antes de copiar nada (`InspectModuleFile`): límites de tamaño y número de ficheros, solo
    ficheros normales (ni enlaces ni rutas con `..`, absolutas o fuera de `module.yaml`/`role/`), huellas, YAML, que
    el catálogo lo cargue (con tus módulos, por si depende de alguno), choque de id (tuyo: sustituir u otro nombre;
    incluido: siempre otro nombre, renombrando el prefijo de sus variables). Y qué hace: tipos de tarea, órdenes de
    shell, sitios de internet y avisos de lo delicado (descargar y ejecutar scripts, claves SSH, sudoers,
    /etc/shadow, configuración del SSH, vaciar el cortafuegos, chmod 777, base64/eval, shells hacia fuera, usuarios,
    tareas periódicas, contenedores privileged o con docker.sock). Si hay avisos, hay que marcar «He leído lo que
    hace…». Se puede leer cada fichero (CodeEditor de solo lectura).
  - `ImportModuleFile` lo vuelve a revisar y lo escribe aparte antes de cambiarlo de golpe (carpetas ocultas
    `.id.importando`/`.id.anterior`, que el catálogo no carga).
  - Tests: ida y vuelta, choque con el tuyo y con uno incluido, renombrar, huella cambiada, rutas peligrosas,
    enlace simbólico, sin manifiesto.
- **Probar cada módulo** (Ayuda, después de Catálogo): los 26 módulos traen en su `module.yaml` un bloque `prueba:`
  (`lab`: si se puede probar en el servidor de pruebas y qué tener en cuenta; `pasos`; `comprobar`: cómo queda).
  La ayuda enseña un desplegable por módulo, por categorías, con «Probado: funciona» que se recuerda en este equipo
  (localStorage `dn-modulos-probados`) y el contador «X de 26». Los módulos propios pueden traer su guía (el
  esqueleto de módulo nuevo trae un ejemplo). Test `TestGuiasDePrueba`: todo módulo incluido tiene la suya.
- El catálogo de la demo (MOCK_MODULES) se ha vuelto a volcar del catálogo real (estaba desfasado en variables y
  detalles de 15 módulos).

## 2026-11-23 · 0.60.0 · Regresión de los 26 módulos, puertos repetidos, importar más seguro y configuración en la ayuda

- **Regresión de todos los módulos** con esta versión, en un Ubuntu desechable (con la app por dentro): para cada uno,
  aplicar, aplicar otra vez, desinstalar con sus datos y mirar que no queden contenedores; al final «Desinstalar
  todo». 50 minutos. Primera pasada: 23 de 26 bien (Forgejo falló, Destino de copias no se pudo añadir, y Vaultwarden, Paperless e Immich cambiaban algo al reaplicar). Tras los arreglos, segunda pasada de los afectados: todos se instalan, responden, se reaplican sin cambios y se desinstalan sin restos (Immich, tras un «demasiadas peticiones» de ghcr.io, al repetirlo). «Desinstalar todo»
  deja el servidor sin contenedores. Lo que salió y se ha arreglado:
  - **Forgejo y Grafana usaban los dos el puerto 3000**: Forgejo no arrancaba en un servidor con Monitorización.
    Forgejo pasa al 3001 por defecto (los instalados conservan el suyo) y **la comprobación de los módulos avisa de
    puertos TCP repetidos** entre módulos del servidor (variables `*_port` y puertos fijos como los de Coolify; no los
    UDP ni los de módulos que ya no pueden ir juntos): `portClashes`, test `TestPuertosRepetidos`.
  - **Destino de copias** no se puede añadir a mano (necesita el certificado que crea «Guardar también en otro
    servidor»): su campo en rojo ahora explica cómo se hace, y su guía de prueba lo cuenta bien.
  - **Vaultwarden no arrancaba sin dominio** (se reiniciaba en bucle): la versión 1.37 ya no acepta `DOMAIN` vacío.
    Ahora solo se manda si hay dominio. La regresión lo daba por bueno porque «Esperar a que responda» no falla (las
    apps pesadas pueden tardar), solo deja la nota «NO responde todavía».
  - Por eso, **tarea común `no_reinicia`** en el rol `draupnode_preflight` (va en todas las instalaciones): después de
    arrancar, si un contenedor de la app se reinicia sin parar o se ha caído con error, la aplicación falla y enseña
    sus últimos registros. La usan Vaultwarden, Paperless, Immich, Forgejo, Navidrome, Jellyfin, Syncthing y Destino
    de copias («Tu app» ya tenía la suya). Los módulos propios también pueden usarla (`include_role` con
    `tasks_from: no_reinicia` y `dn_compose_project`).
  - **Paperless e Immich cambiaban algo en cada aplicación**: la carpeta de PostgreSQL, que la imagen deja en 0700 y
    Ansible volvía a poner en 0750. Ya no se tocan sus permisos.
- **Importar módulos, más seguro**:
  - Draupnode solo abre direcciones http/https (`safeWebURL` en `OpenURL`): otro esquema (file:, smb:, el de un
    programa) podría abrir algo del equipo. Los enlaces del catálogo ya solo admitían https://.
  - Lo que vuelve del servidor al aplicar (valores generados) tiene un tope de 500 ficheros.
  - La revisión avisa también de ficheros que no son texto (podrían ser programas), caracteres invisibles o que
    cambian el sentido del texto («Trojan Source»), líneas larguísimas, descargas de software (get_url, unarchive,
    git, pip, npm, script), contenedores con la red/procesos del servidor o permisos especiales y montar todo el disco;
    y enseña las **imágenes de Docker** que descargará. El diálogo dice claro que importar no ejecuta nada en este
    equipo, que en el servidor se ejecuta como root y que la revisión no garantiza que sea inofensivo.
    Tests `TestRevisionTrucos` y `TestSoloWebs`.
- **Configuración en «Probar cada módulo»**: cada desplegable enseña el formulario de verdad del módulo con sus valores
  por defecto (solo para ver, `inert`), en vez de capturas que se quedarían viejas.

## 2026-11-23 · 0.61.0 · Qué rellenar y qué hacer si falla, en la ayuda; «Cerrar» de la ayuda abajo

- Cada módulo trae en su bloque `prueba:` dos apartados más, que salen en Ayuda → «Probar cada módulo»:
  - `necesita` → **«Qué tienes que rellenar»**: los parámetros que hacen falta para que funcione y su formato (casi
    nada es obligatorio a secas: depende del caso, p. ej. repositorio o carpeta en «Tu app», correo con HTTPS en nginx,
    puertos del proveedor de nube…).
  - `problemas` → **«Si falla»**: «síntoma → qué hacer», con lo encontrado en la regresión (Vaultwarden sin dominio,
    Forgejo en el 3000, toomanyrequests de ghcr.io en Immich, Destino de copias a mano) y lo conocido de cada uno
    (certificados, cortafuegos del proveedor, UDP de WireGuard y Syncthing, /start en Telegram, permisos…).
  - `TestGuiasDePrueba` exige los dos en todos los módulos incluidos. Las opciones citadas se han comprobado contra
    las etiquetas reales de cada formulario.
- Ayuda → **«Si algo falla»** (sección nueva, tras «Probar cada módulo»): dónde mirar (recuadro de la ejecución con
  «Qué significa» y «Registro completo», Actividad reciente, registro de cada contenedor) y los fallos habituales:
  falta de RAM o disco, puerto ocupado, contenedor de otra instalación, contenedor que se reinicia sin parar,
  toomanyrequests, «NO responde todavía», cortafuegos del proveedor, certificado HTTPS, contraseñas/bóveda/sudo y por
  qué una segunda aplicación puede cambiar algo.
- **«Qué significa»** (explicación bajo un error al aplicar) reconoce también: límite de descargas del registro de
  imágenes, imagen que no existe o es privada, contenedor que no arranca (`no_reinicia`), falta de RAM y de disco,
  contenedor con el mismo nombre y certificado HTTPS que no sale. El del puerto ocupado ya no habla solo de «Tu app».
- La ventana de ayuda tiene el botón **«Cerrar» en un pie** (siempre visible, aunque bajes); la ✕ de arriba se quita.

## 2026-11-24 · 0.62.0 · Licencia GPL-3.0 y código de la app en internal/app

- **Licencia**: GPL-3.0-or-later, © 2026 Francisco Javier Pradas (petición del usuario: gratis, pero con reconocimiento).
  - `LICENSE` (texto oficial), `COPYRIGHT` (aviso en castellano + términos adicionales de la sección 7 b/c:
    conservar la autoría y el enlace en «Acerca de» y el README; las versiones modificadas deben decirlo).
  - `internal/legal`: aviso, GPL y `terceros.txt` incrustados en el ejecutable; test que comprueba que las copias
    coinciden con las de la raíz.
  - `herramientas/licencias.py` (`make licencias`): lista las librerías que van dentro (Go de Linux/Windows/macOS +
    dependencias de producción de la interfaz + la biblioteca estándar de Go) con sus textos de licencia. 59 paquetes,
    todos compatibles con la GPL (MIT, BSD, Apache-2.0, ISC, OFL). Para los MIT sin fichero se pone el texto MIT con el autor.
  - Ajustes: «Datos de la aplicación» → «Acerca de Draupnode» con versión, autoría, licencia, botón «Licencias»
    (Aviso / Lo que lleva dentro / GPL-3.0) y enlace al proyecto. `AppInfo` trae autor, año, licencia y proyecto; método `Legal`.
  - `wails.json` → `info` (copyright y autor en las propiedades del .exe de Windows). README con sección «Licencia».
- **Estructura**: los 51 `app*.go` de la raíz pasan a `internal/app` (paquete `app`, sin el prefijo `app_`). En la raíz
  solo queda `main.go`. La interfaz llama ahora a `window.go.app.App`. `OnStartup`/`OnShutdown` son funciones del paquete
  (no métodos) para que Wails no las ofrezca a la interfaz. `make test` y el workflow de pruebas pasan `./...` con la
  etiqueta webkit2_41; el de publicar lee la versión de `internal/app/app.go`.

## 2026-11-24 · 0.63.0 · 24 módulos nuevos (50 en total): seguridad, Kubernetes e IaC, y más apps

Petición del usuario: más módulos (Kubernetes, Terraform, seguridad…), unos 50, todos de software libre.
Cada uno se ha probado en un Ubuntu desechable: aplicar, comprobar que funciona de verdad (iniciar sesión, subir
algo, conectarse…), volver a aplicar (0 cambios), desinstalar con sus datos y mirar que no quede nada.

- **Seguridad (categoría nueva «8 · Seguridad»)**:
  - **CrowdSec** (MIT): repositorio oficial + bloqueador de iptables (también la cadena DOCKER-USER si hay Docker);
    lista blanca con tu IP al aplicar; colecciones para SSH, nginx y Caddy si están; «Lista de la comunidad» desactivable.
  - **Lynis** (GPL-3.0): revisión al aplicar y semanal (temporizador), índice de seguridad en la nota.
  - **ClamAV** (GPL-2.0): freshclam + revisión diaria de carpetas con prioridad baja; probado con EICAR.
  - **AIDE** (GPL-2.0): foto de los ficheros del sistema (sin datos de apps, Docker ni registros), comprobación diaria
    (dailyaidecheck) y «Tomar la foto al aplicar». Va detrás de todos los módulos para que la foto incluya lo aplicado.
  - **auditd** (GPL-2.0): reglas para usuarios, sudo, SSH, cron, servicios, hora, módulos del núcleo y Docker; opción
    de bloquear las reglas (-e 2). En un contenedor se niega con un mensaje claro.
  - **Trivy** (Apache-2.0): revisión semanal de las imágenes de los contenedores en marcha (gravedad elegible, solo con
    arreglo); va detrás de todos los módulos que arrancan contenedores. Cada imagen se revisa una sola vez.
  - **Keycloak** (Apache-2.0) con su PostgreSQL y **OpenBao** (MPL-2.0, la continuación libre de Vault) con almacenamiento
    raft, iniciado por Draupnode (clave y token raíz en Contraseñas) y desbloqueo al arrancar opcional.
- **Kubernetes e IaC (categoría «9 · Kubernetes e IaC»)**:
  - **k3s** (Apache-2.0) con su instalador oficial y config.yaml; sin Traefik ni balanceador por defecto (no chocan
    con Caddy/nginx/Coolify); reglas de cortafuegos para la red de pods (Oracle rechaza por defecto); API 6443
    cerrada salvo que se pida; kubeconfig para tu usuario; **Helm** desde get.helm.sh comprobando su SHA-256.
    Dentro de un contenedor sobre overlay usa el almacenamiento «native». El servidor de pruebas lleva ahora un
    volumen para /var/lib/rancher (si no, k3s va muy lento: hay que rehacerlo si se creó antes).
  - **Argo CD** (Apache-2.0) con el manifiesto oficial; panel sin TLS propio en 127.0.0.1 con un servicio
    (port-forward), dominio opcional; contraseña inicial de admin en Contraseñas.
  - **OpenTofu** (MPL-2.0; Terraform es BUSL desde 2023): repositorio oficial y, opcionalmente, una carpeta de trabajo
    desde Git (https con token o file:///): init + plan al aplicar y «Aplicar el plan» opcional; variables secretas
    «A=1; B=2» en la bóveda; el estado queda en /srv/draupnode/apps/opentofu (entra en las copias).
- **Sistema**: **Hora exacta (chrony)**. (Swap, zona horaria y actualizaciones automáticas ya las tenía «Base»: no se
  duplican.)
- **Apps en Docker (generador)**: Portainer CE, Registro de imágenes (distribution 3 con htpasswd bcrypt), Dozzle (con
  usuario), Valkey compartido (red «apps»), Adminer, Uptime Kuma 2, ntfy (cerrado, usuario + token para las
  Alertas), Healthchecks, Nextcloud (PostgreSQL + Valkey + cron; dominio de confianza al aplicar), Wiki.js, Vikunja,
  Umami (cambia la contraseña de serie «umami»).
- **Solo software libre**: Paperless y Docker Creator usan ahora Valkey en vez de Redis (Redis 7.4+ no es libre); el
  servicio de Docker Creator se sigue llamando «redis».
- **Generador** (`herramientas/apps`): al día con los arreglos a mano de la 0.60 (vuelve a dar los mismos ficheros);
  fichas nuevas en `nuevas.py`, guías en `pruebas/<id>.yaml`; opciones `category`, `depends`, `no_proxy`,
  `probe: tcp`, `db_dir`, `mid_tasks`, `uninstall_extra`.
- Catálogo de la demo (MOCK_MODULES) volcado otra vez del real (50). README con el catálogo por categorías.
- Fallos que salieron al probar y ya están arreglados: Healthchecks no tiene `createsuperuser --noinput` (se crea
  por su shell de Django); OpenBao 2 no corre como root y ya no admite almacenamiento «file»; Vikunja exige su
  dirección si CORS está activo (desactivado: web y API van juntas); `kubectl` de k3s no lee ~/.kube/config
  (KUBECONFIG en /etc/profile.d).
