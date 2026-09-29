# Active-tab generation coherence: evidence and bounded proposal

29 September 2026. **Read-only design; not implemented or browser-proven.** Frozen v25 and all prior products remain unchanged. The authored diagnostic in `client/tests/offline-upgrade` is ready for coordinated execution.

## Concrete source path

`runtime/offline-response.ts` selects the newest completed generation per pack ID for each request. It is intentionally network-first. `ContentLibrary.source()` retains an indexed file's expected byte length and SHA-256 and rejects a new generation's bytes before validation. `audio/mixer.ts` likewise checks the retained variant's byte length/hash before decoding; those consumers can fail explicitly when the server changes.

`render/art.ts` retains ArtIndex, SpriteMeta and atlas descriptors, but later `SpriteSheet.load()` calls `Assets.load(page.url)` using an unversioned URL and no expected byte hash. `ArtLibrary.image()` and the cameo/terrain descendants also use unversioned URLs. Another tab can activate B while an A sheet has an unresident page. Its next load selects B by the latest marker, even though the frame rectangles came from A. An online host replacement has the same risk because successful network responses precede completed caches. An old decoded page surviving in Pixi's URL cache can cause the converse mixing in a new library too.

The prepared real-loader diagnostic retains actual A descriptors, activates B in another tab, then compares decoded image bytes against both unchanged product PNGs. It deliberately does not claim that this browser observation has occurred yet. No missing-generation policy should be adopted based only on a green installer transaction test.

## Smallest robust correction to evaluate after the reproduction

Treat one ArtLibrary lifetime as an immutable asset generation. Capture a verified pack descriptor (`id`, content-derived `version`, exact manifest identity) before reading its art index. Every descendant JSON, atlas PNG, terrain image and UI/cameo image uses that captured generation; a match must not silently switch when another tab activates a pack. Include generation in Pixi/image/cameo cache keys. Release the old generation only with the current library's ordinary disposal; do not reload an active game to hide the mismatch.

For a **completed installed generation**, use explicit generation-qualified request URLs, handled before the worker's latest/network-first branch. The worker must:

- Validate a bounded same-origin pack ID/version and public file path; leave authenticated/private request exclusions intact.
- Find only that exact completed generation and match the unqualified path inside it. Reject missing/incomplete generation or absent path with a distinct unavailable response. Never fall back to the newest generation, another pack, or an unqualified network response.
- Keep unqualified menu/installation behavior as a separate policy. Explicitly deleting an in-use old cache must cause a recoverable missing-generation error, not substitute new bytes.

Generation query parameters alone are **insufficient**: a plain static server can ignore them and return its latest bytes, and a page may not yet have a controlling worker. Preserve ordinary online play without requiring a full pack install by validating each metadata/page response against the captured manifest's exact file length/SHA before parse or decode. A bounded shared asset-fetch helper can first read that exact completed generation, otherwise fetch and verify the declared bytes; when old bytes are unavailable it fails closed. Pass a generation-specific verified object URL to Pixi/Image, with ref-counted revocation on eviction/disposal. Do not cache verified blobs globally without a memory/lifecycle bound.

The manifest itself must agree with the captured content index/build identity; do not obtain a fresh latest manifest independently for each nested page. If a connected host swaps it mid-capture, reject and allow a deliberate retry at a safe library creation boundary. An alternative is immutable content-addressed server paths, but that requires packaging/host support and is broader than a client/worker correction.

Proposed production ownership, **not yet assigned**: a new runtime asset-generation helper plus narrow `cache.ts`/`offline-response.ts`/worker routing, and `render/art.ts` loader integration. Include callers that load effects through ArtLibrary. The audio/runtime/module paths need an adjacent audit before claiming all application resources are generation-coherent; map/audio hash validation already prevents silent byte substitution but does not guarantee seamless continued availability. No simulation, protocol, art source, save or replay change is required for the demonstrated art defect.

## Acceptance for that successor

Keep frozen v25's failing reproduction. Under the successor, an A library must keep receiving A metadata and pixels while a B library receives B, online and offline, with actual two-tab install/rollback. Repeat after page eviction, delayed admission, worker update/restart and full browser cold restart. Remove A explicitly and require a reported unavailable-generation result; no B substitution. Test no controlling worker with a changed server to prove byte rejection. Corruption, missing manifest, mismatched descriptor, private URL, bounds, duplicate/lifetime disposal and object-URL cleanup must remain strict. The existing transactional failure/lock cases must still pass. No forced reload, marker clearing, tolerance relaxation or release claim substitutes for these gates.
