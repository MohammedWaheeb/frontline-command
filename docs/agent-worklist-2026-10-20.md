# Agent worklist — 20 October 2026

> **Executed 2026-10-20.** Statuses and evidence are in
> [release-fix receipts](release-fix-receipts-2026-10-20.md). Still open:
> `sy-05-relay-break` hard + FactoryCapture hard, a clean-commit green
> `make test-extended`, and W-1/W-2 website commit/deployment (not authorized
> in the game pass). The plan below is retained as executed history.

Remaining work after the qualified 0.3.8 build (13 Oct) and the 19 Oct bug
hunt (`outputs/bug-hunt-2026-10-19.md`, verdict GO-WITH-FIXES, all P1s fixed
and re-verified 20 Oct). Tasks are ordered. Each names files, the change, and
how to prove it done. Do not invent new scope.

## Ground rules for the executing agent

- Read `AGENTS.md` first. One Go/build lane, one browser lane, one Blender
  lane on this 16 GB host. Never kill processes you did not start (a
  `campaignbots` sweep may be running; leave it alone and do not trust
  performance timings while load average is high).
- The tree is dirty (~14k paths, HEAD `61ff27a81`). Work with it; do not
  `git clean`, stash, or reset. Commit only when the user asks.
- Simulation stays pure Go, fixed-point, 20 ticks/s, stable order. No floats,
  wall clock, HTTP, or DB in `pkg/sim`.
- Every fix ships with its regression test. Run the named acceptance command
  and quote its output; a green you did not observe is not done.
- Localhost by default. No deployment of the game. (The website is already
  deployed; see W-2.)

---

## Phase A — Make the release cuttable

### A-1. Perf budget confirmation on a quiet host
- **Why:** `TestMaximumActorsReturnsRoutesAndInterceptionTogether` fails only
  its budget assert (p95 ≤ 25 ms, p99 ≤ 40 ms in
  `pkg/sim/combined_performance_test.go:146`) while the host is loaded.
  Correctness inside it passes (64/64 aircraft land, 24/24 interceptions).
- **Do:** wait for load average < 4, then run
  `go test ./pkg/sim/ -run TestMaximumActorsReturnsRoutesAndInterceptionTogether -count=1 -v`.
- **Done when:** test passes on the quiet host, or a real regression is
  localized and filed as a new P1 with timings.

### A-2. Unbreak the gates
- **Files:** `client/scripts/runtime/browser-test.mjs:18`, `go.mod`, `work/`
  (untracked), `scripts/package-integrity.mjs`.
- **Do:** (1) remove or repoint the stale symlink
  `work/evidence/runtime/host/runtime` and make the EEXIST path verify its
  target; (2) exclude `work/` from the Go module (nested `go.mod` or ignore)
  so standard tooling works; (3) add `make test-extended` plus the
  wire-evidence env (`FRONTLINE_MISSION_PUBLIC_TASK_WIRE_EVIDENCE`) to the
  release checklist in `docs/release-blockers.md`.
- **Done when:** `go build ./...` exits 0; `go vet ./...` exits 0; the browser
  lane starts; the 5 skipped wire-parity tests in `client/tests/runtime/`
  actually run when the evidence env is provisioned.

### A-3. Run the long gates once
- **Do:** `make test-extended` (90-minute authored set, incl. 76 short-skipped
  tests), then the browser lane. Record results in
  `docs/implementation-status.md`, preserving failures verbatim.
- **Done when:** both complete with receipts filed under `work/`, pass or fail
  honestly recorded. This gates any release tag.

### A-4. License + contribution guide
- **Do:** add a root `LICENSE` (ask the user which license — do not choose
  unilaterally) and `CONTRIBUTING.md` summarizing `site/contribute.html`
  ground rules.
- **Done when:** both files exist and the site callout about the missing
  license is removed (see W-2).

---

## Phase B — P2 defect batches (from the bug hunt, in its order)

### B-1. Co-op content fixes (player-visible, do first)
- **Files:** `content/missions/twin-outposts.json`,
  `content/maps/twin-outposts.json`, `content/missions/convoy-union.json`,
  spawn validation in `pkg/content`.
- **Do:** audit every pressure-wave spawn position against its warning text
  and approach direction; fix mismatches; align map teams; validate
  `Spawn.Team` in content checks.
- **Done when:** `make check-content` passes with the new validation, and
  `TestAuthoredCoopCompletion` (all 6 subtests) still passes.

### B-2. Save-integrity completion
- **Files:** `pkg/sim/engine.go:496`, `pkg/sim/validate.go:287`,
  `internal/server/saves.go:49`, `internal/server/scenarios.go:246`.
- **Do:** server-issued checkpoint provenance for co-op resume so fabricated
  credit/energy values within loose bounds are rejected; keep solo save
  compatibility and export of older saves.
- **Done when:** the hunter's fabricated-save probe (inflated credits hosted
  as a co-op lobby) is rejected by a new test; existing save/replay tests pass.

### B-3. Reconnect robustness batch
- **Files:** `internal/server/admission.go:45`, `internal/server/server.go:556`,
  `internal/server/match.go:265,561`, `internal/server/server.go:514`.
- **Do:** exclude failed attempts (or raise) the WS admission cap for
  authenticated reconnects; add a WS liveness deadline after hello; coalesce
  or skip deltas instead of dropping a peer on outbox fill; fix start-barrier
  `everConnected` semantics so a dropped player cannot satisfy it.
- **Done when:** new server tests cover each behavior; `go test
  ./internal/server/ -race -count=1` passes.

### B-4. Observer/performance batch
- **Files:** `internal/server/observers.go:32,62`,
  `internal/server/match.go:237,627`, `pkg/sim/engine.go:450`,
  `internal/storage/shared_saves.go:12`.
- **Do:** skip `archive.capture` when zero observers and byte-cap the
  archive; move `Save` JSON marshal off the actor select; bounded ticker
  catch-up; enforce `maxSavesPerOwner`/`maxSaveBytesPerOwner` in
  `PutSharedSave`.
- **Done when:** targeted tests + `make test` pass; no behavior change to
  replay bytes for existing fixtures.

### B-5. LAN hardening (required before advertising LAN play)
- **Files:** `cmd/frontline/main.go:49,50`, `internal/server/server.go:299,375`.
- **Do:** HTTP read/write timeouts and body deadlines; profile-creation cap
  or auth; authenticate and cache `GET /maps` (stop per-request flood-fill
  decode and owner leak at `server.go:399`); document plaintext LAN risk or
  add token rotation.
- **Done when:** server tests cover limits; `docs/local-development.md` LAN
  section states the resulting posture honestly.

### B-6. Path/AI/catalog polish batch
- **Files:** `pkg/sim/navigation.go:308,329,506`, `pkg/sim/economy_depot.go:48`,
  `pkg/sim/ai_knowledge.go:198`, `pkg/sim/ai.go:720`,
  `pkg/content/map.go:21`, `pkg/sim/owner_ranges.go:42`,
  `pkg/content/catalog.go:224,243`, `client/src/styles/game.css` (HUD scale).
- **Do:** charge multi-A* routes honestly against the path budget; AI build
  placement gets spiral/multi-center fallback; decide height-passability
  semantics vs authored ramps (fix code or maps — record the decision);
  catalog validators for role-name prereq cycles and Splash bounds; scale
  8–9 px HUD labels with `--fc-ui-scale`.
- **Done when:** each item has a regression test; `make test` passes; bot
  match tests (`TestBotsFinishThreeAndFourPlayerMatches`,
  `TestAICompleteStandardMatches`) still pass.

### B-7. Ranked surface decision
- **Files:** client ranked UI (`client/src/ui/App.tsx`,
  `client/src/ui/network/maps.tsx`), missing `ranked-maps.json`.
- **Do:** either ship a valid `ranked-maps.json` for the 3 curated maps or
  remove/hide the ranked UI from the player build (match the Campaign/Editor
  hiding pattern in `client/src/app/release-scope.ts`).
- **Done when:** no player-facing control dead-ends on a missing file;
  covered by a client runtime test.

### B-8. Host-crash match recovery
- **Files:** `internal/server/match.go:643` (30 s checkpoints persisted,
  never rehydrated), `internal/storage`.
- **Do:** rehydrate in-progress skirmish/co-op matches from checkpoints after
  host restart, or explicitly void them with a recorded reason.
- **Done when:** a kill-and-restart test ends in recovery or an honest void —
  never a silent loss.

---

## Phase C — Deferred scope (only on explicit user go-ahead)

### C-1. Campaign re-enable
- **State:** 24 missions hidden; original matrix 81 pass / 21 fail; 12 routes
  lack a winning successor; SA-04 clean-interception fails
  (`pkg/sim/authored_optional_reliability_test.go:197`).
- **Do:** fix failing routes one by one under original budgets/goals,
  starting with SA-04; unhide only when the full authored matrix passes.
- **Done when:** full mission matrix green in `make test-extended`; Campaign
  entry restored via `release-scope.ts`.

### C-2. Map editor re-enable
- **Do:** ordinary-flow acceptance of editor + workshop + import persistence
  (see historical ordered-work row 3/6 in `docs/release-blockers.md`), then
  unhide.
- **Done when:** editor journeys pass in the browser lane end to end.

### C-3. Audio pass
- **State:** outside the 13 Oct scope. One audio-mix ducking failure was
  recorded in the broader suite; it did not reproduce in `make test`
  (20 Oct). First task: locate and reproduce it in its own suite.
- **Done when:** the ducking failure is reproduced, fixed, or formally
  retired with evidence; audio acceptance runs in the browser lane.

### C-4. Extra skirmish maps into default selection
- **State:** Relay Heights, Dry River, Border Depots exist outside the
  curated 3 (`client/src/app/release-scope.ts`).
- **Do:** fairness review per map (spawn parity, six faction matchups),
  scenery/art resolution check, then extend `DEFAULT_BATTLEFIELD_IDS`.
- **Done when:** each added map passes authored skirmish acceptance.

### C-5. P3 sweep (44 items, post-release)
Server-side 3-map scope enforcement (`internal/server/server.go:148`); save
digests + `synchronous=FULL` + DB version-migration plan; constant-time token
compares; sanitized error responses; A* cap signaling; hauler FIFO
skip/timeout; minimap accessibility; Practice map-state reconciliation;
`contentcheck -release` scope alignment; lint/CI introduction; design-doc
counts (76 units / 29 weapons). Full list: bug hunt "Ordered fix checklist"
item 11 and its P3 section. Batch by file area; one test per behavior change.

---

## Phase D — Needs humans or hardware (agent can only assist)

- Physical second-machine LAN match.
- Safari/Firefox full gameplay; Windows/Linux/other CPUs; mobile.
- Human balance sessions (six cross-faction matchups) and a naturally earned
  human co-op victory.
- 20-minute continuous rendered combat per view; reference-hardware FPS.
- Signed/notarized packages and public download hosting (also a user
  decision; public online hosting per `docs/deployment-plan.md` is a
  separate, unapproved project).

## Phase W — Website leftovers

### W-1. Commit the site
- `site/` is untracked in git. With user approval, commit it so the live
  deployment is reproducible from the repo.

### W-2. Site truth maintenance
- After A-4, remove the "license still needed" callout from
  `site/contribute.html`. After any phase above lands, update the status
  ledger in `site/index.html` and redeploy:
  `npx wrangler pages deploy site --project-name frontline-command --branch main --commit-dirty=true`
- Full site rebuilds need `assets/build/frames` (absent in this checkout);
  until it returns, re-run only the icon/nav/footer injection at the end of
  `site/scripts/build.mjs` after editing `site/partials/`. The factions-page
  roster renders (48/76) refresh only via a full rebuild.
