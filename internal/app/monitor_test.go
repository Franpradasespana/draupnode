package app

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestResumenDePrometheus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("query")
		val := func(v string) string {
			return `{"status":"success","data":{"resultType":"vector","result":[{"metric":{},"value":[1,"` + v + `"]}]}}`
		}
		switch {
		case strings.HasPrefix(q, "100 - "):
			fmt.Fprint(w, val("12.5"))
		case strings.Contains(q, "MemAvailable"):
			fmt.Fprint(w, val("40"))
		case strings.HasPrefix(q, "node_memory_MemTotal"):
			fmt.Fprint(w, val("2147483648"))
		case strings.HasPrefix(q, "(1 - node_filesystem"):
			fmt.Fprint(w, val("63.2"))
		case q == "up":
			fmt.Fprint(w, `{"status":"success","data":{"result":[{"metric":{"job":"node"},"value":[1,"1"]},{"metric":{"job":"postgres"},"value":[1,"0"]}]}}`)
		case strings.Contains(q, "container_last_seen"):
			fmt.Fprint(w, val("7"))
		default:
			fmt.Fprint(w, `{"status":"success","data":{"result":[]}}`)
		}
	}))
	defer srv.Close()
	st, err := queryStats(srv.URL + "/")
	if err == nil && st.DiskFree != 0 {
		t.Fatalf("sin dato debe quedar a 0: %v", st.DiskFree)
	}
	if err != nil {
		t.Fatal(err)
	}
	if st.CPU != 12.5 || st.RAM != 40 || st.RAMTotal != 2147483648 || st.Disk != 63.2 || st.Containers != 7 || len(st.Targets) != 2 || st.Targets[1].Up {
		t.Fatalf("%+v", st)
	}
}
