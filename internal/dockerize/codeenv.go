package dockerize

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// Lo que se ve en el código del proyecto (sin ejecutarlo): qué variables de
// entorno lee y, para las claves, en qué formato tienen que ir.

var (
	// os.environ.get("X"), os.getenv("X"), os.environ["X"], env("X"), env.str("X"),
	// process.env.X / process.env["X"], getenv("X") (PHP/Go), env('X') (Laravel).
	codeEnvRe    = regexp.MustCompile(`(?:os\.environ\.get|os\.getenv|os\.environ\[|\benv(?:\.\w+)?|process\.env\[?|getenv|Getenv|LookupEnv)\(?\s*\.?\s*["'\x60]?([A-Z][A-Z0-9_]{2,})["'\x60]?`)
	codeSkipDirs = map[string]bool{".git": true, ".venv": true, "venv": true, "env": true, "node_modules": true, "__pycache__": true,
		"migrations": true, "vendor": true, "dist": true, "build": true, "staticfiles": true, "static": true, "media": true, "tests": true, "test": true, "docs": true}
	codeExts = map[string]bool{".py": true, ".js": true, ".ts": true, ".mjs": true, ".php": true, ".go": true, ".rb": true}
	// Lo que pone el sistema o Docker y no es de la app.
	codeEnvIgnore = map[string]bool{"PATH": true, "HOME": true, "USER": true, "PWD": true, "HOSTNAME": true, "TERM": true, "LANG": true, "TZ": true,
		"DJANGO_SETTINGS_MODULE": true, "PYTHONPATH": true, "NODE_ENV": false, "PORT": true}
)

// walkCode recorre los ficheros de código del proyecto (como mucho 3000).
func walkCode(dir string, fn func(path, text string)) {
	n := 0
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if p != dir && (codeSkipDirs[d.Name()] || strings.HasPrefix(d.Name(), ".")) {
				return filepath.SkipDir
			}
			return nil
		}
		if !codeExts[filepath.Ext(p)] || n >= 3000 {
			return nil
		}
		if st, err := d.Info(); err != nil || st.Size() > 512<<10 {
			return nil
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return nil
		}
		n++
		fn(p, string(b))
		return nil
	})
}

// CodeEnvKeys: variables que lee el código y no están ya en known.
func CodeEnvKeys(dir string, known []string) []string {
	have := map[string]bool{}
	for _, k := range known {
		have[k] = true
	}
	found := map[string]bool{}
	walkCode(dir, func(_, text string) {
		for _, m := range codeEnvRe.FindAllStringSubmatch(text, -1) {
			k := m[1]
			if !have[k] && !codeEnvIgnore[k] {
				found[k] = true
			}
		}
	})
	out := make([]string, 0, len(found))
	for k := range found {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// Formatos de los valores que se generan al azar (los entiende el módulo App desde Git).
const (
	FormatText      = ""          // 40 letras y números
	FormatFernet    = "fernet"    // 32 bytes en Base64 para URL (cryptography.Fernet)
	FormatBase64_32 = "base64-32" // 32 bytes en Base64
	FormatHex32     = "hex-32"    // 32 bytes en hexadecimal
)

// KeyFormats deduce, mirando el código, en qué formato tiene que ir cada
// clave: dónde se lee (el nombre de la clave) y, en las 15 líneas
// siguientes, si se pasa tal cual a Fernet(…), o se decodifica de Base64 y se
// exigen 32 bytes, o de hexadecimal. Sin pistas: texto. (Fernet(base64…(…))
// es una clave derivada: no pide formato a la variable.)
func KeyFormats(dir string, keys []string) map[string]string {
	out := map[string]string{}
	if len(keys) == 0 {
		return out
	}
	walkCode(dir, func(_, text string) {
		lines := strings.Split(text, "\n")
		for _, k := range keys {
			if out[k] != "" || !strings.Contains(text, k) {
				continue
			}
			for i, l := range lines {
				if !strings.Contains(l, k) {
					continue
				}
				end := i + 16
				if end > len(lines) {
					end = len(lines)
				}
				win := strings.Join(lines[i:end], "\n")
				switch {
				case fernetDirectRe.MatchString(win):
					out[k] = FormatFernet
				case strings.Contains(win, "b64decode") && strings.Contains(win, "32"):
					out[k] = FormatBase64_32
				case strings.Contains(win, "bytes.fromhex") || strings.Contains(win, "hex.DecodeString"):
					out[k] = FormatHex32
				}
				if out[k] != "" {
					break
				}
			}
		}
	})
	return out
}

var fernetDirectRe = regexp.MustCompile(`Fernet\(\s*[A-Za-z_][A-Za-z0-9_.]*\s*\)`)
