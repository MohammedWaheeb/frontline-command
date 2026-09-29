package sim

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestDebriefIsPrivateUntilFinishedAndRecordsProduction(t *testing.T) {
	e := fixture(t)
	unit, _ := e.catalog.Unit("US.rig")
	issue(t, e, 1, Order{Kind: "train", Entities: []ID{1}, Type: unit.ID})
	for i := uint32(0); i < unit.BuildTicks+100; i++ {
		e.Advance()
	}
	if e.countRole(1, "rig", true) != 2 {
		t.Fatal("real paid queue did not complete")
	}
	view, _ := e.PlayerView(1)
	if view.Debrief != nil || e.Debrief() != nil {
		t.Fatal("live debrief leaks opponents")
	}
	encoded, _ := json.Marshal(view)
	if bytes.Contains(encoded, []byte("units_produced")) {
		t.Fatal("live view serialized statistics")
	}
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	other, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	issue(t, e, 2, Order{Kind: "surrender"})
	issue(t, other, 2, Order{Kind: "surrender"})
	if e.Hash() != other.Hash() {
		t.Fatal("telemetry restore diverged")
	}
	debrief := e.Debrief()
	if debrief == nil || len(debrief.Players) != 2 {
		t.Fatal("missing final debrief")
	}
	p := debrief.Players[0]
	if p.Spent != unit.Cost || len(p.Metrics.UnitsProduced) != 1 || p.Metrics.UnitsProduced[0].Type != unit.ID || p.Metrics.UnitsProduced[0].Count != 1 {
		t.Fatal("production/economy differs from actual queue", p)
	}
	if len(p.Metrics.Timeline) < 2 || p.Metrics.Timeline[0].Tick != 0 || p.Metrics.Timeline[len(p.Metrics.Timeline)-1].Tick != e.Tick() {
		t.Fatal("opening/final economy sample missing")
	}
	before := e.Hash()
	debrief.Players[0].Metrics.Timeline[0].Credits = 1
	debrief.Players[0].Metrics.UnitsProduced[0].Count = 99
	if len(debrief.Events) > 0 {
		debrief.Events[0].Kind = "changed"
	}
	if e.Hash() != before {
		t.Fatal("debrief mutates authoritative state")
	}
}

func TestTelemetryPaidRepairAndStationControl(t *testing.T) {
	e := fixture(t)
	e.spawn("depot", 1, Vec{X: 20000, Y: 20000}, true, 1000000)
	tank := e.spawn("US.tank", 1, Vec{X: 22500, Y: 20000}, true, 1800000)
	tank.HP = tank.MaxHP / 2
	e.state.Stations[0].Owner = 1
	before := e.player(1).Spent
	ticks(e, 40)
	stats := e.state.Telemetry.Players[0]
	if stats.RepairSpent == 0 || stats.RepairSpent != e.player(1).Spent-before {
		t.Fatal("repair expense differs from paid repair", stats.RepairSpent)
	}
	if stats.StationControlTicks != 40 {
		t.Fatal("station control does not count actual ticks", stats.StationControlTicks)
	}
}

func TestTelemetryDoesNotCountSaleAsCombatCasualty(t *testing.T) {
	e := fixture(t)
	building := e.spawn("power", 1, Vec{X: 16000, Y: 14000}, true, 800000)
	issue(t, e, 1, Order{Kind: "sell", Entities: []ID{building.ID}})
	ticks(e, 200)
	if e.entity(building.ID) != nil {
		t.Fatal("sale not completed")
	}
	if e.state.Telemetry.Players[0].BuildingsLost != 0 {
		t.Fatal("sale counted as destroyed building")
	}
}

func TestTelemetryBoundedEventsAndCorruptRestore(t *testing.T) {
	e := fixture(t)
	for i := 0; i < 300; i++ {
		e.state.Tick++
		e.recordDebriefEvent(Event{Tick: e.Tick(), Kind: "checkpoint", Text: "actual milestone"})
	}
	if len(e.state.Telemetry.Events) != 256 || e.state.Telemetry.OmittedEvents != 44 || e.state.Telemetry.Events[0].Tick != 1 || e.state.Telemetry.Events[255].Tick != 300 {
		t.Fatal("bounded event history loses opening/latest milestones")
	}
	e.sampleTelemetry(true)
	e.state.Telemetry.Players[0].Timeline[0].Tick = e.Tick() + 1
	data, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = Restore(e.catalog, data); err == nil {
		t.Fatal("accepted future telemetry sample")
	}
}
