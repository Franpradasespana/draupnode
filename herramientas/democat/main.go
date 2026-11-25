// democat vuelca el catálogo de módulos incluidos para la demo del
// navegador, en cada idioma: frontend/src/lib/demo/modules.<es|en>.json.
//
//	go run ./herramientas/democat
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"draupnode/internal/i18n"
	"draupnode/internal/modules"
)

func main() {
	out := filepath.Join("frontend", "src", "lib", "demo")
	if err := os.MkdirAll(out, 0o755); err != nil {
		fail(err)
	}
	for _, l := range []string{i18n.ES, i18n.EN} {
		i18n.Set(l)
		c, err := modules.Load(filepath.Join(os.TempDir(), "draupnode-democat-no-existe"))
		if err != nil {
			fail(err)
		}
		raw, err := json.Marshal(c.All())
		if err != nil {
			fail(err)
		}
		f := filepath.Join(out, "modules."+l+".json")
		if err := os.WriteFile(f, append(raw, '\n'), 0o644); err != nil {
			fail(err)
		}
		fmt.Printf("%s: %d módulos\n", f, len(c.All()))
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
