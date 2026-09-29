# Strengthened v3 test review

The candidate implementation remains SHA256 `6a51329f420cebbff652e493409f0aa1337a03c47e12910d664008fe824732b9`. The strengthened test is exactly the parent's requested SHA256 `120e4b387a6f6817500b8d61b5a9d1c79617b5341b915df4b0b6ee7a658b4b8f`. This supplement is read-only source verification; no compiler, Go test, host or browser was run by the reviewer.

All three bounded suggestions from the first review are addressed:

- The diagonal test samples `(4500,4500)` against a 2×2 retained footprint centered at `(5800,5900)`: the nearest corner is `(4800,4900)`, so `300²+400² == 500²`. Exact tangency must be clear. Moving the center x to 5799 gives `299²+400² < 500²` and blocks; moving it to 5801 is outside and remains clear. Each mutation changes the revision, and the complete grid is also compared to the independent clearance oracle.
- The ID-zero test has open terrain and exactly one live building. The center sample is clear at ID 0, then blocks after only the ID becomes 1 and the revision changes. No other obstacle can mask this distinction. The full grids for radii 0 and 500 are checked as well.
- The maximum-opening test separately replaces the map with explicit 256×256 dimensions and checks every grid cell at radii 0, 350 and 1400. This is maximum supported grid-size coverage; its synthetic map rewrite is not a legal gameplay or timed maximum-load course. It does not substitute for the existing real 688-entity opening.

`reviewed-v3/` preserves these test bytes, the owner's `focused-03.log`, and the v3 source lock. The owner log reports five passing tests; that is recorded owner execution, not an independent rerun. Original reviewed source and `focused-02.log` remain unchanged. `v3-test-review.json` pins the new evidence separately.

No new semantic blocker was found. The combined clean-source/timing review is a separate pending boundary coordinated with the timing-harness owner; original workload, filter/feedback behavior, strict timing gates and quiet-host requirements must remain intact.
