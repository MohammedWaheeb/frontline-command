# Per-frame sprite ink bounds proposal

The existing packer emits one common crop across every pose and layer, including shadows. Its `frame`, `sourceSize` and anchor fields describe that padded crop. They do not expose individual body silhouettes. The diagnostic parking overlay intentionally retains the full source canvas instead.

A bounded descriptor-only candidate can add `ink_bounds: {x, y, w, h}` to each pose's atlas frame descriptor. Coordinates are integer frame-local pixels at that descriptor's scale; bounds are half-open, with positive width/height. Use the union of matching packed beauty and team pixels whose alpha is at least 1. Beauty/team descriptors share that union. Shadow descriptors instead carry their own final shadow alpha coverage under the same field, with their policy sources set to `["shadow"]`; shadows never expand body bounds. Other independent layers likewise use their own pixels. A completely empty relevant alpha union uses `null`. Derive each scale independently from actual final PNG bytes rather than dividing or rounding 2x bounds. For multipart assets, this is the actual pose's authored part; the renderer must use the parts it displays, not unrelated frames or shadows.

No PNG, anchor, sourceSize, frame rectangle, source model, world scale, pose or Go geometry changes are required. Preserve every existing field and pixel SHA, add an explicit bounds policy/version marker, and verify that every nonzero body/team pixel is contained and each nonempty bound is tight. No field should be derived from the 600 mt combat radius or inferred parking envelope.

The read-only audit records 58 exact frames (29 tuples at two scales). For US strike `parked/d13_f00` at 1x, exact bounds are x63/y76/w101/h59 in its 224x176 frame. Threshold alpha>8 would remove 2–3 pixels of rendered fringe (x65/y79/w97/h54), so exact nonzero coverage is the conservative policy. The same audit retains alpha>=9, >=33 and >=128 comparisons for evidence; they are not approved alternative shipping cutoffs.

This is screen-space art coverage only. It does not establish a correct terrain occlusion or depth algorithm. Root owns runtime sorting, raised-terrain interaction and actual browser acceptance. Current source/native compositions remain valid while the first browser course is held for flat-terrain cuts through intact aircraft sprites.

## Isolated implementation evidence

The candidate packer adds only an import and one metadata annotation call after all final atlas PNGs exist. It retains the production packer SHA `730b7f86232220acf5ed0b6f5858183a0509c8eec9076c63fbd77207fc1a198e` as its exact base. `candidate/sprite_ink_bounds.py` reads final page alpha and changes JSON only; the full export then computes its normal aggregate metadata content hash. It does not alter the common crop or pixel pipeline.

Seven focused tests cover alpha-one fringes, team union, separate shadows, empty body despite visible shadow, independent per-scale measurements, page-local offsets/multiple pages, preserved PNG and existing JSON fields, invalid rectangles, body-mask size mismatch and path escape.

Real copied exports cover all 16 diagnostic assets plus the normally cropped US rig, full staged US fighter and beauty-only editor marker: 19 assets, 11,602 assertions, no source/PNG/anchor/existing-field mutation. `shadow-audit.json` adds 58 own-shadow bounds for root's exact private parking overlay, while the original body audit remains intact. These copied examples retain their original sidecars for field-comparison proof only; they are not shipping content-hash receipts.

A complete original/candidate pack comparison of the real four-pose editor marker passes: raw/spec inputs and both PNG files are byte-identical; existing atlas fields and all sidecar fields are exact except `content_sha256`, which correctly changes because descriptor metadata changed. This confirms the actual full packer recomputes aggregate content identity instead of mislabeling amended bytes.

No live packer, production/staged export, source raw image or original diagnostic overlay has been modified. Root must pass flat sub-tile and raised-cliff occlusion regressions before any promotion.
