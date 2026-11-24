# Draupnode · tareas habituales
# Go está en ~/.local/go y wails en ~/go/bin (se añaden al PATH aquí).
export PATH := $(HOME)/.local/go/bin:$(HOME)/go/bin:$(PATH)

# Ubuntu 24.04+ trae WebKitGTK 4.1 (no 4.0): Wails necesita esta etiqueta.
TAGS ?= webkit2_41

.PHONY: help deps-linux doctor test check dev demo capturas gif licencias build build-windows install-linux uninstall-linux clean

help:
	@echo "make deps-linux    Instala (con sudo) lo que necesita Wails en Ubuntu/Debian"
	@echo "make doctor        Comprueba que todo está listo para compilar"
	@echo "make test          Tests de Go + comprobación de tipos de la interfaz"
	@echo "make dev           App de escritorio con recarga en caliente"
	@echo "make demo          Solo la interfaz en el navegador, con datos simulados"
	@echo "make capturas      Rehace las capturas de la ayuda (necesita Google Chrome o Chromium)"
	@echo "make gif           Rehace el GIF del README con esas capturas (necesita Pillow)"
	@echo "make licencias     Rehace la lista de licencias de las librerías incluidas"
	@echo "make build         Ejecutable para este sistema en build/bin/"
	@echo "make build-windows Ejecutable para Windows (.exe) desde Linux"
	@echo "make install-linux Instala en tu usuario (menú de aplicaciones + icono en el dock)"

deps-linux:
	sudo apt-get update
	sudo apt-get install -y build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev

doctor:
	wails doctor

test:
	go vet -tags $(TAGS) ./...
	go test -tags $(TAGS) ./...
	cd frontend && npm run check

check: test

dev:
	wails dev -tags $(TAGS)

demo:
	cd frontend && npm run dev

capturas:
	cd frontend && node scripts/capturas.mjs

gif:
	python3 herramientas/gif_readme.py

licencias:
	python3 herramientas/licencias.py

build:
	wails build -tags $(TAGS) -clean

build-windows:
	wails build -platform windows/amd64 -clean

# Sin sudo: ~/.local/bin + icono + lanzador .desktop (así GNOME muestra el icono en el dock).
install-linux: build
	install -Dm755 build/bin/draupnode $(HOME)/.local/bin/draupnode
	install -Dm644 build/linux/draupnode.png $(HOME)/.local/share/icons/hicolor/512x512/apps/draupnode.png
	install -Dm644 build/linux/draupnode.desktop $(HOME)/.local/share/applications/draupnode.desktop
	sed -i "s|^Exec=.*|Exec=$(HOME)/.local/bin/draupnode|" $(HOME)/.local/share/applications/draupnode.desktop
	-gtk-update-icon-cache -q -t $(HOME)/.local/share/icons/hicolor 2>/dev/null
	-update-desktop-database -q $(HOME)/.local/share/applications 2>/dev/null
	@echo "Instalado. Búscalo como «Draupnode» en las aplicaciones."

uninstall-linux:
	rm -f $(HOME)/.local/bin/draupnode $(HOME)/.local/share/icons/hicolor/512x512/apps/draupnode.png $(HOME)/.local/share/applications/draupnode.desktop

clean:
	rm -rf build/bin frontend/dist
