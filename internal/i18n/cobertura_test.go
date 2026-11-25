package i18n

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// goKeys recorre el código de internal/ y devuelve los textos que se pasan
// a i18n.T, Sprintf, Errorf, New, Err y N (cadenas fijas o sumas de ellas,
// y constantes del mismo paquete).
func goKeys(t *testing.T) map[string]string {
	t.Helper()
	keys := map[string]string{}
	fset := token.NewFileSet()
	consts := map[string]map[string]string{} // carpeta → nombre → valor
	var files []*ast.File
	var dirs []string
	err := filepath.Walk("..", func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(p, ".go") || strings.HasSuffix(p, "_test.go") {
			return err
		}
		f, err := parser.ParseFile(fset, p, nil, 0)
		if err != nil {
			return err
		}
		dir := filepath.Dir(p)
		if consts[dir] == nil {
			consts[dir] = map[string]string{}
		}
		for _, d := range f.Decls {
			if gd, ok := d.(*ast.GenDecl); ok && gd.Tok == token.CONST {
				for _, s := range gd.Specs {
					vs := s.(*ast.ValueSpec)
					for i, n := range vs.Names {
						if i < len(vs.Values) {
							if bl, ok := vs.Values[i].(*ast.BasicLit); ok && bl.Kind == token.STRING {
								v, _ := strconv.Unquote(bl.Value)
								consts[dir][n.Name] = v
							}
						}
					}
				}
			}
		}
		files = append(files, f)
		dirs = append(dirs, dir)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	var eval func(dir string, e ast.Expr) (string, bool)
	eval = func(dir string, e ast.Expr) (string, bool) {
		switch x := e.(type) {
		case *ast.BasicLit:
			if x.Kind != token.STRING {
				return "", false
			}
			v, err := strconv.Unquote(x.Value)
			return v, err == nil
		case *ast.BinaryExpr:
			if x.Op != token.ADD {
				return "", false
			}
			a, ok1 := eval(dir, x.X)
			b, ok2 := eval(dir, x.Y)
			return a + b, ok1 && ok2
		case *ast.ParenExpr:
			return eval(dir, x.X)
		case *ast.Ident:
			v, ok := consts[dir][x.Name]
			return v, ok
		}
		return "", false
	}
	for i, f := range files {
		dir := dirs[i]
		ast.Inspect(f, func(n ast.Node) bool {
			c, ok := n.(*ast.CallExpr)
			if !ok || len(c.Args) == 0 {
				return true
			}
			s, ok := c.Fun.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			if id, ok := s.X.(*ast.Ident); !ok || id.Name != "i18n" {
				return true
			}
			switch s.Sel.Name {
			case "T", "Sprintf", "Errorf", "New", "Err", "N":
				if v, ok := eval(dir, c.Args[0]); ok {
					keys[v] = fset.Position(c.Pos()).String()
				}
			}
			return true
		})
	}
	return keys
}

var verbs = regexp.MustCompile(`%[-+# 0-9.*]*[a-zA-Z%]`)

// TestTraduccionesGo: todo texto marcado en el código tiene su traducción en
// en.json, con los mismos verbos de formato. Con I18N_FALTAN=fichero escribe
// los que faltan (clave → "") para traducirlos.
func TestTraduccionesGo(t *testing.T) {
	keys := goKeys(t)
	var missing []string
	for k, pos := range keys {
		v, ok := en()[k]
		if !ok || v == "" {
			missing = append(missing, k)
			continue
		}
		if strings.Join(verbs.FindAllString(k, -1), " ") != strings.Join(verbs.FindAllString(v, -1), " ") {
			t.Errorf("%s: los verbos de formato no coinciden:\n  %q\n  %q", pos, k, v)
		}
	}
	sort.Strings(missing)
	if out := os.Getenv("I18N_FALTAN"); out != "" {
		m := map[string]string{}
		for _, k := range missing {
			m[k] = ""
		}
		b, _ := json.MarshalIndent(m, "", " ")
		_ = os.WriteFile(out, b, 0o644)
	}
	if len(missing) > 0 {
		t.Errorf("%d texto(s) sin traducir en internal/i18n/en.json (I18N_FALTAN=fichero los lista), p. ej. %q", len(missing), missing[0])
	}
	var extra []string
	for k := range en() {
		if _, ok := keys[k]; !ok {
			extra = append(extra, k)
		}
	}
	if len(extra) > 0 {
		sort.Strings(extra)
		t.Logf("%d traducción(es) que ya no se usan, p. ej. %q", len(extra), extra[0])
	}
}

// TestT: sin traducción se queda en español; con ella, en inglés.
func TestT(t *testing.T) {
	defer Set(ES)
	Set(ES)
	if T("Idioma no disponible") != "Idioma no disponible" {
		t.Fatal("en español no debe cambiar")
	}
	Set(EN)
	if T("texto que no existe en el catálogo") != "texto que no existe en el catálogo" {
		t.Fatal("sin traducción debe quedarse igual")
	}
	if Normalize("es_ES.UTF-8") != ES || Normalize("en-GB") != EN || Normalize("fr") != "" {
		t.Fatal("Normalize")
	}
}
