package cloudapi

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"draupnode/internal/i18n"
)

// Instantáneas (snapshots) del disco entero de un servidor: se hacen antes de
// aplicar para poder volver atrás si algo sale mal. Las de Draupnode se llaman
// «draupnode-…»; las demás (hechas a mano en el proveedor) se ven pero no se
// borran solas.

// SnapshotPrefix: nombre de las instantáneas que hace Draupnode.
const SnapshotPrefix = "draupnode-"

// Machine es un servidor en el proveedor.
type Machine struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	IP   string `json:"ip"`
}

// Snapshot es una instantánea de un servidor.
type Snapshot struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Created   time.Time `json:"created"`
	SizeGB    float64   `json:"sizeGb"`
	Draupnode bool      `json:"draupnode"`
}

// SnapshotPrice: lo que cuesta guardar 1 GB de instantánea al mes (aprox., sin impuestos).
func SnapshotPrice(provider string) (float64, string) {
	if provider == Hetzner {
		return 0.0119, "EUR"
	}
	return 0.06, "USD"
}

// FindByIP busca el servidor del proveedor que tiene esa IP pública.
func (c *Client) FindByIP(ctx context.Context, ip string) (Machine, error) {
	ip = strings.TrimSpace(ip)
	var all []Machine
	var err error
	if c.Provider == Hetzner {
		all, err = c.hetznerMachines(ctx)
	} else {
		all, err = c.doMachines(ctx)
	}
	if err != nil {
		return Machine{}, err
	}
	for _, m := range all {
		if m.IP == ip {
			return m, nil
		}
	}
	return Machine{}, i18n.Errorf("no hay ningún servidor con la IP %s en esta cuenta", ip)
}

// Snapshots: las instantáneas de un servidor, las más nuevas primero.
func (c *Client) Snapshots(ctx context.Context, serverID string) ([]Snapshot, error) {
	var out []Snapshot
	var err error
	if c.Provider == Hetzner {
		out, err = c.hetznerSnapshots(ctx, serverID)
	} else {
		out, err = c.doSnapshots(ctx, serverID)
	}
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].Draupnode = strings.HasPrefix(out[i].Name, SnapshotPrefix)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Created.After(out[j].Created) })
	return out, nil
}

// TakeSnapshot hace una instantánea y espera a que termine (varios minutos).
func (c *Client) TakeSnapshot(ctx context.Context, serverID, name string, stage func(string)) error {
	var action string
	var err error
	if c.Provider == Hetzner {
		var out struct {
			Action struct {
				ID json.Number `json:"id"`
			} `json:"action"`
		}
		body := map[string]any{"type": "snapshot", "description": name, "labels": map[string]string{"draupnode": "si"}}
		_, err = c.do(ctx, http.MethodPost, "/servers/"+serverID+"/actions/create_image", body, &out)
		action = out.Action.ID.String()
	} else {
		action, err = c.doDropletAction(ctx, serverID, map[string]any{"type": "snapshot", "name": name})
	}
	if err != nil {
		return err
	}
	return c.waitAction(ctx, action, stage, i18n.T("Haciendo la instantánea"))
}

// RestoreSnapshot vuelve el disco del servidor a una instantánea: lo que haya
// ahora en el disco se pierde. Espera a que termine.
func (c *Client) RestoreSnapshot(ctx context.Context, serverID, snapshotID string, stage func(string)) error {
	var action string
	var err error
	if c.Provider == Hetzner {
		var out struct {
			Action struct {
				ID json.Number `json:"id"`
			} `json:"action"`
		}
		_, err = c.do(ctx, http.MethodPost, "/servers/"+serverID+"/actions/rebuild", map[string]any{"image": snapshotID}, &out)
		action = out.Action.ID.String()
	} else {
		id, cerr := strconv.ParseInt(snapshotID, 10, 64)
		if cerr != nil {
			return i18n.Errorf("instantánea no válida: %s", snapshotID)
		}
		action, err = c.doDropletAction(ctx, serverID, map[string]any{"type": "restore", "image": id})
	}
	if err != nil {
		return err
	}
	return c.waitAction(ctx, action, stage, i18n.T("Volviendo a la instantánea"))
}

// DeleteSnapshot borra una instantánea.
func (c *Client) DeleteSnapshot(ctx context.Context, snapshotID string) error {
	path := "/snapshots/" + snapshotID
	if c.Provider == Hetzner {
		path = "/images/" + snapshotID
	}
	_, err := c.do(ctx, http.MethodDelete, path, nil, nil)
	return err
}

// waitAction espera a que una acción del proveedor termine.
func (c *Client) waitAction(ctx context.Context, id string, stage func(string), what string) error {
	if id == "" {
		return i18n.New("el proveedor no devolvió la acción")
	}
	start := time.Now()
	for {
		var status, msg string
		var progress int
		if c.Provider == Hetzner {
			var out struct {
				Action struct {
					Status   string `json:"status"`
					Progress int    `json:"progress"`
					Error    *struct {
						Message string `json:"message"`
					} `json:"error"`
				} `json:"action"`
			}
			if code, err := c.do(ctx, http.MethodGet, "/actions/"+id, nil, &out); err != nil || code == http.StatusNotFound {
				return actionErr(err)
			}
			status, progress = out.Action.Status, out.Action.Progress
			if out.Action.Error != nil {
				msg = out.Action.Error.Message
			}
			if status == "success" {
				return nil
			}
		} else {
			var out struct {
				Action struct {
					Status string `json:"status"`
				} `json:"action"`
			}
			if code, err := c.do(ctx, http.MethodGet, "/actions/"+id, nil, &out); err != nil || code == http.StatusNotFound {
				return actionErr(err)
			}
			status = out.Action.Status
			if status == "completed" {
				return nil
			}
		}
		if status == "error" || status == "errored" {
			if msg == "" {
				msg = status
			}
			return i18n.Errorf("el proveedor dice que falló: %s", msg)
		}
		el := time.Since(start).Round(time.Second)
		if progress > 0 {
			stage(i18n.Sprintf("%s en el proveedor (%d %%, %s)…", what, progress, el))
		} else {
			stage(i18n.Sprintf("%s en el proveedor (%s)…", what, el))
		}
		if err := sleep(ctx, c.Poll); err != nil {
			return err
		}
	}
}

func actionErr(err error) error {
	if err != nil {
		return err
	}
	return i18n.New("el proveedor ya no encuentra la acción")
}

// ---- Hetzner

func (c *Client) hetznerMachines(ctx context.Context) ([]Machine, error) {
	var all []Machine
	for page := 1; page <= 20; page++ {
		var out struct {
			Servers []struct {
				ID        json.Number `json:"id"`
				Name      string      `json:"name"`
				PublicNet struct {
					IPv4 struct {
						IP string `json:"ip"`
					} `json:"ipv4"`
				} `json:"public_net"`
			} `json:"servers"`
			Meta struct {
				Pagination struct {
					NextPage *int `json:"next_page"`
				} `json:"pagination"`
			} `json:"meta"`
		}
		if _, err := c.do(ctx, http.MethodGet, "/servers?per_page=50&page="+strconv.Itoa(page), nil, &out); err != nil {
			return nil, err
		}
		for _, s := range out.Servers {
			all = append(all, Machine{ID: s.ID.String(), Name: s.Name, IP: s.PublicNet.IPv4.IP})
		}
		if out.Meta.Pagination.NextPage == nil {
			break
		}
	}
	return all, nil
}

func (c *Client) hetznerSnapshots(ctx context.Context, serverID string) ([]Snapshot, error) {
	var res []Snapshot
	for page := 1; page <= 20; page++ {
		var out struct {
			Images []struct {
				ID          json.Number `json:"id"`
				Description string      `json:"description"`
				Created     time.Time   `json:"created"`
				ImageSize   *float64    `json:"image_size"`
				DiskSize    float64     `json:"disk_size"`
				CreatedFrom *struct {
					ID json.Number `json:"id"`
				} `json:"created_from"`
			} `json:"images"`
			Meta struct {
				Pagination struct {
					NextPage *int `json:"next_page"`
				} `json:"pagination"`
			} `json:"meta"`
		}
		if _, err := c.do(ctx, http.MethodGet, "/images?type=snapshot&per_page=50&page="+strconv.Itoa(page), nil, &out); err != nil {
			return nil, err
		}
		for _, im := range out.Images {
			if im.CreatedFrom == nil || im.CreatedFrom.ID.String() != serverID {
				continue
			}
			s := Snapshot{ID: im.ID.String(), Name: im.Description, Created: im.Created}
			if im.ImageSize != nil {
				s.SizeGB = *im.ImageSize
			}
			res = append(res, s)
		}
		if out.Meta.Pagination.NextPage == nil {
			break
		}
	}
	return res, nil
}

// ---- DigitalOcean

func (c *Client) doMachines(ctx context.Context) ([]Machine, error) {
	var all []Machine
	for page := 1; page <= 20; page++ {
		var out struct {
			Droplets []struct {
				ID       json.Number `json:"id"`
				Name     string      `json:"name"`
				Networks struct {
					V4 []struct {
						IP   string `json:"ip_address"`
						Type string `json:"type"`
					} `json:"v4"`
				} `json:"networks"`
			} `json:"droplets"`
			Links struct {
				Pages struct {
					Next string `json:"next"`
				} `json:"pages"`
			} `json:"links"`
		}
		if _, err := c.do(ctx, http.MethodGet, "/droplets?per_page=200&page="+strconv.Itoa(page), nil, &out); err != nil {
			return nil, err
		}
		for _, d := range out.Droplets {
			m := Machine{ID: d.ID.String(), Name: d.Name}
			for _, n := range d.Networks.V4 {
				if n.Type == "public" {
					m.IP = n.IP
				}
			}
			all = append(all, m)
		}
		if out.Links.Pages.Next == "" {
			break
		}
	}
	return all, nil
}

func (c *Client) doSnapshots(ctx context.Context, serverID string) ([]Snapshot, error) {
	var out struct {
		Snapshots []struct {
			ID        json.Number `json:"id"`
			Name      string      `json:"name"`
			CreatedAt time.Time   `json:"created_at"`
			Size      float64     `json:"size_gigabytes"`
		} `json:"snapshots"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/droplets/"+serverID+"/snapshots?per_page=100", nil, &out); err != nil {
		return nil, err
	}
	var res []Snapshot
	for _, s := range out.Snapshots {
		res = append(res, Snapshot{ID: s.ID.String(), Name: s.Name, Created: s.CreatedAt, SizeGB: s.Size})
	}
	return res, nil
}

func (c *Client) doDropletAction(ctx context.Context, serverID string, body map[string]any) (string, error) {
	var out struct {
		Action struct {
			ID json.Number `json:"id"`
		} `json:"action"`
	}
	if _, err := c.do(ctx, http.MethodPost, "/droplets/"+serverID+"/actions", body, &out); err != nil {
		return "", err
	}
	return out.Action.ID.String(), nil
}
