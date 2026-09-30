// Command wasm is the browser adapter around the authoritative Go engine.
//
// session.go is platform neutral: the js/wasm entry point (main.go) and the
// native parity harness (native.go) drive the same Session so that native and
// WebAssembly runs exercise identical adapter code. The adapter never
// implements game rules; it only schedules orders, advances ticks, converts
// authorized PlayerView data to the shared protobuf wire and classifies errors.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"

	"frontlinecommand/internal/viewproto"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

// AdapterVersion identifies the browser adapter contract, independent of the
// simulation version recorded inside engine saves.
const AdapterVersion = "1"

// ProtocolVersion mirrors docs/protocol.md; the engine records it in metadata.
const ProtocolVersion uint32 = 1

// Limits guard the worker against runaway requests from a buggy caller.
const (
	maxStepPerCall   = 200
	maxConfigBytes   = 16 << 20
	maxOrderBatchLen = 64 << 10
	maxSaveBytes     = 64 << 20
)

// Error is a typed, stable adapter error surfaced to JavaScript.
type Error struct {
	Code        string `json:"code"`
	Message     string `json:"message"`
	Recoverable bool   `json:"recoverable"`
	// Found/Expected are set for compatibility failures so the UI can explain them.
	Found    *sim.Metadata `json:"found,omitempty"`
	Expected *sim.Metadata `json:"expected,omitempty"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

func fail(code, message string, recoverable bool) *Error {
	return &Error{Code: code, Message: message, Recoverable: recoverable}
}

// CreateConfig is the offline match request. Players without an AI difficulty
// are local humans; only they may be viewed or commanded through the adapter.
type CreateConfig struct {
	Mission         *content.Mission   `json:"mission,omitempty"`
	Difficulty      string             `json:"difficulty,omitempty"`
	TutorialFaction string             `json:"tutorial_faction,omitempty"`
	Map             content.Map        `json:"map"`
	Players         []sim.PlayerConfig `json:"players"`
	Seed            uint64             `json:"seed"`
	Ruleset         string             `json:"ruleset,omitempty"`
	// StartingCredits is optional WHOLE credits. The adapter converts a
	// nondefault custom opening to engine milliMoney exactly once.
	StartingCredits *int64 `json:"starting_credits,omitempty"`
	// SkipCountdown is for automated tests only; it advances through the
	// engine's own countdown ticks rather than editing state.
	SkipCountdown bool `json:"skip_countdown,omitempty"`
}

// Info summarizes an active session without exposing hidden state.
type Info struct {
	Adapter     string           `json:"adapter"`
	Metadata    sim.Metadata     `json:"metadata"`
	Tick        sim.Tick         `json:"tick"`
	Local       []sim.PlayerID   `json:"local_players"`
	Finished    bool             `json:"finished"`
	Replay      bool             `json:"replay"`
	ReplayStart sim.Tick         `json:"replay_start"`
	ReplayEnd   sim.Tick         `json:"replay_end"`
	ReplayLobby *sim.ReplayLobby `json:"replay_lobby,omitempty"`
	// StartingCredits is the original eligible skirmish opening in WHOLE
	// credits, independent of current balances. Prescribed budgets are omitted.
	StartingCredits *int64 `json:"starting_credits,omitempty"`
}

type pendingFrame struct {
	events  []sim.Event
	results []sim.OrderResult
	known   []sim.ID
}

// Session owns exactly one engine. It is not safe for concurrent use; the
// browser worker is single threaded and every call runs on a tick boundary.
type Session struct {
	catalog     *content.Catalog
	engine      *sim.Engine
	local       []sim.PlayerID
	pending     map[sim.PlayerID]*pendingFrame
	recorder    *sim.Replay
	replay      *sim.Replay
	playback    *sim.ReplayPlayer
	replayBytes []byte
	replayStart sim.Tick
}

func NewSession() (*Session, error) {
	c, err := content.Base()
	if err != nil {
		return nil, fmt.Errorf("embedded content failed validation: %w", err)
	}
	return &Session{catalog: c}, nil
}

// ExpectedMetadata is what a compatible save must record.
func (s *Session) ExpectedMetadata() sim.Metadata {
	return sim.Metadata{Simulation: sim.Version, Protocol: ProtocolVersion, ContentHash: s.catalog.Hash()}
}

func (s *Session) active() *Error {
	if s.engine == nil {
		return fail("no_match", "No offline match is loaded.", true)
	}
	return nil
}

func (s *Session) Create(config []byte) (Info, error) {
	if len(config) > maxConfigBytes {
		return Info{}, fail("invalid_config", "Match configuration exceeds 16 MiB.", true)
	}
	var cfg CreateConfig
	d := json.NewDecoder(bytes.NewReader(config))
	d.DisallowUnknownFields()
	if err := d.Decode(&cfg); err != nil {
		return Info{}, fail("invalid_config", "Match configuration is malformed: "+err.Error(), true)
	}
	if d.Decode(new(any)) != io.EOF {
		return Info{}, fail("invalid_config", "Match configuration has trailing data.", true)
	}
	// The typed decoder accepts null for a pointer; an explicit user option
	// must be an integer, so distinguish null from an omitted key only here.
	if cfg.StartingCredits == nil {
		var option struct {
			StartingCredits json.RawMessage `json:"starting_credits"`
		}
		if err := json.Unmarshal(config, &option); err != nil {
			return Info{}, fail("invalid_config", "Match configuration is malformed: "+err.Error(), true)
		}
		if bytes.Equal(bytes.TrimSpace(option.StartingCredits), []byte("null")) {
			return Info{}, fail("invalid_config", "Starting credits must be a whole-credit amount, not null.", true)
		}
	}
	startingCredits := int64(0)
	if cfg.StartingCredits != nil {
		if cfg.Mission != nil || cfg.TutorialFaction != "" || cfg.Ruleset == "practice-v1" {
			return Info{}, fail("invalid_config", "Starting credits cannot override mission, tutorial, or practice budgets.", true)
		}
		whole := *cfg.StartingCredits
		if whole < 1 || whole > sim.MaxStartingCredits/sim.Scale {
			return Info{}, fail("invalid_config", "Starting credits must be a whole amount from 1 to 1000000.", true)
		}
		if whole != sim.DefaultStartingCredits/sim.Scale {
			if cfg.Ruleset != "custom-v1" {
				return Info{}, fail("invalid_config", "Custom starting credits require custom-v1.", true)
			}
			startingCredits = whole * sim.Scale
		}
	}
	if cfg.Mission == nil && cfg.TutorialFaction == "" && cfg.Ruleset == "custom-v1" && startingCredits == 0 {
		cfg.Ruleset = "standard-v2"
	}
	var e *sim.Engine
	var err error
	if cfg.Mission != nil {
		if len(cfg.Players) != 0 {
			return Info{}, fail("invalid_config", "A mission defines its own player slots.", true)
		}
		if cfg.Difficulty == "" {
			cfg.Difficulty = "normal"
		}
		selected, selectionErr := cfg.Mission.ForTutorialFaction(s.catalog, cfg.Map, cfg.TutorialFaction)
		if selectionErr != nil {
			return Info{}, fail("invalid_config", selectionErr.Error(), true)
		}
		cfg.Mission = &selected
		if cfg.Ruleset == "practice-v1" {
			e, err = sim.NewPracticeMission(s.catalog, cfg.Map, *cfg.Mission, cfg.Difficulty, cfg.Seed)
		} else {
			e, err = sim.NewMission(s.catalog, cfg.Map, *cfg.Mission, cfg.Difficulty, cfg.Seed)
		}
	} else {
		if cfg.TutorialFaction != "" {
			return Info{}, fail("invalid_config", "Tutorial faction selection requires a tutorial.", true)
		}
		e, err = sim.New(s.catalog, sim.Config{Map: cfg.Map, Players: cfg.Players, Seed: cfg.Seed, Ruleset: cfg.Ruleset, StartingCredits: startingCredits})
	}
	if err != nil {
		return Info{}, fail("invalid_config", err.Error(), true)
	}
	local := []sim.PlayerID{}
	for _, p := range e.StateCopy().Players {
		if p.Controller == "human" {
			local = append(local, p.ID)
		}
	}
	if len(local) == 0 {
		return Info{}, fail("invalid_config", "An offline match needs at least one local player.", true)
	}
	if err := s.installLive(e, local); err != nil {
		return Info{}, err
	}
	if cfg.SkipCountdown {
		for s.countdownRemaining() {
			if err := s.advance(); err != nil {
				return Info{}, err
			}
		}
	}
	return s.Info(), nil
}

func (s *Session) countdownRemaining() bool {
	v, _ := s.engine.PlayerView(s.local[0])
	return v.Countdown > 0
}

func (s *Session) install(e *sim.Engine, local []sim.PlayerID) {
	s.engine = e
	s.recorder, s.replay, s.playback, s.replayBytes = nil, nil, nil, nil
	s.replayStart = 0
	s.local = local
	s.pending = map[sim.PlayerID]*pendingFrame{}
	for _, id := range local {
		s.pending[id] = &pendingFrame{}
	}
}

func (s *Session) Info() Info {
	if s.engine == nil {
		return Info{Adapter: AdapterVersion, Local: []sim.PlayerID{}}
	}
	info := Info{Adapter: AdapterVersion, Metadata: s.engine.Metadata(), Tick: s.engine.Tick(), Local: append([]sim.PlayerID(nil), s.local...), Finished: s.engine.Outcome().Finished}
	if milli, eligible := s.engine.StartingCredits(); eligible {
		whole := milli / sim.Scale
		info.StartingCredits = &whole
	}
	if s.playback != nil {
		info.Replay = true
		info.ReplayStart = s.replayStart
		info.ReplayEnd = s.replay.FinalTick
		info.Finished = s.playback.Finished()
		info.ReplayLobby = s.replay.LobbyInfo()
	}
	return info
}

func (s *Session) isLocal(id sim.PlayerID) bool {
	for _, p := range s.local {
		if p == id {
			return true
		}
	}
	return false
}

// Submit decodes a binary protobuf OrderBatch, the same message the online
// transport sends, and schedules it for the next tick.
func (s *Session) Submit(player sim.PlayerID, batch []byte) error {
	if err := s.active(); err != nil {
		return err
	}
	if s.playback != nil {
		return fail("replay_read_only", "Replay playback does not accept orders.", true)
	}
	if !s.isLocal(player) {
		return fail("unauthorized_player", "Orders are only accepted for local players.", true)
	}
	if len(batch) > maxOrderBatchLen {
		return fail("invalid_order", "Order batch is too large.", true)
	}
	msg := new(pb.OrderBatch)
	if err := proto.Unmarshal(batch, msg); err != nil {
		return fail("invalid_order", "Order batch is not a valid protobuf message.", true)
	}
	orders, err := decodeOrders(msg)
	if err != nil {
		return fail("invalid_order", err.Error(), true)
	}
	if err := s.engine.Submit(player, msg.Sequence, orders); err != nil {
		// Engine rejection codes are already stable identifiers.
		return fail(err.Error(), "The engine rejected the order batch.", true)
	}
	return nil
}

// Step advances n ticks and accumulates each local player's authorized events
// and results at their authoritative tick, mirroring the server match loop.
func (s *Session) Step(n int) (Info, error) {
	if err := s.active(); err != nil {
		return Info{}, err
	}
	if n < 1 || n > maxStepPerCall {
		return Info{}, fail("invalid_step", fmt.Sprintf("Step count must be between 1 and %d.", maxStepPerCall), true)
	}
	for i := 0; i < n && !s.Info().Finished; i++ {
		if err := s.advance(); err != nil {
			return Info{}, err
		}
	}
	return s.Info(), nil
}

func (s *Session) advance() error {
	if s.playback != nil {
		if err := s.playback.Advance(); err != nil {
			return fail("replay_invalid", err.Error(), true)
		}
	} else {
		s.engine.Advance()
		if s.engine.Tick()%sim.Tick(30*sim.TickRate) == 0 || s.engine.Outcome().Finished {
			if err := s.recorder.Capture(s.engine, s.engine.Tick()%sim.Tick(30*sim.TickRate) == 0); err != nil {
				return fail("replay_recording_failed", err.Error(), false)
			}
		}
	}
	for _, id := range s.local {
		feedback, ok := s.engine.PlayerFeedback(id)
		if !ok {
			continue
		}
		f := s.pending[id]
		f.events = append(f.events, feedback.Events...)
		f.results = append(f.results, feedback.Results...)
	}
	return nil
}

// View returns a binary protobuf PlayerSnapshot for an authorized local
// player, draining the events and results accumulated since the last view.
func (s *Session) View(player sim.PlayerID) ([]byte, error) {
	if err := s.active(); err != nil {
		return nil, err
	}
	if !s.isLocal(player) {
		return nil, fail("unauthorized_view", "Views are only available for local players.", true)
	}
	v, ok := s.engine.PlayerView(player)
	if !ok {
		return nil, fail("unauthorized_view", "Unknown player.", true)
	}
	f := s.pending[player]
	v.Events, v.Results = f.events, f.results
	f.known = make([]sim.ID, len(v.Entities))
	for i, entity := range v.Entities {
		f.known[i] = entity.ID
	}
	f.events, f.results = nil, nil
	snap, err := snapshot(v)
	if err != nil {
		return nil, fail("internal", "View conversion failed: "+err.Error(), false)
	}
	return proto.Marshal(snap)
}

func (s *Session) Hash() (string, error) {
	if err := s.active(); err != nil {
		return "", err
	}
	return s.engine.Hash(), nil
}

// SaveResult carries the engine's own checksummed save bytes plus summary data
// for browser storage. The bytes are the exact engine envelope.
type SaveResult struct {
	Data     []byte         `json:"-"`
	Tick     sim.Tick       `json:"tick"`
	Hash     string         `json:"hash"`
	Metadata sim.Metadata   `json:"metadata"`
	Local    []sim.PlayerID `json:"local_players"`
}

func (s *Session) Save() (SaveResult, error) {
	if err := s.active(); err != nil {
		return SaveResult{}, err
	}
	if s.playback != nil {
		return SaveResult{}, fail("replay_read_only", "Export this replay to preserve it; replay playback cannot become a rewarded saved game.", true)
	}
	b, err := s.engine.Save()
	if err != nil {
		return SaveResult{}, fail("internal", "Engine save failed: "+err.Error(), false)
	}
	return SaveResult{Data: b, Tick: s.engine.Tick(), Hash: s.engine.Hash(), Metadata: s.engine.Metadata(), Local: append([]sim.PlayerID(nil), s.local...)}, nil
}

type saveEnvelope struct {
	Version uint32          `json:"version"`
	SHA256  string          `json:"sha256"`
	State   json.RawMessage `json:"state"`
}

// inspectEnvelope classifies version/checksum errors before rules validation.
func (s *Session) inspectEnvelope(data []byte) (sim.Metadata, sim.Tick, error) {
	if len(data) > maxSaveBytes {
		return sim.Metadata{}, 0, fail("save_corrupt", "Save exceeds 64 MiB.", true)
	}
	var env saveEnvelope
	if err := json.Unmarshal(data, &env); err != nil || len(env.State) == 0 {
		return sim.Metadata{}, 0, fail("save_corrupt", "Save file is not a readable engine save.", true)
	}
	if env.Version != 1 {
		return sim.Metadata{}, 0, &Error{Code: "save_incompatible", Message: fmt.Sprintf("Engine save format %d is not supported by this build; the file is preserved for export.", env.Version), Recoverable: true}
	}
	sum := sha256.Sum256(env.State)
	if env.SHA256 != hex.EncodeToString(sum[:]) {
		return sim.Metadata{}, 0, fail("save_corrupt", "Save checksum does not match; the file is preserved for export.", true)
	}
	var head struct {
		Metadata sim.Metadata `json:"metadata"`
		Tick     sim.Tick     `json:"tick"`
	}
	if err := json.Unmarshal(env.State, &head); err != nil {
		return sim.Metadata{}, 0, fail("save_corrupt", "Save state header is unreadable.", true)
	}
	want := s.ExpectedMetadata()
	if head.Metadata.Simulation != want.Simulation || head.Metadata.Protocol != want.Protocol || head.Metadata.ContentHash != want.ContentHash {
		found := head.Metadata
		return head.Metadata, head.Tick, &Error{Code: "save_incompatible", Message: "Save was made with a different simulation or content version; the file is preserved for export.", Recoverable: true, Found: &found, Expected: &want}
	}
	return head.Metadata, head.Tick, nil
}

// Inspect validates an imported save completely without replacing live state.
func (s *Session) Inspect(data []byte) (sim.Metadata, sim.Tick, error) {
	metadata, tick, err := s.inspectEnvelope(data)
	if err != nil {
		return metadata, tick, err
	}
	if _, err := sim.Restore(s.catalog, data); err != nil {
		return metadata, tick, fail("save_invalid", "Save failed engine validation: "+err.Error(), true)
	}
	return metadata, tick, nil
}

// Load replaces the active match with a restored save. On any failure the
// previous match stays active and untouched.
func (s *Session) Load(data []byte, local []sim.PlayerID) (Info, error) {
	if _, _, err := s.inspectEnvelope(data); err != nil {
		return Info{}, err
	}
	e, err := sim.Restore(s.catalog, data)
	if err != nil {
		return Info{}, fail("save_invalid", "Save failed engine validation: "+err.Error(), true)
	}
	if len(local) == 0 {
		return Info{}, fail("save_invalid", "Restoring requires the local player list recorded with the save.", true)
	}
	if len(local) > 4 {
		return Info{}, fail("save_invalid", "Too many local players.", true)
	}
	humans := map[sim.PlayerID]bool{}
	for _, p := range e.StateCopy().Players {
		if p.Controller == "human" {
			humans[p.ID] = true
		}
	}
	seen := map[sim.PlayerID]bool{}
	for _, id := range local {
		if !humans[id] || seen[id] {
			return Info{}, fail("save_invalid", "Local players must be unique human slots in the saved match.", true)
		}
		seen[id] = true
	}
	if err := s.installLive(e, append([]sim.PlayerID(nil), local...)); err != nil {
		return Info{}, err
	}
	return s.Info(), nil
}

func (s *Session) Dispose() {
	s.engine = nil
	s.recorder, s.replay, s.playback, s.replayBytes = nil, nil, nil, nil
	s.local = nil
	s.pending = nil
}

// snapshot and decodeOrders follow the conversion used by internal/server so
// offline and online views are byte-compatible protobuf messages.
func snapshot(view sim.View) (*pb.PlayerSnapshot, error) {
	return viewproto.Snapshot(view), nil
}

func decodeOrders(batch *pb.OrderBatch) ([]sim.Order, error) {
	b, err := protojson.Marshal(batch)
	if err != nil {
		return nil, err
	}
	var v struct {
		Orders []sim.Order `json:"orders"`
	}
	if err = json.Unmarshal(b, &v); err != nil {
		return nil, err
	}
	return v.Orders, nil
}

func (s *Session) Map() (content.Map, error) {
	if err := s.active(); err != nil {
		return content.Map{}, err
	}
	return s.engine.MapBlueprint(), nil
}

func (s *Session) Restart() (Info, error) {
	if err := s.active(); err != nil {
		return Info{}, err
	}
	if s.playback != nil {
		return Info{}, fail("replay_read_only", "Seek to the replay start instead of restarting it as a game.", true)
	}
	e, err := s.engine.Restart()
	if err != nil {
		return Info{}, fail("restart_failed", err.Error(), true)
	}
	if err := s.installLive(e, append([]sim.PlayerID(nil), s.local...)); err != nil {
		return Info{}, err
	}
	return s.Info(), nil
}
