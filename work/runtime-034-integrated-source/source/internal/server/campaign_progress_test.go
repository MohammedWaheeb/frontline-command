package server

import (
	"bytes"
	"strings"
	"testing"
)

const serverCampaignFixture = `{"version":1,"results":["solo-result-one"],"missions":{"us-01:1:normal":{"mission":"us-01","mission_version":"1","difficulty":"normal","completions":1,"first_completed":1750000000000,"last_completed":1750000000000,"best_tick":1200,"optional_objectives":[]}}}`

func TestCampaignProgressHTTPPrivacyValidationAndCAS(t *testing.T) {
	s, h := testServer(t)
	a, b := profile(t, h, "A"), profile(t, h, "B")
	route := "/api/v1/progress/campaign"
	peer := "127.0.0.1:14000"
	securityCall(t, s, "GET", route, "", peer, "", 401)
	body := `{"expected_revision":0,"data":` + serverCampaignFixture + `}`
	written := securityCall(t, s, "PUT", route, "Bearer "+a, peer, body, 200)
	if !bytes.Contains(written.Body.Bytes(), []byte(`"revision":1`)) {
		t.Fatal(written.Body.String())
	}
	own := securityCall(t, s, "GET", route, "Bearer "+a, peer, "", 200)
	if !bytes.Contains(own.Body.Bytes(), []byte("solo-result-one")) {
		t.Fatal("own progress missing")
	}
	other := securityCall(t, s, "GET", route+"?owner=forged", "Bearer "+b, peer, "", 200)
	if bytes.Contains(other.Body.Bytes(), []byte("solo-result-one")) {
		t.Fatal("foreign progress disclosed")
	}
	securityCall(t, s, "PUT", route, "Bearer "+a, peer, body, 409)
	for _, invalid := range []string{strings.Replace(body, `"expected_revision":0`, `"expected_revision":1,"owner":"other"`, 1), body + `{}`, `{"expected_revision":1,"data":{"version":2,"results":[],"missions":{}}}`, strings.Repeat(" ", 261<<10) + body} {
		securityCall(t, s, "PUT", route, "Bearer "+a, peer, invalid, 400)
	}
	after := securityCall(t, s, "GET", route, "Bearer "+a, peer, "", 200)
	if !bytes.Equal(own.Body.Bytes(), after.Body.Bytes()) {
		t.Fatal("invalid write altered ledger")
	}
	// Replacing a story backup must not manufacture authoritative match history.
	history := securityCall(t, s, "GET", "/api/v1/history", "Bearer "+a, peer, "", 200)
	if bytes.Contains(history.Body.Bytes(), []byte("solo-result-one")) {
		t.Fatal("story record became match history")
	}
}
func TestCampaignWritesUseSharedAdmissionLimit(t *testing.T) {
	s, h := testServer(t)
	token := profile(t, h, "Commander")
	for range 120 {
		securityCall(t, s, "PUT", "/api/v1/progress/campaign", "Bearer "+token, "198.51.100.82:12000", `{"data":{}}`, 400)
	}
	securityCall(t, s, "PUT", "/api/v1/progress/campaign", "Bearer "+token, "198.51.100.82:12000", `{"data":{}}`, 429)
}
