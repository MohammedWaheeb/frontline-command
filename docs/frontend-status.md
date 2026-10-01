# Product interface status

The React/Vite application is now a connected local product slice. It is not the
completed release. Codex continued implementation after the exact-model Claude
jobs exhausted quota, under the user's explicit authorization. Existing Claude
fonts, tokens, art and the approved charcoal/olive/brass direction are retained.
No deployment was performed.

## Implemented and connected

- One `Application` owns the real `SessionController`, actual Go validation
  worker, content library, local IndexedDB store and campaign progression.
- First-run language (currently English), UI scale and sound consent choices
  persist. Local solo does not create an account.
- The command center lists actual installed content. Skirmish selects a real
  Go-validated map, faction, zero to three Go AI commanders, difficulty and an
  optional two-versus-two team arrangement when four slots are selected.
- Tutorials and four six-operation campaign sequences use `CampaignJourney`
  availability, completion and difficulty. Missing content and locked missions
  are not represented as playable.
- A real battlefield renderer receives authorized Go snapshots directly; HUD
  React updates are limited to roughly ten per second. Initial battlefield art
  finishes loading before the offline clock is resumed.
- Selection, box selection, type selection, groups, mouse presets, keyboard
  movement, camera, targeting and commands use existing runtime utilities.
  Source selection/session/target identities guard asynchronous advice.
- The connected command console displays actual credits, power, energy, supply,
  production capabilities, jobs and paid/unpaid queue state. Construction and
  production readiness use Go production-status affordances in one request. Prerequisite failures are shown in
  disabled production buttons. Indeterminate placement is never green approval.
- Solo pause/resume, speeds, manual save, save listing/loading, restart, replay
  archive/opening and return to command center use the real session controller.
- Accessibility/settings use serialized CAS writes, conflict-checked full key/mouse remapping, camera tolerances, minimap and interface scales, team palettes, independent audio levels and next-operation art quality.
- Finished snapshots show actual postmatch debrief values. Campaign awards use
  genuine completed solo state, never replay playback or practice.
- Content installation uses the real pack installer/service worker. Development
  deliberately reports that a production build is required for an offline pack.

## Current acceptance evidence

`client/scripts/ui/product-smoke.mjs` drives Chromium against the real product,
actual Go/WASM and installed Copper Junction map. It verifies:

1. First-run setup and skirmish launch.
2. Power station placement through pointer targeting (Go credits 6,000 → 5,500).
3. Headquarters engineering-rig production appears in the Go queue.
4. Manual save, returning to menu, finding and loading the saved operation.
5. Restored paid economy matches the saved operation.
6. Actual screenshots at 1600×900 and 1280×720; measured unobstructed battlefield
   is approximately 70.96% and 70.54% respectively at default UI scale.
7. The 150% options interface remains scrollable and operable.
8. No JavaScript exceptions, Vite overlay or failed HTTP responses in a passing
   run. The JSON evidence records the current result; earlier failed runs were
   corrected rather than being reported as passes.

Evidence lives in `work/evidence/product-ui/`, including `smoke-results.json`,
`battle-1600.png`, `battle-1280.png`, `placement.png`, `skirmish-1600.png` and
`options-scale150-1280.png`. The screenshots were opened and inspected.
The Browser skill is not available in this session; existing Playwright was used.
This is desktop Chromium evidence, not complete cross-browser release acceptance.

`node --test client/scripts/ui/art-plugin.test.mjs` verifies incomplete sprite
exclusion, atlas traversal rejection, exact build file hashes/sizes, stable
manifest regeneration and rejection of an offline pack without a Go runtime.

## Packaging

`client/scripts/ui/art-plugin.mjs` serves repository `content/` at `/content/`,
actual art at `/art/`, and local fonts at `/assets/fonts/`. It never rewrites source
content or the asset pipeline. Vite also bundles the generated token CSS's actual
local font/material references. Production output copies only runtime assets,
fonts/licenses and JSON content. It creates `/assets/packs/base.json` with
pack ID/version `2.0.0`, every built runtime filename, SHA-256 and exact byte size.
The manifest excludes itself and optional source maps. Missing actual Go/WASM
prevents an advertised offline game pack. Runtime and content versions must be
rebuilt together after Go/protocol/content changes.

Use `npm run dev`, `npm run typecheck:app`, `npm run build` and `npm run preview`
from `client/`; the Go runtime is generated with `npm run runtime:build` before
building the product. Existing runtime commands are preserved.

## Remaining required work

- Full four-faction campaign/tutorial/co-op completion through the product. T5
  Syrian launch is verified; it is not a full mission playthrough. T1 input
  reminders track real gestures/order results, but complete guided acceptance
  and its relationship to world-victory timing still need review.
- Final human listening/mix review of the complete audio pack. Cold offline
  playback, captions, buses and lifecycle checks are documented below.
- Complete required art coverage and polish. Delivered art is used directly;
  temporary visual substitutions remain a release blocker and are disclosed.
- Authoring every scenario through the editor UI has not been accepted. Local
  drafts, actual Go path/sight preview, private/public map sharing and operator
  moderation are connected; their bounded acceptance is documented separately.
- Broad accessibility, long-session memory/performance and cross-browser product
  acceptance. Existing runtime and renderer tests are not substitutes for all
  end-user flows.
- Multiplayer acceptance is tracked by the separate network lane. The core now
  mounts real LAN/profile/lobby/social/co-op/sync/report/rematch and observer
  components; their individual acceptance results must be read with their tests.

## Visual mismatch ledger

The reference requirement is the inspected Generals/Red Alert sidebar study in
`work/claude/06-rts-reference-study.md`. The application now uses a connected right
production appliance, short attached resource shoulder and shaped lower selection
tray, with more than 70% unobstructed world at both default desktop sizes. An
initial overly bright metal texture and compressed/overlapping cameo rows were
found in actual screenshots and corrected with a quiet dark material layer and
fixed-height scrollable build tiles. Missing building illustrations, field art
coverage and unit silhouettes remain asset delivery gaps. They are not fixed by
calling the interface finished.

## Packaged offline launch verified

The production browser check in `client/scripts/ui/offline-smoke.mjs` installs the
actual roughly 89 MB base pack, disables all browser network access, reloads the
page, starts the actual Go/WASM Copper Junction skirmish and opens its production
controls. This now passes with no page exceptions. Evidence:
`work/evidence/product-ui/offline-results.json` and
`work/evidence/product-ui/offline-skirmish-1280.png`.

This test discovered a real packaging/runtime integration defect: Vite serves
JavaScript/CSS with `Vary: Origin`, while pack installation stored URL-only cache
keys. Cross-origin-mode module requests then failed cache matching and returned
503, producing a blank page. After exact size and SHA-256 verification, the
installer now drops Vary and transfer Content-Encoding/Content-Length from the
new response containing decoded immutable bytes. Content type and cache policy
remain, and the source response is unchanged. The focused regression and all
122 runtime tests pass. Private API and authenticated-request cache exclusions
are unchanged.

The current production build includes all31 mission JSON files and passes exact
hash/byte verification for every generated pack file. This packaging result is
not proof that every mission has been completed or that every visual asset is
finished. The new briefing screen displays validated mission prose, objectives,
failure/rule disclosure and a static terrain survey. T5 faction selection sends
only the chosen `tutorial_faction` option to Go; the frontend does not rewrite the
mission roster.

## Connected solo journeys and additional evidence

The product now includes Continue, validated mission briefings with terrain
surveys and T5 faction selection, Help, full remapping, local import/export/delete,
replay seek/speed/perspective/log controls, practice tools and a saved-draft editor.
Editor operations use the existing bounded document model. Go owns validation,
pathfinding and sight previews; the UI draws returned routes/tile indices only.
Go's adjusted route destination is explicitly described rather than shown as the
requested destination. Editor test play returns to the preserved draft/history.

`solo-journey-smoke.mjs` passes actual Chromium remapping, T5 Syrian briefing and
live launch, real replay archive/opening and command-log/speed controls.
`practice-editor-smoke.mjs` passes real practice credits and force placement,
terrain painting, undo/redo, Go validation, actual Go route/sight previews, saved
draft test play and return to authoring with history intact. Evidence JSON and
screenshots are in `work/evidence/product-ui/`; the editor preview and T5 images
were opened and inspected. These are interface proofs, not full mission victory
or balance acceptance. Scripts suppress Vite hot-reload messages during their
run so independent active edits cannot replace the running application mid-test.

Tutorial input memory is separate from campaign rewards, keyed by mission and
version. Only actual owned selection/box gestures, group storage/recall and real
accepted/rejected order evidence advance reminders. It persists through local
CAS storage, merges concurrent tabs, isolates versions and preserves incompatible
records. The focused tests and the then-current full136 runtime tests passed.
Campaign completion still requires a genuine final Go outcome; online progress
additionally requires a matching committed host result and final mission snapshot.
A defeated commander's stale snapshot cannot invent medals after a teammate wins.

Required asset preparation scans actual selected-faction metadata/atlas images,
terrain and neutral props. All referenced files must fetch and decode before
readiness. Work is bounded, reports model/image counts, and honors solo loading
cancellation. Missing roster art is counted separately as a development fallback,
not a completed art pack. Preflight does not retain every roster atlas in GPU
memory. Application serializes old-scene art release before starting the next
renderer. Observer sessions skip advice/orders/pause and never display a prior
session's snapshot while the host's delayed timeline is buffering.

## Recovery, debrief and lifecycle check

`assets-debrief-smoke.mjs` passes in actual Chromium at1280×720. Injecting a503
for a required sand texture prevents the session from being installed and shows
an actionable failure. Removing that failure lets the same requested skirmish
launch. Normal validated surrender produces the Go defeat/debrief, actual
telemetry graph and operation timeline. Returning to the command center reports
zero resident atlas pages. Evidence: `assets-debrief-results.json`,
`asset-failure-recovery.png`, `postmatch-telemetry-1280.png`; the debrief screenshot
was opened and inspected. The script's first cleanup assertion used a nonexistent
statistics property; it was corrected to the real `residentPages` getter and the
whole journey rerun successfully.

The debrief now provides Go-recorded income/spending/Supply/station graphs,
production counts, repair/missile spending, interceptions, losses, exploration,
station control and bounded events. It is rendered only after a finished outcome.
Observer debriefs say “Observed operation ended”; they never assign the viewer a
win or loss. Online menus explicitly say the match continues unless shared pause
is granted. Selected-unit state shows authorized ammo, endurance, home/service,
cargo, charges and transport information. Build targeting reports Go placement
feedback and public catalog price/power demand. Screen shake is connected to the
renderer’s tested reduced-motion/flashing and zero-value overrides.

## Audio runtime integration and acceptance

The product now connects saved explicit sound consent and trusted browser input
with a real WebAudio mixer. Master, voice, music, effects and interface controls
apply independently; withdrawal suspends output immediately. Selection responses
use owned units, and command acknowledgments use actual Go order receipts.
Permitted Go events drive weapon/impact/destruction sounds and priority warnings.
Owner-only power, ammo, charge and cooldown transitions, host teammate status and
public endgame indicators provide their corresponding cues. Six-second spatial
warning bundles and a 2.5-second selection cooldown limit repeated chatter.
Warning captions remain visible with muted or disabled sound; existing tactical
markers remain independent of audio and the captions preference.

The mixer validates a bounded audio index, exact primary/fallback file hashes,
decoded duration and channel count. It limits decoded memory to 64 MiB, concurrent
decodes to four and active sources to 24. Three faction music layers share one
start origin and crossfade gains. Operation changes abort fetches, invalidate late
decodes and clear buffers/sources. Seek, reconnect and perspective changes establish
an event baseline rather than replaying historical warnings. Focus loss suspends
output; a trusted gesture resumes it. MP3 fallback is attempted only for a genuine
codec decoding failure, not for an integrity failure. The asset pack checks both
codec versions and includes audio provenance/notices.

Evidence in `work/evidence/audio-runtime/`:

- `chromium-results.json`, `firefox-results.json`, `webkit-results.json`: actual
  WebAudio diagnostic playback passes consent denial, synthetic-input rejection,
  measurable signal, independent buses, critical interruption, muted captions,
  deduplication, focus handler suspension, synchronized layers, cached playback
  with networking disabled, late-load cancellation and three cleanup generations.
  Browsers were Chromium 151.0.7922.34, Firefox153.0 and Playwright WebKit26.5.
  These are browser-engine checks, not physical Safari/Edge certification or
  proof of audible speaker quality. The fixture uses a generated PCM test signal.
- `product-results.json`, `accepted-stop-caption.png`: the actual product with
  real generated audio assets passes first-run sound consent → menu music → Go
  skirmish → engineering-rig selection → accepted stop receipt → three synchronized
  battle loops → sound withdrawal. No page exceptions or failed requests. The
  screenshot was opened and inspected at1280×720; both verbatim captions are
  readable above the selection tray.
- `work/audio-runtime-tests.log`:148 runtime tests pass, including new hostile
  index/bounds checks, location cooldowns, event deduplication, seek/reconnect
  baselines, ownership, receipt handling and public/owner-only state transitions.
  Both TypeScript checks and five asset-pack tests pass.

The first WebAudio run caught and fixed an unbound native fetch call. A later
fixture run was interrupted by Vite hot reload while another author changed files;
its isolated browser socket now suppresses hot reload and the full flow passed in
all three engines. Neither failure was hidden as a successful test.

At this earlier audio checkpoint, the remaining items were final listening/mix
review, a frozen complete audio export followed by a new cold offline-pack journey, continuous ambient/engine
loops, material-specific impacts, and exact Go signals for enemy strategic readiness
and an aircraft loss specifically caused by emergency/endurance. Current generic
destruction sound does not invent a cause. Full roster art, all authored scenario
acceptance and the broader release gates remain separate completion requirements.

Before audio authoring began, the previous complete product pack (673 files,
119,120,234 bytes) was independently hash-verified and passed real network-disabled
reload into Go skirmish. That result does not claim cold offline audio coverage for
the then-growing audio pack.

## Audio finishing pass

The previous pass's ambient/engine gaps are now implemented. One map bed plays at
7% clip gain; at most three nearest on-screen current actors contribute engine,
rotor, drone or movement sounds with stereo placement. Public map presentation
selects the bed. Remembered fog markers never enter selection. Authored jet passes
use an eight-second cadence; the other engine loops preserve their authored loops.
Renderer bounds are refreshed every 150 ms to track camera motion. Pause, fog/removal,
focus loss, stale frames and operation disposal stop continuous sources. Ambient
and engine audio are effects-bus sounds and honor its independent volume.

Public enemy strategic progress now triggers only on a non-allied transition from
below 1000 to 1000. Initial snapshots, replay seek and reconnect never produce a
catchup alert. The owner-only `aircraft_endurance_lost` event selects the corrected
landing-slot-loss line and suppresses the same actor's generic unit-loss warning.
Material impacts require an explicitly identified currently or immediately
previously authorized target; missing identity stays a ground impact.

The three browser-engine suites pass again with continuous-source count/stereo/
removal checks. A fresh actual product journey moves a Go engineering rig, observes
its real engine loop and map bed, then uses normal Go pause to stop both. No page
exceptions or failed requests occurred. 156 runtime tests pass, including new pure
scenarios for viewport order, fog/embarked/dead exclusion, threshold transitions,
material identity and duplicate-loss suppression. These extend the existing audio
evidence files; they do not replace listening review. Final cold offline audio
verification waits for the coordinated Go/audio freeze.

Audio options also pass a 1280×720 / 150% UI-scale check: the scrolled audio section
remains operable, the explicit consent checkbox plus test button starts sound, and
the independent voice slider reaches zero. `settings-results.json` and
`settings-scale150.png` record this check; the screenshot was opened and inspected.


## Cold offline audio package verified

The production snapshot built on 2026-09-28 passes a fresh Chromium 151.0.7922.34
journey with browser networking disabled after pack installation. A fresh document
starts with no AudioContext; trusted input starts the bundled menu theme, and the
actual Go skirmish then plays all three battle layers, ambience and owned-unit
selection/accepted-stop responses from service-worker cache. The measured output
signal is nonzero. No page exceptions occurred. The captured battlefield screenshot
was opened and inspected; the verbatim captions remain readable above selection.

Evidence is `work/evidence/audio-runtime/cold-offline-results.json`,
`cold-offline-audio.png` and `pack-snapshot.json`. The pack contains 2,722 files and
291,767,909 bytes. Every file was independently checked against its exact size and
SHA-256. Manifest SHA-256:
`375508dc288a7dcbebec5e501c9b4e8718103fe79701f994f86c29124a43dd52`.
The snapshot uses adapter 1, protocol 1, simulation 0.2.0 and Go 1.27.1; catalog hash:
`318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`.
The evidence records the exact WASM and audio-index hashes as well.

This is a local development pack snapshot, not a complete-release declaration.
The audio export contains 892 clips / 620 events and its separate signal/integrity
checks passed, but listening/mix review remains pending. Art production continued
outside this captured package; incomplete visual coverage and all remaining authored
content, accessibility and long-session acceptance gates remain visible in their
respective status documents. No deployment was performed.

## Local map publication and moderator product acceptance

Multiplayer → Maps now exposes validated private upload reviews, explicit
publication/unpublication, owner attribution, private custom operations and
profile-isolated map reports. The editor saves its draft before preparing the
same upload review. Host operator station uses a separate memory-only credential
and actual loopback authorization for preserved map evidence, completed incident
replay downloads, append-only review decisions, removal and private restoration.

A fresh isolated Go host and three browser profiles verified private-map
visibility, invited play by two real commanders, an active author edit followed
by fresh-document reconnect to the original battlefield, observer grant gating,
publication, reporter isolation and operator removal/restoration. Profile
changes clear private network data. The test also found and fixed automatic
re-entry after returning from an active online session to the command center.
See [map-workshop-ui.md](map-workshop-ui.md) for exact evidence and remaining
archive/progression synchronization limits. This does not certify physical LAN
hardware, human moderation judgments or final release readiness.


## Campaign account copies and portable archive acceptance

Multiplayer → Save copies now compares the separate campaign ledger with explicit
upload/download/skip choices and revision protection. SQLite schema 8 stores this
profile-owned story backup. It cannot create rated results or authenticated match
history. The UI shows both mission/version/difficulty records and timestamps;
whole-ledger replacement avoids inventing a merge of aggregate completion counts.

Archives larger than 64 items or 256 MiB enter a searchable paged selection view
before save payloads load. Metadata-only local cursors and host `bytes` summaries
measure both reviewed versions; unknown legacy sizes reserve 64 MiB. Changed
selection revisions reject before download. Only selected saves are fetched.

Load operation and Replay archive now expose browser-backup export and reviewed
restore using existing atomic local CAS. Campaign records are schema validated;
unsupported originals remain exportable in a recovery-file list. Editor drafts
retain their separate explicit portable export/import. Credentials are excluded
from normal backup files.

The three-context Chromium 151.0.7922.34 product run on 2026-09-28 passed cold offline
Tutorial 1 completion from a genuine ordinary-Go-orders midpoint checkpoint,
visible backup export, profile upload, fresh-browser download/reload and completed
tutorial display. It also exercised 65 real validated host saves (automatic picker
and exactly one chosen save fetched), a separate profile with no foreign files,
portable editor draft transfer, explicit campaign/replay backup restore, and
replay watch without another completion award. Desktop and 800 px selector/review
screenshots were inspected; page and console errors were empty.

Evidence: `work/evidence/campaign-sync-ui/`. Full server/storage race and vet
passed; 184 runtime tests and both TypeScript checks passed for this lane. The
product bundle was isolated and reused its captured Go/WASM version; no deployment
or shared production pack rewrite occurred. This is not physical multi-device,
all-browser, every authored mission, or final release acceptance. See
[account-sync.md](account-sync.md) for service contracts and remaining limits.

The profile panel also supports an explicit private sign-in-key file export and
import. It is separate from ordinary backups, bound to the exact host origin and
verified profile, and never enters public state or logs. Product acceptance uses
this visible path for the second browser. Cursor-based browser-backup generation
bounds archive memory while preserving original engine bytes.

Final follow-up: the fresh 2026-09-28 product run used the dedicated sign-in key
export/import controls and passed all archive/campaign checks with zero page or
console errors. Native browser integration also passed Chromium, Firefox and
WebKit for key-file verification/exclusion from backups, real Go account/save
copies, cursor-based backup/restore, revision conflicts and recovery originals.
The product UI journey itself was exercised in Chromium; the other engines were
nonvisual integration checks. All 184 runtime tests and both TypeScript checks
passed. No extra Go or deployment changes were made during this follow-up.
