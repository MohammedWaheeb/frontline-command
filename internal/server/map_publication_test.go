package server

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestMapPrivatePublicationReportsAndRemoval(t *testing.T) {
	s, h := testServer(t)
	author, reader, other := profile(t, h, "Real author"), profile(t, h, "Reporter"), profile(t, h, "Other")
	mapData := testMap()
	base := "/api/v1/maps/" + mapData.ID
	uploaded := request(t, h, "POST", "/api/v1/maps", author, map[string]any{"map": mapData}, 201)
	if string(uploaded["published"]) != "false" || string(uploaded["owner_name"]) != `"Real author"` {
		t.Fatal("private authenticated attribution", uploaded)
	}
	request(t, h, "GET", base, "", nil, 404)
	request(t, h, "GET", base, reader, nil, 404)
	request(t, h, "GET", base, author, nil, 200)
	listed := securityCall(t, s, "GET", "/api/v1/maps", "", "127.0.0.1:12345", "", 200)
	if bytes.Contains(listed.Body.Bytes(), []byte(mapData.ID)) {
		t.Fatal("private map publicly listed")
	}
	own := securityCall(t, s, "GET", "/api/v1/maps/mine", "Bearer "+author, "127.0.0.1:12345", "", 200)
	if !bytes.Contains(own.Body.Bytes(), []byte(mapData.ID)) {
		t.Fatal("own map missing")
	}
	foreign := securityCall(t, s, "GET", "/api/v1/maps/mine", "Bearer "+reader, "127.0.0.1:12345", "", 200)
	if bytes.Contains(foreign.Body.Bytes(), []byte(mapData.ID)) {
		t.Fatal("foreign private map in library")
	}
	request(t, h, "PATCH", base+"/publication", reader, map[string]any{"published": true, "expected_revision": 1}, 404)
	request(t, h, "PATCH", base+"/publication", author, map[string]any{"published": true, "expected_revision": 1}, 200)
	request(t, h, "GET", base, "", nil, 200)
	listed = securityCall(t, s, "GET", "/api/v1/maps", "", "127.0.0.1:12345", "", 200)
	var entries []map[string]any
	if err := json.Unmarshal(listed.Body.Bytes(), &entries); err != nil || len(entries) != 1 || entries[0]["ranked"] != false || entries[0]["owner_name"] != "Real author" || entries[0]["hash"] != lobbyMapHash(mapData) {
		t.Fatal("public attribution/metadata/ranked", entries, err)
	}
	receipt := request(t, h, "POST", base+"/reports", reader, map[string]any{"reason": "Shared map contains an unsuitable title"}, 201)
	var reportID string
	json.Unmarshal(receipt["id"], &reportID)
	if len(receipt["owner"]) > 0 || len(receipt["note"]) > 0 {
		t.Fatal("reporter response contains private fields")
	}
	request(t, h, "POST", base+"/reports", reader, map[string]any{"reason": "No identity override", "owner": "forged"}, 400)
	admin := "Bearer " + moderatorToken(t, s)
	reviewPath := "/api/v1/admin/map-reports/" + reportID
	securityCall(t, s, "GET", reviewPath, "Bearer "+author, "127.0.0.1:12345", "", 403)
	securityCall(t, s, "GET", reviewPath, admin, "192.168.1.2:12345", "", 403)
	detail := securityCall(t, s, "GET", reviewPath, admin, "127.0.0.1:12345", "", 200)
	if !bytes.Contains(detail.Body.Bytes(), []byte(`"reported_map"`)) {
		t.Fatal("report evidence missing")
	}
	securityCall(t, s, "POST", reviewPath+"/reviews", admin, "127.0.0.1:12345", `{"decision":"removed","note":"Confirmed report against original","expected_revision":0,"expected_map_revision":2}`, 200)
	request(t, h, "GET", base, "", nil, 404)
	request(t, h, "GET", base, author, nil, 200)
	request(t, h, "PATCH", base+"/publication", author, map[string]any{"published": true, "expected_revision": 3}, 404)
	rows := securityCall(t, s, "GET", "/api/v1/map-reports", "Bearer "+reader, "127.0.0.1:12345", "", 200)
	if bytes.Contains(rows.Body.Bytes(), []byte("Confirmed report")) || !bytes.Contains(rows.Body.Bytes(), []byte(`"decision":"removed"`)) {
		t.Fatal("own report visibility", rows.Body.String())
	}
	rows = securityCall(t, s, "GET", "/api/v1/map-reports", "Bearer "+other, "127.0.0.1:12345", "", 200)
	if bytes.Contains(rows.Body.Bytes(), []byte(reportID)) {
		t.Fatal("cross-profile report leak")
	}
	request(t, h, "GET", "/api/v1/map-reports?before="+reportID, other, nil, 404)
	securityCall(t, s, "POST", reviewPath+"/reviews", admin, "127.0.0.1:12345", `{"decision":"restored","note":"Rechecked","expected_revision":1,"expected_map_revision":2}`, 409)
	securityCall(t, s, "POST", reviewPath+"/reviews", admin, "127.0.0.1:12345", `{"decision":"restored","note":"Rechecked","expected_revision":1,"expected_map_revision":3}`, 200)
	request(t, h, "GET", base, "", nil, 404) // Operator restore does not publish for the author.
	request(t, h, "PATCH", base+"/publication", author, map[string]any{"published": true, "expected_revision": 4}, 200)
	request(t, h, "GET", base, "", nil, 200)
}

func TestPrivateMapLobbyAndActiveMapContextPreserveExactRevision(t *testing.T) {
	s, h := testServer(t)
	author, guest, observer := profile(t, h, "Author"), profile(t, h, "Guest"), profile(t, h, "Observer")
	original := testMap()
	base := "/api/v1/maps/" + original.ID
	request(t, h, "POST", "/api/v1/maps", author, map[string]any{"map": original}, 201)
	body := map[string]any{"map_id": original.ID, "mode": "custom", "faction": "US", "private": false}
	request(t, h, "POST", "/api/v1/lobbies", author, body, 403)
	body["private"] = true
	request(t, h, "POST", "/api/v1/lobbies", guest, body, 403)
	created := request(t, h, "POST", "/api/v1/lobbies", author, body, 201)
	l := responseLobby(t, created)
	var code string
	json.Unmarshal(created["code"], &code)
	request(t, h, "GET", base+"?lobby_id="+l.ID, guest, nil, 404)
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", guest, map[string]any{"code": code, "faction": "IR"}, 200)
	request(t, h, "GET", base, guest, nil, 404)
	loaded := request(t, h, "GET", base+"?lobby_id="+l.ID, guest, nil, 200)
	if string(loaded["version"]) != `"1"` {
		t.Fatal("wrong admitted map", loaded)
	}
	request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, author, map[string]any{"private": false}, 403)
	for _, token := range []string{author, guest} {
		readyTestLobby(t, s, h, l.ID, token)
	}
	started := request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", author, map[string]any{}, 201)
	var connection map[string]any
	json.Unmarshal(started["connection"], &connection)
	matchID := connection["match_id"].(string)
	request(t, h, "GET", base+"?match_id="+matchID, observer, nil, 404)
	request(t, h, "POST", "/api/v1/matches/"+matchID+"/observer", observer, map[string]any{"player": 1, "code": code}, 201)
	revised := original
	revised.Version = "2"
	revised.Title = "Changed after launch"
	request(t, h, "POST", "/api/v1/maps", author, map[string]any{"map": revised, "expected_revision": 1}, 201)
	request(t, h, "PATCH", base+"/publication", author, map[string]any{"published": true, "expected_revision": 2}, 200)
	receipt := request(t, h, "POST", base+"/reports", guest, map[string]any{"reason": "Review current edited version"}, 201)
	var reportID string
	json.Unmarshal(receipt["id"], &reportID)
	securityCall(t, s, "POST", "/api/v1/admin/map-reports/"+reportID+"/reviews", "Bearer "+moderatorToken(t, s), "127.0.0.1:12345", `{"decision":"removed","note":"Remove changed content","expected_revision":0,"expected_map_revision":3}`, 200)
	for _, token := range []string{author, guest, observer} {
		response := securityCall(t, s, "GET", base+"?match_id="+matchID, "Bearer "+token, "127.0.0.1:12345", "", 200)
		if response.Header().Get("X-Frontline-Map-Hash") != lobbyMapHash(original) {
			t.Fatal("active match map changed")
		}
		var record map[string]json.RawMessage
		json.Unmarshal(response.Body.Bytes(), &record)
		if string(record["version"]) != `"1"` {
			t.Fatal("active map revision replaced")
		}
	}
	request(t, h, "GET", base, guest, nil, 404)
	request(t, h, "GET", "/api/v1/maps/another?match_id="+matchID, guest, nil, 404)
	request(t, h, "GET", base+"?match_id="+matchID+"&lobby_id="+l.ID, guest, nil, 400)
	request(t, h, "GET", base+"?match_id="+matchID, "", nil, 401)
}

func TestMapRevisionsInvalidateFormingReadiness(t *testing.T) {
	s, h := testServer(t)
	author := profile(t, h, "Author")
	m := testMap()
	base := "/api/v1/maps/" + m.ID
	request(t, h, "POST", "/api/v1/maps", author, map[string]any{"map": m}, 201)
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", author, map[string]any{"map_id": m.ID, "mode": "custom", "private": true, "faction": "US"}, 201))
	readyTestLobby(t, s, h, l.ID, author)
	m.Version = "2"
	request(t, h, "POST", "/api/v1/maps", author, map[string]any{"map": m, "expected_revision": 1}, 201)
	result := request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", author, map[string]any{}, 409)
	if string(result["code"]) != `"map_changed"` {
		t.Fatal("changed map started without readiness invalidation", result)
	}
	current := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+l.ID, author, nil, 200))
	if current.Slots[0].Ready || current.MapHash != lobbyMapHash(m) || current.Revision <= l.Revision {
		t.Fatal("changed map metadata", current)
	}
	loaded := request(t, h, "GET", base+"?lobby_id="+l.ID, author, nil, 200)
	if string(loaded["version"]) != `"2"` {
		t.Fatal("new forming map unavailable")
	}
	readyTestLobby(t, s, h, l.ID, author)
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", author, map[string]any{}, 201)
}
