package server

import (
	"bytes"
	"compress/gzip"
	"errors"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/sim"
	"google.golang.org/protobuf/proto"
	"io"
	"net/http"
	"sort"
	"strings"
)

type observerFrame struct {
	tick sim.Tick
	data []byte
}
type observerArchive struct {
	frames     map[sim.PlayerID][]observerFrame
	events     map[sim.PlayerID][]sim.Event
	buffer     bytes.Buffer
	compressor *gzip.Writer
}

func newObserverArchive() *observerArchive {
	a := &observerArchive{frames: map[sim.PlayerID][]observerFrame{}, events: map[sim.PlayerID][]sim.Event{}}
	a.compressor, _ = gzip.NewWriterLevel(&a.buffer, gzip.BestSpeed)
	return a
}
func (a *observerArchive) capture(engine *sim.Engine, slots []slot) map[sim.PlayerID]sim.View {
	views := map[sim.PlayerID]sim.View{}
	for _, slot := range slots {
		view, ok := engine.PlayerView(slot.Player)
		if !ok {
			continue
		}
		views[slot.Player] = view
		a.events[slot.Player] = append(a.events[slot.Player], view.Events...)
		if engine.Tick()%4 != 0 && !engine.Outcome().Finished {
			continue
		}
		view.Events = a.events[slot.Player]
		a.events[slot.Player] = nil
		// An observer sees this perspective's permitted battlefield and economy,
		// but never receives player command receipts that could be replayed as input.
		view.Results = nil
		snap, err := snapshot(view)
		if err != nil {
			continue
		}
		raw, err := proto.Marshal(snap)
		if err != nil {
			continue
		}
		a.buffer.Reset()
		a.compressor.Reset(&a.buffer)
		a.compressor.Write(raw)
		a.compressor.Close()
		data := bytes.Clone(a.buffer.Bytes())
		frames := a.frames[slot.Player]
		frames = append(frames, observerFrame{engine.Tick(), data})
		if len(frames) > 610 {
			frames = frames[len(frames)-610:]
		}
		a.frames[slot.Player] = frames
	}
	return views
}
func (a *observerArchive) read(player sim.PlayerID, clock, delay sim.Tick) ([]byte, error) {
	if clock < delay {
		return nil, errors.New("observer_buffering")
	}
	frames := a.frames[player]
	target := clock - delay
	i := sort.Search(len(frames), func(i int) bool { return frames[i].tick > target }) - 1
	if i < 0 {
		return nil, errors.New("observer_buffering")
	}
	r, err := gzip.NewReader(bytes.NewReader(frames[i].data))
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(io.LimitReader(r, 8<<20))
}

type observerGrant struct {
	token   string
	profile string
	player  sim.PlayerID
}

func (s *Server) createObserver(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Player sim.PlayerID `json:"player"`
		Code   string       `json:"code"`
	}
	if !decode(w, r, &body, 4096) {
		return
	}
	s.mu.Lock()
	m := s.matches[r.PathValue("id")]
	allowed := false
	for _, l := range s.lobbies {
		if l.MatchID != r.PathValue("id") {
			continue
		}
		allowed = !l.Private || body.Code == l.Code
		for _, slot := range l.Slots {
			if slot.Profile == profile.ID {
				allowed = true
			}
		}
	}
	s.mu.Unlock()
	if m == nil || !allowed {
		fail(w, 404, "match_unavailable", "The match is unavailable or needs its private code.")
		return
	}
	token, err := storage.Token()
	if err != nil {
		fail(w, 500, "random_error", "Could not join observer feed.")
		return
	}
	reply := m.call(r.Context(), matchRequest{kind: "observer_ticket", player: body.Player, profile: profile.ID, token: token})
	if reply.err != nil {
		fail(w, 409, reply.err.Error(), "Active players cannot observe other perspectives. Choose a valid player after elimination.")
		return
	}
	respond(w, 201, map[string]any{"token": token, "player": body.Player, "delay_ticks": m.observerDelay, "read_only": true})
}
func (s *Server) readObserver(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	m := s.matches[r.PathValue("id")]
	s.mu.Unlock()
	if m == nil {
		fail(w, 404, "match_closed", "This match is no longer available.")
		return
	}
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if len(token) != 64 {
		fail(w, 401, "observer_token_required", "Join the observer feed first.")
		return
	}
	reply := m.call(r.Context(), matchRequest{kind: "observer_read", token: token})
	if reply.err != nil {
		if reply.err.Error() == "observer_buffering" {
			respond(w, 202, map[string]any{"code": "observer_buffering", "delay_ticks": m.observerDelay})
			return
		}
		fail(w, 403, "observer_unavailable", "The observer ticket is invalid or unavailable.")
		return
	}
	w.Header().Set("Content-Type", "application/x-protobuf")
	w.Write(reply.data)
}
