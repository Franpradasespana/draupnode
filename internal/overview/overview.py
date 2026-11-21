# Estado de un servidor para Draupnode (se ejecuta como root, sin escribir nada).
# Saca un JSON con: sistema, CPU, memoria, discos, contenedores (con su uso),
# bases de datos y su tamaño, apps de Coolify, sitios de nginx/Caddy,
# servicios caídos y puertos abiertos. Cada parte es independiente: si una
# falla, las demás siguen.
import glob, json, os, re, shutil, socket, subprocess, time

def run(*cmd, timeout=20, env=None):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env).stdout
    except Exception:
        return ""

out = {"errors": []}

def part(name):
    def deco(fn):
        try:
            out[name] = fn()
        except Exception as e:
            out["errors"].append(f"{name}: {e}")
        return fn
    return deco

@part("system")
def _():
    osr = {}
    for l in open("/etc/os-release"):
        if "=" in l:
            k, v = l.rstrip("\n").split("=", 1)
            osr[k] = v.strip('"')
    up = float(open("/proc/uptime").read().split()[0])
    load = open("/proc/loadavg").read().split()[:3]
    mem = {}
    for l in open("/proc/meminfo"):
        k, v = l.split(":", 1)
        mem[k] = int(v.split()[0]) * 1024
    def cpu():
        f = open("/proc/stat").readline().split()[1:]
        f = list(map(int, f))
        return sum(f), f[3] + (f[4] if len(f) > 4 else 0)
    t1, i1 = cpu(); time.sleep(0.5); t2, i2 = cpu()
    return {"hostname": socket.gethostname(), "os": osr.get("PRETTY_NAME", ""), "kernel": os.uname().release,
            "uptime": up, "load": [float(x) for x in load], "cpus": os.cpu_count(),
            "cpu": round(100 * (1 - (i2 - i1) / max(t2 - t1, 1)), 1),
            "memTotal": mem.get("MemTotal", 0), "memAvailable": mem.get("MemAvailable", 0),
            "swapTotal": mem.get("SwapTotal", 0), "swapFree": mem.get("SwapFree", 0)}

@part("disks")
def _():
    d = []
    for l in run("df", "-P", "-B1", "-x", "tmpfs", "-x", "devtmpfs", "-x", "overlay", "-x", "squashfs", "-x", "efivarfs").splitlines()[1:]:
        f = l.split()
        if len(f) >= 6 and os.path.isdir(f[5]):
            d.append({"mount": f[5], "size": int(f[1]), "used": int(f[2]), "free": int(f[3])})
    return d

DOCKER = bool(shutil.which("docker")) and run("docker", "info", "--format", "{{.ServerVersion}}").strip() != ""
out["docker"] = DOCKER

@part("containers")
def _():
    if not DOCKER:
        return []
    ids = run("docker", "ps", "-aq").split()
    if not ids:
        return []
    stats = {}
    for l in run("docker", "stats", "--no-stream", "--format", "{{.ID}}|{{.CPUPerc}}|{{.MemUsage}}", timeout=30).splitlines():
        p = l.split("|")
        if len(p) == 3:
            stats[p[0][:12]] = {"cpu": p[1], "mem": p[2].split("/")[0].strip()}
    res = []
    for c in json.loads(run("docker", "inspect", *ids, timeout=30) or "[]"):
        lab = (c.get("Config") or {}).get("Labels") or {}
        ports = []
        for cp, binds in ((c.get("NetworkSettings") or {}).get("Ports") or {}).items():
            for b in binds or []:
                ports.append(f"{b.get('HostIp') or '0.0.0.0'}:{b.get('HostPort')}->{cp}")
        st = c.get("State") or {}
        res.append({"id": c["Id"][:12], "name": c["Name"].lstrip("/"), "image": (c.get("Config") or {}).get("Image", ""),
                    "state": st.get("Status", ""), "health": (st.get("Health") or {}).get("Status", ""),
                    "started": st.get("StartedAt", ""), "restarts": c.get("RestartCount", 0),
                    "compose": lab.get("com.docker.compose.project", ""), "draupnode": lab.get("draupnode.proyecto", ""),
                    "coolify": lab.get("coolify.name", "") or lab.get("coolify.serviceName", ""),
                    "ports": sorted(set(ports)), **stats.get(c["Id"][:12], {})})
    return sorted(res, key=lambda x: (x["compose"], x["name"]))

def env_of(name):
    e = {}
    for kv in json.loads(run("docker", "inspect", "--format", "{{json .Config.Env}}", name) or "[]"):
        k, _, v = kv.partition("=")
        e[k] = v
    return e

@part("databases")
def _():
    if not DOCKER:
        return []
    res = []
    for l in run("docker", "ps", "--format", "{{.Names}}|{{.Image}}").splitlines():
        name, _, image = l.partition("|")
        img = image.lower()
        if "postgres" in img or "pgvecto" in img or "vectorchord" in img:
            e = env_of(name)
            user = e.get("POSTGRES_USER", "postgres")
            q = "SELECT datname, pg_database_size(datname) FROM pg_database WHERE NOT datistemplate ORDER BY 2 DESC"
            dbs = []
            for row in run("docker", "exec", name, "psql", "-U", user, "-d", "postgres", "-Atc", q).splitlines():
                n, _, size = row.partition("|")
                if size.isdigit():
                    dbs.append({"name": n, "size": int(size)})
            res.append({"container": name, "engine": "PostgreSQL", "image": image, "databases": dbs})
        elif "mariadb" in img or "mysql" in img:
            e = env_of(name)
            pw = e.get("MARIADB_ROOT_PASSWORD") or e.get("MYSQL_ROOT_PASSWORD") or ""
            cli = "mariadb" if "mariadb" in img else "mysql"
            q = ("SELECT table_schema, SUM(data_length+index_length) FROM information_schema.tables "
                 "WHERE table_schema NOT IN ('information_schema','performance_schema','mysql','sys') GROUP BY table_schema ORDER BY 2 DESC")
            dbs = []
            for row in run("docker", "exec", "-e", "MYSQL_PWD=" + pw, name, cli, "-uroot", "-N", "-e", q).splitlines():
                p = row.split("\t")
                if len(p) == 2 and p[1].replace(".", "").isdigit():
                    dbs.append({"name": p[0], "size": int(float(p[1]))})
            res.append({"container": name, "engine": "MariaDB" if cli == "mariadb" else "MySQL", "image": image, "databases": dbs})
    return res

@part("coolify")
def _():
    if not DOCKER or not run("docker", "ps", "-q", "-f", "name=^coolify-db$").strip():
        return None
    q = ("SELECT 'app', name, coalesce(fqdn,''), coalesce(status,'') FROM applications WHERE deleted_at IS NULL "
         "UNION ALL SELECT 'servicio', name, coalesce(fqdn,''), '' FROM service_applications WHERE deleted_at IS NULL AND fqdn IS NOT NULL")
    apps = []
    for row in run("docker", "exec", "coolify-db", "psql", "-U", "coolify", "-d", "coolify", "-Atc", q).splitlines():
        p = row.split("|")
        if len(p) == 4:
            apps.append({"kind": p[0], "name": p[1], "urls": [u for u in p[2].split(",") if u], "status": p[3]})
    fqdn = run("docker", "exec", "coolify-db", "psql", "-U", "coolify", "-d", "coolify", "-Atc", "SELECT coalesce(fqdn,'') FROM instance_settings LIMIT 1").strip()
    return {"apps": apps, "panel": fqdn}

@part("sites")
def _():
    sites = []
    for f in sorted(glob.glob("/etc/nginx/sites-enabled/*")) + sorted(glob.glob("/etc/nginx/conf.d/*.conf")):
        try:
            txt = open(f).read()
        except OSError:
            continue
        for block in re.split(r"\bserver\s*\{", txt)[1:]:
            names = re.findall(r"server_name\s+([^;]+);", block)
            target = re.findall(r"proxy_pass\s+([^;]+);", block) or re.findall(r"\broot\s+([^;]+);", block)
            ssl = "ssl" in " ".join(re.findall(r"listen\s+([^;]+);", block))
            for n in (names[0].split() if names else []):
                if n != "_":
                    sites.append({"server": "nginx", "domain": n, "target": target[0].strip() if target else "", "https": ssl, "file": f})
    if os.path.exists("/etc/caddy/Caddyfile"):
        cur = None
        for l in open("/etc/caddy/Caddyfile"):
            m = re.match(r"^([^\s{#][^{]*)\{\s*$", l)
            if m and not l.startswith("{"):
                cur = {"server": "Caddy", "domain": m.group(1).strip(), "target": "", "https": True, "file": "/etc/caddy/Caddyfile"}
                sites.append(cur)
            elif cur:
                t = re.match(r"\s*(reverse_proxy|root \*)\s+(\S+)", l)
                if t and not cur["target"]:
                    cur["target"] = t.group(2)
    # Dedup (nginx: el bloque http y el https del mismo dominio)
    seen, res = set(), []
    for s in sites:
        k = (s["server"], s["domain"])
        if k in seen:
            for r in res:
                if (r["server"], r["domain"]) == k:
                    r["https"] = r["https"] or s["https"]
                    r["target"] = r["target"] or s["target"]
            continue
        seen.add(k)
        res.append(s)
    return res

@part("failed")
def _():
    return [l.split()[0] for l in run("systemctl", "--failed", "--plain", "--no-legend").splitlines() if l.split()]

@part("ports")
def _():
    res = []
    for l in run("ss", "-Hltnup").splitlines():
        f = l.split()
        if len(f) < 5:
            continue
        addr = f[4]
        host, _, port = addr.rpartition(":")
        proc = re.search(r'\("([^"]+)"', l)
        res.append({"proto": f[0], "addr": host.strip("[]"), "port": int(port) if port.isdigit() else 0,
                    "process": proc.group(1) if proc else "",
                    "public": host.strip("[]") not in ("127.0.0.1", "::1", "127.0.0.53", "127.0.0.54", "localhost")})
    seen, uniq = set(), []
    for p in sorted(res, key=lambda x: (x["port"], x["proto"])):
        k = (p["proto"], p["port"], p["public"])
        if k not in seen:
            seen.add(k)
            uniq.append(p)
    return uniq

out["at"] = int(time.time())
print(json.dumps(out))
