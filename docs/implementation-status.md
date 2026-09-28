# Frontline Command implementation status

Updated 28 September 2026, 11:31 UTC / 14:31 Qatar. **The full game is not ready for release.** Continue the complete handoff; do not deploy. The previous detailed state is preserved in [history](history/implementation-through-2026-09-28-0933.md).

## Current ownership and access

Shipping Go remains **0.3.3**, protocol1, adapter1, content2.0.0; hash `318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`. It is the sole authoritative simulation shared by native hosting and WASM. Shipping runtime stays frozen while isolated parking and tactical-view/route advice candidates are tested; promotion is pending.

Claude01/04/05 resumed after the07:20 reset at08:35–08:40. Actual model **claude-opus-5-5** was verified with fallback disabled, then all three hit quota again. Next reported reset is13:30UTC /16:30Qatar; no early retry or sign-in is needed. Root completed the partial UI/terrain integration under the user's authorized fallback (3a4e550, 7133ada). Mencius owns the Claude-authored render helper and production. Existing Claude sessions need fresh file reservations before resuming. Codex agents also resumed after a usage-limit interruption; do not assume anything completed during it.

- Claude04/05 are idle under quota. Their old briefs are superseded: root finished menu/console and terrain integration; fresh bounded review reservations are required before resuming them.
- Mencius is the **sole Blender worker**. Original-size fighter544/airlift672 exports are staged. Root accepted six actual-Go native source compositions; browser sorting remains open. Airlift service motion is static and remains a defect. Mencius owns its isolated correction, four-battery interceptor/structural-charge pilots, the remaining94assets/18,139poses, and a clearly diagnostic six-scene atlas overlay.
- Einstein completed tactical/Skybreaker/wire, combat audio and synthetic FX renderer acceptance. It now owns six ordinary paid-combat multiplayer cases in a frozen isolated0.3.4 product, covering1–4 human clients and deterministic bots. No completed combat match claimed yet.
- Boole owns frozen combined0.3.4 acceptance. The original102 main cases finished93pass/9fail; the original21 optional routes finished12pass/9fail. Next is a separate acceptance-driver-only tactics correction copy, with no production, objective or deadline changes.
- Root completed combat renderer/reset integration1305dcb and owns the isolated owner-casualty view correction plus final cross-system integration. Shipping Go0.3.3 and combined frozen0.3.4 remain unchanged while these gates run.

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
| Performance | M4 Metal raised terrain: two600-tick20TPS segments, p95≈17ms, exact native/restore hash | Short synthetic segments/incomplete art, not long matches or Intel reference |
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
