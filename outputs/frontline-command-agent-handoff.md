# Frontline Command — implementation handoff prompt

You are taking over implementation of **Frontline Command**, a complete, locally runnable browser RTS inspired by the base-building, harvesting, production, unit control and combined-arms gameplay of Command & Conquer. The user has approved the implementation plan below and explicitly asked for implementation. Continue implementing it; do not restart product discovery or return only another plan.

This document contains the confirmed requirements, exact file locations, current implementation state, working boundaries, approved architecture, milestones, and acceptance criteria. Read the canonical game design before changing gameplay rules.

## 1. Workspace and current state

**Workspace root:**

`/Users/mohammedkalouti/Documents/Codex/2026-09-27/i`

**Canonical gameplay specification:**

`/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/outputs/frontline-command-game-design.md`

**This handoff:**

`/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/outputs/frontline-command-agent-handoff.md`

State verified on 27 September 2026:

- The workspace contains design documents and design-generation/validation scripts. **There is no implemented game yet.**
- It is not yet a Git repository. There is no application scaffold, `go.mod`, `package.json`, backend, browser client, or completed game asset pipeline.
- No applicable `AGENTS.md` was found in the inspected Codex workspace ancestor directories. Recheck instructions when taking over.
- The implementation turn was interrupted after read-only inspection and a Claude availability check. No Go installation, repository initialization, game code, frontend code, or asset creation occurred in that turn.
- This handoff document was written afterward at the user's request.
- The game design's analytical checks are not evidence of an implemented or playtested game.
- No frontend assignment has been successfully dispatched. No game server or frontend development server was started.
- Deployment has not been performed and must not be performed as part of the local build.

Environment at handoff:

| Item | Verified state |
|---|---|
| OS / architecture | macOS, arm64 |
| Shell | zsh |
| Claude Code CLI | `/Users/mohammedkalouti/.local/bin/claude` |
| Last inspected Claude version | `2.1.215` |
| Node | `/opt/homebrew/bin/node` |
| Homebrew | `/opt/homebrew/bin/brew` |
| Go | Not found on the command path; installation is still required |
| Docker | Not found on the command path; not required for local play |
| Claude authentication | Actual model request failed because the OAuth session expired and could not be refreshed |

The exact Claude error was:

> Failed to authenticate: OAuth session expired and could not be refreshed

An earlier authentication-status command reported a stored login, but the actual request failed. Do not mistake stored login metadata for a working session. The requested model was not successfully exercised with this account. Recheck authentication; if it is still expired, ask the user to sign in through Claude Code while continuing independent Go/backend work. Do not request secrets in chat or switch models to get around the blocker.

## 2. Complete file inventory and authority

### Current deliverable

- `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/outputs/frontline-command-game-design.md` — **authoritative v2 game design**, 1,180 lines, approximately 19,500 words. Contains the full rules, faction rosters, costs, weapons, maps/missions, interfaces, balance reasoning, and release checklist.
- `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/outputs/frontline-command-agent-handoff.md` — this implementation handoff and approved plan.

### Supporting design and validation files

- `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/work/refinement/design_data.py` — numeric roster and weapon inputs used to assemble/check the v2 design; useful migration input for backend content definitions, not a game engine or a complete production content pack.
- `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/work/refinement/balance_audit.py` — analytical economy/combat sanity checks.
- `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/work/refinement/balance-results.json` — previously generated analytical results, not live game telemetry.
- `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/work/refinement/validate_markdown.py` — document validation checks.
- `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/work/refinement/game-design-v2.template.md` — document assembly template.
- `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/work/refinement/remaining-sections.md` — supporting document sections.
- `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/work/refinement/assemble_design.py` — rewrites the current Markdown output when executed. Read it before use; do not run it casually and overwrite the canonical specification.

### Historical material — superseded

- `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/outputs/frontline-command-game-design.pdf` — old v1 PDF; superseded by v2 Markdown. The user explicitly wants Markdown, not PDF.
- `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/work/refinement/frontline-command-v1.md` — old v1 design.
- `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/work/build_design.py` — original document-generation script.
- `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/work/pdf-review/` — old PDF review images: `page-01.png` through `page-18.png`, plus `contact-1.png`, `contact-2.png`, and `contact-3.png`.
- `/Users/mohammedkalouti/.codex/visualizations/2026/09/27/01a0e28a-904d-77a0-8e08-c5d3c181308b/frontline-command-counters.html` — old v1 counter visualization. Do not treat it as current balance or game code.

If sources conflict, follow the latest user constraints in this handoff and the v2 Markdown design. Never reintroduce v1 faction-wide bonuses or identical strategic attacks.

Keep scratch work under `work/` and user-facing documents/packages under `outputs/`. Create the game source in this workspace using a clear project layout, preserving the existing documents. Do not write directly into the user's home directory.

## 3. User requirements and settled decisions

The user's intent is a **proper, finished, playable, extensible RTS**, not a visual mockup or a limited demo. The core loop is familiar C&C-style gameplay with original factions/assets and room for later maps and concepts.

| Area | Settled decision |
|---|---|
| Backend and simulation | Go |
| Presentation | Polished 2.5D, fixed elevated camera, zoom, clear unit silhouettes |
| Frontend and assets | Exclusively Claude Code CLI using the exact model `claude-opus-5-5` |
| Factions | US, Iran, Syrian Rebels, Saudi Arabia |
| Combat | Infantry, armor, aircraft, drones, artillery, missiles, interception, support and strategic operations |
| First deliverable | Complete game running locally |
| Multiplayer | Local/LAN 1v1, 2v2, FFA, co-op and private lobbies; future hosted online modes |
| Language | English first; code prepared for localization |
| Future public launch | 1,000 concurrent players across Middle East and Europe |
| Hosting preference | Managed hosting later; planning only now |
| Documents | Markdown, not PDF |

The user most recently clarified: **"don't worry about deployment now just plan for it and must run locally."** Do not let cloud setup block local development. Do not provision or deploy cloud infrastructure.

Full content target: **75 units, 28 weapons, all specified buildings/research/abilities, five tutorials, 24 campaign missions, eight launch maps plus campaign layouts, two co-op scenarios, AI skirmish, multiplayer, replays and map editor**.

Milestones may use smaller internal slices. They do not reduce the approved final scope. Do not claim the full game, production quality, or proven balance until the corresponding acceptance gates pass.

## 4. Mandatory ownership boundary

| Responsibility | Owner |
|---|---|
| Go simulation, economy, combat, pathfinding, AI | Primary agent / Codex |
| Go server, validation, matchmaking, persistence, backend tests | Primary agent / Codex |
| Shared protocol definitions and backend content validation | Primary agent / Codex |
| Browser application, renderer, HUD, menus, controls | Claude Code CLI — Opus 5.5 |
| Browser networking, caching, browser storage and offline integration | Claude Code CLI — Opus 5.5 |
| Browser/WASM entry point and adapter, even if part of it is Go | Claude Code CLI — Opus 5.5 |
| All visual assets, animation, sound/music/voice integration, maps and presentation | Claude Code CLI — Opus 5.5 |
| Frontend tests, visual fixes, asset-processing scripts | Claude Code CLI — Opus 5.5 |
| Integration review and gameplay acceptance | Primary agent reviews; the appropriate owner fixes its implementation |

**Do not directly author, patch, repair or generate frontend or asset files yourself.** This applies to quick fixes, placeholder UI, generated client bindings, shaders, CSS, JavaScript/TypeScript, browser tests, maps, sprites, audio and browser adapters. Backend-only rules/data, shared schemas, Go tests and handoff documentation remain your responsibility.

You may read and review Claude's output, run its build/tests, inspect the game, and identify defects. Send frontend/asset defects back to Claude to fix. Do not replace the requested CLI with an internal agent, a different model, or your own frontend code.

The pure Go simulation is shared with the offline browser build. Claude owns its browser-specific wrapper and packaging, rather than independently rewriting combat in TypeScript.

### Claude task contract

Every assignment must:

1. Invoke Claude Code CLI with `--model claude-opus-5-5`.
2. Include relevant design sections, protocol contracts, allowed file boundaries, dependencies and concrete acceptance tests.
3. Cover a bounded feature or cohesive slice, rather than one uncontrolled request to build everything.
4. Require tests and visible interaction evidence where applicable.
5. Return changed files, test results, screenshots/other evidence and remaining issues.
6. Be reviewed before dependent work starts.

Record the model actually reported by the CLI. Disable configured fallback chains and do not accept work produced by another model. Avoid aliases such as `opus` or `opusplan`; the latter may switch models for implementation.

Official model documentation: <https://code.claude.com/docs/en/model-config>.

Claude must first produce visual concepts and a reusable design system covering battlefield, production panels, menus, lobby, campaign and editor. It also owns the production asset pipeline. Opus authors and operates that pipeline; image/audio/rendering tools produce binary outputs as appropriate. Missing tools or credentials are setup work, not permission to ship placeholders or cross the ownership boundary.

Relevant previously read skill files, if available in the receiving environment:

- `/Users/mohammedkalouti/.codex/plugins/cache/openai-plugin-examples/build-web-apps/0.1.2/skills/frontend-app-builder/SKILL.md`
- `/Users/mohammedkalouti/.codex/plugins/cache/openai-plugin-examples/build-web-apps/0.1.2/skills/frontend-testing-debugging/SKILL.md`

These guide Claude's concept, implementation and browser-verification workflow. The user's ownership instruction takes precedence over any suggestion that the primary agent create frontend/assets directly. Announce newly applied skills according to your environment's instructions.

## 5. Approved architecture

### 5.1 Pure Go simulation

Create a pure Go package with no dependency on rendering, HTTP, databases or cloud services. It owns:

- Resources, harvesting, power, construction, production and research.
- Movement, formations, collision, terrain, transport and path recovery.
- Targeting, projectiles, damage, cover, concealment and detection.
- Aircraft ammunition, endurance, landing, service and rebasing.
- Tactical missiles, strategic operations and interception.
- Faction abilities, repair, capture and veterancy.
- AI decisions, bounded mission triggers, objectives and victory.
- Deterministic snapshots and replay execution.

Use **20 ticks per second**, explicit-width integer/fixed-point arithmetic, stable entity ordering, deterministic tie-breaking and seeded randomness where needed. Do not allow Go map iteration, wall-clock time, architecture-dependent integer widths or floating-point behavior to change results.

Expose a small simulation interface:

| Operation | Purpose |
|---|---|
| Create match | Load validated content, map, players, ruleset and seed |
| Submit orders | Queue player or AI intentions |
| Advance tick | Execute one deterministic step |
| Read player view | Return only information that player may know |
| Save / restore | Serialize or restore a complete match |
| Read events | Provide combat, objective and presentation events |
| Compute state hash | Check replay and native/WASM consistency |

Run the same engine natively in Go for multiplayer and as Go WebAssembly in a dedicated browser worker for offline solo. Claude implements the browser wrapper. Use matching Go compiler and `wasm_exec.js` versions. Reference: <https://go.dev/wiki/WebAssembly>.

### 5.2 Claude-owned browser client

- TypeScript + React + Vite for menus, HUD, settings, lobby and editor.
- PixiJS for battlefield rendering, sprites, fog presentation, animations and effects.
- WebGL baseline; smooth independent rendering interpolated between simulation states.
- Dedicated worker for offline Go/WASM simulation.
- One transport boundary for server play and offline play; no separate combat implementation.
- Battlefield objects live in the renderer's scene/state model. Do not drive every moving unit through React component updates every frame.

Reference: <https://pixijs.com/8.x/guides/getting-started/intro>.

### 5.3 Movement and combat

Use tile navigation with movement-class clearance, hierarchical A*, shared route work for groups, deterministic local separation, and navigation updates for changing structures/bridges/blockers.

Movement acceptance includes narrow passages, crowded producers, mixed selections, transport unloading, repeated orders, blocked-route recovery, no permanent overlap and no permanent oscillation.

Implement explicit states for moving/aiming/firing/reloading, deploying/packing, landing/service/return, boarding/unloading/transit, capture/repair/sabotage, and interrupted abilities.

Only authoritative simulation events can cause damage, spending, production or objectives. Animation completion is presentation, not game authority.

### 5.4 Network protocol

- Versioned HTTP/JSON APIs for profiles, lobbies, saves, maps and history.
- Binary Protocol Buffers over WebSocket for match commands and state.
- Shared protocol definitions; primary agent generates Go bindings, Claude generates TypeScript bindings.

| Message | Responsibility |
|---|---|
| `ClientHello` | Negotiate protocol, simulation and content versions |
| `OrderBatch` | Submit sequenced orders and selected entities |
| `OrderResult` | Acknowledge or explain rejection |
| `PlayerSnapshot` | Establish an authorized player view |
| `StateDelta` | Update permitted visible state and events |
| `ResumeMatch` | Reauthenticate and restore a disconnected slot |
| `MatchResult` | Report the authoritative outcome |

The server assigns execution ticks and validates ownership, visibility, target legality, position, resources, supply/service capacity, prerequisites, cooldowns and command rates. Reject duplicate/stale/invalid commands safely with readable reason codes.

**Filter hidden information before serialization.** Do not transmit full enemy state and merely hide it in the renderer. This includes enemy positions, orders, research, events, sounds and observer feeds.

Selection and order markers acknowledge input immediately; purchases and combat outcomes remain authoritative. Reconnect restores an authorized snapshot and subsequent state, never hidden enemy commands.

Preserve 120-second reconnect, continuing orders while disconnected, 120-second competitive observer delay, idempotent result/rating commits, and void results when server failure prevents a trustworthy outcome.

### 5.5 Storage and local services

- SQLite for local profiles, service state, settings metadata, lobby records and history.
- Local files for content packs, replay chunks and exported saves.
- Match state in memory; persistence outside the simulation tick.
- IndexedDB, implemented by Claude, for offline browser saves/settings.
- Pure Go SQLite driver, avoiding a separate database service or C compiler: <https://pkg.go.dev/modernc.org/sqlite>.

Define repository interfaces for accounts, saves, results, maps and object storage. Future PostgreSQL/object storage adapters must pass the same contract tests. Local profiles and rankings remain separate from future public competitive accounts.

### 5.6 Content and extensibility

Create validated, versioned content packs with stable IDs for units, weapons, buildings, upgrades, abilities, maps, missions, localization and asset references. The Python design data is migration input, not a replacement for reading the full rules.

Use reusable typed ability implementations, such as concealment, designation, transit, interception and repair. Avoid faction conditionals distributed throughout the engine.

Mission scripts are bounded declarative triggers, conditions and actions. Imported maps cannot run arbitrary Go or JavaScript. Validate references, layers, prerequisites, capacities, cooldowns, map reachability, bounds and supported operations.

Each match/save/replay records simulation version, protocol version, content hash, map version, ruleset and seed. Content is immutable within an active match. Preserve incompatible older files for export with an explicit compatibility message.

## 6. Essential gameplay rules to preserve

This is an implementation orientation, not a replacement for the 28-section canonical design.

### Shared economy and base loop

- Start with HQ, one rig, 6,000 credits, zero Command Energy and 40 power capacity.
- Credits, power, Army Supply and Command Energy are separate resources.
- Army cap 100; up to four rigs and eight haulers per player; one living/reserved commando; up to 60 structures, of which at most 16 weapon defenses. Foundations reserve slots.
- Hauler cargo 600; one loading bay per field at 40 credits/second; 15 seconds for a full load; three-second unload. Reference round trip including travel is 30 seconds. Two staggered haulers saturate the reference field at 2,400 credits/minute.
- Starting field 36,000; expansion 24,000; two contested fields of 24,000 on standard maps; two stations at 120 credits/minute. After complete depletion, a visible 180-second timer yields a 6,000-credit central shipment.
- Production: one active job plus five unpaid waiting slots. Charge money and reserve supply/service capacity when the active job starts.
- Cancel refund: 75% of paid value multiplied by remaining progress fraction. Building sale: 50% of eligible paid building value multiplied by remaining health fraction. Exclude the supply center's included hauler from resale value. Capture/conversion cannot raise the paid basis or create free units.
- HQ/outpost build radius is 14 tiles; supply centers do not extend it. Replacement HQ and forward outposts have explicitly defined exceptions. Losing HQ permits an emergency factory-built rig for 1,200 credits / 30 seconds.
- Low power halves building work and aircraft rearm, doubles defense firing/charge intervals, and halts strategic charging; mobile unit combat stays normal. Prerequisite loss pauses investments rather than deleting them.

### Combat and special layers

- Use the exact target-layer and damage/armor matrix, weapon table, footprints, range rules and timing from v2. No hidden accuracy rolls or invented faction damage multipliers.
- Queued orders up to ten; guard anchor six tiles; aggressive leash twelve tiles; blocked-route recovery specified in the design.
- Aircraft require service capacity, have per-sortie ammunition and 120-second endurance, return at 30 seconds remaining, and obey explicit emergency rebase/loss rules. Service slots: US six, Iran six, Saudi four, Syrian scout workshop two.
- Ordinary anti-air attacks aircraft. ABM interception attacks designated tactical/strategic missiles; these are different systems.
- Tactical launchers require vision, paid ammunition, setup/packing, warning and finite charges. Iranian launchers bank two charges. Do not allow blind map-wide deletion attacks.
- Fixed ABM starts empty, holds two charges, covers 14 tiles, regenerates every 24 seconds normally, and coordinates reservations with allied interceptors. Saudi mobile ABM has one charge, range ten and deployed recharge rules.
- Command Energy starts at zero, caps at 100, and regenerates at 0.5/second with an active HQ, halved at low power. Unit ability cooldowns remain separate.
- Repairs cost credits and require the defined out-of-combat window. Strongest-source rules prevent stacking. Upgrades and veterancy cannot grant free full healing.
- Structure capture requires the defined health threshold/channel, excludes HQ/strategic sites, and converts captured air production without granting free aircraft. No generic enemy unit capture.

### Faction identities

| Faction | Main identity | Required weaknesses and responses |
|---|---|---|
| US — 19 units | Air superiority, fighter escort, Pathfinder designation, better servicing, airlift; Recon Sweep, Rapid Sortie, Skybreaker Wing | Finite aircraft service/ammo, AA, losses and ground pressure |
| Iran — 19 units | Cheap fragile drones, scouting networks, banked missile volleys; Relay Boost, Drone Recall, Saturation Salvo | Vision denial, ordinary AA, finite interception and launcher pressure |
| Syrian Rebels — 18 units | Guerrilla cover concealment, Ambush, technicals, sabotage, bounded salvage, three interruptible safehouses; Rapid Transfer, Disperse, Coordinated Raid | Recon, defended exits, interruptions and weaker frontal armor. Only an unarmed scout drone; no manned combat air force |
| Saudi Arabia — 19 units | Durable armor, hull-down, Aegis interception, paid repairs and mechanized support; Emergency Power, Recovery Order, Shieldline Protocol | Flanks, artillery, split objectives and deployment commitment. Basic air support rather than US-style air dominance |

Factions/equipment/story are fictionalized gameplay representations with original insignia, writing and assets. Avoid real extremist symbols and copying C&C art/audio/code.

### Match lifecycle and modes

- Elimination: no qualifying completed HQ/barracks/factory/air producer or living rig for 30 seconds; restoring one cancels the countdown. Surrender is immediate. Simultaneous elimination can draw.
- From minute 35, qualifying enemy structures receive periodic minimap indications without granting firing vision. Hard server limit is 90 minutes, yielding a draw if unresolved.
- Allies share sight and pings, not money, unit control, service capacity or faction boosts. Allied interception coordinates reservations.
- Ranked rules are 1v1; unranked includes 1v1/2v2, 3–4 player FFA and customs. Two-player co-op includes AI/scenario opponents. Team-ranked expansion is later.
- Five tutorials; four campaigns of six missions each; two co-op scenarios, Convoy Union and Twin Outposts; eight launch maps plus campaign layouts.
- AI observes the same fog and uses the same resources/queues/caps. Easy/Normal/Hard strategic updates are every four/two/one seconds. Authored campaign reinforcements are explicit scenario events, not hidden skirmish cheating.
- Every mission has briefing, main/failure/optional objectives, opening and mid-mission checkpoints, debrief, subtitles, tested restart and completion.
- Replays support seeking, speed, pause, perspective fog, build orders and overlays. Restore snapshots and simulate forward without replaying reward side effects.
- Complete settings, remappable controls, UI/minimap scaling, color alternatives, captions, reduced motion/flashes, sound categories and meaningful error/recovery states are required.

## 7. Approved implementation milestones

| Stage | Work | Acceptance evidence |
|---|---|---|
| 0 — Foundation | Install Go, restore Claude authentication, initialize repository, pin tools, record ownership/protocol, add local startup and checks | Server and Claude client connect locally; actual model verified; no cloud requirement |
| 1 — Simulation | Economy, construction, power, production, ground movement, combat, fog, objectives and snapshots | Deterministic automated matches finish; economy/refund invariants pass |
| 2 — First complete match | Claude battlefield/controls/HUD/initial production art; Go AI, save/load and local multiplayer | Build, gather, scout, fight, win, replay and restart; two browser sessions play one another |
| 3 — Four factions | All rosters, aircraft, missiles, abilities, research and strategic operations | All units usable; all threat layers answerable; six cross-faction and four mirror matchups run |
| 4 — Game services | Lobby, matchmaking, teams, reconnect, observers, replay, profiles, reports, settings and recovery | Full multiplayer journeys work locally, including failure paths |
| 5 — Content and tools | Editor before bulk maps; triggers, five tutorials, 24 missions, eight maps, two co-op scenarios and full AI | All missions completable/restartable; authored maps validate/export/import/play |
| 6 — Presentation and balance | Complete art, animations, voices, music, effects, accessibility and tuning | No missing required assets or inert controls; human counterplay review |
| 7 — Local release candidate | Browser/platform, performance, long-session, security, migration and packaging verification | Clean installation runs the complete local game and passes release checklist |
| Later — Hosted release | Managed deployment, public account integration and capacity tests | Public-service gates pass before launch |

Do not stop at an internal milestone and label it the finished requested game. Persist through authorized work. If a genuine external blocker prevents completion, finish independent work, preserve a precise progress checklist, and report exactly what is blocked and unfinished.

## 8. Asset, AI and content completion

Claude creates the asset inventory and repeatable export pipeline for directional sprites, team masks, shadows, animations, UI art and audio. Preserve editable sources and source/license records.

Every unit requires its applicable idle/move/aim/fire/work/damage/destruction and special states. Buildings require foundation/construction/complete/damage/disabled/low-power/capture/sale/destruction. Match the actual progress and collision footprint. Distinguish meaningful impact/interception/warning states.

Cover all portraits, cursors, icons, effects, terrain, props, minimap symbols, briefings, unit responses, announcer alerts, subtitles and music transitions. Effects must not hide tactical warnings. Lower-quality rendering can reduce decoration, not gameplay information.

Go AI has economy, strategic, composition, tactical, faction and recovery layers. It must handle depletion, missing tech/power, destroyed service capacity, scouting uncertainty and custom map starts. Do not use LLM calls during gameplay.

Claude authors map layouts, mission presentation and assets against the validated data format. Build the editor before producing all mission maps. Validate every map's spawn economy, paths, mandatory corridors, objectives, air/AA interaction, cover/detection access and faction fairness.

## 9. Testing and acceptance

### Backend and protocol

- Go unit/integration tests, race checks and fuzzing where input validation or serialization warrants them.
- Same command log produces the same state hash in native Go and browser WASM.
- Save/restore and replay seeking preserve state and do not duplicate income, units or results.
- Economy checks cover harvesting congestion, cargo loss, depletion, production reservations, repairs and cancel/sell/capture cycles.
- Combat checks cover target legality, cover/concealment, friendly fire, simultaneous damage, aircraft service loss, finite interception, ability interruption and expiration.
- Protocol tests cover unauthorized entities, malformed frames, command floods, duplicate/stale commands, reconnect and incompatible versions.
- Inspect serialized traffic for fog leaks including events, sounds and observer channels.
- Idempotent result writes cannot duplicate ratings or rewards.
- Persistence tests cover corrupt files, interrupted writes, full storage, unsupported versions and conflicts.

### Browser and gameplay

Claude authors frontend/component/browser tests. Use multiple independent browser contexts against the actual Go server for multiplayer acceptance.

Verify supported desktop Chrome, Edge, Firefox and Safari. Exercise real controls and full match journeys; do not rely only on build success or screenshots. Compare accepted concepts with rendered screenshots for layout, typography, palette, asset treatment, readability and responsive behavior.

Include focus loss, browser zoom, audio consent, offline startup, connection deterioration, reconnect, context loss, low memory and consecutive long matches. All failures need designed recovery actions.

### Performance

Record exact reference configurations and measured results; the following are targets, not already obtained evidence:

- i5-1135G7 / Iris Xe / 16 GB: 1080p, 60 FPS target.
- i5-8250U / UHD 620 / 8 GB: 720p, 30 FPS target.
- Apple Silicon Mac: Safari compatibility/recovery.
- Server simulation p95 below 25 ms and p99 below 40 ms within the 50 ms tick interval.

Test ordinary battles and the legal four-player maximum: **688 units/structures**, plus projectiles/props. Include mass route changes, aircraft return/service congestion, simultaneous volleys/interceptions, repeated creation/teardown and two long matches without restarting the browser.

Optimize failing systems instead of silently lowering approved gameplay limits. Never claim reference-hardware performance based only on another machine or a headless test.

### Balance

Automated scenarios precede human playtests. Review all six faction pairings, four mirrors, maps, sides, skill bands, match lengths and team synergies. Track opening timing, scouting, spending, composition, air losses, interception and strategic value.

Each tuning change records a hypothesis, test set, actual effect and rollback value. Aggregate win rate alone does not prove fairness. Existing balance scripts are sanity probes only; no full-match human balance has been performed.

## 10. Local startup and packaging contract

These are **required future commands**, not commands already implemented:

| Command | Result |
|---|---|
| `make doctor` | Check tools and explain missing setup |
| `make dev` | Start Go backend and Claude-built dev client |
| `make test` | Backend, content and client checks |
| `make build` | Produce local release package |
| `make play` | Serve packaged game on localhost |
| `make lan` | Explicitly enable LAN hosting and show join address |

Default binding is localhost; LAN exposure is opt-in. Package required assets locally. **Playing the game must not require Claude, an AI API key, a CDN, cloud login or an external database.** Development/content-generation dependencies do not become runtime dependencies.

After required files are downloaded/cached, solo modes run offline using the Go/WASM worker. Test service-worker behavior on localhost. LAN multiplayer remains connected to the hosting Go server; do not promise service-worker behavior on insecure remote LAN origins.

## 11. Future deployment — document only for now

Plan managed AWS hosting in Bahrain and Frankfurt with Go APIs/gateways/match workers on ECS, PostgreSQL for durable service data, regional queue/presence storage, object storage/CDN for versioned packs/replays, monitoring, secrets, backups and infrastructure definitions.

Gateways route to the worker owning each match. Drain active matches before deployment/scale-down; task protection supports this lifecycle: <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-scale-in-protection.html>.

Before hosted release, test 1,000 concurrent players including 500 simultaneous 1v1 matches, reconnect storms, regional demand shifts and spare capacity. Determine worker density from measurements and estimate costs before deployment.

Do not provision hosting, buy services, create public servers or require cloud credentials for the current local implementation.

## 12. Deliverables and working instructions

Final deliverables:

- Complete local game and source repository.
- Reproducible build/run commands and local release package.
- Updated Markdown design, implementation, protocol and content-format documentation.
- Complete asset manifest and editable production sources.
- Automated tests, replay fixtures and browser evidence.
- Balance findings, known limitations and a truthful release checklist.
- Future deployment, backup, monitoring and rollback documentation.

Recommended immediate sequence:

1. Inspect the current workspace and applicable instructions; preserve existing documents.
2. Read the canonical v2 design, especially sections 3–16, 20–26 and the full numeric tables.
3. Recheck Go and Claude availability. Install Go as part of authorized setup. If Claude auth is still expired, request user sign-in and continue independent backend work.
4. Initialize source control and record the approved ownership boundary and milestone checklist.
5. Establish the Go simulation/content/protocol interfaces and local test harness.
6. Verify an actual request on `claude-opus-5-5`, with no fallback. Then hand Claude a bounded concept/client task using those interfaces.
7. Build the smallest full match loop, test it, then expand through the approved milestones without abandoning the full scope.

Keep the user informed with concise progress updates. Ask only for information or access that is actually missing. Do not repeatedly ask permission for already approved, reversible implementation work. Do not deploy. Do not touch frontend/assets directly. Do not misrepresent a scaffold, prototype, numerical probe or partial milestone as the completed game.
