# Draupnode: ¿hay versión nueva de las imágenes Docker que usan los contenedores?
# Para cada imagen (repositorio:etiqueta) se pregunta al registro (Docker Hub,
# ghcr.io, quay.io…) por el resumen (digest) de esa etiqueta y se compara con el
# de la imagen que hay en el servidor. Solo lee: no descarga ninguna imagen.
# Imprime una línea JSON.
import json, re, subprocess, time, urllib.request, urllib.error, urllib.parse
from concurrent.futures import ThreadPoolExecutor

ACCEPT = ", ".join([
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
])


def run(*cmd, timeout=30):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    except Exception:
        return ""


def parse_ref(ref):
    """«nginx» → (registry-1.docker.io, library/nginx, latest). None si va fijada por digest."""
    if "@" in ref:
        return None
    name, tag = ref, "latest"
    last = ref.rsplit("/", 1)[-1]
    if ":" in last:
        name, tag = ref.rsplit(":", 1)
    parts = name.split("/", 1)
    if len(parts) == 2 and ("." in parts[0] or ":" in parts[0] or parts[0] == "localhost"):
        reg, repo = parts
    else:
        reg, repo = "docker.io", name
    if reg in ("docker.io", "index.docker.io"):
        reg = "registry-1.docker.io"
        if "/" not in repo:
            repo = "library/" + repo
    return reg, repo, tag


def bearer(header):
    params = dict(re.findall(r'(\w+)="([^"]*)"', header or ""))
    realm = params.pop("realm", "")
    if not realm:
        return None
    url = realm + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "draupnode"}), timeout=10) as r:
        d = json.load(r)
    return d.get("token") or d.get("access_token")


def remote_digest(reg, repo, tag):
    url = f"https://{reg}/v2/{repo}/manifests/{tag}"
    headers = {"Accept": ACCEPT, "User-Agent": "draupnode"}
    for attempt in range(2):
        req = urllib.request.Request(url, headers=headers, method="HEAD")
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.headers.get("Docker-Content-Digest", "")
        except urllib.error.HTTPError as e:
            if e.code == 401 and attempt == 0:
                tok = bearer(e.headers.get("WWW-Authenticate"))
                if not tok:
                    raise
                headers["Authorization"] = "Bearer " + tok
                continue
            raise
    return ""


def check(img):
    p = parse_ref(img["image"])
    if p is None:
        img["status"] = "pinned"
        return img
    if not img["digests"]:
        img["status"] = "local"  # construida en el servidor: no está en ningún registro
        return img
    try:
        d = remote_digest(*p)
        if not d:
            img["status"], img["error"] = "unknown", "sin digest"
        elif d in img["digests"]:
            img["status"] = "same"
        else:
            img["status"], img["remote"] = "new", d
    except urllib.error.HTTPError as e:
        img["status"], img["error"] = "unknown", f"HTTP {e.code}"
    except Exception as e:  # sin red, registro privado…
        img["status"], img["error"] = "unknown", str(e)[:120]
    return img


def main():
    out = {"checked": int(time.time()), "images": []}
    ids = run("docker", "ps", "-aq").split()
    if not ids:
        print(json.dumps(out))
        return
    fmt = '{{json .Config.Image}}|{{json .Image}}|{{json .Name}}|{{json .Config.Labels}}|{{json .State.Status}}'
    by = {}
    for l in run("docker", "inspect", "-f", fmt, *ids).splitlines():
        try:
            ref, iid, name, labels, state = [json.loads(x) for x in l.split("|", 4)]
        except Exception:
            continue
        labels = labels or {}
        img = by.setdefault(ref, {"image": ref, "id": iid, "containers": [], "compose": [], "coolify": False, "digests": []})
        img["containers"].append(name.lstrip("/"))
        proj = labels.get("com.docker.compose.project")
        if labels.get("coolify.managed") == "true":
            img["coolify"] = True
        elif proj and proj not in [c["project"] for c in img["compose"]]:
            img["compose"].append({"project": proj, "dir": labels.get("com.docker.compose.project.working_dir", ""),
                                   "files": labels.get("com.docker.compose.project.config_files", "")})
    for img in by.values():
        raw = run("docker", "image", "inspect", "-f", "{{json .RepoDigests}}", img["id"]).strip()
        try:
            img["digests"] = [d.split("@", 1)[1] for d in (json.loads(raw) or []) if "@" in d]
        except Exception:
            img["digests"] = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        out["images"] = sorted(ex.map(check, by.values()), key=lambda i: i["image"])
    for img in out["images"]:
        img.pop("digests", None)
        img.pop("id", None)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
