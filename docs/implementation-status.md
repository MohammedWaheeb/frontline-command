# Frontline Command implementation status

Updated 28 September 2026, 20:37 UTC / 23:37 Qatar. **The full game is not ready for release.** Continue the complete handoff; do not deploy. The previous detailed state is preserved in [history](history/implementation-through-2026-09-28-0933.md). Dated updates supersede earlier in-progress receipts.

## Current update at 21:00 UTC, 28 September

The game remains an incomplete development build. Nothing has been deployed.

- The fresh optimized four-human match passed strict ordinary combat, ownership rejection, host reconnect, eliminated-host frozen view, history and exact replay checks (`cb6ac54`). Team 2 won at tick 12745. All four clients had zero unexpected page, console or HTTP errors. This is local multi-browser evidence; physical LAN and all six configurations on the same final product are still pending.
- The revised menu and console passed actual product checks: four desktop aspects, 150% navigation/options, real paid production, status, saves, read-only replay and LAN landing. Original painted menu art is installed as optional development art with byte-exact offline packaging. See `work/art/menu-keyart-generated-v3/acceptance.md`.
- The combined 688-actor native course passed with 64 aircraft returns and 24 actual strategic interceptions. Save/restore and full/checkpoint replay agree. Browser load and quiet performance remain open (`work/combined-load-current/README.md`).
- SA05 Hard now passes its main and service-preservation optional route using a corrected legal commander cohort (`278b46d`); all 661 orders were accepted. SY03/SY05 and the consolidated current matrix remain under test. The historical broad totals remain 93/102 main and 12/21 optional until rerun.
- Claude's exact-model console source is accepted within the tested UI scope. Its partial explosion source is preserved; Codex is correcting sampling and completing the packer under quota fallback. Next recorded Claude reset: 29 September 01:20 UTC / 04:20 Qatar.
- Mencius owns all Blender production and service/payload polish; Einstein owns same-page long multiplayer acceptance; Boole owns mission-driver corrections and reruns; root owns FX, menu packaging, combined browser load and integration. Full art/FX/audio review, remaining gameplay acceptance, long sessions and clean final packaging are unfinished.

## Current update at20:37 UTC

The shared shipping runtime remains0.3.3. The isolated optimized0.3.4 candidate
is still the356-file `c7e0d79d…` source with WASM `f37220a4…`; no promotion or
deployment has occurred.

- **Multiplayer:** the second optimized four-human2v2 match reached ordinary
  team1 victory13475, and eliminated-host history, frozen-view preservation and
  exact archived replay passed. Its strict browser result remains failed because
  of one early `advice_timeout`503. Full/checkpoint/midpoint replay agrees at
  `032d1c08…`. The first quiet attempt was interrupted before any game command:
  macOS power logs show low-power sleep from16:26:23 to20:09:54. It is preserved
  in `ceed5e0`, not counted as a gameplay or advice test. A fresh unchanged
  four-human course started20:25UTC on AC power with heavy work held and scoped
  idle-sleep prevention. It is still running; zero unexpected errors at the last
  tick10456 receipt is progress, not a final pass.
- **Multiplayer UI:** `1bef5c5` replaces the defeated online player's misleading
  LIVE badge with FROZEN and stops displaying stale teammate/latency/pause rows
  after a committed result. Three focused tests, both TypeScript checks and
  actual component captures at1280/1600 and100/150% pass. The four-player
  comparison intentionally uses its earlier unchanged client.
- **Aircraft payload:** `d49c33f` uses current owner-only ammo for empty payload
  poses, preserves action/flight timing, and hides stale loaded textures during
  asynchronous page changes.354 runtime tests and both TypeScript checks pass.
  `7344048` adds actual Go fighter and gunship courses through last shot, paused
  service, home loss, emergency departure, backup service and refill. Both pass
  exact save/restore/replay;40 actual owner/enemy-view renderer checks pass.
  Full payload artwork and browser pixel acceptance remain pending.
- **Missions:** main matrix93/102 and optional12/21 remain the preserved broad
  results, with additional individual tactics improvements separate. The
  unchanged SA05Hard rerun now exports its full failure state (`9cc75c0`): at
  tick6856 it is nonterminal, two relays are owned, a healthy tank is reserved as
  a guard and a paid replacement is nearly built. The fatal assertion is a
  commander-cohort error, not mission defeat. Boole has prepared a separate
  driver-only correction; its execution waits for the quiet match to close.
- **Art:** all four distinct interceptor pilots have passed bounded technical
  and native identity reviews. US, IR and corrected SA producer pilots each
  pass340 checks; the original SA arm/door contacts remain preserved. Claude's
  new review requests clearer team/disabled/service/critical states and neutral
  airlift service-cart materials. Mencius owns their isolated correction and
  every Blender job. SY and payload pilots plus complete exports remain open.
- **Claude:** exact `claude-opus-5-5` was verified again after20:20UTC, fallback
  disabled.01 completed its visual review;05 completed console/menu source edits
  and both TypeScript checks.04 wrote an incomplete FX source foundation before
  quota, with no complete pack or native acceptance. The next recorded reset is
  **29September01:20UTC /04:20Qatar**. No early retry; Codex continues authorized
  fallback work. Use fresh bounded briefs next time instead of replaying large
  obsolete sessions. Actual model and quota receipts are in `work/claude/`.
- **Menu/UI:** Claude removed the old portrait filter/zoom from the painted menu
  integration and retained the canvas fallback. Browser review is pending. Root
  generated a third original painting following Claude's concrete responsive
  composition brief; exact PNG provenance is preserved in
  `work/art/menu-keyart-generated-v3/`. It is a review candidate, not final art.
  Optional offline packaging is being integrated; manifest final status stays
  withheld until actual product review.

Root has also prepared a current combined688-actor/64-return/24-interception
browser-load exporter. It has not run yet. Complete roster/FX/audio review,
remaining missions and counterplay, long-session/current-art performance and
clean local/offline/save/replay/LAN/package gates remain mandatory.

## Ownership snapshot at16:12 UTC (superseded by the current update)

Shipping Go remains **0.3.3**, protocol1, adapter1, content2.0.0; hash `318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`. It is the sole authoritative simulation shared by native hosting and WASM. Shipping runtime stays frozen while isolated parking and tactical-view/route advice candidates are tested; promotion is pending.

Claude returned after the13:30UTC reset. Actual assistant-message model **claude-opus-5-5** is verified for all three assignments, with fallback disabled.01 completed its36-image read-only review;04 and05 then hit quota again, reporting the next reset at18:30UTC /21:30Qatar.04 produced no FX files;05 left three bounded UI edits. Root's old04 resume failed locally with “No conversation found,” without a model request; the fresh assignment succeeded. No sign-in is needed. Current briefs supersede all earlier broad scopes; Codex is again continuing under the authorized fallback.

- Claude04 uses `work/claude/04-original-effects-current.md`; session `b702b13f-1c49-4a0c-af9e-0d76be39447e`. Claude05 uses `work/claude/05-console-polish-current.md`; session `e3cd88fe-799f-407d-9a20-ea24f46855ee`. UI excludes App, editor and error dialogs. Browser/build work waits for coordinated host capacity.
- Mencius is the **sole Blender worker**. Original-size fighter544/airlift672 exports are staged. Root accepted six actual-Go native source compositions; browser sorting remains open. Airlift service motion is static and remains a defect. Mencius owns its isolated correction, four-battery interceptor/structural-charge pilots, the remaining94assets/18,139poses, and a clearly diagnostic six-scene atlas overlay.
- Einstein completed tactical/Skybreaker/wire, combat audio and synthetic FX renderer acceptance. It now owns six ordinary paid-combat multiplayer cases in a frozen isolated0.3.4 product, covering1–4 human clients and deterministic bots. First1H+1normalAI match passed ordinary elimination/reconnect/replay; the1H+3AI FFA exposed a texture-lifetime error. Its exact replay validated; fix de1b27f passes three-engine pressure/reappearance tests and the earned replay. Four remaining human configurations are running serially.
- Boole owns frozen combined0.3.4 acceptance. The original102 main cases finished93pass/9fail; the original21 optional routes finished12pass/9fail. Next is a separate acceptance-driver-only tactics correction copy, with no production, objective or deadline changes.
- Root completed combat renderer/reset1305dcb and owner-casualty47f35c7. Root now owns isolated owner-ranges projection/readout plus sprite/terrain depth integration and final cross-system review. Shipping Go0.3.3 and combined frozen0.3.4 remain unchanged while these gates run.

The user permits Codex frontend logic and visual implementation during Claude quota. Claude remains primary visual author/reviewer. All old broad briefs are superseded by current explicit ownership.

## Verified checkpoints and exact limits

| Area | Evidence | Remaining limits |
| --- | --- | --- |
| Go mechanics |75units/28weapons/19building types/10upgrades; combat/economy/fog/transport/air/factions/save/replay suites | New parking candidate and human balance need acceptance |
| Bots | All13 authored0.3.3 games reach ordinary elimination, economy gates, exact restores/full replays | Eight actors destroyed after planning and two moving-placement conflicts individually classified |
| Missions |102 main victories/save/replay/restart/surrender on preserved0.3.0,12 loss paths | Current full rerun and additional product playthroughs remain |
| Optional routes | IR05/SA03/SY02 all difficulties0.3.0; US04 evacuation/paid repair all difficulties0.3.1; IR06Easy/Normal0.3.3 | IR06Hard/SY01/SY05 additional objectives under tactical testing; no failed run called a pass |
| Runtime |0.3.3 native/WASM parity, old-version rejection, save/offline/account/sync/two-browser lifecycle on Chromium/Firefox/WebKit | Physical Safari and final packaged acceptance pending |
| Multiplayer | Six rendered1–4-human cases including bots, paid actions, independent production, reconnect/surrender/rematch on frozen0.3.1 | Not physical LAN proof or six ordinary combat wins |
| Console |7133ada: warm console/menu, 0.3.3 paid queue/cancel/build/save and replay flow; native1280/1600 at100%/150%; menu resize/remount releases226 weak atlas references | Main key art rejected; staged decorative diorama is not final key art |
| Terrain |3a4e550: completed calmer v3 materials, opaque world-aligned cliff faces and adjacent gravel; real Go height/build/flight/Return/save checks pass | Farmland material remains unwired with a flagged seam; final complete-art visual review pending |
| Tactical overlays |2637679: actual0.3.3 warnings/zones/raid exits/intent/pings/endgame minimap, exact save/replay and14 renderer groups | Optional wire consumption and owner route preview now pass isolated candidate courses;132 effects art remains incomplete |
| Capture art |6758513: real workshop/safehouse/power capture, retained foundation and correct art identity, exact save/rewind;14 renderer groups pass | Workshop/safehouse full sheets absent; procedural views are functional evidence only |
| Copper scenery |32f223b:10 mirrored entries, real paid economy/scouting/garrison/damage/destruction,21 exact no-scenery mirror hashes | One map; remaining maps not fully dressed |
| Editor |1c3ea2a: four starts/two regions on64×96 map, real icon sheets, undo/redo/resize/reload, Go previews, practice-return and missing-art fallback, exact draft hashes | No environment-sidecar authoring/export extension |
| Packaging |26e20f6: exact optional scenery hashes/path bounds and prior-pack preservation;7 focused tests; notice survives long loading | Final complete local package still pending |
| Performance | Historical M4 Metal20TPS course remains preserved; new quiet same-save/runtime courses fall to9–13TPS while hashes/restores pass | Active performance failure. Mesh-packing profile and exact viewport-culling candidate under investigation; no current performance acceptance |
| Audio |892 clips/620 events; integrity/decode/loop and cold-offline playback checks | Listening/mix/full presentation review remains |

Both TypeScript checks and327 runtime tests passed at the combat renderer and FX lifecycle checkpoints. Shipping0.3.3 native short and actual three-browser integration pass; full0.3.2 short race plus focused0.3.3 correction race pass. Do not relabel historical reports as covering new changes.32 maps/31missions were checkpointed inee97df3 after content validation; that validation alone does not prove balance or mission completion.

## Art and aircraft decisions

Eight logistics assets and21 formerly missing props are rendered/checked. Eleven of24 infantry assets are complete. The US non-service batch plus IR/SY repairs now contains14 complete exports and631poses with340 world/280 UI technical checks. US interceptor charge/launch native readability is explicitly withheld; remaining faction buildings/infantry production remains.21 building pilots cover18 role families; pilot approval is not complete full production. Bindings cover all75 units and61 faction/building variants. APC source correction is protected by626649d;27 ground-combat production remains approved.

The three repair depots' isolated arm correction passed27 selected world views,81 layer bounds,84 resets,60 UI checks and exact56-other-assets/2534-pose parity. Root viewed all3 native contacts and accepted this bounded correction. Live building source promoted to `a9054656…`; failed US output is hash-preserved. All three repair depots are now rendered. US interceptor launch readability needs a separate bounded correction. Always read the full exact source lock.

**The common0.3896725 aircraft shrink was rejected.** The scout becomes a speck and fighter/airlift look toy-sized beside ground units. Original readable geometry stays unchanged. All5 proposed exterior service compositions passed root native review. Full11-aircraft candidate production is now authorized under work/ staging only, with US fighter/airlift prioritized after the current US building batch. Shipping promotion waits for actual Go parking/render integration.600mt is the design's combat/collision radius, not a requirement that every cosmetic wing/rotor fit inside it. Current1300mt parking centers cause real intersections.

[The backend review](service-parking-review.md) proposes fixed operational parking radii, exterior-only pads outside the retained solid foundation, stable persisted final-approach reservations, and shared ground navigation/construction exclusion. Combat radius/range, airborne separation, capacity, costs and service timing remain unchanged. This is a real gameplay change, implemented only in an isolated candidate until numeric/performance/native-layout gates pass. Exact ground path edges and boarding contact must honor these discs. The old dense64 fixture has no legal room for its larger parked wings and remains a recorded failure; a compatible layout passes. Actual six Go service layouts/save/replay/native-WASM checks exist; root accepted all six native source contacts after325 checks. Browser billboard sorting remains pending; two IR.strike views are labeled legacy fly-frame shape references. Grounded boarding/regression and quiet ABBA performance gates pass; the larger parking layout remains an explicit tradeoff. No mesh data enters Go. Earlier shallow service-building candidate remains unaccepted. Tested pure service-surface parser is not wired into shipping metadata; exterior ground needs no deck lift.

## Remaining full release work

Complete all required sprites/poses, terrain/effects, UI/key art, portraits/icons and audio presentation, then review actual gameplay with complete art. Main-menu key-art preview remains rejected for occlusion, clipping and weak depth. Follow [actual C&C references](../work/claude/06-rts-reference-study.md): original stylized silhouettes, rich readable battlefields and warm gunmetal/olive/brass command machinery. Blue is tactical team paint only. Repeated cracks, flat terrain and abrupt fog edges remain under Claude review.

Finish optional/current campaign acceptance and rendered product journeys; review human counterplay and audio; run two long games, maximum combined load, final local packaging and clean-install/save/replay/offline/LAN acceptance. Record exact hardware and physical-network limitations. Plan future hosting only. A passing pilot, source model, partial roster or numerical suite does not make the full game ready.

## Active advisory API work

The isolated tactical wire candidate passes focused native tests for explicit projectile zero/false presence, public blast geometry, owner-only emergency takeoff, sanitized active actor effects and expiry/privacy, plus Skybreaker route advice through the actual host and WASM Session adapters. Skybreaker geometry is shared with actual launch; preview times estimate earliest next-tick execution and never sample hidden threats. Four map-edge plans are checked against ordinary actual launches. Native/WASM view/plan parity and the new client confirmation flow are being integrated; this is not yet the shipping runtime.

The apparent tactical replay mismatch was a harness request before a resumed recording's declared start. Both original0→4334 and resumed4334→4346 now pass with exact hashes; no engine change was needed. See [tactical acceptance](tactical-overlay-acceptance.md) and [console evidence](console-polish.md).

## Integration update at10:40 UTC

Combined0.3.4 is frozen under source lock `ed50966897139f973e143ba0f83c9776849b6d7924839c228238e7dc1370ed20`. Root reviewed the parking+tactical+combat three-way union; the version boundary is intentional because parking state and combat event metadata alter saved/hash state. Full native short, focused simulation/host/adapter/strategic-advice race checks and vet pass. Fresh native/WASM evidence matches six service layouts, fifteen combat artifacts, eleven tactical artifacts and eight codec cases. The serial main mission matrix is in progress:18/102 passed at the latest agent receipt, with zero recorded failures. This is not full current-version mission acceptance. The shared shipping WASM remains0.3.3, and the mixed development tree is not releasable.

Status/readout checkpoints d9a57b6/6611669 use exact active Go effects, owner-private ammo/emergency data and channel progress. Actual product tests pass1600/1280 at100%/150%, including Enter/Escape/focus and selection changes. The course exposed and fixed native-button keyboard handling plus a landed-aircraft Return label. Transport receiver context follows the exact active boarding target through Stop/save/restore/completion/replay. The APC still uses a stand-in, so open-door full-sprite visual acceptance is pending. See [status evidence](actor-status-presentation.md) and [transport evidence](transport-receiver-presentation.md).

FX infrastructure d06b1a9 adds optional pack compatibility, exact-byte/PNG/frame validation, low/reduced variants and a separate32MiB pending+resident graphics budget. Real insecure-HTTP Chromium151/Firefox153/WebKit26.5 courses verify uploaded pixels, stage rendering and two pages released to zero, with no application errors. Production FX art is absent and not marked complete. Combat presentation and audio are being integrated against explicit current-authorized event facts; no miss or projectile obstruction is inferred from a redacted impact. The design has no terrain/building projectile collision rule, so the current firing rules remain the default pending an optional user clarification.

Airlift and fighter are staging exports only. The native receiver binding audit is being refreshed; interceptor launch will gain a narrow `launch_empty` state for an owned battery's final charge, preserving generic launch for undisclosed enemy charges. Twenty-one prop provenance records and two marker layer records are being corrected to their actual frozen sources, without promoting quality/status. Complete roster/FX/main key art and final gameplay/packaging gates remain open.

## Combat integration update at11:10 UTC

Root's truthful combat facts/timeline/renderer now pass actual combined0.3.4
Chromium/Firefox/WebKit courses, including ordinary covered attack, landed armor,
source loss/conversion, full-tick decoy, fixed/mobile interception, save/replay,
paused/reduced/cull, raised ground/fog and Chromium context recovery. The additional
ordinary death course clears corpses after same-player load and short forward
seek. No missing outcome becomes a miss/blocked shot. The same327-test suite and
both TypeScript checks pass, with focused exact-grid traversal refinement checks.
The fourteen existing renderer groups also pass. See [combat presentation](combat-presentation.md).

Einstein's separate real-Pixi synthetic-atlas course1d90d51 passes three browsers,
all accessibility variants,688 essential marks/192decorations,32MiB pressure,
paused loading/trim and late disposal to zero. Production FX art remains absent.
Combat audio df3bbb6/7624f0c uses the same actual weapon/outcome facts; repeated
observer connection notifications no longer suppress audio. The actual native/
WASM course and restore-checked fixture scope are [documented](combat-audio.md);
no audible mix claim. The initial decoy microfixture was unsuitable for full
ordinary ticking;079b10a separately preserves a correctly initialized live
fixture. First attempts remain in evidence directories.

Current mission receipt:87/102 main cases finished,78pass/9fail. Six failures
reproduce exactly on0.3.3 after excluding only simulation-version/combat metadata;
three changed outcomes follow intended exterior aircraft spawn/return geometry
and later scouting/combat choices. All nine remain failed acceptance cases.
Frozen102+21 run continues unchanged; then Boole may improve only ordinary test
commander tactics in a separate copy, never weaken missions or deadlines.

Einstein now owns six actual paid-combat multiplayer cases using the isolated
0.3.4 host and product,1–4human clients with deterministic bots where appropriate.
These will distinguish DOM actions from scripted normal transport orders and
same-host browser tests from physical LAN. No combat win is claimed yet.
Mencius remains sole Blender worker, finishing the original-size672-pose airlift
before the six actual Go service compositions. Root approved native interim
boarding-door readability only; full asset/scene review is still pending.

## Owner casualty and acceptance update at11:31 UTC

The isolated [owner casualty correction](../work/owner-casualty-candidate/README.md)
restores the owner's destruction notification when the casualty removes the last
local sight source. It changes only the view predicate, passes native/WASM, codec,
focused race and vet, and preserves baseline save bytes/continuation hashes.
The full combat course plus a last-sight loss/audio-dispatch case passes
Chromium151, Firefox153 and WebKit26.5. A recording mixer checks one loss cue and
caption, not audible mix. Shipping and the original combined runtime are unchanged.

The unchanged main matrix is93/102 passing; unchanged optional routes12/21.
All nine failed main leaves and nine failed optional leaves remain preserved.
Boole now owns a separate test-commander tactics copy; route improvements must use
normal legal orders without changing the engine, mission, difficulty or deadlines.
Einstein's first paid normal-bot multiplayer battle is live, with combat losses
and reconnect observed, but no ordinary win has been certified yet.

All six actual-Go native parking compositions passed root review with325 checks;
renderer billboard integration remains pending. Original-size airlift672poses and
fighter544poses are staged; airlift service motion needs its approved narrow
correction. The US interceptor's isolated launch/last-charge pilot passes native
review; three other batteries, structural-charge variants and full exports remain.


## Current integration update at12:24 UTC

The [owner-ranges candidate](../work/owner-ranges-candidate/README.md) preserves
all eight baseline1,000tick canonical courses, matches41 native/WASM artifacts
and30 actual codec records, and passes focused race/vet. Product15-case courses
pass Chromium/WebKit and old-runtime absence passes Chromium. Firefox functional
checks pass but a pressed-button PNG console error remains an active browser
failure under Einstein's isolated diagnosis. The new readout also fixed WebKit
mouse-trigger focus restoration. No shipping runtime promotion.

The first real paid bot match wins by ordinary elimination at11224; exact full
replay/midpoint restore agree. The longer1H+3AI FFA completed at25826 but its
browser run remains failed: an evicted atlas left an actor holding a destroyed
texture. Fix de1b27f passes real192MiB pressure/reload/shared/disposal courses in
all three browser engines; actual earned FFA replay now renders without that
error. A late diagnostic harness interruption is recorded separately. The
remaining four human configurations are running serially. No physical LAN claim.

All four interceptor base/launch and32 structural-charge variants passed root
native contact review; Mencius may promote the reviewed source through recorded
locks and finish full sheets. US/IR/SY service motion remains an isolated
readability correction. Main and optional mission tactics are improving using
ordinary legal commands only; original93/102 and12/21 results remain preserved.

Six exact-Go parking scenes resolve all required original-size sprite frames
and retain exact hashes, but root **rejected** their first renderer images:
foreground flat terrain cuts off portions of aircraft/tanks. Root is testing
per-pose ink-bound sort extents with unchanged pixels/anchors; raised-terrain,
fog, shadows and maximum-load checks must pass before acceptance. The diagnostic
sparse atlas is never a complete animation or production-art claim. Shipping
Go0.3.3 and the original combined0.3.4 remain frozen.


## Integration update at12:55 UTC

Owner-range product follow-up now includes four clean actual Firefox153 courses
(15 cases each; extended pair150 extra modal cycles each), preserving both original
PNG console failures. No decoder cause or preload cure was established; no
speculative production workaround was introduced. Chromium/WebKit and legacy
absence courses already pass. The owner-range candidate remains isolated.

Root rejected the first terrain-body sorting prototype after its flat sub-tile
pixel course caught63/192 USstrike cuts. Exact per-pose alpha bounds plus the
terrain triangle-fan centroid bound now pass1152 body and1152 combined body/shadow
positions at both atlas resolutions; near cliffs retain occlusion. The initial
CPU-projected shadow implementation passed pixels, slope/cliff/fog and atlas
lifetime, but failed a synthetic688actor/1696shadow-plate load (one-moving median
65ms, all-mobile318ms). It is not accepted. A replacement bounded GPU shadow stamp
uses static terrain triangles and separate explicit service-deck plates. Its same
synthetic load measures2.30ms/2.95ms medians, with1.87MiB temporary texture; full
product/hardware and final pixel/browser gates remain. These timings are not
complete-game FPS claims. All failures and source candidates are preserved.

US airlift service v3 native four-direction review is accepted after32pilotposes,
332 checks and exact unchanged-source proofs. Combined ISR/scout proof/pilots
remain before source promotion. USbattery full replacement proceeds as the sole
Blender job. Main/optional mission tactics still have unresolved routes. The
two-human ordinary1v1 reached IRvictory12503 with exact native/full-replay/restore
hashes and both debriefs; its strict browser row retains one unlocatedHTTP503
failure. No rendering/decoder exception occurred. Remaining matches now capture
response URL/status/code and run serially. Nothing is deployed or declared ready.

## Integration update at13:34 UTC

Owner-ranges was checkpointed in aacf416 with its isolated Go projection, client
readout, exact native/WASM/codec/canonical evidence and preserved browser failures.
The shared0.3.3 runtime has not been overwritten.

The two-human/two-normal-bot match passed an ordinary team victory at tick12321,
with real Save Match Replay UI, native/full/checkpoint/midpoint hash parity and no
HTTP, page, console or decoder errors. The following three-human case failed
before an outcome: overloaded command-advice calls returned52HTTP503s, including
`advice_unavailable` and `advice_timeout`. The latter opened a global blocking
“COMMAND INTERRUPTED” dialog, preventing the reconnect control. This is a real
recovery defect, not a completed match. Einstein owns the bounded background
advice recovery fix and its tests. The old two-human unlocated503 is still not
retroactively explained. Four-human combat has not yet started.

Severe shared-host memory pressure interrupted root's extra Firefox pixel and
full-load browser tests; their failed/interrupted reports remain. Boole also
preserved an exact-source observer pilot interruption rather than counting it as
a mission failure. Heavy runs now alternate. Fresh Chromium shadow geometry,
visibility, eviction,32MiB budget and fractional-allocation stability checks pass.
The688-actor/1696-plate synthetic update medians are0.9ms one-moving and1.2ms
mobile-moving;64 known-deck plates cost2.3ms for one moving or3.1ms for six moving,
with0.1ms stationary. These are update costs, not full-game FPS. The1152 latest
combined body/shadow pixel comparisons pass Chromium; other engines and complete
renderer/product gates remain. The exact-Go six-scene GPU parking snapshots pass
all9 captures; native1× images were reviewed, without claiming complete animation.

The real maximum-load renderer exposed a valid Go map with `fields:null`, which
crashed environment knowledge. Both field reads now treat an absent/empty slice
as empty; a regression also verifies that later disclosed shipment cargo still
appears without changing the raw map. All334 runtime tests and both TypeScript
checks pass. Quiet hardware remeasurement remains, and the existing load fixture
retains its historical0.3.1 engine label.

All three bounded aircraft service pilots now pass root native review: airlift,
ISR32poses/332checks and scout32poses/328checks. Exact original-size silhouettes
and other source poses remain preserved. Combined source promotion waits for
Claude01 review; immutable stage-v1 stays intact. Metadata-only ink-bound promotion
still waits for final renderer gates. Full USbattery41poses is complete; remaining
roster,132FX, key art, audio listening and release acceptance are still open.

## Integration update at14:44 UTC

The bounded sprite depth/shadow correction and terrain viewport culling are
accepted: three engines pass pixel/visibility/occlusion checks, six actual-Go
parking saves pass nine captures, and the full14 renderer groups pass again
following ink metadata publication. The metadata covers67 existing exports and
two independent staged aircraft, with834 atlas descriptors and unchanged packed
and raw PNG hashes. Complete service animations and the remaining roster are
still unfinished. See `docs/sprite-terrain-depth.md` and
`docs/sprite-ink-bounds.md` for evidence and preserved failures.

Culling reduces the frozen maximum-load scene from150528 to48600 drawn vertices.
Two consecutive hardware courses still reach only19.15/19.76TPS;20TPS is not
consistently met. A shared explicit Go snapshot converter is therefore isolated
under `work/snapshot-codec-candidate/`. It retains exact prior protobuf values and
wire bytes for201 constructed views and31 actual saves/62 player views on native
Go and WASM, without changing engine hashes. Browser integration and a quiet,
paired timing comparison remain before acceptance. No runtime has been promoted.

The fresh headed three-human ordinary match has passed reconnect with zero
strict browser errors so far; its outcome and the four-human course remain
pending. Three slots of independent work continue on multiplayer, faction/service
art and mission tactics. Claude's13:30 exact-model review succeeded before later
jobs reached quota; the next recorded retry is18:30UTC. Partial UI edits and all
failed mission/performance runs remain visible in their evidence. Nothing is
published or declared the finished game.

## Integration update at15:25 UTC

The direct Go snapshot converter preserves the exact old protobuf representation
for201 constructed views and31 actual saves/62 player views on native/WASM, and
passes the15-case real product owner-ranges course. The older0.3.1 timing pair
still misses repeated20TPS with both runtimes; those failures remain intact.
A separate current0.3.4 legal688-actor fixture now reaches its native expected
hash after600ticks/64commands with all64 aircraft landed. No old fixture was
relabeled or given extra time.

The next isolated candidate reuses one immutable unit-definition lookup in two
collision functions. All75 unit types and four special/unknown cases across32
states plus9600 clearance queries match the retained preceding implementation.
Full short simulation/adapter/server, focused race, vet and current native hash
checks pass. In a quiet headed Chromium/Metal pair with identical renderer,
artwork and current fixture, the baseline reaches18.08/19.98TPS; the candidate
meets the unchanged20TPS budget in both consecutive600-tick segments, with
RPC p95 of109.4/107.1ms and no frames over50ms. All four hashes, saves/restores and
resource disposal checks pass. See
[the exact evidence](../work/navigation-lookup-candidate/README.md). This accepts
the bounded optimization on this Mac; complete-art/reference-hardware/long-match
performance and combined runtime promotion remain open. Shipping stays0.3.3.

The fresh three-human match earned an ordinary IR victory at16074 with zero
HTTP/page/console errors, exact native replay/checkpoint hashes and successful
reconnect. Its original browser driver nevertheless failed its archive-button
assumption on the eliminated host; that report remains failed. Checkpoint41264bc
adds authenticated recorded operations, replay archiving and recovery after a
host restart removes the old lobby. A copied-host browser course passes seven
checks, including real404 recovery and preservation of the eliminated player's
exact frozen view, with347 runtime tests and both TypeScript checks. See
[recovery evidence](recorded-result-recovery.md). A fresh four-human2v2 ordinary
combat course has now started with the corrected result-handling driver.

Aircraft picking now has a bounded candidate using actual current beauty/team
opacity, excluding transparent padding and shadows while retaining real foreground
occlusion. Chromium/Firefox each pass33 checks; WebKit and final regressions are
in progress. It fixes real US airlift and strike body clicks that previously
selected ground or the neighboring airfield. No Go collision geometry changes.

All four interceptor identities have accepted native charge/launch contacts.
The new US airfield completes34 world poses and UI, with visible opening doors
and hangar interior; service motion remains modest and is recorded as such.
SA/IR/SY producer pilots, accepted-pilot reuse production, US airlift rearm and
the remaining full roster continue under the sole Blender worker. Root's17/132
FX candidate and main-menu key art remain unaccepted. Claude next returns at the
recorded18:30UTC reset for exact-model visual authorship/review. No deployment.

## Integration update at16:12 UTC

Shipping runtime remains0.3.3. Current0.3.4 lookup/direct-codec candidate remains
isolated under356-file lock c7e0d79d…; the quiet maximum-load result at15:25 is
bounded evidence and is not final promotion.

- Aircraft body picking is checkpointed in aac90ea: exact cached beauty/team
  alpha, current pose/depth, no empty-padding or shadow hits; Chromium, Firefox
  and WebKit each pass33 checks, and all14 renderer groups pass. Both TypeScript
  checks and347 runtime tests passed at that checkpoint.
- Structural cue priority is checkpointed in093393f. Low power, selling, damage,
  disable, incomplete and destruction discard stale building launch/activation
  cues; restoration cannot revive them. New actual ActorVisual tests reproduce
  the old defect, pass after the fix; both TypeScript checks and349 runtime tests
  pass. This is separate from the earlier pixel-regression run.
- First fresh4H2v2 reached ordinary team2 victory at13840. All4 owners paid
  opening costs, rejected foreign commands and remained functional; host
  reconnect and eliminated-view freezing worked. Full/checkpoint/restore replay
  matches575d8a65…600ff. Its strict browser result remains **failed** for one
  advice_timeout. Host did fetch recorded history and display the new result cue,
  but the former early assertion stopped before archive entry.74691a8 preserves
  the failure and successor driver, which checks independent recovery before
  its unchanged final strict error gate.
- Optimized host/WASM-only copy preserves3625 other served files and recovery-v3
  client/art. Its second fresh4H is running. It also hit one advice_timeout, on
  player3's24 barracks-order batch; the sanitized request and2282ms timing are
  preserved. These are sequential advisory orders, not24 independent geometry
  searches. No simulation deadline/authentication gate was relaxed. A quiet
  four-player follow-up is planned after current outcome/audit and diagnostics.
- f6f4f69 profiles detached advice on actual prior3H saves: compact Restore about
 59ms/14.35MB per operation on the shared host; JSON decoding dominates. Move/train
  and independent-context samples do not explain the live2s timeout. Exact new
  request shape needs bounded replay-state diagnosis; its exact capture tick is
  unavailable. No speculative production optimization has been made.
-78e6e89 preserves original imagegen menu illustration candidates and real
  Go-hosted menu review. First image is rejected as too realistic. Second passes
  native1600/1280 composition, keyboard navigation,150% menu access and exact
  injected404 fallback. Preview build/TypeScript pass. It is isolated and awaits
  Claude's18:30UTC primary review plus final packaging; no shipping UI promotion.
- Root is implementing owner-only aircraft payload variants with canonical cue
  and transition clocks and guarded previous-frame fallback during atlas decode.
  Five focused real ActorVisual/Pixi tests pass; broad checks and a prepared
  actual-Go final-round/service/home-loss/replay course remain in progress. Art
  variants themselves are not complete.
- Mencius found35 real SA producer arm/door contacts in8 poses. The bounded
  SA arm move passes58-other/2632-pose parity,342 non-arm objects,34 resets/bounds,
 42 bay rays and zero contacts in1584 pairs. Corrected native rendering is active;
  original failures remain. IR/SY producers and US96-only service correction stay
  queued. An isolated armed-payload source pilot adds2848 poses with canonical
  timing and no speculative ammo refill; no live source/manifest promotion yet.
- SA05Hard pilot stopped when its driver's paid capture-tank cohort was empty,
  after two captures. This was nonterminal harness failure, not proven defeat;
  original branch omitted final artifacts. Boole is adding diagnostic-only fatal
  cleanup in a successor harness, preserving original evidence and mission rules.

Claude still waits for the recorded18:30UTC /21:30Qatar reset, exact
claude-opus-5-5 with fallback disabled. All three existing agents continue.
Complete-art production,132FX, full mission/optional/balance acceptance, audio
listening, two long-game/current-load checks and clean local/offline/LAN packaging
remain open. The game is not ready for release.
