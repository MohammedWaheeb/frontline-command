# Private combined graphics build

`build-02` is the corrected successful private normal-App build with exactly three changed renderer files from `work/renderer-performance-v1/combined-candidate`. It uses the ordinary React/Vite configuration and unchanged entry point, with no App test hooks. The original ordinary Go/WASM, complete original art, content and fonts are byte-exact; 4,502 pack entries outside emitted bundles/metadata remain exact.

The candidate combines viewport-first conservative terrain admission, offscreen actor transform refresh before culling, constant minimap palette data, and completed-frame sprite residency trimming. All 498 existing runtime tests and both TypeScript checks passed before this build. Native warmed pixels, seams/fog, pending terrain, actual-art reentry/picking, App behavior and resource cleanup remain acceptance gates. The complete art roster remains unfinished.

The source clone preserves nested runtime dependencies and symlink identities, validates the live source snapshot before/after, and changes only the three declared files. CSS assets must already exist by hash in the immutable original pack. The clone retains the same native executable and runtime. Every final package descriptor is rehashed in `post-build-audit.json`; native content, licenses, instructions and launchers match the original inventory. This is not a deployment or ordinary final release rebuild.

The immutable private package is `build-02/package`, with browser files in `client/`. Exact version, pack, source, driver and before/after inventories are recorded in `receipt.json`, `candidate-inputs.json`, `post-build-audit.json` and the preserved `actual-build.mjs`. Full generated files remain local under ignored build directories. Browser agents must use these exact identities, not changing live sources.

Build-01 is preserved with a private wrapper inventory-format mistake: a bare array instead of the ordinary versioned object. Its actual browser product bytes passed, but it was never browser-tested. Build-02 corrects the wrapper schema and adds non-client source/output guards without changing the renderer source.
