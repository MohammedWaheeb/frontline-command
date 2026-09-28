# Environment props — bounded pilot request

Source-only continuation of assignment 10 during the explicitly authorized
Claude quota takeover. Codex authored 21 original missing prop models/specs;
the five existing prop samples and `props.py` are unchanged. No Blender process
was launched in this lane. Terrain and all shared render helpers remain frozen.

Frozen source `assets/pipeline/blender/models/environment_roster.py` SHA-256:
`2db5c9eaf98bcd23e2eb15cd340d78a30ddf87f58a68fbf2f90a4d25d9823f59`.

`work/art/environment-roster/prop-source-lock.json` SHA-256:
`4433792e6da8b1cd8dd8e5bb17f3d9c899bcc27c365366c361a4f1f0e049baf1`.

The lock covers every new spec, model, shared fclib/alpha helpers, pilot helper
and exact plan. The worker refuses changed inputs or an existing pilot output.
`docs/environment-prop-art.md` contains the full inventory and gameplay/renderer
constraints. Source audit: 136 poses/reverse comparisons and seven semantic
tests pass; native flat previews inspected. Real Cycles art is not yet verified.

## Requested insertion, after coordinator approval

| ID | Poses | Review focus |
|---|---:|---|
| prop.destructible_wall_hp_light | 12 | 1×1 / 150-HP light screen; visibly broken damage and passable low debris |
| prop.destructible_wall_hp_heavy | 12 | 2×2 / 600-HP solid mass; distinct from light class without claiming inherent sight blocking |
| prop.warehouse_garrisonable | 12 | 3×3 / 900-HP two-squad entry plaques, roof damage, exposed interior, shallow final rubble |
| prop.supply_station_neutral | 4 | Recognizable kiosk/loading platform, neutral palette and separate owner-flag hardpoint |
| prop.palm | 4 | Readable trunk/crown at 1×, restrained foliage, clean shadow and no noisy halo |
| prop.bridge_permanent | 16 | Four headings × full rails/deck/left/right; no internal railing across multi-tile crossings |

These 60 poses cover the chosen families' specified states/headings, not all
21 props. Prioritize the three actual Go object-class skins, then review before
the remaining three. No portraits or build cameos are declared for these props;
the world/editor contacts are their review surface.

## Exact worker commands

From `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i`, with the verified
`/opt/homebrew/bin/blender`, run sequentially only when no other Blender job is
active. For each approved ID from the table, substitute that exact ID for
`prop.destructible_wall_hp_light` below:

```sh
blender -b -t 4 --factory-startup -P work/art/environment-roster/render-prop-pilot.py -- prop.destructible_wall_hp_light > work/art/environment-roster/prop-pilot-light.log 2>&1
work/art/.venv/bin/python work/art/environment-roster/check-prop-pilot.py prop.destructible_wall_hp_light > work/art/environment-roster/prop-pilot-light-check.log 2>&1
```

Use distinct log names for each ID. Stop on any nonzero exit before the next
command. The helper checks all source poses in real Blender forward/reverse,
then renders the exact `prop-pilot-plan.json` list. It never packs shipping art,
changes a shared manifest, or launches another worker.

Expected isolated path:
`work/art/environment-roster/prop-pilot-v1/<prop.ID>/`.
Outputs are exact source/spec copies, editable pilot `.blend`, actual Blender
`pose-reset.json`, beauty/shadow PNGs and projected hardpoints, `render.json`,
native 1×/2× contacts and `check.json`. Pixel checks enforce dimensions, nonempty
beauty, no clipping and distinct declared state plates. Actual visual review is
still required even after those checks pass.

## Review and acceptance boundary

Check the light/heavy/garrison silhouettes side by side at native 1×. Only
garrisons show an open entry and two capacity plaques. Damage must expose
believable structure; destruction must remove walls/roof and leave low debris
inside the same original footprint. Reject any healthy-looking destroyed prop,
edge clipping, detached doorway, misleading extra cover or collider. Review
palms/fences as restrained scenery and bridges as permanent traversable lanes.

After pixel approval, root owns actual class mapping and map placement. The
current simulation grants sight blocking to explicit terrain flags, not every
heavy prop. Dynamic shipment cargo follows real resource-field state. Objective
skins never infer hidden mission tags. Do not place decorative structures across
legal routes. Final map views at 1600×900 and 1280×720, actual fog/rubble behavior,
all remaining sprite sets and broader environment integration remain pending.
