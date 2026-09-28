# Frontline Command implementation status

Updated28 September2026,08:45UTC /11:45Qatar. **The full game is not ready for release.** Continue the complete handoff; do not deploy. The previous detailed state is preserved in [history](history/implementation-through-2026-09-28-0511.md).

## Current ownership and access

Shipping Go remains **0.3.3**, protocol1, adapter1, content2.0.0; hash `318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`. It is the sole authoritative simulation shared by native hosting and WASM. No shipping Go changes are currently approved.

Claude01/04/05 resumed after the07:20 reset at08:35–08:40. Actual model **claude-opus-5-5** was verified with fallback disabled, then all three hit quota again. Next reported reset is13:30UTC /16:30Qatar; no early retry or sign-in is needed. Root is finishing the partial UI/terrain work under the user's authorized fallback. Mencius owns the Claude-authored render helper and production. Existing Claude sessions need fresh file reservations before resuming. Codex agents also resumed after a usage-limit interruption; do not assume anything completed during it.

- Claude04 owns UI except EditorPanel, game/token/network CSS and optional console chrome. Fresh scope: `work/claude/13-resume-console-0835.md`. Preserve independent production, actual aircraft commands, replay transport in the command well and loading notice fix.
- Claude05 owns terrain generator/materials/baking only. Scope: `work/claude/14-resume-terrain-0835.md`. Preserve Go maps, heights, fog truth and shared picking/actor projection.
- Mencius is the **sole Blender worker**, with Claude01 writing the isolated exterior-parking composition helper. It then handles accepted repair production and remaining roster under exact source locks. No other job may launch Blender.
- Einstein completed editor/Copper checkpoints and now owns a new pure tactical-presentation descriptor module/tests and warning/effect coverage audit. It does not own renderer/UI/art/protocol/Go.
- Boole implements the proposed service-parking rule **only in `work/service-parking-candidate/source`**, an isolated Go copy. Shipping0.3.3 remains frozen. Optional mission tactics/evidence are preserved; no full102 rerun until the prospective next boundary is decided.
- Root owns integration, runtime/backend coordination, functional renderer changes, package integrity, evidence and documentation.

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
| Console |0.3.3 real paid queue/cancel/build/save and read-only replay queue/rewind;1280×720 at100%/150% fit | Claude all-mode visual pass underway; main key art rejected/unwired |
| Capture art |6758513: real workshop/safehouse/power capture, retained foundation and correct art identity, exact save/rewind;14 renderer groups pass | Workshop/safehouse full sheets absent; procedural views are functional evidence only |
| Copper scenery |32f223b:10 mirrored entries, real paid economy/scouting/garrison/damage/destruction,21 exact no-scenery mirror hashes | One map; remaining maps not fully dressed |
| Editor |1c3ea2a: four starts/two regions on64×96 map, real icon sheets, undo/redo/resize/reload, Go previews, practice-return and missing-art fallback, exact draft hashes | No environment-sidecar authoring/export extension |
| Packaging |26e20f6: exact optional scenery hashes/path bounds and prior-pack preservation;7 focused tests; notice survives long loading | Final complete local package still pending |
| Performance | M4 Metal raised terrain: two600-tick20TPS segments, p95≈17ms, exact native/restore hash | Short synthetic segments/incomplete art, not long matches or Intel reference |
| Audio |892 clips/620 events; integrity/decode/loop and cold-offline playback checks | Listening/mix/full presentation review remains |

Both TypeScript checks and239 runtime tests passed at the editor checkpoint. Shipping0.3.3 native short and actual three-browser integration pass; full0.3.2 short race plus focused0.3.3 correction race pass. Do not relabel historical reports as covering new changes.32 maps/31missions were checkpointed inee97df3 after content validation; that validation alone does not prove balance or mission completion.

## Art and aircraft decisions

Eight logistics assets and21 formerly missing props are rendered/checked. Eleven of24 infantry assets are complete. Six new US buildings—barracks, factory, supply, radar, tech, outpost—passed full production and native review. Other building/infantry production remains.21 building pilots cover18 role families; pilot approval is not complete full production. Bindings cover all75 units and61 faction/building variants. APC source correction is protected by626649d;27 ground-combat production remains approved.

The three repair depots' isolated arm correction passed27 selected world views,81 layer bounds,84 resets,60 UI checks and exact56-other-assets/2534-pose parity. Root viewed all3 native contacts and accepted this bounded correction. Live building source promoted to `a9054656…`; failed US output is hash-preserved. Full three-depot production follows the parking composition pilot. Always read the full exact source lock.

**The common0.3896725 aircraft shrink was rejected.** The scout becomes a speck and fighter/airlift look toy-sized beside ground units. Original readable geometry stays unchanged. All5 proposed exterior service compositions passed root native review. Full11-aircraft candidate production is now authorized under work/ staging only, with US fighter/airlift prioritized after the current US building batch. Shipping promotion waits for actual Go parking/render integration.600mt is the design's combat/collision radius, not a requirement that every cosmetic wing/rotor fit inside it. Current1300mt parking centers cause real intersections.

[The backend review](service-parking-review.md) proposes fixed operational parking radii, exterior-only pads outside the retained solid foundation, stable persisted final-approach reservations, and shared ground navigation/construction exclusion. Combat radius/range, airborne separation, capacity, costs and service timing remain unchanged. This is a real gameplay change, implemented only in an isolated candidate until numeric/performance/native-layout gates pass. No mesh data enters Go. Earlier shallow service-building candidate remains unaccepted. Tested pure service-surface parser is not wired into shipping metadata; exterior ground needs no deck lift.

## Remaining full release work

Complete all required sprites/poses, terrain/effects, UI/key art, portraits/icons and audio presentation, then review actual gameplay with complete art. Main-menu key-art preview remains rejected for occlusion, clipping and weak depth. Follow [actual C&C references](../work/claude/06-rts-reference-study.md): original stylized silhouettes, rich readable battlefields and warm gunmetal/olive/brass command machinery. Blue is tactical team paint only. Repeated cracks, flat terrain and abrupt fog edges remain under Claude review.

Finish optional/current campaign acceptance and rendered product journeys; review human counterplay and audio; run two long games, maximum combined load, final local packaging and clean-install/save/replay/offline/LAN acceptance. Record exact hardware and physical-network limitations. Plan future hosting only. A passing pilot, source model, partial roster or numerical suite does not make the full game ready.
