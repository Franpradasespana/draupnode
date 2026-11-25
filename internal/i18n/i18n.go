// Package i18n traduce los textos de Draupnode (español ⇄ inglés).
//
// El español es el idioma del código: cada texto se escribe en español y
// T lo busca en el catálogo inglés (en.json, «texto en español» → «English
// text»). Si falta una traducción, se queda en español: nada se rompe.
//
// Los textos con formato (fmt) se traducen antes de formatear, así que en
// en.json la clave y el valor llevan los mismos verbos (%s, %d, %v, %w…)
// en el mismo orden.
package i18n

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"
)

// Idiomas disponibles.
const (
	ES = "es"
	EN = "en"
)

//go:embed en.json
var files embed.FS

var (
	lang    atomic.Value // string
	loadEN  sync.Once
	catalog map[string]string
)

func init() { lang.Store(ES) }

// Normalize deja «es» o «en» (cualquier otra cosa → vacío).
func Normalize(l string) string {
	l = strings.ToLower(strings.TrimSpace(l))
	switch {
	case strings.HasPrefix(l, "es"):
		return ES
	case strings.HasPrefix(l, "en"):
		return EN
	}
	return ""
}

// Detect mira el idioma del sistema (LC_ALL, LC_MESSAGES, LANG, LANGUAGE).
// Si es español, «es»; si no se sabe o es otro, «en».
func Detect() string {
	for _, k := range []string{"LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"} {
		v := os.Getenv(k)
		if v == "" || v == "C" || v == "POSIX" || strings.HasPrefix(v, "C.") {
			continue
		}
		if Normalize(v) == ES {
			return ES
		}
		return EN
	}
	return EN
}

// Set cambia el idioma («es» o «en»; lo demás se ignora).
func Set(l string) {
	if l = Normalize(l); l != "" {
		lang.Store(l)
	}
}

// Lang es el idioma actual.
func Lang() string { return lang.Load().(string) }

func en() map[string]string {
	loadEN.Do(func() {
		catalog = map[string]string{}
		if raw, err := files.ReadFile("en.json"); err == nil {
			_ = json.Unmarshal(raw, &catalog)
		}
	})
	return catalog
}

// T traduce un texto al idioma actual.
func T(s string) string {
	if Lang() == ES {
		return s
	}
	if v, ok := en()[s]; ok && v != "" {
		return v
	}
	return s
}

// Has dice si hay traducción inglesa de s (para las pruebas).
func Has(s string) bool { _, ok := en()[s]; return ok }

// Keys son los textos con traducción (para las pruebas).
func Keys() []string {
	out := make([]string, 0, len(en()))
	for k := range en() {
		out = append(out, k)
	}
	return out
}

// Sprintf = fmt.Sprintf con el formato traducido.
func Sprintf(format string, args ...any) string { return fmt.Sprintf(T(format), args...) }

// Errorf = fmt.Errorf con el formato traducido (respeta %w).
func Errorf(format string, args ...any) error { return fmt.Errorf(T(format), args...) }

// New = errors.New con el texto traducido al crearlo.
func New(s string) error { return errors.New(T(s)) }

// Err es un error fijo (variable de paquete, comparable con errors.Is) que
// se traduce cuando se lee, no cuando se crea.
type Err string

func (e Err) Error() string { return T(string(e)) }

// N marca un texto para traducirlo más tarde (tablas de paquete, que se crean
// antes de saber el idioma): lo devuelve tal cual. Donde se use, i18n.T(x).
func N(s string) string { return s }
