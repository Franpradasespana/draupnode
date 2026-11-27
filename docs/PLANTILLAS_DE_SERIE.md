# Plantillas de serie (estudio, 2026-11-27)

Idea del usuario: que Draupnode traiga hechas algunas plantillas con los módulos más habituales, para que quien
empieza no tenga que montarlas a mano. Este documento recoge **qué monta la gente de verdad** y propone la lista,
usando solo módulos que ya están en el catálogo (todos de código abierto).

## De dónde salen los datos

- **Encuesta anual de selfh.st 2025**: 4.081 respuestas, datos en bruto en
  `github.com/selfhst/cdn/…/surveys/annual/2025-results.json`. Es la fuente más amplia sobre autoalojamiento. Su
  público es más de «casa» que de VPS, pero un 34 % usa VPS en la nube.
- **Guía de Virtua Cloud «Self-Host Apps on a VPS»**: RAM medida app por app en un VPS de 8 GB con Debian 12, y
  combinaciones de inicio para 4 y 8 GB. Es la guía de un proveedor, con sus propias medidas: sirve como orientación.

## Lo que dice la encuesta (lo que importa para las plantillas)

| Tema | Resultado | Qué significa para Draupnode |
|---|---|---|
| Para qué | Personal 84 %, personal + trabajo 16 % | Las plantillas deben pensar en una persona o una familia (el 49 % sirve a 1-2 usuarios) |
| Contenedores | Docker 92 %; 69 % lo mete todo en contenedores | Docker en casi todas las plantillas |
| Acceso desde fuera | VPN 71 %, proxy inverso 67 % (la mayoría, las dos cosas) | Una plantilla de VPN y un proxy con HTTPS (Caddy) en las de apps |
| Proxy inverso | NGINX Proxy Manager 31 %, Traefik 28 %, Caddy 22 %, nginx 19 % | Caddy, por ser el que pone HTTPS solo; nginx queda como alternativa en el catálogo |
| Dominio propio | 88 % | Las plantillas con web dan por hecho que hay dominio (con aviso si no lo hay) |
| Copias | En el mismo sitio 75 %, nube 51 %, fuera 25 %, **ninguna 13 %** | Copias (restic) en TODAS las plantillas; el destino remoto, en «Destino de copias» |
| Actualizar | A mano 45 %, según el caso 40 %, solas 15 % | «Actualizar las apps solas» como opción, no de serie |
| Panel de Docker | Portainer 66 % de los que usan uno; Coolify 3 % | Portainer o Dozzle en las de apps; Coolify como plantilla aparte |
| Base de datos | En su propio contenedor 84 %, compartida 22 % | Solo las plantillas de desarrollo traen PostgreSQL compartido |
| Multimedia | Jellyfin 61 %, Audiobookshelf 21 %, Navidrome 16 % | Plantilla «Multimedia» con los tres |
| Archivos | Nextcloud 30 %, Syncthing 26 % | Una con Nextcloud (nube completa) y otra con Syncthing (sincronizar, más ligera) |
| Inicio de sesión único | authentik 18 %, Authelia 10 %, Keycloak 4 % | Authelia en la de seguridad reforzada (authentik no está en el catálogo) |
| Git | Gitea 21 %, Forgejo 15 % | Forgejo (+ Runner) para la de desarrollo |
| Correo | El 86 % no lo autoaloja | Sin plantilla de correo; msmtp (solo enviar avisos) sí en la base |
| Favoritos | Home Assistant 16 %, Jellyfin 14 %, Immich 12 %, Vaultwarden 4 %, Nextcloud 3 %, Paperless 2 % | Confirman las plantillas de familia, multimedia y documentos |

## RAM orientativa (Virtua Cloud, en reposo / en pico)

Vaultwarden 25/50 MB · Uptime Kuma 100/170 MB · Beszel 50/80 MB · Gitea/Forgejo ~150/300 MB · Nextcloud 250/512 MB ·
Paperless-ngx 300 MB/1 GB · Coolify 500 MB/1,2 GB · Immich 800 MB/2,5 GB (4-6 GB con el reconocimiento de caras y
objetos). La guía recomienda empezar por Vaultwarden, dejar al menos 1,5 GB libres si hay Immich, y no poner Immich
con reconocimiento en un VPS de 4 GB salvo que vaya solo.

## Cómo encajan con lo que ya hace Draupnode

- Ahora se pueden **aplicar varias plantillas en el mismo servidor** (se suman sus módulos). Así que lo práctico es
  **una base que va siempre y plantillas que se suman encima**, en vez de muchas plantillas grandes que repiten lo
  mismo.
- Cada plantilla añade sola los módulos de los que depende (Docker, Sistema base…).
- Ojo a los choques que ya existen en el catálogo: **Coolify no puede ir con Caddy ni con nginx** (trae su propio
  proxy). La plantilla de Coolify no se puede sumar a las que traen Caddy, y lo diría al elegirla.

## Propuesta: 9 plantillas

Las nueve llevan **Sistema base + Hora exacta + Cortafuegos + SSH seguro + Copias + Alertas**, que es lo que forma la
plantilla 1. RAM = lo que usan las apps, aproximado.

| # | Plantilla | Para quién | Módulos (además de la base) | RAM mínima del servidor |
|---|---|---|---|---|
| 1 | **Servidor seguro** (el punto de partida) | Todos | base, chrony, firewall, ssh, backups, alerts, msmtp | 1 GB |
| 2 | **Webs con HTTPS** | Quien publica una web o una app propia | docker, caddy, git-app, postgres, monitoring, uptime-kuma, umami | 3 GB (2 GB cambiando monitoring por beszel) |
| 3 | **Plataforma tipo Heroku (Coolify)** | Quien quiere desplegar desde un panel | docker, coolify, postgres (en la red `coolify`), monitoring, uptime-kuma · *no se suma a las que traen Caddy* | 4 GB |
| 4 | **Familia: contraseñas, fotos y archivos** | Una casa | docker, caddy, vaultwarden, immich, nextcloud | 4 GB (6-8 con reconocimiento en Immich) |
| 5 | **Multimedia** | Películas, música y audiolibros | docker, caddy, jellyfin, navidrome, audiobookshelf | 2 GB (más si Jellyfin convierte vídeo) |
| 6 | **Acceso privado (VPN sin anuncios)** | Entrar desde fuera sin abrir nada más | wireguard, adguard | 1 GB |
| 7 | **Vigilancia** | Ver cómo va el servidor y enterarse si algo cae | docker, monitoring, logs, uptime-kuma, ntfy, dozzle | 2 GB |
| 7b | *Vigilancia ligera* (variante) | VPS pequeños | docker, beszel, uptime-kuma, ntfy | 1 GB |
| 8 | **Taller de desarrollo** | Código propio y CI | docker, caddy, forgejo, forgejo-runner, registry, postgres, valkey, git-app | 4 GB |
| 9 | **Oficina y documentos** | Papeles, tareas, wiki y lecturas | docker, caddy, paperless, vikunja, wikijs, freshrss, linkwarden | 4 GB |
| + | **Seguridad reforzada** (para sumar a cualquiera) | Servidores expuestos o con datos delicados | crowdsec, lynis, aide, auditd, trivy, authelia | +1 GB |

Combinaciones típicas: 1 + 6 + 4 (casa con VPN), 1 + 2 + 7b (web pequeña), 1 + 3 + 7 (empresa pequeña con Coolify),
1 + 8 + 7 + «Seguridad reforzada».

### Lo que se queda fuera a propósito

- **Correo completo (Stalwart)**: el 86 % no se autoaloja el correo y montarlo bien (DNS, reputación) es delicado.
  Sigue en el catálogo, no en una plantilla.
- **Kubernetes (k3s, Argo CD, OpenTofu)**: el 77 % no usa orquestación; es para quien ya sabe lo que quiere.
- **Home Assistant**: es el favorito de la encuesta, pero casi siempre va en casa con dispositivos USB y red local,
  no en un VPS. Se podría añadir más adelante una plantilla «Domótica» para servidores en casa.
- **IA (Ollama)**: pide mucha RAM o una tarjeta gráfica; mejor elegirla a mano.

## Cómo meterlas en la app (propuesta)

- Ficheros `internal/plantillas/<id>.yaml` incrustados en el binario (como los módulos): nombre, descripción, para
  quién, RAM mínima, módulos y valores. Español e inglés, como el resto.
- En **Plantillas**, un apartado «De serie» encima de las tuyas: se ven y se aplican, pero no se cambian. Con
  **«Duplicar para cambiarla»** pasa a tus plantillas. Así, al actualizar Draupnode las de serie mejoran solas y las
  tuyas no se tocan.
- Al aplicar: aviso si el servidor tiene menos RAM de la mínima (Draupnode ya la lee en la ficha) y si choca con lo
  que ya hay (por ejemplo, Coolify con Caddy).
- Test: que cada plantilla de serie pase la validación del catálogo (dependencias, choques y valores) para que no se
  rompa al cambiar un módulo.

## Decidido con el usuario (2026-11-27)

- La 2 lleva también **Monitorización** (Prometheus + Grafana).
- La 3 (Coolify) lleva **PostgreSQL compartido** y **Monitorización**. Comprobado que no chocan: la base interna de
  Coolify es `coolify-db` y la compartida `pg-compartido`; Grafana va en 127.0.0.1:3000 y Prometheus en
  127.0.0.1:19090, y Coolify usa el 8000, 6001, 6002, 80, 443 y el 8080 de su proxy (cAdvisor no publica el suyo).
  Al montarla: en esta plantilla `postgres_network: coolify`, para que las apps de Coolify vean la base, y el
  módulo PostgreSQL con `after: [coolify]`, para no crear la red `coolify` antes que el instalador de Coolify.

## Por decidir con el usuario

1. ¿Vale la lista de 9 (+ «Seguridad reforzada»), o quitamos o juntamos alguna?
2. ¿Las de serie se quedan de solo lectura con «Duplicar», o se copian a tus plantillas la primera vez que abres la app?
3. ¿Hace falta una plantilla «Domótica / servidor en casa» (Home Assistant, Samba, Syncthing)?
