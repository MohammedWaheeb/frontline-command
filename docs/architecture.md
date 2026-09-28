# Architecture

## Ownership and layout

- `pkg/content`: versioned rules catalog and validation. Codex.
- `pkg/sim`: pure deterministic Go engine, snapshots and player views. Codex.
- `protocol`: shared protobuf schema and generated Go messages. Codex.
- `internal/storage`: SQLite repositories and atomic file objects. Codex.
- `internal/server`, `cmd/frontline`: local HTTP/WebSocket authority. Codex.
- `client/src/runtime`, nonvisual frontend logic/tests and `cmd/wasm`: Codex,
  following the user's explicit ownership expansion on 2026-09-27.
- UI, styling, renderer, `assets`, `content/maps`, `content/missions` and visual
  export pipelines: Claude Code CLI exact `claude-opus-5-5` is the primary
  author/reviewer. The user's quota fallback authorizes Codex implementation
  while Claude is unavailable, with explicit nonoverlapping file reservations.
- `work/claude`: bounded assignments and execution evidence.
- `docs`, `outputs`: Markdown contracts, acceptance and release documents.

## Determinism

Twenty ticks represent one second. World coordinates use integer millitiles;
HP, credits and energy use integer milliunits. Timers use explicit-width ticks.
State collections remain sorted by monotonic IDs. Lookup maps never determine
execution order. Seeded PRNG state is serialized. No wall clock enters rules.

Orders are validated and executed on assigned ticks, ordered by tick, player,
sequence, then order position. Each tick resolves intent and damage before
simultaneous elimination. Saves contain all authoritative state and compatibility
metadata. State hash uses canonical JSON over ordered state, SHA-256.

## Service isolation

Each live match has one owner loop. HTTP and sockets enqueue requests; they never
mutate the simulation concurrently. Persistence receives tick-boundary copies.
Player views filter fog before serialization and omit enemy private state.

The native engine is shared through the Go WASM worker adapter. Browser code
does not reimplement combat. The WASM compiler/runtime versions must match.

## Release gates

Stage gates and full scope remain those in the approved handoff. Deployment
planning is separate from local execution. A future PostgreSQL/object-store
adapter must pass the same repository contract tests as SQLite/local files.

## Process and outage recovery

A host acquires an exclusive data-directory file lock before opening service
state. The pinned [gofrs/flock library](https://github.com/gofrs/flock) provides
OS-managed locking on supported native platforms; a process exit releases it.
A second host cannot recover or modify the first host's live matches.

Accepted matches write an initial durable checkpoint before the lobby returns a
connection token. Later checkpoints go to a bounded background SQLite writer.
Startup converts interrupted journals into idempotent void results and exports
available checkpoints as diagnostics. It never resumes an old competitive tick.
Replay object persistence precedes the completed result transaction.

Observers read separately issued, read-only tickets. Their binary snapshots are
stored only after perspective fog filtering, compressed, and delayed 2,400 ticks.
The buffer drains after the final simulation tick. Active participants cannot
request observer tickets; defeated participants leave the live feed. Private
lobbies may declare live observation before ready-up.
