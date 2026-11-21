package main

import (
	"context"
	"embed"
	"log"
	"path/filepath"

	"draupnode/internal/secrets"
	"draupnode/internal/store"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

// Icono de la ventana en Linux y del «Acerca de» en macOS.
// (El icono del ejecutable/.app/.exe lo genera Wails a partir del mismo fichero.)
//
//go:embed build/appicon.png
var icon []byte

func main() {
	dir, err := store.DefaultDir()
	if err != nil {
		log.Fatal(err)
	}
	st, err := store.Open(dir)
	if err != nil {
		log.Fatal(err)
	}
	vault, err := secrets.OpenVault(filepath.Join(dir, "vault.json"))
	if err != nil {
		log.Fatal(err)
	}
	app := NewApp(st, secrets.System{}, vault)

	err = wails.Run(&options.App{
		Title:     "Draupnode",
		Width:     1280,
		Height:    820,
		MinWidth:  600,
		MinHeight: 480,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		// Fondo de la paleta por defecto (Draupnir Gold) mientras carga la interfaz.
		BackgroundColour: &options.RGBA{R: 14, G: 13, B: 11, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       func(context.Context) { app.CloseTunnels(); app.CloseTerminals() },
		Bind:             []interface{}{app},
		Linux: &linux.Options{
			ProgramName: "draupnode", // debe coincidir con StartupWMClass del .desktop
			Icon:        icon,
		},
		Mac: &mac.Options{
			About: &mac.AboutInfo{
				Title:   "Draupnode " + Version,
				Message: "Zero-to-host forge",
				Icon:    icon,
			},
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
