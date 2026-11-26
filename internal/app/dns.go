package app

import (
	"context"
	"time"

	"draupnode/internal/dnsapi"
	"draupnode/internal/i18n"
)

// Apuntar un dominio al servidor con la API del DNS (Cloudflare o
// DigitalOcean). El token de DigitalOcean es el mismo que el de crear
// servidores; el de Cloudflare se guarda aparte. Los dos, cifrados en la bóveda.

// DNSProvider describe un proveedor de DNS para la interfaz.
type DNSProvider struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	HasToken  bool   `json:"hasToken"`
	TokenURL  string `json:"tokenUrl"`
	TokenHelp string `json:"tokenHelp"`
}

func dnsTokenName(p string) string {
	if p == dnsapi.DigitalOcean {
		return cloudTokenName(p) // el mismo token que para crear servidores
	}
	return "dns:" + p
}

// newDNS: el cliente de la API (se cambia en los tests).
var newDNS = func(p, tok string) (*dnsapi.Client, error) { return dnsapi.New(p, tok) }

// DNSProviders: los proveedores de DNS y si ya tienen token.
func (a *App) DNSProviders() []DNSProvider {
	return []DNSProvider{
		{ID: dnsapi.Cloudflare, Name: "Cloudflare", HasToken: a.vault.Has(dnsTokenName(dnsapi.Cloudflare)), TokenURL: "https://dash.cloudflare.com/profile/api-tokens",
			TokenHelp: i18n.T("En Cloudflare: Mi perfil → API Tokens → Create Token → plantilla «Edit zone DNS», con tu dominio en «Zone Resources».")},
		{ID: dnsapi.DigitalOcean, Name: "DigitalOcean", HasToken: a.vault.Has(dnsTokenName(dnsapi.DigitalOcean)), TokenURL: "https://cloud.digitalocean.com/account/api/tokens",
			TokenHelp: i18n.T("En DigitalOcean: API → Tokens → Generate New Token, con permiso de escritura (o el de «domain»). Es el mismo token que para crear servidores.")},
	}
}

// SetDNSToken comprueba el token y lo guarda cifrado en la bóveda.
func (a *App) SetDNSToken(provider, token string) error {
	c, err := newDNS(provider, token)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := c.Verify(ctx); err != nil {
		return err
	}
	if err := a.vault.Set(dnsTokenName(provider), c.Token); err != nil {
		return vaultErr(err)
	}
	return nil
}

// PointDomainResult dice qué se cambió en el DNS.
type PointDomainResult struct {
	dnsapi.Result
	IP string `json:"ip"`
}

// PointDomain deja el registro A del dominio apuntando a la IP del servidor.
// Solo dominios de la última comprobación de ese servidor.
func (a *App) PointDomain(serverID, domain, provider string) (PointDomainResult, error) {
	srv, err := a.store.Server(serverID)
	if err != nil {
		return PointDomainResult{}, err
	}
	rep, _ := a.loadDomains(serverID)
	known := false
	for _, d := range rep.Domains {
		if d.Domain == domain {
			known = true
		}
	}
	if !known {
		return PointDomainResult{}, i18n.Errorf("%s no es un dominio de este servidor", domain)
	}
	ip, err := hostIP(srv.Host)
	if err != nil {
		return PointDomainResult{}, err
	}
	if !dnsapi.Valid(provider) {
		return PointDomainResult{}, i18n.Errorf("proveedor de DNS desconocido: %s", provider)
	}
	tok, err := a.vault.Get(dnsTokenName(provider))
	if err != nil {
		return PointDomainResult{}, vaultErr(err)
	}
	c, err := newDNS(provider, tok)
	if err != nil {
		return PointDomainResult{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	res, err := c.PointA(ctx, domain, ip)
	return PointDomainResult{Result: res, IP: ip}, err
}
