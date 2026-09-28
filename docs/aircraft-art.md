# Aircraft source handoff

Eleven missing aircraft now have original procedural source geometry and full
directional specifications. These are **unrendered source candidates**, not
finished game art. Codex authored `aircraft_roster.py` during the explicitly
authorized Claude quota takeover, using the Claude-authored shared fclib contract.
The accepted Iranian strike drone and its specifications remain unchanged.

| IDs | Distinct massing and equipment |
|---|---|
| US.fighter | Compact cranked-arrow wing, paired canted fins, narrow cockpit, air-to-air rails |
| US.strike | Broad clipped strike wing, longer cockpit, larger ground payload and twin trunks |
| US.gunship | Narrow tandem gunship, chin cannon, four-blade rotor, stub-wing rails |
| US.airlift | Wide troop cabin, separated tandem rotors, side doors and articulated rear ramp |
| IR.fighter | Smaller canopy-free chevron drone, chin sensor, duct intake and twin missile rails |
| IR.gunship | Unmanned twin ducted-fan loiter platform, squat sensor pod and finite payload rails |
| IR.isr | Long observation wing, dorsal data-link dome, belly sensor and pusher propeller |
| SY.scout_drone | Small repaired X-frame quadrotor and visible camera, no weapons |
| SA.fighter | Pale double-delta/canard fighter, prominent single fin |
| SA.strike | Heavier swept-wing strike jet with twin fins and substantial wing-root mass |
| SA.gunship | Wide armored escort cabin, five-blade rotor, protected tail rotor and service panels |

The initial source preview made the two US jets too similar, so the strike wing
was broadened and its sweep reduced before freezing the source. Rotor phase
sampling was also corrected: advancing four identical blades by 90° per sample
would produce a frozen visual rotor. Each animation loop now advances one blade
spacing in smaller steps. These source findings still require real pixel review.

## State coverage

Every required state from the authoritative inventory is preserved: 16 headings
for fixed-wing flight/banking/fire/empty/parked/takeoff/landing/damage/crash;
rotor hover/movement/fire/parked/takeoff/landing/damage/crash; drone
flight/banking/parked/launch/recover/damage/crash with fire/empty only where armed.
Survey has orbit, and airlift has a low boarding pose. Additional rearm states
open actual access panels; armed rotorcraft also have an empty-payload state.
Airlift board/unload aliases point to its open-door low-hover pose.

Gear retracts on takeoff and extends on landing. Rotor run-up and bank poses
are cosmetic interpolation only. Sources are near ground level so the current
renderer supplies altitude once; all specs explicitly record that contract.
Two payload meshes are role-readable equipment, not a claim that every aircraft
has exactly two rounds. Only authorized private ammo selects sustained empty
presentation. Unarmed aircraft have neither payload groups nor fire states.

Each pose restores transforms and material controls. Death removes payload,
damages wings/rotors, chars the model, and stops glow. It does not leave a new
selectable entity or collision object. Grounding the terminal visual is a
renderer responsibility described in `docs/vehicle-air-renderer-contract.md`.

## Evidence and limits

`work/art/aircraft-roster/source-check.json` contains 11 assets / 6,352 forward
poses and 6,352 reverse-order comparisons, all passing. The minimum conservative
source projection margin is 21.305 px at 2×. Nine focused semantic tests cover
roster/radius consistency, private charge art, turret registration, unarmed
roles, landing gear/service panels, airlift doors, and non-aliased rotor samples.

```sh
work/art/.venv/bin/python work/art/vehicle-roster/generate-specs.py aircraft --check
work/art/.venv/bin/python work/art/vehicle-roster/test-source.py
work/art/.venv/bin/python work/art/vehicle-roster/check-source.py aircraft
```

`source-previews/native-overview.jpg` is an inspected native-scale flat geometric
design aid. Its painter's transparency and lack of Cycles bevel/AO/materials
cannot certify rotor transparency or final readability. No Blender process was
launched in this lane. Real native contacts, all-angle clipping, palette masks,
1×/2× portraits/cameos, atlas coverage, and in-game aircraft behavior remain
mandatory before art approval. Shared manifests and renderer hooks are owned
by the coordinator and have not been changed here.
