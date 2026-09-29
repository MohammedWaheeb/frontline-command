package sim_test

// Additional acceptance paths start the unchanged authored mission and use only
// ordinary commands. These cases deliberately make tactical mistakes to prove
// authored loss predicates; surrender is forbidden in their command history.
import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"frontlinecommand/pkg/sim"
)

func (r *authoredRun) finishAuthoredFailure(objective string) {
	r.t.Helper()
	outcome := r.engine.Outcome()
	if !outcome.Finished || outcome.Reason != "mission_failed" || outcome.WinningTeam != 0 || !r.complete(objective) {
		r.t.Fatalf("expected authored failure %s, got %+v objectives %+v", objective, outcome, r.view().Mission.Objectives)
	}
	for _, batch := range r.orders {
		for _, order := range batch.Orders {
			if order.Kind == "surrender" {
				r.t.Fatal("surrender does not prove authored loss")
			}
		}
	}
	if r.midpoint == 0 || r.twin == nil || r.engine.Hash() != r.twin.Hash() {
		r.t.Fatal("authored failure midpoint restore diverged")
	}
	if err := r.replay.Capture(r.engine, false); err != nil {
		r.t.Fatal(err)
	}
	full := *r.replay
	full.Checkpoints = nil
	played, err := full.Open(r.catalog, r.engine.Tick())
	if err != nil {
		r.t.Fatal(err)
	}
	if played.Engine().Hash() != r.engine.Hash() {
		r.t.Fatal("authored failure full replay diverged")
	}
	saved, err := r.engine.Save()
	if err != nil {
		r.t.Fatal(err)
	}
	restored, err := sim.Restore(r.catalog, saved)
	if err != nil {
		r.t.Fatal(err)
	}
	if restored.Hash() != r.engine.Hash() {
		r.t.Fatal("ended authored failure restore diverged")
	}
	restarted, err := sim.NewMission(r.catalog, r.gameMap, r.definition, r.difficulty, 19027)
	if err != nil {
		r.t.Fatal(err)
	}
	if restarted.Hash() != r.initialHash {
		r.t.Fatal("authored failure restart diverged")
	}
	if r.engine.Debrief() == nil {
		r.t.Fatal("authored failure debrief missing")
	}
	record := struct {
		Mission, Difficulty, FailureObjective, Route string
		Tick, Midpoint                               sim.Tick
		FinalHash                                    string
		Outcome                                      sim.Outcome
		Objectives                                   any
		Orders                                       []authoredOrder
		Debrief                                      any
	}{r.definition.ID, r.difficulty, objective, r.evidenceSuffix, r.engine.Tick(), r.midpoint, r.engine.Hash(), outcome, r.view().Mission.Objectives, r.orders, r.engine.Debrief()}
	if directory := os.Getenv("FRONTLINE_MISSION_EVIDENCE"); directory != "" {
		directory = filepath.Join(directory, "authored-paths")
		if err := os.MkdirAll(directory, 0755); err != nil {
			r.t.Fatal(err)
		}
		bytes, err := json.MarshalIndent(record, "", "  ")
		if err != nil {
			r.t.Fatal(err)
		}
		if err = os.WriteFile(filepath.Join(directory, r.definition.ID+r.evidenceSuffix+".json"), append(bytes, '\n'), 0644); err != nil {
			r.t.Fatal(err)
		}
	}
	r.t.Logf("AUTHORED_FAILURE %s objective=%s difficulty=%s tick=%d midpoint=%d receipts=%d hash=%s", r.definition.ID, objective, r.difficulty, r.engine.Tick(), r.midpoint, len(r.orders), r.engine.Hash())
}
func (r *authoredRun) authoredPoint(tag string) sim.Vec {
	r.t.Helper()
	for _, actor := range r.definition.Initial {
		if actor.Tag == tag {
			return sim.Vec{X: actor.Position.X, Y: actor.Position.Y}
		}
	}
	r.t.Fatalf("missing authored hint %s", tag)
	return sim.Vec{}
}
func sendUnsupported(r *authoredRun, tag string, point sim.Vec) {
	ids := r.ids(tag)
	r.issue(1, sim.Order{Kind: "move", Entities: ids, Position: point}, sim.Order{Kind: "hold", Entities: ids, Queued: true})
	r.advance(150)
	r.checkpoint()
}
func TestAuthoredSpecificFailures(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated ordinary-order authored loss paths")
	}
	cases := []struct {
		id, objective string
		limit         sim.Tick
		play          func(*authoredRun)
	}{
		{"us-02-open-corridor", "convoy-lost", 14000, func(r *authoredRun) { sendUnsupported(r, "convoy", r.region("enemy")) }},
		{"ir-02-eyes-above", "launchers-lost", 14000, func(r *authoredRun) { sendUnsupported(r, "launch-convoy", r.region("enemy")) }},
		{"tutorial-3-read-the-counter", "transport-team-lost", 8000, func(r *authoredRun) { sendUnsupported(r, "transport-team", r.authoredPoint("counter-armor")) }},
		{"sy-01-workshop-foothold", "lost-recovery-rig", 16000, func(r *authoredRun) {
			r.issue(1, sim.Order{Kind: "move", Entities: r.ids("starting-recon"), Position: r.region("recoveryRig")})
			r.wait("original rig genuinely recovered", 2400, func() bool { return r.hasTag("recovered-rig") })
			sendUnsupported(r, "recovered-rig", r.region("enemy"))
		}},
		{"sa-04-intercept-window", "defended-assets-lost", 18000, func(r *authoredRun) {
			r.issue(1, sim.Order{Kind: "move", Entities: r.army(), Position: sim.Vec{X: 22500, Y: 116500}})
			r.advance(200)
			r.checkpoint()
		}},
		{"us-03-relay-ridge", "relay-destroyed", 14000, func(r *authoredRun) {
			target := r.tags["relay-1"][0]
			r.issue(1, sim.Order{Kind: "attack_move", Entities: r.army(), Position: r.region("site1")})
			r.wait("ordinary force sights required radar", 4000, func() bool { _, ok := r.seen(target); return ok })
			r.checkpoint()
			var attackers []sim.ID
			for _, id := range r.army() {
				preview, _ := r.engine.PreviewOrders(1, []sim.Order{{Kind: "attack", Entities: []sim.ID{id}, Target: target}})
				if len(preview) == 1 && preview[0].Accepted {
					attackers = append(attackers, id)
				}
			}
			if len(attackers) == 0 {
				r.t.Fatal("no legal ordinary attackers for visible radar")
			}
			r.issue(1, sim.Order{Kind: "attack", Entities: attackers, Target: target})
		}},
		{"ir-03-beyond-the-basin", "field-empty", 18000, func(r *authoredRun) {
			r.issue(1, sim.Order{Kind: "gather", Entities: r.ids("home-haulers"), Target: 1}, sim.Order{Kind: "train", Entities: r.ids("home-supply"), Type: "IR.hauler"}, sim.Order{Kind: "train", Entities: r.ids("home-supply"), Type: "IR.hauler"}, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: "IR.tank"})
			r.advance(400)
			r.checkpoint()
			next := sim.Tick(0)
			r.tactical = func() {
				if r.engine.Tick() < next {
					return
				}
				next = r.engine.Tick() + 300
				r.tryIssue(sim.Order{Kind: "gather", Entities: r.ownedType("IR.hauler"), Target: 1})
				r.tryIssue(sim.Order{Kind: "attack_move", Entities: r.army(), Position: sim.Vec{X: 28500, Y: 94500}})
			}
		}},
	}
	for _, c := range cases {
		t.Run(c.id+"/"+c.objective, func(t *testing.T) {
			r := newAuthoredRun(t, c.id, "normal", "")
			r.evidenceSuffix = "-authored-loss-" + c.objective
			c.play(r)
			r.wait("authored failure "+c.objective, c.limit, func() bool { return r.engine.Outcome().Finished })
			r.finishAuthoredFailure(c.objective)
		})
	}
}

func TestAuthoredOptionalScoutPreservation(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated authored optional capture route")
	}
	r := newAuthoredRun(t, "us-03-relay-ridge", "normal", "")
	r.evidenceSuffix = "-optional-scout-preservation"
	scout := r.ids("starting-recon")
	r.issue(1, sim.Order{Kind: "move", Entities: scout, Position: sim.Vec{X: 18500, Y: 122500}}, sim.Order{Kind: "hold", Entities: scout, Queued: true})
	playCampaignCapture(r)
	r.requireOptional("scout-preserved")
}

func TestAuthoredOptionalStations(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated authored optional station captures")
	}
	r := newAuthoredRun(t, "ir-03-beyond-the-basin", "normal", "")
	r.evidenceSuffix = "-optional-stations"
	workers := r.ids("starting-engineers")
	r.issue(1, sim.Order{Kind: "attack_move", Entities: r.army(), Position: sim.Vec{X: 50500, Y: 81500}}, sim.Order{Kind: "move", Entities: workers[:1], Position: sim.Vec{X: 47500, Y: 87500}})
	capture := func(worker sim.ID, point sim.Vec) {
		r.issue(1, sim.Order{Kind: "move", Entities: []sim.ID{worker}, Position: point})
		var station sim.ID
		r.wait("engineer sees authored military supply station", 3000, func() bool {
			for _, s := range r.view().Stations {
				if s.Position == point {
					station = s.ID
					return true
				}
			}
			return false
		})
		r.issue(1, sim.Order{Kind: "capture", Entities: []sim.ID{worker}, Target: station})
		r.wait("ordinary engineer capture of neutral supply station", 2400, func() bool {
			for _, s := range r.view().Stations {
				if s.ID == station {
					return s.Owner == 1
				}
			}
			return false
		})
	}
	capture(workers[0], sim.Vec{X: 49500, Y: 85500})
	r.checkpoint()
	// Holding both regions would finish the primary objective before the
	// second station capture. Withdraw from the first after capturing it.
	var leave []sim.ID
	for _, e := range r.view().Entities {
		if e.Owner == 1 && e.Position.X >= 44000 && e.Position.X <= 56999 && e.Position.Y >= 76000 && e.Position.Y <= 88999 {
			leave = append(leave, e.ID)
		}
	}
	r.issue(1, sim.Order{Kind: "move", Entities: leave, Position: sim.Vec{X: 65500, Y: 84500}})
	r.wait("first region vacated before second capture", 2000, func() bool {
		for _, e := range r.view().Entities {
			if e.Owner == 1 && e.Position.X >= 44000 && e.Position.X <= 56999 && e.Position.Y >= 76000 && e.Position.Y <= 88999 {
				return false
			}
		}
		return true
	})
	// Also route the second worker south of site1: a diagonal shortcut would
	// recapture it as the force reaches site2 and legitimately end the mission.
	r.issue(1, sim.Order{Kind: "move", Entities: workers[1:2], Position: sim.Vec{X: 65500, Y: 100500}})
	r.wait("second worker clears first-region crossing", 2400, func() bool { e, ok := r.seen(workers[1]); return ok && e.Position.X > 60000 })
	r.issue(1, sim.Order{Kind: "attack_move", Entities: r.army(), Position: sim.Vec{X: 85500, Y: 66500}}, sim.Order{Kind: "move", Entities: workers[1:2], Position: sim.Vec{X: 87500, Y: 74500}})
	capture(workers[1], sim.Vec{X: 88500, Y: 62500})
	r.issue(1, sim.Order{Kind: "move", Entities: workers[:1], Position: sim.Vec{X: 47500, Y: 87500}})
	r.wait("own both stations when controlling both regions", 10000, func() bool { return r.engine.Outcome().Finished })
	r.requireOptional("two-stations")
	r.finish()
}

func TestAuthoredAssetLossBoundaries(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated authored asset loss and threshold paths")
	}
	cases := []struct {
		id, objective string
		tags          []string
	}{
		{"sa-04-intercept-window", "defended-assets-lost", []string{"fixed-battery"}},
		{"us-04-broken-umbrella", "airfields-lost", []string{"home-service", "backup-airfield"}},
		{"ir-04-hold-the-network", "network-destroyed", []string{"network-two", "network-three"}},
		{"twin-outposts", "western-hq-lost", []string{"west-hq"}},
	}
	for _, c := range cases {
		t.Run(c.id+"/"+c.objective, func(t *testing.T) {
			r := newAuthoredRun(t, c.id, "normal", "")
			r.evidenceSuffix = "-authored-sale-" + c.objective
			for i, tag := range c.tags {
				r.issue(1, sim.Order{Kind: "sell", Entities: r.ids(tag)})
				if i == 0 {
					r.advance(25)
					r.checkpoint()
				}
				r.wait("ordinary sale removes original required asset", 300, func() bool { return !r.hasTag(tag) })
				if i+1 < len(c.tags) && r.engine.Outcome().Finished {
					t.Fatal("loss threshold fired with a permitted original asset still remaining")
				}
			}
			r.wait("authored required-asset loss", 100, func() bool { return r.engine.Outcome().Finished })
			if c.id == "twin-outposts" && len(r.playerType(2, "hq")) != 1 {
				t.Fatal("other commander HQ was not preserved")
			}
			if c.id == "sa-04-intercept-window" && (!r.hasTag("outpost-west") || !r.hasTag("outpost-east")) {
				t.Fatal("battery-specific path also lost an outpost")
			}
			r.finishAuthoredFailure(c.objective)
		})
	}
}
func TestAuthoredSharedConvoyLoss(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated shared convoy authored loss")
	}
	r := newAuthoredRun(t, "convoy-union", "normal", "")
	r.evidenceSuffix = "-authored-loss-convoy-one"
	r.wait("first unescorted convoy reaches route junction", 7000, func() bool {
		for _, convoy := range r.view().Mission.Convoys {
			if convoy.ID == "convoy-1" && convoy.Active && convoy.Waypoint >= 1 {
				return true
			}
		}
		return false
	})
	r.issue(1, sim.Order{Kind: "convoy_hold", Type: "convoy-1"})
	r.checkpoint()
	r.wait("announced ordinary hostile detachment reaches the unescorted held convoy", 18000, func() bool { return r.engine.Outcome().Finished })
	r.finishAuthoredFailure("convoy-1-lost")
}
