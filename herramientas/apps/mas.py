# Fichas de las apps añadidas en la 0.71 (las lee gen.py junto con apps.py y nuevas.py).
# Todas son software libre; la licencia sale en su ficha del Catálogo.
from apps import APPS, UPDATE
from nuevas import usuario_en_secretos

RED = '1 · Sistema'
MON = '6 · Monitorización'
APPS_CAT = '7 · Apps'
SEG = '8 · Seguridad'
DEV = '7 · Apps'

# ------------------------------------------------------------------ Seguridad

APPS['authelia'] = dict(
    category=SEG,
    links=[('Web oficial', 'https://www.authelia.com'), ('Documentación', 'https://www.authelia.com/configuration/prologue/introduction/'), ('Código fuente', 'https://github.com/authelia/authelia')],
    id='authelia', name='Authelia (inicio de sesión único y doble factor)', short='Authelia', license='Apache-2.0',
    description='Una puerta delante de tus apps: antes de entrar en ellas hay que iniciar sesión (con doble factor si quieres). Protege apps que no tienen usuarios propios o que no deberían estar a la vista.',
    details="""Authelia en Docker, con su base SQLite y un usuario «admin» con la
contraseña generada en el servidor (en «Contraseñas»).
Necesita su propio dominio (por ejemplo auth.ejemplo.com) y que las apps
que protege estén bajo el mismo dominio principal (ejemplo.com), porque
la sesión va en una cookie de ese dominio. En «Dominios protegidos» pon
los de las apps que quieras tapar: Draupnode configura Caddy para que
pregunte a Authelia antes de dejar pasar (con nginx no se hace sola).
Los mensajes que Authelia mandaría por correo (por ejemplo, el código
para registrar el doble factor) quedan en config/notificaciones.txt.""",
    port=9091, cport=9091, data_desc='sus usuarios, la base de datos y la configuración', dirs=['config'],
    domain_help='Obligatorio: el dominio del portal de Authelia (auth.ejemplo.com). Necesita Caddy en el servidor.',
    secrets=[('authelia_admin', 'Usuario «admin» de Authelia')],
    generate=[dict(file='.authelia_admin_pass', var='admin_pass', len=24), dict(file='.authelia_jwt', var='jwt', len=64),
              dict(file='.authelia_session', var='session', len=64), dict(file='.authelia_storage', var='storage', len=64)],
    vars=["""- name: authelia_protect
  label: Dominios protegidos
  help: Uno por línea. Para entrar en ellos habrá que iniciar sesión en Authelia. Tienen que ser del mismo dominio principal que el de Authelia.
  type: list
  default: []
  pattern: '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}$'
  pattern_help: Un dominio (app.ejemplo.com)""",
          """- name: authelia_policy
  label: Cómo se entra
  help: «two_factor» = contraseña y además un código del móvil (lo recomendado). «one_factor» = solo contraseña.
  type: select
  options: [two_factor, one_factor]
  default: two_factor""",
          UPDATE('authelia', 'Authelia')],
    pre_tasks="""
- name: Authelia necesita su dominio
  ansible.builtin.assert:
    that: authelia_domain | length > 0 and (authelia_domain.split('.') | length) > 2
    fail_msg: "Pon el dominio del portal de Authelia, con algo delante del dominio principal (auth.ejemplo.com)."
- name: Dominio principal (el de la cookie de la sesión)
  ansible.builtin.set_fact:
    authelia_cookie_domain: "{{ authelia_domain.split('.', 1)[1] }}"
- name: Los dominios protegidos tienen que colgar del principal
  ansible.builtin.assert:
    that: authelia_protect | reject('search', '(^|\\\\.)' ~ (authelia_cookie_domain | regex_escape) ~ '$') | list | length == 0
    fail_msg: "Estos dominios no son de {{ authelia_cookie_domain }}: {{ authelia_protect | reject('search', '(^|\\\\.)' ~ (authelia_cookie_domain | regex_escape) ~ '$') | join(', ') }}"
""",
    mid_tasks="""
- name: Configuración de Authelia
  ansible.builtin.copy:
    dest: "{{ authelia_dir }}/config/configuration.yml"
    mode: "0600"
    content: |
      # Generado por Draupnode (módulo authelia). Se reescribe al aplicar.
      server:
        address: 'tcp://0.0.0.0:9091/'
      log:
        level: info
      theme: auto
      identity_validation:
        reset_password:
          jwt_secret: '{{ authelia_jwt }}'
      totp:
        issuer: '{{ authelia_cookie_domain }}'
      authentication_backend:
        file:
          path: /config/users.yml
          password:
            algorithm: argon2
      access_control:
        default_policy: '{{ authelia_policy }}'
      session:
        secret: '{{ authelia_session }}'
        cookies:
          - domain: '{{ authelia_cookie_domain }}'
            authelia_url: 'https://{{ authelia_domain }}'
      storage:
        encryption_key: '{{ authelia_storage }}'
        local:
          path: /config/db.sqlite3
      notifier:
        filesystem:
          filename: /config/notificaciones.txt
  no_log: true
  when: not ansible_check_mode

- name: ¿Está ya el usuario «admin»?
  ansible.builtin.stat:
    path: "{{ authelia_dir }}/config/users.yml"
  register: authelia_users

- name: Cifrar la contraseña de «admin» (argon2, con la propia Authelia)
  ansible.builtin.command:
    argv: [docker, run, --rm, docker.io/authelia/authelia:4.39, authelia, crypto, hash, generate, argon2, --password, "{{ authelia_admin_pass }}"]
  register: authelia_hash
  no_log: true
  when: not ansible_check_mode and not authelia_users.stat.exists

- name: Usuario «admin»
  ansible.builtin.copy:
    dest: "{{ authelia_dir }}/config/users.yml"
    mode: "0600"
    content: |
      users:
        admin:
          disabled: false
          displayname: 'Administrador'
          password: '{{ authelia_hash.stdout | regex_search('\\$argon2\\S+') }}'
          email: 'admin@{{ authelia_cookie_domain }}'
          groups: [admins]
  no_log: true
  when: not ansible_check_mode and not authelia_users.stat.exists
""" + usuario_en_secretos('authelia', 'authelia_admin', 'admin', 'admin_pass'),
    compose="""  authelia:
    image: docker.io/authelia/authelia:4.39
    {% if authelia_update | bool %}pull_policy: always
    {% endif %}container_name: dn-authelia
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      TZ: Etc/UTC
    volumes:
      - ./config:/config
@@PORTS@@""",
    check='/api/health', retries=40,
    note="Entra en https://{{ authelia_domain }} con «admin» (contraseña en «Contraseñas»). El código para registrar el doble factor queda en {{ authelia_dir }}/config/notificaciones.txt.",
)

# ------------------------------------------------------------------ Red y VPN

APPS['headscale'] = dict(
    category=RED,
    links=[('Documentación', 'https://headscale.net'), ('Código fuente', 'https://github.com/juanfont/headscale'), ('Apps de Tailscale (clientes)', 'https://tailscale.com/download')],
    id='headscale', name='Headscale (red privada entre tus equipos)', short='Headscale', license='BSD-3-Clause',
    description='Una red privada entre tus servidores, tu portátil y tu móvil, con las apps de Tailscale pero con el servidor de coordinación en tu casa. Cada equipo se conecta directo con los demás.',
    details="""Headscale (el servidor libre de coordinación de Tailscale) en Docker.
A diferencia de WireGuard (todo pasa por este servidor), aquí los
equipos se hablan directamente entre ellos; este servidor solo los
presenta. Los clientes son las apps de Tailscale (también libres).
Necesita un dominio con HTTPS (Caddy o nginx). Draupnode crea el usuario
de la red y una clave para unir equipos durante 30 días (en
«Contraseñas»): en cada equipo,
tailscale up --login-server https://tu-dominio --authkey LA-CLAVE""",
    port=8380, cport=8080, data_desc='la red, sus equipos y sus claves', dirs=['config', 'lib', 'run'],
    domain_help='Recomendado: los clientes de Tailscale quieren HTTPS (hs.ejemplo.com, con Caddy o nginx).',
    secrets=[('headscale_clave', 'Clave para unir equipos a la red')],
    vars=["""- name: headscale_user
  label: Usuario de la red
  help: Los equipos que unas con la clave quedan a su nombre.
  type: string
  default: casa
  pattern: '^[a-z0-9][a-z0-9-]{0,31}$'
  pattern_help: Minúsculas, números y guiones""",
          """- name: headscale_base_domain
  label: Nombre interno de la red
  help: Cada equipo será «nombre.esto» dentro de la red (MagicDNS). No puede ser tu dominio público.
  type: string
  default: red.interna
  pattern: '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}$'
  pattern_help: Un nombre como red.interna""",
          UPDATE('headscale', 'Headscale')],
    mid_tasks="""
- name: Configuración de Headscale
  ansible.builtin.copy:
    dest: "{{ headscale_dir }}/config/config.yaml"
    mode: "0644"
    content: |
      # Generado por Draupnode (módulo headscale). Se reescribe al aplicar.
      server_url: {{ ('https://' ~ headscale_domain) if headscale_domain else ('http://' ~ ansible_default_ipv4.address | default('127.0.0.1') ~ ':' ~ ((headscale_public_port | int) or (headscale_port | int))) }}
      listen_addr: 0.0.0.0:8080
      metrics_listen_addr: 127.0.0.1:9090
      grpc_listen_addr: 127.0.0.1:50443
      grpc_allow_insecure: false
      noise:
        private_key_path: /var/lib/headscale/noise_private.key
      prefixes:
        v4: 100.64.0.0/10
        v6: fd7a:115c:a1e0::/48
        allocation: sequential
      derp:
        server:
          enabled: false
        urls:
          - https://controlplane.tailscale.com/derpmap/default
        auto_update_enabled: true
        update_frequency: 24h
      disable_check_updates: true
      ephemeral_node_inactivity_timeout: 30m
      database:
        type: sqlite
        sqlite:
          path: /var/lib/headscale/db.sqlite
          write_ahead_log: true
      dns:
        magic_dns: true
        base_domain: {{ headscale_base_domain }}
        nameservers:
          global: [1.1.1.1, 9.9.9.9]
      log:
        level: info
      policy:
        mode: file
        path: ""
      unix_socket: /var/run/headscale/headscale.sock
      unix_socket_permission: "0770"
  when: not ansible_check_mode
""",
    compose="""  headscale:
    image: docker.io/headscale/headscale:0.26
    {% if headscale_update | bool %}pull_policy: always
    {% endif %}container_name: dn-headscale
    restart: unless-stopped
    command: serve
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    volumes:
      - ./config:/etc/headscale:ro
      - ./lib:/var/lib/headscale
      - ./run:/var/run/headscale
@@PORTS@@""",
    post_tasks="""
- name: Usuario de la red
  ansible.builtin.command: docker exec dn-headscale headscale users create {{ headscale_user | quote }}
  register: headscale_u
  changed_when: headscale_u.rc == 0
  failed_when: headscale_u.rc != 0 and 'already exists' not in (headscale_u.stderr ~ headscale_u.stdout) and 'UNIQUE' not in (headscale_u.stderr ~ headscale_u.stdout)
  when: not ansible_check_mode

- name: ¿Hay ya clave para unir equipos?
  ansible.builtin.stat:
    path: "{{ draupnode_secrets_dir }}/headscale_clave"
  register: headscale_k

- name: Usuarios
  ansible.builtin.command: docker exec dn-headscale headscale users list -o json
  register: headscale_users
  changed_when: false
  when: not ansible_check_mode and not headscale_k.stat.exists

- name: Clave para unir equipos (reutilizable, 30 días)
  ansible.builtin.command: >-
    docker exec dn-headscale headscale preauthkeys create --reusable --expiration 720h
    -u {{ (headscale_users.stdout | from_json | selectattr('name', 'equalto', headscale_user) | first).id }}
  register: headscale_key
  no_log: true
  when: not ansible_check_mode and not headscale_k.stat.exists

- name: Guardarla (en «Contraseñas»)
  ansible.builtin.copy:
    dest: "{{ draupnode_secrets_dir }}/headscale_clave"
    mode: "0600"
    content: "Clave: {{ headscale_key.stdout_lines | last }}\\nÚnete con: tailscale up --login-server {{ ('https://' ~ headscale_domain) if headscale_domain else 'http://IP:PUERTO' }} --authkey CLAVE\\nCaduca a los 30 días: para otra, borra este fichero y vuelve a aplicar.\\n"
  no_log: true
  when: not ansible_check_mode and not headscale_k.stat.exists
""",
    check='/health', retries=30,
    note="Une cada equipo con la clave de «Contraseñas»: tailscale up --login-server <dirección> --authkey <clave>. Lista de equipos: docker exec dn-headscale headscale nodes list.",
)

# ------------------------------------------------------------------ Almacenamiento

APPS['garage'] = dict(
    category=APPS_CAT,
    links=[('Web oficial', 'https://garagehq.deuxfleurs.fr'), ('Documentación', 'https://garagehq.deuxfleurs.fr/documentation/quick-start/'), ('Código fuente', 'https://git.deuxfleurs.fr/Deuxfleurs/garage')],
    id='garage', name='Garage (almacenamiento S3 propio)', short='Garage', license='AGPL-3.0',
    description='Tu propio almacenamiento compatible con S3 (como Amazon S3): para copias de seguridad, para apps que guardan ficheros en S3 o para servir ficheros estáticos.',
    details="""Garage en Docker, con un solo nodo. Draupnode lo deja listo: prepara
el nodo, crea un «bucket» y una clave de acceso con permiso para él (en
«Contraseñas»: ID de la clave, secreto, dirección y región «garage»).
Úsalo con cualquier cliente de S3 (rclone, restic, aws-cli…) en modo
«path-style». Con dominio, se publica en https://dominio.""",
    port=3900, cport=3900, data_desc='todos los ficheros guardados y sus metadatos', dirs=['meta', 'data'],
    domain_help='Opcional: s3.ejemplo.com (con Caddy o nginx) para llegar por HTTPS desde otros servidores.',
    secrets=[('garage_s3', 'Clave S3 de Garage')],
    generate=[dict(file='.garage_admin', var='admin_token', len=48)],
    secret_files=['.garage_rpc'],
    vars=["""- name: garage_bucket
  label: Bucket
  help: El que se crea con su clave. Más, con «docker exec dn-garage /garage bucket create <nombre>».
  type: string
  default: copias
  pattern: '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$'
  pattern_help: Minúsculas, números, punto y guion (3-63)""",
          """- name: garage_capacity
  label: Espacio que puede usar
  help: Lo que reserva para los datos (por ejemplo 50G o 1T). Garage no deja pasar de ahí.
  type: string
  default: 20G
  pattern: '^[0-9]+[GT]$'
  pattern_help: Un número y G o T (50G, 1T)"""],
    mid_tasks="""
- name: Secreto entre nodos (se genera en el servidor la primera vez)
  ansible.builtin.set_fact:
    garage_rpc: "{{ lookup('ansible.builtin.password', draupnode_secrets_dir ~ '/.garage_rpc', chars=['digits', 'abcdef'], length=64) }}"
  no_log: true
  when: not ansible_check_mode

- name: garage.toml
  ansible.builtin.copy:
    dest: "{{ garage_dir }}/garage.toml"
    mode: "0600"
    content: |
      # Generado por Draupnode (módulo garage). Se reescribe al aplicar.
      metadata_dir = "/var/lib/garage/meta"
      data_dir = "/var/lib/garage/data"
      db_engine = "sqlite"
      replication_factor = 1
      rpc_bind_addr = "[::]:3901"
      rpc_public_addr = "127.0.0.1:3901"
      rpc_secret = "{{ garage_rpc }}"

      [s3_api]
      s3_region = "garage"
      api_bind_addr = "[::]:3900"
      root_domain = ".s3.garage.localhost"

      [admin]
      api_bind_addr = "[::]:3903"
      admin_token = "{{ garage_admin_token }}"
  no_log: true
  when: not ansible_check_mode
""",
    compose="""  garage:
    image: docker.io/dxflrs/garage:v1.1.0
    container_name: dn-garage
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    volumes:
      - ./garage.toml:/etc/garage.toml:ro
      - ./meta:/var/lib/garage/meta
      - ./data:/var/lib/garage/data
@@PORTS@@""",
    probe='tcp',
    post_tasks="""
- name: Estado del nodo
  ansible.builtin.command: docker exec dn-garage /garage status
  register: garage_status
  changed_when: false
  retries: 10
  delay: 3
  until: garage_status.rc == 0
  when: not ansible_check_mode

- name: Darle sitio al nodo (solo la primera vez)
  ansible.builtin.shell: |
    id=$(docker exec dn-garage /garage node id -q | cut -d@ -f1)
    docker exec dn-garage /garage layout assign -z dc1 -c {{ garage_capacity | quote }} "$id" &&
    docker exec dn-garage /garage layout apply --version 1
  register: garage_layout
  when: not ansible_check_mode and 'NO ROLE ASSIGNED' in garage_status.stdout

- name: Bucket
  ansible.builtin.shell: docker exec dn-garage /garage bucket info {{ garage_bucket | quote }} >/dev/null 2>&1 || { docker exec dn-garage /garage bucket create {{ garage_bucket | quote }} && echo creado; }
  register: garage_b
  changed_when: "'creado' in garage_b.stdout"
  when: not ansible_check_mode

- name: ¿Hay ya clave?
  ansible.builtin.stat:
    path: "{{ draupnode_secrets_dir }}/garage_s3"
  register: garage_k

- name: Clave de acceso con permiso para el bucket
  ansible.builtin.shell: |
    docker exec dn-garage /garage key info draupnode --show-secret 2>/dev/null || docker exec dn-garage /garage key create draupnode
  register: garage_key
  no_log: true
  when: not ansible_check_mode and not garage_k.stat.exists

- name: Permiso de lectura y escritura en el bucket
  ansible.builtin.command: docker exec dn-garage /garage bucket allow --read --write --owner {{ garage_bucket | quote }} --key draupnode
  changed_when: false
  when: not ansible_check_mode

- name: Guardar la clave (en «Contraseñas»)
  ansible.builtin.copy:
    dest: "{{ draupnode_secrets_dir }}/garage_s3"
    mode: "0600"
    content: "ID de la clave: {{ garage_key.stdout | regex_search('GK[0-9a-f]+') }}\\nSecreto: {{ garage_key.stdout | regex_search('Secret key: *[0-9a-f]+') | regex_replace('^Secret key: *', '') }}\\nDirección: {{ ('https://' ~ garage_domain) if garage_domain else ('http://127.0.0.1:' ~ garage_port) }}\\nRegión: garage\\nBucket: {{ garage_bucket }}\\n"
  no_log: true
  when: not ansible_check_mode and not garage_k.stat.exists
""",
    note="Bucket «{{ garage_bucket }}» y su clave en «Contraseñas». Clientes S3: región «garage», path-style.",
)

# ------------------------------------------------------------------ IA local

APPS['ollama'] = dict(
    category=APPS_CAT,
    links=[('Ollama', 'https://ollama.com'), ('Modelos', 'https://ollama.com/library'), ('Código de Ollama', 'https://github.com/ollama/ollama'), ('Código de Hollama', 'https://github.com/fmaclen/hollama')],
    id='ollama', name='Ollama + Hollama (IA en tu servidor)', short='Ollama', license='MIT (Ollama y Hollama)',
    description='Modelos de IA de texto (Llama, Mistral, Qwen, Gemma…) en tu servidor, sin mandar nada fuera, con una web para chatear.',
    details="""Ollama (los modelos) y Hollama (la web de chat) en Docker, juntos detrás
de un nginx pequeño: la web en / y la API de Ollama en /api.
Al aplicar se descargan los modelos de la lista (tarda: varios GB).
Sin tarjeta gráfica va en la CPU: con 8 GB de RAM, modelos de 3-4B
(rápido) u 8B (lento). En Hollama, «Settings → Servers», añade la
misma dirección por la que entras (tipo Ollama).
La API no pide contraseña: ponle Authelia delante si le das dominio.""",
    port=8150, cport=80, ram=4000, data_desc='los modelos descargados', dirs=['models'],
    vars=["""- name: ollama_models
  label: Modelos que descargar
  help: Uno por línea, con su tamaño (ollama.com/library). Los que quites no se borran.
  type: list
  default: ["llama3.2:3b"]
  pattern: '^[a-z0-9][a-z0-9._/-]*(:[a-zA-Z0-9._-]+)?$'
  pattern_help: Como en ollama.com (qwen2.5:7b)""",
          UPDATE('ollama', 'Ollama y Hollama')],
    mid_tasks="""
- name: nginx de delante (web y API en la misma dirección)
  ansible.builtin.copy:
    dest: "{{ ollama_dir }}/nginx.conf"
    mode: "0644"
    content: |
      # Generado por Draupnode (módulo ollama).
      server {
        listen 80;
        client_max_body_size 100m;
        location /api/ {
          proxy_pass http://ollama:11434;
          proxy_buffering off;
          proxy_read_timeout 900s;
          proxy_set_header Host localhost;
        }
        location / {
          proxy_pass http://hollama:4173;
          proxy_set_header Host $host;
        }
      }
  when: not ansible_check_mode
""",
    compose="""  ollama:
    image: docker.io/ollama/ollama:latest
    {% if ollama_update | bool %}pull_policy: always
    {% endif %}container_name: dn-ollama
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      OLLAMA_ORIGINS: "*"
    volumes:
      - ./models:/root/.ollama
  hollama:
    image: ghcr.io/fmaclen/hollama:latest
    {% if ollama_update | bool %}pull_policy: always
    {% endif %}container_name: dn-hollama
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
  web:
    image: docker.io/library/nginx:alpine
    container_name: dn-ollama-web
    restart: unless-stopped
    depends_on: [ollama, hollama]
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
@@PORTS@@""",
    post_tasks="""
- name: Modelos que ya tiene
  ansible.builtin.command: docker exec dn-ollama ollama list
  register: ollama_have
  changed_when: false
  when: not ansible_check_mode

- name: Descargar los modelos (puede tardar mucho)
  ansible.builtin.command: docker exec dn-ollama ollama pull {{ item | quote }}
  loop: "{{ ollama_models }}"
  when: not ansible_check_mode and (item if ':' in item else item ~ ':latest') not in ollama_have.stdout
  register: ollama_pull
  retries: 2
  delay: 10
  until: ollama_pull.rc == 0
""",
    check='/api/version', retries=40,
    note="En Hollama, Settings → Servers: añade la dirección por la que entras, tipo Ollama. Modelos: {{ ollama_models | join(', ') }}.",
)

# ------------------------------------------------------------------ Casa

APPS['home-assistant'] = dict(
    category=APPS_CAT,
    links=[('Web oficial', 'https://www.home-assistant.io'), ('Instalación en Docker', 'https://www.home-assistant.io/installation/linux#docker-compose'), ('Código fuente', 'https://github.com/home-assistant/core')],
    id='home-assistant', name='Home Assistant (domótica)', short='Home Assistant', license='Apache-2.0',
    description='Controla luces, enchufes, sensores y aparatos de casa desde una web y el móvil, con automatizaciones. Funciona sin la nube de cada fabricante.',
    details="""Home Assistant (la versión «Container») en Docker. La primera vez que
entres te pide crear tu usuario: hazlo nada más aplicar.
En un servidor en internet no ve los aparatos de tu red de casa por sí
solo: úsalo en un servidor de casa, o une ambas redes con WireGuard o
Headscale. Sin USB (Zigbee/Z-Wave) dentro del contenedor.
Draupnode le dice que se fíe de Caddy/nginx (para usarlo con dominio).""",
    port=8123, cport=8123, ram=600, data_desc='su configuración, automatizaciones e historial', dirs=['config'],
    vars=[UPDATE('home_assistant', 'Home Assistant')],
    mid_tasks="""
- name: Configuración inicial (solo si no hay; luego es tuya)
  ansible.builtin.copy:
    dest: "{{ home_assistant_dir }}/config/configuration.yaml"
    force: false
    mode: "0644"
    content: |
      # Creado por Draupnode la primera vez. Ya es tuyo: Draupnode no lo vuelve a tocar.
      default_config:

      http:
        use_x_forwarded_for: true
        trusted_proxies:
          - 127.0.0.1
          - 172.16.0.0/12
  when: not ansible_check_mode
""",
    compose="""  home-assistant:
    image: ghcr.io/home-assistant/home-assistant:stable
    {% if home_assistant_update | bool %}pull_policy: always
    {% endif %}container_name: dn-home-assistant
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      TZ: Etc/UTC
    volumes:
      - ./config:/config
@@PORTS@@""",
    retries=80,
    note="Entra ya y crea tu usuario (la primera persona que entre lo crea).",
)

# ------------------------------------------------------------------ Monitorización

APPS['beszel'] = dict(
    category=MON,
    links=[('Web oficial', 'https://beszel.dev'), ('Código fuente', 'https://github.com/henrygd/beszel')],
    id='beszel', name='Beszel (vigilancia ligera de servidores)', short='Beszel', license='MIT',
    description='CPU, memoria, disco, red y contenedores de tus servidores en una web sencilla, con historial y alertas. Mucho más ligero que Grafana + Prometheus.',
    details="""Beszel en Docker: el «hub» (la web) y el agente de este servidor.
Draupnode crea la clave con la que el hub habla con los agentes y el
usuario administrador (correo admin@beszel.local, contraseña en
«Contraseñas»), y da de alta este servidor: el agente y el hub hablan
por un socket compartido, sin abrir ningún puerto. Para vigilar otros
servidores, instala en ellos el agente de Beszel con la misma clave
(la pública, que ves al pulsar «Add system»).""",
    port=8095, cport=8090, data_desc='el historial y los usuarios', dirs=['data', 'socket'],
    secrets=[('beszel_admin', 'Administrador de Beszel')],
    generate=[dict(file='.beszel_admin_pass', var='admin_pass', len=24)],
    vars=[UPDATE('beszel', 'Beszel')],
    mid_tasks="""
- name: Clave del hub (la crea Draupnode para dársela al agente)
  ansible.builtin.command: ssh-keygen -q -t ed25519 -N '' -C beszel -f {{ beszel_dir }}/data/id_ed25519
  args:
    creates: "{{ beszel_dir }}/data/id_ed25519"
  when: not ansible_check_mode

- name: Leer la clave pública
  ansible.builtin.slurp:
    src: "{{ beszel_dir }}/data/id_ed25519.pub"
  register: beszel_pub
  when: not ansible_check_mode
""" + usuario_en_secretos('beszel', 'beszel_admin', 'admin@beszel.local', 'admin_pass'),
    compose="""  hub:
    image: docker.io/henrygd/beszel:latest
    {% if beszel_update | bool %}pull_policy: always
    {% endif %}container_name: dn-beszel
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      USER_EMAIL: admin@beszel.local
      USER_PASSWORD: "{{ beszel_admin_pass }}"
    volumes:
      - ./data:/beszel_data
      - ./socket:/beszel_socket
@@PORTS@@
  agent:
    image: docker.io/henrygd/beszel-agent:latest
    {% if beszel_update | bool %}pull_policy: always
    {% endif %}container_name: dn-beszel-agent
    restart: unless-stopped
    network_mode: host
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      LISTEN: /beszel_socket/beszel.sock
      KEY: "{{ (beszel_pub.content | default('') | b64decode).strip() }}"
    volumes:
      - ./socket:/beszel_socket
      - /var/run/docker.sock:/var/run/docker.sock:ro""",
    post_tasks="""
- name: Entrar en el hub
  ansible.builtin.uri:
    url: "http://127.0.0.1:{{ beszel_port }}/api/collections/users/auth-with-password"
    method: POST
    body_format: json
    body: {"identity": "admin@beszel.local", "password": "{{ beszel_admin_pass }}"}
  register: beszel_auth
  retries: 10
  delay: 3
  until: beszel_auth.status == 200
  failed_when: false
  no_log: true
  when: not ansible_check_mode

- name: Sistemas dados de alta
  ansible.builtin.uri:
    url: "http://127.0.0.1:{{ beszel_port }}/api/collections/systems/records"
    headers:
      Authorization: "{{ beszel_auth.json.token }}"
  register: beszel_systems
  when: not ansible_check_mode and beszel_auth.status | default(0) == 200

- name: Dar de alta este servidor (por el socket compartido)
  ansible.builtin.uri:
    url: "http://127.0.0.1:{{ beszel_port }}/api/collections/systems/records"
    method: POST
    headers:
      Authorization: "{{ beszel_auth.json.token }}"
    body_format: json
    body:
      name: "{{ ansible_hostname }}"
      host: /beszel_socket/beszel.sock
      port: "45876"
      users: ["{{ beszel_auth.json.record.id }}"]
  changed_when: true
  when: not ansible_check_mode and beszel_auth.status | default(0) == 200 and (beszel_systems.json['items'] | selectattr('host', 'equalto', '/beszel_socket/beszel.sock') | list | length) == 0
""",
    check='/api/health', retries=30,
    note="Entra con admin@beszel.local (contraseña en «Contraseñas»): este servidor ya está dado de alta.",
)

# ------------------------------------------------------------------ Apps

APPS['audiobookshelf'] = dict(
    category=APPS_CAT,
    links=[('Web oficial', 'https://www.audiobookshelf.org'), ('Código fuente', 'https://github.com/advplyr/audiobookshelf')],
    id='audiobookshelf', name='Audiobookshelf (audiolibros y pódcasts)', short='Audiobookshelf', license='GPL-3.0',
    description='Tus audiolibros y pódcasts en tu servidor, con apps para el móvil que recuerdan por dónde ibas.',
    details="""Audiobookshelf en Docker. Draupnode crea el usuario «root» (el
administrador) con la contraseña generada en el servidor (en
«Contraseñas»). Sube los audiolibros a
/srv/draupnode/apps/audiobookshelf/audiolibros (una carpeta por libro)
y los pódcasts se descargan solos en .../podcasts.""",
    port=13378, cport=80, data_desc='la biblioteca, los audiolibros, los pódcasts y el progreso de cada usuario', dirs=['config', 'metadata', 'audiolibros', 'podcasts'],
    secrets=[('audiobookshelf_admin', 'Usuario «root» de Audiobookshelf')],
    generate=[dict(file='.audiobookshelf_admin_pass', var='admin_pass', len=24)],
    vars=[UPDATE('audiobookshelf', 'Audiobookshelf')],
    compose="""  audiobookshelf:
    image: ghcr.io/advplyr/audiobookshelf:latest
    {% if audiobookshelf_update | bool %}pull_policy: always
    {% endif %}container_name: dn-audiobookshelf
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    volumes:
      - ./config:/config
      - ./metadata:/metadata
      - ./audiolibros:/audiobooks
      - ./podcasts:/podcasts
@@PORTS@@""",
    post_tasks="""
- name: ¿Está sin estrenar?
  ansible.builtin.uri:
    url: "http://127.0.0.1:{{ audiobookshelf_port }}/status"
  register: audiobookshelf_st
  when: not ansible_check_mode

- name: Crear el usuario «root»
  ansible.builtin.uri:
    url: "http://127.0.0.1:{{ audiobookshelf_port }}/init"
    method: POST
    body_format: json
    body:
      newRoot:
        username: root
        password: "{{ audiobookshelf_admin_pass }}"
    status_code: [200, 204]
  changed_when: true
  no_log: true
  when: not ansible_check_mode and not (audiobookshelf_st.json.isInit | default(true))
""" + usuario_en_secretos('audiobookshelf', 'audiobookshelf_admin', 'root', 'admin_pass'),
    check='/healthcheck', retries=40,
    note="Entra con «root» (contraseña en «Contraseñas») y crea una biblioteca con la carpeta /audiobooks.",
)

APPS['freshrss'] = dict(
    category=APPS_CAT,
    links=[('Web oficial', 'https://freshrss.org'), ('Código fuente', 'https://github.com/FreshRSS/FreshRSS')],
    id='freshrss', name='FreshRSS (lector de noticias RSS)', short='FreshRSS', license='AGPL-3.0',
    description='Sigue webs, blogs y canales por RSS en un solo sitio, sin algoritmos. Compatible con apps de móvil (Fever y Google Reader).',
    details="""FreshRSS en Docker, con base SQLite. Draupnode lo instala con el
usuario «admin» y su contraseña generada en el servidor (en
«Contraseñas»; vale también para las apps de móvil, en
«Configuración → Perfil → contraseña de la API»). Comprueba las
novedades cada 20 minutos.""",
    port=8070, cport=80, data_desc='las suscripciones, los artículos guardados y los usuarios', dirs=['data', 'extensions'], keep_mode=['data', 'extensions'],
    secrets=[('freshrss_admin', 'Usuario «admin» de FreshRSS')],
    generate=[dict(file='.freshrss_admin_pass', var='admin_pass', len=24)],
    vars=[UPDATE('freshrss', 'FreshRSS')],
    mid_tasks=usuario_en_secretos('freshrss', 'freshrss_admin', 'admin', 'admin_pass', extra='La misma contraseña sirve para la API (apps de móvil).\\n'),
    compose="""  freshrss:
    image: docker.io/freshrss/freshrss:latest
    {% if freshrss_update | bool %}pull_policy: always
    {% endif %}container_name: dn-freshrss
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      TZ: Etc/UTC
      CRON_MIN: "1,21,41"
      FRESHRSS_INSTALL: >-
        --api-enabled
        --base-url {{ ('https://' ~ freshrss_domain) if freshrss_domain else ('http://127.0.0.1:' ~ freshrss_port) }}
        --db-type sqlite
        --default-user admin
        --language es
      FRESHRSS_USER: >-
        --api-password {{ freshrss_admin_pass }}
        --language es
        --password {{ freshrss_admin_pass }}
        --user admin
    volumes:
      - ./data:/var/www/FreshRSS/data
      - ./extensions:/var/www/FreshRSS/extensions
@@PORTS@@""",
    check='/i/', retries=30,
    note="Entra con «admin» (contraseña en «Contraseñas») y añade tus fuentes RSS.",
)

APPS['mealie'] = dict(
    category=APPS_CAT,
    links=[('Web oficial', 'https://mealie.io'), ('Documentación', 'https://docs.mealie.io'), ('Código fuente', 'https://github.com/mealie-recipes/mealie')],
    id='mealie', name='Mealie (recetas y menú de la semana)', short='Mealie', license='AGPL-3.0',
    description='Tus recetas en un sitio: las importa de cualquier web con su enlace, planifica el menú de la semana y hace la lista de la compra.',
    details="""Mealie en Docker, con base SQLite. Draupnode cambia la contraseña de
serie del administrador (changeme@example.com) por una generada en el
servidor (en «Contraseñas»). Cambia luego ese correo por el tuyo en
tu perfil. El registro de usuarios nuevos queda cerrado: invítalos
desde la administración.""",
    port=9925, cport=9000, ram=500, data_desc='las recetas, fotos, menús y usuarios', dirs=['data'],
    secrets=[('mealie_admin', 'Administrador de Mealie')],
    generate=[dict(file='.mealie_admin_pass', var='admin_pass', len=24)],
    vars=[UPDATE('mealie', 'Mealie')],
    compose="""  mealie:
    image: ghcr.io/mealie-recipes/mealie:latest
    {% if mealie_update | bool %}pull_policy: always
    {% endif %}container_name: dn-mealie
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      ALLOW_SIGNUP: "false"
      TZ: Etc/UTC
      BASE_URL: "{{ ('https://' ~ mealie_domain) if mealie_domain else ('http://127.0.0.1:' ~ mealie_port) }}"
    volumes:
      - ./data:/app/data
@@PORTS@@""",
    post_tasks="""
- name: ¿Sigue la contraseña de serie?
  ansible.builtin.uri:
    url: "http://127.0.0.1:{{ mealie_port }}/api/auth/token"
    method: POST
    body_format: form-urlencoded
    body:
      username: changeme@example.com
      password: MyPassword
    status_code: [200, 401]
  register: mealie_login
  no_log: true
  when: not ansible_check_mode

- name: Poner la generada
  ansible.builtin.uri:
    url: "http://127.0.0.1:{{ mealie_port }}/api/users/password"
    method: PUT
    headers:
      Authorization: "Bearer {{ mealie_login.json.access_token }}"
    body_format: json
    body:
      currentPassword: MyPassword
      newPassword: "{{ mealie_admin_pass }}"
    status_code: [200, 204]
  changed_when: true
  no_log: true
  when: not ansible_check_mode and mealie_login.status == 200
""" + usuario_en_secretos('mealie', 'mealie_admin', 'changeme@example.com', 'admin_pass', extra='Cambia este correo por el tuyo en tu perfil.\\n'),
    check='/api/app/about', retries=60,
    note="Entra con changeme@example.com (contraseña en «Contraseñas») y cambia ese correo por el tuyo.",
)

APPS['linkwarden'] = dict(
    category=APPS_CAT,
    links=[('Web oficial', 'https://linkwarden.app'), ('Documentación', 'https://docs.linkwarden.app'), ('Código fuente', 'https://github.com/linkwarden/linkwarden')],
    id='linkwarden', name='Linkwarden (marcadores que no se pierden)', short='Linkwarden', license='AGPL-3.0',
    description='Guarda enlaces en colecciones, con una copia de cada página (captura, PDF y texto) por si la web original desaparece. Con extensión para el navegador.',
    details="""Linkwarden en Docker, con su propio PostgreSQL. La primera persona que
se registra es la administradora: regístrate nada más aplicar y luego
desmarca «Permitir registrarse» y vuelve a aplicar.
Guarda una copia de cada página con un navegador interno: la imagen es
grande (unos 2 GB) y cada copia ocupa.""",
    port=3005, cport=3000, ram=1000, data_desc='los enlaces, sus copias y la base de datos', dirs=['data', 'pgdata'], db_dir='pgdata',
    generate=[dict(file='.linkwarden_db', var='db_pass', len=32), dict(file='.linkwarden_secret', var='secret', len=48)],
    vars=["""- name: linkwarden_signup
  label: Permitir registrarse
  help: Déjalo marcado hasta crear tu usuario; luego desmárcalo para que nadie más se registre.
  type: bool
  default: true""", UPDATE('linkwarden', 'Linkwarden')],
    compose="""  db:
    image: docker.io/library/postgres:16-alpine
    container_name: dn-linkwarden-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: linkwarden
      POSTGRES_USER: linkwarden
      POSTGRES_PASSWORD: "{{ linkwarden_db_pass }}"
    volumes:
      - ./pgdata:/var/lib/postgresql/data
  linkwarden:
    image: ghcr.io/linkwarden/linkwarden:latest
    {% if linkwarden_update | bool %}pull_policy: always
    {% endif %}container_name: dn-linkwarden
    restart: unless-stopped
    depends_on: [db]
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      DATABASE_URL: "postgresql://linkwarden:{{ linkwarden_db_pass }}@db:5432/linkwarden"
      NEXTAUTH_SECRET: "{{ linkwarden_secret }}"
      NEXTAUTH_URL: "{{ ('https://' ~ linkwarden_domain) if linkwarden_domain else ('http://127.0.0.1:' ~ linkwarden_port) }}/api/v1/auth"
      NEXT_PUBLIC_DISABLE_REGISTRATION: "{{ 'false' if linkwarden_signup | bool else 'true' }}"
    volumes:
      - ./data:/data/data
@@PORTS@@""",
    retries=100,
    note="{{ 'Regístrate ya (la primera cuenta es la administradora) y luego desmarca «Permitir registrarse».' if linkwarden_signup | bool else 'Registro cerrado.' }}",
)

APPS['listmonk'] = dict(
    category=APPS_CAT,
    links=[('Web oficial', 'https://listmonk.app'), ('Documentación', 'https://listmonk.app/docs/'), ('Código fuente', 'https://github.com/knadh/listmonk')],
    id='listmonk', name='Listmonk (boletines y listas de correo)', short='Listmonk', license='AGPL-3.0',
    description='Envía boletines a tus suscriptores: listas, plantillas, campañas, estadísticas de aperturas y bajas. Manda los correos por el SMTP que le digas.',
    details="""Listmonk en Docker, con su propio PostgreSQL. Draupnode crea el usuario
«admin» con la contraseña generada en el servidor (en «Contraseñas»).
Para enviar necesita un servidor SMTP (el de tu proveedor de correo,
Amazon SES, Stalwart…): ponlo en «Settings → SMTP».
Con dominio, los formularios de alta y los enlaces de baja funcionan
desde internet.""",
    port=9002, cport=9000, ram=300, data_desc='las listas, suscriptores, campañas y su base de datos', dirs=['uploads', 'pgdata'], db_dir='pgdata',
    secrets=[('listmonk_admin', 'Usuario «admin» de Listmonk')],
    generate=[dict(file='.listmonk_admin_pass', var='admin_pass', len=24), dict(file='.listmonk_db', var='db_pass', len=32)],
    vars=[UPDATE('listmonk', 'Listmonk')],
    mid_tasks=usuario_en_secretos('listmonk', 'listmonk_admin', 'admin', 'admin_pass'),
    compose="""  db:
    image: docker.io/library/postgres:16-alpine
    container_name: dn-listmonk-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: listmonk
      POSTGRES_USER: listmonk
      POSTGRES_PASSWORD: "{{ listmonk_db_pass }}"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U listmonk"]
      interval: 5s
      retries: 20
    volumes:
      - ./pgdata:/var/lib/postgresql/data
  listmonk:
    image: docker.io/listmonk/listmonk:latest
    {% if listmonk_update | bool %}pull_policy: always
    {% endif %}container_name: dn-listmonk
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    command: [sh, -c, "./listmonk --install --idempotent --yes --config '' && ./listmonk --upgrade --yes --config '' && ./listmonk --config ''"]
    environment:
      LISTMONK_app__address: "0.0.0.0:9000"
      LISTMONK_app__root_url: "{{ ('https://' ~ listmonk_domain) if listmonk_domain else ('http://127.0.0.1:' ~ listmonk_port) }}"
      LISTMONK_db__host: db
      LISTMONK_db__port: "5432"
      LISTMONK_db__user: listmonk
      LISTMONK_db__password: "{{ listmonk_db_pass }}"
      LISTMONK_db__database: listmonk
      LISTMONK_db__ssl_mode: disable
      LISTMONK_ADMIN_USER: admin
      LISTMONK_ADMIN_PASSWORD: "{{ listmonk_admin_pass }}"
      TZ: Etc/UTC
    volumes:
      - ./uploads:/listmonk/uploads
@@PORTS@@""",
    check='/admin/login', retries=40,
    note="Entra en /admin con «admin» (contraseña en «Contraseñas») y pon tu SMTP en Settings → SMTP.",
)

# ------------------------------------------------------------------ Correo

APPS['stalwart'] = dict(
    category=APPS_CAT,
    links=[('Web oficial', 'https://stalw.art'), ('Documentación', 'https://stalw.art/docs/install/docker'), ('Código fuente', 'https://github.com/stalwartlabs/stalwart')],
    id='stalwart', name='Stalwart (servidor de correo completo)', short='Stalwart', license='AGPL-3.0',
    description='Tu propio servidor de correo: recibe y envía (SMTP), buzones (IMAP y JMAP), filtros y antispam, todo en uno, con una web para administrarlo.',
    details="""Stalwart en Docker. Abre los puertos del correo (25, 465, 587 y 993)
en el cortafuegos. El usuario «admin» de la web de administración y
su contraseña (temporal, para arrancar) los crea Stalwart la primera
vez; Draupnode los copia a «Contraseñas».
OJO, el correo propio es exigente: necesitas un dominio con sus
registros MX, SPF, DKIM y DMARC (Stalwart te dice cuáles en
«Management → Domains → DNS records»), que tu proveedor deje salir el
puerto 25 (muchos lo bloquean: Hetzner y DigitalOcean lo abren si se
lo pides) y el DNS inverso de la IP con tu dominio.""",
    port=8480, cport=8080, ram=500, data_desc='todos los buzones, los correos y la configuración', dirs=['data'],
    domain_help='Opcional: el de la web de administración (correo.ejemplo.com, con Caddy o nginx).',
    secrets=[('stalwart_admin', 'Administrador de Stalwart')],
    fw_extra=['stalwart_smtp', 'stalwart_submissions', 'stalwart_submission', 'stalwart_imaps'],
    vars=["""- name: stalwart_smtp
  label: Puerto SMTP (recibir correo)
  help: 25 es el que usan los demás servidores para entregarte el correo; no lo cambies si no sabes por qué.
  type: int
  default: 25
  min: 1
  max: 65535""", """- name: stalwart_submissions
  label: Puerto para enviar desde tus programas (SSL)
  type: int
  default: 465
  min: 1
  max: 65535""", """- name: stalwart_submission
  label: Puerto para enviar desde tus programas (STARTTLS)
  type: int
  default: 587
  min: 1
  max: 65535""", """- name: stalwart_imaps
  label: Puerto IMAP (leer el correo)
  type: int
  default: 993
  min: 1
  max: 65535""", UPDATE('stalwart', 'Stalwart')],
    compose="""  stalwart:
    image: docker.io/stalwartlabs/stalwart:latest
    {% if stalwart_update | bool %}pull_policy: always
    {% endif %}container_name: dn-stalwart
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    volumes:
      - ./data:/opt/stalwart
@@PORTS@@
      - "{{ stalwart_smtp }}:25"
      - "{{ stalwart_submissions }}:465"
      - "{{ stalwart_submission }}:587"
      - "{{ stalwart_imaps }}:993\"""",
    post_tasks="""
- name: ¿Está ya copiada la contraseña de «admin»?
  ansible.builtin.stat:
    path: "{{ draupnode_secrets_dir }}/stalwart_admin"
  register: stalwart_k

- name: La que creó Stalwart al estrenarse (está en su registro)
  ansible.builtin.shell: |
    docker logs dn-stalwart 2>&1 | sed -n "s/^ *password: *//p; s/.*with password '\\([^']*\\)'.*/\\1/p" | head -n1
  retries: 10
  delay: 3
  until: stalwart_pass.stdout | length > 0
  register: stalwart_pass
  changed_when: false
  failed_when: false
  no_log: true
  when: not ansible_check_mode and not stalwart_k.stat.exists

- name: Copiarla a «Contraseñas»
  ansible.builtin.copy:
    dest: "{{ draupnode_secrets_dir }}/stalwart_admin"
    mode: "0600"
    content: "Usuario: admin\\nContraseña: {{ stalwart_pass.stdout }}\\nEs la cuenta temporal de arranque: crea tu administrador en la web.\\n"
  no_log: true
  when: not ansible_check_mode and not stalwart_k.stat.exists and stalwart_pass.stdout | length > 0
""",
    check='/login', retries=40,
    note="Entra en la administración con «admin» (contraseña en «Contraseñas»), añade tu dominio y crea en tu DNS los registros que te indica.",
)

# ------------------------------------------------------------------ Keycloak delante de las apps

APPS['oauth2-proxy'] = dict(
    category=SEG,
    depends=['docker', 'keycloak', 'caddy'],
    links=[('Documentación', 'https://oauth2-proxy.github.io/oauth2-proxy/'), ('Código fuente', 'https://github.com/oauth2-proxy/oauth2-proxy')],
    id='oauth2-proxy', name='Inicio de sesión con Keycloak (oauth2-proxy)', short='oauth2-proxy', license='MIT',
    description='Protege con tus usuarios de Keycloak (y su doble factor) las apps que no tienen inicio de sesión propio: antes de entrar, hay que iniciar sesión en Keycloak.',
    details="""oauth2-proxy en Docker, junto a Keycloak y Caddy en este servidor. Al
aplicar, Draupnode crea en Keycloak el realm elegido (si no existe) y
su cliente «oauth2-proxy» con la vuelta de cada dominio protegido, y
configura Caddy para que pida iniciar sesión antes de entrar en ellos.
Los usuarios se crean en Keycloak, en ese realm (con su correo). Así
todas tus apps usan los mismos usuarios: las que admiten OIDC, con
Keycloak directamente; las demás, con esto delante.
Necesita que Keycloak tenga dominio y que los dominios protegidos
cuelguen del mismo dominio principal. Usa el administrador temporal
«admin» de Keycloak para crear el cliente: si ya lo borraste, crea el
cliente a mano (lo explica la nota al aplicar).""",
    port=4180, cport=4180, no_proxy=True, no_public=True, data_desc='su configuración; los usuarios siguen en Keycloak', dirs=[],
    generate=[dict(file='.oauth2_proxy_cookie', var='cookie_secret', len=32)],
    secret_files=['.oauth2_proxy_client'],
    vars=["""- name: oauth2_proxy_protect
  label: Dominios protegidos
  help: Uno por línea. Para entrar en ellos habrá que iniciar sesión en Keycloak. Tienen que colgar del mismo dominio principal.
  type: list
  default: []
  pattern: '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}$'
  pattern_help: Un dominio (app.ejemplo.com)""",
          """- name: oauth2_proxy_realm
  label: Realm de Keycloak
  help: Donde están los usuarios que pueden entrar. Si no existe, se crea. Mejor uno propio que «master» (el de administrar Keycloak).
  type: string
  default: apps
  pattern: '^[A-Za-z0-9_-]{1,64}$'
  pattern_help: Letras, números, guion y guion bajo""",
          """- name: oauth2_proxy_kc_domain
  label: Dominio de Keycloak (lo pone Draupnode)
  type: string
  default: ""
  managed: true""",
          """- name: oauth2_proxy_kc_port
  label: Puerto de Keycloak (lo pone Draupnode)
  type: int
  default: 8180
  min: 1
  max: 65535
  managed: true"""],
    pre_tasks="""
- name: Keycloak necesita dominio
  ansible.builtin.assert:
    that: oauth2_proxy_kc_domain | length > 0
    fail_msg: "Pon un dominio a Keycloak (con Caddy): el inicio de sesión tiene que verse desde internet."
- name: Hace falta al menos un dominio protegido
  ansible.builtin.assert:
    that: oauth2_proxy_protect | length > 0
    fail_msg: "Pon en «Dominios protegidos» los de las apps que quieras tapar."
- name: Dominio principal (el de la cookie de la sesión)
  ansible.builtin.set_fact:
    oauth2_proxy_cookie_domain: "{{ oauth2_proxy_protect[0].split('.', 1)[1] }}"
    oauth2_proxy_kc: "http://127.0.0.1:{{ oauth2_proxy_kc_port }}"
    oauth2_proxy_issuer: "https://{{ oauth2_proxy_kc_domain }}/realms/{{ oauth2_proxy_realm }}"
    oauth2_proxy_callbacks: "{{ oauth2_proxy_protect | map('regex_replace', '^', 'https://') | map('regex_replace', '$', '/oauth2/callback') | list }}"
- name: Los dominios protegidos tienen que colgar del mismo dominio principal
  ansible.builtin.assert:
    that: oauth2_proxy_protect | reject('search', '(^|\\\\.)' ~ (oauth2_proxy_cookie_domain | regex_escape) ~ '$') | list | length == 0
    fail_msg: "Estos dominios no son de {{ oauth2_proxy_cookie_domain }}: {{ oauth2_proxy_protect | reject('search', '(^|\\\\.)' ~ (oauth2_proxy_cookie_domain | regex_escape) ~ '$') | join(', ') }}"
""",
    mid_tasks="""
- name: Entrar en Keycloak como administrador
  ansible.builtin.uri:
    url: "{{ oauth2_proxy_kc }}/realms/master/protocol/openid-connect/token"
    method: POST
    body_format: form-urlencoded
    body:
      grant_type: password
      client_id: admin-cli
      username: admin
      password: "{{ lookup('ansible.builtin.file', draupnode_secrets_dir ~ '/.keycloak_admin_pass') }}"
    status_code: [200, 401]
  register: oauth2_proxy_tok
  retries: 20
  delay: 5
  until: oauth2_proxy_tok.status in [200, 401]
  no_log: true
  when: not ansible_check_mode

- name: Sin el administrador temporal no se puede crear el cliente
  ansible.builtin.fail:
    msg: >-
      Keycloak no acepta el administrador temporal «admin» (¿lo borraste?). Crea a mano, en el realm
      {{ oauth2_proxy_realm }}, el cliente «oauth2-proxy» (OpenID Connect, «Client authentication» activado)
      con estas «Valid redirect URIs»: {{ oauth2_proxy_callbacks | join(', ') }};
      y guarda su secreto en {{ draupnode_secrets_dir }}/.oauth2_proxy_client. Luego vuelve a aplicar.
  when: not ansible_check_mode and oauth2_proxy_tok.status != 200 and not (lookup('ansible.builtin.fileglob', draupnode_secrets_dir ~ '/.oauth2_proxy_client') | length > 0)

- name: Preparar el realm y el cliente en Keycloak
  when: not ansible_check_mode and oauth2_proxy_tok.status == 200
  no_log: true
  block:
    - name: ¿Existe el realm?
      ansible.builtin.uri:
        url: "{{ oauth2_proxy_kc }}/admin/realms/{{ oauth2_proxy_realm }}"
        headers: {Authorization: "Bearer {{ oauth2_proxy_tok.json.access_token }}"}
        status_code: [200, 404]
      register: oauth2_proxy_realm_q
    - name: Crear el realm
      ansible.builtin.uri:
        url: "{{ oauth2_proxy_kc }}/admin/realms"
        method: POST
        headers: {Authorization: "Bearer {{ oauth2_proxy_tok.json.access_token }}"}
        body_format: json
        body: {realm: "{{ oauth2_proxy_realm }}", enabled: true}
        status_code: [201]
      when: oauth2_proxy_realm_q.status == 404
    - name: ¿Existe el cliente?
      ansible.builtin.uri:
        url: "{{ oauth2_proxy_kc }}/admin/realms/{{ oauth2_proxy_realm }}/clients?clientId=oauth2-proxy"
        headers: {Authorization: "Bearer {{ oauth2_proxy_tok.json.access_token }}"}
      register: oauth2_proxy_cl
    - name: Crear el cliente «oauth2-proxy»
      ansible.builtin.uri:
        url: "{{ oauth2_proxy_kc }}/admin/realms/{{ oauth2_proxy_realm }}/clients"
        method: POST
        headers: {Authorization: "Bearer {{ oauth2_proxy_tok.json.access_token }}"}
        body_format: json
        body:
          clientId: oauth2-proxy
          name: "Draupnode (oauth2-proxy)"
          protocol: openid-connect
          publicClient: false
          standardFlowEnabled: true
          directAccessGrantsEnabled: false
          redirectUris: "{{ oauth2_proxy_callbacks }}"
          webOrigins: ["+"]
        status_code: [201]
      when: oauth2_proxy_cl.json | length == 0
    - name: El cliente (otra vez, con su id)
      ansible.builtin.uri:
        url: "{{ oauth2_proxy_kc }}/admin/realms/{{ oauth2_proxy_realm }}/clients?clientId=oauth2-proxy"
        headers: {Authorization: "Bearer {{ oauth2_proxy_tok.json.access_token }}"}
      register: oauth2_proxy_cl2
    - name: Dominios de vuelta al día
      ansible.builtin.uri:
        url: "{{ oauth2_proxy_kc }}/admin/realms/{{ oauth2_proxy_realm }}/clients/{{ oauth2_proxy_cl2.json[0].id }}"
        method: PUT
        headers: {Authorization: "Bearer {{ oauth2_proxy_tok.json.access_token }}"}
        body_format: json
        body: "{{ oauth2_proxy_cl2.json[0] | combine({'redirectUris': oauth2_proxy_callbacks}) }}"
        status_code: [204]
      when: (oauth2_proxy_cl2.json[0].redirectUris | sort) != (oauth2_proxy_callbacks | sort)
      changed_when: true
    - name: Secreto del cliente
      ansible.builtin.uri:
        url: "{{ oauth2_proxy_kc }}/admin/realms/{{ oauth2_proxy_realm }}/clients/{{ oauth2_proxy_cl2.json[0].id }}/client-secret"
        headers: {Authorization: "Bearer {{ oauth2_proxy_tok.json.access_token }}"}
      register: oauth2_proxy_sec
    - name: Guardarlo en el servidor
      ansible.builtin.copy:
        dest: "{{ draupnode_secrets_dir }}/.oauth2_proxy_client"
        content: "{{ oauth2_proxy_sec.json.value }}"
        mode: "0600"

- name: Leer el secreto del cliente
  ansible.builtin.set_fact:
    oauth2_proxy_client_secret: "{{ lookup('ansible.builtin.file', draupnode_secrets_dir ~ '/.oauth2_proxy_client') }}"
  no_log: true
  when: not ansible_check_mode
""",
    compose="""  oauth2-proxy:
    image: quay.io/oauth2-proxy/oauth2-proxy:v7.12.0
    container_name: dn-oauth2-proxy
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    networks: [default, keycloak]
    environment:
      OAUTH2_PROXY_PROVIDER: keycloak-oidc
      OAUTH2_PROXY_CLIENT_ID: oauth2-proxy
      OAUTH2_PROXY_CLIENT_SECRET: "{{ oauth2_proxy_client_secret | default('') }}"
      OAUTH2_PROXY_OIDC_ISSUER_URL: "{{ oauth2_proxy_issuer }}"
      # El navegador va a Keycloak por su dominio; oauth2-proxy le habla por dentro de Docker.
      OAUTH2_PROXY_SKIP_OIDC_DISCOVERY: "true"
      OAUTH2_PROXY_LOGIN_URL: "{{ oauth2_proxy_issuer }}/protocol/openid-connect/auth"
      OAUTH2_PROXY_REDEEM_URL: "http://keycloak:8080/realms/{{ oauth2_proxy_realm }}/protocol/openid-connect/token"
      OAUTH2_PROXY_OIDC_JWKS_URL: "http://keycloak:8080/realms/{{ oauth2_proxy_realm }}/protocol/openid-connect/certs"
      OAUTH2_PROXY_PROFILE_URL: "http://keycloak:8080/realms/{{ oauth2_proxy_realm }}/protocol/openid-connect/userinfo"
      OAUTH2_PROXY_VALIDATE_URL: "http://keycloak:8080/realms/{{ oauth2_proxy_realm }}/protocol/openid-connect/userinfo"
      OAUTH2_PROXY_CODE_CHALLENGE_METHOD: S256
      OAUTH2_PROXY_HTTP_ADDRESS: "0.0.0.0:4180"
      OAUTH2_PROXY_REVERSE_PROXY: "true"
      OAUTH2_PROXY_EMAIL_DOMAINS: "*"
      OAUTH2_PROXY_INSECURE_OIDC_ALLOW_UNVERIFIED_EMAIL: "true"
      OAUTH2_PROXY_COOKIE_SECRET: "{{ oauth2_proxy_cookie_secret }}"
      OAUTH2_PROXY_COOKIE_SECURE: "true"
      OAUTH2_PROXY_COOKIE_DOMAINS: ".{{ oauth2_proxy_cookie_domain }}"
      OAUTH2_PROXY_WHITELIST_DOMAINS: ".{{ oauth2_proxy_cookie_domain }}"
      OAUTH2_PROXY_SET_XAUTHREQUEST: "true"
      OAUTH2_PROXY_SKIP_PROVIDER_BUTTON: "true"
      OAUTH2_PROXY_UPSTREAMS: "static://202"
@@PORTS@@

networks:
  keycloak:
    name: dn-keycloak_default
    external: true""",
    check='/ping', retries=30,
    note="Crea los usuarios en Keycloak, realm «{{ oauth2_proxy_realm }}» (con su correo). Dominios protegidos: {{ oauth2_proxy_protect | join(', ') }}.",
)
