# Frozen v24 multiplayer acceptance preparation

The preparation checkpoint changed only test drivers and evidence. A subsequent
fresh 1H+3AI course earned a human victory and passed gameplay/lifecycle checks,
but its overall strict result is **FAILED** on 1,131 raw request diagnostics.
No production code, content or art was changed. Earlier outcomes and failures
retain their original source scopes; the two-game endurance pair is still unrun.

## Exact product and preparation

The immutable product is
`work/art/roster-runtime-overlay-v1/outputs/infantry-vehicles-ui-v24/product`,
with the host beside it. It derives from `work/art/effects-opus-v2/integration-v24`.
`client/tests/render/multiplayer-v24-prepare.mjs` checked the overlay/base receipts,
every frozen client source file, the integrated Go source lock/runtime receipt,
every overlay file and every base-pack entry. It compiled only passive protocol
and minimap helpers and the existing offline replay auditor; it did not rebuild
or relabel the product.

The ready harness is `work/multiplayer-combat/v24-34-prepared-02/`. The earlier
`prepared-01` is retained; version02 adds explicit map/runtime dependency hashes.
The compact receipt is `work/multiplayer-combat/v24-preparation/receipt.json`.

| Input | SHA-256 |
| --- | --- |
| Client source digest | `a3ab58d362a8536ede222db4be37f4a6661c2817e9f07a56b9026617303f0878` |
| Acceptance entry | `4573c94b97141142bb1d9bd6821ebb28ae2e7fd19c8cca22cc9391031c9cfb17` |
| Integrated 0.3.4 host | `36ca8c93f538696206317113d50af6ee31ac92fcbcd626a0a9f9b0ceaab8a5e0` |
| Integrated 0.3.4 WASM | `d1d7b97deaa4c73f58ba8b8035858d524d24c64d5c52f4ce4e71bcd47dbdb7ae` |
| Protocol source | `db86802c777fd6d2660a7956adce34c7b20a788dd72e6926365cdc46dc88199f` |
| Base pack | `bde24f48151997777c460c01e33ec6bc8703977b9c39ef1e12897e6aba633a1a` |
| Integrated Go source lock | `3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750` |

The pack has **4,634 files / 550,044,822 encoded bytes**, all checked by length and
SHA. Its 34 asset overlays contain 1,238 files. The actual art index has 40 unit
sheets, 17 building sheets, 26 props and 22 terrain images. Only 57 of the sealed
136 catalog actor IDs are indexed; 79 remain absent from this particular freeze.
Indexed does not mean every inherited sheet is complete or visually approved.
The pack contains 71 effects, not all 132 manifest entries. Each live client must
record its actual missing-art/fallback list. In particular, many non-US buildings
remain stand-ins. This is functional multiplayer acceptance, not final art or
complete-roster performance acceptance. Newer assets are not copied into this
freeze midway through a course.

## Current matrix and smallest remaining courses

`multiplayer-v24.browser.mjs` requires one explicit configuration per launch.
It never automatically advances from a failed course to the next configuration.
All six use unchanged Industrial Valley, standard rules, ordinary starting
credits and normal deterministic Go bots. The exact host-generated seed is
recorded from the earned replay; the driver does not select or replace it.

| Case | Humans / normal bots | Format and human factions | Earlier evidence; current v24 status |
| --- | --- | --- | --- |
| `1h1ai` | 1 / 1 | Opposing teams, US | Earlier strict PASS; v24 unrun |
| `1h3ai` | 1 / 3 | FFA, US | Earned win, atlas-eviction FAIL; repaired replay camera PASS preserved; fresh v24 gameplay/lifecycle PASS, strict FAILED on raw diagnostics |
| `2h` | 2 / 0 | 1v1, US/IR | Two same-App strict PASS matches, about 9m36s each; v24 unrun |
| `2h2ai` | 2 / 2 | Human team versus bot team, US/IR | Earlier strict PASS; v24 unrun |
| `3h` | 3 / 0 | FFA, US/IR/SY | Clean earned combat, original archive/recovery FAIL; separate copied-host recovery PASS is not a new full course; v24 unrun |
| `4h2v2` | 4 / 0 | US/IR versus SY/SA | Optimized c7e0 strict PASS including durable history/archive; earlier 503 failures remain; v24 unrun |
| `endurance2h` | 2 / 0 | Dry River, US/SA, two real hosted rematches | First prior expansion round won after 36m36.7 active time; second was aborted for stagnation. Two qualifying games remain unproved; v24 unrun |

Priority is `1h3ai`, `3h`, then `endurance2h`, with a coordinated process boundary
between them. The other four configurations still need fresh checks on this same
integrated candidate. These are separate logical gates; the endurance case does
not silently replace the Industrial Valley 2H row.
See [the earlier matrix](multiplayer-combat-acceptance.md),
[same-page evidence](multiplayer-rematch-acceptance.md), and
[failed expansion course](multiplayer-expansion-acceptance.md).

## Policy and long-match criterion

The current `expansion-commander.mjs` remains byte-identical to its correction
checkpoint (`51e6fb82bc555ae1175e659d3b707e0bba6d8639a0bd63be98e24244758dfd9f`).
It reserves exact catalog costs, buys ordinary combined arms, repairs and expands,
cancels a genuinely blocked queue head under its narrow recovery predicate, and
searches a finite frontier from public terrain/fog. Exposed qualifying enemy
assets take priority immediately. It has no 20-minute attack gate.
The new `MatrixCommander` changes only the old two-player public-spawn assumption:
FFA/teams choose the nearest currently nondefeated enemy's public spawn and exclude
allied spawns. Dry River's existing two-player context remains identical.
Every decision uses that commander's authorized view and public map/catalog.
Only Go validates orders, spends resources, advances combat and determines defeat.

The design §26.3 requires two consecutive long matches without reloading; it does
not prescribe an exact minimum. **20 active simulation minutes per match** is our
operational criterion, informed by §1.3's standard 1v1 duration target. The native
replay audit subtracts the real initial countdown from the genuine outcome tick.
Slow wall time, pause time, postgame waiting and deliberate victory delay do not
qualify. A natural short win is retained as valid combat evidence and fails only
the separate long-duration criterion. No gameplay balance changes are justified
by this testing threshold.

The corrected native Dry River policy already earned a 30m47.3s ordinary win,
with full/checkpoint/midpoint-restore equality. That is a behavioral preflight,
not browser lifetime acceptance or a guarantee for a fresh random host seed.
The actual queue cancellation/refund proof is a separate earned-replay branch;
its conditions and limitations remain in
[multiplayer-expansion-recovery.md](multiplayer-expansion-recovery.md).

For endurance the driver keeps the same browser, contexts, pages, document time
origins, profile IDs and `Application` identities. It uses the actual “Create
rematch lobby” action, a distinct lobby/session, renewed readiness, a second
ordinary result and a distinct durable replay. It checks transport/socket,
frame-listener, Go-worker and art/picking cleanup at the intervening menu and
final menu. A source-identified, bounded, idle Pixi decoder pool is distinguished
from the original Go validator worker; unknown workers or pending decoding fail.
The frozen lifetime entry does **not** expose EffectLibrary residency, so this
course cannot certify FX-page cleanup separately or total GPU memory.

## Gameplay and diagnostic reporting

DOM controls create profiles, configure lobbies/bots/readiness, reconnect,
open normal menus, create the hosted rematch and archive replays. Combat uses
the existing acceptance entry's normal authenticated command/advice transport.
This is API-assisted command execution, not an all-click combat playthrough.
No save/view injection, free resource/spawn, surrender, forced loss, sell-to-hasten,
fixture victory trigger, server seed override or weakened timeout is available.
Rejected ordinary orders are retained. A policy timeout or explicit failed-policy
abort is unfinished, never a fabricated match result.

Every completed round requires ordinary decisive `elimination`, paid economy and
production, privacy checks, ownership rejection for every human, live reconnect,
durable result recovery for every profile, unchanged eliminated private views,
and the exact normal-menu archive. A one-human FFA may continue after that human
is eliminated; committed-result polling may close the course without manufacturing
a fresh spectator snapshot. Native replay/checkpoint/midpoint-save audits run
with one CPU after browser/host closure, even if earlier diagnostics failed.

The report keeps `combatStatus`, `lifecycleStatus`, `diagnosticStatus` and the
separate long-session result. Overall PASS requires every applicable gate.
Raw page/console/HTTP/request failures are collected through context and browser
closure and checked at the end. Passive per-page CDP records target/request,
frame/document, URL, status and observation order; PW independently records raw
failures. URL/error multiset agreement corroborates counts only. Static URLs retain
full identity; API queries are removed to avoid logging credentials. The helper
never reads/clones a response body, wraps fetch, retries, cancels or suppresses.
Trace exhaustion, disagreement or an unexpected failure fails strict diagnostics.

[The standalone native-stream finding](native-fetch-primitive-diagnostic.md) is
preserved as context: small isolated native-reader courses on genuine Chrome154
and bundled Chromium151 produced ERR_ABORTED while complete bytes later matched.
Bounded `pipeTo` also reproduced it. That does **not** classify any future game
request as benign or application-canceled. There is no blanket abort whitelist.
This driver may therefore finish and verify genuine gameplay while reporting an
overall strict failure. Exact records remain available for a separate diagnosis.

## Ready commands and validation

Do not execute these until the browser lane is explicitly released. Use one host
at a time and a fresh browser per configuration; endurance alone retains the same
Apps/pages for its two rounds. Record actual power/background-process conditions.
Command-scoped `caffeinate -di` may prevent idle sleep without changing system
configuration. The prior sleep-interrupted course remains preserved.

```sh
FRONTLINE_COMBAT_BUILD="$PWD/work/multiplayer-combat/v24-34-prepared-02" \
FRONTLINE_COMBAT_REUSE=1 FRONTLINE_COMBAT_CASE=1h3ai FRONTLINE_COMBAT_HEADED=1 \
FRONTLINE_REMATCH_AUDITOR="$PWD/work/multiplayer-combat/v24-34-prepared-02/audit-replay" \
FRONTLINE_COMBAT_EXECUTABLE="$PWD/work/tools/browsers/20260929-prerequisites/apps/Google Chrome.app/Contents/MacOS/Google Chrome" \
FRONTLINE_COMBAT_CONDITIONS="Record current AC power and concurrent authoring work here" \
  caffeinate -di node client/tests/render/multiplayer-v24.browser.mjs
```

Use `endurance2h` for the two-match course. The default 60-minute wall cap per round
is an abort bound, not a duration target. Never extend it merely to count a stalled
policy as long combat. Headed runs verify actual Metal/Apple GPU identity and reject
software rendering; they still make no reference-hardware or physical-LAN claim.

Preparation passed 27 focused policy, lifecycle, matrix and passive-diagnostic
checks; frozen application and exact acceptance-entry TypeScript checks pass.
Syntax checks pass. The first entry-only typecheck used an incorrect relative
path, and the second lacked an explicit external `vite/client` type resolution;
both harness failures remain in numbered logs. The corrected third config checks
the immutable entry without changing it. These preparation checks did not add a runtime/game outcome; the later execution is recorded below.

## Fresh 1H+3AI course — 29 September, 10:06 UTC

Evidence: `work/multiplayer-combat/v24-1h3ai-2026-09-29T09-39-29.139Z/`.
Genuine Chrome 154.0.8037.58, actual Apple M4 Metal, unchanged v24 +34 overlay and
integrated 0.3.4. US won ordinary elimination at tick 31479, seed
`13106153005153403633`. Subtracting the 100-tick countdown gives 31379 active ticks,
**26m08.95s**. This single FFA does not replace the two-human same-App pair.
All four players spent/earned ordinary resources; the complete replay contains
3496 shots, 170 destructions, 30 completed structures and 185 ready units. The human
spent 60,785.923 credits, including 1,585.923 paid repair, with 58,800 income.

Reconnect, visible-enemy ownership rejection, committed result, normal-menu
archive, unchanged App/document and final menu resource checks all passed.
Art resident/picking bytes, frame subscribers and match transports/sockets returned
to their original zero baseline; the original validator and bounded idle Pixi
decoder pool remain. No actual eliminated-human/frozen-view path occurred because
the sole human won; a fresh 3H recovery course is still needed. The client reported
79 fallback IDs, retained exactly in the compact receipt.

Replay SHA-256 is
`0586defa052904d795074f6d97926b14c27293efe2b08533fa9ebce310721c62`.
Full replay, final checkpoint and midpoint 15739 save/restore continuation agree on
`7378d9dd1694bc4d6f7aaaa2ab8828e64b5e742091cf70fdbf17ae187c4bdfe2`.
Browser/host closed 10:06:04 UTC; native audit closed 10:06:28 UTC. Driver exit 1
correctly preserves strict failure. No next case was launched; root took the
browser lane for the independent APC course.

All 1,131 raw CDP failures match the independent PW count and have distinct CDP
RequestIds, Fetch resource type, status 200 and `net::ERR_ABORTED`. There are
1,121 GET art requests (371 JSON / 750 PNG) and 10 POST advice requests. 1,116 occurred
during readiness and 15 during combat. The status callback preceded every failure;
none had `loadingFinished`. There were zero page/console/HTTP errors, collector
faults or rejected application advice calls. Those successes **do not** prove
complete native bodies for the failed request identities.

This driver collected no JS-reader EOF/chunk hashes, initiator stack or proven
window-fetch realm. The native-response classifier therefore cannot retrospectively
classify these requests; all remain unresolved strict failures. The independent
small Chrome primitive course is relevant context, not an attribution or waiver.
A new bounded readiness/paid-opening trace is being prepared separately: prove
actual consumed chunks/EOF and exact request/realm/ordinal/order, keeping failures
before versus after EOF and any real cancellation separate. No identical long
match needs repeating merely to investigate asset-preflight diagnostics.

The run started on battery at 76%, ending at 59%, while the sole Blender remained active.
Its original free-text conditions argument incorrectly says AC; the explicit
`launch-conditions-correction.json` and actual power samples preserve/correct that
reporting mistake without changing the original driver output. No timing or
reference-hardware claim is made.
