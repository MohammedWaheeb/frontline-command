package server

import (
	"context"
	"encoding/json"
	"errors"
	"frontlinecommand/pkg/sim"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func adviceMatch(t *testing.T, s *Server) *liveMatch {
	t.Helper()
	engine, err := sim.New(s.catalog, sim.Config{Map: testMap(), Seed: 33, Players: []sim.PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	for range 100 {
		engine.Advance()
	}
	m, err := newMatch("advice-fixture", engine, []slot{{Player: 1, Token: "slot-one"}, {Player: 2, Token: "slot-two"}}, s.repo, s.objects)
	if err != nil {
		t.Fatal(err)
	}
	s.mu.Lock()
	s.matches[m.id] = m
	s.mu.Unlock()
	return m
}
func TestCommandAdviceUsesSlotAuthenticationAndNeverChangesMatch(t *testing.T) {
	s, h := testServer(t)
	m := adviceMatch(t, s)
	path := "/api/v1/matches/" + m.id + "/advice"
	profileToken := profile(t, h, "Preview commander")
	for _, token := range []string{"", profileToken, "observer-ticket", "wrong"} {
		request(t, h, "POST", path, token, map[string]any{}, 401)
	}
	expired := m.call(context.Background(), matchRequest{kind: "advice", player: 1, token: "slot-one", adviceDeadline: time.Now().Add(-time.Second)})
	if !errors.Is(expired.err, context.DeadlineExceeded) {
		t.Fatal("expired advice was processed", expired.err)
	}
	before := m.call(context.Background(), matchRequest{kind: "save"})
	body := adviceRequest{Entities: []sim.ID{2}, Orders: []sim.Order{{Kind: "build", Entities: []sim.ID{2}, Type: "power", Position: sim.Vec{X: 13000, Y: 13000}}}}
	got := request(t, h, "POST", path, "slot-one", body, 200)
	var entities []sim.EntityAffordance
	var results []sim.OrderResult
	if err := json.Unmarshal(got["entities"], &entities); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(got["results"], &results); err != nil {
		t.Fatal(err)
	}
	if len(entities) != 1 || entities[0].ID != 2 || len(results) != 1 || results[0].Code != "indeterminate" || !results[0].Accepted {
		t.Fatal(got)
	}
	for _, key := range []string{"map", "state", "players", "rng", "save", "data", "definition"} {
		if _, ok := got[key]; ok {
			t.Fatal("private payload exposed", key)
		}
	}
	independent := request(t, h, "POST", path, "slot-one", adviceRequest{Independent: true, Orders: []sim.Order{{Kind: "move", Entities: []sim.ID{2}, Position: sim.Vec{X: 15000, Y: 13000}}, {Kind: "move", Entities: []sim.ID{2}, Position: sim.Vec{X: 16000, Y: 13000}}}}, 200)
	var alternatives []sim.OrderResult
	if err := json.Unmarshal(independent["results"], &alternatives); err != nil || len(alternatives) != 2 || alternatives[0].Code != "ok" || alternatives[1].Code != "ok" {
		t.Fatal("candidate mode", alternatives, err)
	}
	request(t, h, "POST", path, "slot-one", adviceRequest{Independent: true, Orders: []sim.Order{{Kind: "ability", Entities: []sim.ID{2}, Type: "recon_sweep"}}}, 400)
	after := m.call(context.Background(), matchRequest{kind: "save"})
	if before.err != nil || after.err != nil || string(before.data) != string(after.data) {
		t.Fatal("advice changed live state", before.err, after.err)
	}
	request(t, h, "POST", path, "slot-two", adviceRequest{Entities: []sim.ID{2}}, 400)
	request(t, h, "POST", path, "slot-two", adviceRequest{Entities: []sim.ID{999999}}, 400)
	request(t, h, "POST", path, "slot-one", map[string]any{"player": 2}, 400)
	request(t, h, "POST", path, "slot-one", adviceRequest{Entities: make([]sim.ID, 65)}, 400)
	request(t, h, "POST", path, "slot-one", adviceRequest{Orders: make([]sim.Order, 33)}, 400)
}
func TestCommandAdviceRateAndInFlightBounds(t *testing.T) {
	var gate adviceGate
	now := time.Unix(100, 0)
	if !gate.acquire(1, now) || gate.acquire(1, now.Add(2*time.Second)) {
		t.Fatal("parallel same-slot request accepted")
	}
	gate.release(1)
	for range 3 {
		if !gate.acquire(1, now) {
			t.Fatal("budget too small")
		}
		gate.release(1)
	}
	if gate.acquire(1, now) {
		t.Fatal("rate limit missing")
	}
	if !gate.acquire(1, now.Add(time.Second)) {
		t.Fatal("rate window never recovered")
	}
	gate.release(1)
	var workers adviceWorkGate
	for range 8 {
		if !workers.acquire() {
			t.Fatal("host slots too small")
		}
	}
	if workers.acquire() {
		t.Fatal("unbounded host work")
	}
	workers.release()
	if !workers.acquire() {
		t.Fatal("host slot not reusable")
	}
	s, h := testServer(t)
	m := adviceMatch(t, s)
	path := "/api/v1/matches/" + m.id + "/advice"
	for range 4 {
		request(t, h, "POST", path, "slot-one", adviceRequest{}, 200)
	}
	request(t, h, "POST", path, "slot-one", adviceRequest{}, 429)
	request(t, h, "POST", path, "slot-two", adviceRequest{}, 200)
}

func TestCommandAdviceSkybreakerOwnerPlan(t *testing.T) {
	s, h := testServer(t)
	m := adviceMatch(t, s)
	path := "/api/v1/matches/" + m.id + "/advice"
	before := m.call(context.Background(), matchRequest{kind: "save"})
	point := sim.Vec{X: 8000, Y: 8000}
	body := adviceRequest{Orders: []sim.Order{{Kind: "ability", Type: "strategic", Entities: []sim.ID{2}, Index: 3, Points: []sim.Vec{point, point, point}}}}
	got := request(t, h, "POST", path, "slot-one", body, 200)
	var plans []sim.StrategicPlan
	if err := json.Unmarshal(got["plans"], &plans); err != nil || len(plans) != 1 || plans[0].Edge != 3 || len(plans[0].Routes) != 3 {
		t.Fatal("owner plan lost at HTTP boundary", plans, err)
	}
	for _, route := range plans[0].Routes {
		if route.Impact != point || route.Splash != 2000 || route.ImpactAt != route.ReleaseAt+1 {
			t.Fatal(route)
		}
	}
	request(t, h, "POST", path, "slot-two", body, 400)
	body.Independent = true
	request(t, h, "POST", path, "slot-one", body, 400)
	after := m.call(context.Background(), matchRequest{kind: "save"})
	if before.err != nil || after.err != nil || string(before.data) != string(after.data) {
		t.Fatal("route advice mutated hosted game")
	}
}
func TestAdviceDoesNotConsumeGeneralWriteAdmission(t *testing.T) {
	var gate admissionControl
	now := time.Unix(1, 0)
	req := httptest.NewRequest("POST", "http://localhost/api/v1/matches/a/advice", strings.NewReader("{}"))
	req.RemoteAddr = "127.0.0.1:1234"
	for range 300 {
		if !gate.allow(req, now) {
			t.Fatal("advice allowance too small")
		}
	}
	if gate.allow(req, now) {
		t.Fatal("advice IP bound missing")
	}
	req.URL.Path = "/api/v1/settings"
	if !gate.allow(req, now) {
		t.Fatal("advice starved unrelated writes")
	}
}
