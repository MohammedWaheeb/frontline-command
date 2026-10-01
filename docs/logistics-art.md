# Logistics model and sprite production

This is the bounded eight-unit builder/harvester art assignment, authored by
Codex during the user-authorized Claude quota takeover. Claude remains the
primary art author; these original models extend the existing Claude-authored
`fclib.py` camera, material and layer contract. The exact author is recorded in
all eight specs as `author: "Codex"` plus a `provenance` object. This is not a
claim that Claude authored these new model meshes.

## Scope and style

The source is `assets/pipeline/blender/models/logistics.py`; there is one explicit
spec for each `unit.{US,IR,SY,SA}.{rig,hauler}`. No shared renderer, packer,
material library or existing model was edited. All eight use original procedural
geometry, fictional team accents and the established olive/sand/gunmetal
materials. Their proportions emphasize readable mechanical silhouettes at the
normal game zoom. No real insignia or copied vehicle mesh is used.

| Faction | Engineering rig | Supply hauler |
|---|---|---|
| US | Compact tracked dozer, wide cutting blade and side articulated engineering arm | Armored cab with four restrained pallets on a low flatbed and hydraulic tail lift |
| Iran | Six-wheel service chassis, folding drill mast, telescoping rear slide and auger feed | Three-axle carrier with two distinct removable supply pods and rear lifting yoke |
| Syrian Rebels | Repaired military field truck, A-frame winch, visible girder, welding screen and tool chest | Short military cargo truck with repaired side panels, strapped cases and canvas load |
| Saudi Arabia | Four-axle machinery carrier, deployed stabilizers, articulated crane and generator | Heavy four-axle bulk carrier, reinforced sloping bin, stacked load and tipping bed |

The team regions include the roof and functional side/boom panels. Cargo has a
separate silhouette; an empty hauler is visibly empty. Wrecks remove glazing,
lamps and a wheel, tilt the chassis/bed, flatten or displace work machinery and
show scorched ground. They are cosmetic frames and do not add simulation actors
or collision.

## Projection and output contract

The existing shared projection remains unchanged: one Blender unit is one
simulation tile, headings rotate from simulation +X toward +Y, the camera is
orthographic at 30-degree elevation, and output renders at 2× before derivation
to 1×. Every frame uses the simulation ground position as its anchor. All states
and layers share a single union trim in the existing packer.

| Role | Source canvas at 2× | Ground anchor | Simulation radius | Poses per faction |
|---|---|---|---:|---:|
| US / Syrian / Saudi rig | 384×304 | (176,200) | 600 millitiles | 336 |
| Iranian rig | 448×304 | (176,200) | 600 millitiles | 336 |
| Hauler | 336×240 | (148,148) | 800 millitiles | 400 |

Rigs supply every manifest-required idle, movement, damage, wreck,
progress-driven deployment and six-frame work state. Haulers supply all required
idle, movement, damage, wreck, six-frame loading/unloading and loaded-movement
states, plus explicit `idle_loaded` and `damaged_loaded`. Every state has 16
headings. Beauty, team mask and ground shadow are separate; wreck omits team
mask. The complete assignment is 2944 poses, before counting separate layers.

Owner-private cargo and visible Go states should drive selection of the loaded
variant. `loading` maps to `work_load`, `unloading` to `work_unload`, and
`returning_cargo` to `move_loaded`. Do not invent enemy cargo quantities. A
builder's real `building` state maps to `work_build`; deployment is
progress-driven only when an authoritative progress value is available. The
source provides `healthbar` and, for rigs, `work` hardpoints. The Iranian
healthbar hardpoint rises with the deployed mast.

## Review and production status

All eight assets are complete, packed and visually reviewed, including the
corrected Iranian rig. The assignment contains 2,944 poses and 8,704 separate
beauty/team/shadow frames, eight editable Blender scenes, matched 1×/2× sprite
atlases and 64 portrait/build-cameo layer images. The eight assets pass 88
standard integrity checks, 160 UI-image checks and 44 runtime contract checks
(292 checks total, zero failures). This completes this bounded logistics art
assignment; it does not complete the full unit roster or game.

The exported state sheets, each portrait, and the combined native-scale
`logistics-overview@1x.png` were visually inspected. Both actual eight-player
palettes were additionally reviewed in `palette-standard@1x.png` and
`palette-cvd_safe@1x.png`. Roof, side and equipment team regions remain visible
in these sampled working/loaded poses. That is a visual mask review, not a
formal color-vision accessibility certification; the token hash and measured
mask coverage are retained in `palette-evidence.json`.

Production logs and inspected contact sheets are kept in `work/art/logistics/`.
A spec or partial frame folder is not a finished asset.

Reviewed engineering samples use front/rear headings, work animation and wrecks.
The first US wreck's raised arm read too much like working equipment; it was
revised to lie beside the disabled chassis. The Iranian drill was moved onto a
telescoping rear slide so its working auger clears the vehicle deck, and its
support pedestal and drill tip were corrected. The mast's raised healthbar
hardpoint avoids placing a bar across the drill assembly. Sample shadows for
all four rigs have no border alpha above the existing checker threshold.

The full first Iranian rig render exposed 21 genuinely clipped mast shadows
in headings 5–7, beyond the four cardinal sample headings. The checker stopped
the batch. Only that rig’s canvas width was enlarged from 384 to 448, retaining
the anchor and world pixel scale. All 18 work poses in the affected headings
then passed with zero cleaned-shadow border alpha. The complete 336-pose asset was
rerendered at the corrected size and passed all integrity and UI checks; mixed-size
samples were not accepted output.
Before/after evidence is `IR-rig-canvas-shadow-comparison.png`,
`IR-rig-clipping-before.json`, and `IR-rig-canvas-sample-check.json` in the
evidence directory; original render/check/source-lock snapshots are preserved
with `-before-canvas` names. This correction did not weaken the clipping check.

The US hauler sample visibly distinguishes its four strapped pallets from the
empty bed. All four hauler samples have now been inspected, including loaded/empty beds,
loading/unloading and distinct wrecks. No sampled beauty/shadow frame clips its
canvas. The full batch is now authorized by this sample review.
A Metal shader compiler startup exception occurred once while opening the
Iranian hauler sample. Its preserved log is `sample-IR-hauler.log`; the single
retry succeeded; its log is `sample-IR-hauler-retry.log`. The failure was not reported as a successful
render or hidden by manufacturing absent frame files.

Use one Blender worker at a time, currently four CPU threads, to leave memory
and CPU room for browser testing. The full batch must use the normal spec
renderer. The generic packer derives 1×/2× atlases and writes the standard sprite
sidecar. The existing UI-shot renderer produces matched transparent portrait and
build-cameo beauty/team layers. Coverage, clipping, transparency, team coverage,
shadow, animation, heading distinction, anchors and packed counts must all pass
for these eight IDs before this document can claim asset completion.

## Export performance observation

The first US rig export passed the existing clipping checks, but its shadow
pass contained low-alpha floor noise (border maximum 6/255). The union trim
used alpha above 2, retaining the entire source canvas: 35 atlas pages per
scale, 450.58 MiB decoded RGBA at 2× and 112.64 MiB at 1×. These original
measurements remain in `work/art/logistics/US-rig-alpha-memory.json`.

The shared pipeline owner subsequently added and verified deterministic
shadow-support cleanup in `assets/pipeline/tools/shadow_alpha.py`. Raw source
PNGs stay untouched; the packed shadow keeps substantive connected shadow
regions and four pixels of their original penumbra. The repacked US rig uses
a 298×168 union frame and 15 pages per scale (193.77 MiB at 2×, 48.44 MiB at
1×). Packed contacts were reinspected and all integrity/anchor checks passed.
The renderer separately loads pages on demand; these totals do not imply
all pages are simultaneously resident. No shared tool was edited in this lane.
Current per-asset sizes and hardpoint checks are recorded in
`work/art/logistics/contract-report.md`.

## Reproduction and evidence

Run from the repository root using the existing Blender and asset Python
runtime. The following example regenerates one asset; use only one Blender
worker at a time during concurrent browser verification.

```sh
blender -b -t 4 --factory-startup -P assets/pipeline/blender/render_asset.py -- assets/pipeline/specs/unit.US.rig.json
work/art/.venv/bin/python assets/pipeline/tools/pack_sprites.py unit.US.rig
blender -b -t 4 --factory-startup -P assets/pipeline/blender/render_ui_shots.py -- assets/pipeline/specs/unit.US.rig.json
work/art/.venv/bin/python work/art/logistics/derive-ui.py unit.US.rig
work/art/.venv/bin/python work/art/logistics/check-one.py unit.US.rig
work/art/.venv/bin/python work/art/logistics/packed-contact.py unit.US.rig
work/art/.venv/bin/python work/art/logistics/verify-contract.py unit.US.rig
```

The source snapshot is `work/art/logistics/source-lock.json`. Per-ID render,
packing and UI logs, integrity reports, UI checks and contact sheets are kept
in the same evidence directory. `completed-assets.txt` records successful
render/pack/integrity/UI stages, while visual reviews are recorded here.
The runtime contract check additionally verifies unchanged source hashes,
identity, physical radius, complete declared states and every healthbar/work
hardpoint against the rendered source ground anchor. It also records atlas
page counts and decoded sizes independently of the runtime cache policy.

The full US hauler rendering and packing succeeded before a local QA-wrapper
import failed after the shared shadow helper was introduced. Both evidence
wrappers now add the shared tools directory to their Python import path. The
successful raw frames were retained, the checks rerun, and production resumed;
that wrapper failure was not treated as a rendering failure or asset acceptance.

## Associated original rifle correction

After the logistics batch, the root-owned US Ranger cover fix was rendered for
all eight directions and both frames (16 poses, 16.5 seconds), then the complete
Ranger sprite set was repacked. Its 11 standard integrity checks pass, including
the previously failing animation distinction. The exported two-frame contact
sheet was inspected. The original infantry source change belongs to the root
agent; this lane operated the render and checks only. Logs and the inspected
`packed-contact-unit.US.rifle@2x.png` are in the logistics evidence directory.
