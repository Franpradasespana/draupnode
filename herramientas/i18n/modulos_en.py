#!/usr/bin/env python3
"""Escribe el module.en.yaml de cada módulo incluido (textos en inglés).

Uso:  python3 herramientas/i18n/modulos_en.py [diccionario.json]

Las traducciones salen de los module.en.yaml que ya existen (campo a campo,
emparejando con el texto en español de module.yaml) y, si se da, de un JSON
«texto en español» → «English text». Lo que falte se queda fuera (en la app
sale en español) y se lista al final.
"""
import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2] / 'internal' / 'modules' / 'builtin'
TOP = ('name', 'category', 'description', 'details', 'uninstall_warning', 'uninstall_data', 'no_uninstall')
VARF = ('label', 'help', 'pattern_help', 'placeholder')
PRUEBA = ('pasos', 'comprobar', 'necesita', 'problemas')


class Dumper(yaml.SafeDumper):
    pass


def _str(d, s):
    if '\n' in s:
        return d.represent_scalar('tag:yaml.org,2002:str', s, style='|')
    return d.represent_scalar('tag:yaml.org,2002:str', s)


Dumper.add_representer(str, _str)


def pairs(es: dict, en: dict):
    """(español, inglés) de cada campo de un module.yaml y su module.en.yaml."""
    for k in TOP:
        yield es.get(k), en.get(k)
    ev = en.get('variables') or {}
    for v in es.get('variables') or []:
        tv = ev.get(v['name']) or {}
        for f in VARF:
            yield v.get(f), tv.get(f)
    for i, l in enumerate(es.get('links') or []):
        yield l.get('label'), (en.get('links') or [None] * 999)[i] if i < len(en.get('links') or []) else None
    for i, s in enumerate(es.get('secrets') or []):
        yield s.get('label'), (en.get('secrets') or [])[i] if i < len(en.get('secrets') or []) else None
    pe, pn = es.get('prueba') or {}, en.get('prueba') or {}
    yield pe.get('lab'), pn.get('lab')
    for k in PRUEBA:
        a, b = pe.get(k) or [], pn.get(k) or []
        for i, x in enumerate(a):
            yield x, b[i] if i < len(b) else None


def main():
    d: dict[str, str] = {}
    mods = sorted(p.parent for p in ROOT.glob('*/module.yaml'))
    for m in mods:
        enf = m / 'module.en.yaml'
        if enf.exists():
            es, en = yaml.safe_load((m / 'module.yaml').read_text()), yaml.safe_load(enf.read_text()) or {}
            for a, b in pairs(es, en):
                if a and b:
                    d.setdefault(a, b)
    if len(sys.argv) > 1:
        d.update(json.loads(Path(sys.argv[1]).read_text()))
    missing = []
    for m in mods:
        es = yaml.safe_load((m / 'module.yaml').read_text())
        tr = lambda s: d.get(s) if s else None  # noqa: E731
        out: dict = {}
        for k in TOP:
            if tr(es.get(k)):
                out[k] = tr(es[k])
            elif es.get(k):
                missing.append(f'{m.name}: {k}')
        vs = {}
        for v in es.get('variables') or []:
            tv = {f: tr(v.get(f)) for f in VARF if v.get(f)}
            for f, x in tv.items():
                if not x:
                    missing.append(f'{m.name}: {v["name"]}.{f}')
            tv = {f: x for f, x in tv.items() if x}
            if tv:
                vs[v['name']] = tv
        if vs:
            out['variables'] = vs
        if es.get('links'):
            out['links'] = [tr(l.get('label')) or l.get('label') for l in es['links']]
        if es.get('secrets'):
            out['secrets'] = [tr(s.get('label')) or s.get('label') for s in es['secrets']]
        if es.get('prueba'):
            pe, pn = es['prueba'], {}
            if pe.get('lab'):
                pn['lab'] = tr(pe['lab']) or pe['lab']
            for k in PRUEBA:
                if pe.get(k):
                    pn[k] = [tr(x) or x for x in pe[k]]
                    missing += [f'{m.name}: prueba.{k}' for x in pe[k] if not tr(x)]
            out['prueba'] = pn
        head = f'# Textos en inglés de «{es["id"]}» (los ids, variables y valores están en module.yaml).\n'
        (m / 'module.en.yaml').write_text(head + yaml.dump(out, Dumper=Dumper, allow_unicode=True, sort_keys=False, width=1000))
    print(f'{len(mods)} módulos')
    if missing:
        print('Sin traducir:')
        for x in missing:
            print('  ·', x)


if __name__ == '__main__':
    main()
