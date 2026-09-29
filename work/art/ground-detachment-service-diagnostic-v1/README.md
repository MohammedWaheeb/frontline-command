# Bounded original-source ground preflight

Prepared while the sole Blender worker renders approved aircraft. Do not run concurrently. No model changes or visual rejection are implied by this source audit alone.

Frozen source: `vehicle-final-production-v1/stage/assets/pipeline/blender/models/vehicle_roster.py`, under that family's production lock. Candidate issues are IR tank flap paint surviving damaged/wreck flap removal; IR AA flap paint surviving wreck flap removal; and IR repair side panels rotating inward into a solid workshop core while benches/tools remain inside it.

`render-diagnostic.py` verifies frozen inputs, records actual visible/shadow memberships and source-space panel motion/contact rays, then renders 40 original-source tuples: four diagonal headings for idle/damaged/wreck of IR AA and IR tank, plus idle/work_repair f0/f2/f4 for IR repair. It uses the declared layers and native camera/anchor. These are diagnostic source views, not Go/runtime or production exports. The AA/tank idle and damaged views are explicitly hull layers; wreck is the declared whole asset. Full body/turret registration remains a separate production gate.

If confirmed visually, corrections must remain isolated: matching flap paint loss flags for the two combat roles; outward panel hinges and true side service bays inside the unchanged IR repair envelope. Preserve the chassis, wheels, source-world scale, footprint, hardpoints, all other roles and existing accepted handoffs. Run evaluated geometry/material/pose parity before candidate native review and any new full export.
