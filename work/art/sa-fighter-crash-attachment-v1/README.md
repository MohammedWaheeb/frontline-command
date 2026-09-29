# SA fighter crash attachment correction

The complete 896-pose export in `aircraft-final-production-v3` passed its 24 world and 20 UI checks but failed native review: the lost left wing left its pale team plate and payload rail floating beside the body. Parent directly inspected both original native crash pages and confirmed the failure. That source, every raw/packed output, and the failed review remain unchanged.

This private candidate adds only an SA fighter crash visibility rule that removes `wing_team_-1` and `pylon_-1` from both body and shadow lists. It changes no geometry, materials, transforms, hardpoints, camera, anchors, scale, animation clocks, payload rules or other aircraft. Original Claude model authorship is retained; this three-line correction is Codex work under the user's post-quota fallback authorization.

Actual Blender source proof passes 9,056 unchanged poses, exactly 64 changed SA crash poses and 9,120 reverse resets. Evaluated geometry uses canonical oriented face cycles and vertex coordinates, avoiding unrelated mesh-index ordering. All material values, transforms, hardpoints and 11 UI poses are exact. The 64 changed poses pass projected bounds checks.

`prepare-production.py` creates the separate `sa-fighter-crash-production-v1` stage. It copies the 832 unaffected raw tuples byte for byte, renders all 64 crash tuples afresh, and runs the complete pack, fresh UI, metadata and pixel checks. `verify-export.py` then rechecks original raw preservation, copied raw equality, hardpoint bytes and unchanged native contact bytes. New native review and a new handoff are required; the failed original never becomes accepted.

The same shared jet construction is used by pending US and SA strike aircraft. Their crash branch requires a separate diagnostic before bulk production. No strike source changes are included here.
