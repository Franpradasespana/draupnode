#!/usr/bin/env python3
"""Lista los textos t('…') / tr('…') de la interfaz y los compara con en.json.

Uso:
  python3 herramientas/i18n/extraer.py            → resumen (faltan / sobran)
  python3 herramientas/i18n/extraer.py --faltan   → JSON con los que faltan (clave → "")
  python3 herramientas/i18n/extraer.py --limpiar  → quita de en.json los que ya no se usan
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'frontend' / 'src'
EN = SRC / 'locales' / 'en.json'
sys.path.insert(0, str(Path(__file__).parent))
from envolver import unescape_js  # noqa: E402

PAT = re.compile(r"\btr?\(\s*'((?:[^'\\]|\\.)*)'")
# t(cond ? 'a' : 'b', …) y plural(n, 'uno', 'varios'): también son textos.
PAT_ALT = re.compile(r"\b(?:tr?)\(\s*[^'()]*?\?\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'")
PAT_PL = re.compile(r"\bplural\([^,]+,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'")


def keys() -> dict[str, str]:
    out: dict[str, str] = {}
    for p in sorted(SRC.rglob('*')):
        if p.suffix not in ('.svelte', '.ts') or p.name == 'i18n.svelte.ts':
            continue
        s = p.read_text()
        for m in PAT.finditer(s):
            out.setdefault(unescape_js(m.group(1), "'"), str(p.relative_to(SRC)))
        for pat in (PAT_ALT, PAT_PL):
            for m in pat.finditer(s):
                for g in m.groups():
                    out.setdefault(unescape_js(g, "'"), str(p.relative_to(SRC)))
    # Las de i18n.svelte.ts (duraciones)
    for k in ('{0} min', '{0} h', '{0} días', 'hace {0}'):
        out.setdefault(k, 'lib/i18n.svelte.ts')
    return out


def main():
    ks = keys()
    en = json.loads(EN.read_text()) if EN.exists() else {}
    falta = {k: '' for k in ks if not en.get(k)}
    sobra = [k for k in en if k not in ks]
    if '--faltan' in sys.argv:
        print(json.dumps(falta, ensure_ascii=False, indent=1))
        return
    if '--limpiar' in sys.argv:
        for k in sobra:
            del en[k]
        EN.write_text(json.dumps(dict(sorted(en.items())), ensure_ascii=False, indent=1) + '\n')
    print(f'textos: {len(ks)} · traducidos: {len(ks) - len(falta)} · faltan: {len(falta)} · sobran: {len(sobra)}')


if __name__ == '__main__':
    main()
