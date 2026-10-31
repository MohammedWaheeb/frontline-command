package server

import (
	"testing"
	"time"
)

func TestProfileCreationGlobalRateLimit(t *testing.T) {
	s, h := testServer(t)
	s.profileLimitOverride = 2

	// Legitimate first-run creation works until the global budget is spent,
	// regardless of source (the per-IP admission budget is separate).
	profile(t, h, "First commander")
	profile(t, h, "Second commander")
	rejected := request(t, h, "POST", "/api/v1/profiles", "", map[string]any{"name": "Sybil"}, 429)
	if string(rejected["code"]) != `"profile_creation_limited"` {
		t.Fatal("global profile limit response", rejected)
	}

	// A rejected invalid profile does not consume creation budget, and the
	// window resets so later legitimate players can still join.
	s.profileMu.Lock()
	s.profileWindowStart = time.Now().Add(-2 * profileCreationWindow)
	s.profileMu.Unlock()
	request(t, h, "POST", "/api/v1/profiles", "", map[string]any{"name": ""}, 400)
	profile(t, h, "Later commander")
	profile(t, h, "Final commander")
	request(t, h, "POST", "/api/v1/profiles", "", map[string]any{"name": "Sybil again"}, 429)
}
