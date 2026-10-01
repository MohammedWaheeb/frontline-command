package sim

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// A fresh 0.3.8 engine with controlled synthetic collider infrastructure, not
// a converted old checkpoint. Measured money, queue, birth and motion use
// ordinary Submit/Advance. Original 0.3.6 failures stay in their own evidence.
func TestProductionExit038PaidTrainSaveReplay(t *testing.T) {
	if Version != "0.3.8" {
		t.Fatal("requires root-owned 0.3.8 simulation boundary", Version)
	}
	e, factory := productionPocketFixture(t)
	for _, v := range e.state.Entities {
		if v.Owner == 1 && v.Type == "supply" {
			v.IncludedHauler = true // controlled infrastructure includes no free hauler
		}
	}
	e.spawn("power", 1, Vec{X: 15000, Y: 16000}, true, 0)
	e.spawn("barracks", 1, Vec{X: 15000, Y: 20500}, true, 0)
	e.recalculate()
	e.updateFog()
	p := e.player(1)
	u, ok := e.catalog.Unit("US.car")
	if !ok || p.LowPower() || !factory.Active(e.Tick()) {
		t.Fatal("controlled paid production infrastructure unavailable")
	}
	birth := Vec{X: 25500, Y: 18600}
	old, oldOK := e.exitPosition(factory, u.ID, 0, 6000)
	preferred, preferredOK := e.productionExitPosition(factory, u.ID, 6000)
	if !oldOK || old != (Vec{X: 28400, Y: 21500}) || !preferredOK || preferred != birth {
		t.Fatal("closed east point and physically clear north alternative not reproduced", old, preferred)
	}
	replay, err := NewReplay(e)
	if err != nil { t.Fatal(err) }
	credits, spent, income := p.Credits, p.Spent, p.Income
	if err := e.Submit(1, p.LastSequence+1, []Order{
		{Kind: "rally", Entities: []ID{factory.ID}, Position: birth},
		{Kind: "train", Entities: []ID{factory.ID}, Type: u.ID},
	}); err != nil { t.Fatal(err) }
	e.Advance()
	if len(e.state.Results) != 2 || !e.state.Results[0].Accepted || !e.state.Results[1].Accepted {
		t.Fatal("ordinary rally/train receipt rejected", e.state.Results)
	}
	if len(factory.Jobs) != 1 || !factory.Jobs[0].Started || factory.Jobs[0].Paid != u.Cost || factory.Jobs[0].Work != 2 || p.Credits != credits-u.Cost+p.Income-income || p.Spent != spent+u.Cost || p.ReservedSupply != u.Supply {
		t.Fatal("ordinary Train did not debit once, reserve supply and work", factory.Jobs, p)
	}
	paidSave, err := replay.CaptureCheckpoint(e)
	if err != nil { t.Fatal(err) }
	cold, err := Restore(e.catalog, paidSave)
	if err != nil || cold.Hash() != e.Hash() { t.Fatal("paid pending queue cold restore differs", err) }
	var car *Entity
	for i := uint32(0); i <= u.BuildTicks+1; i++ {
		for _, v := range e.state.Entities {
			if v.Owner == 1 && v.Type == u.ID { car = v; break }
		}
		if car != nil { break }
		e.Advance()
		cold.Advance()
		if e.Hash() != cold.Hash() { t.Fatal("paid queue/birth cold continuation diverged", e.Tick()) }
	}
	if car == nil || car.Position != birth || car.Paid != u.Cost || car.HP != u.HP || len(factory.Jobs) != 0 || p.Spent != spent+u.Cost || p.Credits != credits-u.Cost+p.Income-income || p.ReservedSupply != 0 || p.Supply != u.Supply {
		t.Fatal("ordinary paid birth or one-time debit differs", e.Tick(), car, p)
	}
	born := e.Tick()
	if err := replay.Capture(e, false); err != nil { t.Fatal(err) }
	goal := Vec{X: 25500, Y: 14500}
	orders := []Order{{Kind: "move", Entities: []ID{car.ID}, Position: goal}}
	sequence := p.LastSequence+1
	if err := e.Submit(1, sequence, orders); err != nil { t.Fatal(err) }
	if err := cold.Submit(1, sequence, orders); err != nil { t.Fatal(err) }
	for i := 0; i < 40; i++ {
		e.Advance()
		cold.Advance()
		if e.Hash() != cold.Hash() { t.Fatal("ordinary motion cold continuation diverged", e.Tick()) }
		if i == 0 && (len(e.state.Results) != 1 || !e.state.Results[0].Accepted) { t.Fatal("ordinary Move rejected", e.state.Results) }
	}
	if distance(car.Position, birth) < 3500 || !e.clear(car.Position, e.radius(car), car.ID, false, true) || car.Paid != u.Cost {
		t.Fatal("paid north birth lacks bounded legal ordinary movement", car)
	}
	if err := replay.Capture(e, false); err != nil { t.Fatal(err) }
	encoded, err := replay.Encode()
	if err != nil { t.Fatal(err) }
	decoded, err := DecodeReplay(encoded)
	if err != nil { t.Fatal(err) }
	checkpointPlayback, err := decoded.Seek(e.catalog, e.Tick())
	if err != nil || checkpointPlayback.Hash() != e.Hash() { t.Fatal("encoded checkpoint replay differs", err) }
	fullReplay := *decoded
	fullReplay.Checkpoints = nil
	fullPlayback, err := fullReplay.Seek(e.catalog, e.Tick())
	if err != nil || fullPlayback.Hash() != e.Hash() { t.Fatal("encoded replay from initial state differs", err) }
	finalSave, err := e.Save()
	if err != nil { t.Fatal(err) }
	finalCold, err := Restore(e.catalog, finalSave)
	if err != nil || finalCold.Hash() != e.Hash() { t.Fatal("fresh final save restore differs", err) }
	if evidence := os.Getenv("FRONTLINE_PRODUCTION038_EVIDENCE"); evidence != "" {
		if !filepath.IsAbs(evidence) { t.Fatal("evidence path must be absolute") }
		if err := os.MkdirAll(evidence, 0700); err != nil { t.Fatal(err) }
		write := func(name string, data []byte) {
			f, err := os.OpenFile(filepath.Join(evidence, name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
			if err != nil { t.Fatal(err) }
			if _, err := f.Write(data); err != nil { f.Close(); t.Fatal(err) }
			if err := f.Close(); err != nil { t.Fatal(err) }
		}
		write("paid-queue.save.json", paidSave)
		write("final.save.json", finalSave)
		write("course.replay.json", encoded)
		result, err := json.MarshalIndent(map[string]any{"metadata": e.Metadata(), "born_tick": born, "final_tick": e.Tick(), "spawn": birth, "final_car": car, "final_hash": e.Hash(), "cold_queue_and_motion": true, "full_replay": true, "checkpoint_replay": true, "controlled_infrastructure": true}, "", "  ")
		if err != nil { t.Fatal(err) }
		write("result.json", result)
	}
	t.Logf("fresh038 paid ordinary Train: born=%d final=%d spawn=%v finalpos=%v paid=%d hash=%s cold/full/checkpoint parity", born, e.Tick(), birth, car.Position, car.Paid, e.Hash())
}
