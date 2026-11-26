package app

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"draupnode/internal/i18n"
)

// Dominios vistos desde fuera: desde este equipo (no desde el servidor) se
// mira si el DNS de cada dominio apunta a la IP del servidor, si su web
// responde por HTTPS con un certificado válido (y cuánto le queda) y si
// http:// lleva a https://. No hace falta conectarse por SSH: los dominios
// salen de la última ficha (nginx, Caddy, Coolify) y de los que añadas a mano.

// DomainCheck es lo visto de un dominio.
type DomainCheck struct {
	Domain string `json:"domain"`
	Source string `json:"source"` // nginx | Caddy | Coolify | manual
	// DNS
	IPs        []string `json:"ips"`
	PointsHere bool     `json:"pointsHere"`
	DNSError   string   `json:"dnsError,omitempty"`
	// HTTPS
	Status   int    `json:"status,omitempty"` // código de la respuesta (0 = no respondió)
	TimeMs   int64  `json:"timeMs,omitempty"`
	WebError string `json:"webError,omitempty"`
	// Certificado
	CertDays   *int   `json:"certDays,omitempty"`
	CertIssuer string `json:"certIssuer,omitempty"`
	CertValid  bool   `json:"certValid"`
	CertError  string `json:"certError,omitempty"`
	// http:// → https://
	Redirect   bool `json:"redirect"`
	HTTPStatus int  `json:"httpStatus,omitempty"`
}

// DomainReport es la última comprobación de los dominios de un servidor.
type DomainReport struct {
	At       time.Time     `json:"at"`
	ServerIP string        `json:"serverIp"`
	Domains  []DomainCheck `json:"domains"`
	// Extra: dominios añadidos a mano para vigilarlos.
	Extra []string `json:"extra,omitempty"`
}

// Se cambian en los tests.
var (
	lookupHost      = net.DefaultResolver.LookupHost
	domainHTTPSPort = 443
	domainHTTPPort  = 80
	domainRoots     *x509.CertPool // nil = las del sistema
)

var domainRe = regexp.MustCompile(`^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$`)

// cleanDomain: «https://Tienda.example.com/x» → «tienda.example.com» ("" si no vale).
func cleanDomain(d string) string {
	d = strings.ToLower(strings.TrimSpace(d))
	if strings.Contains(d, "://") {
		if u, err := url.Parse(d); err == nil {
			d = u.Host
		}
	}
	if h, _, err := net.SplitHostPort(d); err == nil {
		d = h
	}
	d = strings.TrimSuffix(strings.SplitN(d, "/", 2)[0], ".")
	if !domainRe.MatchString(d) {
		return ""
	}
	return d
}

func (a *App) domainsPath(serverID string) string {
	if !cacheIDRe.MatchString(serverID) {
		return ""
	}
	return filepath.Join(a.store.Dir(), "dominios", serverID+".json")
}

func (a *App) loadDomains(serverID string) (DomainReport, bool) {
	var r DomainReport
	p := a.domainsPath(serverID)
	if p == "" {
		return r, false
	}
	b, err := os.ReadFile(p)
	return r, err == nil && json.Unmarshal(b, &r) == nil
}

func (a *App) saveDomains(serverID string, r DomainReport) {
	p := a.domainsPath(serverID)
	if p == "" {
		return
	}
	if b, err := json.Marshal(r); err == nil {
		_ = os.MkdirAll(filepath.Dir(p), 0o700)
		if os.WriteFile(p+".tmp", b, 0o600) == nil {
			_ = os.Rename(p+".tmp", p)
		}
	}
}

// LastDomainChecks: la última comprobación de dominios de cada servidor.
func (a *App) LastDomainChecks() map[string]DomainReport {
	out := map[string]DomainReport{}
	for _, s := range a.store.Servers() {
		if r, ok := a.loadDomains(s.ID); ok {
			out[s.ID] = r
		}
	}
	return out
}

// SetExtraDomains guarda los dominios añadidos a mano (y quita los que no valen).
func (a *App) SetExtraDomains(serverID string, domains []string) (DomainReport, error) {
	if _, err := a.store.Server(serverID); err != nil {
		return DomainReport{}, err
	}
	r, _ := a.loadDomains(serverID)
	r.Extra = nil
	for _, d := range domains {
		c := cleanDomain(d)
		if c == "" {
			return r, i18n.Errorf("«%s» no es un dominio válido", strings.TrimSpace(d))
		}
		if !contains(r.Extra, c) {
			r.Extra = append(r.Extra, c)
		}
	}
	if r.Domains == nil {
		r.Domains = []DomainCheck{}
	}
	a.saveDomains(serverID, r)
	return r, nil
}

// serverDomains: los dominios de la última ficha del servidor y los añadidos a mano.
func (a *App) serverDomains(serverID string, extra []string) [][2]string {
	var out [][2]string
	seen := map[string]bool{}
	add := func(d, src string) {
		if c := cleanDomain(d); c != "" && !seen[c] {
			seen[c] = true
			out = append(out, [2]string{c, src})
		}
	}
	if c, ok := a.LastOverviews()[serverID]; ok {
		if sites, ok := c.Overview["sites"].([]any); ok {
			for _, s := range sites {
				m, _ := s.(map[string]any)
				d, _ := m["domain"].(string)
				src, _ := m["server"].(string)
				add(d, src)
			}
		}
		if cf, ok := c.Overview["coolify"].(map[string]any); ok {
			if p, _ := cf["panel"].(string); p != "" {
				add(p, "Coolify")
			}
			apps, _ := cf["apps"].([]any)
			for _, ap := range apps {
				m, _ := ap.(map[string]any)
				urls, _ := m["urls"].([]any)
				for _, u := range urls {
					if s, ok := u.(string); ok {
						add(s, "Coolify")
					}
				}
			}
		}
	}
	for _, d := range extra {
		add(d, "manual")
	}
	return out
}

// CheckDomains mira desde este equipo los dominios de un servidor.
func (a *App) CheckDomains(serverID string) (DomainReport, error) {
	srv, err := a.store.Server(serverID)
	if err != nil {
		return DomainReport{}, err
	}
	prev, _ := a.loadDomains(serverID)
	rep := DomainReport{At: time.Now(), Extra: prev.Extra, Domains: []DomainCheck{}}
	rep.ServerIP, _ = hostIP(srv.Host)
	list := a.serverDomains(serverID, prev.Extra)
	res := make([]DomainCheck, len(list))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)
	for i, d := range list {
		wg.Add(1)
		go func(i int, d, src string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			res[i] = checkDomain(d, src, rep.ServerIP)
		}(i, d[0], d[1])
	}
	wg.Wait()
	rep.Domains = res
	sort.SliceStable(rep.Domains, func(i, j int) bool { return rep.Domains[i].Domain < rep.Domains[j].Domain })
	a.saveDomains(serverID, rep)
	return rep, nil
}

func checkDomain(domain, source, serverIP string) DomainCheck {
	c := DomainCheck{Domain: domain, Source: source, IPs: []string{}}
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	ips, err := lookupHost(ctx, domain)
	cancel()
	if err != nil {
		var dnsErr *net.DNSError
		if errors.As(err, &dnsErr) && dnsErr.IsNotFound {
			c.DNSError = i18n.T("el dominio no existe en el DNS")
		} else {
			c.DNSError = err.Error()
		}
		return c
	}
	sort.Strings(ips)
	c.IPs = ips
	for _, ip := range ips {
		if ip == serverIP {
			c.PointsHere = true
		}
	}
	// Se conecta a la IP resuelta (la del servidor si el dominio tiene varias).
	ip := ips[0]
	if c.PointsHere {
		ip = serverIP
	}
	certInfo(&c, ip)
	webInfo(&c, ip)
	return c
}

// certInfo lee el certificado que da el dominio y si es válido para él.
func certInfo(c *DomainCheck, ip string) {
	d := net.Dialer{Timeout: 8 * time.Second}
	conn, err := tls.DialWithDialer(&d, "tcp", net.JoinHostPort(ip, strconv.Itoa(domainHTTPSPort)), &tls.Config{ServerName: c.Domain, InsecureSkipVerify: true}) // #nosec G402 -- se verifica abajo a mano para poder decir por qué falla
	if err != nil {
		c.CertError = shortNetErr(err)
		return
	}
	defer conn.Close()
	certs := conn.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		c.CertError = i18n.T("no da certificado")
		return
	}
	leaf := certs[0]
	days := int(time.Until(leaf.NotAfter).Hours() / 24)
	c.CertDays = &days
	if len(leaf.Issuer.Organization) > 0 {
		c.CertIssuer = leaf.Issuer.Organization[0]
	} else {
		c.CertIssuer = leaf.Issuer.CommonName
	}
	inter := x509.NewCertPool()
	for _, ic := range certs[1:] {
		inter.AddCert(ic)
	}
	if _, err := leaf.Verify(x509.VerifyOptions{DNSName: c.Domain, Intermediates: inter, Roots: domainRoots}); err != nil {
		c.CertError = certErrText(err)
		return
	}
	c.CertValid = true
}

func certErrText(err error) string {
	var unk x509.UnknownAuthorityError
	var host x509.HostnameError
	var inv x509.CertificateInvalidError
	switch {
	case errors.As(err, &host):
		return i18n.T("el certificado es de otro dominio")
	case errors.As(err, &inv) && inv.Reason == x509.Expired:
		return i18n.T("el certificado ha caducado")
	case errors.As(err, &unk):
		return i18n.T("certificado no reconocido (autofirmado o de una autoridad desconocida)")
	}
	return err.Error()
}

func shortNetErr(err error) string {
	var ne net.Error
	switch {
	case errors.As(err, &ne) && ne.Timeout():
		return i18n.T("no contesta (tiempo agotado)")
	case strings.Contains(err.Error(), "connection refused"):
		return i18n.T("conexión rechazada (nada escucha en ese puerto)")
	}
	return err.Error()
}

// webInfo: ¿responde la web por HTTPS? ¿y http:// lleva a https://?
func webInfo(c *DomainCheck, ip string) {
	noFollow := func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	dialer := &net.Dialer{Timeout: 8 * time.Second}
	tr := &http.Transport{TLSClientConfig: &tls.Config{RootCAs: domainRoots}, DisableKeepAlives: true,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			_, port, _ := net.SplitHostPort(addr)
			return dialer.DialContext(ctx, network, net.JoinHostPort(ip, port))
		}}
	cl := &http.Client{Timeout: 10 * time.Second, CheckRedirect: noFollow, Transport: tr}
	start := time.Now()
	u := "https://" + net.JoinHostPort(c.Domain, strconv.Itoa(domainHTTPSPort)) + "/"
	if domainHTTPSPort == 443 {
		u = "https://" + c.Domain + "/"
	}
	if resp, err := cl.Get(u); err != nil {
		if c.CertError == "" {
			c.WebError = shortNetErr(err)
		} else {
			c.WebError = c.CertError
		}
	} else {
		resp.Body.Close()
		c.Status = resp.StatusCode
		c.TimeMs = time.Since(start).Milliseconds()
	}
	hu := "http://" + net.JoinHostPort(c.Domain, strconv.Itoa(domainHTTPPort)) + "/"
	if domainHTTPPort == 80 {
		hu = "http://" + c.Domain + "/"
	}
	if resp, err := cl.Get(hu); err == nil {
		resp.Body.Close()
		c.HTTPStatus = resp.StatusCode
		loc := resp.Header.Get("Location")
		c.Redirect = resp.StatusCode >= 300 && resp.StatusCode < 400 && strings.HasPrefix(strings.ToLower(loc), "https://")
	}
}
