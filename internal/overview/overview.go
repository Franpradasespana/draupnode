// Package overview lleva el script que saca el estado de un servidor y el que
// guarda su historial.
package overview

import _ "embed"

// Historial es historial.py: en el servidor lo llama cada 5 minutos el
// temporizador draupnode-historial («muestra»).
//
//go:embed historial.py
var Historial string

//go:embed overview.py
var overviewPy string

// Script es Python 3 (está en todos los servidores que prepara Draupnode):
// imprime un JSON con el estado del servidor. Solo lee. Lleva historial.py
// delante para leer el historial con el mismo código que lo escribe.
var Script = Historial + "\n" + overviewPy

// HistoryVersion es la versión de historial.py que trae esta Draupnode; si la
// del servidor es anterior, la ficha ofrece actualizarla.
const HistoryVersion = 1

// Images es imagenes.py: ¿hay versión nueva de las imágenes de los
// contenedores? Pregunta a cada registro por el digest de la etiqueta. Solo lee.
//
//go:embed imagenes.py
var Images string
