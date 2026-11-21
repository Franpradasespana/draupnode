#!/usr/bin/env python3
"""Genera los módulos de apps de Draupnode (todos con el mismo patrón).
Uso: python3 herramientas/apps/gen.py internal/modules/builtin <id> [<id>...]"""
import os, sys, textwrap, json
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from apps import APPS

def module_yaml(a):
    p = a['id'].replace('-', '_')
    v = []
    v.append(f"""  - name: {p}_port
    label: Puerto en el servidor (solo local)
    help: "La app escucha en 127.0.0.1 en este puerto. Se llega por el dominio (Caddy/nginx), por la VPN o con «Abrir» (túnel SSH)."
    type: int
    default: {a['port']}
    min: 1024
    max: 65535""")
    v.append(f"""  - name: {p}_domain
    label: Dominio
    help: {json.dumps(a.get('domain_help', 'Opcional. Con Caddy o nginx en el proyecto, se publica en https://dominio.'), ensure_ascii=False)}
    type: string
    default: ""
    pattern: '^(([a-z0-9]([a-z0-9-]{{0,61}}[a-z0-9])?\\.)+[a-z]{{2,}})?$'
    pattern_help: Un dominio (app.ejemplo.com) o vacío""")
    if not a.get('no_public'):
        v.append(f"""  - name: {p}_public_port
    label: Abrir un puerto a internet
    help: "0 = no (lo normal, con dominio o por la VPN). Si no, http://IP:puerto y se abre en el Cortafuegos."
    type: int
    default: 0
    min: 0
    max: 65535""")
    for x in a.get('vars', []):
        v.append(textwrap.indent(x.strip('\n'), '  '))
    secrets = "\n".join(f"  - file: {s[0]}\n    label: {s[1]}" for s in a.get('secrets', []))
    fwl = ([f"{p}_public_port"] if not a.get('no_public') else []) + a.get('fw_extra', [])
    fw = f"firewall_ports_from: [{', '.join(fwl)}]\n" if fwl else ""
    extra_top = a.get('top', '')
    return f"""id: {a['id']}
name: {json.dumps(a['name'], ensure_ascii=False)}
version: 1.0.0
category: 7 · Apps
description: {json.dumps(a['description'], ensure_ascii=False)}
details: |
{textwrap.indent(a['details'].strip(), '  ')}
  Sus datos están en /srv/draupnode/apps/{a['id']} (entran en las copias del
  módulo Copias). Licencia: {a['license']}.
depends: [docker]
requires:
  os: [ubuntu, debian]
{('  min_ram_mb: ' + str(a['ram']) + chr(10)) if a.get('ram') else ''}{fw}proxy_site:
  domain: {p}_domain
  port: {p}_port
{extra_top}{('secrets:' + chr(10) + secrets + chr(10)) if secrets else ''}uninstall_warning: {json.dumps('Para y quita los contenedores de ' + a['short'] + '.', ensure_ascii=False)}
uninstall_data: {json.dumps('Borrar también sus datos (' + a['data_desc'] + '). No se puede deshacer.', ensure_ascii=False)}
variables:
""" + "\n".join(v) + "\n" + ("links:\n" + "".join(f"  - label: {json.dumps(l, ensure_ascii=False)}\n    url: {u}\n" for l, u in a.get('links', [])) if a.get('links') else "")

def tasks(a):
    p = a['id'].replace('-', '_')
    gens = a.get('generate', [])
    gen_tasks = ""
    for g in gens:
        gen_tasks += f"""
- name: Contraseña «{g['file']}» (se genera en el servidor la primera vez)
  ansible.builtin.set_fact:
    {p}_{g['var']}: "{{{{ lookup('ansible.builtin.password', draupnode_secrets_dir ~ '/{g['file']}', chars=['ascii_letters', 'digits'], length={g.get('len', 32)}) }}}}"
  no_log: true
  when: not ansible_check_mode
"""
    dirs = "\n".join(f"    - \"{{{{ {p}_dir }}}}/{d}\"" for d in a.get('dirs', []))
    pre = a.get('pre_tasks', '')
    post = a.get('post_tasks', '')
    return f"""---
- name: Carpeta de {a['short']}
  ansible.builtin.set_fact:
    {p}_dir: /srv/draupnode/apps/{a['id']}
    {p}_url: "{{{{ ('https://' ~ {p}_domain) if {p}_domain else ('http://127.0.0.1:' ~ {p}_port ~ ' (en el servidor: usa «Abrir» en la página del módulo)') }}}}"
{pre}
- name: Carpetas
  ansible.builtin.file:
    path: "{{{{ item }}}}"
    state: directory
    mode: "0750"
  loop:
    - "{{{{ {p}_dir }}}}"
{dirs}
{gen_tasks}
- name: docker-compose.yml
  ansible.builtin.template:
    src: docker-compose.yml.j2
    dest: "{{{{ {p}_dir }}}}/docker-compose.yml"
    mode: "0600"
  no_log: {str(bool(gens)).lower()}

- name: Arrancar {a['short']}
  ansible.builtin.command: docker compose -p dn-{a['id']} up -d --quiet-pull --remove-orphans
  args:
    chdir: "{{{{ {p}_dir }}}}"
  register: {p}_up
  # Los registros de imágenes a veces responden «demasiadas peticiones»: se reintenta.
  until: {p}_up.rc == 0
  retries: 3
  delay: 30
  changed_when: "'Started' in {p}_up.stderr or 'Created' in {p}_up.stderr or 'Recreated' in {p}_up.stderr"
  when: not ansible_check_mode

- name: Esperar a que responda
  ansible.builtin.uri:
    url: "http://127.0.0.1:{{{{ {p}_port }}}}{a.get('check', '/')}"
    status_code: [200, 204, 301, 302, 303, 307, 308, 401, 403]
    follow_redirects: none
  register: {p}_http
  until: {p}_http.status in [200, 204, 301, 302, 303, 307, 308, 401, 403]
  retries: {a.get('retries', 40)}
  delay: 3
  failed_when: false
  when: not ansible_check_mode
{post}
- name: Nota
  ansible.builtin.debug:
    msg: >-
      {a['short']} {{{{ 'responde' if ({p}_http.status | default(0)) in [200, 204, 301, 302, 303, 307, 308, 401, 403] else 'NO responde todavía (mira: docker compose -p dn-{a['id']} logs, en ' ~ {p}_dir ~ ')' }}}} en {{{{ {p}_url }}}}.
      {a.get('note', '').strip()}
"""

def uninstall(a):
    p = a['id'].replace('-', '_')
    sec = " ".join(f"{{{{ draupnode_secrets_dir | quote }}}}/{s[0]}" for s in a.get('secrets', []))
    return f"""---
- name: ¿Está {a['short']}?
  ansible.builtin.stat:
    path: /srv/draupnode/apps/{a['id']}/docker-compose.yml
  register: {p}_cf

- name: Parar y quitar {a['short']}
  ansible.builtin.command: docker compose -p dn-{a['id']} down {{{{ '-v' if draupnode_uninstall_purge | bool else '' }}}}
  args:
    chdir: /srv/draupnode/apps/{a['id']}
  when: {p}_cf.stat.exists and not ansible_check_mode

- name: Borrar sus datos
  ansible.builtin.shell: rm -rf /srv/draupnode/apps/{a['id']} {sec}
  when: draupnode_uninstall_purge | bool and not ansible_check_mode

- name: Nota
  ansible.builtin.debug:
    msg: "{a['short']} {{{{ 'se quitará' if ansible_check_mode else 'quitado' }}}}.{{{{ ' También sus datos.' if draupnode_uninstall_purge | bool else ' Sus datos siguen en /srv/draupnode/apps/{a['id']}: si lo reinstalas, vuelve todo.' }}}}"
"""

def compose(a):
    p = a['id'].replace('-', '_')
    ports = f"""    ports:
      - "127.0.0.1:{{{{ {p}_port }}}}:{a['cport']}"
{{% if ({p}_public_port | default(0) | int) > 0 %}}      - "{{{{ {p}_public_port }}}}:{a['cport']}"
{{% endif %}}"""
    body = a['compose'].replace('@@PORTS@@', ports.rstrip('\n'))
    return f"""# Generado por Draupnode (módulo {a['id']}). No lo edites a mano: se reescribe al aplicar.
name: dn-{a['id']}

services:
{body.rstrip()}
"""

def main():
    out = sys.argv[1]
    for i in sys.argv[2:]:
        a = APPS[i]
        d = os.path.join(out, i)
        os.makedirs(os.path.join(d, 'role/tasks'), exist_ok=True)
        os.makedirs(os.path.join(d, 'role/templates'), exist_ok=True)
        open(os.path.join(d, 'module.yaml'), 'w').write(module_yaml(a))
        open(os.path.join(d, 'role/tasks/main.yml'), 'w').write(tasks(a))
        open(os.path.join(d, 'role/tasks/uninstall.yml'), 'w').write(uninstall(a))
        open(os.path.join(d, 'role/templates/docker-compose.yml.j2'), 'w').write(compose(a))
        print('generado', i)

main()
