// Package legal guarda los textos de licencia que viajan dentro del ejecutable:
// el aviso de autoría, la GPL-3.0 y las licencias de las librerías incluidas.
//
// Copyright © 2026 Francisco Javier Pradas
// SPDX-License-Identifier: GPL-3.0-or-later
package legal

import _ "embed"

// Aviso es una copia de COPYRIGHT (en la raíz del repositorio).
//
//go:embed aviso.txt
var Aviso string

// GPL es una copia de LICENSE (en la raíz del repositorio).
//
//go:embed gpl-3.0.txt
var GPL string

// Terceros lo genera herramientas/licencias.py («make licencias»).
//
//go:embed terceros.txt
var Terceros string

const (
	Autor    = "Francisco Javier Pradas"
	Anio     = "2026"
	Licencia = "GPL-3.0-or-later"
	Proyecto = "https://github.com/Franpradasespana/draupnode"
)
