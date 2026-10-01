package sim

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestTacticalProjectileGeometryAndPositionDisclosure(t *testing.T) {
	e := fixture(t)
	near, hidden := Vec{X: 8000, Y: 8000}, Vec{X: 54000, Y: 54000}
	cases := []*Projectile{
		{ID: e.newID(), Owner: 2, Weapon: "SATURATION", Position: hidden, Impact: near, ImpactAt: 280, Splash: 2000, Interceptable: true, Strategic: true},
		{ID: e.newID(), Owner: 2, Weapon: "SKYBREAKER", Position: near, Impact: near, ImpactAt: 1, Splash: 2000, Strategic: true},
		{ID: e.newID(), Owner: 2, Weapon: "TANK", Position: near, Impact: hidden, ImpactAt: 4, Splash: 4321},
		{ID: e.newID(), Owner: 2, Weapon: "TANK", Position: hidden, Impact: hidden, ImpactAt: 4, Splash: 0},
	}
	e.state.Projectiles = cases
	e.updateFog()
	before := e.Hash()
	view, ok := e.PlayerView(1)
	if !ok || len(view.Projectiles) != 3 {
		t.Fatalf("visible/warning filter: %+v", view.Projectiles)
	}
	a, b, c := view.Projectiles[0], view.Projectiles[1], view.Projectiles[2]
	if a.PositionVisible || a.Position != near || a.Impact != near || a.Splash != 2000 {
		t.Fatalf("hidden warning leaks or loses area: %+v", a)
	}
	if !b.PositionVisible || b.Position != b.Impact || b.Splash != 2000 {
		t.Fatalf("visible coincident body incorrectly hidden: %+v", b)
	}
	if !c.PositionVisible || c.Impact != near || c.Splash != 4321 {
		t.Fatalf("nonwarning body/hidden impact/instance radius: %+v", c)
	}
	enemy, _ := e.PlayerView(2)
	if len(enemy.Projectiles) != 3 || !enemy.Projectiles[0].PositionVisible || enemy.Projectiles[1].PositionVisible || enemy.Projectiles[2].ID != cases[3].ID {
		t.Fatalf("second perspective lost natural sight: %+v", enemy.Projectiles)
	}
	if e.Hash() != before {
		t.Fatal("view presentation mutated authoritative state")
	}
	raw, err := json.Marshal(a)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]any
	if err = json.Unmarshal(raw, &fields); err != nil {
		t.Fatal(err)
	}
	if visible, present := fields["position_visible"]; !present || visible != false {
		t.Fatal("false presence must survive JSON")
	}
	for _, key := range []string{"origin", "shooter", "target", "intercept_at", "intercepted_by"} {
		if _, found := fields[key]; found {
			t.Fatalf("hidden projectile field leaked: %s", key)
		}
	}
	exportTacticalView(t, "projectiles", []View{view, enemy})
}

func TestTacticalStrategicWarningsUseActualImpactRadius(t *testing.T) {
	for _, faction := range []string{"US", "IR"} {
		t.Run(faction, func(t *testing.T) {
			e, site := strategicFixture(t, faction)
			point := e.entity(3).Position
			e.spawn(faction+".engineer", 1, Vec{X: 51000, Y: 54000}, true, 400000)
			e.updateFog()
			issue(t, e, 1, Order{Kind: "ability", Type: "strategic", Entities: []ID{site.ID}, Points: []Vec{point, point, point}})
			view, _ := e.PlayerView(2)
			if faction == "US" {
				if len(view.Warnings) != 3 {
					t.Fatal("three actual flight warnings required")
				}
				for _, w := range view.Warnings {
					if w.Splash == nil || *w.Splash != strategicImpactRadius || w.Source != 0 || len(w.Exits) != 0 {
						t.Fatalf("public skybreaker disclosure: %+v", w)
					}
				}
				save, err := e.Save()
				if err != nil {
					t.Fatal(err)
				}
				restored, err := Restore(e.catalog, save)
				if err != nil {
					t.Fatal(err)
				}
				after, _ := restored.PlayerView(2)
				a, _ := json.Marshal(view)
				b, _ := json.Marshal(after)
				if string(a) != string(b) {
					t.Fatal("warning state changed on restore")
				}
				// Follow real flight until the one-tick-lived bomb first becomes visible.
				for n := 0; n < 800 && len(e.state.Projectiles) == 0; n++ {
					e.Advance()
				}
				if len(e.state.Projectiles) == 0 {
					t.Fatal("real Skybreaker never dropped")
				}
			} else if len(view.Projectiles) != 6 {
				t.Fatal("all six saturation projectiles required")
			}
			impactView, _ := e.PlayerView(2)
			for _, p := range impactView.Projectiles {
				if p.Splash != strategicImpactRadius {
					t.Fatalf("projectile radius differs from warning: %+v", p)
				}
			}
			exportTacticalView(t, "strategic-"+faction, []View{view, impactView})
		})
	}
}

func TestTacticalNonblastWarningsKeepAreaUnknown(t *testing.T) {
	e := fixture(t)
	launcher := e.spawn("IR.launcher", 1, Vec{X: 12000, Y: 18000}, true, 1)
	house := e.spawn("SY.safehouse", 1, Vec{X: 18000, Y: 18000}, true, 1)
	destination := e.spawn("SY.safehouse", 1, Vec{X: 24000, Y: 18000}, true, 1)
	house.Channel = "transit"
	house.ChannelTarget = destination.ID
	house.ChannelUntil = 50
	e.state.Operations = []Operation{{Kind: "second_volley", Owner: 1, Source: launcher.ID, At: 50, Points: []Vec{{X: 55000, Y: 55000}}}, {Kind: "raid", Owner: 1, Source: house.ID, At: 50, Points: []Vec{{X: 18500, Y: 22500}, {X: 22500, Y: 18500}}}}
	e.updateFog()
	own, _ := e.PlayerView(1)
	found := map[string]bool{}
	for _, w := range own.Warnings {
		found[w.Kind] = true
		if w.Kind == "second_volley" {
			weapon, _ := e.weapon(launcher)
			if w.Splash == nil || *w.Splash != weapon.Splash {
				t.Fatal("volley did not use current weapon")
			}
		} else if w.Splash != nil {
			t.Fatalf("nonblast acquired damage radius: %+v", w)
		}
	}
	for _, kind := range []string{"second_volley", "raid", "transfer"} {
		if !found[kind] {
			t.Fatalf("fixture omitted %s", kind)
		}
	}
	enemy, _ := e.PlayerView(2)
	for _, w := range enemy.Warnings {
		if w.Kind == "second_volley" || w.Kind == "transfer" || w.Kind == "raid" {
			t.Fatalf("hidden/owner-only warning leaked: %+v", w)
		}
	}
	exportTacticalView(t, "nonblast", []View{own, enemy})
}

func TestTacticalEmergencyDeadlineIsOwnerOnlyAndRestored(t *testing.T) {
	e := fixture(t)
	air := e.spawn("US.fighter", 1, Vec{X: 54000, Y: 54000}, true, 1)
	air.Landed = true
	air.Home = 999
	air.Endurance = 500
	e.loseService(air)
	e.updateFog()
	if air.EmergencyTakeoffUntil != 40 {
		t.Fatal("fixture missed actual service-loss timer")
	}
	own, _ := e.PlayerView(1)
	enemy, _ := e.PlayerView(2)
	for _, view := range []View{own, enemy} {
		found := false
		for _, v := range view.Entities {
			if v.ID != air.ID {
				continue
			}
			found = true
			if view.Player == 1 {
				if v.Private == nil || v.Private.EmergencyTakeoffUntil != 40 {
					t.Fatal("owner lacks actual deadline")
				}
			} else if v.Private != nil {
				t.Fatal("foreign aircraft exposes own-private fields")
			}
		}
		if !found {
			t.Fatal("test aircraft not naturally visible")
		}
	}
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Hash() != e.Hash() {
		t.Fatal("presentation changed restore hash")
	}
	view, _ := restored.PlayerView(1)
	for _, v := range view.Entities {
		if v.ID == air.ID && v.Private.EmergencyTakeoffUntil != 40 {
			t.Fatal("deadline reset at restore")
		}
	}
	exportTacticalView(t, "emergency", []View{own, enemy, view})
}

func exportTacticalView(t *testing.T, name string, views []View) {
	t.Helper()
	dir := os.Getenv("FRONTLINE_TACTICAL_VIEW_DIR")
	if dir == "" {
		return
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	raw, err := json.MarshalIndent(views, "", " ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(dir, name+".json"), raw, 0644); err != nil {
		t.Fatal(err)
	}
}

func TestTacticalVisibleEffectsAreSanitizedAndPerspectiveBounded(t *testing.T) {
	e := fixture(t)
	actor := e.spawn("IR.isr", 2, Vec{X: 13000, Y: 8000}, true, 1)
	actor.Buffs = []Buff{{Kind: "relay", Until: 200, Source: 999999}, {Kind: "relay", Until: 180, Source: 999998}, {Kind: "recall", Until: 160, Source: 999997}, {Kind: "exit_lock", Until: 240, Source: 999996}, {Kind: "future_private_effect", Until: 300, Source: 999995}, {Kind: "decoy", Until: 0, Source: 999994}}
	actor.PublicRevealUntil = 120
	e.updateFog()
	before := e.Hash()
	view, _ := e.PlayerView(1)
	var visible *EntityView
	for i := range view.Entities {
		if view.Entities[i].ID == actor.ID {
			visible = &view.Entities[i]
		}
	}
	if visible == nil || visible.Private != nil {
		t.Fatal("visible foreign status test actor absent or private")
	}
	if len(visible.Effects) != 3 || visible.Effects[0] != (StatusEffect{Kind: "recall", Until: 160}) || visible.Effects[1] != (StatusEffect{Kind: "relay", Until: 200}) || visible.Effects[2] != (StatusEffect{Kind: "launch_reveal", Until: 120}) {
		t.Fatalf("wrong deduplicated effects: %+v", visible.Effects)
	}
	encoded, err := json.Marshal(visible.Effects)
	if err != nil {
		t.Fatal(err)
	}
	var fields []map[string]any
	_ = json.Unmarshal(encoded, &fields)
	for _, field := range fields {
		if len(field) != 2 || field["kind"] == nil || field["until"] == nil {
			t.Fatal("source identity or unrelated data leaked")
		}
	}
	visible.Effects[0].Until = 99999
	if e.Hash() != before {
		t.Fatal("status view retained mutable engine data")
	}
	actor.Position = Vec{X: 54000, Y: 54000}
	actor.PublicRevealUntil = 0
	e.updateFog()
	hidden, _ := e.PlayerView(1)
	for _, v := range hidden.Entities {
		if v.ID == actor.ID {
			t.Fatal("status exposed a fogged actor")
		}
	}
	e.spawn("US.tank", 1, Vec{X: 16000, Y: 16000}, true, 1)
	hiddenSquad := e.spawn("SY.rifle", 2, Vec{X: 21000, Y: 16000}, true, 1)
	hiddenSquad.Concealed = true
	hiddenSquad.Buffs = []Buff{{Kind: "disperse", Until: 160, Source: 99999}}
	e.updateFog()
	if !e.canSee(1, hiddenSquad.Position) || e.canSeeEntity(1, hiddenSquad) {
		t.Fatal("fixture must provide sight without concealment detection")
	}
	concealed, _ := e.PlayerView(1)
	for _, v := range concealed.Entities {
		if v.ID == hiddenSquad.ID {
			t.Fatal("status exposed concealed actor")
		}
	}
	exportTacticalView(t, "effects-privacy", []View{view, hidden, concealed})
}

func TestTacticalVisibleEffectDeadlinesFollowState(t *testing.T) {
	e := fixture(t)
	building := e.spawn("factory", 1, Vec{X: 17000, Y: 18000}, true, 1)
	building.DisabledUntil = 100
	building.ResistanceUntil = 700
	building.Buffs = []Buff{{Kind: "emergency_power", Until: 400, Source: building.ID}}
	e.state.Tick = 99
	effects := e.visibleEffects(building)
	if len(effects) != 1 || effects[0] != (StatusEffect{Kind: "disabled", Until: 100}) {
		t.Fatalf("inactive power or recovery resistance advertised early: %+v", effects)
	}
	e.state.Tick = 100
	building.Buffs = nil
	effects = e.visibleEffects(building)
	if len(effects) != 1 || effects[0] != (StatusEffect{Kind: "sabotage_resistance", Until: 700}) {
		t.Fatalf("recovery timer lost: %+v", effects)
	}
	e.state.Tick = 700
	if len(e.visibleEffects(building)) != 0 {
		t.Fatal("expired resistance persisted")
	}
	tank := e.spawn("SA.tank", 1, Vec{X: 22000, Y: 18000}, true, 1)
	tank.Deployed = true
	tank.Buffs = []Buff{{Kind: "shieldline", Until: 702, Source: 9999}}
	effects = e.visibleEffects(tank)
	if len(effects) != 2 || effects[0] != (StatusEffect{Kind: "shieldline"}) || effects[1] != (StatusEffect{Kind: "hull_down"}) {
		t.Fatalf("renewed/deployed states gained fake countdown: %+v", effects)
	}
	e.state.Tick = 702
	tank.Deployed = false
	if len(e.visibleEffects(tank)) != 0 {
		t.Fatal("expired aura/deployment persisted")
	}
	e = fixture(t)
	building = e.spawn("factory", 1, Vec{X: 17000, Y: 18000}, true, 1)
	e.state.Tick = 100
	building.Buffs = []Buff{{Kind: "rapid_sortie", Until: 240, Source: building.ID}}
	e.updateFog()
	before, _ := e.PlayerView(1)
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	after, _ := restored.PlayerView(1)
	a, _ := json.Marshal(before)
	b, _ := json.Marshal(after)
	if string(a) != string(b) {
		t.Fatal("effect deadlines changed on restore")
	}
	exportTacticalView(t, "effects-deadlines", []View{before, after})
}
