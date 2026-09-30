package server

import (
	"sync/atomic"
	"time"
)

// Runtime metrics are operational measurements, never deterministic game state.
// Only the explicit loopback load profile exposes these counters over HTTP.
type matchRuntimeCounters struct {
	advances              atomic.Uint64
	tickCount             atomic.Uint64
	tickNanos             atomic.Uint64
	tickMaxNanos          atomic.Uint64
	tickBuckets           [11]atomic.Uint64
	missedTickerIntervals atomic.Uint64
	maxRequestDepth       atomic.Uint64
	stateFrames           atomic.Uint64
	priorityFrames        atomic.Uint64
	wireBytes             atomic.Uint64
}

type MatchRuntimeMetrics struct {
	SimulationAdvances uint64 `json:"simulation_advances"`
	TickWorkCount      uint64 `json:"tick_work_count"`
	TickWorkNanos      uint64 `json:"tick_work_nanos"`
	TickWorkMaxNanos   uint64 `json:"tick_work_max_nanos"`
	// Noncumulative buckets; the last bucket is greater than 100 milliseconds.
	TickWorkBuckets       [11]uint64 `json:"tick_work_buckets"`
	TickWorkBoundsNanos   [10]uint64 `json:"tick_work_bounds_nanos"`
	MissedTickerIntervals uint64     `json:"missed_ticker_intervals"`
	MaxRequestDepth       uint64     `json:"max_request_depth"`
	StateFrames           uint64     `json:"state_frames"`
	PriorityFrames        uint64     `json:"priority_frames"`
	WireBytes             uint64     `json:"wire_bytes"`
	StateUpdatesPerSecond uint32     `json:"state_updates_per_second"`
}

var tickWorkBounds = [10]uint64{250000, 500000, 1000000, 2000000, 4000000, 8000000, 16000000, 32000000, 50000000, 100000000}

func metricMax(target *atomic.Uint64, value uint64) {
	for previous := target.Load(); value > previous; previous = target.Load() {
		if target.CompareAndSwap(previous, value) {
			return
		}
	}
}

func (c *matchRuntimeCounters) recordTick(elapsed time.Duration, requestDepth int, advanced bool) {
	nanos := uint64(elapsed.Nanoseconds())
	c.tickCount.Add(1)
	c.tickNanos.Add(nanos)
	metricMax(&c.tickMaxNanos, nanos)
	metricMax(&c.maxRequestDepth, uint64(requestDepth))
	index := len(tickWorkBounds)
	for i, bound := range tickWorkBounds {
		if nanos <= bound {
			index = i
			break
		}
	}
	c.tickBuckets[index].Add(1)
	if advanced {
		c.advances.Add(1)
	}
}

// RuntimeMetrics is a concurrent read of monotonically increasing atomics.
// A sampler must difference counters between samples; it is not a transaction
// and a crossing tick can appear in adjacent fields on either sample.
func (m *liveMatch) RuntimeMetrics() MatchRuntimeMetrics {
	c := &m.metrics
	result := MatchRuntimeMetrics{
		SimulationAdvances: c.advances.Load(), TickWorkCount: c.tickCount.Load(),
		TickWorkNanos: c.tickNanos.Load(), TickWorkMaxNanos: c.tickMaxNanos.Load(),
		TickWorkBoundsNanos: tickWorkBounds, MissedTickerIntervals: c.missedTickerIntervals.Load(),
		MaxRequestDepth: c.maxRequestDepth.Load(), StateFrames: c.stateFrames.Load(),
		PriorityFrames: c.priorityFrames.Load(), WireBytes: c.wireBytes.Load(),
	}
	if m.stateEvery != 0 {
		result.StateUpdatesPerSecond = uint32(20 / m.stateEvery)
	}
	for i := range result.TickWorkBuckets {
		result.TickWorkBuckets[i] = c.tickBuckets[i].Load()
	}
	return result
}
