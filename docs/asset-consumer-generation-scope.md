# Remaining asset consumers and generation boundaries

This read-only proposal inventories the client frozen in
`work/art-generation-consumer-v1/frozen-v3/client`, source lock SHA256
`a70a5df5cb053b9f1ee96f5ced310b83f99c2514764f6409c27b286d8ab21282`.
It does not change UI, art, style, audio, or production code and makes no new
browser claim. The separate battle-art recovery review is in
`work/evidence/art-generation-review/v3-review.md`.

The new ArtLibrary binding covers actor/prop sprites, terrain, production and
selection cameos, battle preflight, and the battle's FX fetch adapter. It does
not currently bind all main-menu, DOM/CSS, mission-presentation, or audio reads.
The most useful next fixes are the menu atlas fallback and audio index retry.
Standalone decorative freshness is a different issue from pairing an old atlas
rectangle or caption with new content.

## Actual consumers

Paths and line references below are relative to the frozen client.

| Consumer | Current reads and checks | Risk and existing lifetime |
| --- | --- | --- |
| Canvas menu diorama, `src/ui/MenuDiorama.tsx:35–43,54–106` | Raw art index → sprite metadata → atlas JSON → `Image.src` pixels. No byte/hash or captured-pack binding. JSON and images deduplicate only within one draw. | **Actual metadata-to-pixel mixing path:** an upgrade between atlas JSON and PNG can draw B pixels using A rectangles/anchors. This is decorative, not a Go actor or fog-state change. Each resize aborts the previous draw; unmount aborts, disconnects ResizeObserver and clears canvas. Temporary image references are dropped after draw. |
| Painted menu key art, `MenuDiorama.tsx:115–122` | Raw art-index `keyArt` string with a UI-image path-pattern check, then a browser `<img>`. No manifest hash check at the consumer. | One complete bitmap has no atlas geometry pair. A different same-path image is freshness, not simulation corruption. If exact menu-generation presentation is desired, bind the index and image together. React owns the element; its request is not tied to the index AbortController. Image failure switches to the canvas fallback above. |
| Icons and emblems, `src/ui/primitives.tsx:4–5` | External SVG `<use>` at fixed `/art/ui/icons/fc-icons.svg#…` and `/art/ui/emblems/fc-emblems.svg#…`. Symbol IDs come from code/faction values, not an atlas metadata request. No per-consumer byte/hash check. | Standalone decoration/glyph freshness. Missing or renamed symbols can hurt legibility, but they do not select a different Go entity or infer private state. Browser owns resource lifetime; shared generation integration must retain symbol URLs until all mounted uses end. |
| Chrome textures, `src/styles/game.css:47–56` | Ten fixed `/art/ui/chrome/…` PNG URLs, including the five button states. CSS border slicing is code-defined. No JS loader or per-consumer hash verification. | Decoration and CSS/asset compatibility. No fetched atlas metadata is paired with these PNGs. Browser owns decoded-image lifetime. A JS retention/preload change is not justified by this inventory or by prior intermittent PNG reports. |
| Bundled fonts and older token textures, `src/design/tokens.css:2–11,205–215` | Relative build imports. The inspected v25 Vite output uses emitted asset URLs. This is separate from dynamic ArtLibrary reads. | Build/CSS coherence and text layout, not game-state corruption. Keep emitted immutable asset paths and pack them with their referencing CSS. No additional runtime image cache is proposed. |
| Briefing terrain survey, `src/ui/Briefing.tsx:7–20` | Canvas pixels are computed from `prepared.content.map`. That map comes from exact source size/SHA verification and the Go validator in `src/runtime/content-library.ts:110–143`. Briefing text/objectives come from the validated mission. | **No separately loaded briefing bitmap exists in this consumer.** Its emblem uses the SVG path above; its spoken briefing uses AudioMixer below. Do not invent a briefing-image dependency or a claim that future illustration files are integrated. |
| Mission markers/group labels and tutorial instructions, `src/app/battle-controller.ts:26–29`, `src/ui/TutorialGuide.tsx:25` | Raw `presentation_url` text; 256 KiB post-read cap, mission ID/version and shape checks. Markers require an actual public map region and a current public non-failure objective; group labels join only owner-private origin IDs. No exact presentation-byte hash at these consumers. | Presentation can change under the same mission ID/version. This can produce inconsistent hints/labels, but accepted shapes do not create gameplay actors, mutate objectives, or expose new hidden entity state. Battle-controller abort/closed guard and tutorial effect cleanup own request lifetime. These are text/public-location consumers, not atlas mixing. |
| Audio index and clips, `src/audio/mixer.ts:21,31–44`, `src/audio/index.ts:9–28` | Raw audio index, bounded to 4 MiB and strictly schema/path checked. Every **new clip download** checks declared length and SHA before decode; MP3 fallback has independent descriptors. Decoded duration/channel count and a 64 MiB memory cap are checked. | Fresh wrong clip bytes fail before decoding. **Cached/pending buffers are keyed only by URL**, however, and `loadIndex(true)` replaces descriptors without resetting the mixer generation. This is the concrete retry coherence risk described below. Four simultaneous decodes, 24 voices, session/output epochs and abort controllers already bound work. |
| Audio provenance link, `src/ui/HelpPanel.tsx:8` | Opens a Markdown notice as a normal new-page link. | Documentation freshness only; not a decoder or playback dependency. |

Installer verification is separate: `installPack()` verifies each declared file
when installing and records a completed manifest. Normal raw browser URLs do
not thereby gain a consumer-held A generation. The offline-response policy
selects a completed version per pack; a raw consumer spanning a publication can
still issue separate reads on either side of that transition. Conversely, this
is not proof that the service worker or a current browser run mixed any bytes.

## Concrete audio retry gap

`SettingsPanel.tsx:19` exposes `app.audio.loadIndex(true)` after an audio error.
In `mixer.ts:21`, a successful retry assigns `this.index=index` without resetting
buffers, pending work, sources, captions, or the generation. `buffer()` at line
44 returns `buffers.get(variant.url)` or `pending.get(variant.url)` before any
descriptor comparison. A is therefore reusable under B if B advertises the
same URL with different hash/duration/caption metadata. A pending A decode also
passes the unchanged generation guard and can populate that URL cache after B
is selected.

This is source-confirmed and pre-existing, not introduced by frozen-v3 and not
yet reproduced with real playback. Reproduction for a bounded nonvisual test:
decode A; cause another clip to expose the existing Retry control; serve a valid
B index using A's URL but a distinct clip hash/caption; retry; request that
entry. Assert B cannot reuse the A buffer. Repeat with A's decode deliberately
pending, and with a failed B-index parse to prove A remains intact on failure.
The normal fresh-fetch hash failure is already a protection and must remain.

## Bounded integration proposal

1. **Menu fallback, nonvisual resource boundary first.** Add a read scope bound
   to one committed AssetGeneration, not the dynamic `art.fetch` property.
   Provide only declared-path JSON/byte/image-lease operations, a generation
   identity, cancellation and release. A draw retains that scope from index
   through the final crop. At explicit idle replacement, either finish with A
   while it remains available or cancel the draw and start a new B draw; never
   let a pending A draw read B. Keep the existing composition, colors, frame
   selection, resize policy and visual fallback. Release temporary images and
   leases after canvas composition or unmount. Test a delayed A page, publication
   of B with deliberately different frame placement, removed A, resize/unmount
   while pending, and zero retained leases afterward. Claude can own the narrow
   hook in MenuDiorama after the nonvisual scope contract is reviewed.

2. **Audio retry, separate small logic correction.** Key decoded/pending work by
   the complete selected descriptor (URL, size, SHA and actual codec identity),
   not URL alone. Parse/validate a candidate index before committing it. On an
   accepted index change, stop old output, abort pending old loads, clear
   captions and reset output/generation guards before publishing B; a failed
   candidate keeps A. Preserve consent, trusted-gesture startup, focus behavior,
   four-decode/64 MiB/24-voice bounds, codec fallback rules and existing event
   privacy. Binding the audio index and reads to the application's committed
   pack can be a follow-up using the same read scope; do not silently bind audio
   to whatever generation happens to be newest per request. Initial audio index
   loading currently starts in the Application constructor before content boot,
   so that ordering needs an explicit handoff if pack binding is added.

3. **Public mission presentation, small shared read helper.** Use one
   session-bound verified reader for `presentation_url`, retaining all current
   mission/region/objective/owner checks. The file is already present in the
   base-pack graph, so this can use the declared manifest hash without extending
   the authored mission or map schema. Bound the stream before collecting the
   whole body, cancel on session replacement, and guard late publication. Share
   the resulting parsed public document between the marker and tutorial
   consumers only within that exact mission/generation. This prevents stale
   authoring hints, not a newly discovered engine/fog leak.

4. **Static UI freshness, lower priority.** Keep code-stable icon symbols and
   chrome geometry compatible within a release. Content-addressed emitted URLs
   at build time are preferable to a new perpetual runtime cache where feasible.
   If exact runtime binding of external SVG is desired, test blob/external
   `<use>` behavior in all three browser engines and keep an accessible text
   fallback; do not assume those URLs behave identically. Do not rewrite CSS,
   preload all art, recolor assets, or change layout under this proposal.

Ownership can remain bounded: core/read-scope and AudioMixer logic to Codex;
MenuDiorama/primitives/optional style URL touchpoints to Claude with exact API
and lifecycle requirements; existing Go rules and art files stay unchanged.
No browser or implementation is authorized by this document itself. Each
accepted slice needs its own frozen source and evidence. Existing raw request
diagnostics remain independently classified or unproven; none are waived here.
