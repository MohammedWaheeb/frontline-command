package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

func TestMissionRegionTypeValidation(t *testing.T) {
	m := fixtureMap()
	m.Regions = []content.Region{{ID: "site", Min: Vec{X: 17000, Y: 7000}, Max: Vec{X: 24000, Y: 14000}}}
	for _, kind := range []string{"region_entered", "region_held"} {
		for _, typ := range []string{"", "US.recon", "supply", "missing", "map.garrison"} {
			d := longMission()
			d.Objectives[0].Condition = content.MissionCondition{Kind: kind, Owner: 1, Region: "site", Type: typ}
			err := d.Validate(content.MustBase(), m)
			valid := typ != "missing"
			if (err == nil) != valid {
				t.Fatalf("%s/%s validation: %v", kind, typ, err)
			}
		}
	}
}

func TestMissionRegionReplacementAndContestation(t *testing.T) {
	m := fixtureMap()
	m.Regions = []content.Region{{ID: "site", Min: Vec{X: 17000, Y: 7000}, Max: Vec{X: 24000, Y: 14000}}}
	e := extendedMission(t, longMission(), m)
	q := content.MissionCondition{Kind: "region_held", Owner: 1, Region: "site", Type: "US.recon"}
	p := newConditionProgress(q)
	check := func(want bool) {
		t.Helper()
		if got, _ := e.missionCondition(q, &p); got != want {
			t.Fatalf("region condition got%v want%v", got, want)
		}
	}
	check(false) // The original rifle squad cannot substitute for a scout.
	v := e.spawn("US.recon", 1, Vec{X: 21000, Y: 9000}, true, 0)
	check(true) // A replacement has no original mission tag.
	v.Container = tagged(e, "escort").ID
	check(false)
	v.Container = 0
	v.HP = 0
	check(false)
	v.HP = v.MaxHP
	e.player(1).Defeated = true
	check(false)
	e.player(1).Defeated = false
	enemy := e.spawn("IR.rifle", 2, Vec{X: 23000, Y: 12000}, true, 0)
	check(false) // All enemy types contest, including non-scouts.
	q.Kind = "region_entered"
	check(true)
	q.Kind = "region_held"
	e.player(2).Defeated = true
	check(true)
	e.player(2).Defeated = false
	enemy.Owner = 0
	check(true)
}

func TestMissionRegionReplacementContinuousHoldRestore(t *testing.T) {
	m := fixtureMap()
	m.Regions = []content.Region{{ID: "site", Min: Vec{X: 17000, Y: 7000}, Max: Vec{X: 24000, Y: 14000}}}
	d := longMission()
	d.Objectives[0].Condition = content.MissionCondition{Kind: "region_held", Owner: 1, Region: "site", Type: "US.recon", HoldTicks: 12}
	e := extendedMission(t, d, m)
	e.spawn("US.recon", 1, Vec{X: 21000, Y: 9000}, true, 0)
	ticks(e, 5)
	enemy := e.spawn("IR.hauler", 2, Vec{X: 23000, Y: 12000}, true, 0)
	e.Advance()
	if e.state.Mission.Objectives[0].Condition.Holding {
		t.Fatal("nonmatching enemy did not interrupt continuous hold")
	}
	enemy.Position = Vec{X: 40000, Y: 40000}
	ticks(e, 5)
	data, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, data)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 8)
	ticks(restored, 8)
	if e.Hash() != restored.Hash() || e.Outcome().Reason != "mission_complete" || e.Outcome().Tick != 19 {
		t.Fatalf("region hold restore failed: %+v %+v", e.Outcome(), restored.Outcome())
	}
}
