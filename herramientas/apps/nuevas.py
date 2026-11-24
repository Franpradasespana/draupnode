# Fichas de las apps añadidas en la 0.63 (las lee gen.py junto con apps.py).
# Todas son software libre; la licencia sale en su ficha del Catálogo.
from apps import APPS, UPDATE

CONT = '2 · Contenedores'
BD = '4 · Bases de datos'
MON = '6 · Monitorización'
APPS_CAT = '7 · Apps'
SEG = '8 · Seguridad'


def usuario_en_secretos(p, fichero, usuario, var, extra=''):
    """Tarea que deja «Usuario/Contraseña» en la carpeta de secretos (se ve en «Contraseñas»)."""
    return f"""
- name: Usuario y contraseña, para verlos en la app
  ansible.builtin.copy:
    dest: "{{{{ draupnode_secrets_dir }}}}/{fichero}"
    mode: "0600"
    content: "Usuario: {usuario}\\nContraseña: {{{{ {p}_{var} }}}}\\n{extra}"
  no_log: true
  when: not ansible_check_mode
"""


def red_compartida(var):
    return f"""
- name: Red de Docker compartida «{{{{ {var} }}}}» (la de las bases de datos)
  ansible.builtin.shell: docker network inspect {{{{ {var} | quote }}}} >/dev/null 2>&1 || {{ docker network create {{{{ {var} | quote }}}} >/dev/null && echo creada; }}
  register: red_compartida
  changed_when: "'creada' in red_compartida.stdout"
  when: not ansible_check_mode
"""


RED_VAR = lambda p: f"""- name: {p}_network
  label: Red de Docker
  help: La misma que la de PostgreSQL/MariaDB compartidos («apps» si no la has cambiado). Las apps de esa red llegan a este contenedor por su nombre.
  type: string
  default: apps
  pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.-]{{0,62}}$'
  pattern_help: Letras, números, punto, guion y guion bajo"""

# ------------------------------------------------------------------ Contenedores

APPS['portainer'] = dict(
    category=CONT,
    links=[('Documentación', 'https://docs.portainer.io'), ('Código fuente', 'https://github.com/portainer/portainer')],
    id='portainer', name='Portainer (panel de Docker)', short='Portainer', license='zlib (edición Community)',
    description='Un panel web para ver y manejar Docker: contenedores, imágenes, volúmenes, redes, registros y stacks de Compose.',
    details="""Portainer Community Edition (la libre) en Docker. Draupnode crea el
usuario «admin» con una contraseña generada en el servidor (en
«Contraseñas»).
OJO: Portainer maneja Docker entero, que equivale a ser root en el
servidor. Mejor sin dominio: entra con «Abrir» (túnel SSH) o por la VPN.""",
    port=9010, cport=9000, data_desc='su configuración, usuarios y stacks guardados (tus contenedores no se tocan)', dirs=['data'],
    secrets=[('portainer_admin', 'Usuario «admin» de Portainer')],
    generate=[dict(file='.portainer_admin_pass', var='admin_pass', len=24)],
    vars=[UPDATE('portainer', 'Portainer')],
    mid_tasks="""
- name: Contraseña inicial de «admin» (Portainer solo la lee la primera vez)
  ansible.builtin.copy:
    dest: /srv/draupnode/apps/portainer/admin_pass
    content: "{{ portainer_admin_pass }}"
    mode: "0600"
  no_log: true
  when: not ansible_check_mode
""",
    compose="""  portainer:
    image: portainer/portainer-ce:lts
    {% if portainer_update | bool %}pull_policy: always
    {% endif %}container_name: dn-portainer
    restart: unless-stopped
    command: --admin-password-file /run/draupnode/admin_pass
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/data
      - ./admin_pass:/run/draupnode/admin_pass:ro
@@PORTS@@""",
    post_tasks=usuario_en_secretos('portainer', 'portainer_admin', 'admin', 'admin_pass'),
    note="Entra con «admin» (contraseña en «Contraseñas»). Maneja todo Docker: no lo publiques sin necesidad.",
    check='/api/system/status',
)

APPS['registry'] = dict(
    category=CONT,
    links=[('Documentación', 'https://distribution.github.io/distribution/'), ('Código fuente', 'https://github.com/distribution/distribution')],
    id='registry', name='Registro de imágenes Docker', short='Registro de Docker', license='Apache-2.0',
    description='Tu propio Docker Hub privado: guarda tus imágenes en el servidor y descárgalas desde tus equipos o tu CI con usuario y contraseña.',
    details="""El registro oficial de Docker (CNCF Distribution 3) con usuario y
contraseña (generada en el servidor, en «Contraseñas»).
Para usarlo desde otros equipos ponle dominio (Caddy o nginx) y haz
«docker login tu-dominio»: Docker solo habla con registros con HTTPS
(salvo 127.0.0.1). Las imágenes se guardan en
/srv/draupnode/apps/registry/data (pueden ocupar mucho).""",
    port=5000, cport=5000, data_desc='todas las imágenes subidas', dirs=['data', 'auth'],
    secrets=[('registry_usuario', 'Usuario del registro de imágenes')],
    generate=[dict(file='.registry_pass', var='pass', len=32)],
    vars=[
        """- name: registry_user
  label: Usuario
  help: Con este usuario y la contraseña generada se hace «docker login».
  type: string
  default: draupnode
  pattern: '^[a-z][a-z0-9_-]{2,30}$'
  pattern_help: Minúsculas, números, - y _""",
        UPDATE('registry', 'el registro'),
    ],
    mid_tasks="""
- name: Usuario del registro (htpasswd con bcrypt; solo cambia si cambian usuario o contraseña)
  ansible.builtin.shell: |
    set -e
    f=/srv/draupnode/apps/registry/auth/htpasswd
    huella=$(printf '%s:%s' "$U" "$P" | sha256sum | cut -d' ' -f1)
    [ -f "$f" ] && [ "$(cat "$f.huella" 2>/dev/null)" = "$huella" ] && exit 0
    docker run --rm --entrypoint htpasswd docker.io/library/httpd:2.4-alpine -Bbn "$U" "$P" > "$f.tmp"
    chmod 644 "$f.tmp"; mv "$f.tmp" "$f"
    echo "$huella" > "$f.huella"; chmod 600 "$f.huella"
    echo cambiado
  environment:
    U: "{{ registry_user }}"
    P: "{{ registry_pass }}"
  register: registry_htpasswd
  changed_when: "'cambiado' in registry_htpasswd.stdout"
  no_log: true
  when: not ansible_check_mode
""",
    compose="""  registry:
    image: docker.io/library/registry:3
    {% if registry_update | bool %}pull_policy: always
    {% endif %}container_name: dn-registry
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      REGISTRY_AUTH: htpasswd
      REGISTRY_AUTH_HTPASSWD_REALM: Registro
      REGISTRY_AUTH_HTPASSWD_PATH: /auth/htpasswd
      REGISTRY_STORAGE_DELETE_ENABLED: "true"
    volumes:
      - ./data:/var/lib/registry
      - ./auth:/auth:ro
@@PORTS@@""",
    post_tasks=usuario_en_secretos('registry', 'registry_usuario', '{{ registry_user }}', 'pass',
                                   'Entrar: docker login {{ registry_domain if registry_domain else (\\"127.0.0.1:\\" ~ registry_port) }}\\n'),
    note="Usuario {{ registry_user }} (contraseña en «Contraseñas»). Desde otros equipos: ponle dominio y «docker login {{ registry_domain if registry_domain else 'tu-dominio' }}».",
    check='/v2/',
)

APPS['dozzle'] = dict(
    category=MON,
    links=[('Web oficial', 'https://dozzle.dev'), ('Código fuente', 'https://github.com/amir20/dozzle')],
    id='dozzle', name='Dozzle (registros de Docker)', short='Dozzle', license='MIT',
    description='Mira en directo, desde el navegador, lo que escriben todos los contenedores (sus registros), con buscador. Muy ligero.',
    details="""Dozzle en Docker. Solo lee: no guarda nada ni toca los contenedores.
Pide usuario y contraseña («admin», contraseña en «Contraseñas»):
los registros pueden llevar datos delicados.
Para guardar los registros y buscarlos días después, mejor el módulo
«Registros» (Loki + Grafana).""",
    port=8888, cport=8080, data_desc='su usuario y ajustes', dirs=['data'],
    secrets=[('dozzle_admin', 'Usuario «admin» de Dozzle')],
    generate=[dict(file='.dozzle_admin_pass', var='admin_pass', len=24)],
    vars=[UPDATE('dozzle', 'Dozzle')],
    mid_tasks="""
- name: Usuario «admin» de Dozzle (solo cambia si cambia la contraseña)
  ansible.builtin.shell: |
    set -e
    f=/srv/draupnode/apps/dozzle/data/users.yml
    huella=$(printf '%s' "$P" | sha256sum | cut -d' ' -f1)
    [ -f "$f" ] && [ "$(cat /srv/draupnode/apps/dozzle/.huella 2>/dev/null)" = "$huella" ] && exit 0
    docker run --rm docker.io/amir20/dozzle:latest generate admin --password "$P" --email admin@localhost --name Administrador > "$f.tmp"
    grep -q '^users:' "$f.tmp"
    mv "$f.tmp" "$f"
    echo "$huella" > /srv/draupnode/apps/dozzle/.huella; chmod 600 /srv/draupnode/apps/dozzle/.huella
    echo cambiado
  environment:
    P: "{{ dozzle_admin_pass }}"
  register: dozzle_users
  changed_when: "'cambiado' in dozzle_users.stdout"
  no_log: true
  when: not ansible_check_mode
""",
    compose="""  dozzle:
    image: docker.io/amir20/dozzle:latest
    {% if dozzle_update | bool %}pull_policy: always
    {% endif %}container_name: dn-dozzle
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      DOZZLE_AUTH_PROVIDER: simple
      DOZZLE_NO_ANALYTICS: "true"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./data:/data
@@PORTS@@""",
    post_tasks=usuario_en_secretos('dozzle', 'dozzle_admin', 'admin', 'admin_pass'),
    note="Entra con «admin» (contraseña en «Contraseñas»).",
    check='/',
)

# ------------------------------------------------------------------ Bases de datos

APPS['valkey'] = dict(
    category=BD, no_proxy=True, no_public=True, probe='tcp',
    links=[('Web oficial', 'https://valkey.io'), ('Código fuente', 'https://github.com/valkey-io/valkey')],
    id='valkey', name='Valkey (caché compatible con Redis)', short='Valkey', license='BSD-3-Clause',
    description='Caché y colas en memoria, compatible con Redis, para tus apps. Es la continuación libre de Redis (que dejó de ser software libre en la 7.4).',
    details="""Valkey 9 en Docker, compartido por tus apps: escucha en 127.0.0.1 y,
dentro de Docker, como «valkey-compartido» en la red indicada (la de
PostgreSQL y MariaDB compartidos). Con contraseña (en «Contraseñas»).
En tus apps: redis://:CONTRASEÑA@valkey-compartido:6379/0
Guarda los datos en disco (appendonly) para no perderlos al reiniciar.""",
    port=6379, cport=6379, data_desc='lo que tus apps guardan en Valkey', dirs=['data'],
    secrets=[('valkey_password', 'Contraseña de Valkey')],
    generate=[dict(file='valkey_password', var='password', len=32)],
    vars=[
        RED_VAR('valkey'),
        """- name: valkey_maxmemory_mb
  label: Memoria máxima (MB)
  help: 0 = sin límite. Si se llena, borra las claves menos usadas (modo caché).
  type: int
  default: 0
  min: 0
  max: 65536""",
        UPDATE('valkey', 'Valkey'),
    ],
    pre_tasks=red_compartida('valkey_network'),
    mid_tasks="""
- name: Configuración de Valkey
  ansible.builtin.copy:
    dest: /srv/draupnode/apps/valkey/valkey.conf
    # Se lee dentro del contenedor con otro usuario; la carpeta de fuera es solo de root.
    mode: "0644"
    content: |
      requirepass {{ valkey_password }}
      appendonly yes
      {% if valkey_maxmemory_mb | int > 0 %}maxmemory {{ valkey_maxmemory_mb }}mb
      maxmemory-policy allkeys-lru
      {% endif %}
  no_log: true
  when: not ansible_check_mode
""",
    compose="""  valkey:
    image: docker.io/valkey/valkey:9
    {% if valkey_update | bool %}pull_policy: always
    {% endif %}container_name: valkey-compartido
    restart: unless-stopped
    command: ["valkey-server", "/etc/valkey/valkey.conf"]
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    volumes:
      - ./data:/data
      - ./valkey.conf:/etc/valkey/valkey.conf:ro
    networks: [{{ valkey_network }}]
@@PORTS@@

networks:
  {{ valkey_network }}:
    external: true""",
    note="En tus apps: redis://:CONTRASEÑA@valkey-compartido:6379/0 (red «{{ valkey_network }}»), o 127.0.0.1:{{ valkey_port }} desde el servidor. Contraseña en «Contraseñas».",
)

APPS['adminer'] = dict(
    category=BD,
    links=[('Web oficial', 'https://www.adminer.org'), ('Código fuente', 'https://github.com/vrana/adminer')],
    id='adminer', name='Adminer (ver y editar bases de datos)', short='Adminer', license='Apache-2.0 o GPL-2.0',
    description='Una página para ver y editar tus bases de datos PostgreSQL y MariaDB: tablas, datos, consultas SQL, importar y exportar.',
    details="""Adminer (un solo fichero PHP) en Docker, en la red de las bases de
datos compartidas. Al entrar elige el sistema y escribe el servidor
(«pg-compartido» o «mariadb-compartido», o el nombre del contenedor
de tu app) con su usuario y contraseña (en «Contraseñas»).
No guarda nada. Mejor sin dominio: entra con «Abrir» (túnel SSH).""",
    port=8085, cport=8080, data_desc='nada (Adminer no guarda datos)', dirs=[],
    vars=[RED_VAR('adminer'), UPDATE('adminer', 'Adminer')],
    pre_tasks=red_compartida('adminer_network'),
    compose="""  adminer:
    image: docker.io/library/adminer:latest
    {% if adminer_update | bool %}pull_policy: always
    {% endif %}container_name: dn-adminer
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      ADMINER_DEFAULT_SERVER: pg-compartido
    networks: [{{ adminer_network }}]
@@PORTS@@

networks:
  {{ adminer_network }}:
    external: true""",
    note="Servidor: pg-compartido o mariadb-compartido (o el contenedor de tu app), con su usuario y contraseña.",
    check='/',
)

# ------------------------------------------------------------------ Monitorización

APPS['uptime-kuma'] = dict(
    category=MON,
    links=[('Web oficial', 'https://uptime.kuma.pet'), ('Código fuente', 'https://github.com/louislam/uptime-kuma')],
    id='uptime-kuma', name='Uptime Kuma (¿están vivas mis webs?)', short='Uptime Kuma', license='MIT',
    description='Comprueba cada minuto que tus webs, puertos y servicios responden, te avisa (Telegram, ntfy, correo…) y hace una página de estado pública.',
    details="""Uptime Kuma 2 en Docker. El primer usuario que entra se queda de
administrador: entra enseguida después de aplicar.
Mejor en un servidor DISTINTO del que vigila: si se cae ese servidor,
este sigue avisando.""",
    port=3002, cport=3001, ram=300, data_desc='las comprobaciones, su historial y los avisos configurados', dirs=['data'],
    vars=[UPDATE('uptime_kuma', 'Uptime Kuma')],
    compose="""  uptime-kuma:
    image: docker.io/louislam/uptime-kuma:2
    {% if uptime_kuma_update | bool %}pull_policy: always
    {% endif %}container_name: dn-uptime-kuma
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    volumes:
      - ./data:/app/data
@@PORTS@@""",
    note="Entra enseguida y crea el administrador (el primero que entra lo es).",
    check='/', retries=60,
)

APPS['ntfy'] = dict(
    category=MON,
    links=[('Web oficial', 'https://ntfy.sh'), ('Documentación', 'https://docs.ntfy.sh'), ('Código fuente', 'https://github.com/binwiederhier/ntfy')],
    id='ntfy', name='ntfy (tu servidor de avisos)', short='ntfy', license='Apache-2.0 o GPL-2.0',
    description='Tu propio servidor de notificaciones push: manda avisos al móvil (app ntfy) con una simple petición HTTP. Lo pueden usar las Alertas.',
    details="""ntfy en Docker, cerrado: nadie lee ni publica sin usuario. Draupnode
crea el usuario «admin» y un token (en «Contraseñas»).
Para las Alertas de Draupnode: en el módulo Alertas pon como servidor
https://tu-dominio y el token. En la app ntfy del móvil, añade tu
servidor con el usuario y la contraseña.
Necesita dominio con HTTPS para usarlo desde el móvil.""",
    port=2586, cport=80, data_desc='usuarios, tokens y mensajes guardados', dirs=['data'],
    secrets=[('ntfy_admin', 'Usuario «admin» y token de ntfy')],
    generate=[dict(file='.ntfy_admin_pass', var='admin_pass', len=24)],
    vars=[
        """- name: ntfy_ios_push
  label: Avisos instantáneos en iPhone
  help: En iPhone los avisos llegan al momento solo si tu servidor pide a ntfy.sh que despierte la app (manda un identificador, nunca el mensaje).
  type: bool
  default: false""",
        UPDATE('ntfy', 'ntfy'),
    ],
    compose="""  ntfy:
    image: docker.io/binwiederhier/ntfy:latest
    {% if ntfy_update | bool %}pull_policy: always
    {% endif %}container_name: dn-ntfy
    restart: unless-stopped
    command: serve
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      NTFY_BASE_URL: "{{ ('https://' ~ ntfy_domain) if ntfy_domain else ('http://127.0.0.1:' ~ ntfy_port) }}"
      NTFY_CACHE_FILE: /var/lib/ntfy/cache.db
      NTFY_AUTH_FILE: /var/lib/ntfy/user.db
      NTFY_AUTH_DEFAULT_ACCESS: deny-all
      NTFY_BEHIND_PROXY: "true"
{% if ntfy_ios_push | bool %}      NTFY_UPSTREAM_BASE_URL: https://ntfy.sh
{% endif %}    volumes:
      - ./data:/var/lib/ntfy
@@PORTS@@""",
    post_tasks="""
- name: Usuario «admin» y token (la primera vez)
  ansible.builtin.shell: |
    set -e
    for i in $(seq 30); do docker exec dn-ntfy ntfy user list >/dev/null 2>&1 && break; sleep 2; done
    if ! docker exec dn-ntfy ntfy user list 2>&1 | grep -q '^user admin '; then
      docker exec -e NTFY_PASSWORD="$P" dn-ntfy ntfy user add --role=admin admin >/dev/null
      echo creado
    fi
    t="{{ draupnode_secrets_dir }}/.ntfy_token"
    if [ ! -s "$t" ]; then
      docker exec dn-ntfy ntfy token add admin 2>&1 | grep -o 'tk_[A-Za-z0-9]*' | head -n1 > "$t"
      chmod 600 "$t"; echo creado
    fi
    printf 'Usuario: admin\\nContraseña: %s\\nToken (para las Alertas): %s\\n' "$P" "$(cat "$t")" > "{{ draupnode_secrets_dir }}/ntfy_admin"
    chmod 600 "{{ draupnode_secrets_dir }}/ntfy_admin"
  environment:
    P: "{{ ntfy_admin_pass }}"
  register: ntfy_user
  changed_when: "'creado' in ntfy_user.stdout"
  no_log: true
  when: not ansible_check_mode
""",
    uninstall_extra="""- name: Borrar el token guardado
  ansible.builtin.file:
    path: "{{ draupnode_secrets_dir }}/.ntfy_token"
    state: absent
  when: draupnode_uninstall_purge | bool and not ansible_check_mode

""",
    note="Usuario «admin» y token en «Contraseñas». Para las Alertas: servidor {{ ('https://' ~ ntfy_domain) if ntfy_domain else 'https://tu-dominio' }} y el token.",
    check='/v1/health',
)

# ------------------------------------------------------------------ Seguridad

APPS['keycloak'] = dict(
    category=SEG,
    links=[('Web oficial', 'https://www.keycloak.org'), ('Código fuente', 'https://github.com/keycloak/keycloak')],
    id='keycloak', name='Keycloak (inicio de sesión único)', short='Keycloak', license='Apache-2.0',
    description='Un solo usuario y contraseña (con doble factor) para todas tus apps: inicio de sesión único con OpenID Connect y SAML, como «Entrar con Google» pero tuyo.',
    details="""Keycloak 26 en Docker, con su propio PostgreSQL. Draupnode crea el
administrador temporal «admin» (en «Contraseñas»): entra, crea tu
propio usuario administrador en el realm «master» y borra «admin»
(Keycloak te lo recuerda).
Para que tus apps lo usen necesita dominio con HTTPS (Caddy o nginx).
Es pesado: pide 1,2 GB de RAM y tarda un minuto en arrancar.""",
    port=8180, cport=8080, ram=1200, data_desc='usuarios, realms, clientes y su base de datos', dirs=['pgdata'], db_dir='pgdata',
    secrets=[('keycloak_admin', 'Administrador temporal de Keycloak')],
    generate=[dict(file='.keycloak_admin_pass', var='admin_pass', len=24), dict(file='.keycloak_db', var='db_pass', len=32)],
    vars=[UPDATE('keycloak', 'Keycloak')],
    compose="""  db:
    image: docker.io/library/postgres:17-alpine
    container_name: dn-keycloak-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: "{{ keycloak_db_pass }}"
    volumes:
      - ./pgdata:/var/lib/postgresql/data
  keycloak:
    image: quay.io/keycloak/keycloak:26.8
    {% if keycloak_update | bool %}pull_policy: always
    {% endif %}container_name: dn-keycloak
    restart: unless-stopped
    command: start
    depends_on: [db]
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://db:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: "{{ keycloak_db_pass }}"
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: "{{ keycloak_admin_pass }}"
      KC_HTTP_ENABLED: "true"
      KC_PROXY_HEADERS: xforwarded
      KC_HEALTH_ENABLED: "true"
{% if keycloak_domain %}      KC_HOSTNAME: "https://{{ keycloak_domain }}"
{% else %}      KC_HOSTNAME_STRICT: "false"
{% endif %}@@PORTS@@""",
    post_tasks=usuario_en_secretos('keycloak', 'keycloak_admin', 'admin', 'admin_pass'),
    note="Entra con «admin» (contraseña en «Contraseñas»), crea tu propio administrador y borra «admin».",
    check='/realms/master', retries=100,
)

APPS['openbao'] = dict(
    category=SEG,
    links=[('Web oficial', 'https://openbao.org'), ('Código fuente', 'https://github.com/openbao/openbao')],
    id='openbao', name='OpenBao (caja fuerte de secretos)', short='OpenBao', license='MPL-2.0',
    description='Guarda y reparte las contraseñas, claves y certificados de tus apps de forma segura, con permisos y registro de quién lee qué. La continuación libre de HashiCorp Vault.',
    details="""OpenBao 2 en Docker (Vault dejó de ser software libre en 2023).
Draupnode lo inicia la primera vez con una sola clave de desbloqueo y
guarda la clave y el token raíz en «Contraseñas»: CÓPIALOS a tu gestor
de contraseñas; sin la clave, los datos no se pueden recuperar.
Al reiniciarse, OpenBao arranca bloqueado. Con «Desbloquear solo»,
el servidor lo desbloquea al arrancar usando la clave guardada en él
(cómodo, pero quien entre como root al servidor puede leerlo todo).
Panel web en /ui (entra con el token raíz).""",
    port=8200, cport=8200, data_desc='todos los secretos guardados (cifrados)', dirs=['data', 'config'],
    secrets=[('openbao_claves', 'Clave de desbloqueo y token raíz de OpenBao')],
    vars=[
        """- name: openbao_auto_unseal
  label: Desbloquear solo
  help: Al arrancar el servidor (y al aplicar) lo desbloquea con la clave guardada en el servidor. Sin esto, lo desbloqueas tú en /ui con la clave.
  type: bool
  default: true""",
        UPDATE('openbao', 'OpenBao'),
    ],
    mid_tasks="""
- name: Configuración de OpenBao
  ansible.builtin.copy:
    dest: /srv/draupnode/apps/openbao/config/config.hcl
    mode: "0644"
    content: |
      ui = true
      disable_mlock = true
      api_addr = "http://127.0.0.1:8200"
      cluster_addr = "http://127.0.0.1:8201"
      # Almacenamiento integrado (raft) de un solo nodo: el que recomienda OpenBao 2.
      storage "raft" {
        path    = "/openbao/file"
        node_id = "draupnode"
      }
      listener "tcp" {
        address     = "0.0.0.0:8200"
        tls_disable = true
      }
  when: not ansible_check_mode

- name: Las carpetas son del usuario de la imagen (OpenBao no corre como root)
  ansible.builtin.shell: |
    u=$(docker run --rm --entrypoint id quay.io/openbao/openbao:2 -u)
    g=$(docker run --rm --entrypoint id quay.io/openbao/openbao:2 -g)
    c=0
    for d in /srv/draupnode/apps/openbao/data /srv/draupnode/apps/openbao/config; do
      [ "$(stat -c %u:%g "$d")" = "$u:$g" ] || { chown -R "$u:$g" "$d"; c=1; }
    done
    [ $c = 1 ] && echo cambiado || true
  register: openbao_own
  changed_when: "'cambiado' in openbao_own.stdout"
  when: not ansible_check_mode

- name: Script para iniciar y desbloquear OpenBao
  ansible.builtin.copy:
    dest: /usr/local/sbin/draupnode-openbao
    mode: "0700"
    content: |
      #!/usr/bin/env python3
      # Inicia OpenBao la primera vez (una clave) y lo desbloquea. Uso: draupnode-openbao [iniciar|desbloquear]
      import json, os, sys, time, urllib.request
      URL = "http://127.0.0.1:{{ openbao_port }}"
      SECRETOS = {{ draupnode_secrets_dir | to_json }}
      INIT = os.path.join(SECRETOS, ".openbao_init.json")
      def api(ruta, datos=None):
          req = urllib.request.Request(URL + ruta, data=None if datos is None else json.dumps(datos).encode(), method="GET" if datos is None else "PUT")
          return json.load(urllib.request.urlopen(req, timeout=15))
      for _ in range(60):
          try:
              st = api("/v1/sys/seal-status"); break
          except Exception:
              time.sleep(3)
      else:
          sys.exit("OpenBao no responde en " + URL)
      orden = sys.argv[1] if len(sys.argv) > 1 else "desbloquear"
      if not st.get("initialized"):
          if not orden.startswith("iniciar"):
              sys.exit("OpenBao está sin iniciar: aplica el módulo desde Draupnode")
          r = api("/v1/sys/init", {"secret_shares": 1, "secret_threshold": 1})
          fd = os.open(INIT, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
          os.write(fd, json.dumps(r).encode()); os.close(fd)
          print("iniciado")
          st = api("/v1/sys/seal-status")
      if os.path.exists(INIT):
          r = json.load(open(INIT))
          fd = os.open(os.path.join(SECRETOS, "openbao_claves"), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
          os.write(fd, ("Clave de desbloqueo: %s\\nToken raíz: %s\\n" % (r["keys_base64"][0], r["root_token"])).encode()); os.close(fd)
      if st.get("sealed") and orden in ("iniciar", "desbloquear") and os.path.exists(INIT):
          st = api("/v1/sys/unseal", {"key": json.load(open(INIT))["keys_base64"][0]})
          print("desbloqueado" if not st.get("sealed") else "sigue bloqueado")
      elif st.get("sealed"):
          print("bloqueado")
  when: not ansible_check_mode
""",
    compose="""  openbao:
    image: quay.io/openbao/openbao:2
    {% if openbao_update | bool %}pull_policy: always
    {% endif %}container_name: dn-openbao
    restart: unless-stopped
    command: server
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      BAO_ADDR: http://127.0.0.1:8200
    volumes:
      - ./config:/openbao/config:ro
      - ./data:/openbao/file
@@PORTS@@""",
    post_tasks="""
- name: Iniciar (la primera vez) y desbloquear
  ansible.builtin.command: /usr/local/sbin/draupnode-openbao {{ 'iniciar' if openbao_auto_unseal | bool else 'iniciar-sin-desbloquear' }}
  register: openbao_init
  changed_when: "'iniciado' in openbao_init.stdout or 'desbloqueado' in openbao_init.stdout"
  when: not ansible_check_mode

- name: Desbloquear al arrancar el servidor
  ansible.builtin.copy:
    dest: /etc/systemd/system/draupnode-openbao.service
    mode: "0644"
    content: |
      [Unit]
      Description=Desbloquear OpenBao (Draupnode)
      After=docker.service
      Wants=docker.service
      [Service]
      Type=oneshot
      ExecStart=/usr/local/sbin/draupnode-openbao desbloquear
      [Install]
      WantedBy=multi-user.target
  when: openbao_auto_unseal | bool and not ansible_check_mode

- name: Activar (o quitar) el desbloqueo al arrancar
  ansible.builtin.shell: |
    if [ "{{ openbao_auto_unseal | bool }}" = True ]; then
      systemctl daemon-reload; systemctl is-enabled -q draupnode-openbao.service || { systemctl enable -q draupnode-openbao.service; echo cambiado; }
    elif [ -f /etc/systemd/system/draupnode-openbao.service ]; then
      systemctl disable -q draupnode-openbao.service; rm -f /etc/systemd/system/draupnode-openbao.service; systemctl daemon-reload; echo cambiado
    fi
  register: openbao_unit
  changed_when: "'cambiado' in openbao_unit.stdout"
  when: not ansible_check_mode
""",
    uninstall_extra="""- name: Quitar el desbloqueo al arrancar y el script
  ansible.builtin.shell: |
    systemctl disable -q draupnode-openbao.service 2>/dev/null || true
    rm -f /etc/systemd/system/draupnode-openbao.service /usr/local/sbin/draupnode-openbao
    systemctl daemon-reload
  when: not ansible_check_mode

- name: Borrar la clave de desbloqueo guardada
  ansible.builtin.file:
    path: "{{ draupnode_secrets_dir }}/.openbao_init.json"
    state: absent
  when: draupnode_uninstall_purge | bool and not ansible_check_mode

""",
    note="Clave de desbloqueo y token raíz en «Contraseñas»: cópialos a tu gestor de contraseñas. Panel en /ui. {{ 'Se desbloquea solo al arrancar.' if openbao_auto_unseal | bool else 'Al reiniciar queda bloqueado: desbloquéalo en /ui con la clave.' }}",
    check='/v1/sys/seal-status',
)

# ------------------------------------------------------------------ Apps

APPS['nextcloud'] = dict(
    links=[('Web oficial', 'https://nextcloud.com'), ('Código fuente', 'https://github.com/nextcloud/server')],
    id='nextcloud', name='Nextcloud (tu nube)', short='Nextcloud', license='AGPL-3.0',
    description='Tu propio Google Drive: archivos sincronizados con tus equipos y el móvil, calendario, contactos, documentos compartidos y cientos de apps.',
    details="""Nextcloud (versión estable) en Docker, con su propio PostgreSQL,
Valkey para la caché y las tareas en segundo plano (cron). Draupnode
crea el usuario «admin» con una contraseña generada en el servidor
(en «Contraseñas»). La primera vez tarda unos minutos en instalarse.
Para las apps de escritorio y del móvil, mejor con dominio y HTTPS.
Los archivos están en /srv/draupnode/apps/nextcloud/html/data (entran
en las copias: pueden ocupar mucho).""",
    port=8090, cport=80, ram=1500, data_desc='todos los archivos, calendarios, contactos y su base de datos', dirs=['html', 'pgdata'], db_dir='pgdata',
    secrets=[('nextcloud_admin', 'Usuario «admin» de Nextcloud')],
    generate=[dict(file='.nextcloud_admin_pass', var='admin_pass', len=24), dict(file='.nextcloud_db', var='db_pass', len=32)],
    vars=[UPDATE('nextcloud', 'Nextcloud')],
    compose="""  db:
    image: docker.io/library/postgres:17-alpine
    container_name: dn-nextcloud-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: nextcloud
      POSTGRES_USER: nextcloud
      POSTGRES_PASSWORD: "{{ nextcloud_db_pass }}"
    volumes:
      - ./pgdata:/var/lib/postgresql/data
  redis:
    image: docker.io/valkey/valkey:9
    container_name: dn-nextcloud-redis
    restart: unless-stopped
  nextcloud:
    image: docker.io/library/nextcloud:stable
    {% if nextcloud_update | bool %}pull_policy: always
    {% endif %}container_name: dn-nextcloud
    restart: unless-stopped
    depends_on: [db, redis]
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment: &nc
      POSTGRES_HOST: db
      POSTGRES_DB: nextcloud
      POSTGRES_USER: nextcloud
      POSTGRES_PASSWORD: "{{ nextcloud_db_pass }}"
      NEXTCLOUD_ADMIN_USER: admin
      NEXTCLOUD_ADMIN_PASSWORD: "{{ nextcloud_admin_pass }}"
      NEXTCLOUD_TRUSTED_DOMAINS: "127.0.0.1 localhost {{ nextcloud_domain }}"
      REDIS_HOST: redis
      TRUSTED_PROXIES: "172.16.0.0/12 127.0.0.1"
      PHP_UPLOAD_LIMIT: 4G
{% if nextcloud_domain %}      OVERWRITEPROTOCOL: https
{% endif %}    volumes:
      - ./html:/var/www/html
@@PORTS@@
  cron:
    image: docker.io/library/nextcloud:stable
    {% if nextcloud_update | bool %}pull_policy: always
    {% endif %}container_name: dn-nextcloud-cron
    restart: unless-stopped
    entrypoint: /cron.sh
    depends_on: [nextcloud]
    environment: *nc
    volumes:
      - ./html:/var/www/html""",
    post_tasks="""
- name: Dominio y tareas en segundo plano por cron
  ansible.builtin.shell: |
    occ() { docker exec -u www-data dn-nextcloud php occ "$@"; }
    for i in $(seq 60); do occ status --output=json 2>/dev/null | grep -q '"installed":true' && break; sleep 5; done
    occ status --output=json 2>/dev/null | grep -q '"installed":true' || { echo "Nextcloud aún se está instalando"; exit 0; }
    [ "$(occ config:app:get core backgroundjobs_mode)" = cron ] || { occ background:cron >/dev/null; echo cambiado; }
    {% if nextcloud_domain %}
    [ "$(occ config:system:get trusted_domains 2)" = "{{ nextcloud_domain }}" ] || { occ config:system:set trusted_domains 2 --value="{{ nextcloud_domain }}" >/dev/null; echo cambiado; }
    [ "$(occ config:system:get overwrite.cli.url)" = "https://{{ nextcloud_domain }}" ] || { occ config:system:set overwrite.cli.url --value="https://{{ nextcloud_domain }}" >/dev/null; occ config:system:set overwriteprotocol --value=https >/dev/null; echo cambiado; }
    {% endif %}
  register: nextcloud_occ
  changed_when: "'cambiado' in nextcloud_occ.stdout"
  when: not ansible_check_mode
""" + usuario_en_secretos('nextcloud', 'nextcloud_admin', 'admin', 'admin_pass'),
    note="Entra con «admin» (contraseña en «Contraseñas»). La primera vez tarda unos minutos en instalarse.",
    check='/status.php', retries=150,
)

APPS['wikijs'] = dict(
    links=[('Web oficial', 'https://js.wiki'), ('Código fuente', 'https://github.com/requarks/wiki')],
    id='wikijs', name='Wiki.js (wiki y documentación)', short='Wiki.js', license='AGPL-3.0',
    description='Una wiki bonita y rápida para la documentación de tu equipo o tus notas: editor visual o Markdown, búsqueda, permisos e historial.',
    details="""Wiki.js 2 en Docker, con su propio PostgreSQL. La primera vez,
entra y rellena el asistente: crea el administrador y pon la dirección
del sitio (https://tu-dominio o la que te dé «Abrir»).""",
    port=3003, cport=3000, ram=500, data_desc='todas las páginas, usuarios y su base de datos', dirs=['pgdata'], db_dir='pgdata',
    generate=[dict(file='.wikijs_db', var='db_pass', len=32)],
    vars=[UPDATE('wikijs', 'Wiki.js')],
    compose="""  db:
    image: docker.io/library/postgres:16-alpine
    container_name: dn-wikijs-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: wiki
      POSTGRES_USER: wikijs
      POSTGRES_PASSWORD: "{{ wikijs_db_pass }}"
    volumes:
      - ./pgdata:/var/lib/postgresql/data
  wiki:
    image: ghcr.io/requarks/wiki:2
    {% if wikijs_update | bool %}pull_policy: always
    {% endif %}container_name: dn-wikijs
    restart: unless-stopped
    depends_on: [db]
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      DB_TYPE: postgres
      DB_HOST: db
      DB_PORT: "5432"
      DB_USER: wikijs
      DB_PASS: "{{ wikijs_db_pass }}"
      DB_NAME: wiki
@@PORTS@@""",
    note="Entra enseguida y sigue el asistente (crea el administrador).",
    check='/healthz', retries=60,
)

APPS['vikunja'] = dict(
    links=[('Web oficial', 'https://vikunja.io'), ('Código fuente', 'https://github.com/go-vikunja/vikunja')],
    id='vikunja', name='Vikunja (tareas y proyectos)', short='Vikunja', license='AGPL-3.0',
    description='Listas de tareas y proyectos (lista, tablero Kanban, Gantt y tabla), compartidas con tu familia o tu equipo. Como Todoist o Trello, pero tuyo.',
    details="""Vikunja en Docker, con su base SQLite (sin servidor de base de datos
aparte). Crea tu cuenta y, cuando estéis todos, desactiva «Permitir
registrarse» y vuelve a aplicar.""",
    port=3456, cport=3456, data_desc='todas las tareas, proyectos, adjuntos y usuarios', dirs=['files', 'db'],
    generate=[dict(file='.vikunja_jwt', var='jwt', len=48)],
    vars=[
        """- name: vikunja_registration
  label: Permitir registrarse
  help: Déjalo activado para crear vuestras cuentas; luego desactívalo y aplica.
  type: bool
  default: true""",
        UPDATE('vikunja', 'Vikunja'),
    ],
    pre_tasks="""
- name: Las carpetas de datos son del usuario 1000 (el de Vikunja)
  ansible.builtin.file:
    path: "{{ item }}"
    state: directory
    owner: "1000"
    group: "1000"
    mode: "0750"
  loop:
    - /srv/draupnode/apps/vikunja/files
    - /srv/draupnode/apps/vikunja/db
""",
    compose="""  vikunja:
    image: docker.io/vikunja/vikunja:latest
    {% if vikunja_update | bool %}pull_policy: always
    {% endif %}container_name: dn-vikunja
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
{% if vikunja_domain %}      VIKUNJA_SERVICE_PUBLICURL: "https://{{ vikunja_domain }}/"
{% endif %}      # La web y la API van juntas (mismo origen): sin CORS no hace falta saber la dirección.
      VIKUNJA_CORS_ENABLE: "false"
      VIKUNJA_SERVICE_SECRET: "{{ vikunja_jwt }}"
      VIKUNJA_SERVICE_ENABLEREGISTRATION: "{{ 'true' if vikunja_registration | bool else 'false' }}"
      VIKUNJA_DATABASE_TYPE: sqlite
      VIKUNJA_DATABASE_PATH: /db/vikunja.db
    volumes:
      - ./files:/app/vikunja/files
      - ./db:/db
@@PORTS@@""",
    note="{{ 'Registro ABIERTO: cuando tengáis las cuentas, desactiva «Permitir registrarse» y aplica.' if vikunja_registration | bool else 'Registro cerrado.' }}",
    check='/api/v1/info',
)

APPS['umami'] = dict(
    links=[('Web oficial', 'https://umami.is'), ('Código fuente', 'https://github.com/umami-software/umami')],
    id='umami', name='Umami (estadísticas de tus webs)', short='Umami', license='MIT',
    description='Cuántas visitas tienen tus webs, desde dónde y qué páginas, sin cookies ni rastrear a nadie. Una alternativa libre y respetuosa a Google Analytics.',
    details="""Umami en Docker, con su propio PostgreSQL. Draupnode cambia la
contraseña del usuario «admin» (de serie es «umami») por una generada
en el servidor (en «Contraseñas»).
Añade tu web en Umami y pega su etiqueta <script> en tus páginas. Para
recibir visitas de internet necesita dominio con HTTPS.""",
    port=3004, cport=3000, ram=400, data_desc='todas las estadísticas y su base de datos', dirs=['pgdata'], db_dir='pgdata',
    secrets=[('umami_admin', 'Usuario «admin» de Umami')],
    generate=[dict(file='.umami_admin_pass', var='admin_pass', len=24), dict(file='.umami_db', var='db_pass', len=32), dict(file='.umami_secret', var='app_secret', len=48)],
    vars=[UPDATE('umami', 'Umami')],
    compose="""  db:
    image: docker.io/library/postgres:16-alpine
    container_name: dn-umami-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: umami
      POSTGRES_USER: umami
      POSTGRES_PASSWORD: "{{ umami_db_pass }}"
    volumes:
      - ./pgdata:/var/lib/postgresql/data
  umami:
    image: ghcr.io/umami-software/umami:latest
    {% if umami_update | bool %}pull_policy: always
    {% endif %}container_name: dn-umami
    restart: unless-stopped
    depends_on: [db]
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      DATABASE_URL: "postgresql://umami:{{ umami_db_pass }}@db:5432/umami"
      APP_SECRET: "{{ umami_app_secret }}"
      DISABLE_TELEMETRY: "1"
@@PORTS@@""",
    post_tasks="""
- name: Cambiar la contraseña de serie de «admin» (si sigue siendo «umami»)
  ansible.builtin.uri:
    url: "http://127.0.0.1:{{ umami_port }}/api/auth/login"
    method: POST
    body_format: json
    body: {"username": "admin", "password": "umami"}
    status_code: [200, 401]
  register: umami_login
  no_log: true
  when: not ansible_check_mode

- name: Poner la generada
  ansible.builtin.uri:
    url: "http://127.0.0.1:{{ umami_port }}/api/me/password"
    method: POST
    headers:
      Authorization: "Bearer {{ umami_login.json.token }}"
    body_format: json
    body:
      currentPassword: umami
      newPassword: "{{ umami_admin_pass }}"
  register: umami_pass
  changed_when: true
  no_log: true
  when: not ansible_check_mode and umami_login.status == 200
""" + usuario_en_secretos('umami', 'umami_admin', 'admin', 'admin_pass'),
    note="Entra con «admin» (contraseña en «Contraseñas»), añade tu web y pega su etiqueta en tus páginas.",
    check='/api/heartbeat', retries=60,
)

APPS['healthchecks'] = dict(
    category=MON,
    links=[('Web oficial', 'https://healthchecks.io'), ('Documentación', 'https://healthchecks.io/docs/self_hosted_docker/'), ('Código fuente', 'https://github.com/healthchecks/healthchecks')],
    id='healthchecks', name='Healthchecks (¿se han ejecutado mis tareas?)', short='Healthchecks', license='BSD-3-Clause',
    description='Te avisa cuando una tarea programada NO se ejecuta: copias, cron, scripts. Cada tarea hace ping a una dirección al terminar; si un día no llega, te enteras.',
    details="""Healthchecks en Docker, con su base SQLite. Draupnode crea el usuario
administrador (correo admin@localhost, contraseña en «Contraseñas»).
Crea una comprobación por tarea y añade al final de la tarea:
curl -fsS -m 10 --retry 5 https://tu-dominio/ping/<código>
Mejor en un servidor DISTINTO del de las tareas, y con dominio para
que lleguen los pings de otros servidores.""",
    port=8020, cport=8000, data_desc='las comprobaciones, su historial y los avisos', dirs=['data'],
    secrets=[('healthchecks_admin', 'Administrador de Healthchecks')],
    generate=[dict(file='.healthchecks_admin_pass', var='admin_pass', len=24), dict(file='.healthchecks_secret', var='secret_key', len=50)],
    vars=[
        """- name: healthchecks_registration
  label: Permitir registrarse
  help: Si no, solo el administrador entra (y puede invitar a otros a sus proyectos).
  type: bool
  default: false""",
        UPDATE('healthchecks', 'Healthchecks'),
    ],
    mid_tasks="""
- name: La carpeta de datos es del usuario de la imagen
  ansible.builtin.shell: |
    u=$(docker run --rm --entrypoint id docker.io/healthchecks/healthchecks:latest -u)
    [ "$(stat -c %u /srv/draupnode/apps/healthchecks/data)" = "$u" ] && exit 0
    chown "$u" /srv/draupnode/apps/healthchecks/data && echo cambiado
  register: healthchecks_own
  changed_when: "'cambiado' in healthchecks_own.stdout"
  when: not ansible_check_mode
""",
    compose="""  healthchecks:
    image: docker.io/healthchecks/healthchecks:latest
    {% if healthchecks_update | bool %}pull_policy: always
    {% endif %}container_name: dn-healthchecks
    restart: unless-stopped
    labels:
      draupnode.proyecto: "{{ draupnode_project }}"
    environment:
      DB: sqlite
      DB_NAME: /data/hc.sqlite
      SECRET_KEY: "{{ healthchecks_secret_key }}"
      SITE_ROOT: "{{ ('https://' ~ healthchecks_domain) if healthchecks_domain else ('http://127.0.0.1:' ~ healthchecks_port) }}"
      SITE_NAME: Healthchecks
      ALLOWED_HOSTS: "*"
      REGISTRATION_OPEN: "{{ 'True' if healthchecks_registration | bool else 'False' }}"
      DEBUG: "False"
    volumes:
      - ./data:/data
@@PORTS@@""",
    post_tasks="""
- name: Administrador (la primera vez)
  ansible.builtin.shell: |
    for i in $(seq 30); do docker exec dn-healthchecks ./manage.py check >/dev/null 2>&1 && break; sleep 2; done
    docker exec -e P="$P" dn-healthchecks ./manage.py shell -c "
    import os, sys
    from django.contrib.auth.models import User
    if User.objects.filter(email='admin@localhost').exists(): sys.exit(0)
    from hc.accounts.views import _make_user
    u = _make_user('admin@localhost')
    u.set_password(os.environ['P']); u.is_staff = True; u.is_superuser = True; u.save()
    print('creado')
    " 2>/dev/null | grep -x creado || true
  environment:
    P: "{{ healthchecks_admin_pass }}"
  register: healthchecks_user
  changed_when: "'creado' in healthchecks_user.stdout"
  no_log: true
  when: not ansible_check_mode
""" + usuario_en_secretos('healthchecks', 'healthchecks_admin', 'admin@localhost', 'admin_pass'),
    note="Entra con admin@localhost (contraseña en «Contraseñas»). Cada tarea: curl -fsS -m 10 --retry 5 <dirección de ping> al terminar.",
    check='/', retries=60,
)
