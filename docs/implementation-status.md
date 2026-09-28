# Frontline Command implementation status

Updated 28 September 2026, 09:33 UTC / 12:33 Qatar. **The full game is not ready for release.** Continue the complete handoff; do not deploy. The previous detailed state is preserved in [history](history/implementation-through-2026-09-28-0845.md).

## Current ownership and access

Shipping Go remains **0.3.3**, protocol1, adapter1, content2.0.0; hash `318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`. It is the sole authoritative simulation shared by native hosting and WASM. Shipping runtime stays frozen while isolated parking and tactical-view/route advice candidates are tested; promotion is pending.

Claude01/04/05 resumed after the07:20 reset at08:35–08:40. Actual model **claude-opus-5-5** was verified with fallback disabled, then all three hit quota again. Next reported reset is13:30UTC /16:30Qatar; no early retry or sign-in is needed. Root completed the partial UI/terrain integration under the user's authorized fallback (3a4e550, 7133ada). Mencius owns the Claude-authored render helper and production. Existing Claude sessions need fresh file reservations before resuming. Codex agents also resumed after a usage-limit interruption; do not assume anything completed during it.

- Claude04/05 are idle under quota. Their old briefs are superseded: root finished menu/console and terrain integration; fresh bounded review reservations are required before resuming them.
- Mencius is the **sole Blender worker**, staging original-size US fighter/airlift before actual Go parking composition. It owns remaining roster production and isolated art validation; no other job launches Blender.
- Einstein checkpointed tactical overlays in2637679, then owns the Skybreaker three-target review/Go-advice route preview: command controller, runtime advice parsing, new review component and narrow App/render integration. No Go, protocol, terrain or asset edits.
- Boole owns only `work/service-parking-candidate/source`, including the grounded-airlift boarding regression exposed by full native tests. No shipping promotion or full102 mission rerun yet.
- Root owns isolated `work/tactical-wire-candidate/source`: authoritative projectile radius/body disclosure, visible effect/emergency deadlines and shared Go Skybreaker route/ETA advice. Root also integrates/reviews sources, runtime/package integrity and evidence.

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
| Tactical overlays |2637679: actual0.3.3 warnings/zones/raid exits/intent/pings/endgame minimap, exact save/replay and14 renderer groups | Optional wire fields, actor effects/ranges and owner route preview still in progress;132 effects art remains incomplete |
| Capture art |6758513: real workshop/safehouse/power capture, retained foundation and correct art identity, exact save/rewind;14 renderer groups pass | Workshop/safehouse full sheets absent; procedural views are functional evidence only |
| Copper scenery |32f223b:10 mirrored entries, real paid economy/scouting/garrison/damage/destruction,21 exact no-scenery mirror hashes | One map; remaining maps not fully dressed |
| Editor |1c3ea2a: four starts/two regions on64×96 map, real icon sheets, undo/redo/resize/reload, Go previews, practice-return and missing-art fallback, exact draft hashes | No environment-sidecar authoring/export extension |
| Packaging |26e20f6: exact optional scenery hashes/path bounds and prior-pack preservation;7 focused tests; notice survives long loading | Final complete local package still pending |
| Performance | M4 Metal raised terrain: two600-tick20TPS segments, p95≈17ms, exact native/restore hash | Short synthetic segments/incomplete art, not long matches or Intel reference |
| Audio |892 clips/620 events; integrity/decode/loop and cold-offline playback checks | Listening/mix/full presentation review remains |

Both TypeScript checks and256 runtime tests passed at the tactical-overlay checkpoint. Shipping0.3.3 native short and actual three-browser integration pass; full0.3.2 short race plus focused0.3.3 correction race pass. Do not relabel historical reports as covering new changes.32 maps/31missions were checkpointed inee97df3 after content validation; that validation alone does not prove balance or mission completion.

## Art and aircraft decisions

Eight logistics assets and21 formerly missing props are rendered/checked. Eleven of24 infantry assets are complete. The US non-service batch plus IR/SY repairs now contains14 complete exports and631poses with340 world/280 UI technical checks. US interceptor charge/launch native readability is explicitly withheld; remaining faction buildings/infantry production remains.21 building pilots cover18 role families; pilot approval is not complete full production. Bindings cover all75 units and61 faction/building variants. APC source correction is protected by626649d;27 ground-combat production remains approved.

The three repair depots' isolated arm correction passed27 selected world views,81 layer bounds,84 resets,60 UI checks and exact56-other-assets/2534-pose parity. Root viewed all3 native contacts and accepted this bounded correction. Live building source promoted to `a9054656…`; failed US output is hash-preserved. All three repair depots are now rendered. US interceptor launch readability needs a separate bounded correction. Always read the full exact source lock.

**The common0.3896725 aircraft shrink was rejected.** The scout becomes a speck and fighter/airlift look toy-sized beside ground units. Original readable geometry stays unchanged. All5 proposed exterior service compositions passed root native review. Full11-aircraft candidate production is now authorized under work/ staging only, with US fighter/airlift prioritized after the current US building batch. Shipping promotion waits for actual Go parking/render integration.600mt is the design's combat/collision radius, not a requirement that every cosmetic wing/rotor fit inside it. Current1300mt parking centers cause real intersections.

[The backend review](service-parking-review.md) proposes fixed operational parking radii, exterior-only pads outside the retained solid foundation, stable persisted final-approach reservations, and shared ground navigation/construction exclusion. Combat radius/range, airborne separation, capacity, costs and service timing remain unchanged. This is a real gameplay change, implemented only in an isolated candidate until numeric/performance/native-layout gates pass. Exact ground path edges and boarding contact must honor these discs. The old dense64 fixture has no legal room for its larger parked wings and remains a recorded failure; a compatible layout passes. Actual six Go service layouts/save/replay/native-WASM checks exist, but rendered scene review and final boarding/regression/quiet performance gates are pending. No mesh data enters Go. Earlier shallow service-building candidate remains unaccepted. Tested pure service-surface parser is not wired into shipping metadata; exterior ground needs no deck lift.

## Remaining full release work

Complete all required sprites/poses, terrain/effects, UI/key art, portraits/icons and audio presentation, then review actual gameplay with complete art. Main-menu key-art preview remains rejected for occlusion, clipping and weak depth. Follow [actual C&C references](../work/claude/06-rts-reference-study.md): original stylized silhouettes, rich readable battlefields and warm gunmetal/olive/brass command machinery. Blue is tactical team paint only. Repeated cracks, flat terrain and abrupt fog edges remain under Claude review.

Finish optional/current campaign acceptance and rendered product journeys; review human counterplay and audio; run two long games, maximum combined load, final local packaging and clean-install/save/replay/offline/LAN acceptance. Record exact hardware and physical-network limitations. Plan future hosting only. A passing pilot, source model, partial roster or numerical suite does not make the full game ready.

## Active advisory API work

The isolated tactical wire candidate passes focused native tests for explicit projectile zero/false presence, public blast geometry, owner-only emergency takeoff, sanitized active actor effects and expiry/privacy, plus Skybreaker route advice through the actual host and WASM Session adapters. Skybreaker geometry is shared with actual launch; preview times estimate earliest next-tick execution and never sample hidden threats. Four map-edge plans are checked against ordinary actual launches. Native/WASM view/plan parity and the new client confirmation flow are being integrated; this is not yet the shipping runtime.

The apparent tactical replay mismatch was a harness request before a resumed recording's declared start. Both original0→4334 and resumed4334→4346 now pass with exact hashes; no engine change was needed. See [tactical acceptance](tactical-overlay-acceptance.md) and [console evidence](console-polish.md).
