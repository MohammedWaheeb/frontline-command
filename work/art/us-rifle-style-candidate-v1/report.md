# US rifle style-alignment candidate v1: spec authoring report (29 Sept 2026)

Author: Claude (`claude-opus-5-5`, fallback disabled). This is source authoring only. I did not run Blender, a browser, the host, tests, installs, another model or any agent. Nothing here has been rendered, measured or accepted.

## Edits

I made two edits, both inside the write allowlist:

- `work/art/us-rifle-style-candidate-v1/unit.US.rifle.json` is new. It is the isolated candidate spec.
- `work/art/us-rifle-style-candidate-v1/report.md` is this file.

I did not change `infantry.py`, `infantry_roster.py`, `fclib.py`, `render_asset.py`, any live spec, the other 24 roles, any manifest, pixels, evidence, handoff or lock.

## What the spec does

It follows Q2 of `work/claude/29sept-complete-infantry-ui-mask-review.md` and `work/art/us-rifle-style-mapping-v1/source-map.json`.

**Changed from the live `assets/pipeline/specs/unit.US.rifle.json`:**

| Field | Live | Candidate |
|---|---|---|
| `model` | `infantry` | `infantry_roster` |
| `params` | `{"uniform":"#8A8668"}` | `{"role":"rifle"}` |
| `canvas` | 152×120 | 192×160 (family) |
| `anchor` | (60,76) | (84,108) (family) |
| `author` / `provenance` | none | added (see attribution) |

I dropped `params.uniform` because `infantry_roster.build` ignores it. The roster uses `UNIFORMS['US']` cloth `#85816A`, which is close to the old `#8A8668`. Keeping the old key would imply a control that does nothing.

**Kept exactly from the live spec:**
- `id`, `role_id`, `faction`, `passes`
- `footprint_radius_mt: 350`
- the four squad offsets
- all six states in their original order, with their original `frames`/`fps`/`loop`. Only `death` has explicit `layers` (beauty and shadow), as in the original. The other states fall back to `passes`, as before. This gives 8 × (4+8+1+4+2+6) = 200 pose keys, with the same `state/dDD_fFF` names.

**Camera, ortho scale and world scale:** the spec has no fields for these. `fclib.setup_camera` sets `ortho_scale = canvas_w / PX_PER_BU` and derives shift from the anchor. Pixels per Blender unit therefore stay constant, and the anchor pixel is still the world ground origin. No `sun_strength` is set, so both use the default 3.3. I added no model scale factor.

## Routing: works through the spec alone, with two caveats for Codex's lanes

`render_asset.py` runs `importlib.import_module(spec['model'])` from `blender/models`, then `build(spec['faction'], spec['params'])`, then `pose(rig, st, fr, d)`. `infantry_roster` handles idle, move, aim, fire, cover and death (lines 386–483). The US/rifle branch already runs in production form for the other factions' rifles, e.g. `unit.SA.rifle.json`. **No wrapper is needed for model routing.**

Two caveats. Neither is a routing blocker, but both matter for the lane:

1. **The output path collides with live assets.** `render_asset.py` derives outputs from `spec['id']` only:
   - `assets/build/frames/unit.US.rifle/…`
   - `assets/source/blender/unit.US.rifle.blend`

   It also **merges into any existing `hardpoints.json`** in that folder. Rendering this spec in the live tree would overwrite the original pixels and blend. It would also leave stale old-anchor hardpoint values mixed with new ones for any pose that did not render. The spec cannot redirect this.
   - **Requirement:** render only in an isolated checkout or copy, with an empty frames folder for this ID.
   - **Minimal proposal (not authored):** a Codex-owned `--out-root` option on `render_asset.py`.
2. **There is an extra hardpoint.** The roster rig emits `healthbar`, `muzzle` **and `work`**, all with `fc_parts: ['body','whole']`. The two original names are kept, but `work` (at `hp_work` on the haversack mount) is additive.
   - If the runtime contract must be exactly `{muzzle, healthbar}`, drop `work` at export.
   - Failing that, the minimal proposal (not authored) is a wrapper at `work/art/us-rifle-style-candidate-v1/us_rifle_candidate.py`. It would call `infantry_roster.build('US', {'role':'rifle'})`, delete `rig.hardpoints['work']`, and re-export `pose` unchanged. Using it would also need `render_asset` to find modules on that path, which is another reason to prefer filtering at export.

## Intended ground-origin, standing-height and healthbar trade-off

These are estimates from the source coordinates. They assume `box` sizes are full extents. With ART_SCALE 2, there are about 90.5 px per Blender unit horizontally and about 78.4 px per Blender unit vertically (×cos 30°) in the rendered frames. **Codex must measure these.**

- **Ground origin.**
  - Old soles bottom out at about −0.020 BU: pelvis .26, hip −.02, knee −.13, boot −.115, half-height .015. They sink slightly below the anchor.
  - Candidate soles sit at about 0.000 BU: pelvis .28, knee −.13, sole −.145, half-height .005.
  - So the candidate feet land on the anchor, about 1.5 art px higher than the old feet. **Intent:** the anchor stays the sim point. Do not compensate by shifting the anchor; the family value (84,108) is shared with the 24 roles.
- **Standing height.**
  - Top of helmet: old about .544 BU; candidate about .583 BU (the crown is at .0975 above the neck; the dome is at about .574).
  - The top rises by about .038 BU, or about 3 art px (about 1.5 px if 1× displays at half size).
  - The feet also rise by .02, so the silhouette itself is only about .018 BU taller (about 1.4 art px).
  - This may slightly exceed the ±1 px at 1× that the review expected for the head-top position. It is a family-consistency result, not a defect to fix with a scale factor, because the review forbids one.
- **Healthbar.**
  - Both models put `hp_healthbar` at z = .66 on root. It sits at the same world point, so the offset from the anchor is identical.
  - Absolute pixel values in `hardpoints.json` change by the anchor delta (+24, +32), so **compare relative to the anchor**.
  - The gap from helmet top to bar shrinks from about .116 to about .078 BU (about 9 → 6 art px).
  - **Intent:** keep .66, the value shared by the non-recon roster, rather than raising it for this one unit.
- **Team colour.** The large team-coloured chest rig and helmet are replaced by the crown, chest marker and sleeve bands. Ownership at 1× will read weaker than today.
  - **Intent:** accept this only if it matches the other US roles in the context row.
  - Do not enlarge the accents for this unit alone (review Q2 §4).

## Pilot controls, for Codex

- **Baseline:** the current live `unit.US.rifle` frames and hardpoints, untouched.
- **Family controls:** the approved live `unit.US.recon`, `unit.US.at` and `unit.US.elite`, and the `unit.IR/SY/SA.rifle` exports.
- **Same settings everywhere:** camera elevation 30° and azimuth 45°, PX_PER_BU, default sun 3.3, and the pass list. Team colours `#287bd1` and `#d54435`, plus one extreme light and one extreme dark colour if the UI check runs.
- **Pose sample:** idle, move, fire, cover and death for d01 plus one diagonal, at 1× and 2× on the world background. Also the portrait and build cameo in two team colours.
- **Measure, relative to the anchor:**
  - lowest opaque sole pixel against the anchor row;
  - top opaque pixel (standing height);
  - `healthbar` and `muzzle` for every pose;
  - the full 200-pose bounds check, reverse/reset and hardpoint checks;
  - byte parity of the other 24 roles' geometry, poses and materials. This should hold trivially, because no shared source changed.

## Attribution

This candidate spec is Claude authoring (`author`/`provenance.spec_author`). The earlier attributions are preserved in the provenance block:
- `infantry_roster.py`: Codex source, from the user-authorized quota takeover, reused unchanged.
- `infantry.py`: the original Claude US rifle, unchanged and still live.
- `fclib.py`: Claude.

## Remaining gates (all unrun)

- The spec has not been parsed by the pipeline. There has been no Blender render and no 200-pose bounds, reverse-reset or hardpoint validation.
- No parity check has been run on the other 24 roles.
- There has been no native 1×/2× pilot, portrait or cameo comparison.
- The decision on accepting the `work` hardpoint, and on isolating the output root, is pending.
- Manifest, export, UI derivative regeneration and promotion are all still to come. The live spec and pixels stay authoritative until then.

No test, render or visual acceptance is claimed. All original failures and evidence are kept as they were.
