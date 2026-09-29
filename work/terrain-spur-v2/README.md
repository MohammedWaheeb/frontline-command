# Private leaf-spur source correction

The preferred frozen source is `inputs/candidate-module-terrain.ts`, SHA256 `3574f24748adfec6385184c611a5f21d56a8f0680c5b40c6eebf38e92de2ccda`. It derives from the exact performance terrain baseline `de219a85e70a1cb9ed02ec41ab7eb7d3e40a780fa375649eac16ffc8a5d0c005`. This directory contains source/CPU evidence only. No live product edit or browser launch occurred here; root owns native validation and any later promotion.

The earlier broad MAX proposal filled any connected visible tile with no clear corner. Root's native v1 course showed that a thin visible corridor became black, and its current→candidate GPU monotonicity check failed. That source and evidence remain rejected. The v1 thin-corridor native PNG was also directly viewed here. This narrower proposal changes a tile only when all conditions hold:

1. It is a currently visible top tile, with no clear tile corner.
2. It has exactly one visible cardinal neighbor.
3. That neighbor has a clear corner, distinguishing a tip attached to a wider clear region from a narrow chain.
4. Both corners on their shared edge already equal the tile's maximum corner opacity.

The tile then fills at that MAX. Its shared visible edge therefore retains its endpoint opacities. Mixed175/255 corners cannot be silently flattened across a lower shared edge. Solitary, diagonal-only and narrow-chain sightings keep their original fan; tiles with more than one visible cardinal neighbor are unchanged. Only top-tile fog can change. The rest of the source from the fallback palette through every TerrainBaker method is byte-identical to de219, including geometry, texture resolution, admission envelope, minimap colors, fog UV mapping and memo caller.

Neighbor far corners read cells two tiles away and diagonally beyond the original corner dependency set. The new topology explicitly adds all their in-map cells through the existing `slot()` function. It retains only additional `fogTiles` entries, which are also observed by the existing lastOpacity memo. The rare leaf check reads at most two closed-square runs of four current visible bits. All helpers are module functions; no extra per-recompute helper closures or arrays are created. The existing pointAlpha closure remains. Construction still uses temporary tuples/tile arrays and a Set; actual peak heap and garbage-collection behavior are unmeasured.

`proof-final.log` passes8 focused tests, and `typecheck-final.log` is an empty successful semantic TypeScript check of sources, tests and budget code. Coverage includes all19,683 public3×3 masks on both flat and raised surfaces; disk radii2–14 with unknown/remembered surroundings; chains, bars, L bends, lone/diagonal/checkerboard sightings and a T junction; mixed175/255 shared edges; map boundaries,1-cell dimensions and chunk seams; raised random faces; and a concrete stale-memo counterexample if the new distant dependencies are omitted. An actual TerrainBaker `setFog` closure course uses real Pixi Mesh/Geometry objects through11 in-place updates and verifies UV/fog visibility against fresh recomputation. It disposes all meshes. No graphics context is created.

Every independent-oracle evaluation also compares exact output against preserved indexed attempt01 SHA `803d3de1ec752459a040c84536dbee0abd853f61335389a9303382645fc194e7` and compact local-helper SHA `e789377d7f2be8a2e03b7fb8788979069efe077ab4fefb58f81f83f1d81969f3`. Both handed-off sources remain unchanged. `attempt01/` retains its source, tests, passing logs and storage receipt. Its retained far-corner indices/ranges were replaced after review because their storage was unnecessary; root's proposed dependency-only construction is adopted.

`budget-final.json` enumerates actual TerrainSurface chunk/depth groups one chunk at a time. These are sums of typed-array sizes across full maps, not native allocation or simultaneous working-set measurements.

| Public probe | Added topology | Added memo | Combined addition | Topology saved from indexed attempt |
|---|---:|---:|---:|---:|
|40² flat|37,504B|9,376B|46,880B|146,656B|
|40² raised/cliff|37,504B|9,376B|46,880B|147,328B|
|256² flat|1,641,072B|410,268B|2,051,340B|6,136,920B|
|256² raised/cliff|1,641,072B|410,268B|2,051,340B|6,152,722B|

No far-point/range/fan indices are retained, and face fragments add no slots. The maximum fragment topology in these probes is1,508B (baseline1,340B), maximum chunk50,296B flat and52,184B raised. The largest construction uses628 numeric-list elements,65 point-map entries,126 tile-map entries and16 entries in the temporary top-tile Set; object/key/Map overhead is not measured. The full256² probe also adds410,268 lastOpacity scans, a real CPU-work tradeoff. No timing/FPS claim follows.

Preparation failures remain: `proof-01.log` recorded an unresolved relative support-file import before execution; the frozen de219 baseline was copied beside pinned support files. `typecheck-01.log` recorded missing Node test types and an untyped fixture array; those fixture declarations were corrected. No product rule or test tolerance changed for these corrections.

Root's separate native course must still assess original opacity-floor/protected-class equality, current→candidate pixel monotonicity, remembered-disk edge behavior, and actual appearance. CPU vertex nondecrease never implies GPU sample monotonicity. Neither v1 failures nor historical browser failures are waived by this source evidence. No full-game, multiplayer,256² native, final-art, total GPU/JS memory or hardware-performance acceptance is claimed.
