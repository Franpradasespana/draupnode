package modules

import (
	"draupnode/internal/i18n"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

// Normalize convierte un valor (que llega de JSON o YAML) al tipo de la
// variable y comprueba sus reglas. nil = sin valor.
func Normalize(v Variable, val any) (any, error) {
	if val == nil {
		if v.Required {
			return nil, i18n.New("es obligatorio")
		}
		return nil, nil
	}
	switch v.Type {
	case TypeBool:
		switch b := val.(type) {
		case bool:
			return b, nil
		case string:
			return strconv.ParseBool(b)
		}
		return nil, i18n.New("debe ser sí o no")
	case TypeInt:
		var n int
		switch x := val.(type) {
		case int:
			n = x
		case int64:
			n = int(x)
		case float64:
			if x != math.Trunc(x) {
				return nil, i18n.New("debe ser un número entero")
			}
			n = int(x)
		case string:
			p, err := strconv.Atoi(strings.TrimSpace(x))
			if err != nil {
				return nil, i18n.New("debe ser un número entero")
			}
			n = p
		default:
			return nil, i18n.New("debe ser un número entero")
		}
		if v.Min != nil && n < *v.Min {
			return nil, i18n.Errorf("debe ser como mínimo %d", *v.Min)
		}
		if v.Max != nil && n > *v.Max {
			return nil, i18n.Errorf("debe ser como máximo %d", *v.Max)
		}
		return n, nil
	case TypeList:
		var items []string
		switch x := val.(type) {
		case []string:
			items = x
		case []any:
			for _, it := range x {
				items = append(items, strings.TrimSpace(fmt.Sprint(it)))
			}
		case string:
			for _, it := range strings.Split(x, "\n") {
				items = append(items, strings.TrimSpace(it))
			}
		default:
			return nil, i18n.New("debe ser una lista")
		}
		out := []string{}
		seen := map[string]bool{}
		for _, it := range items {
			if it == "" || seen[it] {
				continue
			}
			if err := checkPattern(v, it); err != nil {
				return nil, fmt.Errorf("«%s»: %w", it, err)
			}
			seen[it] = true
			out = append(out, it)
		}
		if v.Required && len(out) == 0 {
			return nil, i18n.New("añade al menos un elemento")
		}
		return out, nil
	default: // string, select
		s := strings.TrimSpace(fmt.Sprint(val))
		if s == "" {
			if v.Required {
				return nil, i18n.New("es obligatorio")
			}
			return "", nil
		}
		if strings.ContainsAny(s, "\n\r") {
			return nil, i18n.New("no puede tener saltos de línea")
		}
		if v.Type == TypeSelect {
			for _, o := range v.Options {
				if o == s {
					return s, nil
				}
			}
			return nil, i18n.Errorf("debe ser una de: %s", strings.Join(v.Options, ", "))
		}
		if err := checkPattern(v, s); err != nil {
			return nil, err
		}
		return s, nil
	}
}

func checkPattern(v Variable, s string) error {
	if v.Pattern == "" {
		return nil
	}
	if !regexp.MustCompile(v.Pattern).MatchString(s) {
		if v.PatternHelp != "" {
			return errors.New(v.PatternHelp)
		}
		return i18n.Errorf("no cumple el formato %s", v.Pattern)
	}
	return nil
}

// Values valida los valores de un módulo y rellena los que falten con su
// valor por defecto. Devuelve los errores por variable.
func (m *Module) Values(in map[string]any) (map[string]any, map[string]string) {
	out := map[string]any{}
	errs := map[string]string{}
	for _, v := range m.Variables {
		if v.Type == TypeSecret {
			continue // los secretos no van en los valores del proyecto (están en la bóveda)
		}
		raw, ok := in[v.Name]
		if !ok {
			raw = v.Default
		}
		val, err := Normalize(v, raw)
		if err != nil {
			errs[v.Name] = err.Error()
			continue
		}
		out[v.Name] = val
	}
	return out, errs
}

// SecretVars devuelve las variables de tipo secreto del módulo.
func (m *Module) SecretVars() []Variable {
	var out []Variable
	for _, v := range m.Variables {
		if v.Type == TypeSecret {
			out = append(out, v)
		}
	}
	return out
}
