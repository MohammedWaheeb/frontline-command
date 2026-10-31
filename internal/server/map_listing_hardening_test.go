package server

import (
	"encoding/json"
	"testing"
)

func mapListingEntries(t *testing.T, s *Server, token string, want int) []map[string]any {
	t.Helper()
	auth := ""
	if token != "" {
		auth = "Bearer " + token
	}
	rec := securityCall(t, s, "GET", "/api/v1/maps", auth, "127.0.0.1:12345", "", want)
	if want != 200 {
		return nil
	}
	var entries []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &entries); err != nil {
		t.Fatalf("map listing is not a JSON array: %v (%s)", err, rec.Body.String())
	}
	return entries
}

func TestMapListingRequiresAuthAndHidesOwnerID(t *testing.T) {
	s, h := testServer(t)
	author, reader := profile(t, h, "Listing author"), profile(t, h, "Listing reader")
	mapData := testMap()
	request(t, h, "POST", "/api/v1/maps", author, map[string]any{"map": mapData}, 201)
	request(t, h, "PATCH", "/api/v1/maps/"+mapData.ID+"/publication", author, map[string]any{"published": true, "expected_revision": 1}, 200)

	// Unauthenticated callers must not enumerate published maps or trigger
	// per-map decode work.
	mapListingEntries(t, s, "", 401)
	securityCall(t, s, "GET", "/api/v1/maps", "Bearer not-a-token", "127.0.0.1:12345", "", 401)

	entries := mapListingEntries(t, s, reader, 200)
	if len(entries) != 1 {
		t.Fatalf("authenticated listing entries = %d, want 1: %v", len(entries), entries)
	}
	entry := entries[0]
	if _, leaked := entry["owner"]; leaked {
		t.Fatal("map listing leaks the owner profile ID")
	}
	// owner_name is a public display name the shipped client renders as
	// "By …" (client/src/ui/network/maps.tsx), so it stays.
	if entry["owner_name"] != "Listing author" || entry["hash"] != lobbyMapHash(mapData) {
		t.Fatal("map listing lost public attribution or hash", entry)
	}
}

func TestMapListingCacheInvalidatesOnPublicationChanges(t *testing.T) {
	s, h := testServer(t)
	author := profile(t, h, "Cache author")
	mapData := testMap()
	base := "/api/v1/maps/" + mapData.ID
	request(t, h, "POST", "/api/v1/maps", author, map[string]any{"map": mapData}, 201)

	if entries := mapListingEntries(t, s, author, 200); len(entries) != 0 {
		t.Fatal("private map listed before publication", entries)
	}
	request(t, h, "PATCH", base+"/publication", author, map[string]any{"published": true, "expected_revision": 1}, 200)
	first := mapListingEntries(t, s, author, 200)
	if len(first) != 1 {
		t.Fatal("published map missing after cache invalidation", first)
	}
	// Repeated listings are stable (served from the decoded cache).
	second := mapListingEntries(t, s, author, 200)
	if len(second) != 1 || second[0]["hash"] != first[0]["hash"] || second[0]["revision"] != first[0]["revision"] {
		t.Fatal("repeated listing changed", second)
	}
	request(t, h, "PATCH", base+"/publication", author, map[string]any{"published": false, "expected_revision": 2}, 200)
	if entries := mapListingEntries(t, s, author, 200); len(entries) != 0 {
		t.Fatal("unpublished map still listed; cache not invalidated", entries)
	}
}
