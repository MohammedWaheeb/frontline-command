# Campaign playability — randomized bot sweep (2026-10-20)

Status: headless verification on the current dirty working tree (HEAD
`61ff27a81` plus uncommitted changes). This certifies simulation behaviour
only. It is not a browser, art, or release qualification.

## Top finding

The campaign is reachable in the current build (unhidden 2026-10-20 and
browser-verified from the main menu), loads and plays across all four
factions under randomized bot command with zero errors or stalls, and the
scripted authored routes currently pass everywhere except
`sy-05-relay-break` on hard (see receipts for the exact remaining route
inventory). Generic bots are crude proxies, not human players: their
losses on escort/capture/hold missions are expected and are not
winnability evidence either way.

## What the campaign is

24 missions in `content/index.json`: four 6-mission stories — US *Operation
Clear Horizon*, IR *Operation Iron Signal*, SY *Operation Open Road*, SA
*Operation Shieldline* — each on its own authored layout map, with briefing,
debrief, presentation files, scripted triggers, and sequential unlocking in
`client/src/runtime/campaign-journey.ts` (mission N unlocks after any-difficulty
completion of N−1; progress recording requires a real `mission_complete`
victory under `scenario-v2`). Content integrity: all mission and presentation
files exist, SHA-256/byte counts match the index, and
`go run ./cmd/contentcheck -content content -release` passes (32 maps,
31 missions, simulation 0.3.8).

## Randomized bot sweep (new)

`internal/botsweep` adds five fog-honest bot commanders that play the human
slot using only `PlayerView(1)` and public `Engine.Submit` orders — the same
surface as a human client. `StateCopy` is used only for end-of-run evidence
counts, never for bot decisions.

| Bot | Behaviour |
|---|---|
| `idle` | Never orders. Baseline for mission scripting and enemy AI. |
| `random` | Legal-order fuzzer: random groups, destinations, production. |
| `rusher` | Trains combat units, attack-moves across named map regions. |
| `turtle` | Builds economy and a turret, repairs, defends the base only. |
| `objective` | Economy, rebuilds supply/power/production, mixed army, region tour, engineer captures of visible stations, base defence. |

Runner: `cmd/campaignbots`. Committed gates: `TestCampaignBotSweepSmoke`
(one opener per faction, runs in `-short`), `TestCampaignBotDeterminism`
(identical seeds must replay to identical hash/tick/outcome),
`TestCampaignBotSaveRestoreCheckedBeforeMidpoint`, and
`TestCampaignBotSweepAll` (full matrix, non-short) in
`pkg/sim/campaign_bot_sweep_test.go`.

### Full sweep result (re-executed on the final tree, same day)

Command: `campaignbots -seeds 4 -ticks 18000 -workers 10 -difficulties rotate`
— 24 missions × 5 bots × 4 random bot seeds = **480 runs**, difficulty
rotating easy/normal/hard, 18,000-tick cap (15 game-minutes). Every run now
performs a real save/restore hash check (midpoint, or terminal tick for
early finishers) and records it in `save_restore_checked`. Evidence:
`work/campaign-bot-sweep-2026-10-20/report.md`, `report.json`.

- 0 errors, 0 stalls, 0 panics. Every run loaded, simulated, and progressed.
- 58,043 / 58,558 bot orders accepted (99.1%).
- Save/restore checks actually performed: 480/480; hash matched: 480/480.
- Verdicts: 79 bot wins, 273 fought losses (`mission_failed`), 128 timeouts
  still in progress. Generic bots won at least one run in 14 of 24 missions.
- `idle` lost 96/96: no mission wins itself.
- Bot win counts by faction: IR 32, US 27, SY 11, SA 9 (of 120 runs each).
  By bot: rusher 38, objective 31, random 6, turtle 4, idle 0.
- Speed: 4,900,409 ticks in 9m01s wall on this host (~9,066 ticks/sec
  aggregate under 10 workers).

Missions no generic bot won (escort, capture-without-destroying, and precise
region-hold objectives): `ir-01`, `sa-02`, `sa-03`, `sa-05`, `sy-01`, `sy-02`,
`sy-03`, `sy-05`, `us-02`, `us-03`. That is expected for crude bots and is not
evidence these missions are unwinnable; winnability is the job of the scripted
playthroughs below.

### Balance signals from bot play (observations, not proofs)

- `us-04-broken-umbrella` is very forgiving: bots won 15/20 runs, including
  `random` and `turtle`, all by surviving to the exact timer tick (14500).
  Review whether the defence should demand more active play.
- `ir-03-beyond-the-basin` can complete in ~1,093 ticks (~55 s) under random
  play. Review whether its region/station objective is too lax.
- Capture-building fragility remains a recurring theme in `us-03`, `sy-05`,
  `sa-05` scripted routes: approach/auto-fire can destroy the capture target.
- `sy-05-relay-break` is the hardest scripted route: generic bots won 0/20
  and the authored hard route still fails (below).

## Scripted winnability proof

The authored drivers in `pkg/sim/authored_campaign_acceptance_test.go` play
one tuned human route per mission and difficulty, with midpoint
save/restore and full-replay hash checks. Current status is tracked in
[release-fix receipts](release-fix-receipts-2026-10-20.md): every mission
passes at multiple difficulties and the capture group re-run on this tree
is 8/9 (`us-03` and `sa-05` all difficulties, `sy-05` easy+normal). The one
remaining main-route failure is `sy-05-relay-break/hard`: relay-2 is
captured but destroyed during stabilization/stage-3 approach while relay-1
and the captured factory survive. Drivers are brittle single routes: a
driver loss does not prove a mission impossible (see the method note in
`docs/authored-mission-playthroughs.md`), but 72/72 must not be claimed
while it is red.

## Verdict

- **Playable as a simulation: yes.** All 24 missions across all four factions
  load, accept orders, fight, save/restore, and resolve or progress under
  480 randomized bot games with zero errors or stalls, at many times
  real-time speed. Determinism held in the paired-seed check and in every
  save/restore check actually performed (480/480).
- **Proven winnable everywhere: not quite.** Scripted proof is complete
  except `sy-05` hard (main capture route and its factory-captured
  optional). Every mission is proven winnable at easy and normal.
- **Playable by players today: yes.** Campaign, Command Record (mastery)
  and the Editor are reachable from the main menu and were exercised in a
  headless Chromium probe with screenshots.
- **"Good": partially evidenced.** Structure, variety (supply, escort,
  territory, capture, defence, assault), and fail states all function, and
  crude bots can win 14 missions. Fun, fairness, and difficulty curve still
  need human play; the balance signals above are the first places to look.

## Reproduce

```sh
# Committed gates
go test ./pkg/sim/ -run 'TestCampaignBotSweepSmoke|TestCampaignBotDeterminism|TestCampaignBotSaveRestoreCheckedBeforeMidpoint' -count=1 -v
go test ./pkg/sim/ -run 'TestCampaignBotSweepAll' -count=1 -timeout 60m -v

# Standalone sweep with reports
go run ./cmd/campaignbots -seeds 4 -ticks 18000 -difficulties rotate \
  -out work/campaign-bot-sweep/report.md -json work/campaign-bot-sweep/report.json

# Scripted winnability matrix (long)
go test ./pkg/sim/ -run '^TestAuthoredCampaign(Opening|Escort|Territory|Capture|Defense|Assault)Completion$' -count=1 -timeout 90m -v
```
