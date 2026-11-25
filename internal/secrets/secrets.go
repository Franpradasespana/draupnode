// Package secrets guarda contraseñas y frases de paso. Hay dos almacenes:
//
//   - El llavero del sistema operativo, si existe: Llavero (macOS),
//     Administrador de credenciales (Windows) o Secret Service (Linux:
//     GNOME Keyring, KWallet, KeePassXC...).
//   - La bóveda cifrada de Draupnode (vault.go), que funciona en cualquier
//     sistema y está protegida con una contraseña maestra.
//
// Nunca se escriben secretos en claro en ficheros de Draupnode.
package secrets

import (
	"draupnode/internal/i18n"
	"errors"
	"os"
	"runtime"
	"strings"

	"github.com/zalando/go-keyring"
)

const service = "draupnode"

// ErrNotFound indica que no hay nada guardado con ese nombre.
var ErrNotFound = i18n.Err("no hay secreto guardado")

// Keyring es la interfaz común de los almacenes.
type Keyring interface {
	Get(name string) (string, error)
	Set(name, value string) error
	Delete(name string) error
}

// System usa el llavero real del sistema.
type System struct{}

func (System) Get(name string) (string, error) {
	v, err := keyring.Get(service, name)
	if errors.Is(err, keyring.ErrNotFound) {
		return "", ErrNotFound
	}
	return v, err
}

func (System) Set(name, value string) error { return keyring.Set(service, name, value) }

func (System) Delete(name string) error {
	err := keyring.Delete(service, name)
	if errors.Is(err, keyring.ErrNotFound) {
		return nil
	}
	return err
}

// Available comprueba si el llavero responde de verdad (en Linux sin
// GNOME Keyring/KWallet, o sin sesión gráfica, no hay).
func Available(k Keyring) bool {
	const probe = "__draupnode_probe__"
	if err := k.Set(probe, "ok"); err != nil {
		return false
	}
	_ = k.Delete(probe)
	return true
}

// SystemKeyringName describe el llavero de este sistema para la interfaz.
func SystemKeyringName() string {
	switch runtime.GOOS {
	case "darwin":
		return i18n.T("Llavero de macOS")
	case "windows":
		return i18n.T("Administrador de credenciales de Windows")
	default:
		desk := strings.ToLower(os.Getenv("XDG_CURRENT_DESKTOP"))
		switch {
		case strings.Contains(desk, "kde"):
			return "KWallet (Secret Service)"
		case strings.Contains(desk, "gnome"), strings.Contains(desk, "unity"), strings.Contains(desk, "cinnamon"), strings.Contains(desk, "mate"), strings.Contains(desk, "xfce"):
			return "GNOME Keyring (Secret Service)"
		}
		return "Secret Service (GNOME Keyring / KWallet / KeePassXC)"
	}
}

// SecretName es el nombre bajo el que se guarda el secreto SSH de un
// servidor (frase de paso de la clave o contraseña del usuario).
func SecretName(serverID string) string { return "ssh-secret:" + serverID }

// Memory es un almacén en memoria para tests.
type Memory map[string]string

func (m Memory) Get(name string) (string, error) {
	v, ok := m[name]
	if !ok {
		return "", ErrNotFound
	}
	return v, nil
}
func (m Memory) Set(name, value string) error { m[name] = value; return nil }
func (m Memory) Delete(name string) error     { delete(m, name); return nil }

// Suggestion es una forma de conseguir llavero del sistema en este equipo.
type Suggestion struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Command     string `json:"command,omitempty"`
}

// linuxPkgManager devuelve el comando de instalación de la distribución.
func linuxPkgManager(look func(string) bool) string {
	switch {
	case look("apt-get"):
		return "sudo apt install -y"
	case look("dnf"):
		return "sudo dnf install -y"
	case look("pacman"):
		return "sudo pacman -S --needed"
	case look("zypper"):
		return "sudo zypper install -y"
	}
	return ""
}

// KeyringSuggestions propone opciones de llavero según el sistema operativo.
// look dice si un programa existe (exec.LookPath); se inyecta para los tests.
func KeyringSuggestions(goos string, look func(string) bool) []Suggestion {
	switch goos {
	case "windows":
		return []Suggestion{
			{Name: i18n.T("Administrador de credenciales de Windows"), Description: i18n.T("Viene con Windows. Si no responde, comprueba que el servicio «Administrador de credenciales» está iniciado (services.msc).")},
			{Name: "KeePassXC", Description: i18n.T("Gestor de contraseñas libre; guarda tus contraseñas en una base de datos cifrada propia."), Command: "winget install KeePassXCTeam.KeePassXC"},
		}
	case "darwin":
		return []Suggestion{
			{Name: i18n.T("Llavero de macOS"), Description: i18n.T("Viene con macOS. Si no responde, ábrelo en «Acceso a Llaveros» y comprueba que el llavero «inicio de sesión» está desbloqueado.")},
			{Name: "KeePassXC", Description: i18n.T("Gestor de contraseñas libre y multiplataforma."), Command: "brew install --cask keepassxc"},
		}
	}
	pm := linuxPkgManager(look)
	cmd := func(pkgs string) string {
		if pm == "" {
			return ""
		}
		return pm + " " + pkgs
	}
	gnomePkgs := "gnome-keyring libsecret-1-0 seahorse"
	kdePkgs := "kwalletmanager"
	if strings.Contains(pm, "dnf") || strings.Contains(pm, "zypper") {
		gnomePkgs, kdePkgs = "gnome-keyring libsecret seahorse", "kwalletmanager5"
	} else if strings.Contains(pm, "pacman") {
		gnomePkgs, kdePkgs = "gnome-keyring libsecret seahorse", "kwalletmanager"
	}
	return []Suggestion{
		{Name: "GNOME Keyring", Description: i18n.T("El llavero de Ubuntu, Debian, Fedora y escritorios GNOME, Cinnamon, MATE o XFCE. Se desbloquea al iniciar sesión. Tras instalarlo, cierra sesión y vuelve a entrar."), Command: cmd(gnomePkgs)},
		{Name: "KWallet", Description: i18n.T("El llavero de KDE Plasma. Actívalo en Preferencias del sistema → Cartera de KDE."), Command: cmd(kdePkgs)},
		{Name: "KeePassXC", Description: i18n.T("Gestor de contraseñas libre. Activa «Integración con Secret Service» en sus ajustes y Draupnode lo usará como llavero."), Command: cmd("keepassxc")},
	}
}
