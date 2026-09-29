# Independent menu generation review

Read-only review of the exact five inputs pinned in `source-pins.json`: four production candidate files and the eight added scope tests. Compared the production delta to live `3d196fd`; no candidate, live source, UI composition, asset or test was edited. No browser or test rerun was performed by this reviewer.

**No blocking product defect found in the reviewed delta.** This is source/lifecycle review, not native image, decoded-memory, network or visual acceptance.

## Generation and asynchronous ownership

- `ArtLibrary.readScope` captures the current epoch, checks it after `init`, and closes over one exact `AssetGeneration`. Every scope JSON/image call uses that generation; it cannot silently follow a later library index. The ordinary `Application.reloadContent` binds the verified art index before publishing the new `ContentIndex` token passed to `MenuDiorama`.
- Scope images are decoded from the original verified generation lease's immutable blob URL. No raw URL or unverified retry is used. Same URL with new bytes remains subject to the captured descriptor. Key-art's displayed second HTML image uses that same leased blob, so its additional native decode does not introduce metadata/pixel identity mixing.
- The canvas performs liveness checks before ground and accumulated actor composition. Resize/unmount cancels its prior controller; generation replacement releases all registered scopes. Awaited stale work cannot finish a later canvas draw. The pre-existing staged pixel content may remain briefly during a reload, which is decorative freshness, not a simulated-world or fog leak.
- No engine, actor visibility, economy or private gameplay field is newly read by this delta. Scene members, coordinates, layer order, crop/frame selection and colors are unchanged.

## Failure, cancellation and cleanup

- A failed candidate generation is discarded before `clearImages`, so existing scopes and pixels remain usable. A successful replacement releases old scopes before disposing the old generation. Library disposal follows the same reader cleanup path.
- Cancellation before a lease resolves is handled by the post-await liveness check and catch cleanup; cancellation while decoding rejects the pending promise and clears image handlers/source/lease. `release` is idempotent even though manually aborting the lifetime synchronously invokes the aggregate abort listener.
- A canvas draw releases its operation scope in `finally`, including failed draws. A key-art scope remains retained only while that displayed image is mounted; effect cleanup or image error releases it. Scope registration is removed on abort, so finished draws do not accumulate in `ArtLibrary.readers`.
- Rejected metadata/image promises remain terminal within one scope. That is safe for the current single-draw operation: resize, new generation or remount creates a fresh scope, while the existing code does not attempt in-scope retry. Do not generalize this helper into a long-lived retrying cache without defining rejection eviction.
- `readScope` waits for shared `ArtLibrary.init` before observing its caller signal. The actual menu path starts after `reloadContent` has already initialized art, so this is not a current menu blocker. If reused for a cold, cancel-sensitive consumer later, add a focused already-aborted/delayed-init case rather than assuming immediate rejection or canceling a shared initializer.

## Bounds and evidence limits

The independent source review agrees with root's current scene dependency inventory: reads are sequential across actor/layer work, with four terrain images concurrent. The reported current image set is 38 files / 18,242,213 encoded bytes, within the core's default 64 MiB lease bound. The core retains its four-active-request and descriptor queue bounds; this delta does not increase them.

Encoded leases are not a total decoded-memory bound. Whole atlas images and temporary cropped layer canvases already existed in this composition; the new scope explicitly clears images after drawing. Actual browser residency, blob lifetime through the displayed key-art element, resize/unmount during native decode and same-URL generation replacement still need root's prepared native course. The eight added unit tests use a fake image decoder and cannot establish those browser facts.

Useful native checks are already represented by the proposed course: exact A/B metadata and pixel bytes, failed replacement retaining A, pending decode cancellation, resize/unmount, completed reader/lease cleanup and post-close strict diagnostics. Preserve any raw abort separately unless that request has direct native-consumer proof; source correctness is not an error waiver.
