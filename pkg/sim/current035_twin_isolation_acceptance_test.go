package sim_test

// Distinct ordinary canonical course. Its human policy reads only PlayerView1,
// public catalog/map/marker declarations and its own declared input. Owner2
// feedback below is an isolated recorder output, never a policy input.
import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
)

const twinIsolationPresentationSHA = "00d6ba3c68e93a2ee6da7f13e273ab9b6ae02aa210458b55757ac1f9b456a0c7"

type twinIsolationPresence struct {
	ID sim.ID `json:"id"`
	Type string `json:"type"`
	Position sim.Vec `json:"position"`
}
type twinIsolationFrame struct {
	Tick sim.Tick `json:"tick"`
	Progress uint32 `json:"progress"`
	Required uint32 `json:"required"`
	Complete bool `json:"complete"`
	Checkpoint string `json:"checkpoint"`
	HumanCentral []sim.ID `json:"human_central"`
	HumanContainedCentral []sim.ID `json:"human_contained_central"`
	AllyGround []twinIsolationPresence `json:"ally_ground"`
}
type twinIsolationOwnerFeedback struct {
	Frames []json.RawMessage `json:"frames"`
}

// This receiver has no connection to the human command recipe. Its sole input
// is owner2's authorized feedback, frozen as JSON at that tick for post-hoc
// receipt/unit_ready review. Canonical full Replay remains command authority.
func (record *twinIsolationOwnerFeedback) capture(t *testing.T, engine *sim.Engine) {
	t.Helper()
	feedback, ok := engine.PlayerFeedback(2)
	if !ok { t.Fatal("diagnostic owner feedback unavailable") }
	if len(feedback.Events) == 0 && len(feedback.Results) == 0 { return }
	data, err := json.Marshal(struct {
		Tick sim.Tick `json:"tick"`
		Owner sim.PlayerID `json:"owner"`
		Feedback sim.Feedback `json:"feedback"`
	}{engine.Tick(),2,feedback})
	if err != nil { t.Fatal(err) }
	record.Frames = append(record.Frames, append(json.RawMessage(nil), data...))
}

type twinIsolationRun struct {
	r *current035Run
	central sim.MissionTaskView
	base sim.Vec
	deadline sim.Tick
	lastObserved sim.Tick
	allyConsecutive uint32
	earned sim.Tick
	qualifying []sim.ID
	frames []twinIsolationFrame
	posthoc twinIsolationOwnerFeedback
	inputSHA string
	nextDefense sim.Tick
	stage uint32
}

func twinIsolationInside(task sim.MissionTaskView, point sim.Vec) bool {
	return point.X >= task.Min.X && point.X <= task.Max.X && point.Y >= task.Min.Y && point.Y <= task.Max.Y
}

func newTwinIsolationRun(t *testing.T, course current035Course, input current035Case, inputSHA string) *twinIsolationRun {
	t.Helper()
	if input.MissionID != "twin-outposts" || input.Difficulty != "normal" || input.AllyAI != "normal" || input.ReconnectLimit != 7000 || input.AssaultLimit != 35000 || input.OptionalGoal != "original-hqs" || len(input.RequiredGoals) != 2 || input.RequiredGoals[0] != "reconnection" || input.RequiredGoals[1] != "joint-assault" {
		t.Fatal("strict original Normal/Normal Twin goals and absolute budgets required")
	}
	if course.Seed != 19027 { t.Fatal("retained original course seed required") }
	presentationBytes := current035Pinned(t, course.SourceRoot, "content/presentation/twin-outposts.json", twinIsolationPresentationSHA)
	var presentation struct {
		MissionID string `json:"mission_id"`
		MissionVersion string `json:"mission_version"`
		Markers []struct { ID, Objective, Region string } `json:"markers"`
	}
	if err := json.Unmarshal(presentationBytes, &presentation); err != nil { t.Fatal(err) }
	if presentation.MissionID != input.MissionID || presentation.MissionVersion != "1" { t.Fatal("published presentation identity changed") }
	r := newCurrent035Run(t, course, input)
	d := &twinIsolationRun{r:r, deadline:100+input.ReconnectLimit, inputSHA:inputSHA, nextDefense:r.engine.Tick()}
	t.Cleanup(func() { d.writeEvidence("closed") })
	view := r.view()
	for _, task := range view.Mission.PublicTasks {
		if task.ID == "central-reconnection-hold" && task.Objective == "reconnection" && task.Kind == "hold_region" && task.Team == 1 { d.central = task }
	}
	if d.central.ID == "" { t.Fatal("actual human view lacks the explicit public hold task") }
	bound := false
	for _, marker := range presentation.Markers {
		if marker.ID == d.central.Marker && marker.Objective == d.central.Objective && marker.Region == d.central.Region { bound = true }
	}
	if !bound { t.Fatal("task is not bound to the actually presented objective marker") }
	region := false
	for _, candidate := range r.gameMap.Regions {
		if candidate.ID == d.central.Region && d.central.Min == (sim.Vec{X:candidate.Min.X,Y:candidate.Min.Y}) && d.central.Max == (sim.Vec{X:candidate.Max.X,Y:candidate.Max.Y}) { region = true }
	}
	if !region { t.Fatal("task geometry differs from the presented public map region") }
	hq := false
	for _, actor := range view.Entities {
		if actor.Owner == 1 && actor.Type == "hq" && actor.Complete && actor.Private != nil && actor.Private.HP > 0 { d.base, hq = actor.Position, true; break }
	}
	if !hq || twinIsolationInside(d.central, d.base) { t.Fatal("ordinary public human starting HQ unavailable outside central region") }
	if r.engine.Tick() != 100 || view.Countdown != 0 { t.Fatal("ordinary countdown/startup changed") }
	d.observe()
	d.noAllyControlPreview()
	r.writeEvidence("isolation-initial")
	d.writeEvidence("initial")
	return d
}

func (d *twinIsolationRun) observe() {
	d.r.t.Helper()
	view := d.r.view()
	if view.Tick == d.lastObserved { return }
	if d.lastObserved != 0 && view.Tick != d.lastObserved+1 { d.r.t.Fatal("per-tick public observation gap", d.lastObserved, view.Tick) }
	d.lastObserved = view.Tick
	frame := twinIsolationFrame{Tick:view.Tick,Checkpoint:view.Mission.Checkpoint}
	goal := false
	for _, objective := range view.Mission.Objectives {
		if objective.ID == "reconnection" { frame.Progress, frame.Required, frame.Complete, goal = objective.Progress, objective.Required, objective.Complete, true }
	}
	if !goal || frame.Required != 600 { d.r.t.Fatal("original public thirty-second hold changed") }
	allyActive := false
	for _, player := range view.Players { if player.ID == 2 && !player.Defeated && player.Team == 1 { allyActive = true } }
	for _, actor := range view.Entities {
		if !twinIsolationInside(d.central, actor.Position) { continue }
		if actor.Owner == 1 && actor.Private != nil && actor.Private.HP > 0 {
			if actor.Private.Container != 0 { frame.HumanContainedCentral = append(frame.HumanContainedCentral, actor.ID) } else { frame.HumanCentral = append(frame.HumanCentral, actor.ID) }
		}
		// Allied contained/dead entities are already filtered from current
		// PlayerView. Quantized Health0 alone must not be treated as death.
		if actor.Owner == 2 && allyActive && actor.Complete && actor.Enabled {
			if unit, ok := d.r.catalog.Unit(actor.Type); ok && unit.Armor != "air" { frame.AllyGround = append(frame.AllyGround, twinIsolationPresence{actor.ID,actor.Type,actor.Position}) }
		}
	}
	d.frames = append(d.frames, frame)
	d.posthoc.capture(d.r.t, d.r.engine)
	if len(frame.HumanCentral) != 0 || len(frame.HumanContainedCentral) != 0 { d.r.t.Fatal("human central-absence gate contaminated", frame) }
	if len(frame.AllyGround) == 0 { d.allyConsecutive = 0 } else { d.allyConsecutive++ }
}

func (d *twinIsolationRun) issue(orders ...sim.Order) {
	d.r.t.Helper()
	if d.r.engine.Tick() >= d.deadline { d.r.t.Fatal("human policy attempted to extend absolute budget") }
	d.r.issue(orders...)
	d.observe()
}

func (d *twinIsolationRun) advance() {
	d.r.t.Helper()
	if d.r.engine.Tick() >= d.deadline || d.r.engine.Outcome().Finished { return }
	d.r.advance(1)
	d.observe()
}

func (d *twinIsolationRun) noAllyControlPreview() {
	d.r.t.Helper()
	for _, actor := range d.r.view().Entities {
		if actor.Owner != 2 { continue }
		before := d.r.engine.Hash()
		preview, err := d.r.engine.PreviewOrders(1, []sim.Order{{Kind:"move",Entities:[]sim.ID{actor.ID},Position:actor.Position}})
		if err == nil || err.Error() != "not_owner" || len(preview) != 0 || d.r.engine.Hash() != before { d.r.t.Fatal("public task granted human ally control", preview, err) }
		return
	}
	d.r.t.Fatal("ownership negative preview lacked a currently public ally actor")
}

func (d *twinIsolationRun) powerSurvivalControl() {
	powers := d.r.owned("power")
	if len(powers) == 0 { d.r.t.Fatal("ordinary owned power control unavailable") }
	orders := []sim.Order{}
	for _, id := range powers { orders = append(orders, sim.Order{Kind:"power",Entities:[]sim.ID{id},Index:0}) }
	d.issue(orders...)
	for _, goal := range d.r.view().Mission.Objectives { if goal.Failure && goal.Complete { d.r.t.Fatal("disabled active-owner power falsely counted as HQ loss", goal) } }
	for i := range orders { orders[i].Index = 1 }
	d.issue(orders...)
}

// All geometry here is authored public terrain or currently observed retained
// footprints. No hidden occupancy query, engine state copy or pathfinding call.
func (d *twinIsolationRun) clearBasePoint(view sim.View, point sim.Vec, radius int32) bool {
	if twinIsolationInside(d.central, point) || current035Dist(point, d.base) > 16000*16000 { return false }
	for y := (point.Y-radius)/1000; y <= (point.Y+radius)/1000; y++ {
		for x := (point.X-radius)/1000; x <= (point.X+radius)/1000; x++ { if !d.r.gameMap.TileAt(content.Point{X:x*1000+500,Y:y*1000+500}).Passable() { return false } }
	}
	for _, actor := range view.Entities {
		if actor.FootprintWidth > 0 && actor.FootprintHeight > 0 && point.X+radius > actor.Position.X-actor.FootprintWidth*500 && point.X-radius < actor.Position.X+actor.FootprintWidth*500 && point.Y+radius > actor.Position.Y-actor.FootprintHeight*500 && point.Y-radius < actor.Position.Y+actor.FootprintHeight*500 { return false }
	}
	return true
}

func (d *twinIsolationRun) basePoint(view sim.View, actor sim.EntityView, radius int32) sim.Vec {
	offsets := []sim.Vec{{X:6000},{Y:6000},{X:-6000},{Y:-6000},{X:6000,Y:6000},{X:-6000,Y:6000},{X:6000,Y:-6000},{X:-6000,Y:-6000}}
	for n := range offsets {
		offset := offsets[(int(actor.ID)%len(offsets)+n)%len(offsets)]
		point := sim.Vec{X:d.base.X+offset.X,Y:d.base.Y+offset.Y}
		if d.clearBasePoint(view, point, radius) { return point }
	}
	// A legitimate current owned position is a conservative base-defense
	// fallback. The per-tick central gate still rejects any contamination.
	return actor.Position
}

// Ordinary human base defense, harvesting and paid production. Never sweeps a
// hostile base, moves through central, commands an ally, or reads posthoc data.
func (d *twinIsolationRun) defend() {
	if d.r.engine.Outcome().Finished || d.r.engine.Tick() >= d.deadline || d.r.engine.Tick() < d.nextDefense { return }
	d.nextDefense = d.r.engine.Tick()+40
	view := d.r.view()
	orders := []sim.Order{}
	budget := view.Economy.Credits-300000
	faction := ""
	for _, player := range view.Players { if player.ID == 1 { faction = player.Faction } }
	for _, actor := range view.Entities {
		if actor.Owner != 1 || !actor.Complete || !actor.Enabled || actor.Private == nil || actor.Private.HP <= 0 || actor.Private.Container != 0 { continue }
		if unit, ok := d.r.catalog.Unit(actor.Type); ok {
			if unit.Role == "hauler" {
				field, score := uint32(0), int64(1<<62)
				for _, candidate := range view.Fields { if candidate.Remaining > 0 && !twinIsolationInside(d.central,candidate.Position) && current035Dist(candidate.Position,d.base) <= 18000*18000 { if distance := current035Dist(actor.Position,candidate.Position); distance < score { field, score = candidate.ID, distance } } }
				if field != 0 && actor.Private.PinnedField != field { orders = append(orders, sim.Order{Kind:"gather",Entities:[]sim.ID{actor.ID},Target:sim.ID(field)}) }
				if field == 0 && len(actor.Private.Orders) > 0 && actor.Private.Orders[0].Kind == "gather" { orders = append(orders, sim.Order{Kind:"stop",Entities:[]sim.ID{actor.ID}}) }
			} else if len(actor.Private.Orders) == 0 && (unit.Weapon != "" || unit.Role == "recon" || unit.Role == "repair" || unit.Role == "medic") && unit.Armor != "air" {
				orders = append(orders, sim.Order{Kind:"guard",Entities:[]sim.ID{actor.ID},Position:d.basePoint(view,actor,unit.Radius)})
			}
			continue
		}
		building, ok := d.r.catalog.Building(actor.Type)
		if !ok || building.Role != "barracks" && building.Role != "factory" { continue }
		point := d.basePoint(view, actor, 1200)
		if actor.Private.Rally != point { orders = append(orders, sim.Order{Kind:"rally",Entities:[]sim.ID{actor.ID},Position:point}) }
		if len(actor.Private.Jobs) != 0 || view.Economy.Supply+view.Economy.ReservedSupply >= 55 { continue }
		role := "rifle"
		if building.Role == "factory" { role = "tank"; if d.stage%4 == 3 { role = "repair" } } else if d.stage%3 == 2 { role = "at" }
		unit, exists := d.r.catalog.Unit(faction+"."+role)
		if !exists || unit.Tier > view.Economy.Tier || budget < unit.Cost { continue }
		order := sim.Order{Kind:"train",Entities:[]sim.ID{actor.ID},Type:unit.ID}
		preview, err := d.r.engine.PreviewOrders(1, []sim.Order{order})
		if err == nil && len(preview) == 1 && preview[0].Accepted { orders = append(orders, order); budget -= unit.Cost; d.stage++ }
	}
	if len(orders) > 32 { d.r.t.Fatal("human recipe exceeds one ordinary bounded command batch") }
	if len(orders) > 0 { d.issue(orders...) }
}

func (d *twinIsolationRun) qualifyHold() {
	d.r.t.Helper()
	view := d.r.view()
	if !d.r.complete("reconnection") || d.r.engine.Tick() > 100+d.r.input.ReconnectLimit || d.allyConsecutive < 600 || view.Mission.Checkpoint != "river-reconnected" { d.r.t.Fatal("native ally-only hold/checkpoint not earned within original bound", d.r.engine.Tick(),d.allyConsecutive,view.Mission) }
	seen := map[sim.ID]bool{}
	for _, frame := range d.frames[len(d.frames)-600:] {
		if len(frame.HumanCentral) != 0 || len(frame.HumanContainedCentral) != 0 || len(frame.AllyGround) == 0 { d.r.t.Fatal("six-hundred-tick public qualification interval incomplete",frame) }
		for _, actor := range frame.AllyGround { if !seen[actor.ID] { seen[actor.ID] = true; d.qualifying = append(d.qualifying, actor.ID) } }
	}
	sort.Slice(d.qualifying,func(i,j int) bool { return d.qualifying[i] < d.qualifying[j] })
	d.earned = d.r.engine.Tick()
	d.r.checkpoint()
	d.r.writeEvidence("isolated-hold-earned")
	d.writeEvidence("earned-hold")
}

func (d *twinIsolationRun) play() {
	d.powerSurvivalControl()
	for !d.r.complete("reconnection") && !d.r.engine.Outcome().Finished && d.r.engine.Tick() < d.deadline { d.defend(); d.advance() }
	d.qualifyHold()
	d.deadline = 100+d.r.input.AssaultLimit
	for !d.r.engine.Outcome().Finished && d.r.engine.Tick() < d.deadline { d.defend(); d.advance() }
	if !d.r.engine.Outcome().Finished || d.r.engine.Tick() > d.deadline { d.r.t.Fatal("natural full Twin completion missed original absolute bound",d.r.engine.Outcome()) }
	if len(d.frames) != int(d.r.engine.Tick()-100+1) { d.r.t.Fatal("active per-tick human exclusion evidence incomplete") }
	d.r.finish() // inherited native full/twin/Save/Replay/restart/surrender proofs
	d.writeEvidence("verified")
}

func twinIsolationWrite(t *testing.T, path string, value any) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path),0755); err != nil { t.Error(err); return }
	data, err := json.MarshalIndent(value,"","  ")
	if err != nil { t.Error(err); return }
	if err = os.WriteFile(path,append(data,'\n'),0644); err != nil { t.Error(err) }
}

func (d *twinIsolationRun) writeEvidence(label string) {
	directory := os.Getenv("FRONTLINE_CURRENT_COOP_PRACTICE_EVIDENCE")
	if directory == "" || d.r.engine == nil { return }
	twinIsolationWrite(d.r.t,filepath.Join(directory,"twin-isolation-v1."+label+".public-witness.json"),struct {
		Status string `json:"status"`
		SourceRoot string `json:"source_root"`
		InputSHA string `json:"input_sha256"`
		Metadata sim.Metadata `json:"metadata"`
		Task sim.MissionTaskView `json:"team_public_task"`
		HumanPolicy string `json:"human_policy"`
		DeadlineReconnect sim.Tick `json:"absolute_reconnect_deadline"`
		DeadlineComplete sim.Tick `json:"absolute_terminal_deadline"`
		Earned sim.Tick `json:"earned_hold_at"`
		Qualifying []sim.ID `json:"qualifying_public_owner2_ids"`
		PaidProof string `json:"paid_provenance_boundary"`
		Frames []twinIsolationFrame `json:"active_tick_public_frames"`
	}{label,d.r.course.SourceRoot,d.inputSHA,d.r.engine.Metadata(),d.central,"PlayerView1/catalog/public terrain only; own base defense, paid own production; no central occupancy or other-owner orders",7100,35100,d.earned,d.qualifying,"new public IDs alone do not establish Paid; root joins earned opaque checkpoint/unit_ready owner receipts/canonical Replay after the run",d.frames})
	twinIsolationWrite(d.r.t,filepath.Join(directory,"post-hoc-owner2","twin-isolation-v1."+label+".feedback.json"),struct {
		Purpose string `json:"purpose"`
		InputSHA string `json:"input_sha256"`
		SourceRoot string `json:"source_root"`
		Metadata sim.Metadata `json:"metadata"`
		DecisionConsumption bool `json:"feeds_any_decision"`
		Authority string `json:"command_authority"`
		Record twinIsolationOwnerFeedback `json:"owner2_diagnostic"`
	}{"post-hoc actual owner2 authorized Events/Results, including accepted/rejected receipts and owned unit_ready when present",d.inputSHA,d.r.course.SourceRoot,d.r.engine.Metadata(),false,"canonical full Replay; feedback records do not invent an order payload",d.posthoc})
}

func TestCurrent035TwinIsolatedAIHold(t *testing.T) {
	if testing.Short() { t.Skip("separate ordinary canonical Twin ally-only hold/full persistence course") }
	directory := os.Getenv("FRONTLINE_CURRENT_COOP_PRACTICE_EVIDENCE")
	if !filepath.IsAbs(directory) { t.Fatal("explicit new absolute evidence namespace required") }
	path := os.Getenv("FRONTLINE_TWIN_ISOLATION_CONFIG")
	data, err := os.ReadFile(path)
	if err != nil { t.Fatal(err) }
	course := current035Inputs(t,"FRONTLINE_TWIN_ISOLATION_CONFIG","scenario-v2")
	if len(course.Cases) != 1 { t.Fatal("one distinct canonical Normal/Normal Twin case required") }
	inputSHA := fmt.Sprintf("%x",sha256.Sum256(data))
	newTwinIsolationRun(t,course,course.Cases[0],inputSHA).play()
}
