package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

func TestClasificarVariables(t *testing.T) {
	cases := map[string]string{
		"SECRET_KEY": "gen", "POSTGRES_PASSWORD": "gen", "DB_PASS": "gen", "JWT_SECRET": "gen",
		"STRIPE_API_KEY": "ext", "GITHUB_TOKEN": "ext", "EMAIL_HOST_PASSWORD": "ext", "AWS_SECRET_ACCESS_KEY": "ext",
		"DATABASE_URL": "", "DEBUG": "", "ALLOWED_HOSTS": "", "STRIPE_PUBLIC_KEY": "", "AWS_ACCESS_KEY_ID": "",
	}
	for k, want := range cases {
		v := GitEnvVar{Key: k}
		classifyGitVar(&v)
		got := ""
		if v.Secret {
			got = "gen"
		}
		if v.External {
			got = "ext"
		}
		if got != want {
			t.Errorf("%s: %q, quería %q", k, got, want)
		}
	}
	if m := gitCloneHelp("warning: x\nfatal: Remote branch otra not found in upstream origin", false, false, ""); m != "No se pudo bajar el repositorio (fatal: Remote branch otra not found in upstream origin). Comprueba el nombre de la rama." {
		t.Fatal(m)
	}
}

func TestLeerEnvDelEquipo(t *testing.T) {
	kv, multi := parseDotEnv("# comentario\nexport DEBUG=False\nSECRET_KEY='a;b=c'\nALLOWED_HOSTS=\"x.com,y.com\"  \nPORT=8000 # puerto\nDEBUG=True\nCERT=\"-----BEGIN\nBASURA\nSTRIPE_API_KEY=sk_test_1\n")
	got := map[string]string{}
	for _, x := range kv {
		got[x.Key] = x.Value
	}
	if got["DEBUG"] != "True" || got["SECRET_KEY"] != "a;b=c" || got["ALLOWED_HOSTS"] != "x.com,y.com" || got["PORT"] != "8000" || got["STRIPE_API_KEY"] != "sk_test_1" || len(multi) != 1 || multi[0] != "CERT" {
		t.Fatalf("%v %v", got, multi)
	}
}

func TestImportarEnvALaBoveda(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	srv, _ := a.SaveServer(srvPassword(), "", false, "")
	p, _ := a.SaveProject(store.Project{Name: "App", ServerID: srv.ID})
	f := filepath.Join(t.TempDir(), ".env")
	os.WriteFile(f, []byte("DEBUG=False\nSECRET_KEY=abc\nSTRIPE_API_KEY=sk_1\nRARO=\"x\ny\"\nDB_PASSWORD=con;punto\n"), 0o600)
	if r := a.GitAppImportEnv(p.ID, "git-app", f); r.Status != "vault_missing" {
		t.Fatalf("sin bóveda: %+v", r)
	}
	if err := a.VaultCreate("una maestra larga"); err != nil {
		t.Fatal(err)
	}
	a.vault.Set(varName(p.ID, "git_app_env_secret"), "OTRA=1; SECRET_KEY=vieja")
	r := a.GitAppImportEnv(p.ID, "git-app", f)
	if r.Status != "ok" || strings.Join(r.Env, ",") != "DEBUG=False" || strings.Join(r.SecretKeys, ",") != "SECRET_KEY,STRIPE_API_KEY" || len(r.Skipped) != 2 {
		t.Fatalf("%+v", r)
	}
	if v, _ := a.vault.Get(varName(p.ID, "git_app_env_secret")); v != "OTRA=1; SECRET_KEY=abc; STRIPE_API_KEY=sk_1" {
		t.Fatal(v)
	}
}

func TestAvisosDelEnv(t *testing.T) {
	w := gitEnvWarnings("App", map[string]any{"git_app_env": []any{"NODE_ENV=produccion", "DEBUG=true", "POSTGRES_DB=", "ALLOWED_HOSTS=*", "NODE_ENV=production"}})
	if len(w) != 3 || !strings.Contains(w[0], "NODE_ENV=produccion") || !strings.Contains(w[1], "DEBUG=true") || !strings.Contains(w[2], "POSTGRES_DB") {
		t.Fatalf("%q", w)
	}
	if gitPostSuggestion(map[string]bool{"manage.py": true}) != "python3 manage.py migrate" || gitPostSuggestion(map[string]bool{}) != "" {
		t.Fatal("sugerencia")
	}
}
