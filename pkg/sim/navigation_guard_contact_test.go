package sim

import (
	"crypto/sha256"
	"encoding/hex"
	"frontlinecommand/pkg/content"
	"os"
	"reflect"
	"testing"
)

func TestNavigationGuardContactScopeAndOverlap(t *testing.T) {
	cases := []struct {
		name string
		actorType string
		allyType string
		kind string
		prepare func(*Engine, *Entity, *Entity, *Order)
		want int32
	}{
		{name: "ground guard", actorType: "US.apc", allyType: "US.apc", kind: "guard", want: 1320},
		{name: "ground escort", actorType: "US.apc", allyType: "US.apc", kind: "escort", want: 1320},
		{name: "allied teammate", actorType: "US.apc", allyType: "US.apc", kind: "guard", want: 1320, prepare: func(e *Engine, v, a *Entity, o *Order) { a.Owner = 2; e.player(2).Team = e.player(1).Team }},
		{name: "small bodies", actorType: "US.rifle", allyType: "US.rifle", kind: "guard", want: 1000},
		{name: "950 bodies stay ordinary", actorType: "US.apc", allyType: "US.rifle", kind: "guard", want: 1000},
		{name: "point guard", actorType: "US.apc", allyType: "US.apc", kind: "guard", want: 1000, prepare: func(e *Engine, v, a *Entity, o *Order) { o.Target = 0 }},
		{name: "aggressive", actorType: "US.apc", allyType: "US.apc", kind: "aggressive", want: 1000},
		{name: "ordinary move", actorType: "US.apc", allyType: "US.apc", kind: "move", want: 1000},
		{name: "building", actorType: "US.apc", allyType: "power", kind: "guard", want: 1000},
		{name: "retained foundation", actorType: "US.apc", allyType: "power", kind: "guard", want: 1000, prepare: func(e *Engine, v, a *Entity, o *Order) { a.Complete = false; a.FootprintWidth = 6; a.FootprintHeight = 4 }},
		{name: "air actor", actorType: "US.gunship", allyType: "US.apc", kind: "guard", want: 1000},
		{name: "grounded air actor", actorType: "US.gunship", allyType: "US.apc", kind: "guard", want: 1000, prepare: func(e *Engine, v, a *Entity, o *Order) { v.Landed = true }},
		{name: "air ally", actorType: "US.apc", allyType: "US.gunship", kind: "guard", want: 1000},
		{name: "grounded air ally", actorType: "US.apc", allyType: "US.gunship", kind: "guard", want: 1000, prepare: func(e *Engine, v, a *Entity, o *Order) { a.Landed = true }},
		{name: "remote service reservation", actorType: "US.apc", allyType: "US.gunship", kind: "guard", want: 1000, prepare: func(e *Engine, v, a *Entity, o *Order) { a.Landing = &LandingReservation{Home: 1, Position: Vec{X: 26000, Y: 24000}} }},
		{name: "passive nonblocking beacon", actorType: "US.hauler", allyType: "IR.beacon", kind: "guard", want: 1000},
		{name: "dead ally", actorType: "US.apc", allyType: "US.apc", kind: "guard", want: 1000, prepare: func(e *Engine, v, a *Entity, o *Order) { a.HP = 0 }},
		{name: "contained ally", actorType: "US.apc", allyType: "US.apc", kind: "guard", want: 1000, prepare: func(e *Engine, v, a *Entity, o *Order) { a.Container = v.ID }},
		{name: "dead actor", actorType: "US.apc", allyType: "US.apc", kind: "guard", want: 1000, prepare: func(e *Engine, v, a *Entity, o *Order) { v.HP = 0 }},
		{name: "contained actor", actorType: "US.apc", allyType: "US.apc", kind: "guard", want: 1000, prepare: func(e *Engine, v, a *Entity, o *Order) { v.Container = a.ID }},
		{name: "unallied", actorType: "US.apc", allyType: "US.apc", kind: "guard", want: 1000, prepare: func(e *Engine, v, a *Entity, o *Order) { a.Owner = 2 }},
		{name: "missing ally", actorType: "US.apc", allyType: "US.apc", kind: "guard", want: 1000, prepare: func(e *Engine, v, a *Entity, o *Order) { o.Target = 999999 }},
		{name: "self", actorType: "US.apc", allyType: "US.apc", kind: "guard", want: 1000, prepare: func(e *Engine, v, a *Entity, o *Order) { o.Target = v.ID; v.Anchor = v.Position }},
		{name: "stale anchor", actorType: "US.apc", allyType: "US.apc", kind: "guard", want: 1000, prepare: func(e *Engine, v, a *Entity, o *Order) { v.Anchor.X-- }},
		{name: "real overlap is not contact", actorType: "US.apc", allyType: "US.apc", kind: "guard", want: 1000, prepare: func(e *Engine, v, a *Entity, o *Order) { v.Position.X = a.Position.X - 1199 }},
		{name: "tangency is legal", actorType: "US.apc", allyType: "US.apc", kind: "guard", want: 1320, prepare: func(e *Engine, v, a *Entity, o *Order) { v.Position.X = a.Position.X - 1200 }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			e := fixture(t)
			v := e.spawn(c.actorType, 1, Vec{X: 20000, Y: 20000}, true, 700000)
			a := e.spawn(c.allyType, 1, Vec{X: 24000, Y: 20000}, true, 700000)
			o := Order{Kind: c.kind, Target: a.ID, Position: a.Position}
			v.Anchor = a.Position
			if c.prepare != nil { c.prepare(e, v, a, &o) }
			before := e.Hash()
			e.pathBudget = 7
			if got := e.guardFollowDistance(v, o); got != c.want || e.Hash() != before || e.pathBudget != 7 {
				t.Fatal("follow boundary changed scope, authoritative state or routing budget", got, c.want, e.pathBudget)
			}
		})
	}
}

// These are component controls at the exact observed contact positions and
// prefixes, not replacements for the original 500-tick strip journey. The full
// failed 501 save is loaded unchanged by the separate continuation below.
func TestNavigationGuardContactRecordedCloseFramesRetainQueueAndReplay(t *testing.T) {
	frames := []struct {
		name string
		tick Tick
		stationary Tick
		position Vec
		facing int32
		end Vec
		path []Vec
		edge int32
	}{
		{name: "tick317 gap90", tick: 317, stationary: 316, position: Vec{X: 115000, Y: 78660}, facing: 90000, end: Vec{X: 114000, Y: 78500}, path: []Vec{{X: 114500, Y: 78500}, {X: 114000, Y: 78500}}, edge: 90},
		{name: "tick392 gap48", tick: 392, stationary: 392, position: Vec{X: 114372, Y: 78871}, facing: 45148, end: Vec{X: 115000, Y: 79500}, path: []Vec{{X: 114500, Y: 79000}, {X: 115000, Y: 79500}}, edge: 48},
	}
	for _, f := range frames {
		for _, kind := range []string{"guard", "escort"} {
			t.Run(f.name+"/"+kind, func(t *testing.T) {
				e, v := offGridStripFixture(t, true)
				a := e.spawn("SA.car", 2, Vec{X: 115000, Y: 79950}, true, 500000)
				v.Position, v.LastPosition, v.Anchor = f.position, f.position, a.Position
				v.Facing, v.State = f.facing, "moving"
				v.Orders = []Order{{Kind: kind, Target: a.ID, Position: Vec{X: 115000, Y: 75000}}}
				v.Path, v.PathEnd, v.PathGoal = append([]Vec(nil), f.path...), f.end, a.Position
				v.PathResolved, v.PathRevision = true, e.state.NavigationRevision
				v.LastProgress, v.StationarySince = f.stationary, f.stationary
				e.state.Tick = f.tick
				e.recalculate()
				e.updateFog()
				if v.ID != 10 || a.ID != 12 || e.edgeDistance(v, a) != f.edge || distance(v.Position, a.Position) <= 1000 || !e.clear(v.Position, e.radius(v), v.ID, false, true) {
					t.Fatal("recorded contact geometry changed", v.ID, a.ID, v.Position, e.edgeDistance(v, a))
				}
				recorder, err := NewReplay(e)
				if err != nil { t.Fatal(err) }
				saved, err := e.Save()
				if err != nil { t.Fatal(err) }
				cold, err := Restore(e.catalog, saved)
				if err != nil || cold.Hash() != e.Hash() { t.Fatal("cold contact restore", err) }
				queued := Order{Kind: "move", Entities: []ID{v.ID}, Position: Vec{X: 120000, Y: 80000}, Queued: true}
				sequence := e.player(2).LastSequence + 1
				if err := e.Submit(2, sequence, []Order{queued}); err != nil { t.Fatal(err) }
				if err := cold.Submit(2, sequence, []Order{queued}); err != nil { t.Fatal(err) }
				var mid *Engine
				for step := 0; step < 40; step++ {
					e.Advance()
					cold.Advance()
					if mid != nil { mid.Advance() }
					if v.Position != f.position || v.Facing != f.facing || v.MoveRemainder != 0 || v.StationarySince != f.stationary || v.LastProgress != f.stationary || v.Anchor != a.Position || v.PathGoal != a.Position || v.PathEnd != f.end || !reflect.DeepEqual(v.Path, f.path) || len(v.Orders) != 2 || v.Orders[0].Kind != kind || v.Orders[0].Target != a.ID || v.Orders[1].Kind != "move" || e.pathBudget != 12 {
						t.Fatal("contact moved, consumed its queue or rewrote route intent", e.Tick(), v.Position, v.Facing, v.Path, v.Orders, e.pathBudget)
					}
					if e.Hash() != cold.Hash() || mid != nil && mid.Hash() != e.Hash() { t.Fatal("contact restore diverged", e.Tick()) }
					if step == 19 {
						checkpoint, err := recorder.CaptureCheckpoint(e)
						if err != nil { t.Fatal(err) }
						mid, err = Restore(e.catalog, checkpoint)
						if err != nil { t.Fatal(err) }
					}
				}
				if err := recorder.Capture(e, false); err != nil { t.Fatal(err) }
				for _, checkpoint := range []bool{true, false} {
					r := *recorder
					if !checkpoint { r.Checkpoints = nil }
					played, err := r.Seek(e.catalog, e.Tick())
					if err != nil || played.Hash() != e.Hash() { t.Fatal("contact replay", checkpoint, err) }
				}
			})
		}
	}
}

func TestNavigationGuardContactPreservesCombatApproach(t *testing.T) {
	e := fixture(t)
	v := e.spawn("US.apc", 1, Vec{X: 20000, Y: 20000}, true, 700000)
	a := e.spawn("US.apc", 1, Vec{X: 21252, Y: 20000}, true, 700000)
	enemy := e.spawn("IR.tank", 2, Vec{X: 27052, Y: 20000}, true, 1400000)
	e.assign(v, Order{Kind: "guard", Target: a.ID, Position: a.Position})
	v.Target = enemy.ID
	e.recalculate()
	e.updateFog()
	w, _ := e.weapon(v)
	if e.edgeDistance(v, a) != 52 || !e.canAttack(v, enemy) || !e.canSeeEntity(v.Owner, enemy) || e.edgeDistance(v, enemy) <= w.MaxRange || distance(v.Anchor, enemy.Position) > e.combatLeash(v) {
		t.Fatal("combat control lacks an ordinary visible out-of-range target inside the Guard leash")
	}
	expected := e.approachPoint(v, enemy)
	e.Advance()
	if v.PathGoal != expected || e.pathBudget != 11 || len(v.Orders) != 1 || v.Orders[0].Target != a.ID || v.Anchor != a.Position {
		t.Fatal("physical contact allowance suppressed the existing combat approach", v.PathGoal, expected, e.pathBudget)
	}
}

// This continuation is a distinct diagnostic starting AFTER the failed 501
// deadline. It does not replace or extend the original strict 500-step test.
func TestNavigationGuardContactOriginalFailedCycleContinuation(t *testing.T) {
	file := os.Getenv("FRONTLINE_GUARD_CONTACT_FAILED_SAVE")
	if file == "" { t.Skip("set FRONTLINE_GUARD_CONTACT_FAILED_SAVE to the immutable root06 compact Guard final.save.json") }
	data, err := os.ReadFile(file)
	if err != nil { t.Fatal(err) }
	digest := sha256.Sum256(data)
	if hex.EncodeToString(digest[:]) != "83b27d9de12f8ea527a14badb99a145852dd6e1f67760dce1cffb8cc21326024" { t.Fatal("original failed Guard save changed") }
	e, err := Restore(content.MustBase(), data)
	if err != nil { t.Fatal(err) }
	v, a := e.entity(10), e.entity(12)
	if e.Tick() != 501 || e.Hash() != "1d8da0b0889259788eb8af4a95f9cf7afaefc655ad0f89d1cbce93c60fb0eed4" || v == nil || a == nil || v.Position != (Vec{X: 114033, Y: 78532}) || a.Position != (Vec{X: 115000, Y: 79950}) || v.PathEnd != (Vec{X: 115000, Y: 79500}) || e.edgeDistance(v, a) != 516 || len(v.Orders) != 1 || v.Orders[0].Kind != "guard" || v.Orders[0].Target != a.ID || v.Paid != 750000 || v.HP != 550000 || a.HP != 450000 {
		t.Fatal("immutable failed cycle state changed")
	}
	recorder, err := NewReplay(e)
	if err != nil { t.Fatal(err) }
	cold, err := Restore(e.catalog, data)
	if err != nil { t.Fatal(err) }
	paid := e.playerTelemetry(2).RepairSpent
	firstContact := Tick(0)
	var contactPosition Vec
	var mid *Engine
	for step := 0; step < 100; step++ {
		previous := *v
		e.Advance()
		cold.Advance()
		if mid != nil { mid.Advance() }
		if !e.navigationBridgeClear(&previous, v.Position, true) || !e.clear(v.Position, e.radius(v), v.ID, false, true) { t.Fatal("cycle recovery crossed an actual collider", e.Tick(), previous.Position, v.Position) }
		if firstContact == 0 && e.edgeDistance(v, a) <= 120 { firstContact, contactPosition = e.Tick(), v.Position }
		if firstContact != 0 && (v.Position != contactPosition || e.edgeDistance(v, a) > 120) { t.Fatal("retained Guard left its recovered physical contact", e.Tick(), v.Position) }
		if e.Hash() != cold.Hash() || mid != nil && mid.Hash() != e.Hash() { t.Fatal("cycle continuation restore diverged", e.Tick()) }
		if step == 49 {
			saved, err := recorder.CaptureCheckpoint(e)
			if err != nil { t.Fatal(err) }
			mid, err = Restore(e.catalog, saved)
			if err != nil { t.Fatal(err) }
		}
	}
	if firstContact == 0 || e.edgeDistance(v, a) > 120 || v.Paid != 750000 || v.HP != 550000 || a.HP != 450000 || a.Position != (Vec{X: 115000, Y: 79950}) || e.playerTelemetry(2).RepairSpent != paid || len(v.Orders) != 1 || v.Orders[0].Kind != "guard" || v.Orders[0].Target != a.ID || v.Orders[0].Position != (Vec{X: 115000, Y: 75000}) || v.Anchor != a.Position {
		t.Fatal("ordinary retained Guard did not recover contact without changing scene/task/health/funds", firstContact, e.edgeDistance(v, a), v.Orders)
	}
	if err := recorder.Capture(e, false); err != nil { t.Fatal(err) }
	for _, checkpoint := range []bool{true, false} {
		r := *recorder
		if !checkpoint { r.Checkpoints = nil }
		played, err := r.Seek(e.catalog, e.Tick())
		if err != nil || played.Hash() != e.Hash() { t.Fatal("cycle continuation replay", checkpoint, err) }
	}
	t.Logf("unchanged failed501 continuation firstContact%d end%d gap%d position%v; original501 failure remains preserved", firstContact, e.Tick(), e.edgeDistance(v, a), v.Position)
}
