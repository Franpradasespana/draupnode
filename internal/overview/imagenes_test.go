package overview

import (
	"os/exec"
	"strings"
	"testing"
)

// parse_ref de imagenes.py: registro, repositorio y etiqueta de cada forma de nombrar una imagen.
func TestImagenesParseRef(t *testing.T) {
	if _, err := exec.LookPath("python3"); err != nil {
		t.Skip("sin python3")
	}
	code := strings.Replace(Images, `if __name__ == "__main__":`, `if False:`, 1) + `
cases = {
    "nginx": ("registry-1.docker.io", "library/nginx", "latest"),
    "nginx:1.27-alpine": ("registry-1.docker.io", "library/nginx", "1.27-alpine"),
    "grafana/grafana-oss:11.3.1": ("registry-1.docker.io", "grafana/grafana-oss", "11.3.1"),
    "docker.io/louislam/uptime-kuma:2": ("registry-1.docker.io", "louislam/uptime-kuma", "2"),
    "ghcr.io/immich-app/immich-server:release": ("ghcr.io", "immich-app/immich-server", "release"),
    "localhost:5000/app": ("localhost:5000", "app", "latest"),
    "registry.example.com:5000/equipo/app:v1": ("registry.example.com:5000", "equipo/app", "v1"),
}
for ref, want in cases.items():
    got = parse_ref(ref)
    assert got == want, (ref, got)
assert parse_ref("nginx@sha256:abc") is None
print("ok")
`
	out, err := exec.Command("python3", "-c", code).CombinedOutput()
	if err != nil || strings.TrimSpace(string(out)) != "ok" {
		t.Fatalf("%s %v", out, err)
	}
}
