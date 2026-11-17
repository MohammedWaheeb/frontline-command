package server

import (
	"frontlinecommand/pkg/sim"
	"testing"
	"time"
)

func observerTestEngine(t *testing.T) *sim.Engine {
	t.Helper()
	s, _ := testServer(t)
	engine, err := sim.New(s.catalog, sim.Config{Map: testMap(), Seed: 2, Players: []sim.PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	return engine
}

// With zero observers the archive must still return per-player views (the
// peer pipeline reuses them) but do no snapshot/proto/gzip frame work.
func TestObserverArchiveSkipsFramesWithoutObservers(t *testing.T) {
	engine := observerTestEngine(t)
	archive := newObserverArchive()
	slots := []slot{{Player: 1}, {Player: 2}}
	for range 8 {
		engine.Advance()
		views := archive.capture(engine, slots, false)
		if len(views) != 2 {
			t.Fatal("views missing when archiving disabled", len(views))
		}
	}
	for player, frames := range archive.frames {
		if len(frames) != 0 {
			t.Fatal("frames archived with zero observers", player, len(frames))
		}
	}
	if _, err := archive.read(1, engine.Tick(), 0); err == nil {
		t.Fatal("read succeeded with no archived frames")
	}
	// Once an observer exists, frames are archived and readable.
	for range 4 {
		engine.Advance()
		archive.capture(engine, slots, true)
	}
	if len(archive.frames[1]) == 0 {
		t.Fatal("no frames archived with observers present")
	}
	if _, err := archive.read(1, engine.Tick(), 0); err != nil {
		t.Fatal("observer read after enabling archive", err)
	}
}

// The archive is bounded by retained compressed bytes per player, not only
// by frame count: oldest frames are evicted first.
func TestObserverArchiveByteCap(t *testing.T) {
	old := maxObserverArchiveBytesPerPlayer
	maxObserverArchiveBytesPerPlayer = 4096
	t.Cleanup(func() { maxObserverArchiveBytesPerPlayer = old })
	engine := observerTestEngine(t)
	archive := newObserverArchive()
	slots := []slot{{Player: 1}}
	for range 200 {
		engine.Advance()
		archive.capture(engine, slots, true)
	}
	frames := archive.frames[1]
	if len(frames) == 0 {
		t.Fatal("byte cap evicted every frame")
	}
	total := 0
	for _, f := range frames {
		total += len(f.data)
	}
	if len(frames) > 1 && int64(total) > maxObserverArchiveBytesPerPlayer {
		t.Fatal("retained archive bytes exceed cap", total, maxObserverArchiveBytesPerPlayer)
	}
	if archive.bytes[1] != int64(total) {
		t.Fatal("tracked archive bytes disagree with frames", archive.bytes[1], total)
	}
	if frames[0].tick == 0 {
		t.Fatal("oldest frames not evicted under byte cap")
	}
	if _, err := archive.read(1, engine.Tick(), 0); err != nil {
		t.Fatal("newest frame unreadable under byte cap", err)
	}
}

// Ticker catch-up is small and bounded: a stalled wake replays a few ticks,
// never an unbounded spiral.
func TestCatchUpStepsBounded(t *testing.T) {
	interval := time.Second / 20
	cases := []struct {
		elapsed time.Duration
		want    int
	}{
		{0, 1},
		{-time.Second, 1},
		{interval / 2, 1},
		{interval, 1},
		{2 * interval, 2},
		{3 * interval, 3},
		{4 * interval, 4},
		{100 * interval, maxCatchUpSteps},
		{time.Hour, maxCatchUpSteps},
	}
	for _, c := range cases {
		if got := catchUpSteps(c.elapsed, interval); got != c.want {
			t.Fatal("catchUpSteps", c.elapsed, "got", got, "want", c.want)
		}
	}
	if got := catchUpSteps(time.Second, 0); got != 1 {
		t.Fatal("zero interval must not burst", got)
	}
}
