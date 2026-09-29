# HQ role candidate v1: SY and SA (29 Sept, claude-opus-5-5)

This covers source authoring only. I edited nothing except `candidate-building_roster.py` and this report. I did not run Blender, a browser, the host, tests, installs or a deployment, and no render or test acceptance is claimed. The original failures, the live `building_roster.py`, exports, evidence, locks and handoffs are untouched. The source is `work/claude/29sept-hq-role-review.md`.

## Actual edit

There is one hunk, inside `Architect.make()`, in the `role in ('hq','outpost')` branch:

- I inserted two new arms at the head of the faction chain:
  - `if self.faction=='SY' and not small:`
  - `elif self.faction=='SA' and not small:`
- The original SY arm changed only from `if self.faction=='SY':` to `elif self.faction=='SY':`. Its body is byte-identical, and it is now reached only by `building.SY.outpost`.
- The original SA arm is textually unchanged, and it is now reached only by `building.SA.outpost`.
- The IR arm, the US/IR-outpost `else`, the `if not small:` vents and crate, `lamps()`, the final critical sweep, scaffold, rubble, cutter and hardpoint code are all unchanged.
- No helper changed: `block`, `mast`, `door`, `vents`, `crate` and `lamps` are the same. `building_common.py`, specs, footprints, camera, anchor and gameplay are untouched.

New names avoid the automatic critical-sweep prefixes (`vent_`, `stack_`, `exhaust_`, `gantry_`, `tower_`, `shield_pylon`).

## SY HQ: improvised signals compound

Base values: the house roof top `z` is 0.915 (unchanged). The old `watch_room`, and the `mast()` that sat on it, no longer exist in the SY HQ.

| Object(s) | Construction | Bounds (x / y / z) | State sets |
|---|---|---|---|
| `sy_command_post` via `block()` (wall, `_roof`, `_team`, `_patch`, 4× `_roof_rib`, 4× `_brick`, 2× `_window`) | 0.85×0.80, block height 1.66 | x −1.375…−0.525 / y 0.10…0.90 / wall to 1.715, roof slab top 1.795 | structure. `_roof` goes to detachable (automatic). `_roof_rib` and `_patch` go to **critical_hide**. |
| 10× `sy_parapet_sandbag` | canvas, bevel 0.04, bunker vocabulary. Front and rear rows of 3 at y 0.16/0.84; sides of 2 at x −1.33/−0.57 | inside the post roof / z 1.795…1.905 | structure + **detachable** |
| shared `mast(-.95,.50,1.795,.45)`: `mast_leg` ×2, `mast_brace` ×4, `mast_rotor` + `radar_back`/`radar_face`, `mast_warning` | unedited shared helper, same paddle, same spinner `(rotor,'z',1)` | paddle about 2.23…2.46; warning top 2.595 | structure. The rotor goes to critical_hide (via the helper). The legs, braces, paddle meshes and warning are added to **critical_hide** by a `r.structure` slice. |
| `sy_radio_shack` via `block()` (same sub-parts) | 0.62×1.40, block height 0.42 | x 1.31…1.93 (roof 1.26…1.98) / y −0.25…1.15 / roof top 0.555 | structure. `_roof` goes to detachable. |
| `sy_shack_awning` | canvas, tilted −0.14 about y, in the gap west of the shack | x about 1.07…1.33 / y −0.10…1.00 / z about 0.56…0.60 | structure + **detachable** |
| `sy_radio_mast`, `sy_radio_crossbar`, 3× `sy_radio_element`, 2× `sy_radio_guy` | producer yagi vocabulary. Static mast from the shack wall top at 0.475. Two guys run from 1.45 on the mast to (y −0.18 / 1.08, z 0.555). | x 1.345…1.895 / y −0.18…1.08 / top about 1.78 | structure + **critical_hide** |

- **Rig height:** 2.30 → **2.595** (≤ 2.67). The solid top is about 1.905 (parapet).
- **Healthbar:** 2.46 → 2.755.
- **Smoke points:** 1.656/0.92 → 1.868/1.038.
- **Scaffold height:** r.height×0.8 = 2.076.

Expected SY states:

- **Idle and produce:** the same single-paddle rotation and frame count. The paddle is now higher.
- **Damaged:** loses the house, post and shack roof slabs, the parapet, the awning and the vents (detachable, as before).
- **Critical:** additionally loses the post ribs and patch, the whole comms mast and paddle, and the yagi with its guys. The storey shaft remains to 1.715.
- **Rubble:** hides all of the structure above.

## SA HQ: buttressed command keep

The cab is still at (−0.4, 0.2). The `mast()` paddle is **not** used on the SA HQ.

| Object(s) | Construction | Bounds | State sets |
|---|---|---|---|
| `sa_plinth_step` | 8-sided, r 0.60, paint2 | x −1.00…0.20 / y −0.40…0.80 / z 0.915…1.015 | structure |
| `sa_command_plinth` | 8-sided, r 0.54→0.47, wall | z 0.915…1.365 | structure |
| 4× `sa_plinth_fin` | 0.16×0.07×0.40 radial fins at the diagonals, r 0.55, paint2 | radius 0.47…0.63 / z 0.915…1.315 | structure |
| `octagonal_cab` | r 0.42, **shaft shortened from 0.50 to 0.35** so that critical leaves a clean stub. The intact silhouette matches the old cab plus glass band. | z 1.365…1.715 | structure (stays in critical) |
| `cab_glass`, `cab_cap` | same dimensions as before, raised by 0.45 | glass 1.715…1.875, gold cap 1.875…1.975 | structure + **critical_hide** |
| `sa_array_stem` | metal, r 0.05 | z 1.975…2.095 | structure + **critical_hide** |
| `sa_command_array_rotor` (empty) with `sa_roof_array`, `sa_array_face` (lens), `sa_array_crown` (team) | local rotor, tilted −0.18 so the lens face tilts upward. Spinner `(rotor,'z',1)`, the same registration as `mast()`. | pivot 2.095 / top about 2.565 / horizontal sweep radius about 0.31 | the rotor goes to **critical_hide**. The children are structure. |
| `sa_command_wing` via `block()` (wall, `_roof`, `_team`, 2× `_buttress`, `_sunshade`, 2× `_window`) | 0.70×1.80, block height 0.50 | x 1.17…1.87 / y −0.55…1.25 (sunshade to −0.745) / roof top 0.635 | structure. `_roof` goes to detachable. |
| `sa_wing_canopy`, `sa_wing_canopy_inset` | thick lip in the producer-bay vocabulary (wall + roof) | x 1.07…1.97 / y −0.66…1.36 / z 0.635…0.795 | structure + **detachable** |

- **Rig height:** 2.335 → **2.60** (≤ 2.67).
- **Healthbar:** 2.495 → 2.76.
- **Smoke points:** 1.681/0.934 → 1.872/1.04.
- **Scaffold height:** 2.08.

Expected SA states:

- **Idle and produce:** the local array rotates one turn over n frames, the same as the old paddle.
- **Lowpower and disabled:** the lens face dims and goes dark through the emission scale. The old `mast_warning` light is gone from the SA HQ; flag this if a lamp is required.
- **Damaged:** loses the roofs, the canopy and inset, and the vents.
- **Critical:** additionally loses the glass, the gold cap, the stem and the array. The plinth and cab stub remain to 1.715, which fixes the "critical ≈ damaged" defect.

## Constraint checks (by arithmetic, not evaluated)

- **Door apron** x ∈ [−0.35, 0.55], y < −1.0: no new geometry. All new SY parts are at x ≤ −0.475 or x ≥ 1.07. The SA keep has y ≥ −0.43, and the SA wing is at x ≥ 1.07.
- **Pad:** all new geometry lies within ±2.0. The maximum x is 1.98 (SY shack roof slab).
- **Lamps and crate:**
  - The lamps (±1.84, −1.85) are clear.
  - The crate (1.3, −1.4) is clear. The nearest new geometry is the SA sunshade at y −0.745.
- **Vents** (x 0.24…0.76, y 0.335…0.565): the SA step is at x ≤ 0.20, about 0.04 clear. The SY post is at x ≤ −0.475.
- **Materials:** only existing keys are used: wall, paint2, team, trim, metal, glass, lens, canvas, roof, brick.
- **Scope:** no new gameplay, doors, hardpoint kinds, special animations, charges or insignia.

## Known carry-overs, not fixed on purpose

- In the damaged state, the `block()` ribs and the mast legs above a hidden roof slab float about 0.06–0.08. This is the same behaviour as the existing house and the old watch room.
- The SY post and SA keep bricks and windows below the house roof are buried inside `command_house`, as with the old watch room.

## Parity expectations for Codex/Mencius (unproven)

These should be **identical** to the live source in evaluated object names, meshes, transforms, materials, state sets, spinners, height and hardpoints:

- `building.SY.outpost`
- `building.SA.outpost`
- `building.IR.hq`
- `building.IR.outpost`
- `building.US.*` (US HQ is built in `us_buildings.py`)
- every other role for all four factions (57 others)

For `building.SY.hq` and `building.SA.hq`:

- Foundation and rubble are expected to be pixel-identical: the pad and rubble are unchanged, and structure is hidden in both.
- Construction, idle, lowpower, disabled, damaged, critical and produce are expected to change.
- The reset contract (`r.original` capture and restore) covers the new objects automatically.
- The healthbar and smoke hardpoints move as listed above. The rally hardpoint is unchanged.

## Remaining unrun gates

1. Evaluated mesh and object dump, with a diff against the live source, for the outpost, IR and other buildings listed above.
2. Pose-reset and hardpoint proof for the SY and SA HQs.
3. Boolean cutter behaviour on the new meshes. This includes the rotor children and the guy cylinders, which are thin at r 0.007.
4. Atlas cell and clipping check at rig heights 2.595 and 2.60.
5. The tiny native pilot, then the 28 pose, 24 integrity and 20 UI checks for the two HQs.
6. The new 1x four-role comparison for the SY and SA identity gates.

Original exports stay as the baseline. No render approval is implied.
