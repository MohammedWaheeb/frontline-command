package sim

import (
	"bytes"
	"encoding/json"
	"frontlinecommand/pkg/content"
	"testing"
)

// fixtureMap is deliberately synthetic backend test geometry, not a shipping
// map or a substitute for Claude-authored map/editor content.
func fixtureMap() content.Map {
	m := content.Map{ID: "backend-fixture", Title: "Backend test geometry", Author: "automated fixture", Version: "1", FormatVersion: 1, Ruleset: "standard-v2", Width: 64, Height: 64, Spawns: []content.Spawn{{Position: Vec{X: 8000, Y: 8000}}, {Position: Vec{X: 56000, Y: 56000}}}, Shipment: Vec{X: 32000, Y: 32000}, Fields: []content.Field{{ID: 1, Position: Vec{X: 14000, Y: 8000}, Credits: 36000000}, {ID: 2, Position: Vec{X: 49000, Y: 56000}, Credits: 36000000}}, Stations: []content.Station{{ID: 3, Position: Vec{X: 32000, Y: 24000}}}}
	m.Tiles = make([]content.Tile, m.Width*m.Height)
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	return m
}
func fixture(t testing.TB) *Engine {
	t.Helper()
	e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: 42, Players: []PlayerConfig{{ID: 1, Name: "Alpha", Faction: "US", Team: 1}, {ID: 2, Name: "Bravo", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	return e
}
func ticks(e *Engine, n uint32) {
	for i := uint32(0); i < n; i++ {
		e.Advance()
	}
}
func issue(t testing.TB, e *Engine, p PlayerID, o Order) {
	t.Helper()
	if err := e.Submit(p, e.player(p).LastSequence+1, []Order{o}); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if len(e.state.Results) == 0 || !e.state.Results[0].Accepted {
		t.Fatalf("order %s rejected: %+v", o.Kind, e.state.Results)
	}
}
func baseInfrastructure(e *Engine, owner PlayerID) {
	for i, typ := range []string{"power", "supply", "barracks", "factory", "radar", "tech"} {
		v := e.spawn(typ, owner, Vec{X: int32(4000 + i*6000), Y: 20000}, true, 0)
		if typ == "supply" {
			v.IncludedHauler = true
		}
	}
	e.recalculate()
	e.updateFog()
}

func TestStartingStateAndOwnership(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	if p.Credits != 6000000 || p.Energy != 0 || p.PowerCapacity != 40 || p.Supply != 0 {
		t.Fatalf("start resources %+v", p)
	}
	if e.countRole(1, "rig", true) != 1 || e.countRole(1, "hq", true) != 1 {
		t.Fatal("starting assets")
	}
	if err := e.Submit(1, 1, []Order{{Kind: "move", Entities: []ID{4}, Position: Vec{X: 20000, Y: 20000}}}); err == nil {
		t.Fatal("accepted enemy command")
	}
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{2}, Position: Vec{X: 16000, Y: 12000}})
	if err := e.Submit(1, 1, []Order{{Kind: "stop", Entities: []ID{2}}}); err == nil {
		t.Fatal("accepted duplicate sequence")
	}
}
func TestSaveRestoreDeterminism(t *testing.T) {
	a := fixture(t)
	issue(t, a, 1, Order{Kind: "move", Entities: []ID{2}, Position: Vec{X: 20000, Y: 14000}})
	ticks(a, 17)
	save, err := a.Save()
	if err != nil {
		t.Fatal(err)
	}
	b, err := Restore(a.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	if a.Hash() != b.Hash() {
		t.Fatal("restore changed state")
	}
	for i := 0; i < 150; i++ {
		a.Advance()
		b.Advance()
		if a.Hash() != b.Hash() {
			t.Fatalf("diverged at tick %d", a.Tick())
		}
	}
	save[len(save)/2] ^= 1
	if _, err = Restore(a.catalog, save); err == nil {
		t.Fatal("accepted corrupt save")
	}
}
func TestViewPrivacyAndImmutability(t *testing.T) {
	e := fixture(t)
	enemy := e.entity(3)
	enemy.Jobs = []Job{{Type: "IR.tank", Paid: 9912345}}
	e.player(2).Credits = 123456789
	e.player(2).Upgrades = []string{"secret_upgrade"}
	view, _ := e.PlayerView(1)
	b, _ := json.Marshal(view)
	for _, secret := range [][]byte{[]byte("9912345"), []byte("123456789"), []byte("secret_upgrade")} {
		if bytes.Contains(b, secret) {
			t.Fatalf("fog/private leak %s", secret)
		}
	}
	for _, v := range view.Entities {
		if v.Owner == 2 {
			t.Fatal("hidden enemy entity transmitted")
		}
	}
	view.Explored[0] = true
	if e.player(1).Explored[0] {
		t.Fatal("view mutated simulation")
	}
	enemy.Position = Vec{X: 12000, Y: 11000}
	e.updateFog()
	view, _ = e.PlayerView(1)
	found := false
	for _, v := range view.Entities {
		if v.ID == enemy.ID {
			found = true
			if v.Private != nil {
				t.Fatal("visible enemy private data")
			}
		}
	}
	if !found {
		t.Fatal("visible enemy omitted")
	}
	enemy.RevealedUntil = 100
	enemy.Position = Vec{X: 50000, Y: 50000}
	e.updateFog()
	if e.canSeeEntity(1, enemy) {
		t.Fatal("ordinary weapon fire revealed fogged entity globally")
	}
}
func TestProductionReservationsAndRefund(t *testing.T) {
	e := fixture(t)
	baseInfrastructure(e, 1)
	p := e.player(1)
	p.Credits = 10000000
	var barracks *Entity
	for _, v := range e.state.Entities {
		if v.Owner == 1 && e.role(v) == "barracks" {
			barracks = v
		}
	}
	before := p.Credits
	issue(t, e, 1, Order{Kind: "train", Entities: []ID{barracks.ID}, Type: "US.rifle"})
	if p.Credits != before-300000 || p.ReservedSupply != 2 || !barracks.Jobs[0].Started {
		t.Fatalf("active job not charged/reserved: %+v", barracks.Jobs)
	}
	issue(t, e, 1, Order{Kind: "train", Entities: []ID{barracks.ID}, Type: "US.rifle"})
	if p.Credits != before-300000 || barracks.Jobs[1].Started {
		t.Fatal("waiting job charged")
	}
	ticks(e, 98)
	work := barracks.Jobs[0].Work
	expected := p.Credits + 300000*3*int64(400-work)/(4*400)
	issue(t, e, 1, Order{Kind: "cancel", Entities: []ID{barracks.ID}, Index: 0})
	if p.Credits != expected-300000 {
		t.Fatalf("refund or next-job charge mismatch got %d want %d", p.Credits, expected-300000)
	}
	if p.Credits > before {
		t.Fatal("refund minted money")
	}
}
func TestLowPowerAndPrerequisitePause(t *testing.T) {
	e := fixture(t)
	baseInfrastructure(e, 1)
	p := e.player(1)
	p.Credits = 10000000
	var factory, power, supply *Entity
	for _, v := range e.state.Entities {
		if v.Owner != 1 {
			continue
		}
		switch e.role(v) {
		case "factory":
			factory = v
		case "power":
			power = v
		case "supply":
			supply = v
		}
	}
	issue(t, e, 1, Order{Kind: "train", Entities: []ID{factory.ID}, Type: "US.tank"})
	start := factory.Jobs[0].Work
	ticks(e, 20)
	if factory.Jobs[0].Work-start != 40 {
		t.Fatal("normal work rate")
	}
	power.Enabled = false
	e.recalculate()
	if !p.LowPower() {
		t.Fatal("fixture should be low power")
	}
	start = factory.Jobs[0].Work
	ticks(e, 20)
	if factory.Jobs[0].Work-start != 20 {
		t.Fatal("low power did not halve work")
	}
	supply.HP = 0
	start = factory.Jobs[0].Work
	ticks(e, 20)
	if factory.Jobs[0].Work != start {
		t.Fatal("lost producer prerequisite did not pause investment")
	}
}
func TestHarvestOneLoadingBayAndCargoLoss(t *testing.T) {
	e := fixture(t)
	d := e.spawn("supply", 1, Vec{X: 18000, Y: 11000}, true, 1800000)
	d.IncludedHauler = true
	a := e.spawn("US.hauler", 1, Vec{X: 14000, Y: 8000}, true, 900000)
	b := e.spawn("US.hauler", 1, Vec{X: 16000, Y: 10000}, true, 900000)
	e.assign(a, Order{Kind: "gather"})
	e.assign(b, Order{Kind: "gather"})
	e.updateFog()
	before := e.field(1).Remaining
	credits := e.player(1).Credits
	ticks(e, 100)
	removed := before - e.field(1).Remaining
	if removed > 200000 || removed <= 0 {
		t.Fatalf("loading cap violated: %d", removed)
	}
	if e.player(1).Credits != credits {
		t.Fatal("undelivered cargo credited")
	}
	cargo := a.Cargo
	a.HP = 0
	e.cleanup()
	if cargo <= 0 || e.player(1).Credits != credits {
		t.Fatal("cargo loss credited funds")
	}
}
func TestMovementAndCollision(t *testing.T) {
	e := fixture(t)
	u := e.entity(2)
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{u.ID}, Position: Vec{X: 20000, Y: 12000}})
	ticks(e, 160)
	if distance(u.Position, Vec{X: 20000, Y: 12000}) > 1800 {
		t.Fatalf("move did not arrive: %+v state %s", u.Position, u.State)
	}
	other := e.spawn("US.tank", 1, Vec{X: 23000, Y: 12000}, true, 1300000)
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{u.ID, other.ID}, Position: Vec{X: 28000, Y: 20000}})
	ticks(e, 220)
	if distance(u.Position, other.Position) < e.radius(u)+e.radius(other) {
		t.Fatal("permanent overlap")
	}
}
func TestTargetLayersAndSimultaneousDamage(t *testing.T) {
	e := fixture(t)
	a := e.spawn("US.at", 1, Vec{X: 30000, Y: 30000}, true, 500000)
	b := e.spawn("IR.rifle", 2, Vec{X: 34000, Y: 30000}, true, 300000)
	e.updateFog()
	if e.canAttack(a, b) {
		t.Fatal("antiarmor attacks infantry")
	}
	a.HP = 1000
	b.HP = 1000
	e.damages = []damage{{Target: a.ID, Shooter: b.ID, Owner: 2, Amount: 2000, Kind: "small"}, {Target: b.ID, Shooter: a.ID, Owner: 1, Amount: 2000, Kind: "small"}}
	e.resolveDamage()
	if a.HP != 0 || b.HP != 0 {
		t.Fatal("damage did not resolve simultaneously")
	}
}
func TestInterceptionFiniteAndPower(t *testing.T) {
	e := fixture(t)
	battery := e.spawn("abm", 1, Vec{X: 12000, Y: 16000}, true, 1800000)
	battery.Charges = 2
	for i := 0; i < 3; i++ {
		e.state.Projectiles = append(e.state.Projectiles, &Projectile{ID: e.newID(), Owner: 2, Weapon: "IR_MISSILE", Position: Vec{X: 14000, Y: 14000}, Impact: Vec{X: 8000, Y: 8000}, ImpactAt: 40, Damage: 350000, Splash: 2000, Interceptable: true})
	}
	ticks(e, 50)
	if battery.Charges != 0 {
		t.Fatalf("charges wrong %d", battery.Charges)
	}
	if e.entity(1).HP >= 4500000 {
		t.Fatal("third missile should penetrate finite charges")
	}
	if e.entity(1).HP < 4150000 {
		t.Fatal("battery failed to stop two shots")
	}
}
func TestCommandEnergyAndNoFreeRepairs(t *testing.T) {
	e := fixture(t)
	ticks(e, 40)
	if e.player(1).Energy != 1000 {
		t.Fatal("energy should regenerate 0.5 per second")
	}
	truck := e.spawn("US.repair", 1, Vec{X: 16000, Y: 12000}, true, 600000)
	tank := e.spawn("US.tank", 1, Vec{X: 18000, Y: 12000}, true, 1300000)
	tank.HP -= 100000
	e.player(1).Credits = 50
	e.updateSupport()
	if tank.HP != 1300500 || e.player(1).Credits != 0 {
		t.Fatal("affordable repair fraction incorrect", tank.HP, e.player(1).Credits)
	}
	tank.LastDamage = e.state.Tick
	tank.EverDamaged = true
	e.player(1).Credits = 10000
	old := tank.HP
	e.updateSupport()
	if tank.HP != old {
		t.Fatal("in-combat repair")
	}
	_ = truck
}
func TestEliminationDrawAndRecovery(t *testing.T) {
	e := fixture(t)
	for _, v := range e.state.Entities {
		v.HP = 0
	}
	e.cleanup()
	ticks(e, 600)
	if e.Outcome().Finished {
		t.Fatal("early elimination")
	}
	e.Advance()
	if !e.Outcome().Draw || !e.Outcome().Finished {
		t.Fatal("simultaneous elimination not draw")
	}
}
func TestConcealmentDetectionAndAmbush(t *testing.T) {
	e := fixture(t)
	e.player(2).Faction = "SY"
	v := e.spawn("SY.rifle", 2, Vec{X: 30000, Y: 30000}, true, 250000)
	e.state.Map.Tiles[30*64+30].Terrain = "cover"
	observer := e.spawn("US.rifle", 1, Vec{X: 40000, Y: 30000}, true, 300000)
	v.Stance = "hold"
	observer.Enabled = false
	ticks(e, 85)
	if !v.Concealed {
		t.Fatal("cover concealment failed")
	}
	observer.Position = Vec{X: 35000, Y: 30000}
	e.updateFog()
	if e.canSeeEntity(1, v) {
		t.Fatal("ordinary sight bypassed concealment")
	}
	recon := e.spawn("US.recon", 1, Vec{X: 35500, Y: 30500}, true, 350000)
	e.updateFog()
	if !e.canSeeEntity(1, v) {
		t.Fatal("recon did not detect concealed squad")
	}
	_ = recon
}
func TestAircraftLossDoesNotDeleteFleet(t *testing.T) {
	e := fixture(t)
	home := e.spawn("US.airfield", 1, Vec{X: 18000, Y: 18000}, true, 2200000)
	a := e.spawn("US.strike", 1, Vec{X: 30000, Y: 30000}, true, 1800000)
	a.Home = home.ID
	a.Landed = false
	a.Endurance = 2000
	home.HP = 0
	e.updateAircraft()
	if a.HP <= 0 || a.Home != 0 || a.Endurance > 1200 {
		t.Fatal("incorrect emergency rebase")
	}
	a.Endurance = 1
	e.updateAircraft()
	if a.HP != 0 {
		t.Fatal("unlanded aircraft did not expire")
	}
}
func FuzzSaveRestore(f *testing.F) {
	e := fixture(f)
	b, _ := e.Save()
	f.Add(b)
	f.Add([]byte(`{}`))
	f.Fuzz(func(t *testing.T, data []byte) {
		engine, err := Restore(content.MustBase(), data)
		if err == nil {
			save, err := engine.Save()
			if err != nil {
				t.Fatal(err)
			}
			if _, err = Restore(engine.catalog, save); err != nil {
				t.Fatal(err)
			}
		}
	})
}
