# Original game asset pipeline

Claude Code exact `claude-opus-5-5` authored the original shared Blender library,
models, design tokens and rendering contract. During the user-authorized quota
takeover, Codex added faction logistics models and export/runtime corrections.
Per-spec provenance distinguishes model authorship from shared tooling. Coverage
in `assets/manifest/summary.md` is an inventory, not a finished-art claim.

## Projection and source

One Blender unit is one 1,000-millitile game tile. The fixed camera uses 30°
elevation and a 2:1 dimetric projection: `sx=(x−y)×32`, `sy=(x+y)×16` at 1×, with
positions in tiles. Frames render at 2× and retain a ground-position anchor.
Heading zero faces screen lower-right; units use declared 8/16/32 directions.
The shared library maps simulation y to negative Blender y.

Each `assets/pipeline/specs/<id>.json` declares model module, faction, canvas,
anchor, layers, states, frame counts, direction counts, timing and provenance.
Editable Python models are under `assets/pipeline/blender/models`; rendering
also writes `assets/source/blender/<id>.blend`. Raw PNGs and projected hardpoints
are retained under `assets/build/frames/<id>` for inspection.

Run one Blender render at a time on this workstation. Example, from project root:

```sh
blender -b -t 4 --factory-startup -P assets/pipeline/blender/render_asset.py -- assets/pipeline/specs/unit.US.rig.json
work/art/.venv/bin/python assets/pipeline/tools/pack_sprites.py unit.US.rig
blender -b -t 4 --factory-startup -P assets/pipeline/blender/render_ui_shots.py -- assets/pipeline/specs/unit.US.rig.json
```

Check existing render jobs and file reservations before running commands.
`render_asset.py` also accepts `--states idle,move`, `--dirs 0,4`, and
`--no-blend` for isolated reviews. Do not use a reduced render as proof of full
state coverage. The legacy `render_all.sh` clears raw frames for each supplied
spec, so it must not run against another owner's active render.

## Exported layers and shadow normalization

Beauty contains lit original geometry. Team masks preserve grayscale shading
and tint at runtime. Shadows export black alpha and draw at 0.46 opacity. Every
layer shares one trim rectangle and anchor. The packer keeps even alignment,
packs pages at most 2048×2048 and derives 1× through premultiplied-alpha Lanczos
filtering. `.sprite.json` records states, page locations, hardpoints, footprint,
air offsets, turret pivot and aliases. Runtime atlas coordinates remain physical
pixels; Pixi's filename-based `@2x` resolution inference must be disabled.

Cycles shadow-catcher output contained pervasive alpha 1–6 in empty space and
isolated one-pixel corner spikes around alpha 47. This made union trimming keep
the entire source canvas and caused false clipping failures. `shadow_alpha.py`
keeps alpha>8 connected components of at least eight physical pixels and four
pixels of their original penumbra. Values inside this support stay unchanged;
only disconnected noise is removed. Raw PNGs remain untouched. Packer and
clipping checks use the same exported channel. Substantive border clipping still
fails; dedicated tests prove it is not silently cropped away.

The 1,486-frame comparison across seven asset types is recorded in
`work/art/shadow-cleanup/results.json`; raw/clean/difference images were visually
reviewed. US rig packing shrank from 384×304 to 298×168, reducing total 2× page
memory from 450.58 to 193.77 MiB. This is the whole animation set; actual runtime
page residency is lower and measured separately in the renderer report.

## Air and runtime state

Aircraft beauty rises by authored altitude; its ground shadow is displaced along
the sun direction. The shared renderer applies only authorized Go state, and
cosmetic offsets never change targeting, range or movement. Per-frame health-bar
and muzzle hardpoints are relative to the untrimmed ground anchor before export.
Turrets rotate independently around their authored hull pivot.

## Verification

```sh
work/art/.venv/bin/python assets/pipeline/tools/test_shadow_alpha.py
work/art/.venv/bin/python assets/pipeline/tools/check_assets.py
work/art/.venv/bin/python assets/pipeline/manifest/gen_manifest.py
node client/tests/render/browser.mjs
```

Full integrity covers declared frame coverage, dimensions, transparency,
clipping, team-mask containment, nonempty shadows, distinct directions/animation,
anchor placement and 1×/2× atlas consistency. A partially rendered batch is
expected to fail coverage; record it as incomplete. Contact sheets at native
scale, portraits, actual in-game screenshots and human gameplay readability must
also be reviewed. Audio, many unit/building classes, effects and key art remain
separate release work; successful sample checks do not complete that inventory.
