# Source proof diagnosis

The first raw geometry fingerprint stopped at unchanged IR artillery. A detailed second full run stopped at unchanged IR launcher instead. Both original failure logs remain intact. The detailed failure records only `smoke_0` and `smoke_1` polygon-array row permutations: sorted face records are exactly equal, with no change to vertex indices within each oriented polygon, material indices, smoothing flags, vertices or materials.

The focused unchanged-source control builds the same original IR launcher, runs its complete original pose sequence, and rebuilds it. Iterations 1–3 reproduce those same smoke polygon row differences against iteration 0. Exact sorted oriented faces and every other geometry/material field pass in all four builds. This is recorded in `old-source-face-order-control-v1.json`; it is not an image tolerance or a model fix.

`check-source-semantic.py` therefore sorts only the polygon records before hashing. It preserves vertex array order and every oriented face cycle, all material and smoothing attributes, object parenting, pose matrices, visibility/shadow membership, hardpoints and material values. It adds no numeric tolerance. The original strict raw-order failure remains a failure under that original method.

The revised full proof writes `source-proof-v4.json`. Separately named `check-clearance-v2.py` and `render-pilot-v2.py` consume that explicit receipt; the original scripts remain preserved. Neither the Claude candidate nor the baseline model/spec changes. A passing geometry proof still does not establish native loaded/empty readability.
