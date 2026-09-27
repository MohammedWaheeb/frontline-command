package server

import (
	"context"
	"encoding/json"
	"errors"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"github.com/coder/websocket"
	"github.com/gofrs/flock"
	"google.golang.org/protobuf/proto"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type Config struct {
	RankedMapsFile string
	MissionDir     string
	DataDir        string
	StaticDir      string
	MapDir         string
	AllowedOrigins []string
}
type LobbySlot struct {
	Color       uint32       `json:"color"`
	Script      bool         `json:"script,omitempty"`
	Player      sim.PlayerID `json:"player"`
	Profile     string       `json:"profile,omitempty"`
	Name        string       `json:"name"`
	Faction     string       `json:"faction"`
	Team        uint32       `json:"team"`
	AI          string       `json:"ai,omitempty"`
	Ready       bool         `json:"ready"`
	AssetsReady bool         `json:"assets_ready"`
}
type Lobby struct {
	Revision       uint64                  `json:"revision"`
	ScenarioRules  *LobbyScenarioRules     `json:"scenario_rules,omitempty"`
	MapHash        string                  `json:"map_hash"`
	MapVersion     string                  `json:"map_version"`
	Rules          *LobbyRules             `json:"rules,omitempty"`
	PauseEnabled   bool                    `json:"pause_enabled"`
	ResumeColors   map[sim.PlayerID]uint32 `json:"-"`
	ResumeSave     string                  `json:"-"`
	ResumeOwner    string                  `json:"-"`
	ResumeRevision int64                   `json:"-"`
	ResumeTick     uint32                  `json:"resume_tick,omitempty"`
	ScenarioID     string                  `json:"scenario_id,omitempty"`
	Difficulty     string                  `json:"difficulty,omitempty"`
	Rated          bool                    `json:"rated"`
	LiveObservers  bool                    `json:"live_observers"`
	ID             string                  `json:"id"`
	Name           string                  `json:"name"`
	Host           string                  `json:"host"`
	MapID          string                  `json:"map_id"`
	Mode           string                  `json:"mode"`
	Private        bool                    `json:"private"`
	Code           string                  `json:"-"`
	Slots          []LobbySlot             `json:"slots"`
	MatchID        string                  `json:"match_id,omitempty"`
	PreviousMatch  string                  `json:"previous_match_id,omitempty"`
	Created        int64                   `json:"created"`
}
type Server struct {
	moderatorHash [32]byte
	rankedMaps    map[string]string
	invites       map[string]*LobbyInvite
	adviceWorkers adviceWorkGate
	missions      map[string]content.Mission
	queue         map[string]*queueEntry
	dataLock      *flock.Flock
	admission     admissionControl
	cfg           Config
	catalog       *content.Catalog
	repo          *storage.SQLite
	objects       storage.Files
	mux           *http.ServeMux
	mu            sync.Mutex
	maps          map[string]content.Map
	lobbies       map[string]*Lobby
	matches       map[string]*liveMatch
}

func New(cfg Config) (*Server, error) {
	if cfg.DataDir == "" {
		cfg.DataDir = ".local"
	}
	if cfg.MapDir == "" {
		cfg.MapDir = "content/maps"
	}
	if cfg.MissionDir == "" {
		cfg.MissionDir = "content/missions"
	}
	if err := os.MkdirAll(cfg.DataDir, 0700); err != nil {
		return nil, err
	}
	lock := flock.New(filepath.Join(cfg.DataDir, "host.lock"))
	locked, err := lock.TryLock()
	if err != nil {
		return nil, err
	}
	if !locked {
		return nil, errors.New("another Frontline host already uses this data directory")
	}
	success := false
	defer func() {
		if !success {
			lock.Unlock()
		}
	}()
	c, err := content.Base()
	if err != nil {
		return nil, err
	}
	repo, err := storage.Open(filepath.Join(cfg.DataDir, "frontline.db"))
	if err != nil {
		return nil, err
	}
	s := &Server{dataLock: lock, cfg: cfg, catalog: c, repo: repo, objects: storage.Files{Root: filepath.Join(cfg.DataDir, "objects")}, mux: http.NewServeMux(), maps: map[string]content.Map{}, lobbies: map[string]*Lobby{}, matches: map[string]*liveMatch{}}
	err = filepath.WalkDir(cfg.MapDir, func(path string, d fs.DirEntry, err error) error {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if d.IsDir() || filepath.Ext(path) != ".json" {
			return nil
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		m, err := content.DecodeMap(b)
		if err != nil {
			return err
		}
		if _, exists := s.maps[m.ID]; exists {
			return errors.New("duplicate installed map ID")
		}
		s.maps[m.ID] = m
		return nil
	})
	if err != nil {
		repo.Close()
		return nil, err
	}
	if _, err = repo.RecoverInterrupted(context.Background(), s.objects); err != nil {
		repo.Close()
		return nil, err
	}
	if err = s.loadRankedMaps(); err != nil {
		repo.Close()
		return nil, err
	}
	if err = s.loadMissions(); err != nil {
		repo.Close()
		return nil, err
	}
	if err = s.initModeratorCredential(); err != nil {
		repo.Close()
		return nil, err
	}
	s.routes()
	success = true
	return s, nil
}
func (s *Server) Close() error {
	s.mu.Lock()
	matches := make([]*liveMatch, 0, len(s.matches))
	for _, m := range s.matches {
		matches = append(matches, m)
	}
	s.mu.Unlock()
	for _, m := range matches {
		m.close()
	}
	return errors.Join(s.repo.Close(), s.dataLock.Unlock())
}
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "same-origin")
	w.Header().Set("Cache-Control", "no-store")
	if origin := r.Header.Get("Origin"); origin != "" {
		if !s.allowedOrigin(r, origin) {
			fail(w, http.StatusForbidden, "origin_not_allowed", "This server accepts same-origin clients only.")
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
	}
	if r.Method == "OPTIONS" {
		w.WriteHeader(204)
		return
	}
	if !s.admission.allow(r, time.Now()) {
		w.Header().Set("Retry-After", "60")
		fail(w, 429, "request_rate_exceeded", "Too many requests. Retry after one minute.")
		return
	}
	s.mux.ServeHTTP(w, r)
}
func (s *Server) allowedOrigin(r *http.Request, origin string) bool {
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if u.Host == r.Host && (u.Scheme == "http" || u.Scheme == "https") {
		return true
	}
	for _, allowed := range s.cfg.AllowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}
func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, code, message string) {
	respond(w, status, map[string]string{"code": code, "message": message})
}
func decode(w http.ResponseWriter, r *http.Request, v any, limit int64) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		fail(w, 400, "invalid_request", err.Error())
		return false
	}
	if d.Decode(new(any)) != io.EOF {
		fail(w, 400, "invalid_request", "Only one JSON document is allowed.")
		return false
	}
	return true
}
func (s *Server) authenticate(w http.ResponseWriter, r *http.Request) (storage.Profile, bool) {
	token, bearer := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !bearer {
		fail(w, 401, "authentication_required", "Use a profile bearer credential.")
		return storage.Profile{}, false
	}
	p, err := s.repo.Authenticate(r.Context(), token)
	if err != nil {
		fail(w, 401, "authentication_required", "Create or restore a local profile to continue.")
		return p, false
	}
	return p, true
}
func (s *Server) routes() {
	s.socialRoutes()
	s.moderationRoutes()
	s.lobbyServiceRoutes()
	s.mux.HandleFunc("GET /api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		respond(w, 200, map[string]any{"status": "ok", "simulation": sim.Version, "protocol": 1, "content_hash": s.catalog.Hash(), "tick_rate": 20, "local": true})
	})
	s.mux.HandleFunc("GET /api/v1/content", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(s.catalog.PresentationJSON())
	})
	s.mux.HandleFunc("POST /api/v1/profiles", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Name string `json:"name"`
		}
		if !decode(w, r, &body, 4096) {
			return
		}
		p, token, err := s.repo.CreateProfile(r.Context(), body.Name)
		if err != nil {
			fail(w, 400, "invalid_profile", err.Error())
			return
		}
		respond(w, 201, map[string]any{"profile": p, "token": token})
	})
	s.mux.HandleFunc("GET /api/v1/profiles/me", func(w http.ResponseWriter, r *http.Request) {
		if p, ok := s.authenticate(w, r); ok {
			respond(w, 200, p)
		}
	})
	s.mux.HandleFunc("GET /api/v1/maps", s.listMaps)
	s.mux.HandleFunc("GET /api/v1/missions", s.listMissions)
	s.mux.HandleFunc("GET /api/v1/missions/{id}", s.getMission)
	s.mux.HandleFunc("POST /api/v1/missions/{id}/lobby", s.createScenarioLobby)
	s.mux.HandleFunc("POST /api/v1/matchmaking", s.joinQueue)
	s.mux.HandleFunc("GET /api/v1/matchmaking", s.readQueue)
	s.mux.HandleFunc("DELETE /api/v1/matchmaking", s.leaveQueue)
	s.mux.HandleFunc("GET /api/v1/ratings/me", s.myRating)
	s.mux.HandleFunc("GET /api/v1/ratings", s.leaderboard)
	s.mux.HandleFunc("GET /api/v1/maps/{id}", s.getMap)
	s.mux.HandleFunc("POST /api/v1/maps", s.putMap)
	s.mux.HandleFunc("GET /api/v1/lobbies", s.listLobbies)
	s.mux.HandleFunc("POST /api/v1/lobbies", s.createLobby)
	s.mux.HandleFunc("GET /api/v1/lobbies/{id}", s.getLobby)
	s.mux.HandleFunc("POST /api/v1/lobbies/{id}/join", s.joinLobby)
	s.mux.HandleFunc("DELETE /api/v1/lobbies/{id}/membership", s.leaveLobby)
	s.mux.HandleFunc("GET /api/v1/replays/{id}", s.getReplay)
	s.mux.HandleFunc("PATCH /api/v1/lobbies/{id}", s.updateLobby)
	s.mux.HandleFunc("POST /api/v1/lobbies/{id}/ready", s.readyLobby)
	s.mux.HandleFunc("POST /api/v1/lobbies/{id}/start", s.startLobby)
	s.mux.HandleFunc("POST /api/v1/lobbies/{id}/rematch", s.rematchLobby)
	s.mux.HandleFunc("GET /api/v1/matches/{id}/socket", s.matchSocket)
	s.mux.HandleFunc("POST /api/v1/matches/{id}/advice", s.commandAdvice)
	s.mux.HandleFunc("POST /api/v1/matches/{id}/observer", s.createObserver)
	s.mux.HandleFunc("GET /api/v1/matches/{id}/observer", s.readObserver)
	s.mux.HandleFunc("GET /api/v1/saves", s.listSaves)
	s.mux.HandleFunc("GET /api/v1/saves/{id}", s.getSave)
	s.mux.HandleFunc("GET /api/v1/saves/{id}/download", s.downloadSave)
	s.mux.HandleFunc("POST /api/v1/saves/{id}/coop-lobby", s.resumeScenarioLobby)
	s.mux.HandleFunc("PUT /api/v1/saves/{id}", s.putSave)
	s.mux.HandleFunc("DELETE /api/v1/saves/{id}", s.deleteSave)
	if s.cfg.StaticDir != "" {
		s.mux.Handle("GET /", http.FileServer(http.Dir(s.cfg.StaticDir)))
	}
}
func (s *Server) loadMap(ctx context.Context, id string) (content.Map, error) {
	s.mu.Lock()
	m, ok := s.maps[id]
	s.mu.Unlock()
	if ok {
		return m, nil
	}
	v, err := s.repo.GetMap(ctx, id)
	if err != nil {
		return content.Map{}, err
	}
	return content.DecodeMap(v.Data)
}
func (s *Server) listMaps(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	maps := []map[string]any{}
	for _, m := range s.maps {
		maps = append(maps, map[string]any{"id": m.ID, "title": m.Title, "author": m.Author, "version": m.Version, "width": m.Width, "height": m.Height, "players": len(m.Spawns), "installed": true, "hash": lobbyMapHash(m), "ranked": s.rankedMap(m.ID)})
	}
	s.mu.Unlock()
	custom, err := s.repo.ListMaps(r.Context())
	if err != nil {
		fail(w, 500, "storage_error", "Could not load maps.")
		return
	}
	for _, m := range custom {
		maps = append(maps, map[string]any{"id": m.ID, "title": m.Title, "revision": m.Revision, "installed": false, "ranked": false})
	}
	sort.Slice(maps, func(i, j int) bool { return maps[i]["id"].(string) < maps[j]["id"].(string) })
	respond(w, 200, maps)
}
func (s *Server) getMap(w http.ResponseWriter, r *http.Request) {
	m, err := s.loadMap(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, 404, "map_missing", "The requested map is unavailable.")
		return
	}
	respond(w, 200, m)
}
func (s *Server) putMap(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Map              json.RawMessage `json:"map"`
		ExpectedRevision int64           `json:"expected_revision"`
	}
	if !decode(w, r, &body, 17<<20) {
		return
	}
	m, err := content.DecodeMap(body.Map)
	if err != nil {
		fail(w, 400, "invalid_map", err.Error())
		return
	}
	s.mu.Lock()
	_, installed := s.maps[m.ID]
	s.mu.Unlock()
	if installed {
		fail(w, 409, "installed_map", "Save an edited map under a new ID.")
		return
	}
	record, err := s.repo.PutMap(r.Context(), storage.MapRecord{ID: m.ID, Owner: p.ID, Title: m.Title, Data: body.Map}, body.ExpectedRevision)
	if err != nil {
		fail(w, 409, "map_conflict", err.Error())
		return
	}
	respond(w, 201, record)
}
func (s *Server) matchSocket(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	m := s.matches[r.PathValue("id")]
	s.mu.Unlock()
	if m == nil {
		fail(w, 404, "match_missing", "This match is no longer available.")
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	defer conn.Close(websocket.StatusNormalClosure, "connection closed")
	conn.SetReadLimit(64 << 10)
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	helloCtx, stop := context.WithTimeout(ctx, 10*time.Second)
	typ, frame, err := conn.Read(helloCtx)
	stop()
	if err != nil || typ != websocket.MessageBinary {
		return
	}
	env := new(pb.Envelope)
	if err = proto.Unmarshal(frame, env); err != nil {
		return
	}
	hello := env.GetHello()
	if resume := env.GetResume(); resume != nil {
		hello = resume.Hello
	}
	if hello == nil || hello.Protocol != 1 || hello.Simulation != sim.Version || hello.ContentHash != s.catalog.Hash() || hello.MatchId != m.id {
		data, _ := proto.Marshal(&pb.Envelope{Message: &pb.Envelope_Error{Error: &pb.ProtocolError{Code: "incompatible_version", Message: "Reload matching game content before joining."}}})
		_ = conn.Write(ctx, websocket.MessageBinary, data)
		return
	}
	slot, ok := m.slotForToken(hello.Token)
	if !ok {
		conn.Close(websocket.StatusPolicyViolation, "invalid match token")
		return
	}
	p := &peer{player: slot.Player, out: make(chan []byte, 32), done: make(chan struct{})}
	reply := m.call(ctx, matchRequest{kind: "connect", player: slot.Player, peer: p})
	if reply.err != nil {
		data, _ := proto.Marshal(&pb.Envelope{Message: &pb.Envelope_Error{Error: &pb.ProtocolError{Code: reply.err.Error(), Message: "Reconnect is unavailable; an eliminated player may join the delayed observer feed."}}})
		_ = conn.Write(ctx, websocket.MessageBinary, data)
		return
	}
	defer func() {
		dctx, dcancel := context.WithTimeout(context.Background(), time.Second)
		defer dcancel()
		m.call(dctx, matchRequest{kind: "disconnect", player: slot.Player, peer: p})
	}()
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		for {
			select {
			case data := <-p.out:
				wctx, wcancel := context.WithTimeout(ctx, 5*time.Second)
				err := conn.Write(wctx, websocket.MessageBinary, data)
				wcancel()
				if err != nil {
					cancel()
					return
				}
			case <-p.done:
				cancel()
				return
			case <-ctx.Done():
				return
			}
		}
	}()
	defer func() { cancel(); <-writerDone }()
	for {
		kind, b, err := conn.Read(ctx)
		if err != nil {
			return
		}
		if kind != websocket.MessageBinary {
			conn.Close(websocket.StatusUnsupportedData, "binary protocol required")
			return
		}
		incoming := new(pb.Envelope)
		if err = proto.Unmarshal(b, incoming); err != nil {
			conn.Close(websocket.StatusInvalidFramePayloadData, "invalid protocol frame")
			return
		}
		if ping := incoming.GetPing(); ping != nil {
			data, _ := proto.Marshal(incoming)
			select {
			case p.out <- data:
			default:
				return
			}
			continue
		}
		if control := incoming.GetControl(); control != nil {
			reply = m.call(ctx, matchRequest{kind: "control", peer: p, player: p.player, control: control.Action})
			if reply.err != nil {
				data, _ := proto.Marshal(&pb.Envelope{Message: &pb.Envelope_Error{Error: &pb.ProtocolError{Code: reply.err.Error(), Message: "Shared pause is unavailable. Every active player must agree, and ranked play cannot pause.", Recoverable: true}}})
				select {
				case p.out <- data:
				default:
					return
				}
			}
			continue
		}
		batch := incoming.GetOrders()
		if batch == nil {
			conn.Close(websocket.StatusPolicyViolation, "unexpected message")
			return
		}
		orders, err := decodeOrders(batch)
		if err == nil {
			reply = m.call(ctx, matchRequest{kind: "orders", peer: p, player: p.player, sequence: batch.Sequence, orders: orders})
			err = reply.err
		}
		if err != nil {
			data, _ := proto.Marshal(&pb.Envelope{Message: &pb.Envelope_OrderResult{OrderResult: &pb.OrderResult{Player: uint32(p.player), Sequence: batch.Sequence, Accepted: false, Code: err.Error()}}})
			select {
			case p.out <- data:
			default:
				return
			}
		}
	}
}
