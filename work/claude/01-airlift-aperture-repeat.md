# US.airlift — real cabin apertures, minimal repeat

Root requested this correction after the actual pilot's lowered ramp and
sliding doors exposed solid cabin walls. Preserve the original 78-pose pilot
and its screenshots under `pilot-v1/unit.US.airlift/`. No source-lane Blender
process has been launched. Only the sole worker may run this request after
coordinator approval and its current asset boundary.

The revised model uses separate floor/roof/nose/side walls, headers, sills and
rear jambs around genuine open spaces. Dark interior floor/liner and benches
give the holes depth; they are not painted exterior rectangles. Door windows
move with sliding panels. The rear ramp now descends to the ground, rather
than tipping slightly upward from the cargo sill. The unarmed role, tandem
rotors, team panels, hardpoints, specs and state timing are preserved.

| Input | SHA-256 |
|---|---|
| `assets/pipeline/blender/models/aircraft_roster.py` | `dca923b26bcb6bf81b70c3330ff60ac87ef00d2b6a38416d764f4d3a99ac76f2` |
| `work/art/aircraft-roster/airlift-aperture-lock.json` | `926b66032e2aa79731c911b288835612ca90a7a8a4e77af6cf11ee3a7f71a145` |

The original lock is preserved in `airlift-aperture-baseline-lock.json`.
The current family lock is updated, but accepted SA.tank and the vehicle lock
are untouched. All ten other aircraft preserve primitive geometry/materials
and all 5,680 pose signatures exactly against checkpoint `00011c3`.

Source-only checks passed: three aperture/parity regressions, nine existing
semantic tests, all 11 aircraft / 6,352 forward/reverse poses and conservative
camera/shadow bounds (minimum 21.305 px at 2×). The separate native flat source
contact `airlift-aperture-source@1x.png` was inspected; it is not Cycles evidence.

## Exact repeat scope

Sixteen world poses: directions 3, 7, 11 and 15, each with `hover` frame 0,
`hover_low_board` frames 0 and 3, and `rearm` frame 0. The exact records are in
`work/art/aircraft-roster/airlift-aperture-plan.json`. This compares closed and
open doors from all four quadrants, with two rotor/low-hover phases. The helper
also checks every one of the airlift's 672 source poses forward/reverse in real
Blender before rendering. No UI repeat or full production coverage is claimed.

From the repository root, sequentially and only after approval:

```sh
blender -b -t 4 --factory-startup -P work/art/aircraft-roster/render-airlift-aperture.py > work/art/aircraft-roster/airlift-aperture-render.log 2>&1
work/art/.venv/bin/python work/art/aircraft-roster/check-airlift-aperture.py > work/art/aircraft-roster/airlift-aperture-check.log 2>&1
```

Stop on any error. The helpers refuse changed frozen inputs and any prior
output at `work/art/aircraft-roster/pilot-apertures-v2/unit.US.airlift/`.
They write source/spec copies, editable `.blend`, pose-reset audit, exact
beauty/team/shadow plates, native contact/palette and pixel report there only.

Native review must see a dark, recessed side opening after the panel slides
and an open rear cargo mouth above the descending ramp, especially direction
11. Inspect direction 15 as the previously unsampled opposite side. Reject
solid walls in the doorway, floating windows, exposed exterior gaps when
closed, floating ramp, mask holes, clipping or a misleading armed silhouette.
Actual Cycles visual approval remains mandatory even if numeric tests pass.
