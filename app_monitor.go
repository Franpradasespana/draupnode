package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"draupnode/internal/store"

	"golang.org/x/crypto/ssh"
)

// Monitorización: Grafana y Prometheus solo escuchan en el servidor
// (127.0.0.1). Draupnode llega a ellos por la conexión SSH: un túnel local
// para abrir Grafana en el navegador y consultas directas a Prometheus para
// el resumen de la página del módulo.

const monitoringModule = "monitoring"

// tunnel es una conexión SSH abierta a un servidor con un puerto local que
// reenvía a un puerto del servidor.
type tunnel struct {
	client *ssh.Client
	ln     net.Listener
	remote string // 127.0.0.1:<puerto> en el servidor
	once   sync.Once
}

func (t *tunnel) url() string { return "http://" + t.ln.Addr().String() + "/" }

func (t *tunnel) close() {
	t.once.Do(func() {
		_ = t.ln.Close()
		_ = t.client.Close()
	})
}

// alive comprueba que la conexión SSH sigue viva.
func (t *tunnel) alive() bool {
	_, _, err := t.client.SendRequest("keepalive@draupnode", true, nil)
	return err == nil
}

func (t *tunnel) serve() {
	for {
		local, err := t.ln.Accept()
		if err != nil {
			return
		}
		go func() {
			defer local.Close()
			remote, err := t.client.Dial("tcp", t.remote)
			if err != nil {
				return
			}
			defer remote.Close()
			done := make(chan struct{}, 2)
			go func() { _, _ = io.Copy(remote, local); done <- struct{}{} }()
			go func() { _, _ = io.Copy(local, remote); done <- struct{}{} }()
			<-done
		}()
	}
}

// MonitorResult es la respuesta de las acciones de monitorización.
type MonitorResult struct {
	RunStart
	URL   string        `json:"url,omitempty"`
	Stats *MonitorStats `json:"stats,omitempty"`
}

// MonitorStats es el resumen rápido del servidor.
type MonitorStats struct {
	CPU        float64       `json:"cpu"`      // % de uso (5 min)
	RAM        float64       `json:"ram"`      // % de uso
	RAMTotal   float64       `json:"ramTotal"` // bytes
	Disk       float64       `json:"disk"`     // % de uso de / (-1 = sin datos)
	DiskFree   float64       `json:"diskFree"` // bytes libres en /
	Load       float64       `json:"load"`     // carga (1 min)
	CPUs       int           `json:"cpus"`
	Uptime     float64       `json:"uptime"`     // segundos
	Containers int           `json:"containers"` // en marcha (-1 = sin cAdvisor)
	Targets    []TargetState `json:"targets"`
	At         time.Time     `json:"at"`
}

// TargetState: si Prometheus llega a cada fuente de métricas.
type TargetState struct {
	Job string `json:"job"`
	Up  bool   `json:"up"`
}

func (a *App) monitorPorts(p store.Project) (grafana, prom int, err error) {
	if !contains(p.InstalledModules, monitoringModule) {
		return 0, 0, errors.New("la monitorización no está instalada en este proyecto: márcala y pulsa Aplicar")
	}
	m, ok := a.cat().Get(monitoringModule)
	if !ok {
		return 0, 0, errors.New("falta el módulo de monitorización")
	}
	v, _ := m.Values(p.InstalledValues[monitoringModule])
	grafana, _ = v["monitoring_grafana_port"].(int)
	prom, _ = v["monitoring_prometheus_port"].(int)
	return grafana, prom, nil
}

// openTunnel devuelve el túnel del proyecto hacia remotePort (lo abre si
// hace falta). Los túneles se reutilizan mientras la conexión siga viva.
func (a *App) openTunnel(p store.Project, key string, remotePort int, secret, accept string) (*tunnel, *RunStart) {
	a.tunMu.Lock()
	t := a.tunnels[p.ID+"|"+key]
	a.tunMu.Unlock()
	if t != nil && t.alive() {
		return t, nil
	}
	if t != nil {
		t.close()
	}
	srv, err := a.store.Server(p.ServerID)
	if err != nil {
		return nil, &RunStart{Status: "error", Message: err.Error()}
	}
	kind := "passphrase"
	if srv.AuthMethod == store.AuthPassword {
		kind = "password"
	}
	secret, st := a.secretFor(srv, secret)
	if st != "" {
		return nil, &RunStart{Status: st, SecretKind: kind}
	}
	ctx, cancel := context.WithTimeout(a.context(), 30*time.Second)
	c, fail := a.connect(ctx, srv, secret, accept)
	cancel()
	if fail != nil {
		return nil, &RunStart{Status: fail.Status, Message: fail.Message, SecretKind: kind, KeyType: fail.KeyType, Fingerprint: fail.Fingerprint}
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0") // solo este equipo
	if err != nil {
		c.Close()
		return nil, &RunStart{Status: "error", Message: err.Error()}
	}
	t = &tunnel{client: c, ln: ln, remote: "127.0.0.1:" + strconv.Itoa(remotePort)}
	go t.serve()
	a.tunMu.Lock()
	a.tunnels[p.ID+"|"+key] = t
	a.tunMu.Unlock()
	return t, nil
}

// OpenGrafana abre (o reutiliza) el túnel a Grafana y devuelve su dirección local.
func (a *App) OpenGrafana(projectID, secret, accept string) MonitorResult {
	p, err := a.store.Project(projectID)
	if err != nil {
		return MonitorResult{RunStart: RunStart{Status: "error", Message: err.Error()}}
	}
	gport, _, err := a.monitorPorts(p)
	if err != nil {
		return MonitorResult{RunStart: RunStart{Status: "error", Message: err.Error()}}
	}
	t, fail := a.openTunnel(p, "grafana", gport, secret, accept)
	if fail != nil {
		return MonitorResult{RunStart: *fail}
	}
	// ¿Responde Grafana al otro lado?
	hc := http.Client{Timeout: 8 * time.Second}
	resp, err := hc.Get(t.url() + "api/health")
	if err != nil {
		return MonitorResult{RunStart: RunStart{Status: "error", Message: "Grafana no responde en el servidor (¿está arrancada?): " + err.Error()}}
	}
	resp.Body.Close()
	return MonitorResult{RunStart: RunStart{Status: "ok"}, URL: t.url()}
}

// MonitorSummary consulta a Prometheus el estado actual del servidor.
func (a *App) MonitorSummary(projectID, secret, accept string) MonitorResult {
	p, err := a.store.Project(projectID)
	if err != nil {
		return MonitorResult{RunStart: RunStart{Status: "error", Message: err.Error()}}
	}
	_, pport, err := a.monitorPorts(p)
	if err != nil {
		return MonitorResult{RunStart: RunStart{Status: "error", Message: err.Error()}}
	}
	t, fail := a.openTunnel(p, "prometheus", pport, secret, accept)
	if fail != nil {
		return MonitorResult{RunStart: *fail}
	}
	st, err := queryStats(t.url())
	if err != nil {
		return MonitorResult{RunStart: RunStart{Status: "error", Message: "Prometheus no responde en el servidor: " + err.Error()}}
	}
	return MonitorResult{RunStart: RunStart{Status: "ok"}, Stats: st}
}

// CloseTunnels cierra los túneles abiertos (al salir de la app).
func (a *App) CloseTunnels() {
	a.tunMu.Lock()
	defer a.tunMu.Unlock()
	for k, t := range a.tunnels {
		t.close()
		delete(a.tunnels, k)
	}
}

type promResp struct {
	Status string `json:"status"`
	Error  string `json:"error"`
	Data   struct {
		Result []struct {
			Metric map[string]string `json:"metric"`
			Value  [2]any            `json:"value"`
		} `json:"result"`
	} `json:"data"`
}

func promQuery(base, q string) (*promResp, error) {
	hc := http.Client{Timeout: 10 * time.Second}
	resp, err := hc.Get(base + "api/v1/query?query=" + url.QueryEscape(q))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var r promResp
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
		return nil, err
	}
	if r.Status != "success" {
		return nil, fmt.Errorf("%s", r.Error)
	}
	return &r, nil
}

func sampleValue(v [2]any) float64 {
	s, _ := v[1].(string)
	f, _ := strconv.ParseFloat(s, 64)
	return f
}

// queryStats hace las consultas del resumen. Si una no tiene datos (p. ej.
// sin cAdvisor), su valor queda a 0 (o -1 para contenedores).
func queryStats(base string) (*MonitorStats, error) {
	st := &MonitorStats{Containers: -1, Targets: []TargetState{}, At: time.Now()}
	one := func(q string) (float64, bool, error) {
		r, err := promQuery(base, q)
		if err != nil {
			return 0, false, err
		}
		if len(r.Data.Result) == 0 {
			return 0, false, nil
		}
		return sampleValue(r.Data.Result[0].Value), true, nil
	}
	root := `mountpoint="/",fstype!="rootfs"`
	st.Disk = -1
	fields := []struct {
		q   string
		dst *float64
	}{
		{`100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`, &st.CPU},
		{`(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100`, &st.RAM},
		{`node_memory_MemTotal_bytes`, &st.RAMTotal},
		{`(1 - node_filesystem_avail_bytes{` + root + `} / node_filesystem_size_bytes{` + root + `}) * 100`, &st.Disk},
		{`node_filesystem_avail_bytes{` + root + `}`, &st.DiskFree},
		{`node_load1`, &st.Load},
		{`time() - node_boot_time_seconds`, &st.Uptime},
	}
	for _, f := range fields {
		v, ok, err := one(f.q)
		if err != nil {
			return nil, err
		}
		if ok {
			*f.dst = v
		}
	}
	if v, ok, _ := one(`count(node_cpu_seconds_total{mode="idle"})`); ok {
		st.CPUs = int(v)
	}
	if v, ok, _ := one(`count(time() - container_last_seen{name!=""} < 60)`); ok {
		st.Containers = int(v)
	} else if _, ok, _ := one(`up{job="cadvisor"}`); ok {
		st.Containers = 0
	}
	if r, err := promQuery(base, `up`); err == nil {
		for _, s := range r.Data.Result {
			st.Targets = append(st.Targets, TargetState{Job: s.Metric["job"], Up: sampleValue(s.Value) == 1})
		}
	}
	return st, nil
}

// OpenAppTunnel abre (o reutiliza) un túnel SSH al puerto local de una app
// (módulos con proxy_site) y devuelve su dirección en este equipo.
func (a *App) OpenAppTunnel(projectID, moduleID, secret, accept string) MonitorResult {
	p, err := a.store.Project(projectID)
	if err != nil {
		return MonitorResult{RunStart: RunStart{Status: "error", Message: err.Error()}}
	}
	m, ok := a.cat().Get(moduleID)
	if !ok || m.ProxySite == nil {
		return MonitorResult{RunStart: RunStart{Status: "error", Message: "este módulo no tiene una app que abrir"}}
	}
	if !contains(p.InstalledModules, moduleID) {
		return MonitorResult{RunStart: RunStart{Status: "error", Message: "aún no está instalado: pulsa Aplicar"}}
	}
	v, _ := m.Values(p.InstalledValues[moduleID])
	port := toInt(v[m.ProxySite.Port])
	if port <= 0 {
		return MonitorResult{RunStart: RunStart{Status: "error", Message: "la app no tiene puerto"}}
	}
	t, st := a.openTunnel(p, "app-"+moduleID, port, secret, accept)
	if st != nil {
		return MonitorResult{RunStart: *st}
	}
	return MonitorResult{RunStart: RunStart{Status: "ok"}, URL: t.url()}
}
