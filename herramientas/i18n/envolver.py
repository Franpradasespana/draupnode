#!/usr/bin/env python3
"""Envuelve en t('…') los textos visibles en español de la interfaz.

Uso:  python3 herramientas/i18n/envolver.py [--dry] fichero.svelte|fichero.ts …

Entiende lo justo de Svelte y TypeScript:
  · texto entre etiquetas (con sus {expr}) → {t('… {0} …', expr)}
  · atributos de texto (placeholder, title, label…) → attr={t('…')}
  · cadenas '…' / "…" y plantillas `… ${x} …` en el código → t('… {0} …', x)
y se salta lo que no es texto para personas: imports, clases CSS, claves de
objetos, comparaciones (=== 'x'), case 'x', tipos 'a' | 'b', selectores,
argumentos de startsWith/includes/split…

Lo dudoso (palabras sueltas en minúscula con tilde, comparaciones con texto
en español) se lista al final para revisarlo a mano. Nada se traduce aquí:
solo se marca; la traducción va en frontend/src/locales/en.json.
"""
import re
import sys
from pathlib import Path

LETTER = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ'
ACCENT = re.compile(r'[ÁÉÍÓÚÜÑáéíóúüñ¿¡«»]')
WORD = re.compile(r'[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}')

TEXT_ATTRS = {'placeholder', 'title', 'aria-label', 'alt', 'label', 'confirmLabel', 'message', 'detail', 'hint',
              'help', 'text', 'empty', 'subtitle', 'heading', 'caption', 'tooltip', 'description', 'emptyText'}
NEVER_ATTRS = {'class', 'id', 'href', 'src', 'type', 'name', 'for', 'style', 'role', 'lang', 'rel', 'target',
               'autocomplete', 'inputmode', 'pattern', 'accept', 'spellcheck', 'value', 'key', 'icon', 'size',
               'width', 'height', 'viewBox', 'd', 'fill', 'stroke', 'method', 'action', 'tabindex', 'kind',
               'variant', 'tone', 'state', 'mode', 'view', 'tab', 'lang', 'xmlns', 'points', 'transform'}
SKIP_TEXT_TAGS = {'code', 'pre', 'kbd', 'script', 'style', 'textarea', 'svg', 'path', 'title_svg'}
SKIP_CALLS = ('startsWith', 'endsWith', 'includes', 'indexOf', 'lastIndexOf', 'replace', 'replaceAll', 'split',
              'match', 'matchAll', 'test', 'querySelector', 'querySelectorAll', 'getElementById', 'closest',
              'getItem', 'setItem', 'removeItem', 'readLocal', 'writeLocal', 'onEvent', 'addEventListener',
              'removeEventListener', 'EventsOn', 'mockEmit', 'emit', 'get', 'has', 'delete', 'search', 'require',
              'import', 'mockSpec', 'Intl', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'load',
              'save', 'localeCompare', 'padStart', 'createElement', 'setAttribute', 'getAttribute', 'join',
              'scrollIntoView', 'event', 'keydown', 't', 'tr')

review: list[str] = []


# Contenido de código de la demo (órdenes, ficheros, salidas) y claves de datos:
# se queda tal cual aunque parezca texto.
CODE_LIKE = re.compile(r"^(apt-get update|sudo apt install|# Módulo propio|id: monitor-web|---\\n|---\n|#!/bin/sh|# \{0\}/\{1\}|restoring snapshot|  10:21:07|#5 \[2/6\]|gunicorn |# Generado por Draupnode \(demo\)|services:\n|: Up 3 seconds|# WireGuard|--- before|Images$|Containers$|Build Cache$|Local Volumes$|1\.66GB|Dockerfile$|False$|docker compose$| up -d --build$|sudo sh -c|GNU GENERAL|Resumen\n=====|\"JetBrains)")


def visible(s: str) -> bool:
    """¿Es texto para personas (y no un identificador, CSS o código)?"""
    st = s.strip()
    if CODE_LIKE.search(s) or CODE_LIKE.search(st):
        return False
    if not st or not re.search(f'[{LETTER}]', st):
        return False
    if re.match(r'^(https?:|mailto:|/|\.|#|--|\$|@|[a-z]+://)', st) and ' ' not in st:
        return False
    if re.search(r'var\(--|=>|\bpx\b|rgba?\(|^\s*[.#][\w-]+\s*[{,]|calc\(|\{\s*$', st):
        return False
    if re.fullmatch(r'[\w.:/@#\-+*\[\]=$%,;|()]+', st) and not ACCENT.search(st):
        # Una «palabra»: solo si empieza en mayúscula y parece español/nombre propio visible.
        if re.fullmatch(r'[A-ZÁÉÍÓÚÑ][a-záéíóúüñ]{2,}[.…:!?]?', st):
            return True
        return False
    if ' ' not in st and ACCENT.search(st):
        if st[0].isupper() or re.search(r'[¿¡«»…]', st):
            return True
        review.append(st)
        return False
    if not WORD.search(st):
        return False
    # Varias palabras: CSS y similares fuera.
    if re.fullmatch(r'[\w\s.\-:%#()/,]+', st) and re.search(r'\b(solid|dashed|auto|flex|grid|none|inherit|ease|linear|smooth|center|nowrap|bold|italic)\b', st) and not ACCENT.search(st):
        return False
    return True


# ------------------------------------------------------------------ escáner JS

def scan_string(code: str, i: int) -> int:
    """i apunta a la comilla; devuelve el índice tras la comilla de cierre."""
    q = code[i]
    j = i + 1
    while j < len(code):
        c = code[j]
        if c == '\\':
            j += 2
            continue
        if q == '`' and c == '$' and code.startswith('${', j):
            j = scan_braces(code, j + 1)
            continue
        if c == q:
            return j + 1
        j += 1
    return j


def skip_regex(code: str, i: int) -> int:
    """i apunta a la '/' de un literal /…/; devuelve el índice tras él."""
    j = i + 1
    inclass = False
    while j < len(code) and code[j] != '\n':
        if code[j] == '\\':
            j += 2
            continue
        if code[j] == '[':
            inclass = True
        elif code[j] == ']':
            inclass = False
        elif code[j] == '/' and not inclass:
            break
        j += 1
    return j + 1


def is_regex_start(code: str, i: int) -> bool:
    if code.startswith(('//', '/*'), i):
        return False
    p, _ = prev_sig(code, i)
    return p in REGEX_PREV or p == '' or prev_word(code, i) in ('return', 'typeof')


def scan_braces(code: str, i: int) -> int:
    """i apunta a '{'; devuelve el índice tras su '}' (saltando cadenas, comentarios y regex)."""
    depth = 0
    j = i
    while j < len(code):
        c = code[j]
        if c in '\'"`':
            j = scan_string(code, j)
            continue
        if c == '/' and j > i + 1 and is_regex_start(code, j):
            j = skip_regex(code, j)
            continue
        if code.startswith('//', j):
            k = code.find('\n', j)
            j = len(code) if k < 0 else k
            continue
        if code.startswith('/*', j):
            k = code.find('*/', j)
            j = len(code) if k < 0 else k + 2
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return j + 1
        j += 1
    return j


REGEX_PREV = set('(,=:[!&|?{};+-*%<>~^')


def prev_sig(code: str, i: int) -> tuple[str, int]:
    j = i - 1
    while j >= 0 and code[j] in ' \t\r\n':
        j -= 1
    return (code[j] if j >= 0 else ''), j


def next_sig(code: str, i: int) -> tuple[str, int]:
    j = i
    while j < len(code) and code[j] in ' \t\r\n':
        j += 1
    return (code[j] if j < len(code) else ''), j


def prev_word(code: str, i: int) -> str:
    m = re.search(r'([\w$.]+)\s*$', code[:i])
    return m.group(1) if m else ''


def call_name(code: str, i: int) -> str:
    """Si el literal en i es argumento directo de una llamada, el nombre de la función."""
    depth = 0
    j = i - 1
    while j >= 0:
        c = code[j]
        if c in ')]}':
            depth += 1
        elif c in '([{':
            if depth == 0:
                if c != '(':
                    return ''
                m = re.search(r'([\w$]+)\s*$', code[:j])
                return m.group(1) if m else ''
            depth -= 1
        elif c in ';\n' and depth == 0 and c == ';':
            return ''
        j -= 1
    return ''


def skip_literal(code: str, i: int, end: int) -> bool:
    p, pj = prev_sig(code, i)
    n, nj = next_sig(code, end)
    before = code[max(0, pj - 2):pj + 1]
    after = code[nj:nj + 3]
    if before.endswith(('==', '!=')) or after.startswith(('==', '!=')):
        lit = code[i + 1:end - 1]
        if visible(lit):
            review.append('comparación: ' + lit)
        return True
    if (p == '|' and not before.endswith('||')) or (n == '|' and not after.startswith('||')):
        return True  # tipo 'a' | 'b'
    if before.endswith('||') or before.endswith('??'):
        pass
    if prev_word(code, i).endswith(('import', 'from', 'case', 'typeof', 'in', 'as', 'extends')):
        return True
    if n == ':' and p in '{,' or (n == ':' and p == '' ):
        return True  # clave de objeto
    if n == ']' and p == '[' and code[max(0, pj - 1)] not in '=(,:[ \n':
        return True  # obj['clave']
    fn = call_name(code, i)
    if fn in SKIP_CALLS:
        return True
    return False


def esc(s: str) -> str:
    return s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n')


FN = 't'


def t_call(text: str, args: list[str]) -> str:
    inner = FN + "('" + esc(text) + "'"
    for a in args:
        inner += ', ' + a.strip()
    return inner + ')'


def unescape_js(s: str, quote: str) -> str:
    # Lo justo: \' \" \` \\ \n
    out = []
    i = 0
    while i < len(s):
        c = s[i]
        if c == '\\' and i + 1 < len(s):
            n = s[i + 1]
            out.append({'n': '\n', 't': '\t', '\\': '\\', "'": "'", '"': '"', '`': '`', '$': '$'}.get(n, '\\' + n))
            i += 2
            continue
        out.append(c)
        i += 1
    return ''.join(out)


def transform_js(code: str) -> tuple[str, int]:
    """Envuelve los literales visibles de un trozo de código. Devuelve (código, nº)."""
    out = []
    i = 0
    n = 0
    last = 0
    while i < len(code):
        c = code[i]
        if code.startswith('//', i):
            k = code.find('\n', i)
            i = len(code) if k < 0 else k
            continue
        if code.startswith('/*', i):
            k = code.find('*/', i)
            i = len(code) if k < 0 else k + 2
            continue
        if c == '/':
            p, _ = prev_sig(code, i)
            pw = prev_word(code, i)
            if p in REGEX_PREV or p == '' or pw in ('return', 'typeof'):
                # literal de expresión regular
                j = i + 1
                inclass = False
                while j < len(code) and code[j] != '\n':
                    if code[j] == '\\':
                        j += 2
                        continue
                    if code[j] == '[':
                        inclass = True
                    elif code[j] == ']':
                        inclass = False
                    elif code[j] == '/' and not inclass:
                        break
                    j += 1
                i = j + 1
                continue
        if c in '\'"':
            end = scan_string(code, i)
            lit = unescape_js(code[i + 1:end - 1], c)
            # Con escapes raros (\r, \x1b, \u…) se deja a mano: t() no los conserva.
            odd = re.search(r"\\[^n'\"\\]", code[i + 1:end - 1])
            if odd:
                if visible(lit):
                    review.append('escapes: ' + lit)
            elif '\n' not in code[i:end] and visible(lit) and not skip_literal(code, i, end):
                out.append(code[last:i])
                out.append(t_call(lit, []))
                last = end
                n += 1
            i = end
            continue
        if c == '`':
            end = scan_string(code, i)
            body = code[i + 1:end - 1]
            parts, exprs, origs = [], [], []
            j = 0
            buf = ''
            while j < len(body):
                if body[j] == '\\':
                    buf += body[j:j + 2]
                    j += 2
                    continue
                if body.startswith('${', j):
                    k = scan_braces(body, j + 1)
                    expr = body[j + 2:k - 1]
                    origs.append(expr)
                    sub, sn = transform_js(expr)
                    n += sn
                    parts.append(unescape_js(buf, '`'))
                    buf = ''
                    exprs.append(sub)
                    j = k
                    continue
                buf += body[j]
                j += 1
            parts.append(unescape_js(buf, '`'))
            static = ''.join(parts)
            if re.search(r"\\[^n'\"\\`$]", body):
                static = ''  # escapes raros: a mano
            if visible(static) and not skip_literal(code, i, end) and '{' not in static:
                text = ''
                for k, ptxt in enumerate(parts):
                    text += ptxt
                    if k < len(exprs):
                        text += '{' + str(k) + '}'
                out.append(code[last:i])
                out.append(t_call(text, exprs))
                last = end
                n += 1
            elif exprs and exprs != origs:
                # Sin texto propio: solo se tocan las expresiones de dentro.
                rebuilt = code[i:end]
                for o, nw in zip(origs, exprs):
                    rebuilt = rebuilt.replace('${' + o + '}', '${' + nw + '}', 1)
                if rebuilt != code[i:end]:
                    out.append(code[last:i])
                    out.append(rebuilt)
                    last = end
            i = end
            continue
        i += 1
    out.append(code[last:])
    return ''.join(out), n


# ------------------------------------------------------------------ Svelte

ENT = {'&nbsp;': '\u00a0', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
       '&rarr;': '→', '&larr;': '←', '&hellip;': '…', '&middot;': '·', '&mdash;': '—', '&ndash;': '–', '&times;': '×'}


def decode_ent(s: str) -> str:
    for k, v in ENT.items():
        s = s.replace(k, v)
    return s


def scan_tag_end(src: str, i: int) -> int:
    """i apunta a '<'; devuelve el índice tras el '>' de la etiqueta (respetando {…} y comillas)."""
    j = i + 1
    while j < len(src):
        c = src[j]
        if c == '{':
            j = scan_braces(src, j)
            continue
        if c in '"\'':
            k = src.find(c, j + 1)
            # dentro de comillas puede haber {…}
            m = j + 1
            while m < len(src) and src[m] != c:
                if src[m] == '{':
                    m = scan_braces(src, m)
                    continue
                m += 1
            j = m + 1
            continue
        if c == '>':
            return j + 1
        j += 1
    return j


ATTR_RE = re.compile(r'''\s+([^\s=/>{}"']+)(?:\s*=\s*("([^"]*)"|'([^']*)'|\{))?''')


def transform_attr_value(tag: str, name: str, raw: str) -> tuple[str | None, int]:
    """raw = contenido entre comillas (puede llevar {expr}). Devuelve nuevo «name=…» o None."""
    parts, exprs = [], []
    j = 0
    buf = ''
    while j < len(raw):
        if raw[j] == '{':
            k = scan_braces(raw, j)
            parts.append(buf)
            buf = ''
            exprs.append(raw[j + 1:k - 1])
            j = k
            continue
        buf += raw[j]
        j += 1
    parts.append(buf)
    static = decode_ent(''.join(parts))
    is_comp = tag[:1].isupper()
    if name in NEVER_ATTRS or name.startswith(('on', 'bind:', 'class:', 'style:', 'use:', 'data-', 'aria-describedby')):
        return None, 0
    if not (name in TEXT_ATTRS or is_comp) or not visible(static) or '{' in ''.join(parts) and False:
        return None, 0
    text = ''
    tr_exprs = []
    for k, ptxt in enumerate(parts):
        text += decode_ent(ptxt)
        if k < len(exprs):
            sub, _ = transform_js(exprs[k])
            tr_exprs.append(sub)
            text += '{' + str(k) + '}'
    return name + '={' + t_call(text, tr_exprs) + '}', 1


def transform_tag(tag_src: str) -> tuple[str, int]:
    m = re.match(r'<([\w:.-]+)', tag_src)
    if not m:
        return tag_src, 0
    tag = m.group(1)
    out = [tag_src[:m.end()]]
    i = m.end()
    n = 0
    body_end = len(tag_src) - 1  # '>'
    if tag_src.endswith('/>'):
        body_end = len(tag_src) - 2
    while i < body_end:
        c = tag_src[i]
        if c == '{':
            k = scan_braces(tag_src, i)
            sub, sn = transform_js(tag_src[i + 1:k - 1])
            out.append('{' + sub + '}')
            n += sn
            i = k
            continue
        am = re.match(r'([^\s=/>{}"\']+)\s*=\s*', tag_src[i:])
        if am and not c.isspace():
            name = am.group(1)
            j = i + am.end()
            q = tag_src[j] if j < len(tag_src) else ''
            if q == '{':
                k = scan_braces(tag_src, j)
                expr = tag_src[j + 1:k - 1]
                if name == 'class' or name.startswith('class:'):
                    sub, sn = expr, 0
                else:
                    sub, sn = transform_js(expr)
                out.append(tag_src[i:j] + '{' + sub + '}')
                n += sn
                i = k
                continue
            if q in '"\'':
                m2 = j + 1
                while m2 < len(tag_src) and tag_src[m2] != q:
                    if tag_src[m2] == '{':
                        m2 = scan_braces(tag_src, m2)
                        continue
                    m2 += 1
                raw = tag_src[j + 1:m2]
                new, sn = transform_attr_value(tag, name, raw)
                if new is not None:
                    out.append(new)
                    n += sn
                else:
                    if name == 'class' or name in NEVER_ATTRS:
                        out.append(tag_src[i:m2 + 1])
                    else:
                        # expresiones dentro de un atributo no traducido
                        fixed = ''
                        p = 0
                        while p < len(raw):
                            if raw[p] == '{':
                                k = scan_braces(raw, p)
                                sub, sn2 = transform_js(raw[p + 1:k - 1])
                                n += sn2
                                fixed += '{' + sub + '}'
                                p = k
                                continue
                            fixed += raw[p]
                            p += 1
                        out.append(tag_src[i:j + 1] + fixed + q)
                i = m2 + 1
                continue
        out.append(c)
        i += 1
    out.append(tag_src[body_end:])
    return ''.join(out), n


def transform_svelte(src: str) -> tuple[str, int]:
    out = []
    i = 0
    n = 0
    stack: list[str] = []
    run: list[tuple[str, str]] = []  # ('txt', s) | ('expr', s)

    def flush():
        nonlocal n
        if not run:
            return
        texts = ''.join(s for k, s in run if k == 'txt')
        skip = any(t in SKIP_TEXT_TAGS for t in stack)
        lit = decode_ent(texts)
        if not skip and visible(re.sub(r'\s+', ' ', lit)):
            # {' '} al principio o al final: se queda fuera, tal cual.
            pre, post = '', ''
            while run and run[0][0] == 'expr' and re.fullmatch(r"\s*'\s*'\s*", run[0][1]):
                pre += '{' + run.pop(0)[1] + '}'
            while run and run[-1][0] == 'expr' and re.fullmatch(r"\s*'\s*'\s*", run[-1][1]):
                post = '{' + run.pop()[1] + '}' + post
            out.append(pre)
            raw = ''.join(s if k == 'txt' else '{' + s + '}' for k, s in run)
            lead = re.match(r'^\s*', raw).group(0)
            trail = re.search(r'\s*$', raw).group(0)
            text = ''
            exprs = []
            for k, s in run:
                if k == 'txt':
                    text += decode_ent(s)
                else:
                    sub, sn = transform_js(s)
                    n += sn
                    text += '{' + str(len(exprs)) + '}'
                    exprs.append(sub)
            text = re.sub(r'\s+', ' ', text).strip()
            out.append(lead + '{' + t_call(text, exprs) + '}' + trail + post)
            n += 1
        else:
            for k, s in run:
                if k == 'txt':
                    out.append(s)
                else:
                    sub, sn = transform_js(s)
                    n += sn
                    out.append('{' + sub + '}')
        run.clear()

    while i < len(src):
        if src.startswith('<!--', i):
            flush()
            k = src.find('-->', i)
            k = len(src) if k < 0 else k + 3
            out.append(src[i:k])
            i = k
            continue
        m = re.match(r'<(script|style)\b[^>]*>', src[i:])
        if m:
            flush()
            tag = m.group(1)
            k = src.find('</' + tag + '>', i)
            body = src[i + m.end():k]
            if tag == 'script':
                body, sn = transform_js(body)
                n += sn
            out.append(src[i:i + m.end()] + body + '</' + tag + '>')
            i = k + len(tag) + 3
            continue
        if src[i] == '<' and re.match(r'</?[A-Za-z]', src[i:i + 3]):
            flush()
            k = scan_tag_end(src, i)
            tag_src = src[i:k]
            tm = re.match(r'<(/?)([\w:.-]+)', tag_src)
            closing, name = tm.group(1) == '/', tm.group(2)
            if closing:
                if name in stack:
                    while stack and stack.pop() != name:
                        pass
                out.append(tag_src)
            else:
                new, sn = transform_tag(tag_src)
                n += sn
                out.append(new)
                if not tag_src.endswith('/>') and name.lower() not in ('br', 'hr', 'img', 'input', 'meta', 'link'):
                    stack.append(name)
            i = k
            continue
        if src[i] == '{':
            k = scan_braces(src, i)
            inner = src[i + 1:k - 1]
            if inner[:1] in '#:/@':
                flush()
                bm = re.match(r'([#:/@]\w+(?:\s+if)?)(\s*)(.*)$', inner, re.S)
                if bm and bm.group(3):
                    head, sp, expr = bm.groups()
                    if head in ('#snippet',):
                        out.append('{' + inner + '}')
                    else:
                        # «{#each lista as x (clave)}»: solo la parte de la lista
                        if head == '#each':
                            em = re.match(r'(.*?)(\s+as\s+.*)$', expr, re.S)
                            if em:
                                sub, sn = transform_js(em.group(1))
                                expr = sub + em.group(2)
                                n += sn
                        else:
                            expr, sn = transform_js(expr)
                            n += sn
                        out.append('{' + head + sp + expr + '}')
                else:
                    out.append('{' + inner + '}')
            else:
                run.append(('expr', inner))
            i = k
            continue
        # texto
        j = i
        while j < len(src) and src[j] not in '<{':
            j += 1
        if j == i:
            j = i + 1
        run.append(('txt', src[i:j]))
        i = j
    flush()
    return ''.join(out), n


def add_import(src: str, path: Path, is_svelte: bool) -> str:
    if re.search(r"import\s*\{[^}]*\b" + FN + r"\b[^}]*\}\s*from\s*'[^']*i18n\.svelte'", src):
        return src
    rel = Path('/'.join(['..'] * (len(path.relative_to(SRC).parts) - 1)) or '.') / 'lib' / 'i18n.svelte'
    spec = str(rel).replace('\\', '/')
    if not spec.startswith('.'):
        spec = './' + spec
    if path.parent == SRC / 'lib':
        spec = './i18n.svelte'
    line = f"import {{ t }} from '{spec}'" if FN == 't' else f"import {{ t as {FN} }} from '{spec}'"
    if is_svelte:
        m = re.search(r'<script\b(?![^>]*context=)[^>]*>\n?', src)
        if not m:
            return '<script lang="ts">\n  ' + line + '\n</script>\n\n' + src
        # tras el último import
        body_start = m.end()
        end = src.find('</script>', body_start)
        block = src[body_start:end]
        imps = list(re.finditer(r'^\s*import\b[\s\S]*?(?:from\s+)?[\'"][^\'"\n]+[\'"][ \t;]*\n', block, re.M))
        pos = body_start + (imps[-1].end() if imps else 0)
        return src[:pos] + '  ' + line + '\n' + src[pos:]
    imps = list(re.finditer(r'^import\b[\s\S]*?(?:from\s+)?[\'"][^\'"\n]+[\'"][ \t;]*\n', src, re.M))
    pos = imps[-1].end() if imps else 0
    return src[:pos] + line + '\n' + src[pos:]


SRC = Path(__file__).resolve().parents[2] / 'frontend' / 'src'


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry' in sys.argv
    total = 0
    for a in args:
        p = Path(a).resolve()
        src = p.read_text()
        global FN
        noimp = re.sub(r'^\s*import\b[^\n]*\n', '', src, flags=re.M)
        shadow = re.search(r'\b(const|let|var)\s+t\b|[(,]\s*t\s*[,):]|\bt\s*=>|\bas\s+t\b|\{\s*t\s*[,}]|,\s*t\s*\]|\[\s*t\s*,', noimp)
        FN = 'tr' if shadow else 't'
        if p.suffix == '.svelte':
            new, n = transform_svelte(src)
        else:
            new, n = transform_js(src)
        if n:
            new = add_import(new, p, p.suffix == '.svelte')
        total += n
        print(f'{n:5d}  {p.relative_to(SRC)}')
        if not dry and new != src:
            p.write_text(new)
    print(f'{total:5d}  en total')
    if review:
        print('\nPara revisar a mano:')
        for r in sorted(set(review)):
            print('  ·', r)


if __name__ == '__main__':
    main()
