# Combat vehicle / aircraft bounded render request

Sources frozen 2026-09-28 during the user-authorized Claude quota takeover.
Claude `claude-opus-5-5` authored the ground roster; Codex audited it and authored
the specifications and missing aircraft. No Blender process has been launched
by the source lane. This file is a request for the coordinator, not permission
to start a competing worker or a bulk-render completion claim.

## Frozen inputs

The first airlift pilot exposed solid cabin geometry behind the open doors.
Its original output remains intact. The narrowly corrected source below now
requires the 16-pose isolated repeat in `01-airlift-aperture-repeat.md`; do not
rerun the original airlift commands into `pilot-v1`. The original source lock is
preserved as `work/art/aircraft-roster/airlift-aperture-baseline-lock.json`.

| Source | SHA-256 |
|---|---|
| `assets/pipeline/blender/models/vehicle_roster.py` | `f4a524de61133c29fd7f0142cd2f5891af420efbecd976f6ac6cc588ccad3b9d` |
| `assets/pipeline/blender/models/aircraft_roster.py` | `dca923b26bcb6bf81b70c3330ff60ac87ef00d2b6a38416d764f4d3a99ac76f2` |
| `work/art/vehicle-roster/source-lock.json` | `b1c1e4852ac1d31fa791f55bba6d47924f1fcbde609d4dc3077e55351f5dd904` |
| `work/art/aircraft-roster/source-lock.json` | `b2c4fbf66681f30fa48ee77688188407c5fd9bfb4f8e22253df9710ed504d744` |

Each lock records exact hashes for every corresponding unit spec, shared fclib,
standard UI-shot renderer, pack/alpha helpers, isolated pilot helpers and plan.
The pilot helper refuses changed inputs or an existing pilot directory. It also
performs all source poses forward and reverse inside real Blender before any
selected rendering. Read `docs/vehicle-art.md`, `docs/aircraft-art.md` and the
precise `docs/vehicle-air-renderer-contract.md` handoff before integration.

Blender-free evidence: 27 ground variants / 8,080 poses, 11 aircraft / 6,352 poses;
all reverse-order comparisons and conservative canvas bounds pass. Nine focused
semantic tests pass. These checks do not certify Cycles pixels or finished art.
Native flat geometry contacts were inspected and are explicitly labeled previews.

## Proposed queue

Insert **only the first two** at a complete-asset boundary after root approval.
Review them before proceeding to the remaining four requested representatives.
Do not render all 38 variants or change shipping manifests at this stage.

| Stage | ID | Selected poses | Purpose |
|---|---|---:|---|
| A | `unit.SA.tank` | 40 | Independent turret/ground shadow, long barrel, displaced wreck, hull-down berm and blade |
| A | `unit.US.airlift` | 78 | Tandem-rotor clearance, visible doors/ramp, gear/run-up, service panels, crash and native cabin read |
| B after review | `unit.IR.launcher` | 66 | Erector, distinct zero/one/two charges, launch/volley, plume clipping and heavy wheeled mass |
| B after review | `unit.SY.apc` | 35 | Repaired military technical, real doors, no double turret, readable passenger body |
| B after review | `unit.US.fighter` | 74 | Original jet silhouette, parked/flight gear, payload, service, bank and crash |
| B after review | `unit.IR.gunship` | 74 | Canopy-free ducted-fan drone silhouette, rotor transparency, service and depletion |

Exact per-state/direction/frame records are in each lane's `pilot-plan.json`.
Every temporal frame is sampled at direction 3, with first/last frames at 7 and
11. This is 367 selected renders across six representatives, not complete angle
or production coverage. Source bounds cover all declared directions, but real
all-angle clipping/mask review still follows any accepted family pilot.

## Exact commands for the sole worker

Run from `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i`. The verified
Blender executable is `/opt/homebrew/bin/blender`. Execute sequentially, never
in parallel with another Blender process. For the first authorized insertion:

```sh
blender -b -t 4 --factory-startup -P work/art/vehicle-roster/render-pilot.py -- unit.SA.tank > work/art/vehicle-roster/pilot-unit.SA.tank.log 2>&1
blender -b -t 4 --factory-startup -P work/art/vehicle-roster/render-pilot-ui.py -- unit.SA.tank > work/art/vehicle-roster/pilot-ui-unit.SA.tank.log 2>&1
work/art/.venv/bin/python work/art/vehicle-roster/check-pilot.py unit.SA.tank --ui > work/art/vehicle-roster/pilot-check-unit.SA.tank.log 2>&1
blender -b -t 4 --factory-startup -P work/art/vehicle-roster/render-pilot.py -- unit.US.airlift > work/art/aircraft-roster/pilot-unit.US.airlift.log 2>&1
blender -b -t 4 --factory-startup -P work/art/vehicle-roster/render-pilot-ui.py -- unit.US.airlift > work/art/aircraft-roster/pilot-ui-unit.US.airlift.log 2>&1
work/art/.venv/bin/python work/art/vehicle-roster/check-pilot.py unit.US.airlift --ui > work/art/aircraft-roster/pilot-check-unit.US.airlift.log 2>&1
```

For each separately approved Stage B ID, run the same three helpers with that
exact ID, routing logs to its corresponding lane. Each helper exits nonzero on
failure; the worker must stop on the first failure instead of interpreting a
later command as success. No helper writes `assets/build/`, `.blend` shipping
sources, or a shared manifest. Pilot scene and images are isolated under:

- `work/art/vehicle-roster/pilot-v1/<unit.ID>/`
- `work/art/aircraft-roster/pilot-v1/<unit.ID>/`

Expected outputs: locked model/spec copies, editable pilot `.blend`, actual
Blender `pose-reset.json`, selected beauty/team/shadow PNGs and projected
hardpoints, `render.json`, native `contact@1x.png`, eight-palette contact,
standard-camera 2× portraits/cameos plus alpha-safe 1× derivatives, combined UI
contact and `check.json`. The helper reuses the unchanged standard portrait
renderer in an isolated root. It does not replace final portrait approval.

## Review before accepting a pilot

Inspect real native contacts, not only enlarged smooth images. Confirm each role
reads as the designed original faction vehicle/aircraft; exposed equipment must
remain visible at 1×. Check all rendered alpha borders, clear team masks and
transparent UI corners. Independently composite tank/APC turret onto hull at
matching and different headings using published pivots; no floating, duplicate
weapon or static second shadow. Check muzzle/launch hardpoints against barrels.

Check doors expose a usable opening, ramps hinge from the body, service gear
does not detach, recoil follows its axis, deployment is reversible, and damage
does not leave a healthy-looking live model. Check rotor planes clear the cabin
and each other, rotor blur does not obscure the airframe, landed gear supports
it, empty payloads are visibly different, and drones cannot be mistaken for
manned aircraft. Smoke, beams and light remain restrained enough for tactical
markers. Cycles material/alpha or canvas failures return to source before bulk
production. Report raw evidence and findings; no manifest `final` status yet.

Remaining after these pilots: real rendering/packing and individual approval for
all 38 new source variants, complete directions/states, all portraits/cameos,
actual renderer hook/privacy tests, and broader native game scenes. The four
legacy samples are preserved, not recertified by this source lane.
