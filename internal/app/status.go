package app

import (
	"context"
	"crypto/tls"
	"draupnode/internal/i18n"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"draupnode/internal/lab"
	"draupnode/internal/store"
)

// ServerLive es lo que muestra la barra de estado de un servidor: si su SSH
// responde ahora mismo y si tiene alguna web que abrir (Coolify u otra).
type ServerLive struct {
	Reachable bool   `json:"reachable"`
	LatencyMs int    `json:"latencyMs"`
	Error     string `json:"error,omitempty"`
	WebURL    string `json:"webUrl,omitempty"`
	WebLabel  string `json:"webLabel,omitempty"`
}

type webCandidate struct{ url, label string }

// ServerLive comprueba (sin autenticarse) si el puerto SSH del servidor
// responde y busca una web en él.
func (a *App) ServerLive(id string) (ServerLive, error) {
	srv, err := a.store.Server(id)
	if err != nil {
		return ServerLive{}, err
	}
	ctx, cancel := context.WithTimeout(a.context(), 4*time.Second)
	defer cancel()

	var live ServerLive
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		start := time.Now()
		var d net.Dialer
		c, err := d.DialContext(ctx, "tcp", net.JoinHostPort(srv.Host, strconv.Itoa(srv.Port)))
		if err != nil {
			live.Error = i18n.T("no responde")
			return
		}
		c.Close()
		live.Reachable = true
		live.LatencyMs = int(time.Since(start).Milliseconds())
	}()

	var cands []webCandidate
	if isLabServer(srv) {
		cands = []webCandidate{{fmt.Sprintf("http://%s:%d", lab.Host, lab.CoolifyPort), "Coolify"}}
	} else {
		h := srv.Host
		if net.ParseIP(h) != nil && net.ParseIP(h).To4() == nil {
			h = "[" + h + "]"
		}
		cands = []webCandidate{
			{"http://" + h + ":8000", "Coolify"},
			{"https://" + h, "Web"},
			{"http://" + h, "Web"},
		}
	}
	if w, ok := firstWeb(ctx, cands); ok {
		live.WebURL, live.WebLabel = w.url, w.label
	}
	wg.Wait()
	return live, nil
}

// webResponds dice si en esa dirección contesta un servidor web (con
// cualquier código; un certificado autofirmado también cuenta).
func webResponds(ctx context.Context, url string) bool {
	client := &http.Client{
		Timeout: 3 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, // solo para detectar, no se envía nada
		},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false
	}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return true
}

// firstWeb prueba todas a la vez y devuelve la primera de la lista que responde.
func firstWeb(ctx context.Context, cands []webCandidate) (webCandidate, bool) {
	ok := make([]bool, len(cands))
	var wg sync.WaitGroup
	for i, c := range cands {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ok[i] = webResponds(ctx, c.url)
		}()
	}
	wg.Wait()
	for i, c := range cands {
		if ok[i] {
			return c, true
		}
	}
	return webCandidate{}, false
}

// coolifyURLFor es donde se ve el panel de Coolify de un servidor desde este
// equipo: en el servidor de pruebas el 8000 del contenedor se publica en otro puerto.
func coolifyURLFor(srv store.Server) string {
	if isLabServer(srv) {
		return fmt.Sprintf("http://%s:%d", lab.Host, lab.CoolifyPort)
	}
	return ""
}

func isLabServer(srv store.Server) bool { return srv.Host == lab.Host && srv.Port == lab.SSHPort }

// ServerPing: si el SSH de un servidor responde (para los avisos).
type ServerPing struct {
	ID        string `json:"id"`
	Reachable bool   `json:"reachable"`
	LatencyMs int    `json:"latencyMs"`
	Lab       bool   `json:"lab"` // el servidor de pruebas de este equipo (puede estar parado a propósito)
}

// PingServers comprueba a la vez (sin autenticarse) todos los servidores.
func (a *App) PingServers() []ServerPing {
	srvs := a.store.Servers()
	out := make([]ServerPing, len(srvs))
	var wg sync.WaitGroup
	for i, s := range srvs {
		wg.Add(1)
		go func(i int, s store.Server) {
			defer wg.Done()
			out[i] = ServerPing{ID: s.ID, Lab: isLabServer(s)}
			ctx, cancel := context.WithTimeout(a.context(), 6*time.Second)
			defer cancel()
			start := time.Now()
			var d net.Dialer
			if c, err := d.DialContext(ctx, "tcp", net.JoinHostPort(s.Host, strconv.Itoa(s.Port))); err == nil {
				c.Close()
				out[i].Reachable = true
				out[i].LatencyMs = int(time.Since(start).Milliseconds())
			}
		}(i, s)
	}
	wg.Wait()
	return out
}
