# Draupnode

> En la mitología nórdica, **Draupnir** es el anillo de oro forjado por los enanos Brokkr y Eitri:
> cada nueve noches nacen de él ocho anillos idénticos.
> **Draupnode** hace lo mismo con servidores: describes una vez lo que quieres y lo forja en cualquier máquina Linux, de cero.

Aplicación de escritorio (Windows, macOS y Linux) para preparar y vigilar servidores Linux:
das de alta tus servidores por SSH, preparas **plantillas** con los módulos que quieres (Docker, Caddy o nginx, copias
con restic, WireGuard, tus apps desde Git, Vaultwarden, Immich…), las asocias a uno o varios servidores y Draupnode lo
instala con **Ansible**, o te genera **un único `instalar.sh`**.

**Todo es local.** No hay servidor de Draupnode: la configuración vive en tu equipo, las contraseñas en el llavero del
sistema o en una bóveda cifrada, y lo único que sale es la conexión SSH a *tus* servidores (y, si lo dejas activado,
una consulta anónima a GitHub para saber si hay versión nueva).

**Todo es de código abierto**, también lo que instala.

## Descargar

En [Releases](../../releases) están los instaladores de cada versión:

| Sistema | Fichero |
|---|---|
| Windows | `draupnode-X.Y.Z-windows-amd64-instalador.exe` (o el `.zip` con el `.exe` suelto) |
| macOS (Intel y Apple Silicon) | `draupnode-X.Y.Z-macos-universal.dmg` |
| Ubuntu / Debian | `draupnode_X.Y.Z_amd64.deb` (`sudo apt install ./draupnode_X.Y.Z_amd64.deb`) |
| Otros Linux | `draupnode-X.Y.Z-linux-amd64.tar.gz` (necesita GTK 3 y WebKitGTK 4.1) |

Los instaladores no están firmados: Windows (SmartScreen) y macOS (Gatekeeper) avisarán la primera vez.
En macOS: clic derecho sobre Draupnode → Abrir. En Windows: «Más información» → «Ejecutar de todas formas».

## Qué hace

- **Servidores**: alta por SSH (clave OpenSSH, PEM o PuTTY, con o sin contraseña, o usuario y contraseña), huellas
  verificadas, y una **ficha** de cada uno con su estado en vivo: CPU, memoria, discos, contenedores y sus registros,
  bases de datos y lo que pesan, apps y direcciones (también las de Coolify y los sitios de nginx/Caddy), puertos que
  escuchan y que deja pasar el cortafuegos, historial de ejecuciones y contraseñas.
- **Plantillas**: lo que quieres instalar y cómo, sin servidor. Se asocian a servidores, se previsualizan y se aplican;
  cada servidor puede tener lo suyo (dominio, destino de copias…). Si cambias la plantilla, sus servidores lo ven como
  «cambios sin aplicar».
- **Catálogo** de módulos con su web oficial y su código, y **editor de módulos propios** (CodeMirror) para crear los
  tuyos o copiar uno incluido.
- **Copias**: restic diario, «Traer copias al equipo», destino en otro servidor (rest-server en modo solo añadir, con
  rotación) y aviso si hace tiempo que no las traes.
- **Terminal SSH** integrada, con pestañas.
- **Adoptar** lo que ya hay: al aplicar deja en el servidor una ficha de la plantilla (sin contraseñas), así otro
  Draupnode (o este tras perder la configuración) puede recuperarla.
- **Copia de Draupnode**: exporta todo (servidores, plantillas, bóveda, claves) a un fichero cifrado e impórtalo en otro equipo.
- **Avisos** en un solo sitio: copias sin traer, aplicaciones que fallaron, copia de Draupnode pendiente, versión nueva.
- **Docker Creator**: genera el Dockerfile y el docker-compose de tu proyecto (Python, Node, Java, PHP, Go, web) y lo
  prueba en un **servidor de pruebas** (Ubuntu en Docker en tu equipo).

La ayuda de cada pantalla (botón «Ayuda») lo explica paso a paso, con capturas.

## Tecnología

- **Go** + **[Wails v2](https://wails.io)**: un solo ejecutable por sistema, sin servidor.
- Interfaz en **Svelte 5** + TypeScript; iconos Lucide; fuentes Inter y JetBrains Mono (incluidas, sin internet);
  terminal con xterm.js y editor con CodeMirror 6.
- SSH con `golang.org/x/crypto/ssh`; llavero con `zalando/go-keyring`; bóveda y copia cifradas con Argon2id + XChaCha20-Poly1305.
- **Ansible se ejecuta en el servidor** (en un entorno propio), así que no hace falta instalarlo en tu equipo, ni siquiera en Windows.

## Desarrollo

Go 1.26+ y Node 20+. En Linux, además, las librerías de WebKitGTK (una sola vez):

```bash
make deps-linux   # sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev
make doctor       # wails doctor
```

| Comando | Qué hace |
|---|---|
| `make test` | Tests de Go (incluye un servidor SSH en memoria) + comprobación de tipos |
| `make dev` | App de escritorio con recarga en caliente |
| `make demo` | Solo la interfaz en el navegador, con datos simulados |
| `make capturas` | Rehace las capturas de la ayuda (necesita Chrome o Chromium) |
| `make build` | Ejecutable en `build/bin/draupnode` |
| `make install-linux` | Instala en tu usuario, sin sudo: menú de aplicaciones e icono en el dock |

**Publicar una versión**: cambia `Version` en `app.go`, apúntalo en `docs/HISTORIAL.md` y sube una etiqueta
(`git tag v0.43.0 && git push origin v0.43.0`). GitHub Actions compila los instaladores de los tres sistemas y crea
la Release (`.github/workflows/release.yml`). En cada push a `main` se pasan los tests (`pruebas.yml`).

### Servidor de pruebas

Desde la app: «Servidor de pruebas» crea un Ubuntu 24.04 en Docker (con systemd y SSH) y lo da de alta.
O a mano: `bash pruebas/servidor-ubuntu/servidor.sh arrancar`.

## Estructura

```
main.go, app*.go         Arranque de Wails y métodos que llama la interfaz (uno por tema: servidores, plantillas, copias…)
internal/store           Configuración local (draupnode.json, permisos 0600)
internal/secrets         Llavero del sistema y bóveda cifrada
internal/copia           Copia cifrada de Draupnode (exportar/importar)
internal/sshx            Conexión SSH, huellas y comprobación del servidor
internal/modules         Catálogo: module.yaml + roles de Ansible (builtin/ va dentro del ejecutable)
internal/bundle          Genera el instalar.sh único (playbook + roles + callback, empaquetados)
internal/runner          Sube y ejecuta el instalar.sh por SSH, con eventos en directo
internal/overview        Script que lee el estado del servidor para su ficha (solo lectura)
internal/dockerize       Docker Creator
internal/lab             Servidor de pruebas
frontend/src/views       Pantallas
frontend/src/components  Piezas reutilizables
docs/                    PLAN.md (fases) e HISTORIAL.md (cambios)
```

## Dónde guarda las cosas

| Qué | Dónde |
|---|---|
| Servidores, plantillas y ajustes | `~/.config/draupnode/draupnode.json` (Linux), `~/Library/Application Support/draupnode/` (macOS), `%AppData%\draupnode\` (Windows) |
| Huellas aceptadas | `known_hosts` en esa misma carpeta (también se lee `~/.ssh/known_hosts`) |
| Contraseñas | Llavero del sistema (servicio `draupnode`) o `vault.json` cifrado en la carpeta de configuración |
| Módulos propios | `modules/` en la carpeta de configuración |
| Registros de cada ejecución | `runs/` en la carpeta de configuración (los 60 últimos por plantilla y servidor) |
| En cada servidor | `/etc/draupnode/secretos/<plantilla>/` (contraseñas generadas, solo root), `/etc/draupnode/plantillas/` (ficha sin contraseñas), `/srv/draupnode/apps/` (datos de las apps) |

## Publicar tu app

Guía paso a paso (crear los ficheros de Docker, publicar en un servidor, revisar la configuración y subir, con o sin GitHub): [docs/GUIA_PUBLICAR.md](docs/GUIA_PUBLICAR.md).
