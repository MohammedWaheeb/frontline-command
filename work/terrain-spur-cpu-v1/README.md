# Independent fog-spur MAX CPU validation

**Exact authored9 tests and isolated strict TypeScript pass. No browser, GPU, live source edit or promotion occurred.** Candidate SHA `14a6772156ec236f166d60f30fedd28e582ace5c3be271c995e1db4d6417578a`, test SHA `37d72d6a82750753d8d3c558392d4e982bdfe049c8de99178547d99b6e5add63`, comparison terrain SHA `de219a85e70a1cb9ed02ec41ab7eb7d3e40a780fa375649eac16ffc8a5d0c005`.

The author retyped the candidate. Independent byte comparison confirms that only the two declared `fogTopology`/`fogVertexAlphas` function/comment regions differ. Imports and all text outside those uniquely delimited regions are identical, including mesh geometry, opacity→UV mapping, materials, shader/batch/depth behavior, memoized `setFog`, disposal and minimap code. `candidate.diff` preserves the complete diff.

## Dependency closure and execution

The candidate was not a standalone module: its original relative imports had no adjacent dependencies. `source/` supplies exact unmodified frozen render/runtime/content dependencies. Candidate/test bytes and their import strings are unchanged. The comparison combined tree consists of its actual three overridden files plus the original frozen renderer candidate's remaining support. The test's explicitly imported `TerrainSurface` and both terrain modules' surface/iso/material supports are byte-identical where shared. This is a filesystem resolution layout, not a behavior transform or mock. The414 source descriptors in `closure.json` distinguish every origin/destination. Esbuild's actual CPU import graph has11 source modules, recorded in `bundle-metafile.json`; type-only dependencies are additionally covered by the TypeScript check.

`node_modules` is a tooling-only symlink to installed client dependencies, outside the source archive. Real Pixi8.21.0 remains an external Node import; no mocked Pixi, canvas or DOM was used. TypeScript7.0.2 and esbuild0.28.2 are pinned in receipts. These CPU tests never construct a rendered mesh or actual `setFog` closure.

`types-01.log` is the successful strict no-emit candidate/test/import-closure check. `build-01.log` preserves an independent harness failure before test execution: the audit initially attempted the obsolete `typescript/lib/typescript.js` AST API, absent from installed TypeScript7. The original helper is retained. Its successor uses explicit byte-region comparison; no candidate/test behavior changed. `build-02.log` passes. `cpu-01.log` records all9 tests passing,1.80s wall time and189,136,896B maximum RSS under a768MiB V8 heap ceiling. Initial free memory was approximately2.7GiB; Blender was concurrently active. This is bounded test-resource evidence, not renderer performance acceptance.

## Independent review findings

- **Cardinal dependencies are covered.** Every in-map N/E/S/W neighbor touches two of the top tile's four corners. `fogTopology` already visits all four corners in each depth fragment and inserts those tiles into `fogTiles`. `joined` uses the same visibility truthiness as `tileFogOpacity`; visibility changes always change a slot between0 and175/255. Thus the unchanged per-slot memo sees a neighbor becoming visible even with the same mutated array object. S5 checks all cardinal dependencies, edges/chunk seams and non-dependency scrambling; S7 checks in-place changes against a fresh recomputation. S7 is explicitly a copied memo model, not native Pixi buffer-upload execution.
- **Protected CPU classes are unchanged.** Only a currently visible top triangle can take the new fill path. Remembered/unknown tops and all face triangles retain the frozen calculation. The exhaustive39,366 flat/raised3×3 masks, raised/cliff random maps, straight boundaries, disk poles, edges/seams and isolated/checkerboard cases passed. No additional private/entity state is read: inputs remain the public visibility/explored arrays and public topology.
- **Typed-array construction is unchanged.** The five topology arrays have the same construction and values; S5 checks exact typed-array equality. The result object adds only map width/height scalars, with no new per-triangle typed array or retained construction Map. The existing `joined` closure is newly allocated per recomputation. Exact JavaScript object/closure bytes and execution costs are not measured; the author's approximate retained-byte estimate is not accepted as a measurement.
- **CPU MAX monotonicity is narrower than pixel monotonicity.** On filled fans,MAX is at least every old corner and the capped128 centre; all other CPU values are equal. Interpolated interior points with nonnegative barycentric weights therefore cannot get lighter. Non-centroid MSAA boundary sampling may extrapolate outside the triangle with negative weights: raising the centre can reduce an extrapolated sample. Texture-ramp filtering and the unchanged alpha offset also remain. None of these CPU tests proves current-baseline or original-floor pixel monotonicity; native zero-tolerance/protected-class gates remain necessary.
- **Visible ground can become completely dark.** S8 confirms every tile of a one-tile-wide visible corridor can become255, visually indistinguishable from unknown ground, despite remaining currently visible in simulation. Mixed175/255 surroundings can create new hard value steps across separate unshared fans. Solitary and diagonal-only sightings retain their capped bright centre, so the rule intentionally does not remove every isolated diamond. Actor-above-fog readability is a native question. The existing historical “only fan centres rise” expectation is incompatible with this rule; no existing failure is waived or rewritten here.

The source assumes valid fixed map dimensions and the existing `TerrainSurface` top-fan vertex ordering. The ordinary producer establishes those assumptions, and its code is unchanged. This course does not cover GPU rasterization, original privacy-floor pixels, actual upload skipping, renderer show/hide/reset/context loss, all-map visual acceptance, or measured heap retention. No semantic blocker was found in the bounded public-array CPU rule; its corridor darkening and raster boundary behavior remain material acceptance decisions.

Reproduce from the repository root with the recorded installed tooling:

```sh
# source.tar.gz preserves the exact isolated support tree if it is absent.
node client/node_modules/typescript/bin/tsc -p work/terrain-spur-cpu-v1/tsconfig.json
node work/terrain-spur-cpu-v1/prepare.mjs
/usr/bin/time -l node --max-old-space-size=768 --test --test-concurrency=1 work/terrain-spur-cpu-v1/authored-tests.mjs
```

`receipt.json` records post-run input guards and archive/tool hashes. The original candidate, tests, report and combined baseline remain untouched.
