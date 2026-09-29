package sim

import (
	"frontlinecommand/pkg/content"
	"strings"
	"testing"
)

type transportSetup struct {
	engine     *Engine
	carrier    ID
	passengers []ID
	duration   Tick
}

func transportAcceptanceFixture(t *testing.T, typ string) transportSetup {
	t.Helper()
	faction := "US"
	if strings.HasPrefix(typ, "SY.") {
		faction = "SY"
	}
	e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: 915, Players: []PlayerConfig{{ID: 1, Faction: faction, Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	carrier := e.spawn(typ, 1, Vec{X: 25000, Y: 19000}, true, 900000)
	duration := seconds(2)
	if typ == "SY.apc" {
		duration = seconds(1)
	}
	if typ == "US.airlift" {
		duration = seconds(3)
		home := e.spawn("US.airfield", 1, Vec{X: 14000, Y: 25000}, true, 2000000)
		carrier.Home = home.ID
	}
	ids := []ID{}
	for i := int32(0); i < e.capacity(carrier); i++ {
		unit := e.spawn(faction+".rifle", 1, Vec{X: carrier.Position.X - 1600, Y: carrier.Position.Y + (i-1)*500}, true, 250000)
		unit.HP = 123457 + int64(i)
		ids = append(ids, unit.ID)
	}
	e.recalculate()
	e.updateFog()
	return transportSetup{e, carrier.ID, ids, duration}
}
func boardTransport(t *testing.T, s transportSetup) {
	t.Helper()
	e := s.engine
	issue(t, e, 1, Order{Kind: "board", Entities: s.passengers, Target: s.carrier})
	for _, id := range s.passengers {
		if e.entity(id).Channel != "board" || e.entity(id).ChannelUntil-e.Tick() != s.duration {
			t.Fatal("boarding did not begin at exact ordinary duration", e.entity(id).Channel)
		}
	}
	ticks(e, uint32(s.duration-1))
	for _, id := range s.passengers {
		if e.entity(id).Container != 0 {
			t.Fatal("boarding completed a tick early")
		}
	}
	e.Advance()
	for _, id := range s.passengers {
		if e.entity(id).Container != s.carrier {
			t.Fatal("boarding missed exact completion", id)
		}
	}
}

func TestTransportExactBoardUnloadDurationsAndDamageDoesNotCancel(t *testing.T) {
	for _, typ := range []string{"US.apc", "SY.apc", "US.airlift"} {
		t.Run(typ, func(t *testing.T) {
			s := transportAcceptanceFixture(t, typ)
			e := s.engine
			transportImpact(e, s.carrier, e.Tick()+2, false)
			transportImpact(e, s.passengers[0], e.Tick()+2, false)
			boardTransport(t, s)
			carrier := e.entity(s.carrier)
			if len(carrier.Passengers) != len(s.passengers) {
				t.Fatal("capacity lost during concurrent boarding")
			}
			health := map[ID]int64{}
			for _, id := range s.passengers {
				health[id] = e.entity(id).HP
			}
			issue(t, e, 1, Order{Kind: "unload", Entities: []ID{s.carrier}})
			if carrier.Channel != "unload" || carrier.ChannelUntil-e.Tick() != s.duration {
				t.Fatal("unload duration changed")
			}
			transportImpact(e, s.carrier, e.Tick()+2, false)
			ticks(e, uint32(s.duration-1))
			for _, id := range s.passengers {
				if e.entity(id).Container != s.carrier {
					t.Fatal("unloaded early")
				}
			}
			e.Advance()
			for _, id := range s.passengers {
				unit := e.entity(id)
				if unit.Container != 0 || unit.HP != health[id] || e.distanceTo(carrier, unit.Position)-e.radius(unit) > 2000 {
					t.Fatal("unload damaged, retained or displaced passenger", unit)
				}
				if !e.clear(unit.Position, e.radius(unit), unit.ID, false, true) {
					t.Fatal("unloaded passenger overlaps terrain or another actor")
				}
			}
			t.Logf("%s capacity=%d boarding=%dticks unloading=%dticks; incoming damage did not cancel; distinct legal exits with full HP", typ, len(s.passengers), s.duration, s.duration)
		})
	}
}

func TestTransportMovementAndParticipantLossCancelBoarding(t *testing.T) {
	for _, event := range []string{"moves", "carrier_destroyed", "passenger_destroyed"} {
		t.Run(event, func(t *testing.T) {
			s := transportAcceptanceFixture(t, "US.apc")
			e := s.engine
			id := s.passengers[0]
			s.passengers = []ID{id}
			issue(t, e, 1, Order{Kind: "board", Entities: s.passengers, Target: s.carrier})
			if e.entity(id).Channel != "board" {
				t.Fatal("fixture did not begin boarding")
			}
			if event == "moves" {
				carrier := e.entity(s.carrier)
				before := carrier.Position
				issue(t, e, 1, Order{Kind: "move", Entities: []ID{s.carrier}, Position: Vec{X: 25000, Y: 28000}})
				for range 30 {
					if carrier.Position != before {
						break
					}
					e.Advance()
				}
				if carrier.Position == before || e.entity(id).Channel != "" || e.entity(id).Container != 0 {
					t.Fatal("moving carrier did not interrupt boarding")
				}
			} else {
				target := s.carrier
				if event == "passenger_destroyed" {
					target = id
				}
				transportImpact(e, target, e.Tick()+1, true)
				e.Advance()
				if e.entity(target) != nil {
					t.Fatal("scheduled loss did not occur")
				}
				if target == s.carrier && (e.entity(id) == nil || e.entity(id).Container != 0 || e.entity(id).Channel != "") {
					t.Fatal("carrier loss corrupted unboarded passenger")
				}
				if target == id && len(e.entity(s.carrier).Passengers) != 0 {
					t.Fatal("dead boarder consumed capacity")
				}
			}
		})
	}
}

func TestTransportDestructionGroundBlockedAirborneAndLanded(t *testing.T) {
	for _, entry := range []struct {
		name, typ         string
		blocked, airborne bool
	}{
		{"ground", "US.apc", false, false}, {"ground_blocked", "US.apc", true, false},
		{"garrison", "bunker", false, false}, {"garrison_blocked", "bunker", true, false},
		{"airborne", "US.airlift", false, true}, {"landed", "US.airlift", false, false}, {"landed_blocked", "US.airlift", true, false},
	} {
		t.Run(entry.name, func(t *testing.T) {
			s := transportAcceptanceFixture(t, entry.typ)
			e := s.engine
			boardTransport(t, s)
			carrier := e.entity(s.carrier)
			carrier.Landed = !entry.airborne
			if entry.blocked {
				sealTransportArea(e, carrier.Position, true)
			}
			initial := []int64{}
			for _, id := range s.passengers {
				initial = append(initial, e.entity(id).HP)
			}
			transportImpact(e, s.carrier, e.Tick()+1, true)
			e.Advance()
			if e.entity(s.carrier) != nil {
				t.Fatal("carrier survived lethal projectile")
			}
			for i, id := range s.passengers {
				unit := e.entity(id)
				if entry.blocked || entry.airborne {
					if unit != nil {
						t.Fatal("passenger survived unavailable escape", unit.HP)
					}
					continue
				}
				if unit == nil || unit.Container != 0 || unit.HP != initial[i]/2 || e.distanceTo(carrier, unit.Position)-e.radius(unit) > 2000 {
					t.Fatal("ground escape violated prior-HP or exit-distance rule", id)
				}
				if !e.clear(unit.Position, e.radius(unit), unit.ID, false, true) {
					t.Fatal("escape occupied an illegal exit")
				}
			}
			t.Logf("%s: passengers=%d survived=%v; prior HP half only on legal ground escape", entry.name, len(s.passengers), !entry.blocked && !entry.airborne)
		})
	}
}

func TestTransportCongestedUnloadWaitsWithFeedbackAndResumesAfterRestore(t *testing.T) {
	s := safehouseAcceptanceFixture(t, "normal")
	e := s.engine
	carrier := e.entity(s.source)
	sealTransportArea(e, carrier.Position, true)
	issue(t, e, 1, Order{Kind: "unload", Entities: []ID{carrier.ID}})
	ticks(e, 40)
	if carrier.State != "unload_exit_blocked" || carrier.Channel != "unload" || len(carrier.Passengers) != 2 {
		t.Fatal("congested unload did not remain explicit and safe", carrier.State, carrier.Channel)
	}
	count := 0
	for _, event := range e.state.Events {
		if event.Kind == "unload_exit_blocked" {
			count++
		}
	}
	if count != 1 {
		t.Fatal("missing first blocked-unload event")
	}
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	for range 20 {
		e.Advance()
		restored.Advance()
		for _, event := range e.state.Events {
			if event.Kind == "unload_exit_blocked" {
				t.Fatal("blocked unload repeats its alert every tick")
			}
		}
	}
	if e.Hash() != restored.Hash() {
		t.Fatal("blocked unload restore diverged")
	}
	sealTransportArea(e, carrier.Position, false)
	sealTransportArea(restored, carrier.Position, false)
	ticks(e, 20)
	ticks(restored, 20)
	if len(carrier.Passengers) != 0 || carrier.Channel != "" || e.Hash() != restored.Hash() {
		t.Fatal("clear space did not resume saved unload")
	}
	for i, id := range s.passengers {
		if e.entity(id).HP != []int64{123456, 99999}[i] {
			t.Fatal("waiting for exits damaged a passenger")
		}
	}
}

func TestTransportLossAccountsForEarlierCreatedPassengersExactlyOnce(t *testing.T) {
	e := fixture(t)
	passenger := e.spawn("US.rifle", 1, Vec{X: 23400, Y: 19000}, true, 250000)
	carrier := e.spawn("US.airlift", 1, Vec{X: 25000, Y: 19000}, true, 900000)
	home := e.spawn("US.airfield", 1, Vec{X: 14000, Y: 25000}, true, 2000000)
	carrier.Home = home.ID
	e.recalculate()
	e.updateFog()
	issue(t, e, 1, Order{Kind: "board", Entities: []ID{passenger.ID}, Target: carrier.ID})
	ticks(e, 60)
	if passenger.Container != carrier.ID {
		t.Fatal("fixture did not board")
	}
	carrier.Landed = false
	before := e.player(1).Lost
	transportImpact(e, carrier.ID, e.Tick()+1, true)
	e.Advance()
	if e.entity(passenger.ID) != nil || e.entity(carrier.ID) != nil {
		t.Fatal("airborne loss left passenger or carrier alive")
	}
	if e.player(1).Lost-before != 1150000 {
		t.Fatal("loss accounting omitted an older passenger", e.player(1).Lost-before)
	}
	counts := map[ID]int{}
	for _, event := range e.state.Events {
		if event.Kind == "destroyed" {
			counts[event.Entity]++
		}
	}
	if counts[carrier.ID] != 1 || counts[passenger.ID] != 1 {
		t.Fatal("destruction must be reported once for both actors", counts)
	}
	e.Advance()
	if e.player(1).Lost-before != 1150000 {
		t.Fatal("loss was counted twice")
	}
}

func TestTransportPassengerLossAwardsNoExperienceForEarlierDamage(t *testing.T) {
	s := transportAcceptanceFixture(t, "US.airlift")
	e := s.engine
	attacker := e.spawn("IR.tank", 2, Vec{X: 60000, Y: 50000}, true, 1200000)
	transportImpact(e, s.passengers[0], e.Tick()+1, false)
	e.state.Projectiles[len(e.state.Projectiles)-1].Shooter = attacker.ID
	e.Advance()
	if len(e.entity(s.passengers[0]).Contributions) != 1 {
		t.Fatal("prior combat damage was not attributed")
	}
	boardTransport(t, s)
	e.entity(s.carrier).Landed = false
	transportImpact(e, s.carrier, e.Tick()+1, true)
	e.Advance()
	if attacker.Experience != 0 || e.player(2).Kills != 0 {
		t.Fatal("cargo loss rewarded an old attacker", attacker.Experience, e.player(2).Kills)
	}
}

func TestTransportSimultaneousBoardersCannotOverfillCapacity(t *testing.T) {
	s := transportAcceptanceFixture(t, "US.apc")
	e := s.engine
	for i := int32(0); i < 2; i++ {
		unit := e.spawn("US.rifle", 1, Vec{X: 26600, Y: 18500 + i*500}, true, 250000)
		s.passengers = append(s.passengers, unit.ID)
	}
	e.recalculate()
	e.updateFog()
	before := e.player(1).Supply
	issue(t, e, 1, Order{Kind: "board", Entities: s.passengers, Target: s.carrier})
	ticks(e, 41)
	carrier := e.entity(s.carrier)
	if len(carrier.Passengers) != 3 || e.player(1).Supply != before {
		t.Fatal("concurrent boarders violated seats or Supply")
	}
	for i, id := range s.passengers {
		unit := e.entity(id)
		if (unit.Container == s.carrier) != (i < 3) || unit.Channel != "" {
			t.Fatal("boarding arbitration left an invalid reservation", id, unit.Container, unit.Channel)
		}
	}
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil || restored.Hash() != e.Hash() {
		t.Fatal("oversubscribed boarding result did not restore", err)
	}
}

func TestTransportPartialUnloadReservesDistinctExitsAndPreservesRemainingSquad(t *testing.T) {
	s := safehouseAcceptanceFixture(t, "normal")
	e := s.engine
	carrier := e.entity(s.source)
	sealTransportArea(e, carrier.Position, true)
	for y := carrier.Position.Y/1000 - 1; y <= carrier.Position.Y/1000; y++ {
		e.state.Map.Tiles[y*64+carrier.Position.X/1000+2].Terrain = "open"
	}
	e.state.NavigationRevision++
	e.updateFog()
	if _, ok := e.exitPosition(carrier, e.entity(s.passengers[0]).Type, s.passengers[0], 2000); !ok {
		t.Fatal("fixture lacks its first exit")
	}
	if _, ok := e.passengerExits(carrier, s.passengers, 2000); ok {
		t.Fatal("fixture unexpectedly has two exits")
	}
	issue(t, e, 1, Order{Kind: "unload", Entities: []ID{carrier.ID}})
	ticks(e, 40)
	if len(carrier.Passengers) != 1 || e.entity(s.passengers[0]).Container != 0 || e.entity(s.passengers[1]).Container != carrier.ID {
		t.Fatal("partial unload lost or duplicated a squad")
	}
	first := e.entity(s.passengers[0])
	pos := first.Position
	sealTransportArea(e, carrier.Position, false)
	ticks(e, 20)
	second := e.entity(s.passengers[1])
	if len(carrier.Passengers) != 0 || first.Position != pos || second.Container != 0 || distance(first.Position, second.Position) < e.radius(first)+e.radius(second) || first.HP != 123456 || second.HP != 99999 {
		t.Fatal("cleared partial unload overlapped, moved or injured squads")
	}
}
