package legal

import (
	"os"
	"strings"
	"testing"
)

// Las copias incrustadas tienen que ser idénticas a las de la raíz.
func TestCopiasIguales(t *testing.T) {
	for raiz, copia := range map[string]string{"../../LICENSE": GPL, "../../COPYRIGHT": Aviso} {
		b, err := os.ReadFile(raiz)
		if err != nil {
			t.Fatal(err)
		}
		if string(b) != copia {
			t.Errorf("%s y su copia en internal/legal no coinciden: cópialo otra vez", raiz)
		}
	}
	if !strings.Contains(Aviso, Autor) || !strings.Contains(Terceros, "github.com/wailsapp/wails") {
		t.Error("faltan el autor o las licencias de terceros")
	}
}
