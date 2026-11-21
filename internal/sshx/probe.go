package sshx

import (
	"bufio"
	"context"
	"strings"

	"golang.org/x/crypto/ssh"
)

// probeScript es POSIX sh: funciona en cualquier Linux sin dependencias.
// Cada línea es clave=valor.
const probeScript = `
. /etc/os-release 2>/dev/null
echo "os=${PRETTY_NAME:-desconocido}"
echo "os_id=${ID:-}"
echo "os_version=${VERSION_ID:-}"
echo "hostname=$(hostname 2>/dev/null)"
echo "kernel=$(uname -r)"
echo "arch=$(uname -m)"
echo "cpus=$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN)"
echo "mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null)"
echo "disk_free_kb=$(df -Pk / 2>/dev/null | awk 'NR==2 {print $4}')"
echo "disk_total_kb=$(df -Pk / 2>/dev/null | awk 'NR==2 {print $2}')"
echo "uptime=$(uptime -p 2>/dev/null)"
if [ "$(id -u)" = 0 ]; then echo "sudo=root"; elif sudo -n true 2>/dev/null; then echo "sudo=yes"; else echo "sudo=no"; fi
# Proveedor de nube (los datos DMI se leen sin ser root).
v="$(cat /sys/class/dmi/id/sys_vendor /sys/class/dmi/id/product_name /sys/class/dmi/id/chassis_asset_tag /sys/class/dmi/id/bios_vendor 2>/dev/null | tr '\n' ' ')"
case "$v" in
  *OracleCloud*) c=oracle ;; *Amazon*|*amazon*) c=aws ;; *Google*) c=gcp ;;
  *Microsoft*) c=azure ;; *Hetzner*) c=hetzner ;; *DigitalOcean*) c=digitalocean ;;
  *OVH*) c=ovh ;; *Scaleway*) c=scaleway ;; *Linode*|*Akamai*) c=linode ;; *Vultr*) c=vultr ;;
  *) c= ;;
esac
echo "cloud=$c"
for b in python3 docker git curl ansible; do
  if command -v "$b" >/dev/null 2>&1; then echo "has_$b=yes"; else echo "has_$b=no"; fi
done
`

// Probe recoge datos básicos del servidor (sistema, RAM, disco, sudo...).
func Probe(ctx context.Context, c *ssh.Client) (map[string]string, error) {
	out, err := Output(ctx, c, "sh -s <<'DRAUPNODE_EOF'\n"+probeScript+"\nDRAUPNODE_EOF")
	if err != nil && out == "" {
		return nil, err
	}
	return ParseFacts(out), nil
}

// ParseFacts convierte líneas clave=valor en un mapa (ignora el resto).
func ParseFacts(out string) map[string]string {
	facts := map[string]string{}
	sc := bufio.NewScanner(strings.NewReader(out))
	for sc.Scan() {
		k, v, ok := strings.Cut(sc.Text(), "=")
		k = strings.TrimSpace(k)
		if !ok || k == "" || strings.ContainsAny(k, " \t") {
			continue
		}
		facts[k] = strings.TrimSpace(v)
	}
	return facts
}
