# Optional effect asset loading and packaging

This is runtime infrastructure for future original FX artwork. It creates no production effect index, texture, animation or Blender output, and does not change the shared asset manifest. All 132 entries in the [coverage ledger](combat-effects-coverage.md) remain incomplete until their applicable information, actual art, native pixels and reduced-effects variants are reviewed. The prior ledger accurately records the pre-infrastructure boundary; this document supersedes only its serving/loading gap.

## Renderer API

```ts
import {EffectLibrary, type EffectVariant, type EffectClip,
        type EffectSheet} from '../render/effect-assets';
const effects = new EffectLibrary({onError: showRecoverableArtError});
await effects.init(art.index?.effects); // absent optional descriptor: no fetch
const sheet: EffectSheet | undefined = await effects.load('fx.explosion.small');
const clip: EffectClip | undefined = sheet?.clip('standard');
const frame = sheet?.frame('standard', 0);
// First frame access starts the page request and returns undefined.
// Draw the truthful code-native fallback, then try frame on later render frames.
// frame: {texture: Pixi.Texture, anchorX, anchorY, pixelScale}
await effects.settle(); // useful for a load gate/test, not per animation frame
await effects.trim();   // reclaim idle pages when memory pressure has occurred
await effects.release(); // match end: clear sheets/pages, retain index for reuse
await effects.dispose(); // final disposal: library is no longer usable
```

`has(id)` means an indexed descriptor exists; it does not mean textures are decoded or art has been reviewed. Missing IDs return `undefined`. Invalid index initialization rejects; invalid metadata/page loads call `onError` and retain the truthful fallback. `retry(id)` clears a failed metadata result or page error; `sheet.retry()` resets failed page attempts. No request loop continuously retries a corrupted file. Unknown clip/frame indexes return `undefined`.

The metadata and `EffectClip` are deeply immutable. A clip has `fps`, `loop` and `frames`; the renderer owns event age and frame selection. No clip timing creates gameplay damage, travel or warning deadlines. `pixelScale` is `1 / resolution`, so atlas pixels can be converted to the established 1× world-pixel scale. Origins become normalized Sprite anchors and may lie slightly outside a cropped frame.

`EffectVariant` is exactly `standard | low | reducedMotion | reducedFlashing | reduced`. Both accessibility flags select `reduced`; otherwise select the matching accessibility flag, then low quality or standard. All five mappings must exist. They may reference the same clip if that artwork is actually suitable, but the validator cannot certify that a clip is visually low-flash or low-motion. That requires native visual review. Never fall back from missing reduced artwork to a flashing standard clip.

Separate match-owned `EffectLibrary` residency uses no global Pixi `Assets` entry. It cannot evict actor or terrain textures. First frame access loads only its page; repeated requests and variant aliases reuse its pending request/cropped Texture. Page bytes and PNG structure are checked before decoding; dimensions are verified again against the decoded image. Disposal destroys cropped Textures before the page source and closes its ImageBitmap. Late metadata/image completion after release cannot resurrect old sheets or textures.

The default **32 MiB hard reservation budget** includes pending decodes and resident RGBA textures. A page that cannot reserve memory stays on the code-native fallback without fetching repeatedly. Under pressure, `trim()` evicts pages unused for ten seconds; later frame requests retry admission. The optional budget is bounded to 256 MiB. `statistics` exposes indexed/resident pages, resident bytes and reserved `allocatedBytes`; this is texture accounting, not an assertion about all browser/GPU memory. Crucial gameplay warnings must remain in their existing unbudgeted tactical layer.

## Exact file format

The existing `/art/index.json` retains format 1 and gains only optional:

```ts
effects?: {url:'fx/index.json', sha256:string, bytes:number}
```

URLs are relative to `/art/`, and SHA-256 covers the exact file bytes. The FX index contains:

```ts
{format:1, effects:{
  [effectID]: {url:'fx/<group>/<name>/effect.json', sha256, bytes}
}}
```

An ID has exactly `fx.<group>.<name>`; its metadata URL must match those components. A metadata document is:

```ts
{
  format:1, id:'fx.<group>.<name>', resolution:1|2,
  pages:[{file:'page0.png', sha256, bytes, width, height}],
  clips:{
    burst:{fps:20, loop:false, frames:[
      {page:0, x:0, y:0, w:64, h:64, origin:[32,48]}
    ]}
  },
  variants:{standard:'burst', low:'burst', reducedMotion:'burst',
            reducedFlashing:'burst', reduced:'burst'}
}
```

This is schema notation, **not a completed asset or approved reuse of those example variants**. Keep source/license/provenance in the existing asset manifest and source pipeline. Pages reside beside `effect.json`; cross-directory references, absolute/external URLs, percent escapes, query strings, traversal, duplicate page names and unknown schema fields are rejected. Every page must be used; each variant must reference a real clip. Frames must fit the declared page and have finite bounded origins.

| Limit | Value |
|---|---:|
| Index JSON | 256 KiB, at most 256 effects |
| Per-effect metadata | 1 MiB |
| PNG pages per effect | 8 |
| One PNG file | 8 MiB, up to 2048×2048 |
| Clips per effect / total frames | 32 / 2048 |
| FPS | Integer 1–60; 0 allowed for a single-frame clip |
| PNG encoding | Static noninterlaced 8-bit RGB or RGBA |

PNG signature, chunk bounds, CRCs, IHDR/IEND/IDAT structure and declared dimensions are checked by the shared parser. The Node packer also inflates the bounded image stream and checks scanline sizes/filters; the browser uses actual image decoding after byte validation. Animated PNG, malformed or truncated image data is rejected. Existing insecure-HTTP LAN SHA-256 fallback verifies the same exact bytes when `crypto.subtle` is unavailable.

## Product integration and packaging

`client/src/content/effect-assets.mjs` is the single schema implementation used by the browser and Node packer; `effect-assets.d.mts` supplies its public types. `runtime/effect-library.ts` implements testable lifetime/residency logic; `render/effect-assets.ts` supplies the real Pixi/ImageBitmap backend. Existing `ArtLibrary` only gains the optional descriptor type; its sprite loading, residency and fallback behavior are unchanged.

`client/scripts/ui/effect-pack.mjs` validates the full referenced graph and verifies IDs against the project's real effect manifest. No index means no effects and preserves old-index compatibility. A present partial/malformed pack fails explicitly, rather than being advertised as complete. Symlinks cannot escape the actual build/effect root. The dev server serves only referenced, verified FX bytes; unlisted files return 404, invalid packs return a recoverable 503. A bounded receipt cache avoids inflating every page again for every file request; index/manifest changes invalidate it, and every requested file is rechecked against its descriptor.

The actual art build hook copies only validated referenced FX files. `writeBasePack` revalidates the copied dependency graph against the descriptor before adding exact sizes/hashes to the existing offline pack. Missing or modified copied pages fail packaging. No renderer mount, Go/protocol update, asset manifest status, production FX files or deployment is included in this slice.

## Verification

- Shared parser tests: immutable metadata, path/ID mismatch, traversal, missing accessibility mappings, missing clip/page, invalid bounds, duplicate pages, corrupt/truncated/appended PNG data and unsupported dimensions.
- Lifetime tests: absent index makes no request; metadata/page deduplication and lazy upload; variant aliases share frames; byte corruption fails before decode; retry recovery; strict pending/resident budget; idle eviction; release during metadata fetch/image decode; decoded-dimension mismatch disposal; final zero residency.
- Real build/dev tests: whole dependency graph, partial/corrupt/unknown-ID packs, symlink escape, traversal, unlisted URLs, exact HTTP bytes, actual `closeBundle()` copy and base-pack hashes, copied-file tamper rejection. Fixture HTML/WASM stubs are explicitly synthetic packaging fixtures, not playable-game evidence.
- Actual Chromium/Firefox/WebKit Pixi tests on **insecure `http://fx.frontline.test`**: `isSecureContext=false`, `crypto.subtle` absent; verified PNG decoding/upload/cropped frames, exact GPU texture/stage pixel checks after an explicit static-stage render, both page textures rendered, fallback SHA-256, shared variants, release/disposal zero pages and zero canvases. Native capture uses labelled synthetic 2×2 pixels only, not authored effects or final art.

Source-specific results and native capture: [work/evidence/effect-assets/acceptance.md](../work/evidence/effect-assets/acceptance.md). Production gameplay warning/impact integration and original artwork remain separate work.
