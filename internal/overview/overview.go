// Package overview lleva el script que saca el estado de un servidor.
package overview

import _ "embed"

// Script es Python 3 (está en todos los servidores que prepara Draupnode):
// imprime un JSON con el estado del servidor. Solo lee.
//
//go:embed overview.py
var Script string
