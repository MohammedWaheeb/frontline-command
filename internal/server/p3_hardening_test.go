package server

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestSlotForTokenExactMatchOnly(t *testing.T) {
	m := &liveMatch{slots: []slot{{Player: 1, Token: "secret-token"}, {Player: 2, Token: "ai-token", AI: true}}}
	if s, ok := m.slotForToken("secret-token"); !ok || s.Player != 1 {
		t.Fatal("valid token rejected")
	}
	for _, bad := range []string{"", "secret", "secret-tokenx", "SECRET-TOKEN", "ai-token"} {
		if _, ok := m.slotForToken(bad); ok {
			t.Fatalf("token %q accepted", bad)
		}
	}
}

func TestErrorResponsesDoNotLeakInternals(t *testing.T) {
	_, hs := testServer(t)
	defer hs.Close()
	// Unknown-field JSON reaches decode(), whose Go error names internals.
	resp, err := http.Post(hs.URL+"/api/v1/profiles", "application/json", strings.NewReader(`{"name":"Fixture","admin":true}`))
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 400 {
		t.Fatal(resp.StatusCode, string(body))
	}
	var decoded map[string]string
	if err = json.Unmarshal(body, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded["code"] != "invalid_request" {
		t.Fatal(decoded)
	}
	for _, leak := range []string{"unknown field", "json:", "struct", "admin"} {
		if strings.Contains(decoded["message"], leak) {
			t.Fatalf("error message leaks %q: %s", leak, decoded["message"])
		}
	}
}
