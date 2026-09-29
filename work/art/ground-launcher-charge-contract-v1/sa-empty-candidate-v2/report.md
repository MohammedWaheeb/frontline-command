# SA empty-canister candidate v2: source authoring report

Author: Claude, exact `claude-opus-5-5`. Date: 2026-09-29. Source authoring only.
**Nothing was run.** I did not run Blender, the browser, host, tests, installs, rendering or deployment. This report makes **no claim of parity, reset, clearance, test or render acceptance**, and no visual outcome is approved.
The only file edited is `candidate-vehicle_roster.py` in this directory. The live source, `candidate-v1` (model `fdff1a61…ac66`, its failed SA pilot and its 8,080-pose proof), the proposal, the review and all evidence and pixels are unchanged.

Implements the recommended option in `work/claude/29sept-ground-launcher-charge-review.md`: a fixed U-shell, open at the top and at the muzzle end. There is **no hinged lid**.

## Edits

1. **`launcher_truck`, SA branch only** (`style == 'SA'`, after `canister_cap_{i}`):
   - Creates one new material, only when an SA launcher is built: `vr_spent_liner`. It is `#3A3631` dark grey-brown, roughness 0.92, grime 0.15, metal 0, not team and not emissive. No other variant gets this material in `bpy.data`.
   - Builds four new meshes parented to `erector_pivot` with `bevel=0`. Each piece has two material slots, `[<SA>_paint, vr_spent_liner]`, and only its cavity-facing polygon uses slot 1 (liner). The dark interior comes from real geometry. It is not a decal on a solid face.

     | Object | Size (BU) | Pivot-local extent | Liner face |
     |---|---|---|---|
     | `canister_shell_floor_0` | 1.045 × 0.16 × 0.03 | X 0.0275–1.0725, Y ±0.08, Z 0.02–0.05 | top (+Z) |
     | `canister_shell_side_0_1` | 1.045 × 0.03 × 0.13 | Y 0.05–0.08, Z 0.05–0.18 | −Y |
     | `canister_shell_side_0_-1` | 1.045 × 0.03 × 0.13 | Y −0.08 to −0.05, Z 0.05–0.18 | +Y |
     | `canister_shell_rear_0` | 0.03 × 0.10 × 0.13 | X 0.0275–0.0575, Y ±0.05, Z 0.05–0.18 | +X |

   - Together the four pieces exactly fill the original `canister_0` bounding box (1.045 × 0.16 × 0.16 centred at (0.55, 0, 0.10)), and their outer faces are coplanar with it. The pieces do not overlap each other. The cavity is 1.015 long, 0.10 wide and 0.13 deep, open at the top and at the muzzle (+X). Walls and floor are 0.03 BU thick, which gives about 1.5 px of paint rim at 1×.
   - The unchanged solid `canister_team_0` band (X 0.84–0.92, 0.17 × 0.17) passes through the cavity and acts as a bulkhead. That leaves a dark slot about 0.78 BU long behind it and a short open section at the muzzle.
   - New handles: `B.h['sealed_canister'] = [canister_0]` and `B.h['empty_shell'] = [floor, side_1, side_-1, rear]`. The shell objects are **not** added to `B.objs`, `B.effects`, `B.detach` or `B.missing`, so `rig.parts` is unchanged.
   - I did not change `canister_0`, `canister_team_0`, `canister_cap_0`, the `missiles` group, cradle, ram, plumes, smoke, the hardpoints (`launch`, `healthbar`) or `sa_launcher`'s buttresses.
2. **`pose()`, after the existing charge-count block:** `spent = 'empty_shell' in B.h and (charge_count == 0 or name == 'ready_empty')`. When `spent` is true, `canister_0` is added to `missing` and the four shell objects are appended to the end of `hull`. From there they enter both returned lists (visible and shadow), so the shell casts the canister's shadow in these states only.
3. Added a one-line provenance note to the module docstring. This changes the file hash only.

## State membership and reset

| State | `canister_0` | shell kit | cap |
|---|---|---|---|
| SA `idle/move/damaged/deploy_charges_0` | hidden | shown and casts shadow | hidden (unchanged) |
| SA `pack_charges_0` (metadata reversal of `deploy_charges_0`) | hidden | shown | hidden |
| SA `ready_empty` (**approved old-state exception**) | hidden | shown | hidden (unchanged) |
| Every other SA state: generic `idle/move/damaged/deploy/pack`, `ready`, `fire`, `wreck`, etc. | unchanged | not listed | unchanged |
| All US/IR/SY states | unchanged | does not exist (`empty_shell` never created) | n/a |

- **Hidden means excluded from rendering and shadow.** `_render_passes_original` sets `hide_render = o not in part_set` for beauty and `o not in shadow_set` for shadow, and the team/coverage passes hide objects outside `part_set` the same way. An unlisted shell therefore cannot render or cast a shadow in any unrelated state.
- `wreck` returns early from `B.objs` only. It keeps the original sealed-box wreck, with no shell.
- SA `fire_charges_*` is still rejected by the existing guard, so `fire` can never show the shell.
- **Reset:** the shell objects are children of `erector_pivot`, so `_all_objects` puts them in `rig.original`, and `_restore` resets their transforms before every pose. No pose writes to their transforms; they move only through the erector. Visibility is recomputed from scratch on every call, so forward and reverse order should be equivalent. This is expected, not proven.
- **Clearance:** every shell piece lies inside the original canister volume. Clearance to the cradle, buttresses and bed therefore cannot be worse than the loaded box at the same erector angle. The shell overlaps the cradle by the same Z 0.02–0.025 as the original box did. This is still to be proven on evaluated meshes.

## Expected test boundaries (for Mencius; none run)

- **Must be exact against `candidate-v1`:**
  - all 26 other vehicle variants (geometry, materials, transforms, hardpoints, rendered-object membership, and `bpy.data` material set);
  - every SA state except the four `_charges_0` states and `ready_empty`;
  - in the changed states, every SA object other than `canister_0` and the shell;
  - pivot, hardpoints, camera, anchor (224, 264), 448 × 384 canvas, footprint and clocks.
- **Expected SA scene-level differences:** four additional mesh objects and one additional material in the SA.launcher scene. Hidden meshes are one of the "rendered-object membership" checks and should be confirmed hidden in every unchanged pose.
- **Unverified risk for exact pixels in unchanged SA poses:** the shell meshes are created between `canister_cap_0` and `plume_0`, so object creation order in the SA scene changes. Hidden objects should not enter the Cycles render, so unchanged SA poses are expected to stay pixel-exact, but the parity run must confirm this. It must not be assumed.
- **Expected pixel differences, changed states only:**
  - beauty: dark slot, visible inner walls, and band end faces exposed inside the cavity;
  - team: the band's ±X inner faces become visible inside the slot at some headings, a small team-mask increase from unchanged band geometry;
  - shadow: expected to match the old silhouette very closely, but not bit-exact, because the shell edges are sharp where the old box had a 0.015 bevel and the open top changes self-shadowing.
- **`ready_empty`:** needs its own before/after record, separate from the 8,080-pose proof. Add the reference pair generic `fire/dNN_f03` → new `ready_empty/dNN_f00` at d03/d07/d11/d15. A visible closed→open pop is expected here and recorded; generic `fire` is intentionally unchanged.
- **Known risks to inspect:**
  - The sharp 0.03 BU rim may alias to about 1 px.
  - The `damaged_charges_0` smoke/fire may cover the slot. If it does, record it as an unchanged damage-animation limitation.
  - The liner may read too close to terrain shadow. It is not black, but this needs checking.
  - Coincident internal faces (floor top under walls, rear/side contacts) are enclosed and should not z-fight. Check for this.

## Remaining unrun gates

1. Evaluated-mesh parity and membership proof against `candidate-v1` for all 27 variants and every pose, plus the separate `ready_empty` exception record.
2. 16-heading bounds, clearance and forward/reverse reset proof, including `deploy_charges_0` and `pack_charges_0` at full raise.
3. 32 native candidate poses: the 28 empty-state pilot tuples at d03/d07/d11/d15 plus `ready_empty` f0, with generic references reused SHA-exact. Add the four `fire f03 → ready_empty f00` pairs. Inspect beauty, team, shadow and composite at 1× and 2×.
4. Parent/root native acceptance. A lid (v3) is considered only if the open slot proves too weak.
5. After that: full SA export, sparse-overlay use, Go event timing, ownership, replay/save. Out of scope here.

The failed SA pilot from `candidate-v1` and its 8,080-pose proof are unchanged and must not be relabelled as covering this model.
