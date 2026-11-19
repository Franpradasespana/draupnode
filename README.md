# Draupnode

> En la mitología nórdica, **Draupnir** es el anillo de oro forjado por los enanos Brokkr y Eitri:
> cada nueve noches nacen de él ocho anillos idénticos.
> **Draupnode** hace lo mismo con servidores: describes una vez lo que quieres y lo forja en cualquier máquina Linux, de cero.

Aplicación de escritorio (Windows, macOS y Linux) para preparar servidores Linux desde cero:
das de alta tus servidores por SSH, eliges módulos de un catálogo (Docker, Coolify, k3s, OpenTofu, tus apps de GitHub/GitLab…),
rellenas sus datos en formularios y Draupnode lo instala con **Ansible**, o te genera **un único `instalar.sh`**.

**Todo es local.** No hay servidor de Draupnode: la configuración vive en tu equipo, las frases de paso en el llavero del sistema
y lo único que sale es la conexión SSH a *tus* servidores.

## Estado

Versión **0.3.0** · fases 1 y 2 de [docs/PLAN.md](docs/PLAN.md).

| Hecho | Pendiente |
|---|---|
| Servidores: alta, edición, borrado | Módulos: app desde GitHub vía Coolify, monitorización, copias |
| SSH con clave (OpenSSH, PEM `.key`, PuTTY `.ppk`) con o sin contraseña, o con usuario y contraseña | Editor Monaco y terminal SSH (fase 3) |
| Contraseñas en el llavero del sistema o en una bóveda cifrada propia (Argon2id + XChaCha20-Poly1305) | Instaladores para los 3 sistemas (fase 4) |
| Verificación de huella (known_hosts) y aviso de huella cambiada | |
| Catálogo de módulos (base, cortafuegos, Docker, Coolify, PostgreSQL) y módulos propios | |
| Proyectos: formularios generados, dependencias automáticas, validación | |
| Previsualizar / Aplicar por SSH con progreso en directo, o exportar un único `instalar.sh` | |
| «Probar conexión»: sistema, RAM, disco, sudo, herramientas | |
| 15 temas (12 de las láminas + 3 nuevos) y editor de paletas | |

## Tecnología

- **Go** + **[Wails v2](https://wails.io)**: un solo ejecutable por sistema, sin servidor.
- Interfaz en **Svelte 5** + TypeScript; iconos Lucide; fuentes Inter y JetBrains Mono (incluidas, sin internet).
- SSH con `golang.org/x/crypto/ssh`; llavero con `zalando/go-keyring`.
- Ansible se ejecutará **en el servidor** (fase 2), así que el usuario no tiene que instalarlo en su equipo, ni siquiera en Windows.

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
| `make demo` | Solo la interfaz en el navegador, con datos simulados (frase de paso de la demo: `demo`) |
| `make build` | Ejecutable en `build/bin/draupnode` |
| `make build-windows` | `draupnode.exe` compilado desde Linux |
| `make install-linux` | Instala en tu usuario, sin sudo: menú de aplicaciones e icono en el dock |

### Servidor de pruebas

`bash pruebas/servidor-ubuntu/servidor.sh arrancar` levanta un Ubuntu 24.04 en Docker (systemd, SSH en 127.0.0.1:2222, usuario `ubuntu`) para probar proyectos sin tocar un servidor real. Al terminar muestra los datos para darlo de alta en Draupnode.

macOS hay que compilarlo en un Mac (o con GitHub Actions, fase 4).

## Estructura

```
main.go, app.go          Arranque de Wails y métodos que llama la interfaz
internal/store           Configuración local (draupnode.json, permisos 0600)
internal/secrets         Llavero del sistema
internal/sshx            Conexión SSH, huellas y comprobación del servidor
internal/modules         Catálogo: module.yaml + roles de Ansible (builtin/ va dentro del ejecutable)
internal/bundle          Genera el instalar.sh único (playbook + roles + callback, empaquetados)
internal/runner          Sube y ejecuta el instalar.sh por SSH, con eventos en directo
frontend/src/lib         API, estado, paletas
frontend/src/views       Pantallas (Panel, Servidores, Ajustes…)
frontend/src/components  Piezas reutilizables (Modal, Logo, vista previa de paletas…)
docs/                    PLAN.md (fases) e HISTORIAL.md (cambios)
```

## Dónde guarda las cosas

| Qué | Dónde |
|---|---|
| Servidores y ajustes | `~/.config/draupnode/draupnode.json` (Linux), `~/Library/Application Support/draupnode/` (macOS), `%AppData%\draupnode\` (Windows) |
| Huellas aceptadas | `known_hosts` en esa misma carpeta (también se lee `~/.ssh/known_hosts`) |
| Contraseñas | Llavero del sistema (servicio `draupnode`) o `vault.json` cifrado en la carpeta de configuración |
