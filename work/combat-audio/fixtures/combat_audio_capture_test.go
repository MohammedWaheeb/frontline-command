package sim

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// These are controlled mechanics fixtures, not authored mission playthroughs.
// Mutations establish exceptional source/visibility states; normal Go projectile,
// damage, fog and public-view paths produce every captured event and private count.
type audioCapture struct {
	Previous View `json:"previous"`
	Current  View `json:"current"`
}

func audioView(t *testing.T, e *Engine) View {
	t.Helper()
	e.updateFog()
	v, ok := e.PlayerView(1)
	if !ok {
		t.Fatal("view")
	}
	return v
}
func audioExport(t *testing.T, name string, before View, e *Engine) {
	t.Helper()
	out := os.Getenv("FRONTLINE_AUDIO_OUTPUT")
	if out == "" {
		t.Fatal("output required")
	}
	if err := os.MkdirAll(out, 0755); err != nil {
		t.Fatal(err)
	}
	raw, err := json.MarshalIndent(audioCapture{before, audioView(t, e)}, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(out, name+".json"), raw, 0644); err != nil {
		t.Fatal(err)
	}
	audioSave(t, name+".end", e)
}

func audioSave(t *testing.T, name string, e *Engine) {
	t.Helper()
	raw, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, raw)
	if err != nil {
		t.Logf("%s: controlled fixture state is not a restorable game save: %v", name, err)
		return
	}
	if restored.Hash() != e.Hash() {
		t.Fatal("save changed hash", name)
	}
	dir := filepath.Join(os.Getenv("FRONTLINE_AUDIO_OUTPUT"), "saves")
	if err = os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(dir, name+".save.json"), raw, 0644); err != nil {
		t.Fatal(err)
	}
}

func TestCombatAudioCapture(t *testing.T) {
	for _, mode := range []string{"converted", "dead", "removed"} {
		t.Run("source-"+mode, func(t *testing.T) {
			e, s, target := feedbackFixture(t, false)
			// A living observer supplies real sight after the firing source is lost.
			e.spawn("US.rifle", 1, Vec{18000, 15000}, true, 300000).Stance = "hold"
			before := audioView(t, e)
			w, _ := e.weapon(s)
			e.launch(s, target, target.Position, w, w.Damage)
			switch mode {
			case "converted":
				s.Type = "US.tank"
			case "dead":
				s.HP = 0
			case "removed":
				for i, v := range e.state.Entities {
					if v.ID == s.ID {
						e.state.Entities = append(e.state.Entities[:i], e.state.Entities[i+1:]...)
						break
					}
				}
			}
			audioSave(t, "source-"+mode+".start", e)
			e.state.Tick = 100
			e.updateProjectiles()
			e.resolveDamage()
			v := audioView(t, e)
			for _, kind := range []string{"weapon_fired", "impact"} {
				event := feedbackEvent(t, v.Events, kind)
				if event.Combat == nil || event.Combat.Weapon != "RIF" {
					t.Fatal("actual emitted rifle lost", event)
				}
			}
			audioExport(t, "source-"+mode, before, e)
		})
	}
	for _, mode := range []string{"visible", "concealed", "fog", "embarked", "dead", "removed"} {
		t.Run("privacy-"+mode, func(t *testing.T) {
			e, s, target := feedbackFixture(t, true)
			before := audioView(t, e)
			resolveFeedbackShot(e, s, target)
			switch mode {
			case "concealed":
				target.Concealed = true
				target.RevealedUntil = 0
				target.PublicRevealUntil = 0
			case "fog":
				target.Position = Vec{48000, 48000}
			case "embarked":
				target.Container = 999
			case "dead":
				target.HP = 0
			case "removed":
				e.state.Entities = e.state.Entities[:len(e.state.Entities)-1]
			}
			event := feedbackEvent(t, audioView(t, e).Events, "impact")
			if mode == "visible" {
				if event.Combat.Outcome != "hit" || !event.Combat.CoverMitigated {
					t.Fatal("covered hit missing")
				}
			} else if event.Entity != 0 || event.Combat.Outcome != "" {
				t.Fatal("redaction missing")
			}
			audioExport(t, "privacy-"+mode, before, e)
		})
	}
	t.Run("landed", func(t *testing.T) {
		e, s, target := feedbackFixture(t, false)
		target.Type = "IR.fighter"
		target.Landed = true
		before := audioView(t, e)
		audioSave(t, "landed.start", e)
		resolveFeedbackShot(e, s, target)
		event := feedbackEvent(t, audioView(t, e).Events, "impact")
		if event.Combat == nil || event.Combat.Outcome != "hit" || event.Combat.TargetArmor != "light" {
			t.Fatal("actual landed armor", event)
		}
		audioExport(t, "landed", before, e)
	})
	t.Run("decoy", func(t *testing.T) {
		e, s, target := feedbackFixture(t, false)
		target.Type = "IR.fighter"
		target.Buffs = append(target.Buffs, Buff{Kind: "decoy", Until: 200, Source: target.ID})
		before := audioView(t, e)
		w, _ := e.catalog.Weapon("AA")
		e.launch(s, target, target.Position, w, w.Damage)
		audioSave(t, "decoy.start", e)
		e.state.Tick = 100
		e.updateProjectiles()
		e.resolveDamage()
		v := audioView(t, e)
		feedbackEvent(t, v.Events, "decoy_triggered")
		if feedbackEvent(t, v.Events, "impact").Combat.Outcome != "" {
			t.Fatal("decoy reported hit")
		}
		audioExport(t, "decoy", before, e)
	})
	for _, kind := range []string{"abm", "SA.mobile_abm"} {
		t.Run(kind, func(t *testing.T) {
			e := fixture(t)
			battery := e.spawn(kind, 1, Vec{12000, 16000}, true, 1800000)
			battery.Charges = 1
			battery.Deployed = true
			e.recalculate()
			before := audioView(t, e)
			e.state.Projectiles = append(e.state.Projectiles, &Projectile{ID: e.newID(), Owner: 2, Weapon: "IR_MISSILE", Position: Vec{14000, 14000}, Impact: Vec{8000, 8000}, ImpactAt: 40, Damage: 350000, Splash: 2000, Interceptable: true})
			audioSave(t, kind+".start", e)
			e.updateProjectiles()
			e.state.Tick = 10
			e.updateProjectiles()
			e.resolveDamage()
			v := audioView(t, e)
			event := feedbackEvent(t, v.Events, "missile_intercepted")
			if event.Owner != 2 || event.Entity != 0 || battery.Charges != 0 {
				t.Fatal("interception contract", event, battery.Charges)
			}
			audioExport(t, kind, before, e)
		})
	}
	t.Run("ordinary", func(t *testing.T) {
		e, s, target := feedbackFixture(t, true)
		before := audioView(t, e)
		audioSave(t, "ordinary.start", e)
		issue(t, e, 1, Order{Kind: "attack", Entities: []ID{s.ID}, Target: target.ID})
		for i := 0; i < 300; i++ {
			for _, event := range e.state.Events {
				if event.Kind == "impact" && event.Combat != nil && event.Combat.CoverMitigated {
					audioExport(t, "ordinary", before, e)
					return
				}
			}
			e.Advance()
		}
		t.Fatal("ordinary covered hit missing")
	})
}
