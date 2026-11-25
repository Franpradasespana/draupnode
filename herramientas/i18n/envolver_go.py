#!/usr/bin/env python3
"""Envuelve en i18n los mensajes en español del código Go.

Uso:  python3 herramientas/i18n/envolver_go.py [--dry] fichero.go …

  fmt.Errorf("…")   → i18n.Errorf("…")
  fmt.Sprintf("…")  → i18n.Sprintf("…")     (si el formato es texto en español)
  errors.New("…")   → i18n.New("…")         (var de paquete → i18n.Err("…"))
  "…" suelto        → i18n.T("…")

Solo toca cadenas "…" (nunca `…`, que suelen ser órdenes, YAML o patrones) y
se salta: etiquetas de struct, imports, constantes, comparaciones (== "…",
case "…"), patrones y argumentos de strings.Contains/HasPrefix…, órdenes de
shell (echo, $, >/dev/null…) y las líneas marcadas con // i18n:no.
Luego hay que compilar (go build) y revisar el diff.
"""
import re
import sys
from pathlib import Path

SPANISH = re.compile(r'[áéíóúñ¿¡«»]|\b(no|se|el|la|los|las|de|del|que|para|con|sin|una?|hay|ya|está|es|en|por|al|lo|su|sus|y|o)\b', re.I)
SHELL = re.compile(r"\$|>/dev/null|&&|\|\||\becho\b|\bexit\b|/usr/|/etc/|\[Unit\]|\bsudo\b|systemctl|\bdocker (run|exec|compose)|\\n#|^#|^==")
LIT = re.compile(r'"((?:[^"\\\n]|\\.)*)"')
SKIP_BEFORE = re.compile(r'(==|!=|case|Contains\(|HasPrefix\(|HasSuffix\(|TrimPrefix\(|TrimSuffix\(|Index\(|Split\(|Replace\(|ReplaceAll\(|MustCompile\(|Getenv\(|Join\([^,]*,|json:|yaml:|Fields\(|EqualFold\()\s*$')


def visible(s: str) -> bool:
    if ' ' not in s.strip() and not re.search(r'[áéíóúñ¿¡«»]', s):
        return False
    if not re.search(r'[a-záéíóúñ]{3}', s):
        return False
    if not SPANISH.search(s):
        return False
    if SHELL.search(s):
        return False
    return True


def transform_line(line: str, in_const: bool, pkg_level: bool) -> tuple[str, int]:
    code = line.split('//')[0] if '"' not in line.split('//')[0][-1:] else line
    if '// i18n:no' in line or in_const or line.lstrip().startswith(('//', 'import', '"')):
        return line, 0
    if re.match(r'^\s*\w+\s+[\w.*\[\]]+\s+`', line):  # campo con etiqueta
        return line, 0
    out, last, n = [], 0, 0
    for m in LIT.finditer(line):
        # ¿dentro de un comentario?
        if '//' in line[:m.start()] and line[:m.start()].count('"') % 2 == 0 and '//' in re.sub(r'"(?:[^"\\]|\\.)*"', '', line[:m.start()]):
            break
        s = m.group(1)
        if not visible(s):
            continue
        before = line[:m.start()]
        if SKIP_BEFORE.search(before):
            continue
        after = line[m.end():].lstrip()
        if after.startswith(('==', '!=', ':')) and not after.startswith(':='):
            continue  # comparación o clave de mapa
        if before.rstrip().endswith('i18n.T(') or re.search(r'i18n\.(Errorf|Sprintf|New|Err|T)\(\s*$', before):
            continue
        out.append(line[last:m.start()])
        prefix = ''.join(out)
        if re.search(r'fmt\.Errorf\(\s*$', prefix):
            out[-1] = re.sub(r'fmt\.Errorf\(\s*$', 'i18n.Errorf(', out[-1]) if re.search(r'fmt\.Errorf\(\s*$', out[-1]) else out[-1]
            out.append(m.group(0))
        elif re.search(r'fmt\.Sprintf\(\s*$', out[-1]):
            out[-1] = re.sub(r'fmt\.Sprintf\(\s*$', 'i18n.Sprintf(', out[-1])
            out.append(m.group(0))
        elif re.search(r'errors\.New\(\s*$', out[-1]) and line[m.end():].lstrip().startswith(')'):
            out[-1] = re.sub(r'errors\.New\(\s*$', 'i18n.Err(' if pkg_level else 'i18n.New(', out[-1])
            out.append(m.group(0))
        else:
            out.append('i18n.T(' + m.group(0) + ')')
        last = m.end()
        n += 1
    out.append(line[last:])
    return ''.join(out), n


def transform(src: str) -> tuple[str, int]:
    lines = src.split('\n')
    total = 0
    depth = 0
    in_const = False
    in_raw = False
    for i, l in enumerate(lines):
        # cadenas `…` de varias líneas: no se tocan
        ticks = l.count('`')
        if in_raw:
            if ticks % 2 == 1:
                in_raw = False
            continue
        if re.match(r'^const\s*\($', l):
            in_const = True
        elif in_const and l.startswith(')'):
            in_const = False
        single_const = bool(re.match(r'^\s*const\s', l))
        pkg_level = depth == 0
        # El texto antes de un ` que abre una cadena larga sí se mira
        new, n = transform_line(l, in_const or single_const, pkg_level)
        lines[i] = new
        total += n
        if ticks % 2 == 1:
            in_raw = True
        stripped = re.sub(r'"(?:[^"\\]|\\.)*"|`[^`]*`|\'(?:[^\'\\]|\\.)*\'', '', l.split('//')[0])
        depth += stripped.count('{') - stripped.count('}')
    out = '\n'.join(lines)
    if total and '"draupnode/internal/i18n"' not in out:
        out = re.sub(r'^import \(\n', 'import (\n\t"draupnode/internal/i18n"\n', out, count=1, flags=re.M)
        if '"draupnode/internal/i18n"' not in out:
            out = re.sub(r'^(package \w+\n)', r'\1\nimport "draupnode/internal/i18n"\n', out, count=1, flags=re.M)
    return out, total


def main():
    dry = '--dry' in sys.argv
    grand = 0
    for a in [x for x in sys.argv[1:] if not x.startswith('--')]:
        p = Path(a)
        src = p.read_text()
        new, n = transform(src)
        grand += n
        if n:
            print(f'{n:4d}  {a}')
        if not dry and new != src:
            p.write_text(new)
    print(f'{grand:4d}  en total')


if __name__ == '__main__':
    main()
