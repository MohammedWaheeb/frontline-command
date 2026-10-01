package sim

import (
	"bytes"
	"encoding/json"
	"frontlinecommand/pkg/content"
	"slices"
	"testing"
)

func TestEditorPreviewUsesRealNavigationAndMapObjects(t *testing.T) {
	c, m := content.MustBase(), fixtureMap()
	m.Objects = []content.MapObject{{ID: 90, Class: "light_prop", Position: Vec{X: 20500, Y: 16500}}}
	from, to := Vec{X: 14500, Y: 16500}, Vec{X: 26500, Y: 16500}
	before, _ := json.Marshal(m)
	result, err := PreviewEditor(c, m, EditorPreviewRequest{Kind: "path", UnitType: "US.tank", From: &from, To: &to})
	if err != nil || result.Reachable == nil || !*result.Reachable || result.Code != "ok" {
		t.Fatal(result, err)
	}
	e, err := New(c, Config{Map: m, Seed: 1, Players: []PlayerConfig{{ID: 1, Faction: "US"}}})
	if err != nil {
		t.Fatal(err)
	}
	probe := e.spawn("US.tank", 1, from, true, 0)
	e.pathBudget = 1
	actual := append([]Vec{from}, e.findPath(probe, to, false)...)
	if !slices.Equal(result.Path, actual) {
		t.Fatal("preview diverged from normal route", result.Path, actual)
	}
	for _, point := range result.Path {
		if !e.clear(point, e.radius(probe), probe.ID, false, false) {
			t.Fatal("route enters solid object", point)
		}
	}
	after, _ := json.Marshal(m)
	if !bytes.Equal(before, after) {
		t.Fatal("preview mutated authored map")
	}
	for _, typ := range []string{"US.rifle", "SA.rig", "IR.strike"} {
		result, err = PreviewEditor(c, m, EditorPreviewRequest{Kind: "path", UnitType: typ, From: &from, To: &to})
		if err != nil || result.Reachable == nil || !*result.Reachable {
			t.Fatal(typ, result, err)
		}
	}
}
func TestEditorPreviewUsesGroundSightAircraftAndElevation(t *testing.T) {
	c, m := content.MustBase(), fixtureMap()
	source := Vec{X: 18500, Y: 20500}
	behind := int32(20*64 + 22)
	for y := 16; y <= 24; y++ {
		m.Tiles[y*64+20].SightBlocker = true
	}
	ground, err := PreviewEditor(c, m, EditorPreviewRequest{Kind: "sight", UnitType: "US.rifle", From: &source})
	if err != nil {
		t.Fatal(err)
	}
	air, err := PreviewEditor(c, m, EditorPreviewRequest{Kind: "sight", UnitType: "IR.strike", From: &source})
	if err != nil {
		t.Fatal(err)
	}
	if slices.Contains(ground.VisibleTiles, behind) || !slices.Contains(air.VisibleTiles, behind) || ground.Layer != "ground" || air.Layer != "air" {
		t.Fatal("ground obstruction or airborne sight disagrees with engine")
	}
	m = fixtureMap()
	source = Vec{X: 32500, Y: 32500}
	low, _ := PreviewEditor(c, m, EditorPreviewRequest{Kind: "sight", UnitType: "US.rifle", From: &source})
	m.Tiles[32*64+32].Height = 1
	high, _ := PreviewEditor(c, m, EditorPreviewRequest{Kind: "sight", UnitType: "US.rifle", From: &source})
	if len(high.VisibleTiles) <= len(low.VisibleTiles) {
		t.Fatal("high ground sight bonus missing")
	}
	if !slices.IsSorted(high.VisibleTiles) || len(high.VisibleTiles) > len(m.Tiles) {
		t.Fatal("visibility is not bounded and stable")
	}
}
func TestEditorPreviewBlockedUnreachableAndInvalidInputs(t *testing.T) {
	c, m := content.MustBase(), fixtureMap()
	from, to := Vec{X: 15500, Y: 20500}, Vec{X: 20500, Y: 20500}
	for y := 18; y <= 22; y++ {
		for x := 18; x <= 22; x++ {
			if x == 18 || x == 22 || y == 18 || y == 22 {
				m.Tiles[y*64+x].Terrain = "water"
			}
		}
	}
	result, err := PreviewEditor(c, m, EditorPreviewRequest{Kind: "path", UnitType: "US.rifle", From: &from, To: &to})
	if err != nil || result.Code != "unreachable" || result.Reachable == nil || *result.Reachable {
		t.Fatal(result, err)
	}
	blocked := Vec{X: 18500, Y: 20500}
	result, err = PreviewEditor(c, m, EditorPreviewRequest{Kind: "sight", UnitType: "US.rifle", From: &blocked})
	if err != nil || result.Code != "blocked_start" {
		t.Fatal(result, err)
	}
	outside := Vec{X: -1, Y: 0}
	for _, request := range []EditorPreviewRequest{
		{Kind: "invalid", UnitType: "US.rifle", From: &from},
		{Kind: "path", UnitType: "US.rifle", From: &from},
		{Kind: "sight", UnitType: "invalid", From: &from},
		{Kind: "sight", UnitType: "US.rifle", From: &outside},
		{Kind: "sight", UnitType: "US.rifle", From: &from, To: &to},
	} {
		if _, err := PreviewEditor(c, m, request); err == nil {
			t.Fatal("invalid preview accepted", request)
		}
	}
}
