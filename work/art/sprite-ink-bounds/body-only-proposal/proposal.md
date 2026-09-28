# Per-frame sprite ink bounds proposal

The existing packer emits one common crop across every pose and layer, including shadows. Its `frame`, `sourceSize` and anchor fields describe that padded crop. They do not expose individual body silhouettes. The diagnostic parking overlay intentionally retains the full source canvas instead.

A bounded descriptor-only candidate can add `ink_bounds: {x, y, w, h}` to each pose's atlas frame descriptor. Coordinates are integer frame-local pixels at that descriptor's scale; bounds are half-open, with positive width/height. Use the union of matching packed beauty and team pixels whose alpha is at least 1. Exclude shadow. A completely empty beauty/team union uses `null`. Derive each scale independently from actual final PNG bytes rather than dividing or rounding 2x bounds. For multipart assets, this is the actual pose's authored part; the renderer must use the parts it displays, not unrelated frames or shadows.

No PNG, anchor, sourceSize, frame rectangle, source model, world scale, pose or Go geometry changes are required. Preserve every existing field and pixel SHA, add an explicit bounds policy/version marker, and verify that every nonzero body/team pixel is contained and each nonempty bound is tight. No field should be derived from the 600 mt combat radius or inferred parking envelope.

The read-only audit records 58 exact frames (29 tuples at two scales). For US strike `parked/d13_f00` at 1x, exact bounds are x63/y76/w101/h59 in its 224x176 frame. Threshold alpha>8 would remove 2–3 pixels of rendered fringe (x65/y79/w97/h54), so exact nonzero coverage is the conservative policy. The same audit retains alpha>=9, >=33 and >=128 comparisons for evidence; they are not approved alternative shipping cutoffs.

This is screen-space art coverage only. It does not establish a correct terrain occlusion or depth algorithm. Root owns runtime sorting, raised-terrain interaction and actual browser acceptance. Current source/native compositions remain valid while the first browser course is held for flat-terrain cuts through intact aircraft sprites.
