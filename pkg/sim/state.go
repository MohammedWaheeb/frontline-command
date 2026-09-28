// Package sim implements the rendering-independent authoritative 20 Hz game.
package sim

import "frontlinecommand/pkg/content"

const Version = "0.2.0"
const TickRate uint32 = 20
const Scale int64 = 1000

type ID uint32
type PlayerID uint32
type Tick uint32
type Vec = content.Point
type Metadata struct {
	Simulation  string `json:"simulation"`
	Protocol    uint32 `json:"protocol"`
	ContentHash string `json:"content_hash"`
	MapVersion  string `json:"map_version"`
	Ruleset     string `json:"ruleset"`
	Seed        uint64 `json:"seed"`
}
type PlayerConfig struct {
	Controller string   `json:"controller,omitempty"`
	ID         PlayerID `json:"id"`
	Name       string   `json:"name"`
	Faction    string   `json:"faction"`
	Team       uint32   `json:"team"`
	Color      uint32   `json:"color"`
	AI         string   `json:"ai,omitempty"`
}
type Config struct {
	Map     content.Map    `json:"map"`
	Players []PlayerConfig `json:"players"`
	Seed    uint64         `json:"seed"`
	Ruleset string         `json:"ruleset"`
}
type Cooldown struct {
	ID    string `json:"id"`
	Until Tick   `json:"until"`
}
type Memory struct {
	FootprintWidth  int32    `json:"footprint_width"`
	FootprintHeight int32    `json:"footprint_height"`
	FootprintType   string   `json:"footprint_type"`
	ID              ID       `json:"id"`
	Type            string   `json:"type"`
	Owner           PlayerID `json:"owner"`
	Position        Vec      `json:"position"`
	Seen            Tick     `json:"seen"`
}
type Player struct {
	SurrenderVote bool            `json:"surrender_vote"`
	AIKnowledge   []AIObservation `json:"ai_knowledge"`
	AIFields      []FieldView     `json:"ai_fields"`
	AIGoal        Vec             `json:"ai_goal"`
	AIIntent      string          `json:"ai_intent"`
	KnownRubble   []uint32        `json:"known_rubble"`
	CommandWindow Tick            `json:"command_window"`
	CommandCount  uint32          `json:"command_count"`
	PingWindow    Tick            `json:"ping_window"`
	PingCount     uint32          `json:"ping_count"`
	SalvageTotal  int64           `json:"salvage_total"`
	SalvageIncome []SalvageIncome `json:"salvage_income"`
	PlayerConfig
	Credits        int64      `json:"credits"`
	Energy         int64      `json:"energy"`
	Supply         int32      `json:"supply"`
	ReservedSupply int32      `json:"reserved_supply"`
	PowerCapacity  int32      `json:"power_capacity"`
	PowerDemand    int32      `json:"power_demand"`
	Tier           int32      `json:"tier"`
	Defeated       bool       `json:"defeated"`
	DefeatAt       Tick       `json:"defeat_at"`
	LastSequence   uint32     `json:"last_sequence"`
	Upgrades       []string   `json:"upgrades"`
	Cooldowns      []Cooldown `json:"cooldowns"`
	Explored       []bool     `json:"explored"`
	Memory         []Memory   `json:"memory"`
	RepairReserve  int64      `json:"repair_reserve"`
	Income         int64      `json:"income"`
	Spent          int64      `json:"spent"`
	Lost           int64      `json:"lost"`
	Kills          uint32     `json:"kills"`
	AIStage        uint32     `json:"ai_stage"`
	AILast         Tick       `json:"ai_last"`
	AIScout        uint32     `json:"ai_scout"`
}
type Order struct {
	Kind     string `json:"kind"`
	Entities []ID   `json:"entities,omitempty"`
	Target   ID     `json:"target,omitempty"`
	Position Vec    `json:"position"`
	Type     string `json:"type,omitempty"`
	Queued   bool   `json:"queued,omitempty"`
	Index    int32  `json:"index,omitempty"`
	Points   []Vec  `json:"points,omitempty"`
}
type Scheduled struct {
	Tick     Tick     `json:"tick"`
	Player   PlayerID `json:"player"`
	Sequence uint32   `json:"sequence"`
	Orders   []Order  `json:"orders"`
}
type OrderResult struct {
	Player   PlayerID `json:"player"`
	Sequence uint32   `json:"sequence"`
	Index    int32    `json:"index"`
	Accepted bool     `json:"accepted"`
	Code     string   `json:"code"`
	Tick     Tick     `json:"tick"`
}
type Job struct {
	Type      string `json:"type"`
	Research  bool   `json:"research"`
	Paid      int64  `json:"paid"`
	Work      uint32 `json:"work"`
	Required  uint32 `json:"required"`
	Supply    int32  `json:"supply"`
	Service   ID     `json:"service"`
	Started   bool   `json:"started"`
	Emergency bool   `json:"emergency,omitempty"`
}
type Contribution struct {
	Attacker ID       `json:"attacker"`
	Owner    PlayerID `json:"owner"`
	Damage   int64    `json:"damage"`
}
type Entity struct {
	FootprintWidth        int32          `json:"footprint_width"`
	FootprintHeight       int32          `json:"footprint_height"`
	FootprintType         string         `json:"footprint_type"`
	NextRouteAt           Tick           `json:"next_route_at"`
	MapObject             uint32         `json:"map_object,omitempty"`
	EmergencyTakeoffUntil Tick           `json:"emergency_takeoff_until"`
	SalvageEligible       bool           `json:"salvage_eligible"`
	TurretFacing          int32          `json:"turret_facing"`
	FlightPass            Vec            `json:"flight_pass"`
	PassUntil             Tick           `json:"pass_until"`
	Tag                   string         `json:"tag,omitempty"`
	ID                    ID             `json:"id"`
	Type                  string         `json:"type"`
	Owner                 PlayerID       `json:"owner"`
	Position              Vec            `json:"position"`
	HP                    int64          `json:"hp"`
	MaxHP                 int64          `json:"max_hp"`
	Paid                  int64          `json:"paid"`
	Building              bool           `json:"building"`
	Complete              bool           `json:"complete"`
	Enabled               bool           `json:"enabled"`
	DisabledUntil         Tick           `json:"disabled_until"`
	ResistanceUntil       Tick           `json:"resistance_until"`
	State                 string         `json:"state"`
	Facing                int32          `json:"facing"`
	LastPosition          Vec            `json:"last_position"`
	StationarySince       Tick           `json:"stationary_since"`
	LastDamage            Tick           `json:"last_damage"`
	LastDealt             Tick           `json:"last_dealt"`
	EverDamaged           bool           `json:"ever_damaged"`
	EverDealt             bool           `json:"ever_dealt"`
	Work                  uint32         `json:"work"`
	Builder               ID             `json:"builder"`
	Jobs                  []Job          `json:"jobs"`
	Rally                 Vec            `json:"rally"`
	Orders                []Order        `json:"orders"`
	Anchor                Vec            `json:"anchor"`
	Target                ID             `json:"target"`
	LastTarget            Vec            `json:"last_target"`
	Stance                string         `json:"stance"`
	Path                  []Vec          `json:"path"`
	PathGoal              Vec            `json:"path_goal"`
	PathEnd               Vec            `json:"path_end"`
	PathResolved          bool           `json:"path_resolved"`
	PathRevision          uint32         `json:"path_revision"`
	LastProgress          Tick           `json:"last_progress"`
	RouteFailures         uint32         `json:"route_failures"`
	Blocked               bool           `json:"blocked"`
	MoveRemainder         int32          `json:"move_remainder"`
	FireAt                Tick           `json:"fire_at"`
	AimUntil              Tick           `json:"aim_until"`
	VolleyLeft            int32          `json:"volley_left"`
	VolleyAt              Tick           `json:"volley_at"`
	Cargo                 int64          `json:"cargo"`
	Field                 uint32         `json:"field"`
	Depot                 ID             `json:"depot"`
	TaskUntil             Tick           `json:"task_until"`
	Home                  ID             `json:"home"`
	Ammo                  int32          `json:"ammo"`
	Endurance             uint32         `json:"endurance"`
	Landed                bool           `json:"landed"`
	RepeatSortie          bool           `json:"repeat_sortie"`
	ServiceWork           uint32         `json:"service_work"`
	Charges               int32          `json:"charges"`
	ChargeWork            uint32         `json:"charge_work"`
	Deployed              bool           `json:"deployed"`
	DeploymentStarted     Tick           `json:"deployment_started,omitempty"`
	DeployUntil           Tick           `json:"deploy_until"`
	PackingUntil          Tick           `json:"packing_until"`
	Cooldowns             []Cooldown     `json:"cooldowns"`
	Concealed             bool           `json:"concealed"`
	ConcealedSince        Tick           `json:"concealed_since"`
	RevealedUntil         Tick           `json:"revealed_until"`
	PublicRevealUntil     Tick           `json:"public_reveal_until"`
	Passengers            []ID           `json:"passengers"`
	Container             ID             `json:"container"`
	Channel               string         `json:"channel"`
	ChannelTarget         ID             `json:"channel_target"`
	ChannelDuration       Tick           `json:"channel_duration,omitempty"`
	ChannelUntil          Tick           `json:"channel_until"`
	ChannelStartDamage    Tick           `json:"channel_start_damage"`
	ChannelTargetDamage   Tick           `json:"channel_target_damage"`
	Experience            int64          `json:"experience"`
	Rank                  uint32         `json:"rank"`
	Contributions         []Contribution `json:"contributions"`
	AttributedDamage      int64          `json:"attributed_damage"`
	TemporaryUntil        Tick           `json:"temporary_until"`
	Buffs                 []Buff         `json:"buffs"`
	Created               Tick           `json:"created"`
	IncludedHauler        bool           `json:"included_hauler"`
}
type Buff struct {
	Kind   string `json:"kind"`
	Until  Tick   `json:"until"`
	Source ID     `json:"source"`
}
type ResourceField struct {
	ID        uint32 `json:"id"`
	Position  Vec    `json:"position"`
	Remaining int64  `json:"remaining"`
	Loader    ID     `json:"loader"`
	Queue     []ID   `json:"queue"`
}
type ObjectiveStation struct {
	ID              ID       `json:"id"`
	Position        Vec      `json:"position"`
	Owner           PlayerID `json:"owner"`
	IncomeRemainder uint32   `json:"income_remainder"`
}
type Projectile struct {
	ID            ID       `json:"id"`
	Owner         PlayerID `json:"owner"`
	Shooter       ID       `json:"shooter"`
	Target        ID       `json:"target"`
	Weapon        string   `json:"weapon"`
	Origin        Vec      `json:"origin"`
	Position      Vec      `json:"position"`
	Impact        Vec      `json:"impact"`
	ImpactAt      Tick     `json:"impact_at"`
	Damage        int64    `json:"damage"`
	Splash        int32    `json:"splash"`
	Interceptable bool     `json:"interceptable"`
	InterceptAt   Tick     `json:"intercept_at"`
	ReservedBy    ID       `json:"reserved_by"`
	Strategic     bool     `json:"strategic"`
}
type Event struct {
	ID       uint32   `json:"id"`
	Tick     Tick     `json:"tick"`
	Kind     string   `json:"kind"`
	Owner    PlayerID `json:"owner"`
	Entity   ID       `json:"entity,omitempty"`
	Position Vec      `json:"position"`
	Value    int64    `json:"value,omitempty"`
	Scope    string   `json:"scope"`
	Text     string   `json:"text,omitempty"`
}
type Outcome struct {
	Finished    bool   `json:"finished"`
	Draw        bool   `json:"draw"`
	WinningTeam uint32 `json:"winning_team"`
	Reason      string `json:"reason"`
	Tick        Tick   `json:"tick"`
}
type OriginalTile struct {
	Index int32        `json:"index"`
	Tile  content.Tile `json:"tile"`
}

type State struct {
	Telemetry          *MatchTelemetry     `json:"telemetry,omitempty"`
	SpawnPlayers       []PlayerID          `json:"spawn_players"`
	PracticeReveal     bool                `json:"practice_reveal"`
	MapOriginalTiles   []OriginalTile      `json:"map_original_tiles"`
	DestroyedObjects   []uint32            `json:"destroyed_objects"`
	LogBase            uint64              `json:"log_base"`
	LogOrders          uint32              `json:"log_orders"`
	Mission            *MissionState       `json:"mission,omitempty"`
	Metadata           Metadata            `json:"metadata"`
	Tick               Tick                `json:"tick"`
	Countdown          uint32              `json:"countdown"`
	Map                content.Map         `json:"map"`
	RNG                uint64              `json:"rng"`
	NextID             ID                  `json:"next_id"`
	NextEvent          uint32              `json:"next_event"`
	NavigationRevision uint32              `json:"navigation_revision"`
	Players            []*Player           `json:"players"`
	Entities           []*Entity           `json:"entities"`
	Fields             []*ResourceField    `json:"fields"`
	Stations           []*ObjectiveStation `json:"stations"`
	Projectiles        []*Projectile       `json:"projectiles"`
	Pending            []Scheduled         `json:"pending"`
	Log                []Scheduled         `json:"log"`
	Results            []OrderResult       `json:"results"`
	Events             []Event             `json:"events"`
	ShipmentAt         Tick                `json:"shipment_at"`
	Outcome            Outcome             `json:"outcome"`
	Zones              []Zone              `json:"zones"`
	Operations         []Operation         `json:"operations"`
	Salvage            []Salvage           `json:"salvage"`
}
type Zone struct {
	Kind     string   `json:"kind"`
	Owner    PlayerID `json:"owner"`
	Position Vec      `json:"position"`
	Radius   int32    `json:"radius"`
	Start    Tick     `json:"start"`
	Until    Tick     `json:"until"`
	Anchor   ID       `json:"anchor"`
}
type Operation struct {
	Kind           string   `json:"kind"`
	Owner          PlayerID `json:"owner"`
	At             Tick     `json:"at"`
	Source         ID       `json:"source"`
	Points         []Vec    `json:"points"`
	DamageAtStart  Tick     `json:"damage_at_start"`
	ReservedSupply int32    `json:"reserved_supply"`
}
type Salvage struct {
	Owner    PlayerID `json:"owner"`
	ID       ID       `json:"id"`
	Position Vec      `json:"position"`
	Value    int64    `json:"value"`
	Until    Tick     `json:"until"`
}
type SalvageIncome struct {
	Tick   Tick  `json:"tick"`
	Amount int64 `json:"amount"`
}
type Engine struct {
	buildingRules  map[string]content.Building
	dynamicNavTick Tick
	dynamicNav     map[int32][]ID
	state          State
	catalog        *content.Catalog
	visible        map[PlayerID][]bool
	spatial        map[int32][]*Entity
	damages        []damage
	pathBudget     uint32
	navRevision    uint32
	navCache       map[int32][]bool
	fogCache       map[ID]fogSource
	harvestParking map[uint32]harvestParkingCache

	navigationSearch navigationSearch
}
type fogSource struct {
	position Vec
	radius   int32
	air      bool
	revision uint32
	tiles    []int32
}
type damage struct {
	Target  ID
	Shooter ID
	Owner   PlayerID
	Amount  int64
	Kind    string
}

func seconds(v uint32) Tick { return Tick(v * TickRate) }
func abs(v int32) int32 {
	if v < 0 {
		return -v
	}
	return v
}
func dist2(a, b Vec) int64 {
	dx, dy := int64(a.X)-int64(b.X), int64(a.Y)-int64(b.Y)
	return dx*dx + dy*dy
}
func isqrt(n int64) int32 {
	if n <= 0 {
		return 0
	}
	x := n
	y := (x + 1) / 2
	for y < x {
		x = y
		y = (x + n/x) / 2
	}
	return int32(x)
}
func distance(a, b Vec) int32 { return isqrt(dist2(a, b)) }
func clamp(v, lo, hi int32) int32 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
func min64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}
func (p *Player) LowPower() bool { return p.PowerDemand > p.PowerCapacity }
func (p *Player) HasUpgrade(id string) bool {
	for _, v := range p.Upgrades {
		if v == id {
			return true
		}
	}
	return false
}
func (e *Entity) Active(now Tick) bool {
	return e.HP > 0 && e.Complete && e.Enabled && e.DisabledUntil <= now && e.Container == 0
}
