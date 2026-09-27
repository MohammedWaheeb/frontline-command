package server

import (
	"context"
	"encoding/json"
	"errors"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestAdmissionRateAndRecovery(t *testing.T) {
	var gate admissionControl
	r := httptest.NewRequest("POST", "/api/v1/profiles", nil)
	r.RemoteAddr = "127.0.0.1:12345"
	now := time.Now()
	for range 10 {
		if !gate.allow(r, now) {
			t.Fatal("legitimate profile burst rejected")
		}
	}
	if gate.allow(r, now) {
		t.Fatal("profile burst unbounded")
	}
	if !gate.allow(r, now.Add(time.Minute)) {
		t.Fatal("limit never recovers")
	}
	r.RemoteAddr = "127.0.0.2:54321"
	if !gate.allow(r, now) {
		t.Fatal("independent LAN peer blocked")
	}
}
func TestLobbyPatchIsAtomicAndLeaveTransfersHost(t *testing.T) {
	s, h := testServer(t)
	host := profile(t, h, "Host")
	guest := profile(t, h, "Guest")
	request(t, h, "POST", "/api/v1/maps", host, map[string]any{"map": testMap()}, 201)
	created := request(t, h, "POST", "/api/v1/lobbies", host, map[string]any{"name": "Test", "map_id": testMap().ID, "mode": "custom", "faction": "US"}, 201)
	var l Lobby
	json.Unmarshal(created["lobby"], &l)
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", guest, map[string]any{"faction": "IR"}, 200)
	request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, guest, map[string]any{"faction": "SA", "map_id": testMap().ID}, 403)
	s.mu.Lock()
	faction := s.lobbies[l.ID].Slots[1].Faction
	s.mu.Unlock()
	if faction != "IR" {
		t.Fatal("rejected mutation partly applied")
	}
	request(t, h, "DELETE", "/api/v1/lobbies/"+l.ID+"/membership", host, nil, 204)
	info := request(t, h, "GET", "/api/v1/lobbies/"+l.ID, guest, nil, 200)
	json.Unmarshal(info["lobby"], &l)
	if len(l.Slots) != 1 || l.Host != l.Slots[0].Profile {
		t.Fatal("host not transferred")
	}
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", host, map[string]any{"faction": "US"}, 200)
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.lobbies[l.ID].Slots[0].Player == s.lobbies[l.ID].Slots[1].Player {
		t.Fatal("player slot reused while occupied")
	}
}
func TestReplayDownloadRequiresCompletedResult(t *testing.T) {
	s, h := testServer(t)
	token := profile(t, h, "Replay viewer")
	participant, err := s.repo.Authenticate(context.Background(), token)
	if err != nil {
		t.Fatal(err)
	}
	engine, err := sim.New(s.catalog, sim.Config{Map: testMap(), Seed: 9, Players: []sim.PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	replay, _ := sim.NewReplay(engine)
	data, _ := replay.Encode()
	checkpoint, _ := engine.Save()
	if err = s.repo.StartMatchAccess(context.Background(), "record", 0, checkpoint, []storage.MatchMember{{Profile: participant.ID, Player: 1}}, false); err != nil {
		t.Fatal(err)
	}
	if err = s.objects.Put(context.Background(), "record.replay", data); err != nil {
		t.Fatal(err)
	}
	request(t, h, "GET", "/api/v1/replays/record", token, nil, 404)
	_, err = s.repo.CommitResult(context.Background(), storage.Result{ID: "record", Payload: []byte(`{"finished":true}`)})
	if err != nil {
		t.Fatal(err)
	}
	req, _ := http.NewRequest("GET", h.URL+"/api/v1/replays/record", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	b, _ := io.ReadAll(response.Body)
	if response.StatusCode != 200 {
		t.Fatal("download failed", response.StatusCode)
	}
	decoded, err := sim.DecodeReplay(b)
	if err != nil {
		t.Fatal(err)
	}
	restored, err := decoded.Seek(s.catalog, 0)
	if err != nil || restored.Hash() != engine.Hash() {
		t.Fatal("download replay does not restore", err)
	}
}

func TestObserverArchiveDelayAndFog(t *testing.T) {
	s, h := testServer(t)
	_ = h
	engine, err := sim.New(s.catalog, sim.Config{Map: testMap(), Seed: 2, Players: []sim.PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	archive := newObserverArchive()
	slots := []slot{{Player: 1}, {Player: 2}}
	archive.capture(engine, slots)
	for range 2404 {
		engine.Advance()
		archive.capture(engine, slots)
	}
	if _, err = archive.read(1, 2399, 2400); err == nil {
		t.Fatal("observer received future state before delay")
	}
	raw, err := archive.read(1, 2404, 2400)
	if err != nil {
		t.Fatal(err)
	}
	snap := new(pb.PlayerSnapshot)
	if err = proto.Unmarshal(raw, snap); err != nil {
		t.Fatal(err)
	}
	if snap.Tick != 4 {
		t.Fatal("wrong delayed tick", snap.Tick)
	}
	for _, v := range snap.Entities {
		if v.Owner == 2 {
			t.Fatal("observer perspective leaked fogged enemy")
		}
	}
	if _, err = archive.read(1, engine.Tick(), 0); err != nil {
		t.Fatal("private live view unavailable", err)
	}
}
func TestObserverTicketsRejectActivePlayers(t *testing.T) {
	s, h := testServer(t)
	active := profile(t, h, "Active")
	watcher := profile(t, h, "Observer")
	p, err := s.repo.Authenticate(context.Background(), active)
	if err != nil {
		t.Fatal(err)
	}
	engine, err := sim.New(s.catalog, sim.Config{Map: testMap(), Seed: 2, Players: []sim.PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	m, err := newMatch("observe", engine, []slot{{Player: 1, Profile: p.ID}, {Player: 2}}, s.repo, s.objects)
	if err != nil {
		t.Fatal(err)
	}
	s.mu.Lock()
	s.matches[m.id] = m
	s.lobbies["watch"] = &Lobby{ID: "watch", Host: p.ID, MatchID: m.id}
	s.mu.Unlock()
	request(t, h, "POST", "/api/v1/matches/observe/observer", active, map[string]any{"player": 2}, 409)
	ticket := request(t, h, "POST", "/api/v1/matches/observe/observer", watcher, map[string]any{"player": 2}, 201)
	var token string
	json.Unmarshal(ticket["token"], &token)
	request(t, h, "GET", "/api/v1/matches/observe/observer", token, nil, 202)
	request(t, h, "GET", "/api/v1/matches/observe/observer", watcher, nil, 403)
}

func TestExclusiveHostAndCrashRecovery(t *testing.T) {
	dir := t.TempDir()
	command := exec.Command(os.Args[0], "-test.run=^TestCrashRecoveryChild$")
	command.Env = append(os.Environ(), "FRONTLINE_RECOVERY_CHILD="+dir)
	err := command.Run()
	var exit *exec.ExitError
	if !errors.As(err, &exit) || exit.ExitCode() != 17 {
		t.Fatal("crash helper did not exit at intended point", err)
	}
	s, err := New(Config{DataDir: dir, MapDir: filepath.Join(dir, "no-maps")})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err = New(Config{DataDir: dir}); err == nil {
		t.Fatal("second host acquired same data directory")
	}
	result, err := s.repo.GetResult(context.Background(), "interrupted-match")
	if err != nil || !result.Void {
		t.Fatal("crash did not void result", err)
	}
	save, err := s.objects.Get(context.Background(), "interrupted-match.diagnostic")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = sim.Restore(s.catalog, save); err != nil {
		t.Fatal("crash checkpoint corrupt", err)
	}
	n, err := s.repo.RecoverInterrupted(context.Background(), s.objects)
	if err != nil || n != 0 {
		t.Fatal("outage recovery duplicated result", n, err)
	}
}
func TestCrashRecoveryChild(t *testing.T) {
	dir := os.Getenv("FRONTLINE_RECOVERY_CHILD")
	if dir == "" {
		return
	}
	s, err := New(Config{DataDir: dir, MapDir: filepath.Join(dir, "no-maps")})
	if err != nil {
		t.Fatal(err)
	}
	engine, err := sim.New(s.catalog, sim.Config{Map: testMap(), Seed: 6, Players: []sim.PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = newMatch("interrupted-match", engine, []slot{{Player: 1}, {Player: 2}}, s.repo, s.objects); err != nil {
		t.Fatal(err)
	}
	os.Exit(17)
}
