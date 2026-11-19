package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFirstWebPrefersListOrder(t *testing.T) {
	a := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(404) }))
	defer a.Close()
	b := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	defer b.Close()

	ctx := context.Background()
	got, ok := firstWeb(ctx, []webCandidate{{"http://127.0.0.1:1", "Coolify"}, {a.URL, "Web"}, {b.URL, "Otra"}})
	if !ok || got.url != a.URL {
		t.Fatalf("quería %s (un 404 también cuenta), salió %+v %v", a.URL, got, ok)
	}
	if _, ok := firstWeb(ctx, []webCandidate{{"http://127.0.0.1:1", "Coolify"}}); ok {
		t.Fatal("un puerto cerrado no es una web")
	}
}
