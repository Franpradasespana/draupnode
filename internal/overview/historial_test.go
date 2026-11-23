package overview

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Simula 30 h de muestras (cada 5 min) con el disco creciendo 2 GB al día y
// dos apps, y lee el historial como lo hace la ficha.
const driver = `
import os, sys
exec(open(sys.argv[1]).read())
class V: pass
state = {"used": 40e9}
def fake_statvfs(p):
    v = V(); v.f_frsize = 4096; v.f_blocks = int(100e9 / 4096); v.f_bfree = int((100e9 - state["used"]) / 4096); return v
os.statvfs = fake_statvfs
_apps_now = lambda: {"dn-web": [1.5, 200 * 1024 ** 2], "coolify:blog": [0.5, 100 * 1024 ** 2]}
t0 = 1_800_000_000 - 1_800_000_000 % 3600
for i in range(30 * 12):
    state["used"] = 40e9 + 2e9 * i * 300 / 86400
    tomar_muestra(now=t0 + i * 300)
r = leer_historial(now=t0 + (30 * 12 - 1) * 300)
r["_samples"] = sum(1 for _ in open(os.path.join(HIST_DIR, "muestras.jsonl")))
r["_hours"] = sum(1 for _ in open(os.path.join(HIST_DIR, "horas.jsonl")))
print(json.dumps(r))
`

func TestHistorial(t *testing.T) {
	if _, err := exec.LookPath("python3"); err != nil {
		t.Skip("sin python3")
	}
	dir := t.TempDir()
	src, _ := filepath.Abs("historial.py")
	cmd := exec.Command("python3", "-c", driver, src)
	cmd.Env = append(os.Environ(), "DN_HIST_DIR="+dir, "DN_HIST_NO_DOCKER=1")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	var r struct {
		HasData  bool        `json:"hasData"`
		Day      [][]float64 `json:"day"`
		Month    [][]float64 `json:"month"`
		Forecast struct {
			Enough bool    `json:"enough"`
			PerDay float64 `json:"perDay"`
			Days   float64 `json:"days"`
		} `json:"forecast"`
		Apps map[string]struct {
			CPUMax float64     `json:"cpuMax"`
			Series [][]float64 `json:"series"`
		} `json:"apps"`
		Samples int `json:"_samples"`
		Hours   int `json:"_hours"`
	}
	if err := json.Unmarshal(out, &r); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	if !r.HasData || len(r.Day) != 288 {
		t.Fatalf("24 h = 288 muestras: %d", len(r.Day))
	}
	// 29 horas cerradas + la hora en curso.
	if r.Hours != 29 || len(r.Month) != 30 || r.Samples != 30*12 {
		t.Fatalf("horas %d, mes %d, muestras %d", r.Hours, len(r.Month), r.Samples)
	}
	if !r.Forecast.Enough || r.Forecast.PerDay < 1.9e9 || r.Forecast.PerDay > 2.1e9 {
		t.Fatalf("ritmo del disco: %+v", r.Forecast)
	}
	// Quedan ~57,5 GB libres a 2 GB/día ≈ 28,7 días.
	if r.Forecast.Days < 27 || r.Forecast.Days > 30 {
		t.Fatalf("días hasta llenarse: %+v", r.Forecast)
	}
	if a := r.Apps["coolify:blog"]; a.CPUMax != 0.5 || len(a.Series) != 96 {
		t.Fatalf("app: %+v", a)
	}
}

// El script de la ficha lleva el del historial delante y debe ser Python válido.
func TestScriptCompila(t *testing.T) {
	if _, err := exec.LookPath("python3"); err != nil {
		t.Skip("sin python3")
	}
	cmd := exec.Command("python3", "-c", "import sys; compile(sys.stdin.read(), 'ficha', 'exec')")
	cmd.Stdin = strings.NewReader(Script)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
}
