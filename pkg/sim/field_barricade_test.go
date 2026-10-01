package sim

import (
	"frontlinecommand/pkg/content"
	"slices"
	"testing"
)

// Admission/collision fixtures below declare infrastructure and actor placement
// explicitly. The separate forward course obtains its engineer through paid
// production and reaches the site through admitted movement.
func fieldBarricadeFixture(t *testing.T, faction string) (*Engine, *Entity) {
	t.Helper()
	e := groupOrderFixture(t, faction)
	builder := e.spawn(faction+".engineer", 1, Vec{X: 38000, Y: 20000}, true, 0)
	e.recalculate()
	e.updateFog()
	return e, builder
}

func fieldBarricadeReject(t *testing.T, e *Engine, o Order, want string) {
	t.Helper()
	before := e.Hash()
	code, _, applied := e.executeWithSelection(1, o)
	if code != want || applied != 0 || e.Hash() != before {
		t.Fatal("rejected barricade changed state", code, applied, want)
	}
}

func TestFieldBarricadeAdmission(t *testing.T) {
	t.Run("nearest_eligible_then_id_and_one_payment", func(t *testing.T) {
		e, a := fieldBarricadeFixture(t, "US")
		point := Vec{X: 40000, Y: 20500}
		b := e.spawn("US.engineer", 1, Vec{X: 42000, Y: 21000}, true, 0)
		disabled := e.spawn("US.engineer", 1, Vec{X: 40000, Y: 22000}, true, 0)
		disabled.DisabledUntil = e.Tick()+100
		rifle := e.spawn("US.rifle", 1, Vec{X: 43000, Y: 21000}, true, 0)
		e.assign(rifle, Order{Kind: "patrol", Points: []Vec{{X: 43000, Y: 21000}, {X: 44000, Y: 21000}}})
		rifle.Target = 3
		rifle.AimUntil = e.Tick()+20
		rifle.Channel = "inspection_fixture"
		rifle.ChannelUntil = e.Tick()+100
		rifle.Stance = "aggressive"
		e.updateFog()
		beforeB, beforeDisabled, beforeRifle := groupEntityBytes(t, b), groupEntityBytes(t, disabled), groupEntityBytes(t, rifle)
		o := Order{Kind: "build", Type: "barrier", Entities: []ID{rifle.ID, b.ID, disabled.ID, a.ID}, Position: point}
		before := e.Hash()
		advice := previewOne(t, e, o)
		if !advice.Accepted || advice.Code != "indeterminate" || !slices.Equal(advice.EligibleEntities, []ID{a.ID}) || advice.AppliedCount != 0 || e.Hash() != before {
			t.Fatal("barrier advice changed state or chose wrong equidistant source", advice)
		}
		credits, spent, next := e.player(1).Credits, e.player(1).Spent, e.state.NextID
		groupApplied(t, e, o, []ID{a.ID})
		foundation := e.entity(next)
		if foundation == nil || foundation.Type != "barrier" || foundation.Builder != a.ID || foundation.Complete || foundation.Paid != 150000 || e.player(1).Credits != credits-150000 || e.player(1).Spent != spent+150000 || e.state.NextID != next+1 {
			t.Fatal("barrier did not create exactly one paid foundation")
		}
		groupUnchanged(t, b, beforeB)
		groupUnchanged(t, disabled, beforeDisabled)
		groupUnchanged(t, rifle, beforeRifle)
	})

	t.Run("radius_bounds_and_foreign_atomicity", func(t *testing.T) {
		e, builder := fieldBarricadeFixture(t, "US")
		boundary := Vec{X: builder.Position.X+3000, Y: builder.Position.Y}
		v, code := e.fieldBarricadeBuilder(1, []ID{builder.ID}, boundary)
		if code != "ok" || v != builder { t.Fatal("inclusive three-tile boundary", code) }
		fieldBarricadeReject(t, e, Order{Kind: "build", Type: "barrier", Entities: []ID{builder.ID}, Position: Vec{X: boundary.X+500, Y: boundary.Y}}, "outside_builder_radius")
		foreign := e.spawn("IR.engineer", 2, Vec{X: 41000, Y: 21000}, true, 0)
		for _, ids := range [][]ID{{builder.ID, foreign.ID}, {builder.ID, 999999}, {builder.ID, builder.ID}} {
			fieldBarricadeReject(t, e, Order{Kind: "build", Type: "barrier", Entities: ids, Position: boundary}, "not_owner")
		}
	})

	for _, faction := range []string{"US", "SA", "IR", "SY"} {
		t.Run("active_barracks_"+faction, func(t *testing.T) {
			e, builder := fieldBarricadeFixture(t, faction)
			var barracks *Entity
			for _, v := range e.state.Entities { if v.Owner == 1 && e.role(v) == "barracks" { barracks = v; break } }
			if barracks == nil { t.Fatal("missing fixture barracks") }
			o := Order{Kind: "build", Type: "barrier", Entities: []ID{builder.ID}, Position: Vec{X: 40000, Y: 20500}}
			barracks.Enabled = false
			fieldBarricadeReject(t, e, o, "missing_prerequisite")
			barracks.Enabled = true
			barracks.Complete = false
			fieldBarricadeReject(t, e, o, "missing_prerequisite")
			barracks.Complete = true
			barracks.DisabledUntil = e.Tick()+100
			fieldBarricadeReject(t, e, o, "missing_prerequisite")
			barracks.DisabledUntil = 0
			groupApplied(t, e, o, []ID{builder.ID})
		})
	}

	t.Run("barrier_cap_includes_foundations_and_disabled", func(t *testing.T) {
		e, builder := fieldBarricadeFixture(t, "US")
		var foundations []*Entity
		for i := 0; i < 16; i++ {
			v := e.spawn("barrier", 1, Vec{X: 55000, Y: 2000+int32(i)*2000}, i%2 == 0, 150000)
			v.Enabled = false
			foundations = append(foundations, v)
		}
		o := Order{Kind: "build", Type: "barrier", Entities: []ID{builder.ID}, Position: Vec{X: 40000, Y: 20500}}
		fieldBarricadeReject(t, e, o, "barrier_limit")
		foundations[0].HP = 0
		groupApplied(t, e, o, []ID{builder.ID})
		if e.countRole(1, "barrier", true) != 16 { t.Fatal("replacement admission miscount") }
	})

	t.Run("physical_sixty_structure_cap", func(t *testing.T) {
		e, builder := fieldBarricadeFixture(t, "US")
		var last *Entity
		n := 0
		for _, v := range e.state.Entities { if v.Owner == 1 && v.Building && v.HP > 0 { n++ } }
		for n < 60 {
			last = e.spawn("power", 1, Vec{X: 55000, Y: 3000}, n%2 == 0, 500000)
			last.Enabled = false
			n++
		}
		o := Order{Kind: "build", Type: "barrier", Entities: []ID{builder.ID}, Position: Vec{X: 40000, Y: 20500}}
		fieldBarricadeReject(t, e, o, "structure_cap")
		last.HP = 0
		groupApplied(t, e, o, []ID{builder.ID})
	})

	t.Run("visible_full_footprint_and_ordinary_collision", func(t *testing.T) {
		e, builder := fieldBarricadeFixture(t, "US")
		o := Order{Kind: "build", Type: "barrier", Entities: []ID{builder.ID}, Position: Vec{X: 40000, Y: 20500}}
		obstacle := e.spawn("power", 2, o.Position, true, 0)
		e.updateFog()
		fieldBarricadeReject(t, e, o, "occupied")
		obstacle.HP = 0
		x, y := int32(39), int32(20)
		e.state.Map.Tiles[y*e.state.Map.Width+x].Mandatory = true
		fieldBarricadeReject(t, e, o, "mandatory_corridor")
		e.state.Map.Tiles[y*e.state.Map.Width+x].Mandatory = false
		// Declare loss of current sight on every footprint cell, retaining
		// explored terrain. Geometry advice must continue to defer visibility.
		for i := range e.visible[1] { e.visible[1][i] = false }
		fieldBarricadeReject(t, e, o, "unseen_placement")
	})
}

func TestFieldBarricadePaidForwardPersistence(t *testing.T) {
	e := groupOrderFixture(t, "US")
	builder := groupPaidUnit(t, e, "US.engineer")
	destination := Vec{X: 37000, Y: 20500}
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{builder.ID}, Position: destination})
	for i := 0; i < 2400 && len(builder.Orders) > 0; i++ { e.Advance() }
	if len(builder.Orders) != 0 || dist2(builder.Position, destination) > 350*350 { t.Fatal("ordinary forward movement did not arrive", builder.Position) }
	// Derive a snapped site from the actually arrived position, keeping it
	// inside the legal three-tile radius while requiring a physical approach.
	point := Vec{X: builder.Position.X/500*500+3000, Y: (builder.Position.Y+250)/500*500}
	if dist2(builder.Position, point) > fieldBarricadeRangeSquared { point.X -= 500 }
	for _, v := range e.state.Entities {
		if v.Owner == 1 && e.buildRange(v) > 0 && distance(v.Position, point) <= e.buildRange(v) { t.Fatal("forward fixture is inside a base build radius") }
	}
	replay, err := NewReplay(e)
	if err != nil { t.Fatal(err) }
	credits, spent, next := e.player(1).Credits, e.player(1).Spent, e.state.NextID
	contact := &Entity{Building: true, Type: "barrier", Position: point, FootprintWidth: 2, FootprintHeight: 1}
	if e.edgeDistance(builder, contact) <= 1100 { t.Fatal("forward test must require physical builder approach") }
	issue(t, e, 1, Order{Kind: "build", Type: "barrier", Entities: []ID{1, builder.ID}, Position: point})
	foundation := e.entity(next)
	if foundation == nil || foundation.Builder != builder.ID || foundation.Paid != 150000 || e.player(1).Credits != credits-150000 || e.player(1).Spent != spent+150000 || e.state.Results[0].AppliedCount != 1 {
		t.Fatal("ordinary forward build did not pay once")
	}
	if width, height := e.footprint(foundation); width != 2 || height != 1 { t.Fatal("wrong physical footprint", width, height) }
	if _, armed := e.weapon(foundation); armed || foundation.MaxHP != 800000 { t.Fatal("barrier HP or weapon differs from contract") }
	ticks(e, 50)
	if e.edgeDistance(builder, foundation) > 1100 { t.Fatal("engineer failed physical foundation contact within fifty ticks", builder.Position, e.edgeDistance(builder, foundation)) }
	if foundation.Complete { t.Fatal("barrier finished before its eight-second work") }
	save, err := e.Save()
	if err != nil { t.Fatal(err) }
	twin, err := Restore(content.MustBase(), save)
	if err != nil || twin.Hash() != e.Hash() { t.Fatal("paid barrier restore", err) }
	if err := replay.Capture(e, true); err != nil { t.Fatal(err) }
	for i := 0; i < 120; i++ {
		e.Advance(); twin.Advance()
		if e.Hash() != twin.Hash() { t.Fatal("paid barrier restore diverged", e.Tick()) }
	}
	if !foundation.Complete || foundation.HP != 800000 || e.player(1).Spent != spent+150000 || len(builder.Orders) != 0 { t.Fatal("eight-second forward construction did not complete once") }
	if err := replay.Capture(e, false); err != nil { t.Fatal(err) }
	full := *replay
	full.Checkpoints = nil
	for name, record := range map[string]*Replay{"full": &full, "checkpoint": replay} {
		played, err := record.Seek(e.catalog, e.Tick())
		if err != nil || played.Hash() != e.Hash() { t.Fatal(name, "paid barrier replay", err) }
	}
}

func TestFieldBarricadeEngineerResume(t *testing.T) {
	e, first := fieldBarricadeFixture(t, "US")
	point := Vec{X: 40000, Y: 20500}
	next := e.state.NextID
	groupApplied(t, e, Order{Kind: "build", Type: "barrier", Entities: []ID{first.ID}, Position: point}, []ID{first.ID})
	foundation := e.entity(next)
	groupApplied(t, e, Order{Kind: "stop", Entities: []ID{first.ID}}, []ID{first.ID})
	second := e.spawn("US.engineer", 1, Vec{X: 42000, Y: 21000}, true, 0)
	credits, spent := e.player(1).Credits, e.player(1).Spent
	groupApplied(t, e, Order{Kind: "resume", Entities: []ID{1, second.ID}, Target: foundation.ID}, []ID{second.ID})
	if foundation.Builder != second.ID || e.player(1).Credits != credits || e.player(1).Spent != spent { t.Fatal("engineer resume charged for existing foundation") }
	ordinary := e.spawn("power", 1, Vec{X: 44000, Y: 20500}, false, 500000)
	if code := e.validateResume(1, second, ordinary); code != "invalid_foundation" { t.Fatal("engineer resumed ordinary structure", code) }
}
