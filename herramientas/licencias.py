#!/usr/bin/env python3
"""Rehace internal/legal/terceros.txt: las licencias de todo lo que va DENTRO
del ejecutable de Draupnode (librerías de Go y de la interfaz).

Las licencias MIT, BSD, ISC, Apache y OFL piden que su aviso de copyright
viaje con el programa: este fichero va incrustado y se ve en Ajustes →
«Licencias». Vuelve a ejecutarlo al añadir o actualizar dependencias:

    make licencias
"""
import json, os, subprocess, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, 'internal', 'legal', 'terceros.txt')
NOMBRES = ('LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENSE-MIT', 'COPYING', 'OFL.txt', 'license', 'license.md')


def texto_licencia(d):
    for n in NOMBRES:
        p = os.path.join(d, n)
        if os.path.isfile(p):
            return open(p, encoding='utf-8', errors='replace').read().strip()
    return ''


MIT = '''MIT License

Copyright (c) {quien}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.'''


def autor(pj):
    a = pj.get('author', '')
    if isinstance(a, dict):
        a = a.get('name', '')
    return a or ('the ' + pj['name'] + ' authors')


def tipo(texto):
    t = texto.lower()
    if 'apache license' in t and 'version 2.0' in t:
        return 'Apache-2.0'
    if 'sil open font license' in t:
        return 'OFL-1.1'
    if 'mozilla public license' in t:
        return 'MPL-2.0'
    if 'permission to use, copy, modify, and/or distribute' in t:
        return 'ISC'
    if 'permission is hereby granted, free of charge' in t:
        return 'MIT'
    if 'redistribution and use in source and binary forms' in t:
        return 'BSD-3-Clause' if 'neither the name' in t else 'BSD-2-Clause'
    return '?'


def go():
    env = dict(os.environ, CGO_ENABLED='1')
    mods = {}
    for so in ('linux', 'windows', 'darwin'):
        out = subprocess.run(['go', 'list', '-tags', 'webkit2_41', '-deps', '-f',
                              '{{if .Module}}{{if not .Module.Main}}{{.Module.Path}}\t{{.Module.Version}}\t{{.Module.Dir}}{{end}}{{end}}', '.'],
                             cwd=RAIZ, env=dict(env, GOOS=so), capture_output=True, text=True, check=True).stdout
        for linea in out.splitlines():
            ruta, ver, d = linea.split('\t')
            if not d:  # sin descargar para este sistema
                d = subprocess.run(['go', 'mod', 'download', '-json', ruta + '@' + ver], cwd=RAIZ,
                                   capture_output=True, text=True, check=True).stdout
                d = json.loads(d)['Dir']
            mods[ruta] = (ver, d)
    return [(r, v, 'https://' + r if not r.startswith(('golang.org/x/', 'gopkg.in/')) else 'https://pkg.go.dev/' + r, texto_licencia(d))
            for r, (v, d) in sorted(mods.items())]


def npm():
    fe = os.path.join(RAIZ, 'frontend')
    out = subprocess.run(['npm', 'ls', '--omit=dev', '--all', '--parseable'], cwd=fe, capture_output=True, text=True).stdout
    vistos, res = set(), []
    for d in sorted(set(out.split())):
        if os.path.abspath(d) == fe or d in vistos:
            continue
        vistos.add(d)
        pj = json.load(open(os.path.join(d, 'package.json')))
        url = pj.get('homepage') or (pj.get('repository') or {}).get('url', '') if isinstance(pj.get('repository'), dict) else pj.get('homepage', '')
        texto = texto_licencia(d)
        if not texto and pj.get('license') == 'MIT':
            # Paquete MIT sin fichero de licencia: el texto MIT con su autor (package.json).
            texto = MIT.format(quien=autor(pj))
        url = (url or 'https://www.npmjs.com/package/' + pj['name']).removeprefix('git+').removesuffix('.git')
        res.append((pj['name'], pj.get('version', ''), url, texto, pj.get('license', '')))
    return sorted(res)


def main():
    partes = ["""Draupnode lleva dentro estas librerías de software libre. Sus licencias
permiten usarlas en Draupnode (GPL-3.0-or-later) siempre que se conserven
sus avisos de copyright, que se copian aquí tal cual. Gracias a todas las
personas que las hacen.

Este fichero lo genera herramientas/licencias.py: no lo edites a mano.
"""]
    filas = []
    goroot = subprocess.run(['go', 'env', 'GOROOT'], capture_output=True, text=True, check=True).stdout.strip()
    gover = subprocess.run(['go', 'env', 'GOVERSION'], capture_output=True, text=True, check=True).stdout.strip()
    filas.append(('Go (biblioteca estándar y runtime)', gover, 'BSD-3-Clause', 'https://go.dev', texto_licencia(goroot)))
    for nombre, ver, url, texto in go():
        filas.append((nombre, ver, tipo(texto), url, texto))
    for nombre, ver, url, texto, decl in npm():
        filas.append((nombre, ver, decl or tipo(texto), url, texto))
    sin = [f[0] for f in filas if not f[4]]
    if sin:
        print('AVISO: sin fichero de licencia:', ', '.join(sin), file=sys.stderr)
    partes.append('Resumen\n=======\n' + '\n'.join(f'- {n} {v} · {t} · {u}' for n, v, t, u, _ in filas))
    for n, v, t, u, texto in filas:
        partes.append(f"{'=' * 72}\n{n} {v} ({t})\n{u}\n{'=' * 72}\n{texto or '(El paquete no trae fichero de licencia; declara: ' + t + ')'}")
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    open(SALIDA, 'w', encoding='utf-8').write('\n\n'.join(partes) + '\n')
    print(f'{len(filas)} paquetes en {os.path.relpath(SALIDA, RAIZ)}')
    raras = [f'{n} ({t})' for n, _, t, _, _ in filas if t in ('?', '') or 'GPL' in t and 'LGPL' not in t]
    if raras:
        print('REVISA estas licencias:', ', '.join(raras), file=sys.stderr)


main()
