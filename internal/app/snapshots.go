package app

import (
	"context"
	"net"
	"strings"
	"time"

	"draupnode/internal/cloudapi"
	"draupnode/internal/i18n"
	"draupnode/internal/store"
)

// Instantáneas del servidor en su proveedor (Hetzner, DigitalOcean): una copia
// del disco entero que se hace antes de aplicar, para volver atrás si algo
// sale mal. El servidor tiene que estar vinculado con su máquina del proveedor
// (los creados con Draupnode lo están; los demás se buscan por su IP).

// DefaultKeepSnapshots: cuántas instantáneas de Draupnode se guardan por servidor.
const DefaultKeepSnapshots = 3

// SnapshotInfo es lo que enseña la ficha.
type SnapshotInfo struct {
	Snapshots  []cloudapi.Snapshot `json:"snapshots"`
	PricePerGB float64             `json:"pricePerGb"`
	Currency   string              `json:"currency"`
}

func (a *App) serverCloud(serverID string) (store.Server, *cloudapi.Client, error) {
	srv, err := a.store.Server(serverID)
	if err != nil {
		return srv, nil, err
	}
	if srv.Cloud == nil {
		return srv, nil, i18n.New("este servidor no está vinculado con su proveedor de nube")
	}
	c, err := a.cloudClient(srv.Cloud.Provider)
	return srv, c, err
}

// hostIP: la IP del servidor (si se dio de alta con un nombre, se resuelve).
func hostIP(host string) (string, error) {
	host = strings.Trim(strings.TrimSpace(host), "[]")
	if net.ParseIP(host) != nil {
		return host, nil
	}
	ips, err := net.LookupHost(host)
	if err != nil || len(ips) == 0 {
		return "", i18n.Errorf("no se pudo averiguar la IP de %s", host)
	}
	for _, ip := range ips {
		if net.ParseIP(ip).To4() != nil {
			return ip, nil
		}
	}
	return ips[0], nil
}

// LinkServerCloud busca el servidor (por su IP) en la cuenta del proveedor y lo
// vincula. Activa la instantánea antes de aplicar.
func (a *App) LinkServerCloud(serverID, provider string) (ServerView, error) {
	srv, err := a.store.Server(serverID)
	if err != nil {
		return ServerView{}, err
	}
	c, err := a.cloudClient(provider)
	if err != nil {
		return ServerView{}, err
	}
	ip, err := hostIP(srv.Host)
	if err != nil {
		return ServerView{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	m, err := c.FindByIP(ctx, ip)
	if err != nil {
		return ServerView{}, err
	}
	link := &store.CloudLink{Provider: provider, ID: m.ID, Name: m.Name, SnapshotBeforeApply: true, KeepSnapshots: DefaultKeepSnapshots}
	if err := a.store.SetServerCloud(serverID, link); err != nil {
		return ServerView{}, err
	}
	return a.serverView(serverID)
}

// UnlinkServerCloud quita el vínculo (no toca nada en el proveedor).
func (a *App) UnlinkServerCloud(serverID string) (ServerView, error) {
	if err := a.store.SetServerCloud(serverID, nil); err != nil {
		return ServerView{}, err
	}
	return a.serverView(serverID)
}

// SetSnapshotOptions: instantánea antes de aplicar (sí/no) y cuántas guardar.
func (a *App) SetSnapshotOptions(serverID string, before bool, keep int) (ServerView, error) {
	srv, err := a.store.Server(serverID)
	if err != nil {
		return ServerView{}, err
	}
	if srv.Cloud == nil {
		return ServerView{}, i18n.New("este servidor no está vinculado con su proveedor de nube")
	}
	if keep < 1 || keep > 20 {
		return ServerView{}, i18n.New("guarda entre 1 y 20 instantáneas")
	}
	link := *srv.Cloud
	link.SnapshotBeforeApply, link.KeepSnapshots = before, keep
	if err := a.store.SetServerCloud(serverID, &link); err != nil {
		return ServerView{}, err
	}
	return a.serverView(serverID)
}

// ServerSnapshots lista las instantáneas del servidor en el proveedor.
func (a *App) ServerSnapshots(serverID string) (SnapshotInfo, error) {
	srv, c, err := a.serverCloud(serverID)
	if err != nil {
		return SnapshotInfo{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	snaps, err := c.Snapshots(ctx, srv.Cloud.ID)
	if err != nil {
		return SnapshotInfo{}, err
	}
	if snaps == nil {
		snaps = []cloudapi.Snapshot{}
	}
	price, cur := cloudapi.SnapshotPrice(srv.Cloud.Provider)
	return SnapshotInfo{Snapshots: snaps, PricePerGB: price, Currency: cur}, nil
}

// snapshotName: «draupnode-<servidor>-AAAAMMDD-HHMMSS».
func snapshotName(srv store.Server, now time.Time) string {
	base := srv.Name
	if srv.Cloud != nil && srv.Cloud.Name != "" {
		base = srv.Cloud.Name
	}
	var b strings.Builder
	for _, r := range strings.ToLower(base) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case b.Len() > 0 && !strings.HasSuffix(b.String(), "-"):
			b.WriteByte('-')
		}
	}
	name := strings.Trim(b.String(), "-")
	if len(name) > 40 {
		name = strings.Trim(name[:40], "-")
	}
	if name == "" {
		name = "servidor"
	}
	return cloudapi.SnapshotPrefix + name + "-" + now.Format("20060102-150405")
}

// takeSnapshot hace una instantánea y borra las de Draupnode que sobren.
// Devuelve un aviso si no pudo borrar las viejas (la instantánea sí está hecha).
func (a *App) takeSnapshot(ctx context.Context, srv store.Server, stage func(string)) (string, error) {
	c, err := a.cloudClient(srv.Cloud.Provider)
	if err != nil {
		return "", err
	}
	if err := c.TakeSnapshot(ctx, srv.Cloud.ID, snapshotName(srv, time.Now()), stage); err != nil {
		return "", err
	}
	keep := srv.Cloud.KeepSnapshots
	if keep < 1 {
		keep = DefaultKeepSnapshots
	}
	snaps, err := c.Snapshots(ctx, srv.Cloud.ID)
	if err != nil {
		return i18n.T("No se pudieron borrar las instantáneas viejas: ") + err.Error(), nil
	}
	n := 0
	for _, s := range snaps { // las más nuevas primero
		if !s.Draupnode {
			continue
		}
		n++
		if n > keep {
			if err := c.DeleteSnapshot(ctx, s.ID); err != nil {
				return i18n.T("No se pudieron borrar las instantáneas viejas: ") + err.Error(), nil
			}
		}
	}
	return "", nil
}

// TakeServerSnapshot hace una instantánea ahora (evento «snapshot» con lo que va pasando).
func (a *App) TakeServerSnapshot(serverID string) (string, error) {
	srv, _, err := a.serverCloud(serverID)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Minute)
	defer cancel()
	return a.takeSnapshot(ctx, srv, func(s string) { a.emit("snapshot", map[string]string{"serverId": serverID, "stage": s}) })
}

// RestoreServerSnapshot vuelve el disco entero del servidor a una instantánea.
// Lo que haya cambiado desde entonces se pierde.
func (a *App) RestoreServerSnapshot(serverID, snapshotID string) error {
	srv, c, err := a.serverCloud(serverID)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Minute)
	defer cancel()
	if !a.ownSnapshot(ctx, c, srv, snapshotID) {
		return i18n.New("esa instantánea no es de este servidor")
	}
	if p, ok := a.store.ServerProject(serverID); ok && a.projectRunning(p.ID) {
		return i18n.New("ya hay una tarea en marcha en este servidor")
	}
	if err := c.RestoreSnapshot(ctx, srv.Cloud.ID, snapshotID, func(s string) {
		a.emit("snapshot", map[string]string{"serverId": serverID, "stage": s})
	}); err != nil {
		return err
	}
	// Lo que se sabía del servidor ya no vale.
	a.forgetOverview(serverID)
	return nil
}

// DeleteServerSnapshot borra una instantánea del servidor.
func (a *App) DeleteServerSnapshot(serverID, snapshotID string) error {
	srv, c, err := a.serverCloud(serverID)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	if !a.ownSnapshot(ctx, c, srv, snapshotID) {
		return i18n.New("esa instantánea no es de este servidor")
	}
	return c.DeleteSnapshot(ctx, snapshotID)
}

func (a *App) ownSnapshot(ctx context.Context, c *cloudapi.Client, srv store.Server, id string) bool {
	snaps, err := c.Snapshots(ctx, srv.Cloud.ID)
	if err != nil {
		return false
	}
	for _, s := range snaps {
		if s.ID == id {
			return true
		}
	}
	return false
}

// snapshotBeforeRun: ¿hay que hacer instantánea antes de esta ejecución?
func snapshotBeforeRun(srv store.Server, mode runMode) bool {
	return !mode.check && srv.Cloud != nil && srv.Cloud.SnapshotBeforeApply
}

func (a *App) serverView(id string) (ServerView, error) {
	srv, err := a.store.Server(id)
	if err != nil {
		return ServerView{}, err
	}
	return a.view(srv), nil
}
