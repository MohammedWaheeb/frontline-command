package sim

import (
	"frontlinecommand/pkg/content"
	"reflect"
	"strconv"
	"testing"
)

func aiBlockedCollectorFixture(t *testing.T) (*Engine, ID) {
	t.Helper()
	m := fixtureMap()
	m.Fields[0].Position = Vec{X: 20000, Y: 8000}
	m.Fields[1].Position = Vec{X: 34000, Y: 23000}
	e, err := New(content.MustBase(), Config{Map: m, Seed: 42, Players: []PlayerConfig{{ID: 1, Faction: "US", Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	for y := int32(1); y <= 16; y++ {
		for x := int32(12); x <= 28; x++ {
			if y == 1 || y == 16 || x == 12 || x == 28 {
				e.state.Map.Tiles[y*m.Width+x].Terrain = "cliff"
			}
		}
	}
	// A one-tile public opening passes map connectivity validation but is too
	// narrow for the hauler's full movement clearance.
	e.state.Map.Tiles[8*m.Width+28].Terrain = "open"
	e.state.Countdown = 0
	e.spawn("supply", 1, Vec{X: 34000, Y: 13000}, true, 1800000).IncludedHauler = true
	e.spawn("US.recon", 1, m.Fields[0].Position, true, 0)
	e.spawn("US.recon", 1, m.Fields[1].Position, true, 0)
	v := e.spawn("US.hauler", 1, Vec{X: 34000, Y: 8000}, true, 900000)
	e.recalculate()
	e.updateFog()
	issue(t, e, 1, Order{Kind: "gather", Entities: []ID{v.ID}, Target: 1})
	ticks(e, 400)
	if !v.Blocked || e.Tick()-v.StationarySince < seconds(12) || v.Field != 1 {
		t.Fatalf("ordinary Gather did not reproduce sustained failure: tick=%d position=%v field=%d blocked=%v stationary=%d", e.Tick(), v.Position, v.Field, v.Blocked, v.StationarySince)
	}
	return e, v.ID
}

func TestAIBlockedCollectorFailoverDeliversAndRestores(t *testing.T) {
	a, id := aiBlockedCollectorFixture(t)
	a.entity(id).Cargo = 200000 // An interrupted partial load remains owned cargo.
	saved, err := a.Save()
	if err != nil {
		t.Fatal(err)
	}
	b, err := Restore(a.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	before := a.player(1).Income
	for _, e := range []*Engine{a, b} {
		v := e.entity(id)
		o, ok := e.aiBlockedCollectorOrder(e.player(1), v)
		if !ok || o.Kind != "gather" || o.Target != 2 || !cooldown(v.Cooldowns, aiFieldRetryKey(1), e.Tick()) {
			t.Fatal("failed field did not select known reachable alternative", o, ok)
		}
		issue(t, e, 1, o)
		if v.Cargo != 200000 || v.Field != 2 {
			t.Fatal("ordinary failover discarded cargo or did not assign field", v.Cargo, v.Field)
		}
	}
	for range 2400 {
		a.Advance()
		b.Advance()
		if a.Hash() != b.Hash() {
			t.Fatal("restored collector recovery diverged", a.Tick())
		}
		if a.player(1).Income > before {
			t.Logf("ordinary Gather failover delivered at tick=%d income_delta=%d field=%d; restored hashes equal", a.Tick(), a.player(1).Income-before, a.entity(id).Field)
			return
		}
	}
	t.Fatal("reachable alternative did not produce a delivery", a.entity(id))
}

func TestAIBlockedCollectorPreservesProtectedTasks(t *testing.T) {
	base, id := aiBlockedCollectorFixture(t)
	saved, _ := base.Save()
	for _, condition := range []string{"moving", "recent", "returning", "full", "loading", "retreat", "queued", "mission", "not_owner"} {
		t.Run(condition, func(t *testing.T) {
			e, err := Restore(base.catalog, saved)
			if err != nil {
				t.Fatal(err)
			}
			v := e.entity(id)
			switch condition {
			case "moving":
				v.Blocked = false
			case "recent":
				v.StationarySince = e.Tick() - seconds(11)
			case "returning":
				v.State = "returning_cargo"
			case "full":
				v.Cargo = 600000
			case "loading":
				v.State = "loading"
			case "retreat":
				v.HaulerRetreating = true
			case "queued":
				v.Orders = append(v.Orders, Order{Kind: "move", Position: Vec{X: 30000, Y: 30000}})
			case "mission":
				e.state.Mission = &MissionState{}
			case "not_owner":
				v.Owner = 2
			}
			if o, ok := e.aiBlockedCollectorOrder(e.player(1), v); ok {
				t.Fatal("interrupted protected task", condition, o)
			}
		})
	}
}

func TestAIBlockedCollectorUsesOnlyKnownFieldsAndRetryExpires(t *testing.T) {
	e, id := aiBlockedCollectorFixture(t)
	v := e.entity(id)
	p := e.player(1)
	known := append([]FieldObservation(nil), p.KnownFields...)
	p.KnownFields = known[:1]
	if o, ok := e.aiBlockedCollectorOrder(p, v); ok {
		t.Fatal("selected unobserved alternative", o)
	}
	p.KnownFields = known
	setCooldown(&v.Cooldowns, aiFieldRetryKey(2), e.Tick()+seconds(60))
	if o, ok := e.aiBlockedCollectorOrder(p, v); ok {
		t.Fatal("ignored failed-field retry memory", o)
	}
	// Reopening is public terrain here; no hidden live resource value is used.
	for y := int32(1); y <= 16; y++ {
		e.state.Map.Tiles[y*e.state.Map.Width+28].Terrain = "open"
	}
	e.state.NavigationRevision++
	e.state.Tick += seconds(61)
	v.Field, v.Orders[0].Target = 2, 2
	setCooldown(&v.Cooldowns, aiFieldRetryKey(1), e.Tick()-1)
	if o, ok := e.aiBlockedCollectorOrder(p, v); !ok || o.Target != 1 {
		t.Fatal("did not retry reopened known field after cooldown", o, ok)
	}
	// Move fixture observers away so the retained field stock is actually fogged.
	for _, actor := range e.state.Entities {
		if actor.Owner == p.ID && !actor.Building && e.role(actor) != "rig" {
			actor.Position = Vec{X: 34000, Y: 26000}
		}
	}
	e.updateFog()
	if e.canSee(p.ID, e.field(1).Position) {
		t.Fatal("hidden-stock fixture still sees the field")
	}
	// Hidden stock and a concealed distant blocker cannot alter our decision.
	saved, _ := e.Save()
	b, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	b.field(1).Remaining = 0
	b.spawn("factory", 2, Vec{X: 47000, Y: 42000}, true, 0)
	b.updateFog()
	ao, aok := e.aiBlockedCollectorOrder(p, v)
	bo, bok := b.aiBlockedCollectorOrder(b.player(1), b.entity(id))
	if aok != bok || !reflect.DeepEqual(ao, bo) {
		t.Fatal("hidden extraction or occupancy changed failover", ao, bo, aok, bok)
	}
}

func TestAIBlockedCollectorManyFieldsKeepSaveableRetryMemory(t *testing.T) {
	e, id := aiBlockedCollectorFixture(t)
	v, p := e.entity(id), e.player(1)
	// These observed fields share the same clearance-disconnected enclosure.
	// Field 2 remains the known reachable failover for each collection failure.
	for field := uint32(10); field <= 64; field++ {
		position := e.field(1).Position
		e.state.Map.Fields = append(e.state.Map.Fields, content.Field{ID: field, Position: position, Credits: 36000000})
		e.state.Fields = append(e.state.Fields, &ResourceField{ID: field, Position: position, Remaining: 36000000})
	}
	e.updateFog()
	gameplay := []Cooldown{{ID: "retreat_when_attacked", Until: e.Tick() + seconds(90)}, {ID: "expired_gameplay", Until: 0}}
	v.Cooldowns = append(v.Cooldowns, gameplay...)
	for field := uint32(10); field <= 64; field++ {
		v.Field, v.Orders[0].Target = field, ID(field)
		if order, ok := e.aiBlockedCollectorOrder(p, v); !ok || order.Target != 2 {
			t.Fatal("many-field recovery did not retain reachable alternative", field, order, ok)
		}
		if len(v.Cooldowns) > len(gameplay)+16 || !cooldown(v.Cooldowns, aiFieldRetryKey(field), e.Tick()) {
			t.Fatal("retry memory exceeded bound or evicted the current failure", field, v.Cooldowns)
		}
	}
	if !reflect.DeepEqual(v.Cooldowns[:len(gameplay)], gameplay) {
		t.Fatal("retry eviction changed gameplay cooldowns", v.Cooldowns)
	}
	for offset := 0; offset < 16; offset++ {
		if got := v.Cooldowns[len(gameplay)+offset].ID; got != aiFieldRetryKey(uint32(49+offset)) {
			t.Fatal("retry eviction did not preserve stable FIFO order", offset, got)
		}
	}
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal("many-field retry memory made save unrestorable", err)
	}
	if restored.Hash() != e.Hash() || !cooldown(restored.entity(id).Cooldowns, aiFieldRetryKey(64), e.Tick()) {
		t.Fatal("many-field retry memory changed on restore")
	}
	e.state.Tick += seconds(61)
	if order, ok := e.aiBlockedCollectorOrder(p, v); !ok || order.Target != 2 {
		t.Fatal("expired retries prevented field recovery", order, ok)
	}
	if len(v.Cooldowns) != len(gameplay)+1 || !reflect.DeepEqual(v.Cooldowns[:len(gameplay)], gameplay) || !cooldown(v.Cooldowns, aiFieldRetryKey(64), e.Tick()) {
		t.Fatal("expired retry entries were not pruned while preserving gameplay", v.Cooldowns)
	}
	t.Logf("55 failed observed fields retained 16 retries; save/restore hash equal; expired retries pruned to 1")
}

func TestAIBlockedCollectorRetryMemoryPreservesFullGameplayLedger(t *testing.T) {
	for _, count := range []int{20, 32} {
		t.Run(strconv.Itoa(count), func(t *testing.T) {
			e, id := aiBlockedCollectorFixture(t)
			v := e.entity(id)
			for index := 0; index < count; index++ {
				v.Cooldowns = append(v.Cooldowns, Cooldown{ID: "gameplay_" + strconv.Itoa(index), Until: e.Tick() + seconds(90)})
			}
			before := append([]Cooldown(nil), v.Cooldowns...)
			order, ok := e.aiBlockedCollectorOrder(e.player(1), v)
			if count == 32 {
				if ok || !reflect.DeepEqual(v.Cooldowns, before) {
					t.Fatal("full gameplay ledger was overwritten or exceeded", order, v.Cooldowns)
				}
			} else if !ok || order.Target != 2 || len(v.Cooldowns) > 32 || !reflect.DeepEqual(v.Cooldowns[:count], before) || !cooldown(v.Cooldowns, aiFieldRetryKey(1), e.Tick()) {
				t.Fatal("gameplay cooldowns or current failure lost under ledger pressure", order, v.Cooldowns)
			}
		})
	}
}
