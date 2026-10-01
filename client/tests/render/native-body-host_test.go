package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	if os.Getenv("FRONTLINE_NATIVE_BODY_HOST") == "1" {
		main()
		return
	}
	os.Exit(m.Run())
}

type shortWriter struct {
	header http.Header
	n      int
	err    error
	got    []byte
}

func (w *shortWriter) Header() http.Header         { return w.header }
func (w *shortWriter) WriteHeader(int)             {}
func (w *shortWriter) Write(p []byte) (int, error) { w.got = p; return w.n, w.err }
func TestExactWrittenPrefixAndError(t *testing.T) {
	marker := errors.New("native short-write marker")
	native := &shortWriter{header: http.Header{}, n: 3, err: marker}
	w := &bodyWriter{ResponseWriter: native, sum: sha256.New()}
	p := []byte("abcdef")
	n, err := w.Write(p)
	sum := sha256.Sum256(p[:3])
	if n != 3 || err != marker || w.bytes != 3 || hex.EncodeToString(w.sum.Sum(nil)) != hex.EncodeToString(sum[:]) || &native.got[0] != &p[0] {
		t.Fatal("changed native write/result or hashed unwritten bytes")
	}
	if w.Unwrap() != native {
		t.Fatal("lost native writer")
	}
}
func TestAdviceObserverPreservesResponse(t *testing.T) {
	var output bytes.Buffer
	l := &bodyLog{out: &output, ordinals: map[string]int{}}
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Exact", "original")
		w.WriteHeader(200)
		_, _ = w.Write([]byte("{\"ok\":true}\n"))
	})
	plain, observed := httptest.NewRecorder(), httptest.NewRecorder()
	request := httptest.NewRequest("POST", "http://localhost/api/v1/matches/abc/advice", nil)
	next.ServeHTTP(plain, request)
	observeAdvice(next, l).ServeHTTP(observed, request)
	if plain.Code != observed.Code || plain.Body.String() != observed.Body.String() || plain.Header().Get("X-Exact") != observed.Header().Get("X-Exact") {
		t.Fatal("response changed")
	}
	var row map[string]any
	if err := json.Unmarshal(output.Bytes(), &row); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(plain.Body.Bytes())
	if row["sha256"] != hex.EncodeToString(sum[:]) || row["bytes"] != float64(plain.Body.Len()) || row["handler_returned"] != true {
		t.Fatal(row)
	}
}
func TestOtherRoutesKeepWriterIdentity(t *testing.T) {
	var output bytes.Buffer
	l := &bodyLog{out: &output, ordinals: map[string]int{}}
	native := httptest.NewRecorder()
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if w != native {
			t.Fatal("unrelated route wrapped")
		}
	})
	observeAdvice(next, l).ServeHTTP(native, httptest.NewRequest("GET", "http://localhost/art/a.png", nil))
	if output.Len() != 0 {
		t.Fatal("unrelated request recorded")
	}
}
func TestHashMismatchControlIsSameLengthDifferentBytes(t *testing.T) {
	w := httptest.NewRecorder()
	diagnosticControls(http.NotFoundHandler()).ServeHTTP(w, httptest.NewRequest("GET", "http://localhost/__diagnostics__/body-proof/wrong-hash", nil))
	if w.Code != 200 || w.Body.Len() != len(controlBody) || w.Body.String() == controlBody {
		t.Fatal("invalid negative control")
	}
}
