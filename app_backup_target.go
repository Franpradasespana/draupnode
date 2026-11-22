package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"net"
	"strconv"
	"strings"
	"time"

	"draupnode/internal/secrets"
	"draupnode/internal/store"

	"golang.org/x/crypto/bcrypt"
)

// «Guardar también en otro servidor»: prepara un proyecto con el módulo
// «Destino de copias» (rest-server solo-añadir) en otro servidor y deja el
// módulo «Copias» del proyecto de origen apuntando a él. Todo lo secreto se
// genera aquí: la contraseña del usuario de rest-server va a la bóveda del
// origen y al destino solo llega su huella bcrypt; la clave del certificado
// va a la bóveda del destino.

const (
	targetModule      = "backup-target"
	targetProjectName = "Servidor de copias"
)

// BackupTargetResult explica lo que se ha hecho y qué falta.
type BackupTargetResult struct {
	TargetProjectID   string   `json:"targetProjectId"`
	TargetProjectName string   `json:"targetProjectName"`
	TargetIsNew       bool     `json:"targetIsNew"`
	URL               string   `json:"url"`
	Notes             []string `json:"notes"`
}

// CreateBackupTarget configura el destino en targetServerID para el proyecto
// sourceProjectID (que debe tener el módulo de copias).
func (a *App) CreateBackupTarget(sourceProjectID, targetServerID string, port int) (BackupTargetResult, error) {
	var res BackupTargetResult
	src, err := a.store.Project(sourceProjectID)
	if err != nil {
		return res, err
	}
	if projectModule(src, "backups") == nil {
		return res, errors.New("este servidor no tiene el módulo «Copias de seguridad»")
	}
	srcSrv, err := a.store.Server(src.ServerID)
	if err != nil {
		return res, err
	}
	tgtSrv, err := a.store.Server(targetServerID)
	if err != nil {
		return res, err
	}
	if tgtSrv.ID == srcSrv.ID || strings.EqualFold(tgtSrv.Host, srcSrv.Host) {
		return res, errors.New("elige OTRO servidor: si las copias se guardan en el mismo, no te salvan si lo pierdes")
	}
	if port == 0 {
		port = RandomTargetPort()
	}
	if port < 1024 || port > 65535 {
		return res, errors.New("el puerto debe estar entre 1024 y 65535")
	}
	if strings.HasPrefix(tgtSrv.Host, "127.") || tgtSrv.Host == "localhost" || tgtSrv.Host == "::1" {
		return res, errors.New("ese servidor se conecta por " + tgtSrv.Host + ", que el servidor de origen no puede alcanzar: usa su IP o su nombre en la red")
	}
	if a.projectRunning(src.ID) {
		return res, errors.New("hay una tarea en marcha: espera a que termine")
	}
	// La bóveda tiene que estar abierta antes de tocar nada.
	if st := a.vault.Status(); !st.Exists {
		return res, vaultErr(secrets.ErrNoVault)
	} else if !st.Unlocked {
		return res, vaultErr(secrets.ErrLocked)
	}

	// 1. El proyecto destino (uno por servidor).
	// Los módulos del servidor destino; el destino de copias viene de la
	// plantilla «Destino de copias» (se crea si no existe).
	tgt, err := a.ServerModules(tgtSrv.ID)
	if err != nil {
		return res, err
	}
	isNew := projectModule(tgt, targetModule) == nil
	fromRecipe := ""
	if isNew {
		rec, err := a.copiasRecipe()
		if err != nil {
			return res, err
		}
		fromRecipe = rec.ID
		if !contains(tgt.Templates, rec.ID) {
			tgt.Templates = append(tgt.Templates, rec.ID)
		}
	}
	vals := map[string]any{}
	if m := projectModule(tgt, targetModule); m != nil {
		for k, v := range m.Values {
			vals[k] = v
		}
	}
	if !isNew && vals["backup_target_port"] != nil {
		if p := toInt(vals["backup_target_port"]); p > 0 {
			port = p // el destino ya existe: se usa su puerto
		}
	}
	vals["backup_target_port"] = port

	// 2. Certificado (se reutiliza si ya vale para ese servidor).
	certB64, _ := vals["backup_target_tls_cert"].(string)
	if !certValidFor(certB64, tgtSrv.Host) || !a.vault.Has(varName(tgt.ID, "backup_target_tls_key")) {
		cert, key, err := selfSigned(tgtSrv.Host)
		if err != nil {
			return res, err
		}
		if err := vaultErr(a.vault.Set(varName(tgt.ID, "backup_target_tls_key"), key)); err != nil {
			return res, err
		}
		certB64 = cert
		if !isNew {
			res.Notes = append(res.Notes, "Se ha generado un certificado nuevo para el destino: los demás servidores que guardan en él se han actualizado; aplícalos también.")
		}
	}
	vals["backup_target_tls_cert"] = certB64

	// 3. Usuario de este proyecto en el destino.
	slug := slugOf(src)
	pass := randomToken(32)
	hash, err := bcrypt.GenerateFromPassword([]byte(pass), bcrypt.DefaultCost)
	if err != nil {
		return res, err
	}
	clients := []string{}
	for _, c := range toStrings(vals["backup_target_clients"]) {
		if !strings.HasPrefix(c, slug+":") {
			clients = append(clients, c)
		}
	}
	vals["backup_target_clients"] = append(clients, slug+":"+string(hash))

	// 4. Guardar el destino (con el Cortafuegos si hace falta).
	mods := []store.ProjectModule{}
	for _, m := range tgt.Modules {
		if m.ID != targetModule {
			mods = append(mods, m)
		} else if fromRecipe == "" {
			fromRecipe = m.From
		}
	}
	mods = append(mods, store.ProjectModule{ID: targetModule, Values: vals, From: fromRecipe})
	fwNote := a.targetFirewall(tgt.ID, tgtSrv, port, &mods)
	if fwNote != "" {
		res.Notes = append(res.Notes, fwNote)
	}
	tgt.Modules = mods
	if tgt, err = a.SaveProject(tgt); err != nil {
		return res, fmt.Errorf("destino: %w", err)
	}

	// 5. El origen apunta al destino.
	host := tgtSrv.Host
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	res.URL = fmt.Sprintf("https://%s:%d/%s", host, port, slug)
	if err := vaultErr(a.vault.Set(varName(src.ID, "backups_remote_password"), pass)); err != nil {
		return res, err
	}
	for i, m := range src.Modules {
		if m.ID != "backups" {
			continue
		}
		v := map[string]any{}
		for k, x := range m.Values {
			v[k] = x
		}
		v["backups_remote_type"] = "rest-server"
		v["backups_remote"] = res.URL
		v["backups_remote_user"] = slug
		v["backups_remote_cacert"] = certB64
		v["backups_remote_append_only"] = true
		src.Modules[i].Values = v
	}
	if _, err := a.SaveProject(src); err != nil {
		return res, fmt.Errorf("origen: %w", err)
	}
	// Si el certificado cambió, los otros orígenes de este destino también.
	a.refreshTargetClients(tgt.ID, src.ID, res.URL, certB64)

	res.TargetProjectID, res.TargetProjectName, res.TargetIsNew = tgt.ID, tgt.Name, isNew
	res.Notes = append([]string{
		"Aplica primero «" + tgt.Name + "» (en " + tgtSrv.Name + ") y después este servidor.",
	}, res.Notes...)
	return res, nil
}

func projectModule(p store.Project, id string) *store.ProjectModule {
	for i := range p.Modules {
		if p.Modules[i].ID == id {
			return &p.Modules[i]
		}
	}
	return nil
}

func (a *App) findTargetProject(serverID string) (store.Project, bool) {
	for _, p := range a.store.Projects() {
		if p.ServerID == serverID && projectModule(p, targetModule) != nil {
			return p, false
		}
	}
	return store.Project{}, true
}

// targetFirewall abre el puerto: en el Cortafuegos de este proyecto, o en el
// de otro proyecto del mismo servidor si ya lo lleva otro (dos proyectos con
// Cortafuegos en un servidor se pisarían las reglas).
func (a *App) targetFirewall(tgtID string, srv store.Server, port int, mods *[]store.ProjectModule) string {
	ps := strconv.Itoa(port)
	for _, p := range a.store.Projects() {
		if p.ServerID != srv.ID || p.ID == tgtID {
			continue
		}
		if fw := projectModule(p, "firewall"); fw != nil {
			ports := toStrings(fw.Values["firewall_tcp_ports"])
			if contains(ports, ps) {
				return ""
			}
			v := map[string]any{}
			for k, x := range fw.Values {
				v[k] = x
			}
			v["firewall_tcp_ports"] = append(ports, ps)
			fw.Values = v
			if _, err := a.SaveProject(p); err != nil {
				return "Abre el puerto " + ps + " en el Cortafuegos de «" + p.Name + "»: no se pudo añadir solo (" + err.Error() + ")."
			}
			return "Se ha añadido el puerto " + ps + " al Cortafuegos de «" + p.Name + "», que está en el mismo servidor: aplícalo también."
		}
	}
	for i, m := range *mods {
		if m.ID == "firewall" {
			ports := toStrings(m.Values["firewall_tcp_ports"])
			if !contains(ports, ps) {
				v := map[string]any{}
				for k, x := range m.Values {
					v[k] = x
				}
				v["firewall_tcp_ports"] = append(ports, ps)
				(*mods)[i].Values = v
			}
			return ""
		}
	}
	ssh := strconv.Itoa(srv.Port)
	if srv.Port == 0 {
		ssh = "22"
	}
	ports := []string{"22"}
	if ssh != "22" {
		ports = append(ports, ssh)
	}
	*mods = append(*mods, store.ProjectModule{ID: "firewall", Values: map[string]any{"firewall_tcp_ports": append(ports, ps)}})
	return ""
}

// refreshTargetClients pone el certificado actual en los demás proyectos que
// guardan en este destino (si se regeneró).
func (a *App) refreshTargetClients(tgtID, exceptID, url, certB64 string) {
	prefix := url[:strings.LastIndex(url, "/")+1]
	for _, p := range a.store.Projects() {
		if p.ID == exceptID || p.ID == tgtID {
			continue
		}
		b := projectModule(p, "backups")
		if b == nil {
			continue
		}
		r, _ := b.Values["backups_remote"].(string)
		c, _ := b.Values["backups_remote_cacert"].(string)
		if !strings.HasPrefix(r, prefix) || c == certB64 {
			continue
		}
		v := map[string]any{}
		for k, x := range b.Values {
			v[k] = x
		}
		v["backups_remote_cacert"] = certB64
		b.Values = v
		_, _ = a.SaveProject(p)
	}
}

func toStrings(v any) []string {
	switch l := v.(type) {
	case []string:
		return append([]string{}, l...)
	case []any:
		out := make([]string, 0, len(l))
		for _, x := range l {
			if s, ok := x.(string); ok {
				out = append(out, s)
			} else {
				out = append(out, fmt.Sprint(x))
			}
		}
		return out
	}
	return []string{}
}

const tokenChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

func randomToken(n int) string {
	b := make([]byte, n)
	max := big.NewInt(int64(len(tokenChars)))
	for i := range b {
		r, err := rand.Int(rand.Reader, max)
		if err != nil {
			panic(err)
		}
		b[i] = tokenChars[r.Int64()]
	}
	return string(b)
}

// selfSigned crea un certificado propio (20 años) para host. Devuelve el
// certificado y la clave en PEM, en base64.
func selfSigned(host string) (string, string, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return "", "", err
	}
	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 120))
	tpl := x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: host, Organization: []string{"Draupnode · destino de copias"}},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().AddDate(20, 0, 0),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		// Es su propia autoridad: restic lo recibe con --cacert.
		IsCA:                  true,
		BasicConstraintsValid: true,
	}
	if ip := net.ParseIP(host); ip != nil {
		tpl.IPAddresses = []net.IP{ip}
	} else {
		tpl.DNSNames = []string{host}
	}
	der, err := x509.CreateCertificate(rand.Reader, &tpl, &tpl, &key.PublicKey, key)
	if err != nil {
		return "", "", err
	}
	kd, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return "", "", err
	}
	c := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	k := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: kd})
	return base64.StdEncoding.EncodeToString(c), base64.StdEncoding.EncodeToString(k), nil
}

// certValidFor: el certificado (PEM en base64) vale para host y no caduca en un año.
func certValidFor(b64, host string) bool {
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return false
	}
	blk, _ := pem.Decode(raw)
	if blk == nil {
		return false
	}
	c, err := x509.ParseCertificate(blk.Bytes)
	if err != nil {
		return false
	}
	return c.VerifyHostname(host) == nil && time.Now().AddDate(1, 0, 0).Before(c.NotAfter)
}

// Puertos al azar para el destino: un puerto poco común es una pequeña
// barrera más (los robots prueban los conocidos); el que manda es la contraseña.
const (
	targetPortMin = 20000
	targetPortMax = 60999
)

// RandomTargetPort devuelve un puerto al azar para el destino de copias.
func RandomTargetPort() int {
	n, err := rand.Int(rand.Reader, big.NewInt(targetPortMax-targetPortMin+1))
	if err != nil {
		return 28000
	}
	return targetPortMin + int(n.Int64())
}

// managedSecret calcula al Aplicar los datos secretos que rellena Draupnode.
// backup_target_keys: «proyecto:contraseña de sus copias» de cada proyecto
// que guarda en este destino y cuya contraseña ya está en la bóveda (llega al
// aplicar el proyecto de origen). Con ella el destino puede borrar copias
// viejas (rotación).
func (a *App) managedSecret(name string, vals map[string]any) string {
	if name != "backup_target_keys" {
		return ""
	}
	if on, ok := vals["backup_target_prune"].(bool); ok && !on {
		return "" // sin rotación, la contraseña no sale de aquí
	}
	bySlug := map[string]string{}
	for _, p := range a.store.Projects() {
		bySlug[slugOf(p)] = p.ID
	}
	var lines []string
	for _, c := range toStrings(vals["backup_target_clients"]) {
		slug, _, _ := strings.Cut(c, ":")
		id, ok := bySlug[slug]
		if !ok {
			continue
		}
		if pw, err := a.vault.Get(genName(id, "restic")); err == nil && pw != "" {
			lines = append(lines, slug+":"+strings.TrimSpace(pw))
		}
	}
	return strings.Join(lines, "\n")
}

// copiasRecipe: la receta «Servidor de copias» (la crea si no existe).
func (a *App) copiasRecipe() (store.Recipe, error) {
	for _, r := range a.store.Recipes() {
		for _, m := range r.Modules {
			if m.ID == targetModule {
				return r, nil
			}
		}
	}
	return a.SaveRecipe(store.Recipe{Name: targetProjectName, Notes: "Recibe las copias de otros servidores (solo añadir) y borra las viejas.",
		Modules: []store.ProjectModule{{ID: "firewall", Values: map[string]any{}}, {ID: targetModule, Values: map[string]any{}}}})
}
