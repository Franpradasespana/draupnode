package app

import (
	"os"
	"testing"
)

// Los tests comprueban textos en español: el idioma no puede depender del
// sistema donde se ejecutan (NewApp mira LANG si no hay idioma guardado).
func TestMain(m *testing.M) {
	for _, k := range []string{"LC_ALL", "LC_MESSAGES", "LANGUAGE"} {
		os.Unsetenv(k)
	}
	os.Setenv("LANG", "es_ES.UTF-8")
	os.Exit(m.Run())
}
