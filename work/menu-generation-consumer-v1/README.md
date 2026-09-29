# Menu resource generation candidate

This private candidate prevents a menu draw from pairing old atlas metadata with new pixels. It does not change the authored scene, art files, colors, crop coordinates, command layout, Go or game rules. Live client remains3d196fd/483 tests until native review and guarded integration.

`ArtLibrary.readScope` captures one exact verified generation. A consumer scope deduplicates JSON/images and owns its temporary blob leases. Successful idle content replacement cancels old scopes; failed replacement retains them. Canvas resize/unmount cancels pending work, and a completed draw releases all decoded image references and leases. The painted menu retains its verified image lease until its element unmounts or fails. The App publishes the generation token only after its existing atomic art/content reload completes.

The candidate passes **491 runtime tests and both TypeScript checks**. Eight new cases use actual verified generation manifests with an explicitly fake image decoder: exact deduplication, changed bytes under the same URL, delayed A→B replacement, failed B retaining A, external cancellation during decode, replacement during decode, decode failure and an already-canceled consumer. They establish resource ownership and hash behavior, not native PNG decoding or browser memory.

Independent read-only review `work/evidence/menu-generation-review-v1/review.md` found no blocking source/lifecycle defect. Two API limits remain explicit: rejected promises are terminal within a single operation scope, and a cold readScope call waits for shared ArtLibrary initialization before observing caller cancellation. The menu starts only after art initialization and creates a new scope for each draw. Do not reuse this helper as a persistent retrying cache or assume immediate cold initialization cancellation.

## Native course: prepared, unrun

`menu-browser.mjs` and `menu-fixture.tsx` bundle the actual old/new MenuDiorama components over exact v5 product bytes. The bounded course compares canvas pixels at1600×900 and1280×720 and the painted menu; tests failed/successful generation replacement, controlled pending-page unmount, resize and old/new draw cancellation; and verifies scope/lease disposal. Generation fixtures change only the declared content/art-index identity and omit key art when testing the existing canvas fallback. They never modify shipped assets or manufacture game state.

`prepare-01` failed the fixture's missing React JSX-runtime type mapping; its exact driver, fixture and log are preserved. `prepare-02` passes type/bundle preflight. `prepare-03` additionally has failed/successful painted-image replacement checks and a five-minute independent browser deadline; it passes preflight. No browser/host was launched by preparation. Wait for the single browser lane: Boole3H1AI, then Einstein US-launcher-standard, then this course.

Run from repository root after explicit lane release:

```sh
node work/menu-generation-consumer-v1/menu-browser.mjs work/menu-generation-consumer-v1/chromium-01
```

The current exact fallback scene references51 JSON files and38 images totaling18,242,213 encoded image bytes. This fits the unchanged64MiB lease bound; it is not a native decoded-memory/GPU measurement or a final-roster size claim. Whole atlas decode and cropped layer canvases are separate from encoded leases. Actual browser resources, snapshots and strict raw diagnostics remain unearned until execution. Controlled cancellations do not automatically waive request failures.

All private source files are pinned in `source-lock.json`. `prepared-source-evidence.tar.gz` and `prepared-files.json` preserve source and preparation logs with read-back hash verification. No deployment or finished-game claim.
