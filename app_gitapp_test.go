package main

import "testing"

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
