# Historial de Draupnode: CPU, memoria, disco y uso de cada app a lo largo del tiempo.
#
# En el servidor vive en /usr/local/lib/draupnode/historial.py y un temporizador
# de systemd lo llama cada 5 minutos con «muestra»: guarda una línea en
# muestras.jsonl (se conservan 48 h) y, al cambiar de hora, resume la hora
# terminada en horas.jsonl (se conserva 1 año). La ficha (overview.py) lleva
# este mismo código delante y llama a leer_historial(): las últimas 24 h, los
# últimos 30 días, el uso de cada app y cuándo se llenará el disco a este ritmo.
import json, os, re, subprocess, sys, time

HIST_VERSION = 1
HIST_DIR = os.environ.get("DN_HIST_DIR", "/var/lib/draupnode/historial")
HIST_STEP = 300            # una muestra cada 5 minutos
HIST_KEEP_SAMPLES = 48 * 3600
HIST_KEEP_HOURS = 400 * 86400

def hist_app_key(compose, coolify, name):
    """A qué app pertenece un contenedor (la misma regla en la ficha y aquí)."""
    if coolify:
        return "coolify:" + coolify
    return compose or name

_UNITS = {"b": 1, "kb": 1e3, "mb": 1e6, "gb": 1e9, "tb": 1e12, "kib": 1024, "mib": 1024 ** 2, "gib": 1024 ** 3, "tib": 1024 ** 4}

def hist_bytes(s):
    """«100.5MiB» → bytes."""
    m = re.match(r"\s*([\d.]+)\s*([A-Za-z]*)", s or "")
    if not m:
        return 0
    return int(float(m.group(1)) * _UNITS.get(m.group(2).lower(), 1))

def hist_pct(s):
    try:
        return float((s or "").strip().rstrip("%"))
    except ValueError:
        return 0.0

def _run(*cmd, timeout=40):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    except Exception:
        return ""

def _cpu_counters():
    f = list(map(int, open("/proc/stat").readline().split()[1:]))
    return sum(f), f[3] + (f[4] if len(f) > 4 else 0)

def _read_jsonl(path):
    rows = []
    try:
        with open(path) as fh:
            for l in fh:
                try:
                    rows.append(json.loads(l))
                except ValueError:
                    pass   # una línea a medias (corte de luz): se salta
    except OSError:
        pass
    return rows

def _write_jsonl(path, rows):
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        for r in rows:
            fh.write(json.dumps(r, separators=(",", ":")) + "\n")
    os.replace(tmp, path)

def _apps_now():
    """{app: [cpu %, memoria en bytes]} sumando sus contenedores en marcha."""
    if os.environ.get("DN_HIST_NO_DOCKER") or not _run("docker", "info", "--format", "{{.ServerVersion}}", timeout=10).strip():
        return {}
    labels = {}
    fmt = '{{.ID}}|{{.Names}}|{{.Label "com.docker.compose.project"}}|{{.Label "coolify.name"}}{{.Label "coolify.serviceName"}}'
    for l in _run("docker", "ps", "--format", fmt).splitlines():
        p = l.split("|")
        if len(p) == 4:
            labels[p[0][:12]] = hist_app_key(p[2], p[3], p[1])
    apps = {}
    for l in _run("docker", "stats", "--no-stream", "--format", "{{.ID}}|{{.CPUPerc}}|{{.MemUsage}}").splitlines():
        p = l.split("|")
        if len(p) != 3 or p[0][:12] not in labels:
            continue
        a = apps.setdefault(labels[p[0][:12]], [0.0, 0])
        a[0] = round(a[0] + hist_pct(p[1]), 2)
        a[1] += hist_bytes(p[2].split("/")[0])
    return apps

def _rollup(samples, start):
    """Resumen de una hora: medias, máximos y el último disco."""
    n = len(samples)
    apps = {}
    for s in samples:
        for k, (c, m) in (s.get("apps") or {}).items():
            a = apps.setdefault(k, [0.0, 0, 0.0, 0])
            a[0] += c; a[1] += m; a[2] = max(a[2], c); a[3] = max(a[3], m)
    last = samples[-1]
    return {"t": start, "n": n,
            "cpu": round(sum(s["cpu"] for s in samples) / n, 1), "cpuMax": max(s["cpu"] for s in samples),
            "mem": int(sum(s["mem"] for s in samples) / n), "memMax": max(s["mem"] for s in samples), "memT": last["memT"],
            "disk": last["disk"], "diskT": last["diskT"],
            # app: [cpu media, memoria media, cpu máx, memoria máx]; la media cuenta las muestras sin la app como 0
            "apps": {k: [round(a[0] / n, 2), int(a[1] / n), a[2], a[3]] for k, a in apps.items()}}

def tomar_muestra(now=None):
    now = int(now or time.time())
    os.makedirs(HIST_DIR, exist_ok=True)
    state_p = os.path.join(HIST_DIR, "estado.json")
    try:
        state = json.load(open(state_p))
    except (OSError, ValueError):
        state = {}
    # CPU media desde la muestra anterior (si es de hace poco); si no, en 1 s.
    tot, idle = _cpu_counters()
    if state.get("cpu") and 0 < now - state.get("t", 0) <= 3 * HIST_STEP and tot >= state["cpu"][0]:
        t0, i0 = state["cpu"]
    else:
        t0, i0 = tot, idle
        time.sleep(1)
        tot, idle = _cpu_counters()
    cpu = round(100 * (1 - (idle - i0) / max(tot - t0, 1)), 1)
    mem = {}
    for l in open("/proc/meminfo"):
        k, v = l.split(":", 1)
        mem[k] = int(v.split()[0]) * 1024
    st = os.statvfs("/")
    disk_t = st.f_blocks * st.f_frsize
    sample = {"t": now, "cpu": max(0.0, cpu), "mem": mem.get("MemTotal", 0) - mem.get("MemAvailable", 0), "memT": mem.get("MemTotal", 0),
              "disk": disk_t - st.f_bfree * st.f_frsize, "diskT": disk_t, "apps": _apps_now()}
    samples_p = os.path.join(HIST_DIR, "muestras.jsonl")
    with open(samples_p, "a") as fh:
        fh.write(json.dumps(sample, separators=(",", ":")) + "\n")
    hour = now - now % 3600
    if state.get("hour", hour) != hour:
        _close_hours(samples_p, hour, now)
    json.dump({"t": now, "cpu": [tot, idle], "hour": hour}, open(state_p, "w"))
    return sample

def _close_hours(samples_p, hour, now):
    """Resume las horas terminadas que falten y recorta los ficheros."""
    hours_p = os.path.join(HIST_DIR, "horas.jsonl")
    hours = _read_jsonl(hours_p)
    done = hours[-1]["t"] if hours else 0
    samples = _read_jsonl(samples_p)
    by_hour = {}
    for s in samples:
        h = s["t"] - s["t"] % 3600
        if done < h < hour:
            by_hour.setdefault(h, []).append(s)
    hours += [_rollup(by_hour[h], h) for h in sorted(by_hour)]
    _write_jsonl(hours_p, [h for h in hours if h["t"] >= now - HIST_KEEP_HOURS])
    _write_jsonl(samples_p, [s for s in samples if s["t"] >= now - HIST_KEEP_SAMPLES])

def _forecast(points, now):
    """Cuándo se llena el disco: recta por mínimos cuadrados con lo usado.

    points: [(t, usado, tamaño)] de los últimos días. Solo cuentan los del
    tamaño actual (si se amplió el disco, lo de antes no vale)."""
    if not points:
        return {"enough": False, "hours": 0}
    size = points[-1][2]
    pts = [(t, u) for t, u, s in points if s == size]
    span = (pts[-1][0] - pts[0][0]) / 3600 if pts else 0
    res = {"enough": False, "hours": round(span, 1), "free": size - points[-1][1]}
    if len(pts) < 6 or span < 12:
        return res
    n = len(pts)
    mt = sum(t for t, _ in pts) / n
    mu = sum(u for _, u in pts) / n
    var = sum((t - mt) ** 2 for t, _ in pts)
    slope = sum((t - mt) * (u - mu) for t, u in pts) / var if var else 0   # bytes por segundo
    per_day = slope * 86400
    res.update({"enough": True, "perDay": int(per_day)})
    # Crecer menos de 50 MB al día (o de un 0,05 % del disco) es estar quieto.
    if per_day > max(50e6, size * 0.0005):
        res["days"] = round(res["free"] / per_day, 1)
    return res

def leer_historial(now=None):
    now = int(now or time.time())
    samples = _read_jsonl(os.path.join(HIST_DIR, "muestras.jsonl"))
    if not samples and not os.path.exists(os.path.join(HIST_DIR, "estado.json")):
        return {"hasData": False}
    hours = _read_jsonl(os.path.join(HIST_DIR, "horas.jsonl"))
    day = [s for s in samples if s["t"] > now - 86400]
    month = [h for h in hours if h["t"] > now - 30 * 86400]
    # La hora en curso (aún sin resumir) también cuenta en la vista de 30 días.
    cur = [s for s in samples if s["t"] >= now - now % 3600]
    if cur and (not month or month[-1]["t"] < cur[0]["t"] - cur[0]["t"] % 3600):
        month.append(_rollup(cur, cur[0]["t"] - cur[0]["t"] % 3600))
    last = samples[-1] if samples else (hours[-1] if hours else None)
    # Disco: horas de los últimos 7 días; si aún no hay, las muestras sueltas.
    week = [(h["t"], h["disk"], h["diskT"]) for h in hours if h["t"] >= now - 7 * 86400]
    if len(week) < 6:
        week = [(s["t"], s["disk"], s["diskT"]) for s in samples]
    # Apps en las últimas 24 h, de 15 en 15 minutos.
    apps = {}
    for s in day:
        b = s["t"] - s["t"] % 900
        for k, (c, m) in (s.get("apps") or {}).items():
            a = apps.setdefault(k, {"series": {}, "cpuMax": 0, "memMax": 0, "cpuSum": 0.0, "memSum": 0, "n": 0})
            p = a["series"].setdefault(b, [0.0, 0, 0])
            p[0] += c; p[1] += m; p[2] += 1
            a["cpuMax"] = max(a["cpuMax"], c); a["memMax"] = max(a["memMax"], m)
            a["cpuSum"] += c; a["memSum"] += m; a["n"] += 1
    nday = max(len(day), 1)
    apps_out = {k: {"cpuAvg": round(a["cpuSum"] / nday, 2), "memAvg": int(a["memSum"] / nday), "cpuMax": a["cpuMax"], "memMax": a["memMax"],
                    "series": [[b, round(p[0] / p[2], 2), int(p[1] / p[2])] for b, p in sorted(a["series"].items())]}
                for k, a in apps.items()}
    return {"hasData": True, "version": HIST_VERSION, "step": HIST_STEP,
            "since": (hours[0]["t"] if hours else samples[0]["t"] if samples else None), "last": last["t"] if last else None,
            "memT": last["memT"] if last else 0, "diskT": last["diskT"] if last else 0,
            # [t, cpu %, memoria usada, disco usado]
            "day": [[s["t"], s["cpu"], s["mem"], s["disk"]] for s in day],
            # [t, cpu media, cpu máx, memoria media, memoria máx, disco]
            "month": [[h["t"], h["cpu"], h["cpuMax"], h["mem"], h["memMax"], h["disk"]] for h in month],
            "forecast": _forecast(week, now), "apps": apps_out}

if __name__ == "__main__" and len(sys.argv) > 1:
    if sys.argv[1] == "muestra":
        tomar_muestra()
    elif sys.argv[1] == "leer":
        print(json.dumps(leer_historial()))
