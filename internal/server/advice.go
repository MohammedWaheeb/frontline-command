package server

import (
	"context"
	"errors"
	"frontlinecommand/pkg/sim"
	"net/http"
	"strings"
	"sync"
	"time"
)

type adviceRequest struct {
	Independent bool        `json:"independent"`
	Entities    []sim.ID    `json:"entities"`
	Orders      []sim.Order `json:"orders"`
}
type adviceResponse struct {
	sim.CommandAffordances
	Results []sim.OrderResult `json:"results"`
}
type adviceWindow struct {
	started time.Time
	count   int
	busy    bool
}

// Keys are authenticated match player slots, bounded by four per match.
type adviceGate struct {
	mu      sync.Mutex
	players map[sim.PlayerID]adviceWindow
}

func (g *adviceGate) acquire(player sim.PlayerID, now time.Time) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.players == nil {
		g.players = map[sim.PlayerID]adviceWindow{}
	}
	slot := g.players[player]
	if slot.busy {
		return false
	}
	if now.Sub(slot.started) >= time.Second {
		slot.started = now
		slot.count = 0
	}
	if slot.count >= 4 {
		return false
	}
	slot.count++
	slot.busy = true
	g.players[player] = slot
	return true
}
func (g *adviceGate) release(player sim.PlayerID) {
	g.mu.Lock()
	defer g.mu.Unlock()
	slot := g.players[player]
	slot.busy = false
	g.players[player] = slot
}

// No unbounded worker queue: all hosted matches share at most eight clones.
type adviceWorkGate struct {
	mu     sync.Mutex
	active int
}

func (g *adviceWorkGate) acquire() bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.active >= 8 {
		return false
	}
	g.active++
	return true
}
func (g *adviceWorkGate) release() { g.mu.Lock(); defer g.mu.Unlock(); g.active-- }

func (s *Server) commandAdvice(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	match := s.matches[r.PathValue("id")]
	s.mu.Unlock()
	if match == nil {
		fail(w, 404, "match_not_found", "The match is no longer available.")
		return
	}
	authorization := r.Header.Get("Authorization")
	token, hasBearer := strings.CutPrefix(authorization, "Bearer ")
	slot, authorized := match.slotForToken(token)
	if !hasBearer || token == "" || !authorized {
		fail(w, 401, "match_authentication_required", "Use this commander's match connection token.")
		return
	}
	var body adviceRequest
	if !decode(w, r, &body, 64<<10) {
		return
	}
	if len(body.Entities) > 64 || len(body.Orders) > 32 {
		fail(w, 400, "command_limit", "Advice accepts up to 64 selected entities and 32 orders.")
		return
	}
	for _, order := range body.Orders {
		if len(order.Entities) > 64 || len(order.Points) > 6 || len(order.Type) > 80 {
			fail(w, 400, "invalid_order", "An order exceeds the command limits.")
			return
		}
	}
	if !match.advice.acquire(slot.Player, time.Now()) {
		w.Header().Set("Retry-After", "1")
		fail(w, 429, "advice_rate_exceeded", "Allow current advice to finish; request no more than four updates per second.")
		return
	}
	defer match.advice.release(slot.Player)
	if !s.adviceWorkers.acquire() {
		w.Header().Set("Retry-After", "1")
		fail(w, 503, "advice_busy", "Command advice is busy. Actual orders remain available.")
		return
	}
	defer s.adviceWorkers.release()
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	deadline, _ := ctx.Deadline()
	reply := match.call(ctx, matchRequest{adviceDeadline: deadline, kind: "advice", token: token, player: slot.Player, entities: body.Entities, orders: body.Orders})
	if reply.err != nil {
		status := 400
		if errors.Is(reply.err, context.DeadlineExceeded) || errors.Is(reply.err, context.Canceled) {
			status = 503
		}
		fail(w, status, "advice_unavailable", "Command advice is unavailable for this selection or match state.")
		return
	}
	result := adviceResponse{CommandAffordances: reply.affordances, Results: []sim.OrderResult{}}
	if len(body.Orders) > 0 {
		if ctx.Err() != nil {
			fail(w, 503, "advice_timeout", "Command advice timed out.")
			return
		}
		preview := sim.PreviewSavedOrders
		if body.Independent {
			preview = sim.PreviewSavedCandidates
		}
		results, err := preview(s.catalog, reply.data, slot.Player, body.Orders)
		if err != nil {
			fail(w, 400, "advice_unavailable", "The proposed batch cannot currently be submitted.")
			return
		}
		result.Results = results
	}
	if ctx.Err() != nil {
		fail(w, 503, "advice_timeout", "Command advice timed out.")
		return
	}
	respond(w, 200, result)
}
