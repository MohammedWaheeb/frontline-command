# Authored maps and mission source

The base content source now contains eight launch maps, 24 additional campaign
layouts, five tutorials, 24 campaign missions, and two co-op scenarios. The fifth
tutorial has four explicitly authored faction variants inside its one mission
record. This inventory is authored and Go-valid; it is not a claim that every
mission has completed a playthrough or that the maps are competitively reviewed.

## Ownership and provenance

Claude Code, using `claude-opus-5-5`, authored the original `mapkit.mjs`,
`features.mjs`, and `missionkit.mjs` helper modules. After all active Claude jobs
ended at quota, the user explicitly authorized Codex to take over remaining
implementation. Codex authored `layouts.mjs`, `missions.mjs`, `build.mjs`, the
shipping map/mission/presentation records, and the audit helpers during that
coordinated takeover. Codex also updated helper attribution and added the
explicit tutorial-variant serialization field. No imported franchise artwork,
map, narrative, or dialogue is included. The commanders, organizations and
Aster Reach setting are fictional.

The original assignment is preserved in `work/claude/05-maps-and-missions.md`.
Its initial Claude-only attribution was superseded by the recorded user
authorization and root `AGENTS.md`; generated map and presentation attribution
identifies the actual authors instead of claiming Claude authored these layouts.

## Rebuild and verification

Run from the repository root:

```sh
node work/claude/05-authoring/build.mjs
node work/claude/05-authoring/check-index.mjs
make check-content
go run work/claude/05-authoring/check-runtime.go
go run work/claude/05-authoring/check-economy.go
```

The build rewrites its own generated files under `content/maps`,
`content/missions`, `content/presentation`, `content/index.json`, and
`content/release.json`. Edit the authoring modules, then regenerate. It neither
removes unrelated content nor changes the ranked allowlist. The Go helpers have
`//go:build ignore` so ordinary `go test ./...` does not treat their independent
entry points as a package. Explicit `go run <file>` executes them.

The content checker uses the actual Go map and mission decoders, constructs
every declared difficulty and tutorial faction, and restores opening saves with
identical hashes. The separate early-runtime audit advances to tick 700, saves
at tick 350, and checks deterministic continuation. Neither tool issues a full
winning campaign strategy. `check-index.mjs` checks exact bytes, SHA-256,
metadata, inventory and transcript keys; it does not implement gameplay rules.

## Data and release contracts

There are 32 map records and 31 mission records in the library index. The eight
launch IDs are listed separately in `release.json`. Campaign layouts are
additional maps, not renamed skirmish maps. Tutorials reuse selected authored
campaign layouts. Co-op missions use their dedicated launch layouts.

Library URLs are same-origin static content paths. Every map and mission record
contains the SHA-256 and byte length of the exact serialized JSON. The declared
base pack ID is `2.0.0`, with manifest `/assets/packs/base.json`; the product asset
build owns that manifest and its actual file inventory. This content task does
not fabricate or certify missing art, audio, downloaded caches or pack files.

Maps use integer millitile positions, fixed authored resource budgets, named
regions and required pack IDs. Mission scripts contain bounded declarative
conditions/actions only. The Go simulation remains authoritative for placement,
pathing, ownership, capture, service slots, power, Supply, paid production and
combat. Mission-specific starting assets and finite scripted columns are
explicit scenario exceptions, not balance changes.

## Review artifacts and limits

`work/claude/05-authoring/previews` contains 32 topographic authoring previews.
All eight launch previews and four representative campaign previews were
inspected during authoring. These diagrams show geometry, access routes and
regions; they are not final in-game visual QA or replacement shipping artwork.

Actual Go harvest diagnostics and their limitations are documented in
`docs/content-validation-evidence.md`. Six-faction-matchup review, start-layout
fairness across practical openings, complete mission playthroughs, UI lesson
gating, briefing art, recorded voices and rendered mission presentation remain
separate acceptance work. No map is marked ranked-reviewed by this task.
