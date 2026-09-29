package sim

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func feedbackFixture(t *testing.T, cover bool) (*Engine, *Entity, *Entity) {
	e := fixture(t)
	shooter := e.spawn("US.rifle", 1, Vec{X: 16000, Y: 16000}, true, 300000)
	target := e.spawn("IR.rifle", 2, Vec{X: 20500, Y: 16000}, true, 300000)
	if cover {
		e.state.Map.Tiles[(target.Position.Y/1000)*e.state.Map.Width+target.Position.X/1000].Terrain = "cover"
	}
	shooter.Stance, target.Stance = "hold", "hold"
	e.recalculate()
	e.updateFog()
	return e, shooter, target
}
func feedbackEvent(t *testing.T, events []Event, kind string) Event {
	t.Helper()
	for _, event := range events {
		if event.Kind == kind {
			return event
		}
	}
	t.Fatalf("missing event %s", kind)
	return Event{}
}
func resolveFeedbackShot(e *Engine, shooter, target *Entity) {
	w, _ := e.weapon(shooter)
	e.launch(shooter, target, target.Position, w, w.Damage)
	e.state.Tick = 100
	e.updateProjectiles()
	e.resolveDamage()
	e.updateFog()
}
func exportFeedback(t *testing.T, name string, data any) {
	t.Helper()
	dir := os.Getenv("FRONTLINE_COMBAT_OUTPUT")
	if dir == "" {
		return
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	b, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(dir, name+".json"), b, 0644); err != nil {
		t.Fatal(err)
	}
}

func TestCombatFeedbackCoverResolutionAndPrivacy(t *testing.T) {
	for _, mode := range []string{"visible", "concealed", "fog", "embarked", "dead", "removed"} {
		t.Run(mode, func(t *testing.T) {
			e, shooter, target := feedbackFixture(t, true)
			resolveFeedbackShot(e, shooter, target)
			real := feedbackEvent(t, e.state.Events, "impact")
			if real.Combat == nil || real.Combat.Outcome != "hit" || real.Combat.TargetArmor != "infantry" || !real.Combat.CoverMitigated || real.Entity != target.ID {
				t.Fatal("actual covered damage lacks metadata", real)
			}
			switch mode {
			case "concealed":
				target.Concealed = true
				target.RevealedUntil = 0
				target.PublicRevealUntil = 0
			case "fog":
				target.Position = Vec{X: 48000, Y: 48000}
			case "embarked":
				target.Container = 999
			case "dead":
				target.HP = 0
			case "removed":
				e.state.Entities = e.state.Entities[:len(e.state.Entities)-1]
			}
			e.updateFog()
			before := e.Hash()
			view, _ := e.PlayerView(1)
			public := feedbackEvent(t, view.Events, "impact")
			if public.Combat == nil || public.Combat.Weapon != real.Combat.Weapon {
				t.Fatal("authorized explosion lost actual weapon")
			}
			if mode == "visible" {
				if public.Entity != target.ID || public.Combat.Outcome != "hit" || public.Combat.TargetArmor != "infantry" || !public.Combat.CoverMitigated {
					t.Fatal("visible result lost", public)
				}
			} else if public.Entity != 0 || public.Combat.Outcome != "" || public.Combat.TargetArmor != "" || public.Combat.CoverMitigated {
				t.Fatal("hidden target metadata leaked", mode, public)
			}
			exportFeedback(t, "privacy-"+mode, public)
			public.Combat.Weapon = "mutated"
			public.Combat.Outcome = "miss"
			public.Combat.TargetArmor = "hidden"
			public.Combat.CoverMitigated = false
			other, _ := e.PlayerFeedback(2)
			if len(other.Events) == 0 || e.Hash() != before || real.Combat.Weapon == "mutated" {
				t.Fatal("nested metadata aliased authoritative state")
			}
			next, _ := e.PlayerFeedback(1)
			if feedbackEvent(t, next.Events, "impact").Combat.Weapon == "mutated" {
				t.Fatal("perspectives alias")
			}
		})
	}
}

func TestCombatFeedbackWeaponSurvivesSourceConversionOrDeath(t *testing.T) {
	for _, mode := range []string{"converted", "dead", "removed"} {
		t.Run(mode, func(t *testing.T) {
			e, shooter, target := feedbackFixture(t, false)
			w, _ := e.weapon(shooter)
			e.launch(shooter, target, target.Position, w, w.Damage)
			switch mode {
			case "converted":
				shooter.Type = "US.tank"
			case "dead":
				shooter.HP = 0
			case "removed":
				for i, v := range e.state.Entities {
					if v.ID == shooter.ID {
						e.state.Entities = append(e.state.Entities[:i], e.state.Entities[i+1:]...)
						break
					}
				}
			}
			e.state.Tick = 100
			e.updateProjectiles()
			e.resolveDamage()
			for _, kind := range []string{"weapon_fired", "impact"} {
				event := feedbackEvent(t, e.state.Events, kind)
				if event.Combat == nil || event.Combat.Weapon != w.ID {
					t.Fatal("weapon guessed from live source", mode, kind, event)
				}
			}
		})
	}
}

func TestCombatFeedbackUnknownAndAreaOutcomesStayUnknown(t *testing.T) {
	areaOutputs := map[string]string{}
	for _, mode := range []string{"empty", "zero-damage", "decoy", "area-zero", "area-one", "area-many"} {
		t.Run(mode, func(t *testing.T) {
			e, shooter, target := feedbackFixture(t, true)
			w, _ := e.weapon(shooter)
			p := &Projectile{ID: e.newID(), Owner: 1, Shooter: shooter.ID, Target: target.ID, Weapon: w.ID, Position: target.Position, Impact: target.Position, ImpactAt: e.Tick(), Damage: w.Damage}
			switch mode {
			case "empty":
				p.Target = 0
			case "zero-damage":
				p.Damage = 0
			case "decoy":
				w, _ = e.catalog.Weapon("AA")
				p.Weapon = w.ID
				target.Type = "IR.fighter"
				target.Buffs = append(target.Buffs, Buff{Kind: "decoy", Until: e.Tick() + 100, Source: target.ID})
			case "area-zero", "area-one", "area-many":
				p.Target = 0
				p.Splash = 2000
				if mode == "area-zero" {
					target.Position = Vec{X: 48000, Y: 48000}
				}
				if mode == "area-many" {
					extra := e.spawn("IR.rifle", 2, Vec{X: 21000, Y: 17000}, true, 300000)
					extra.Concealed = true
				}
			}
			e.state.Projectiles = append(e.state.Projectiles, p)
			e.updateProjectiles()
			e.resolveDamage()
			e.updateFog()
			view, _ := e.PlayerView(1)
			event := feedbackEvent(t, view.Events, "impact")
			if event.Entity != 0 || event.Combat == nil || event.Combat.Weapon != p.Weapon || event.Combat.Outcome != "" || event.Combat.TargetArmor != "" || event.Combat.CoverMitigated {
				t.Fatal("unknown/area result acquired victim information", mode, event)
			}
			raw, _ := json.Marshal(event.Combat)
			var keys map[string]any
			json.Unmarshal(raw, &keys)
			if len(keys) != 1 {
				t.Fatal("unexpected combat metadata", string(raw))
			}
			if mode == "decoy" {
				feedbackEvent(t, e.state.Events, "decoy_triggered")
			}
			if mode == "area-zero" || mode == "area-one" || mode == "area-many" {
				raw, err := json.Marshal(view.Events)
				if err != nil {
					t.Fatal(err)
				}
				areaOutputs[mode] = string(raw)
			}
			exportFeedback(t, "unknown-"+mode, event)
		})
	}
	if areaOutputs["area-zero"] != areaOutputs["area-one"] || areaOutputs["area-one"] != areaOutputs["area-many"] {
		t.Fatal("area feedback disclosed zero/one/many hidden victim counts", areaOutputs)
	}
}

func TestCombatFeedbackRequiresActualPositiveResolvedDamage(t *testing.T) {
	e, shooter, target := feedbackFixture(t, true)
	w, _ := e.weapon(shooter)
	e.launch(shooter, target, target.Position, w, w.Damage)
	e.updateProjectiles()
	event := feedbackEvent(t, e.state.Events, "impact")
	if event.Combat.Outcome != "" {
		t.Fatal("queued damage reported as resolved")
	}
	target.HP = 0
	e.resolveDamage()
	if event.Combat.Outcome != "" {
		t.Fatal("dead target damage reported hit")
	}
	e, shooter, target = feedbackFixture(t, false)
	resolveFeedbackShot(e, shooter, target)
	event = feedbackEvent(t, e.state.Events, "impact")
	if event.Combat.Outcome != "hit" || event.Combat.CoverMitigated {
		t.Fatal("ordinary hit invented cover")
	}
}

func TestCombatFeedbackSaveReplayAndOrdinaryCommand(t *testing.T) {
	e, shooter, target := feedbackFixture(t, true)
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	issue(t, e, 1, Order{Kind: "attack", Entities: []ID{shooter.ID}, Target: target.ID})
	found := false
	for range 300 {
		for _, event := range e.state.Events {
			if event.Kind == "impact" && event.Combat != nil && event.Combat.CoverMitigated {
				found = true
			}
		}
		if found {
			break
		}
		e.Advance()
	}
	if !found {
		t.Fatal("ordinary attack did not produce real covered hit")
	}
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, saved)
	if err != nil || restored.Hash() != e.Hash() {
		t.Fatal("event-bearing save failed", err)
	}
	before, _ := e.PlayerView(1)
	after, _ := restored.PlayerView(1)
	a, _ := json.Marshal(before)
	b, _ := json.Marshal(after)
	if string(a) != string(b) {
		t.Fatal("restored authorized feedback differs")
	}
	if err = replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	replay.Checkpoints = nil
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("full combat replay differs", err)
	}
	exportFeedback(t, "ordinary-result", map[string]any{"hash": e.Hash(), "view": before})
	if dir := os.Getenv("FRONTLINE_COMBAT_OUTPUT"); dir != "" {
		if err = os.WriteFile(filepath.Join(dir, "ordinary.save.json"), saved, 0644); err != nil {
			t.Fatal(err)
		}
	}
	for range 80 {
		e.Advance()
		restored.Advance()
		if e.Hash() != restored.Hash() {
			t.Fatal("continuation differs")
		}
	}
}

func TestCombatFeedbackRejectsMalformedMetadata(t *testing.T) {
	for _, mode := range []string{"weapon", "kind", "outcome", "armor", "unresolved", "cover", "zero-target", "old-version"} {
		t.Run(mode, func(t *testing.T) {
			e, shooter, target := feedbackFixture(t, true)
			resolveFeedbackShot(e, shooter, target)
			index := 0
			for i, v := range e.state.Events {
				if v.Kind == "impact" {
					index = i
				}
			}
			event := &e.state.Events[index]
			switch mode {
			case "weapon":
				event.Combat.Weapon = "hidden-internal-name"
			case "kind":
				event.Kind = "under_attack"
			case "outcome":
				event.Combat.Outcome = "miss"
			case "armor":
				event.Combat.TargetArmor = "secret"
			case "unresolved":
				event.Combat.Outcome = ""
			case "cover":
				event.Combat.TargetArmor = "heavy"
			case "zero-target":
				event.Entity = 0
			case "old-version":
				e.state.Metadata.Simulation = "0.3.3"
			}
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			if _, err = Restore(e.catalog, saved); err == nil {
				t.Fatal("accepted malformed metadata", mode)
			}
		})
	}
}

func TestCombatFeedbackSimultaneousHitsKeepTheirResolutionIdentity(t *testing.T) {
	e, rifle, soft := feedbackFixture(t, true)
	tank := e.spawn("US.tank", 1, Vec{X: 18000, Y: 19000}, true, 1300000)
	heavy := e.spawn("IR.tank", 2, Vec{X: 22000, Y: 19000}, true, 1200000)
	heavy.HP = 1
	// Reverse target-ID order. Damage sorting must not move feedback to another event.
	cannon, _ := e.weapon(tank)
	small, _ := e.weapon(rifle)
	e.launch(tank, heavy, heavy.Position, cannon, cannon.Damage)
	e.launch(rifle, soft, soft.Position, small, small.Damage)
	e.state.Tick = 100
	e.updateProjectiles()
	e.resolveDamage()
	e.cleanup()
	e.updateFog()
	view, _ := e.PlayerView(1)
	seen := 0
	for _, event := range view.Events {
		if event.Kind != "impact" {
			continue
		}
		seen++
		if event.Combat == nil {
			t.Fatal("missing actual weapon")
		}
		switch event.Combat.Weapon {
		case small.ID:
			if event.Entity != soft.ID || event.Combat.Outcome != "hit" || event.Combat.TargetArmor != "infantry" || !event.Combat.CoverMitigated {
				t.Fatal("cover cue moved to other event", event)
			}
		case cannon.ID:
			if event.Entity != 0 || event.Combat.Outcome != "" || event.Combat.TargetArmor != "" || event.Combat.CoverMitigated {
				t.Fatal("killed target leaked", event)
			}
		default:
			t.Fatal("unexpected weapon")
		}
	}
	if seen != 2 {
		t.Fatal("expected two distinct impacts", seen)
	}
	exportFeedback(t, "simultaneous", view.Events)
}
