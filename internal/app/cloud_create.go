package app

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"draupnode/internal/cloudapi"
	"draupnode/internal/i18n"
	"draupnode/internal/sshx"
	"draupnode/internal/store"

	"golang.org/x/crypto/ssh"
)

// Crear servidores en la nube (Hetzner Cloud, DigitalOcean) desde Draupnode.
// El token de la API del proveedor se guarda en la bóveda cifrada.

func cloudTokenName(provider string) string { return "cloud:" + provider }

// CloudProvider es un proveedor con si ya tiene token guardado.
type CloudProvider struct {
	cloudapi.Info
	HasToken bool `json:"hasToken"`
}

// CloudProviders lista los proveedores con los que se puede crear un servidor.
func (a *App) CloudProviders() []CloudProvider {
	var out []CloudProvider
	for _, p := range cloudapi.Providers() {
		out = append(out, CloudProvider{Info: p, HasToken: a.vault.Has(cloudTokenName(p.ID))})
	}
	return out
}

// newCloud: el cliente de la API con el token guardado (o el que se pasa).
var newCloud = func(provider, token string) (*cloudapi.Client, error) { return cloudapi.New(provider, token) }

func (a *App) cloudClient(provider string) (*cloudapi.Client, error) {
	if !cloudapi.Valid(provider) {
		return nil, i18n.Errorf("proveedor desconocido: %s", provider)
	}
	tok, err := a.vault.Get(cloudTokenName(provider))
	if err != nil {
		return nil, vaultErr(err)
	}
	return newCloud(provider, tok)
}

// CloudSetToken comprueba el token (pidiendo el catálogo) y lo guarda cifrado en la bóveda.
func (a *App) CloudSetToken(provider, token string) error {
	c, err := newCloud(provider, token)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := c.Catalog(ctx); err != nil {
		return err
	}
	if err := a.vault.Set(cloudTokenName(provider), strings.TrimSpace(token)); err != nil {
		return vaultErr(err)
	}
	return nil
}

// CloudForgetToken borra el token guardado de un proveedor.
func (a *App) CloudForgetToken(provider string) error {
	if err := a.vault.Delete(cloudTokenName(provider)); err != nil {
		return vaultErr(err)
	}
	return nil
}

// CloudCatalog: regiones y tamaños del proveedor (con su precio al mes).
func (a *App) CloudCatalog(provider string) (cloudapi.Catalog, error) {
	c, err := a.cloudClient(provider)
	if err != nil {
		return cloudapi.Catalog{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	return c.Catalog(ctx)
}

// CloudCreateRequest es lo que se rellena en «Crear en la nube».
type CloudCreateRequest struct {
	Provider string `json:"provider"`
	Name     string `json:"name"`
	Region   string `json:"region"`
	Size     string `json:"size"`
	// KeyPath: clave privada que ya tienes (su .pub se sube al proveedor). Vacío
	// con NewKey: Draupnode crea una solo para este servidor.
	KeyPath    string `json:"keyPath"`
	NewKey     bool   `json:"newKey"`
	Passphrase string `json:"passphrase"`
	// SavePassphrase: guardar la contraseña de la clave (si la tiene).
	SavePassphrase bool `json:"savePassphrase"`
}

// cloudKey devuelve la clave pública (authorized_keys) y si la privada lleva contraseña.
func (a *App) cloudKey(req *CloudCreateRequest) (string, bool, error) {
	if req.NewKey {
		dir := filepath.Join(a.store.Dir(), "claves")
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return "", false, err
		}
		p := filepath.Join(dir, req.Provider+"-"+req.Name)
		if _, err := os.Stat(p); err == nil {
			p += "-" + time.Now().Format("20060102-150405")
		}
		pub, priv, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			return "", false, err
		}
		blk, err := ssh.MarshalPrivateKey(priv, "draupnode "+req.Name)
		if err != nil {
			return "", false, err
		}
		if err := os.WriteFile(p, pem.EncodeToMemory(blk), 0o600); err != nil {
			return "", false, err
		}
		pk, _ := ssh.NewPublicKey(pub)
		line := strings.TrimSpace(string(ssh.MarshalAuthorizedKey(pk))) + " draupnode " + req.Name + "\n"
		if err := os.WriteFile(p+".pub", []byte(line), 0o644); err != nil {
			return "", false, err
		}
		req.KeyPath = p
		return line, false, nil
	}
	if req.KeyPath == "" {
		return "", false, i18n.New("elige la clave SSH con la que entrarás (o que Draupnode cree una)")
	}
	info, _ := sshx.InspectKey(req.KeyPath)
	if raw, err := os.ReadFile(req.KeyPath + ".pub"); err == nil {
		if _, _, _, _, err := ssh.ParseAuthorizedKey(raw); err == nil {
			return string(raw), info.Encrypted, nil
		}
	}
	signer, err := sshx.LoadSigner(req.KeyPath, req.Passphrase)
	if errors.Is(err, sshx.ErrPassphraseNeeded) || errors.Is(err, sshx.ErrBadPassphrase) {
		return "", true, i18n.New("la clave tiene contraseña y no está su .pub al lado: escribe su contraseña")
	}
	if err != nil {
		return "", false, err
	}
	return string(ssh.MarshalAuthorizedKey(signer.PublicKey())), req.Passphrase != "", nil
}

// CloudCreateServer crea el servidor en el proveedor, espera a que arranque y
// lo da de alta en Draupnode (usuario root, la clave elegida). Mientras, manda
// eventos «cloud» con lo que va haciendo. Cuesta dinero en el proveedor.
func (a *App) CloudCreateServer(req CloudCreateRequest) (ServerView, error) {
	stage := func(s string) { a.emit("cloud", map[string]string{"stage": s}) }
	if !cloudapi.ValidName(req.Name) {
		return ServerView{}, i18n.New("el nombre solo puede tener minúsculas, números y guiones (sin empezar ni acabar en guion)")
	}
	c, err := a.cloudClient(req.Provider)
	if err != nil {
		return ServerView{}, err
	}
	stage(i18n.T("Preparando la clave SSH"))
	pub, encrypted, err := a.cloudKey(&req)
	if err != nil {
		return ServerView{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
	defer cancel()
	stage(i18n.T("Pidiendo el servidor al proveedor"))
	cr, err := c.Create(ctx, cloudapi.CreateRequest{Name: req.Name, Region: req.Region, Size: req.Size, PublicKey: pub})
	if err != nil {
		return ServerView{}, err
	}
	ip, err := c.Wait(ctx, cr.ID, stage)
	if ip == "" && err != nil {
		return ServerView{}, err
	}
	name := cloudProviderName(req.Provider)
	srv := store.Server{
		Name: req.Name, Host: ip, Port: 22, User: "root", AuthMethod: store.AuthKey, KeyPath: req.KeyPath, KeyEncrypted: encrypted,
		Notes: i18n.Sprintf("Creado con Draupnode en %s (%s, %s, id %s). Se paga en el proveedor: bórralo allí cuando ya no lo uses.", name, req.Size, req.Region, cr.ID),
	}
	stage(i18n.T("Dando de alta el servidor en Draupnode"))
	view, serr := a.SaveServer(srv, req.Passphrase, encrypted && req.SavePassphrase && req.Passphrase != "", "")
	if serr != nil {
		return view, serr
	}
	// Vinculado con su máquina del proveedor: instantánea antes de aplicar.
	if lerr := a.store.SetServerCloud(view.ID, &store.CloudLink{Provider: req.Provider, ID: cr.ID, Name: req.Name, SnapshotBeforeApply: true, KeepSnapshots: DefaultKeepSnapshots}); lerr == nil {
		if v, verr := a.serverView(view.ID); verr == nil {
			view = v
		}
	}
	return view, err // err: el SSH aún no contestaba (el servidor ya está dado de alta)
}

func cloudProviderName(id string) string {
	for _, p := range cloudapi.Providers() {
		if p.ID == id {
			return p.Name
		}
	}
	return id
}
