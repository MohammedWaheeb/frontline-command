package sim

import "frontlinecommand/pkg/content"

// OrderPreview contains owner-only, nonbinding command advice at one tick.
type OrderPreview struct {
	Tick    Tick            `json:"tick"`
	Results []OrderResult   `json:"results"`
	Plans   []StrategicPlan `json:"plans,omitempty"`
}

type StrategicPlan struct {
	OrderIndex int32            `json:"order_index"`
	Kind       string           `json:"kind"`
	Edge       int32            `json:"edge"`
	Routes     []StrategicRoute `json:"routes"`
}

// Times estimate an unobstructed launch at the next simulation tick. Aircraft
// can be intercepted or delayed, and execution rechecks visibility/readiness.
// No hidden actor, obstacle, AA coverage, or future fog information is sampled.
type StrategicRoute struct {
	Entry     Vec   `json:"entry"`
	Drop      Vec   `json:"drop"`
	Impact    Vec   `json:"impact"`
	EntryAt   Tick  `json:"entry_at"`
	ReleaseAt Tick  `json:"release_at"`
	ImpactAt  Tick  `json:"impact_at"`
	Splash    int32 `json:"splash"`
}

func (e *Engine) PreviewOrderAdvice(player PlayerID, orders []Order) (OrderPreview, error) {
	save, err := e.SaveForAdvice()
	if err != nil {
		return OrderPreview{}, err
	}
	return PreviewSavedOrderAdvice(e.catalog, save, player, orders)
}

func PreviewSavedOrderAdvice(c *content.Catalog, save []byte, player PlayerID, orders []Order) (OrderPreview, error) {
	preview, err := Restore(c, save)
	if err != nil {
		return OrderPreview{}, err
	}
	return preview.previewDetachedAdvice(player, orders)
}

// Called only after Submit validates source ownership, points and batch bounds.
// Plans describe the snapshot, never effects from earlier orders in the batch.
func (e *Engine) strategicPlans(p *Player, orders []Order) []StrategicPlan {
	if p.Faction != "US" {
		return nil
	}
	var plans []StrategicPlan
	for i, o := range orders {
		if o.Kind != "ability" || o.Type != "strategic" || o.Index < 0 || o.Index > 3 || len(o.Points) != 3 || e.previewKnowledge(p, o) != "ok" {
			continue
		}
		valid := true
		for _, pt := range o.Points {
			if !e.canSee(p.ID, pt) || distance(pt, o.Points[0]) > 4000 {
				valid = false
				break
			}
		}
		if valid {
			plans = append(plans, StrategicPlan{OrderIndex: int32(i), Kind: "skybreaker", Edge: o.Index, Routes: e.skybreakerRoutes(o, e.state.Tick+1)})
		}
	}
	return plans
}

// The actual launch and advisory preview share this integer geometry. Keep
// target ordering: each point is assigned its original wing lane.
func (e *Engine) skybreakerRoutes(o Order, launch Tick) []StrategicRoute {
	center := Vec{}
	for _, pt := range o.Points {
		center.X += pt.X / 3
		center.Y += pt.Y / 3
	}
	center.X = clamp(center.X, 2200, e.state.Map.Width*1000-2200)
	center.Y = clamp(center.Y, 2200, e.state.Map.Height*1000-2200)
	routes := make([]StrategicRoute, 0, len(o.Points))
	for i, pt := range o.Points {
		lane := int32(i-1) * 1600
		drop := Vec{X: center.X, Y: center.Y + lane}
		entry := Vec{X: 601, Y: drop.Y}
		switch o.Index {
		case 1:
			entry = Vec{X: e.state.Map.Width*1000 - 601, Y: drop.Y}
		case 2:
			drop = Vec{X: center.X + lane, Y: center.Y}
			entry = Vec{X: drop.X, Y: 601}
		case 3:
			drop = Vec{X: center.X + lane, Y: center.Y}
			entry = Vec{X: drop.X, Y: e.state.Map.Height*1000 - 601}
		}
		flight := Tick((distance(entry, drop)*20 + 5999) / 6000)
		release := launch + max(seconds(12), flight)
		routes = append(routes, StrategicRoute{Entry: entry, Drop: drop, Impact: pt, EntryAt: release - flight, ReleaseAt: release, ImpactAt: release + 1, Splash: strategicImpactRadius})
	}
	return routes
}
