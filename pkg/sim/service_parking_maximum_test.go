package sim

import (
	"sort"
	"testing"
	"time"
)

// Same688actors,64aircraft,4players,100Supply/player,60buildings/player as the
// original maximum fixture. Only the16hub positions use deliberate free apron
// space. The original dense layout remains a separate preserved failure.
func exteriorMaximumFixture(t testing.TB) (*Engine, []ID) {
	e, ids := maximumAirReturnFixture(t)
	for i, p := range e.state.Players {
		n := 0
		for _, v := range e.state.Entities {
			if v.Owner != p.ID || v.Type != "IR.drone_hub" {
				continue
			}
			v.Position = Vec{X: 36000 + int32(i%2)*90000 + int32(n%2)*15000, Y: 40000 + int32(i/2)*90000 + int32(n/2)*15000}
			v.LastPosition, v.Anchor, v.Rally = v.Position, v.Position, v.Position
			n++
		}
		if n != 4 {
			t.Fatal("hub count", n)
		}
	}
	e.state.NavigationRevision++
	e.recalculate()
	e.updateFog()
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = Restore(e.catalog, saved); err != nil {
		t.Fatal(err)
	}
	return e, ids
}

func TestExteriorMaximum64OrdinaryReturns(t *testing.T) {
	if testing.Short() || raceInstrumentation {
		t.Skip("native measured maximum fleet")
	}
	e, ids := exteriorMaximumFixture(t)
	samples := []time.Duration{}
	landed := map[ID]bool{}
	for range 2400 {
		start := time.Now()
		e.Advance()
		samples = append(samples, time.Since(start))
		for _, id := range ids {
			v := e.entity(id)
			if v == nil || v.HP <= 0 {
				t.Fatal("aircraft lost", id, e.Tick())
			}
			if v.Landed {
				landed[id] = true
			}
		}
		if len(landed) == len(ids) {
			break
		}
	}
	if len(landed) != 64 {
		t.Fatal("not all64 returned", len(landed))
	}
	for _, id := range ids {
		v := e.entity(id)
		for _, other := range ids {
			if other == id {
				continue
			}
			if distance(v.Position, e.entity(other).Position) < e.radius(v)+e.radius(e.entity(other)) {
				t.Fatal("combat circles overlap")
			}
		}
	}
	sort.Slice(samples, func(i, j int) bool { return samples[i] < samples[j] })
	p95, p99 := samples[len(samples)*95/100], samples[len(samples)*99/100]
	t.Logf("simulation%s 688actors64returns samecaps exterior-layout ticks%d p50%s p95%s p99%s", Version, len(samples), samples[len(samples)/2], p95, p99)
	if p95 > 25*time.Millisecond || p99 > 40*time.Millisecond {
		t.Fatal("native timing gate exceeded")
	}
}
