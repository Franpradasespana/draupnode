// Package dnsapi apunta un dominio a una IP (registro A) en el DNS del
// proveedor donde está la zona: Cloudflare o DigitalOcean, con el token que da
// el usuario. Busca la zona que contiene el dominio, y crea el registro o
// cambia el que hay.
package dnsapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"draupnode/internal/i18n"
)

// Proveedores.
const (
	Cloudflare   = "cloudflare"
	DigitalOcean = "digitalocean"
)

// Valid: ¿se sabe hablar con este proveedor?
func Valid(p string) bool { return p == Cloudflare || p == DigitalOcean }

// Client habla con la API de DNS de un proveedor.
type Client struct {
	Provider string
	Token    string
	BaseURL  string // vacío = el de verdad (se cambia en los tests)
	HTTP     *http.Client
}

// New crea un cliente.
func New(provider, token string) (*Client, error) {
	if !Valid(provider) {
		return nil, i18n.Errorf("proveedor de DNS desconocido: %s", provider)
	}
	if strings.TrimSpace(token) == "" {
		return nil, i18n.New("falta el token de la API")
	}
	return &Client{Provider: provider, Token: strings.TrimSpace(token), HTTP: &http.Client{Timeout: 30 * time.Second}}, nil
}

func (c *Client) base() string {
	if c.BaseURL != "" {
		return strings.TrimRight(c.BaseURL, "/")
	}
	if c.Provider == Cloudflare {
		return "https://api.cloudflare.com/client/v4"
	}
	return "https://api.digitalocean.com/v2"
}

func (c *Client) do(ctx context.Context, method, path string, body, out any) (int, error) {
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
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode == http.StatusNotFound && method == http.MethodGet {
		return resp.StatusCode, nil
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return resp.StatusCode, i18n.Errorf("el proveedor no acepta el token (%d): comprueba que es correcto y que puede editar el DNS", resp.StatusCode)
	}
	if resp.StatusCode >= 300 {
		return resp.StatusCode, i18n.Errorf("la API respondió %d: %s", resp.StatusCode, apiMessage(raw))
	}
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return resp.StatusCode, i18n.Errorf("respuesta de la API no válida: %v", err)
		}
	}
	return resp.StatusCode, nil
}

func apiMessage(raw []byte) string {
	var e struct {
		Message string `json:"message"`
		Errors  []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	_ = json.Unmarshal(raw, &e)
	if len(e.Errors) > 0 && e.Errors[0].Message != "" {
		return e.Errors[0].Message
	}
	if e.Message != "" {
		return e.Message
	}
	return strings.TrimSpace(string(raw))
}

// Verify comprueba que el token vale (sin cambiar nada).
func (c *Client) Verify(ctx context.Context) error {
	path := "/account"
	if c.Provider == Cloudflare {
		path = "/user/tokens/verify"
	}
	_, err := c.do(ctx, http.MethodGet, path, nil, nil)
	return err
}

// candidates: «a.b.example.com» → [a.b.example.com, b.example.com, example.com].
func candidates(domain string) []string {
	parts := strings.Split(strings.TrimSuffix(strings.ToLower(domain), "."), ".")
	var out []string
	for i := 0; i+1 < len(parts); i++ {
		out = append(out, strings.Join(parts[i:], "."))
	}
	return out
}

// Result dice qué se hizo.
type Result struct {
	Zone   string `json:"zone"`
	Action string `json:"action"` // created | updated | same
	Before string `json:"before,omitempty"`
}

// PointA deja el registro A de domain apuntando a ip.
func (c *Client) PointA(ctx context.Context, domain, ip string) (Result, error) {
	if c.Provider == Cloudflare {
		return c.cfPoint(ctx, domain, ip)
	}
	return c.doPoint(ctx, domain, ip)
}

func (c *Client) cfPoint(ctx context.Context, domain, ip string) (Result, error) {
	var zoneID, zone string
	for _, cand := range candidates(domain) {
		var out struct {
			Result []struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"result"`
		}
		if _, err := c.do(ctx, http.MethodGet, "/zones?name="+url.QueryEscape(cand), nil, &out); err != nil {
			return Result{}, err
		}
		if len(out.Result) > 0 {
			zoneID, zone = out.Result[0].ID, out.Result[0].Name
			break
		}
	}
	if zoneID == "" {
		return Result{}, i18n.Errorf("%s no está en esta cuenta de %s", domain, "Cloudflare")
	}
	var recs struct {
		Result []struct {
			ID      string `json:"id"`
			Content string `json:"content"`
		} `json:"result"`
	}
	if _, err := c.do(ctx, http.MethodGet, fmt.Sprintf("/zones/%s/dns_records?type=A&name=%s", zoneID, url.QueryEscape(domain)), nil, &recs); err != nil {
		return Result{}, err
	}
	if len(recs.Result) > 0 {
		r := recs.Result[0]
		if r.Content == ip {
			return Result{Zone: zone, Action: "same", Before: r.Content}, nil
		}
		_, err := c.do(ctx, http.MethodPatch, fmt.Sprintf("/zones/%s/dns_records/%s", zoneID, r.ID), map[string]any{"content": ip}, nil)
		return Result{Zone: zone, Action: "updated", Before: r.Content}, err
	}
	body := map[string]any{"type": "A", "name": domain, "content": ip, "ttl": 300, "proxied": false, "comment": "Draupnode"}
	_, err := c.do(ctx, http.MethodPost, fmt.Sprintf("/zones/%s/dns_records", zoneID), body, nil)
	return Result{Zone: zone, Action: "created"}, err
}

func (c *Client) doPoint(ctx context.Context, domain, ip string) (Result, error) {
	zone := ""
	for _, cand := range candidates(domain) {
		code, err := c.do(ctx, http.MethodGet, "/domains/"+url.PathEscape(cand), nil, nil)
		if err != nil {
			return Result{}, err
		}
		if code != http.StatusNotFound {
			zone = cand
			break
		}
	}
	if zone == "" {
		return Result{}, i18n.Errorf("%s no está en esta cuenta de %s", domain, "DigitalOcean")
	}
	var recs struct {
		Records []struct {
			ID   json.Number `json:"id"`
			Data string      `json:"data"`
		} `json:"domain_records"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/domains/"+url.PathEscape(zone)+"/records?type=A&name="+url.QueryEscape(domain), nil, &recs); err != nil {
		return Result{}, err
	}
	if len(recs.Records) > 0 {
		r := recs.Records[0]
		if r.Data == ip {
			return Result{Zone: zone, Action: "same", Before: r.Data}, nil
		}
		_, err := c.do(ctx, http.MethodPut, "/domains/"+url.PathEscape(zone)+"/records/"+r.ID.String(), map[string]any{"data": ip}, nil)
		return Result{Zone: zone, Action: "updated", Before: r.Data}, err
	}
	name := "@"
	if domain != zone {
		name = strings.TrimSuffix(domain, "."+zone)
	}
	_, err := c.do(ctx, http.MethodPost, "/domains/"+url.PathEscape(zone)+"/records", map[string]any{"type": "A", "name": name, "data": ip, "ttl": 300}, nil)
	return Result{Zone: zone, Action: "created"}, err
}
