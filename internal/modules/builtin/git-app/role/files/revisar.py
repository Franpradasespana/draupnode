#!/usr/bin/env python3
# Revisor del módulo «App desde Git» (lo ejecuta Ansible en el servidor).
#   revisar.py compose <dir> <proyecto> <compose> <envfile>
#       Lee «docker compose config» con ese .env y saca en JSON: variables sin
#       valor, puertos abiertos a todo internet, servicios que montan el
#       código encima de la app y servicios que se construyen.
#   revisar.py permisos <dir> <proyecto> <compose>
#       Para cada servicio cuya imagen no corre como root y monta carpetas de
#       la app: crea esas carpetas y se las da a ese usuario (UID:GID).
#   revisar.py estado <dir> <proyecto> <compose>
#       Contenedores de la app que no están en marcha (para la simulación).
import json, os, re, subprocess, sys

def run(*cmd, cwd=None):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=180)
    return p.returncode, p.stdout, p.stderr

def config(d, proj, compose, envfile=None):
    cmd = ["docker", "compose", "-p", proj, "-f", compose]
    if envfile:
        cmd += ["--env-file", envfile]
    rc, out, err = run(*cmd, "config", "--format", "json", cwd=d)
    unset = sorted(set(re.findall(r'The \\?"([A-Za-z_][A-Za-z0-9_]*)\\?" variable is not set', err)))
    try:
        return json.loads(out), unset, ""
    except Exception:
        return None, unset, (err or out).strip()[-1500:]

def inside(path, d):
    path = os.path.realpath(path)
    d = os.path.realpath(d)
    return path == d or path.startswith(d + os.sep)

def cmd_compose(d, proj, compose, envfile):
    cfg, unset, error = config(d, proj, compose, envfile)
    res = {"unset": unset, "public": [], "srcmount": [], "built": [], "services": [], "error": error}
    if not cfg:
        return res
    for name, s in (cfg.get("services") or {}).items():
        res["services"].append(name)
        if s.get("build"):
            res["built"].append(name)
        for p in s.get("ports") or []:
            ip = p.get("host_ip") or ""
            if p.get("published") and ip in ("", "0.0.0.0", "::"):
                res["public"].append("%s:%s" % (name, p.get("published")))
        for v in s.get("volumes") or []:
            if v.get("type") == "bind" and os.path.realpath(v.get("source", "")) == os.path.realpath(d):
                res["srcmount"].append(name)
    return res

def image_ids(img):
    rc, out, _ = run("docker", "image", "inspect", "-f", "{{.Config.User}}", img)
    if rc != 0:
        return None
    user = out.strip()
    if user in ("", "root", "0", "0:0"):
        return None
    if re.fullmatch(r"\d+(:\d+)?", user):
        return user if ":" in user else user + ":" + user
    rc, out, _ = run("docker", "run", "--rm", "--entrypoint", "sh", img, "-c", "id -u; id -g")
    ids = out.split()
    if rc != 0 or len(ids) < 2 or ids[0] == "0":
        return None
    return ids[0] + ":" + ids[1]

def cmd_permisos(d, proj, compose):
    cfg, _, _ = config(d, proj, compose)
    notes, seen = [], {}
    for name, s in ((cfg or {}).get("services") or {}).items():
        img = s.get("image") or ("%s-%s" % (proj, name))
        binds = [v["source"] for v in s.get("volumes") or [] if v.get("type") == "bind" and inside(v.get("source", ""), d)]
        if not binds:
            continue
        if img not in seen:
            seen[img] = image_ids(img)
        ids = seen[img]
        if not ids:
            continue
        for src in binds:
            os.makedirs(src, exist_ok=True)
            st = os.stat(src)
            if "%d:%d" % (st.st_uid, st.st_gid) == ids:
                continue
            subprocess.run(["chown", "-R", ids, src], check=False)
            notes.append("%s (%s): %s" % (name, ids, os.path.relpath(src, d) or "."))
    return {"notes": notes}

def cmd_estado(d, proj, compose):
    rc, out, _ = run("docker", "compose", "-p", proj, "-f", compose, "ps", "-a", "--format",
                     "{{.Service}}|{{.State}}|{{.Health}}|{{.ExitCode}}", cwd=d)
    bad = []
    for l in out.splitlines():
        f = l.split("|")
        if len(f) == 4 and (f[1] != "running" or f[2] == "unhealthy"):
            bad.append("%s (%s%s)" % (f[0], f[1], ", código " + f[3] if f[1] == "exited" else (", " + f[2] if f[2] else "")))
    return {"stopped": bad}

if __name__ == "__main__":
    mode, d, proj, compose = sys.argv[1:5]
    if mode == "compose":
        print(json.dumps(cmd_compose(d, proj, compose, sys.argv[5] if len(sys.argv) > 5 else None)))
    elif mode == "permisos":
        print(json.dumps(cmd_permisos(d, proj, compose)))
    else:
        print(json.dumps(cmd_estado(d, proj, compose)))
