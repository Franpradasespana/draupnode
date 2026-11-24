# Fichas de las apps (las lee gen.py).
APPS = {}

UPDATE = lambda p, short: f"""- name: {p}_update
  label: Actualizar {short} al aplicar
  help: Descarga la última versión de la imagen cada vez que aplicas.
  type: bool
  default: true"""

APPS['vaultwarden'] = dict(
    links=[('Código fuente y wiki', 'https://github.com/dani-garcia/vaultwarden'), ('Apps de Bitwarden', 'https://bitwarden.com/download/')],
    id='vaultwarden', name='Vaultwarden (contraseñas)', short='Vaultwarden', license='AGPL-3.0',
    description='Tu gestor de contraseñas, compatible con las apps y extensiones de Bitwarden. Tus contraseñas, en tu servidor.',
    details="""Vaultwarden (servidor libre compatible con Bitwarden) en Docker.
Necesita HTTPS: ponle dominio (con Caddy o nginx en el servidor) o entra
por la VPN/«Abrir» (127.0.0.1 también vale como seguro).
Crea tu cuenta y, cuando estéis todos, desactiva «Permitir registrarse»
y vuelve a aplicar. El panel /admin usa el «Token de administración»
(en «Contraseñas»).""",
    port=8222, cport=80, data_desc='la bóveda cifrada de todos los usuarios', dirs=['data'],
    secrets=[('vaultwarden_admin_token', 'Token del panel /admin de Vaultwarden')],
    generate=[dict(file='vaultwarden_admin_token', var='admin_token', len=48)],
    vars=[
        """- name: vaultwarden_signups
  label: Permitir registrarse
  help: Déjalo activado para crear vuestras cuentas; luego desactívalo y aplica.
  type: bool
  default: true""",
        UPDATE('vaultwarden', 'Vaultwarden'),
    ],
    compose="""  vaultwarden:
    image: vaultwarden/server:latest
    {% if vaultwarden_update | bool %}pull_policy: always
    {% endif %}container_name: dn-vaultwarden
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
{% if vaultwarden_domain %}      DOMAIN: "https://{{ vaultwarden_domain }}"
{% endif %}      SIGNUPS_ALLOWED: "{{ 'true' if vaultwarden_signups | bool else 'false' }}"
      ADMIN_TOKEN: "{{ vaultwarden_admin_token }}"
      WEBSOCKET_ENABLED: "true"
    volumes:
      - ./data:/data
@@PORTS@@""",
    note="{{ 'Registro ABIERTO: cuando tengáis las cuentas, desactiva «Permitir registrarse» y aplica.' if vaultwarden_signups | bool else 'Registro cerrado.' }} Panel de administración en /admin (token en «Contraseñas del proyecto»).",
    check='/alive',
)

APPS['navidrome'] = dict(
    links=[('Web oficial', 'https://www.navidrome.org'), ('Código fuente', 'https://github.com/navidrome/navidrome')],
    id='navidrome', name='Navidrome (música)', short='Navidrome', license='GPL-3.0',
    description='Tu propio Spotify: escucha tu colección de música desde el navegador o el móvil (apps compatibles con Subsonic).',
    details="""Navidrome en Docker. Lee la música de la carpeta indicada (solo
lectura) y la vuelve a mirar sola cada hora. El primer usuario que
entra se queda de administrador: entra enseguida después de aplicar.
Apps de móvil compatibles (Subsonic): Symfonium, Tempo, Substreamer, play:Sub…""",
    port=4533, cport=4533, data_desc='la base de datos de Navidrome (usuarios, listas, favoritos; tu música no se toca)', dirs=['data'],
    vars=[
        """- name: navidrome_music
  label: Carpeta de la música
  help: Donde está tu música en el servidor (súbela con SFTP, Syncthing…).
  type: string
  default: /srv/musica
  pattern: '^/[A-Za-z0-9._/ -]+$'
  pattern_help: Ruta absoluta""",
        UPDATE('navidrome', 'Navidrome'),
    ],
    pre_tasks="""
- name: Carpeta de la música
  ansible.builtin.file:
    path: "{{ navidrome_music }}"
    state: directory
    mode: "0755"
""",
    compose="""  navidrome:
    image: deluan/navidrome:latest
    {% if navidrome_update | bool %}pull_policy: always
    {% endif %}container_name: dn-navidrome
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      ND_SCANSCHEDULE: 1h
      ND_LOGLEVEL: info
      ND_BASEURL: ""
    volumes:
      - ./data:/data
      - "{{ navidrome_music }}:/music:ro"
@@PORTS@@""",
    note="Entra enseguida y crea el usuario administrador (el primero que entra lo es). Música en {{ navidrome_music }}.",
    check='/ping',
)

APPS['jellyfin'] = dict(
    links=[('Web oficial', 'https://jellyfin.org'), ('Código fuente', 'https://github.com/jellyfin/jellyfin')],
    id='jellyfin', name='Jellyfin (películas y series)', short='Jellyfin', license='GPL-2.0',
    description='Tu propio Netflix: películas, series y fotos desde el navegador, la tele o el móvil.',
    details="""Jellyfin en Docker. Lee tus vídeos de la carpeta indicada (solo
lectura). La primera vez, entra y sigue el asistente (crea el
administrador y añade la biblioteca «/media»).
Convertir vídeo en directo gasta mucha CPU: mejor clientes que lo
reproduzcan tal cual (la app de Jellyfin, Kodi…).""",
    port=8096, cport=8096, ram=1500, data_desc='la configuración y la caché de Jellyfin (tus vídeos no se tocan)', dirs=['config', 'cache'],
    vars=[
        """- name: jellyfin_media
  label: Carpeta de los vídeos
  type: string
  default: /srv/media
  pattern: '^/[A-Za-z0-9._/ -]+$'
  pattern_help: Ruta absoluta""",
        UPDATE('jellyfin', 'Jellyfin'),
    ],
    pre_tasks="""
- name: Carpeta de los vídeos
  ansible.builtin.file:
    path: "{{ jellyfin_media }}"
    state: directory
    mode: "0755"
""",
    compose="""  jellyfin:
    image: jellyfin/jellyfin:latest
    {% if jellyfin_update | bool %}pull_policy: always
    {% endif %}container_name: dn-jellyfin
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      JELLYFIN_PublishedServerUrl: "{{ ('https://' ~ jellyfin_domain) if jellyfin_domain else '' }}"
    volumes:
      - ./config:/config
      - ./cache:/cache
      - "{{ jellyfin_media }}:/media:ro"
@@PORTS@@""",
    note="Entra y sigue el asistente: crea el administrador y añade la biblioteca /media (en el servidor: {{ jellyfin_media }}).",
    check='/health',
)

APPS['syncthing'] = dict(
    links=[('Web oficial', 'https://syncthing.net'), ('Código fuente', 'https://github.com/syncthing/syncthing')],
    id='syncthing', name='Syncthing (sincronizar carpetas)', short='Syncthing', license='MPL-2.0',
    description='Sincroniza carpetas entre tus equipos y el servidor, sin nube de nadie. Por ejemplo, para subir tu música o tus fotos.',
    details="""Syncthing en Docker. Su panel solo se ve desde el servidor («Abrir»
o la VPN): ponle usuario y contraseña la primera vez (Acciones →
Ajustes → GUI). Para sincronizar con tus equipos usa el puerto 22000
(TCP y UDP), que se abre en el Cortafuegos; en la nube, ábrelo también
en el cortafuegos del proveedor.
Las carpetas sincronizadas quedan en /srv/draupnode/apps/syncthing/data.""",
    port=8384, cport=8384, data_desc='las carpetas sincronizadas en el servidor y la identidad de este Syncthing', dirs=['data'],
    no_public=True, top="firewall_ports: [22000]\n",
    vars=[UPDATE('syncthing', 'Syncthing')],
    compose="""  syncthing:
    image: syncthing/syncthing:latest
    {% if syncthing_update | bool %}pull_policy: always
    {% endif %}container_name: dn-syncthing
    hostname: "{{ draupnode_project }}-syncthing"
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      PUID: "1000"
      PGID: "1000"
    volumes:
      - ./data:/var/syncthing
    ports:
      - "127.0.0.1:{{ syncthing_port }}:8384"
      - "22000:22000/tcp"
      - "22000:22000/udp\"""",
    pre_tasks="""
- name: La carpeta de datos es del usuario 1000 (el de Syncthing)
  ansible.builtin.file:
    path: /srv/draupnode/apps/syncthing/data
    state: directory
    owner: "1000"
    group: "1000"
    mode: "0750"
""",
    note="Ponle usuario y contraseña al panel la primera vez (Acciones → Ajustes → GUI). Puerto de sincronización 22000/TCP y UDP.",
    check='/rest/noauth/health',
)

APPS['forgejo'] = dict(
    links=[('Web oficial', 'https://forgejo.org'), ('Código fuente', 'https://codeberg.org/forgejo/forgejo')],
    id='forgejo', name='Forgejo (tu GitHub)', short='Forgejo', license='GPL-3.0',
    description='Tu propio GitHub: repositorios Git, incidencias, revisiones de código y paquetes, en tu servidor.',
    details="""Forgejo 15 en Docker, con su base SQLite (sin servidor de base de
datos aparte). Draupnode crea el usuario «administrador» con una contraseña
generada en el servidor (en «Contraseñas»).
Git por SSH en el puerto indicado (se abre en el Cortafuegos):
git clone ssh://git@servidor:PUERTO/usuario/repo.git
El registro de usuarios nuevos está cerrado salvo que lo abras.""",
    port=3001, cport=3000, ram=700, data_desc='todos los repositorios, usuarios e incidencias', dirs=['data'],
    fw_extra=['forgejo_ssh_port'],
    secrets=[('forgejo_admin', 'Administrador de Forgejo')],
    generate=[dict(file='.forgejo_admin_pass', var='admin_pass', len=24)],
    vars=[
        """- name: forgejo_ssh_port
  label: Puerto SSH de Git
  help: Para clonar y subir por SSH. No puede ser el del SSH del servidor.
  type: int
  default: 2222
  min: 1024
  max: 65535""",
        """- name: forgejo_registration
  label: Permitir registrarse
  help: Si no, solo el administrador crea usuarios.
  type: bool
  default: false""",
        UPDATE('forgejo', 'Forgejo'),
    ],
    pre_tasks="""
- name: La carpeta de datos es del usuario 1000 (el de Forgejo)
  ansible.builtin.file:
    path: /srv/draupnode/apps/forgejo/data
    state: directory
    owner: "1000"
    group: "1000"
    mode: "0750"
""",
    compose="""  forgejo:
    image: codeberg.org/forgejo/forgejo:15
    {% if forgejo_update | bool %}pull_policy: always
    {% endif %}container_name: dn-forgejo
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      USER_UID: "1000"
      USER_GID: "1000"
      FORGEJO__database__DB_TYPE: sqlite3
      FORGEJO__security__INSTALL_LOCK: "true"
      FORGEJO__service__DISABLE_REGISTRATION: "{{ 'false' if forgejo_registration | bool else 'true' }}"
      FORGEJO__server__ROOT_URL: "{{ ('https://' ~ forgejo_domain ~ '/') if forgejo_domain else ('http://127.0.0.1:' ~ forgejo_port ~ '/') }}"
      FORGEJO__server__SSH_DOMAIN: "{{ forgejo_domain if forgejo_domain else draupnode_host }}"
      FORGEJO__server__SSH_PORT: "{{ forgejo_ssh_port }}"
    volumes:
      - ./data:/data
    ports:
      - "127.0.0.1:{{ forgejo_port }}:3000"
{% if (forgejo_public_port | default(0) | int) > 0 %}      - "{{ forgejo_public_port }}:3000"
{% endif %}      - "{{ forgejo_ssh_port }}:22\"""",
    post_tasks="""
- name: Usuario «admin» (la primera vez)
  ansible.builtin.shell: |
    # («admin» es un nombre reservado en Forgejo)
    for i in $(seq 30); do docker exec -u git dn-forgejo forgejo admin user list >/dev/null 2>&1 && break; sleep 2; done
    docker exec -u git dn-forgejo forgejo admin user list 2>/dev/null | awk '{print $2}' | grep -qx administrador && exit 0
    docker exec -u git dn-forgejo forgejo admin user create --admin --username administrador --email administrador@{{ forgejo_domain if forgejo_domain else 'localhost' }} --password "$P" --must-change-password=false >/dev/null && echo creado
  environment:
    P: "{{ forgejo_admin_pass }}"
  register: forgejo_admin_user
  changed_when: "'creado' in forgejo_admin_user.stdout"
  no_log: true
  when: not ansible_check_mode

- name: Usuario y contraseña, para verlos en la app
  ansible.builtin.copy:
    dest: "{{ draupnode_secrets_dir }}/forgejo_admin"
    mode: "0600"
    content: "Usuario: administrador\\nContraseña: {{ forgejo_admin_pass }}\\n"
  no_log: true
  when: not ansible_check_mode
""",
    note="Entra con «administrador» (contraseña en «Contraseñas del proyecto»). Git por SSH en el puerto {{ forgejo_ssh_port }}.",
    check='/api/healthz', retries=60,
)

APPS['paperless'] = dict(
    links=[('Documentación', 'https://docs.paperless-ngx.com'), ('Código fuente', 'https://github.com/paperless-ngx/paperless-ngx')],
    id='paperless', name='Paperless-ngx (documentos)', short='Paperless-ngx', license='GPL-3.0',
    description='Escanea o sube tus papeles (facturas, contratos, recibos…) y encuéntralos al momento: lee el texto (OCR), los etiqueta y los archiva.',
    details="""Paperless-ngx en Docker, con su propio PostgreSQL y Valkey (compatible con Redis). Draupnode
crea el usuario «admin» con una contraseña generada en el servidor (en
«Contraseñas»). Lo que dejes en la carpeta «consume» (por
ejemplo con Syncthing o desde el escáner) se importa solo.
La primera vez tarda unos minutos en arrancar.""",
    port=8010, cport=8000, ram=2000, data_desc='todos los documentos, su base de datos y sus etiquetas', dirs=['data', 'media', 'export', 'consume', 'pgdata'], db_dir='pgdata',
    secrets=[('paperless_admin', 'Usuario «admin» de Paperless-ngx')],
    generate=[dict(file='paperless_admin', var='admin_pass', len=24), dict(file='.paperless_secret_key', var='secret_key', len=50), dict(file='.paperless_db', var='db_pass', len=32)],
    vars=[
        """- name: paperless_ocr_language
  label: Idioma de los documentos (OCR)
  type: select
  options: [spa, spa+eng, eng, cat, spa+cat]
  default: spa+eng""",
        UPDATE('paperless', 'Paperless-ngx'),
    ],
    compose="""  broker:
    # Valkey (BSD-3) en vez de Redis: desde la 7.4, Redis ya no es software libre.
    image: docker.io/valkey/valkey:9
    container_name: dn-paperless-redis
    restart: unless-stopped
  db:
    image: postgres:16-alpine
    container_name: dn-paperless-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: paperless
      POSTGRES_USER: paperless
      POSTGRES_PASSWORD: "{{ paperless_db_pass }}"
    volumes:
      - ./pgdata:/var/lib/postgresql/data
  paperless:
    image: ghcr.io/paperless-ngx/paperless-ngx:latest
    {% if paperless_update | bool %}pull_policy: always
    {% endif %}container_name: dn-paperless
    restart: unless-stopped
    depends_on: [db, broker]
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      PAPERLESS_REDIS: redis://broker:6379
      PAPERLESS_DBHOST: db
      PAPERLESS_DBPASS: "{{ paperless_db_pass }}"
      PAPERLESS_SECRET_KEY: "{{ paperless_secret_key }}"
      PAPERLESS_ADMIN_USER: admin
      PAPERLESS_ADMIN_PASSWORD: "{{ paperless_admin_pass }}"
      PAPERLESS_URL: "{{ ('https://' ~ paperless_domain) if paperless_domain else '' }}"
      PAPERLESS_OCR_LANGUAGE: "{{ paperless_ocr_language }}"
      PAPERLESS_OCR_LANGUAGES: "{{ paperless_ocr_language | replace('+', ' ') | replace('spa', '') | replace('eng', '') | trim }}"
      PAPERLESS_TIME_ZONE: Europe/Madrid
    volumes:
      - ./data:/usr/src/paperless/data
      - ./media:/usr/src/paperless/media
      - ./export:/usr/src/paperless/export
      - ./consume:/usr/src/paperless/consume
@@PORTS@@""",
    note="Entra con «admin» (contraseña en «Contraseñas del proyecto»). Lo que pongas en {{ paperless_dir }}/consume se importa solo.",
    check='/accounts/login/', retries=100,
)

APPS['immich'] = dict(
    links=[('Web oficial', 'https://immich.app'), ('Código fuente', 'https://github.com/immich-app/immich')],
    id='immich', name='Immich (fotos y vídeos)', short='Immich', license='AGPL-3.0',
    description='Tu propio Google Fotos: copia automática de las fotos del móvil, álbumes, búsqueda por lo que sale en la foto y por caras.',
    details="""Immich (versión 3) en Docker, como su compose oficial: servidor,
aprendizaje automático (búsqueda y caras), Valkey y su PostgreSQL con
vectores. Es pesado: pide 4 GB de RAM y la primera vez descarga unos
3 GB. El primer usuario que entra se queda de administrador: entra
enseguida después de aplicar.
En el móvil, la app de Immich con la dirección del servidor (mejor con
dominio y HTTPS, o por la VPN).
Las fotos están en /srv/draupnode/apps/immich/library (entran en las
copias: pueden ocupar mucho).""",
    port=2283, cport=2283, ram=4000, data_desc='todas las fotos y vídeos subidos y su base de datos', dirs=['library', 'postgres'], db_dir='postgres',
    generate=[dict(file='.immich_db', var='db_pass', len=32)],
    vars=[UPDATE('immich', 'Immich')],
    compose="""  immich-server:
    image: ghcr.io/immich-app/immich-server:v3
    {% if immich_update | bool %}pull_policy: always
    {% endif %}container_name: dn-immich
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment: &env
      DB_HOSTNAME: database
      DB_USERNAME: postgres
      DB_PASSWORD: "{{ immich_db_pass }}"
      DB_DATABASE_NAME: immich
      REDIS_HOSTNAME: redis
      TZ: Europe/Madrid
    volumes:
      - ./library:/data
      - /etc/localtime:/etc/localtime:ro
    depends_on: [redis, database]
@@PORTS@@
  immich-machine-learning:
    image: ghcr.io/immich-app/immich-machine-learning:v3
    {% if immich_update | bool %}pull_policy: always
    {% endif %}container_name: dn-immich-ml
    restart: unless-stopped
    environment:
      <<: *env
      MACHINE_LEARNING_MODEL_REVISION: v2
    volumes:
      - model-cache:/cache
  redis:
    image: docker.io/valkey/valkey:9
    container_name: dn-immich-redis
    restart: unless-stopped
    healthcheck:
      test: redis-cli ping | grep -q PONG || exit 1
  database:
    image: ghcr.io/immich-app/postgres:14-vectorchord0.4.3-pgvectors0.2.0
    container_name: dn-immich-db
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: "{{ immich_db_pass }}"
      POSTGRES_USER: postgres
      POSTGRES_DB: immich
      POSTGRES_INITDB_ARGS: "--data-checksums"
    volumes:
      - ./postgres:/var/lib/postgresql/data
    shm_size: 128mb

volumes:
  model-cache:""",
    note="Entra enseguida y crea el administrador (el primero que entra lo es).",
    check='/api/server/ping', retries=100,
)
