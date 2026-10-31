// Package botsweep plays authored campaign missions headlessly with
// randomized bot commanders. Bots are fog-honest: they decide only from
// sim.PlayerView(1), the shared catalog and the map's named regions, and
// they act only through Engine.Submit, exactly like a human client.
// StateCopy is used by the runner for end-of-run evidence counts only,
// never for bot decisions.
package botsweep

import (
	"math/rand"
	"sort"
	"strings"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
)

// Bot issues public orders for the human mission player (ID 1).
type Bot interface {
	Name() string
	Orders(view sim.View) []sim.Order
}

// Factory builds one fresh bot per run so runs stay independent.
type Factory func(cfg BotConfig) Bot

type BotConfig struct {
	Seed    uint64
	Catalog *content.Catalog
	Map     content.Map
	Faction string
}

// Names lists every registered bot personality, sorted.
func Names() []string {
	out := make([]string, 0, len(factories))
	for name := range factories {
		out = append(out, name)
	}
	sort.Strings(out)
	return out
}

var factories = map[string]Factory{
	"idle":      func(BotConfig) Bot { return idleBot{} },
	"random":    func(c BotConfig) Bot { return &randomBot{base: newBase(c)} },
	"rusher":    func(c BotConfig) Bot { return &rusherBot{base: newBase(c)} },
	"turtle":    func(c BotConfig) Bot { return &turtleBot{base: newBase(c)} },
	"objective": func(c BotConfig) Bot { return &objectiveBot{base: newBase(c)} },
}

// New builds the named bot. Unknown names return nil.
func New(name string, cfg BotConfig) Bot {
	f, ok := factories[name]
	if !ok {
		return nil
	}
	return f(cfg)
}

type base struct {
	rng     *rand.Rand
	catalog *content.Catalog
	gameMap content.Map
	faction string
	// regions are the map's named objective areas, in stable order.
	regions []sim.Vec
}

func newBase(c BotConfig) base {
	b := base{
		rng:     rand.New(rand.NewSource(int64(c.Seed*2654435761 + 97))),
		catalog: c.Catalog,
		gameMap: c.Map,
		faction: c.Faction,
	}
	regs := append([]content.Region(nil), c.Map.Regions...)
	sort.Slice(regs, func(i, j int) bool { return regs[i].ID < regs[j].ID })
	// Visit staging regions before exits: stable sort keeps site* first,
	// then everything else, then exit-like regions last.
	sort.SliceStable(regs, func(i, j int) bool {
		return regionRank(regs[i].ID) < regionRank(regs[j].ID)
	})
	for _, r := range regs {
		b.regions = append(b.regions, sim.Vec{X: (r.Min.X + r.Max.X) / 2, Y: (r.Min.Y + r.Max.Y) / 2})
	}
	return b
}

func regionRank(id string) int {
	switch {
	case strings.HasPrefix(id, "site"), strings.HasPrefix(id, "recovery"):
		return 0
	case strings.Contains(id, "exit"), strings.Contains(id, "extraction"):
		return 2
	default:
		return 1
	}
}

// forces partitions the player's visible entities by battlefield job.
type forces struct {
	army      []sim.EntityView // armed mobile units
	haulers   []sim.EntityView
	rigs      []sim.EntityView
	engineers []sim.EntityView
	producers []sim.EntityView // complete owned buildings
	hq        *sim.EntityView
}

func (b *base) forces(view sim.View) forces {
	var f forces
	for i := range view.Entities {
		e := view.Entities[i]
		if e.Owner != 1 {
			continue
		}
		unit, isUnit := b.catalog.Unit(e.Type)
		if !isUnit {
			if e.Complete {
				f.producers = append(f.producers, e)
			}
			if e.Type == "hq" {
				hq := e
				f.hq = &hq
			}
			continue
		}
		switch unit.Role {
		case "hauler":
			f.haulers = append(f.haulers, e)
		case "rig":
			f.rigs = append(f.rigs, e)
		case "engineer":
			f.engineers = append(f.engineers, e)
		default:
			if unit.Weapon != "" {
				f.army = append(f.army, e)
			}
		}
	}
	return f
}

func idsOf(entities []sim.EntityView) []sim.ID {
	out := make([]sim.ID, 0, len(entities))
	for _, e := range entities {
		out = append(out, e.ID)
	}
	return out
}

func idle(e sim.EntityView) bool {
	return e.Private == nil || len(e.Private.Orders) == 0
}

func dist2(a, b sim.Vec) int64 {
	dx, dy := int64(a.X-b.X), int64(a.Y-b.Y)
	return dx*dx + dy*dy
}

func (b *base) mapPoint(x, y int32) sim.Vec {
	maxX, maxY := b.gameMap.Width*1000-1, b.gameMap.Height*1000-1
	if x < 0 {
		x = 0
	}
	if y < 0 {
		y = 0
	}
	if x > maxX {
		x = maxX
	}
	if y > maxY {
		y = maxY
	}
	return sim.Vec{X: x, Y: y}
}

func (b *base) randomPoint() sim.Vec {
	return b.mapPoint(int32(b.rng.Int63n(int64(b.gameMap.Width)*1000)),
		int32(b.rng.Int63n(int64(b.gameMap.Height)*1000)))
}

// nearestField returns the visible resource field closest to from.
func nearestField(view sim.View, from sim.Vec) (uint32, bool) {
	best, found := int64(0), false
	var id uint32
	for _, f := range view.Fields {
		if f.Remaining <= 0 {
			continue
		}
		d := dist2(f.Position, from)
		if !found || d < best {
			best, id, found = d, f.ID, true
		}
	}
	return id, found
}

// gatherOrder sends idle haulers to the nearest visible field, if any.
func (b *base) gatherOrder(view sim.View, f forces) []sim.Order {
	var idleHaulers []sim.ID
	for _, h := range f.haulers {
		if idle(h) {
			idleHaulers = append(idleHaulers, h.ID)
		}
	}
	if len(idleHaulers) == 0 {
		return nil
	}
	from := sim.Vec{X: b.gameMap.Width * 500, Y: b.gameMap.Height * 500}
	if f.hq != nil {
		from = f.hq.Position
	}
	field, ok := nearestField(view, from)
	if !ok {
		return nil
	}
	return []sim.Order{{Kind: "gather", Entities: idleHaulers, Target: sim.ID(field)}}
}

// producerFor finds a complete owned building that can train unitType.
func (b *base) producerFor(f forces, unitType string) (sim.EntityView, bool) {
	unit, ok := b.catalog.Unit(unitType)
	if !ok {
		return sim.EntityView{}, false
	}
	for _, p := range f.producers {
		if p.Type == unit.Producer || strings.HasSuffix(p.Type, "."+unit.Producer) {
			return p, true
		}
	}
	return sim.EntityView{}, false
}

// trainOrder queues one unit if a producer exists, is idle and affordable.
func (b *base) trainOrder(view sim.View, f forces, unitType string, reserve int64) []sim.Order {
	unit, ok := b.catalog.Unit(unitType)
	if !ok || view.Economy.Credits < unit.Cost+reserve {
		return nil
	}
	p, ok := b.producerFor(f, unitType)
	if !ok || p.Private != nil && len(p.Private.Jobs) > 0 {
		return nil
	}
	return []sim.Order{{Kind: "train", Entities: []sim.ID{p.ID}, Type: unitType}}
}

// trainMix picks one affordable unit from a preference list, shuffled by seed.
func (b *base) trainMix(view sim.View, f forces, roles []string, reserve int64) []sim.Order {
	order := append([]string(nil), roles...)
	b.rng.Shuffle(len(order), func(i, j int) { order[i], order[j] = order[j], order[i] })
	for _, role := range order {
		if o := b.trainOrder(view, f, b.faction+"."+role, reserve); o != nil {
			return o
		}
	}
	return nil
}

// buildNear tries to place kind on a ring of candidate points around anchor.
// One attempt per call; placement rejections are counted by the runner and
// the next decision retries the next candidate.
func (b *base) buildNear(view sim.View, f forces, kind string, anchor sim.Vec, tried *int) []sim.Order {
	building, ok := b.catalog.Building(kind)
	if !ok || view.Economy.Credits < building.Cost {
		return nil
	}
	var rig *sim.EntityView
	for i := range f.rigs {
		if idle(f.rigs[i]) {
			rig = &f.rigs[i]
			break
		}
	}
	if rig == nil {
		return nil
	}
	offsets := []sim.Vec{
		{X: 9000, Y: 0}, {X: -9000, Y: 0}, {X: 0, Y: 9000}, {X: 0, Y: -9000},
		{X: 9000, Y: 9000}, {X: -9000, Y: -9000}, {X: 14000, Y: 5000}, {X: -14000, Y: 5000},
	}
	point := anchor
	point.X += offsets[*tried%len(offsets)].X
	point.Y += offsets[*tried%len(offsets)].Y
	*tried++
	return []sim.Order{{Kind: "build", Entities: []sim.ID{rig.ID}, Type: kind, Position: b.mapPoint(point.X, point.Y)}}
}

func hasBuilding(f forces, kind string) bool {
	for _, p := range f.producers {
		if p.Type == kind {
			return true
		}
	}
	return false
}

// nearestVisibleEnemy returns the closest visible hostile position to from,
// preferring armed units. Script/AI enemies are any non-team-1 owner; the
// view only exposes what player 1 can see.
func nearestVisibleEnemy(view sim.View, from sim.Vec, maxD2 int64) (sim.Vec, bool) {
	teams := map[sim.PlayerID]uint32{}
	for _, p := range view.Players {
		teams[p.ID] = p.Team
	}
	best, found := maxD2, false
	var pos sim.Vec
	for _, e := range view.Entities {
		if e.Owner == 0 || e.Owner == 1 || teams[e.Owner] == 1 {
			continue
		}
		if d := dist2(e.Position, from); d < best {
			best, pos, found = d, e.Position, true
		}
	}
	return pos, found
}

func centroid(entities []sim.EntityView) (sim.Vec, bool) {
	if len(entities) == 0 {
		return sim.Vec{}, false
	}
	var x, y int64
	for _, e := range entities {
		x += int64(e.Position.X)
		y += int64(e.Position.Y)
	}
	n := int64(len(entities))
	return sim.Vec{X: int32(x / n), Y: int32(y / n)}, true
}

// ---- personalities -------------------------------------------------------

// idleBot never orders anything: the mission scripting and enemy AI still
// run, so stalls or crashes here are engine/mission defects, not bot play.
type idleBot struct{}

func (idleBot) Name() string                { return "idle" }
func (idleBot) Orders(sim.View) []sim.Order { return nil }

// randomBot is a legal-order fuzzer: random groups, random destinations,
// random affordable production. It stresses order validation and pathing.
type randomBot struct{ base }

func (b *randomBot) Name() string { return "random" }

func (b *randomBot) Orders(view sim.View) []sim.Order {
	f := b.forces(view)
	var orders []sim.Order
	orders = append(orders, b.gatherOrder(view, f)...)
	if len(f.army) > 0 && b.rng.Intn(3) != 0 {
		// Random split of the army to a random point.
		army := append([]sim.EntityView(nil), f.army...)
		b.rng.Shuffle(len(army), func(i, j int) { army[i], army[j] = army[j], army[i] })
		take := 1 + b.rng.Intn(len(army))
		kind := "move"
		if b.rng.Intn(2) == 0 {
			kind = "attack_move"
		}
		orders = append(orders, sim.Order{Kind: kind, Entities: idsOf(army[:take]), Position: b.randomPoint()})
	}
	orders = append(orders, b.trainMix(view, f, []string{"rifle", "at", "car", "tank", "aa", "hauler", "engineer", "recon"}, 0)...)
	for _, e := range f.engineers {
		if idle(e) && b.rng.Intn(2) == 0 {
			orders = append(orders, sim.Order{Kind: "move", Entities: []sim.ID{e.ID}, Position: b.randomPoint()})
			break
		}
	}
	return orders
}

// rusherBot spends on combat units and attack-moves the whole army across
// the map's regions in order, then at any visible enemy. No building play.
type rusherBot struct {
	base
	waypoint int
	lastPush sim.Tick
}

func (b *rusherBot) Name() string { return "rusher" }

func (b *rusherBot) Orders(view sim.View) []sim.Order {
	f := b.forces(view)
	var orders []sim.Order
	orders = append(orders, b.gatherOrder(view, f)...)
	orders = append(orders, b.trainMix(view, f, []string{"tank", "rifle", "at", "car", "aa"}, 0)...)
	if len(f.army) == 0 || view.Tick-b.lastPush < 200 {
		return orders
	}
	b.lastPush = view.Tick
	target := b.mapPoint(b.gameMap.Width*500, b.gameMap.Height*500)
	if len(b.regions) > 0 {
		target = b.regions[b.waypoint%len(b.regions)]
		if c, ok := centroid(f.army); ok && dist2(c, target) < 9000*9000 {
			b.waypoint++
			target = b.regions[b.waypoint%len(b.regions)]
		}
	}
	if pos, ok := nearestVisibleEnemy(view, target, 30000*30000); ok {
		target = pos
	}
	orders = append(orders, sim.Order{Kind: "attack_move", Entities: idsOf(f.army), Position: target})
	return orders
}

// turtleBot builds economy and one turret, trains a home guard and only
// fights enemies that come near its base.
type turtleBot struct {
	base
	buildTried int
	lastDefend sim.Tick
}

func (b *turtleBot) Name() string { return "turtle" }

func (b *turtleBot) Orders(view sim.View) []sim.Order {
	f := b.forces(view)
	var orders []sim.Order
	orders = append(orders, b.gatherOrder(view, f)...)
	if len(f.haulers) < 4 {
		orders = append(orders, b.trainOrder(view, f, b.faction+".hauler", 0)...)
	}
	if f.hq != nil && !hasBuilding(f, "supply") {
		orders = append(orders, b.buildNear(view, f, "supply", f.hq.Position, &b.buildTried)...)
	} else if f.hq != nil && b.buildTried < 24 && !hasBuilding(f, "turret") {
		orders = append(orders, b.buildNear(view, f, "turret", f.hq.Position, &b.buildTried)...)
	}
	orders = append(orders, b.trainMix(view, f, []string{"rifle", "at", "aa", "tank"}, 500000)...)
	// Engineers repair the most damaged owned building.
	for _, e := range f.engineers {
		if !idle(e) {
			continue
		}
		var worst *sim.EntityView
		for i := range f.producers {
			p := f.producers[i]
			if p.Private != nil && p.Private.HP < p.Private.MaxHP && (worst == nil || p.Private.HP < worst.Private.HP) {
				worst = &p
			}
		}
		if worst != nil {
			orders = append(orders, sim.Order{Kind: "repair", Entities: []sim.ID{e.ID}, Target: worst.ID})
		}
		break
	}
	if f.hq != nil && len(f.army) > 0 && view.Tick-b.lastDefend >= 150 {
		if pos, ok := nearestVisibleEnemy(view, f.hq.Position, 26000*26000); ok {
			b.lastDefend = view.Tick
			orders = append(orders, sim.Order{Kind: "attack_move", Entities: idsOf(f.army), Position: pos})
		}
	}
	return orders
}

// objectiveBot is the generic competent commander: keep the economy
// gathering, rebuild missing supply/power/production, train a mixed army,
// tour the map's named regions with it, send engineers to capture visible
// neutral/enemy stations, and fall back to defend the base under attack.
type objectiveBot struct {
	base
	waypoint   int
	buildTried int
	lastPush   sim.Tick
	lastTarget sim.Vec
}

func (b *objectiveBot) Name() string { return "objective" }

func (b *objectiveBot) Orders(view sim.View) []sim.Order {
	f := b.forces(view)
	var orders []sim.Order
	orders = append(orders, b.gatherOrder(view, f)...)

	// Economy and base completion, one construction attempt per decision.
	if f.hq != nil {
		switch {
		case !hasBuilding(f, "supply"):
			orders = append(orders, b.buildNear(view, f, "supply", f.hq.Position, &b.buildTried)...)
		case view.Economy.PowerDemand > view.Economy.PowerCapacity:
			orders = append(orders, b.buildNear(view, f, "power", f.hq.Position, &b.buildTried)...)
		case !hasBuilding(f, "barracks"):
			orders = append(orders, b.buildNear(view, f, "barracks", f.hq.Position, &b.buildTried)...)
		case !hasBuilding(f, "factory"):
			orders = append(orders, b.buildNear(view, f, "factory", f.hq.Position, &b.buildTried)...)
		}
	}
	if len(f.haulers) < 3 {
		orders = append(orders, b.trainOrder(view, f, b.faction+".hauler", 0)...)
	}
	if len(f.engineers) < 2 {
		orders = append(orders, b.trainOrder(view, f, b.faction+".engineer", 400000)...)
	}
	orders = append(orders, b.trainMix(view, f, []string{"tank", "rifle", "at", "aa", "car", "artillery"}, 300000)...)

	// Capture the nearest visible station player 1 does not own.
	for _, st := range view.Stations {
		if st.Owner == 1 {
			continue
		}
		for _, e := range f.engineers {
			if idle(e) {
				orders = append(orders, sim.Order{Kind: "capture", Entities: []sim.ID{e.ID}, Target: st.ID})
				break
			}
		}
		break
	}

	// Army movement: defend first, otherwise tour regions.
	if len(f.army) > 0 && view.Tick-b.lastPush >= 200 {
		target, have := sim.Vec{}, false
		if f.hq != nil {
			if pos, ok := nearestVisibleEnemy(view, f.hq.Position, 24000*24000); ok {
				target, have = pos, true
			}
		}
		if !have && len(b.regions) > 0 {
			target = b.regions[b.waypoint%len(b.regions)]
			if c, ok := centroid(f.army); ok && dist2(c, target) < 9000*9000 {
				b.waypoint++
				target = b.regions[b.waypoint%len(b.regions)]
			}
			have = true
		}
		if have && (target != b.lastTarget || view.Tick-b.lastPush >= 800) {
			b.lastPush, b.lastTarget = view.Tick, target
			orders = append(orders, sim.Order{Kind: "attack_move", Entities: idsOf(f.army), Position: target})
			// Idle engineers trail the army so captures stay possible.
			var trail []sim.ID
			for _, e := range f.engineers {
				if idle(e) {
					trail = append(trail, e.ID)
				}
			}
			if len(trail) > 0 {
				orders = append(orders, sim.Order{Kind: "move", Entities: trail, Position: target})
			}
		}
	}
	return orders
}
