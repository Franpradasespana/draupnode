package main

import (
	"strings"
	"testing"

	"draupnode/internal/bundle"
	"draupnode/internal/secrets"
	"draupnode/internal/store"
)

// Dos apps de Git en el mismo servidor: cada copia con su nombre, sus valores
// y sus datos secretos.
func TestDosAppsDeGit(t *testing.T) {
	a := newTestApp(t, secrets.Memory{})
	srv, _ := a.SaveServer(srvPassword(), "", false, "")
	mods := []store.ProjectModule{
		{ID: "git-app", Values: map[string]any{"git_app_repo": "https://ejemplo.org/tienda.git", "git_app_name": "tienda"}},
		{ID: "git-app@blog", Values: map[string]any{"git_app_repo": "https://ejemplo.org/blog.git", "git_app_name": "tienda"}},
	}
	p, err := a.SaveProject(store.Project{Name: "web", ServerID: srv.ID})
	if err != nil {
		t.Fatal(err)
	}
	p.Modules = mods
	chk, _ := a.resolveProject(p)
	if chk.Errors["git-app@blog"]["git_app_name"] == "" {
		t.Fatalf("mismo nombre de app en dos copias: %+v", chk.Errors)
	}
	p.Modules[1].Values["git_app_name"] = "blog"
	if p, err = a.SaveProject(p); err != nil {
		t.Fatal(err)
	}
	ids := []string{}
	for _, m := range p.Modules {
		ids = append(ids, m.ID)
	}
	if !strings.Contains(strings.Join(ids, ","), "git-app@blog") || a.moduleName("git-app@blog") != "App desde Git (Docker Compose) · blog" {
		t.Fatalf("copias: %v", ids)
	}
	if _, err := a.SaveProject(store.Project{ID: p.ID, ServerID: srv.ID, Name: "web", Modules: []store.ProjectModule{{ID: "docker@otra", Values: map[string]any{}}}}); err == nil {
		t.Fatal("docker no es repetible")
	}
	// Datos secretos por copia.
	if err := a.VaultCreate("una maestra larga"); err != nil {
		t.Fatal(err)
	}
	if err := a.SetProjectSecret(p.ID, "git_app_token@blog", "tok-blog"); err != nil {
		t.Fatal(err)
	}
	a.SetProjectSecret(p.ID, "git_app_token", "tok-tienda")
	_, sel := a.resolveProject(p)
	vals, err := a.secretValues(p.ID, sel)
	if err != nil || vals["git_app_token"] != "tok-tienda" || vals["git_app_token__blog"] != "tok-blog" {
		t.Fatalf("secretos: %v %v", vals, err)
	}
	var blog bundle.Selection
	for _, s := range sel {
		if s.Key() == "git-app@blog" {
			blog = s
		}
	}
	if blog.Instance != "blog" || blog.SecretName("git_app_token") != "git_app_token__blog" {
		t.Fatalf("selección: %+v", blog)
	}
	site, err := bundle.SiteYAML(bundle.Options{Project: "web", Slug: "web"}, sel)
	y := string(site)
	if err != nil || strings.Count(y, "role: git-app") != 2 || !strings.Contains(y, `git_app_token: "{{ git_app_token__blog }}"`) || !strings.Contains(y, `draupnode_instance: !unsafe "blog"`) {
		t.Fatalf("site.yml: %v\n%s", err, y)
	}
}
