// Package cloudapi crea servidores en proveedores de nube (Hetzner Cloud y
// DigitalOcean) con su API y el token que da el usuario: lista regiones y
// tamaños (con su precio), sube la clave pública SSH y crea un Ubuntu 24.04.
//
// Solo habla con la API del proveedor; el resto (dar de alta el servidor en
// Draupnode, confirmar la huella) lo hace la aplicación.
package cloudapi

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"draupnode/internal/i18n"

	"golang.org/x/crypto/ssh"
)

// Proveedores.
const (
	Hetzner      = "hetzner"
	DigitalOcean = "digitalocean"
)

// Info describe un proveedor para la interfaz.
type Info struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	TokenURL  string `json:"tokenUrl"`
	TokenHelp string `json:"tokenHelp"`
	User      string `json:"user"` // usuario con el que se entra (root)
	Image     string `json:"image"`
}

// Providers son los proveedores que se pueden usar.
func Providers() []Info {
	return []Info{
		{ID: Hetzner, Name: "Hetzner Cloud", TokenURL: "https://console.hetzner.cloud/projects",
			TokenHelp: i18n.T("En la consola de Hetzner: tu proyecto → Security → API tokens → Generate API token, con permiso «Read & Write»."),
			User:      "root", Image: "Ubuntu 24.04"},
		{ID: DigitalOcean, Name: "DigitalOcean", TokenURL: "https://cloud.digitalocean.com/account/api/tokens",
			TokenHelp: i18n.T("En DigitalOcean: API → Tokens → Generate New Token, con permisos de escritura (o los de droplet, ssh_key, regions y sizes)."),
			User:      "root", Image: "Ubuntu 24.04"},
	}
}

// Valid dice si el proveedor existe.
func Valid(id string) bool { return id == Hetzner || id == DigitalOcean }

// Option es una región o un tamaño de servidor.
type Option struct {
	ID         string   `json:"id"`
	Label      string   `json:"label"`
	Detail     string   `json:"detail,omitempty"`
	PriceMonth float64  `json:"priceMonth,omitempty"`
	Currency   string   `json:"currency,omitempty"`
	Regions    []string `json:"regions,omitempty"` // tamaños: dónde están disponibles (vacío = en todas)
	RAMMB      int      `json:"ramMb,omitempty"`
}

// Catalog son las regiones y tamaños que ofrece el proveedor.
type Catalog struct {
	Regions []Option `json:"regions"`
	Sizes   []Option `json:"sizes"`
}

// CreateRequest es lo que se pide al crear.
type CreateRequest struct {
	Name      string
	Region    string
	Size      string
	PublicKey string // en formato authorized_keys
}

// Created es el servidor recién creado.
type Created struct {
	ID string `json:"id"`
	IP string `json:"ip"`
}

// Client habla con la API de un proveedor.
type Client struct {
	Provider string
	Token    string
	BaseURL  string // vacío = el de verdad (se cambia en los tests)
	HTTP     *http.Client
	// Poll: cada cuánto se mira si el servidor ya está en marcha.
	Poll time.Duration
	// SSHPort: el puerto que se espera a que conteste (22; se cambia en los tests).
	SSHPort int
}

// New crea un cliente para un proveedor.
func New(provider, token string) (*Client, error) {
	if !Valid(provider) {
		return nil, i18n.Errorf("proveedor desconocido: %s", provider)
	}
	if strings.TrimSpace(token) == "" {
		return nil, i18n.New("falta el token de la API")
	}
	return &Client{Provider: provider, Token: strings.TrimSpace(token), HTTP: &http.Client{Timeout: 30 * time.Second}, Poll: 4 * time.Second, SSHPort: 22}, nil
}

var nameRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

// ValidName: nombre del servidor en el proveedor (minúsculas, números y guiones).
func ValidName(n string) bool { return nameRe.MatchString(n) }

func (c *Client) base() string {
	if c.BaseURL != "" {
		return strings.TrimRight(c.BaseURL, "/")
	}
	if c.Provider == Hetzner {
		return "https://api.hetzner.cloud/v1"
	}
	return "https://api.digitalocean.com/v2"
}

// apiError lee el mensaje de error de cualquiera de los dos proveedores.
type apiError struct {
	Error   any    `json:"error"`
	Message string `json:"message"`
}

func (c *Client) do(ctx context.Context, method, path string, body any, out any) (int, error) {
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return 0, err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base()+path, rd)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return 0, i18n.Errorf("no se pudo hablar con la API: %v", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if resp.StatusCode == http.StatusNotFound && method == http.MethodGet {
		return resp.StatusCode, nil
	}
	if resp.StatusCode >= 300 {
		var e apiError
		_ = json.Unmarshal(raw, &e)
		msg := e.Message
		if m, ok := e.Error.(map[string]any); ok && msg == "" {
			msg = fmt.Sprint(m["message"])
		}
		if msg == "" {
			msg = strings.TrimSpace(string(raw))
		}
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			return resp.StatusCode, i18n.Errorf("el proveedor no acepta el token (%d): comprueba que es correcto y que tiene permiso de escritura", resp.StatusCode)
		}
		return resp.StatusCode, i18n.Errorf("la API respondió %d: %s", resp.StatusCode, msg)
	}
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return resp.StatusCode, i18n.Errorf("respuesta de la API no válida: %v", err)
		}
	}
	return resp.StatusCode, nil
}

// Catalog lista regiones y tamaños (más baratos primero).
func (c *Client) Catalog(ctx context.Context) (Catalog, error) {
	var cat Catalog
	var err error
	if c.Provider == Hetzner {
		cat, err = c.hetznerCatalog(ctx)
	} else {
		cat, err = c.doCatalog(ctx)
	}
	if err != nil {
		return cat, err
	}
	sort.SliceStable(cat.Sizes, func(i, j int) bool { return cat.Sizes[i].PriceMonth < cat.Sizes[j].PriceMonth })
	sort.SliceStable(cat.Regions, func(i, j int) bool { return cat.Regions[i].Label < cat.Regions[j].Label })
	return cat, nil
}

// Create sube la clave (si no estaba) y crea el servidor. No espera a que arranque.
func (c *Client) Create(ctx context.Context, r CreateRequest) (Created, error) {
	if !ValidName(r.Name) {
		return Created{}, i18n.New("el nombre solo puede tener minúsculas, números y guiones (sin empezar ni acabar en guion)")
	}
	if r.Region == "" || r.Size == "" {
		return Created{}, i18n.New("elige la región y el tamaño")
	}
	pk, _, _, _, err := ssh.ParseAuthorizedKey([]byte(r.PublicKey))
	if err != nil {
		return Created{}, i18n.Errorf("clave pública no válida: %v", err)
	}
	if c.Provider == Hetzner {
		return c.hetznerCreate(ctx, r, pk)
	}
	return c.doCreate(ctx, r, pk)
}

// Wait espera a que el servidor esté en marcha con IP pública y su SSH
// conteste. stage avisa de lo que va pasando.
func (c *Client) Wait(ctx context.Context, id string, stage func(string)) (string, error) {
	ip := ""
	for {
		var running bool
		var err error
		if c.Provider == Hetzner {
			running, ip, err = c.hetznerStatus(ctx, id)
		} else {
			running, ip, err = c.doStatus(ctx, id)
		}
		if err != nil {
			return "", err
		}
		if running && ip != "" {
			break
		}
		stage(i18n.T("El proveedor está creando el servidor…"))
		if err := sleep(ctx, c.Poll); err != nil {
			return "", err
		}
	}
	stage(i18n.Sprintf("Esperando a que arranque su SSH (%s)…", ip))
	for {
		d := net.Dialer{Timeout: 5 * time.Second}
		conn, err := d.DialContext(ctx, "tcp", net.JoinHostPort(ip, strconv.Itoa(c.SSHPort)))
		if err == nil {
			conn.Close()
			return ip, nil
		}
		if err := sleep(ctx, c.Poll); err != nil {
			return ip, i18n.Errorf("el servidor %s está creado pero su SSH aún no contesta: prueba la conexión en un minuto", ip)
		}
	}
}

func sleep(ctx context.Context, d time.Duration) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(d):
		return nil
	}
}

// md5Fingerprint: la huella que usan los dos proveedores para las claves (aa:bb:…).
func md5Fingerprint(pk ssh.PublicKey) string {
	sum := md5.Sum(pk.Marshal())
	parts := make([]string, len(sum))
	for i, b := range sum {
		parts[i] = fmt.Sprintf("%02x", b)
	}
	return strings.Join(parts, ":")
}

// ---------------------------------------------------------------- Hetzner

func (c *Client) hetznerCatalog(ctx context.Context) (Catalog, error) {
	var locs struct {
		Locations []struct {
			Name, City, Country, Description string
		} `json:"locations"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/locations", nil, &locs); err != nil {
		return Catalog{}, err
	}
	var types struct {
		ServerTypes []struct {
			Name         string  `json:"name"`
			Cores        int     `json:"cores"`
			Memory       float64 `json:"memory"`
			Disk         int     `json:"disk"`
			Architecture string  `json:"architecture"`
			Deprecated   bool    `json:"deprecated"`
			Prices       []struct {
				Location     string `json:"location"`
				PriceMonthly struct {
					Gross string `json:"gross"`
				} `json:"price_monthly"`
			} `json:"prices"`
		} `json:"server_types"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/server_types?per_page=50", nil, &types); err != nil {
		return Catalog{}, err
	}
	var cat Catalog
	for _, l := range locs.Locations {
		cat.Regions = append(cat.Regions, Option{ID: l.Name, Label: l.City + " (" + l.Country + ")", Detail: l.Name})
	}
	for _, t := range types.ServerTypes {
		if t.Deprecated || t.Architecture != "x86" || len(t.Prices) == 0 {
			continue
		}
		o := Option{ID: t.Name, Currency: "EUR", RAMMB: int(t.Memory * 1024),
			Label: fmt.Sprintf("%s · %d vCPU · %g GB RAM · %d GB", strings.ToUpper(t.Name), t.Cores, t.Memory, t.Disk)}
		for _, p := range t.Prices {
			o.Regions = append(o.Regions, p.Location)
			if v, err := strconv.ParseFloat(p.PriceMonthly.Gross, 64); err == nil && (o.PriceMonth == 0 || v < o.PriceMonth) {
				o.PriceMonth = v
			}
		}
		cat.Sizes = append(cat.Sizes, o)
	}
	return cat, nil
}

func (c *Client) hetznerCreate(ctx context.Context, r CreateRequest, pk ssh.PublicKey) (Created, error) {
	fp := md5Fingerprint(pk)
	var keys struct {
		SSHKeys []struct {
			ID int64 `json:"id"`
		} `json:"ssh_keys"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/ssh_keys?fingerprint="+fp, nil, &keys); err != nil {
		return Created{}, err
	}
	var keyID int64
	if len(keys.SSHKeys) > 0 {
		keyID = keys.SSHKeys[0].ID
	} else {
		var nk struct {
			SSHKey struct {
				ID int64 `json:"id"`
			} `json:"ssh_key"`
		}
		body := map[string]any{"name": "draupnode-" + r.Name + "-" + fp[:11], "public_key": strings.TrimSpace(r.PublicKey)}
		if _, err := c.do(ctx, http.MethodPost, "/ssh_keys", body, &nk); err != nil {
			return Created{}, err
		}
		keyID = nk.SSHKey.ID
	}
	var out struct {
		Server struct {
			ID        int64 `json:"id"`
			PublicNet struct {
				IPv4 struct {
					IP string `json:"ip"`
				} `json:"ipv4"`
			} `json:"public_net"`
		} `json:"server"`
	}
	body := map[string]any{"name": r.Name, "server_type": r.Size, "location": r.Region, "image": "ubuntu-24.04",
		"ssh_keys": []int64{keyID}, "start_after_create": true, "labels": map[string]string{"creado-con": "draupnode"}}
	if _, err := c.do(ctx, http.MethodPost, "/servers", body, &out); err != nil {
		return Created{}, err
	}
	return Created{ID: strconv.FormatInt(out.Server.ID, 10), IP: out.Server.PublicNet.IPv4.IP}, nil
}

func (c *Client) hetznerStatus(ctx context.Context, id string) (bool, string, error) {
	var out struct {
		Server struct {
			Status    string `json:"status"`
			PublicNet struct {
				IPv4 struct {
					IP string `json:"ip"`
				} `json:"ipv4"`
			} `json:"public_net"`
		} `json:"server"`
	}
	code, err := c.do(ctx, http.MethodGet, "/servers/"+id, nil, &out)
	if err != nil {
		return false, "", err
	}
	if code == http.StatusNotFound {
		return false, "", i18n.New("el proveedor ya no tiene ese servidor")
	}
	return out.Server.Status == "running", out.Server.PublicNet.IPv4.IP, nil
}

// ---------------------------------------------------------------- DigitalOcean

func (c *Client) doCatalog(ctx context.Context) (Catalog, error) {
	var regs struct {
		Regions []struct {
			Slug      string `json:"slug"`
			Name      string `json:"name"`
			Available bool   `json:"available"`
		} `json:"regions"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/regions?per_page=200", nil, &regs); err != nil {
		return Catalog{}, err
	}
	var sizes struct {
		Sizes []struct {
			Slug         string   `json:"slug"`
			Memory       int      `json:"memory"`
			VCPUs        int      `json:"vcpus"`
			Disk         int      `json:"disk"`
			PriceMonthly float64  `json:"price_monthly"`
			Available    bool     `json:"available"`
			Regions      []string `json:"regions"`
			Description  string   `json:"description"`
		} `json:"sizes"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/sizes?per_page=200", nil, &sizes); err != nil {
		return Catalog{}, err
	}
	var cat Catalog
	for _, r := range regs.Regions {
		if r.Available {
			cat.Regions = append(cat.Regions, Option{ID: r.Slug, Label: r.Name, Detail: r.Slug})
		}
	}
	for _, s := range sizes.Sizes {
		if !s.Available {
			continue
		}
		cat.Sizes = append(cat.Sizes, Option{ID: s.Slug, Currency: "USD", PriceMonth: s.PriceMonthly, Regions: s.Regions, RAMMB: s.Memory,
			Label: fmt.Sprintf("%s · %d vCPU · %g GB RAM · %d GB", s.Slug, s.VCPUs, float64(s.Memory)/1024, s.Disk)})
	}
	return cat, nil
}

func (c *Client) doCreate(ctx context.Context, r CreateRequest, pk ssh.PublicKey) (Created, error) {
	fp := md5Fingerprint(pk)
	var key struct {
		SSHKey struct {
			ID int64 `json:"id"`
		} `json:"ssh_key"`
	}
	code, err := c.do(ctx, http.MethodGet, "/account/keys/"+fp, nil, &key)
	if err != nil {
		return Created{}, err
	}
	if code == http.StatusNotFound || key.SSHKey.ID == 0 {
		body := map[string]any{"name": "draupnode-" + r.Name + "-" + fp[:11], "public_key": strings.TrimSpace(r.PublicKey)}
		if _, err := c.do(ctx, http.MethodPost, "/account/keys", body, &key); err != nil {
			return Created{}, err
		}
	}
	var out struct {
		Droplet struct {
			ID int64 `json:"id"`
		} `json:"droplet"`
	}
	body := map[string]any{"name": r.Name, "region": r.Region, "size": r.Size, "image": "ubuntu-24-04-x64",
		"ssh_keys": []int64{key.SSHKey.ID}, "tags": []string{"draupnode"}}
	if _, err := c.do(ctx, http.MethodPost, "/droplets", body, &out); err != nil {
		return Created{}, err
	}
	return Created{ID: strconv.FormatInt(out.Droplet.ID, 10)}, nil
}

func (c *Client) doStatus(ctx context.Context, id string) (bool, string, error) {
	var out struct {
		Droplet struct {
			Status   string `json:"status"`
			Networks struct {
				V4 []struct {
					IP   string `json:"ip_address"`
					Type string `json:"type"`
				} `json:"v4"`
			} `json:"networks"`
		} `json:"droplet"`
	}
	code, err := c.do(ctx, http.MethodGet, "/droplets/"+id, nil, &out)
	if err != nil {
		return false, "", err
	}
	if code == http.StatusNotFound {
		return false, "", i18n.New("el proveedor ya no tiene ese servidor")
	}
	ip := ""
	for _, n := range out.Droplet.Networks.V4 {
		if n.Type == "public" {
			ip = n.IP
		}
	}
	return out.Droplet.Status == "active", ip, nil
}
