# Estado de un servidor para Draupnode (se ejecuta como root, sin escribir nada).
# Saca un JSON con: sistema, CPU, memoria, discos, contenedores (con su uso),
# bases de datos y su tamaño, apps de Coolify, sitios de nginx/Caddy,
# servicios caídos, copias de Draupnode, actualizaciones, hora, intentos de SSH,
# caducidad de los certificados, historial (historial.py va delante), puertos escuchando y lo que deja pasar el cortafuegos. Cada parte es independiente: si una
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
    # «overlay» se descarta (son las capas de los contenedores), salvo si es la raíz:
    # en un servidor que es un contenedor (o un VPS con overlay) «/» es el disco de verdad.
    d = []
    for l in run("df", "-P", "-B1", "-T", "-x", "tmpfs", "-x", "devtmpfs", "-x", "squashfs", "-x", "efivarfs").splitlines()[1:]:
        f = l.split()
        if len(f) < 7 or not os.path.isdir(f[6]) or (f[1] == "overlay" and f[6] != "/"):
            continue
        d.append({"mount": f[6], "size": int(f[2]), "used": int(f[3]), "free": int(f[4])})
    d.sort(key=lambda x: (x["mount"] != "/", x["mount"]))
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
            mem = p[2].split("/")[0].strip()
            stats[p[0][:12]] = {"cpu": p[1], "mem": mem, "cpuP": hist_pct(p[1]), "memB": hist_bytes(mem)}
    res = []
    for c in json.loads(run("docker", "inspect", *ids, timeout=30) or "[]"):
        lab = (c.get("Config") or {}).get("Labels") or {}
        ports = []
        for cp, binds in ((c.get("NetworkSettings") or {}).get("Ports") or {}).items():
            for b in binds or []:
                ports.append(f"{b.get('HostIp') or '0.0.0.0'}:{b.get('HostPort')}->{cp}")
        st = c.get("State") or {}
        coolify = lab.get("coolify.name", "") or lab.get("coolify.serviceName", "")
        res.append({"id": c["Id"][:12], "name": c["Name"].lstrip("/"), "image": (c.get("Config") or {}).get("Image", ""),
                    "app": hist_app_key(lab.get("com.docker.compose.project", ""), coolify, c["Name"].lstrip("/")),
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

@part("firewall")
def _():
    # Lo que deja pasar el cortafuegos (iptables; también las reglas de ufw).
    if not shutil.which("iptables"):
        return {"active": False, "tcp": [], "udp": []}
    rules = run("iptables", "-S").splitlines()
    chains = {"INPUT", "ufw-user-input"}
    policy = next((l.split()[2] for l in rules if l.startswith("-P INPUT ")), "ACCEPT")
    blocks = policy != "ACCEPT" or any(l.startswith("-A INPUT") and re.search(r"-j (DROP|REJECT)", l) for l in rules)
    allow = {"tcp": set(), "udp": set()}
    for l in rules:
        f = l.split()
        if len(f) < 2 or f[0] != "-A" or f[1] not in chains or "-j ACCEPT" not in l or " -s " in l or " -i " in l:
            continue
        m = re.search(r"-p (tcp|udp)", l)
        d = re.search(r"--dports? (\S+)", l)
        if m and d:
            for x in d.group(1).split(","):
                allow[m.group(1)].add(x.replace(":", "-"))
    key = lambda x: int(x.split("-")[0]) if x.split("-")[0].isdigit() else 0
    return {"active": blocks, "tcp": sorted(allow["tcp"], key=key), "udp": sorted(allow["udp"], key=key)}

@part("draupnode")
def _():
    # Lo que dejó Draupnode: fichas de plantillas, carpetas de secretos y de apps.
    marks = []
    for p in sorted(glob.glob("/etc/draupnode/plantillas/*.json")):
        try:
            m = json.load(open(p))
            if isinstance(m, dict) and isinstance(m.get("modulos"), list):
                marks.append(m)
        except Exception:
            pass
    sec = sorted(os.path.basename(d) for d in glob.glob("/etc/draupnode/secretos/*") if os.path.isdir(d))
    apps = sorted(os.path.basename(d) for d in glob.glob("/srv/draupnode/apps/*") if os.path.isdir(d))
    return {"markers": marks, "secretDirs": sec, "appDirs": apps}

@part("backups")
def _():
    # Copias de Draupnode (módulo Copias): cuándo terminó la última y si fue bien.
    # «ago» = segundos desde que terminó (None si no se ha hecho nunca).
    res = []
    for unit in run("systemctl", "list-units", "--all", "--plain", "--no-legend", "draupnode-copia-*.service").split():
        if not unit.startswith("draupnode-copia-") or not unit.endswith(".service"):
            continue
        info = dict(l.split("=", 1) for l in run("systemctl", "show", unit, "-p", "Result,ExecMainExitTimestamp,ActiveState").splitlines() if "=" in l)
        # Si el servicio no lo sabe (p. ej. tras reiniciar), lo que recuerda el temporizador.
        when = info.get("ExecMainExitTimestamp", "").strip()
        if not when:
            when = run("systemctl", "show", unit[:-len(".service")] + ".timer", "-p", "LastTriggerUSec", "--value").strip()
        ts = run("date", "+%s", "-d", when).strip() if when and when != "n/a" else ""
        slug = unit[len("draupnode-copia-"):-len(".service")]
        if slug.endswith("-prueba"):
            continue
        verify = None
        try:
            verify = json.load(open("/var/lib/draupnode/copias-prueba/%s.json" % slug))
        except Exception:
            pass
        res.append({"slug": slug, "verify": verify,
                    "verifyTimer": os.path.exists("/etc/systemd/system/draupnode-copia-%s-prueba.timer" % slug),
                    "verifyRunning": run("systemctl", "is-active", "draupnode-copia-%s-prueba.service" % slug).strip() == "activating",
                    "ok": info.get("Result") in (None, "", "success"),
                    "running": info.get("ActiveState") == "activating",
                    "ago": max(0, round(time.time() - int(ts))) if ts.isdigit() else None})
    return res

@part("updates")
def _():
    # Actualizaciones pendientes (cuántas de seguridad) y si hace falta reiniciar.
    out = {"total": 0, "security": 0, "reboot": os.path.exists("/var/run/reboot-required"), "packages": []}
    if shutil.which("apt-get"):
        sim = run("apt-get", "-s", "-o", "Debug::NoLocking=1", "upgrade", timeout=60)
        for l in sim.splitlines():
            if l.startswith("Inst "):
                out["total"] += 1
                if "-security" in l:
                    out["security"] += 1
                if len(out["packages"]) < 15:
                    out["packages"].append(l.split()[1])
    if out["reboot"]:
        try:
            out["rebootFor"] = sorted(set(open("/var/run/reboot-required.pkgs").read().split()))[:10]
        except Exception:
            pass
    return out

@part("clock")
def _():
    # ¿Está la hora sincronizada? (si no, fallan certificados, copias y registros)
    v = run("timedatectl", "show", "-p", "NTPSynchronized", "--value").strip()
    return {"synced": v == "yes", "known": v in ("yes", "no"), "timezone": run("timedatectl", "show", "-p", "Timezone", "--value").strip()}

@part("security")
def _():
    # Intentos de entrar por SSH que fallaron en 24 h, de cuántas IPs, y lo que tiene bloqueado fail2ban.
    log = run("journalctl", "-u", "ssh", "-u", "sshd", "--since", "24 hours ago", "--no-pager", "-q", "-o", "cat", timeout=30)
    failed, ips = 0, {}
    for l in log.splitlines():
        if "Failed password" in l or "Invalid user" in l or "authentication failure" in l:
            failed += 1
            m = re.search(r"from (\S+)", l)
            if m:
                ips[m.group(1)] = ips.get(m.group(1), 0) + 1
    top = sorted(ips.items(), key=lambda x: -x[1])[:5]
    f2b = None
    if shutil.which("fail2ban-client"):
        st = run("fail2ban-client", "status", "sshd")
        cur = re.search(r"Currently banned:\s*(\d+)", st)
        tot = re.search(r"Total banned:\s*(\d+)", st)
        if cur:
            f2b = {"banned": int(cur.group(1)), "total": int(tot.group(1)) if tot else 0}
    return {"failed24h": failed, "ips": len(ips), "top": [{"ip": i, "count": c} for i, c in top], "fail2ban": f2b}

@part("hardening")
def _():
    # Datos para la nota de seguridad (la calcula la aplicación): SSH, actualizaciones
    # automáticas y lo que dejaron Lynis, Trivy, ClamAV, AIDE y CrowdSec.
    h = {}
    sshd = run("sshd", "-T", timeout=10)
    if sshd:
        cfg = {}
        for l in sshd.splitlines():
            k, _, v = l.partition(" ")
            cfg.setdefault(k, v.strip())
        h["ssh"] = {"password": cfg.get("passwordauthentication", "yes") == "yes",
                    "kbd": cfg.get("kbdinteractiveauthentication", "no") == "yes",
                    "root": cfg.get("permitrootlogin", "yes"), "port": int(cfg.get("port", "22") or 22)}
    auto = ""
    try:
        auto = open("/etc/apt/apt.conf.d/20auto-upgrades").read()
    except OSError:
        pass
    h["autoUpdates"] = bool(re.search(r'Unattended-Upgrade\s+"1"', auto)) and run("systemctl", "is-enabled", "unattended-upgrades").strip() == "enabled"
    def age(path):
        try:
            return max(0, int(time.time() - os.path.getmtime(path)))
        except OSError:
            return None
    lyn = "/var/lib/draupnode/lynis/informe.dat"
    if os.path.exists(lyn):
        txt = open(lyn, errors="replace").read()
        m = re.findall(r"^hardening_index=(\d+)", txt, re.M)
        h["lynis"] = {"index": int(m[-1]) if m else None, "warnings": len(re.findall(r"^warning\[\]=", txt, re.M)),
                      "suggestions": len(re.findall(r"^suggestion\[\]=", txt, re.M)), "ago": age(lyn)}
    tri = "/var/lib/draupnode/trivy/resumen.txt"
    if os.path.exists(tri):
        vulns, imgs, failed = 0, 0, 0
        for l in open(tri, errors="replace").read().splitlines()[1:]:
            img, _, n = l.rpartition(": ")
            if not img:
                continue
            imgs += 1
            if n.strip().isdigit():
                vulns += int(n)
            else:
                failed += 1
        h["trivy"] = {"vulns": vulns, "images": imgs, "failed": failed, "ago": age(tri)}
    clam = "/var/lib/draupnode/clamav/encontrado.txt"
    if os.path.exists("/usr/local/sbin/draupnode-clamav"):
        found = open(clam, errors="replace").read().splitlines() if os.path.exists(clam) else []
        h["clamav"] = {"found": len([l for l in found if l.strip()]), "files": [l.rsplit(":", 1)[0] for l in found[:5]], "ago": age(clam)}
    if os.path.exists("/var/lib/aide/aide.db"):
        log = ""
        try:
            log = open("/var/log/aide/aide.log", errors="replace").read()[-20000:]
        except OSError:
            pass
        diff = None
        if "found differences" in log or "found NO differences" in log:
            diff = log.rfind("found differences") > log.rfind("found NO differences")
        h["aide"] = {"differences": diff, "ago": age("/var/log/aide/aide.log")}
    if shutil.which("cscli"):
        dec = run("cscli", "decisions", "list", "-o", "json", timeout=15).strip()
        try:
            n = len(json.loads(dec) or [])
        except Exception:
            n = 0
        h["crowdsec"] = {"active": run("systemctl", "is-active", "crowdsec").strip() == "active", "decisions": n}
    h["auditd"] = run("systemctl", "is-active", "auditd").strip() == "active"
    return h

@part("autoupdate")
def _():
    # Módulo «Actualizar las apps solas»: su temporizador y el último resultado.
    res = []
    for f in sorted(glob.glob("/etc/systemd/system/draupnode-actualizar-*.timer")):
        slug = os.path.basename(f)[len("draupnode-actualizar-"):-len(".timer")]
        last = None
        try:
            last = json.load(open("/var/lib/draupnode/actualizaciones/%s.json" % slug))
        except Exception:
            pass
        nxt = run("systemctl", "show", os.path.basename(f), "-p", "NextElapseUSecRealtime", "--value").strip()
        ts = run("date", "+%s", "-d", nxt).strip() if nxt and nxt != "n/a" else ""
        res.append({"slug": slug, "last": last, "next": int(ts) if ts.isdigit() else None,
                    "active": run("systemctl", "is-active", os.path.basename(f)).strip() == "active"})
    return res

@part("certs")
def _():
    # Caducidad de los certificados HTTPS de los dominios de nginx/Caddy (los 10 primeros).
    res = []
    if not shutil.which("openssl"):
        return res
    doms = []
    for st in (out.get("sites") or []):
        d = st.get("domain") or ""
        if st.get("https") and d and "*" not in d and d not in doms:
            doms.append(d)
    for d in doms[:10]:
        txt = run("sh", "-c", "echo | timeout 6 openssl s_client -connect 127.0.0.1:443 -servername \"$1\" 2>/dev/null | openssl x509 -noout -enddate -issuer 2>/dev/null", "_", d, timeout=10)
        m = re.search(r"notAfter=(.+)", txt)
        if not m:
            res.append({"domain": d, "error": "no responde por HTTPS o sin certificado"})
            continue
        try:
            end = time.mktime(time.strptime(m.group(1).strip().replace(" GMT", ""), "%b %d %H:%M:%S %Y"))
            iss = re.search(r"issuer=.*?O ?= ?([^,/]+)", txt)
            res.append({"domain": d, "days": int((end - time.time()) // 86400), "issuer": iss.group(1).strip() if iss else ""})
        except Exception as e:
            res.append({"domain": d, "error": str(e)})
    return res

@part("software")
def _():
    # Programas que hay en el servidor (con o sin Draupnode), por módulo.
    def svc(name):
        return run("systemctl", "is-active", name).strip() == "active"
    names = set()
    for l in run("docker", "ps", "-a", "--format", "{{.Names}}|{{.Image}}").splitlines() if DOCKER else []:
        n, _, img = l.partition("|")
        names.add(n)
        names.add(img.split(":")[0].split("/")[-1])
    found = {
        "docker": DOCKER or bool(shutil.which("docker")),
        "nginx": bool(shutil.which("nginx")),
        "caddy": bool(shutil.which("caddy")),
        "ssh": bool(shutil.which("fail2ban-client")),
        "wireguard": os.path.exists("/etc/wireguard/wg0.conf"),
        "cockpit": os.path.exists("/usr/lib/systemd/system/cockpit.socket") or os.path.exists("/lib/systemd/system/cockpit.socket"),
        "samba": bool(shutil.which("smbd")),
        "coolify": "coolify" in names,
        "backups": bool(shutil.which("restic")),
        "adguard": "adguardhome" in names or os.path.isdir("/opt/AdGuardHome"),
        "firewall": "draupnode" in run("iptables", "-S", "INPUT"),
    }
    active = {"nginx": svc("nginx"), "caddy": svc("caddy"), "docker": svc("docker")}
    return [{"module": k, "active": active.get(k, True)} for k, v in found.items() if v]

@part("history")
def _():
    # Lo guarda el temporizador draupnode-historial (historial.py, que va delante de este script).
    h = leer_historial()
    # La versión y si está activo los dice el del servidor, no el que va aquí delante.
    h["version"] = 0
    try:
        m = re.search(r"^HIST_VERSION = (\d+)", open("/usr/local/lib/draupnode/historial.py").read(), re.M)
        h["version"] = int(m.group(1)) if m else 0
        h["installed"] = True
    except OSError:
        h["installed"] = False
    h["timer"] = run("systemctl", "is-active", "draupnode-historial.timer").strip() == "active"
    return h

out["at"] = int(time.time())
print(json.dumps(out))
