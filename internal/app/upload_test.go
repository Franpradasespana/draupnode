package app

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"draupnode/internal/dockerize"
)

func TestSubirCarpeta(t *testing.T) {
	d := t.TempDir()
	for _, f := range []string{"manage.py", "app/views.py", ".env", ".env.example", ".git/config", ".venv/x", "node_modules/a/b.js", "media/foto.jpg", "app/__pycache__/x.pyc", "db.sqlite3", "docs/leeme.md"} {
		os.MkdirAll(filepath.Join(d, filepath.Dir(f)), 0o755)
		os.WriteFile(filepath.Join(d, f), []byte("x"), 0o644)
	}
	os.WriteFile(filepath.Join(d, ".dockerignore"), []byte("media\n# comentario\ndocs/\n!docs/leeme.md\ndocker-compose*.yml\nDockerfile*\n"), 0o644)
	os.WriteFile(filepath.Join(d, "docker-compose.yml"), []byte("x"), 0o644)
	os.WriteFile(filepath.Join(d, "Dockerfile"), []byte("x"), 0o644)
	var buf bytes.Buffer
	n, _, err := tarDir(d, &buf)
	if err != nil {
		t.Fatal(err)
	}
	gz, _ := gzip.NewReader(&buf)
	tr := tar.NewReader(gz)
	var got []string
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if h.Typeflag == tar.TypeReg {
			got = append(got, h.Name)
		}
	}
	sort.Strings(got)
	if strings.Join(got, ",") != ".dockerignore,.env.example,Dockerfile,app/views.py,docker-compose.yml,manage.py" || n != 6 {
		t.Fatalf("%d %v", n, got)
	}
}

func TestVariablesYFormatosDelCodigo(t *testing.T) {
	d := t.TempDir()
	os.MkdirAll(filepath.Join(d, "config"), 0o755)
	os.WriteFile(filepath.Join(d, "config", "settings.py"), []byte(`import os
SECRET = os.environ.get("DJANGO_SECRET_KEY")
if os.environ.get("DB_ENGINE") == "postgres":
    pass
X = os.getenv('FIELD_KEY')
Y = os.environ["FILES_KEY"]
`), 0o644)
	os.WriteFile(filepath.Join(d, "crypto.py"), []byte(`from django.conf import settings
def f():
    k = getattr(settings, "FIELD_KEY", None)
    return Fernet(k)
def g():
    raw = getattr(settings, "FILES_KEY", None)
    key = base64.b64decode(raw)
    if len(key) != 32:
        raise ValueError
def h():
    s = "DJANGO_SECRET_KEY"
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(s).digest()))
`), 0o644)
	keys := dockerize.CodeEnvKeys(d, []string{"DJANGO_SECRET_KEY"})
	if strings.Join(keys, ",") != "DB_ENGINE,FIELD_KEY,FILES_KEY" {
		t.Fatalf("variables: %v", keys)
	}
	f := dockerize.KeyFormats(d, []string{"DJANGO_SECRET_KEY", "FIELD_KEY", "FILES_KEY"})
	if f["FIELD_KEY"] != "fernet" || f["FILES_KEY"] != "base64-32" || f["DJANGO_SECRET_KEY"] != "" {
		t.Fatalf("formatos: %v", f)
	}
}
