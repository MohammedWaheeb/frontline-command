# Generation-bound art candidate

Private candidate; no live promotion and no complete-game acceptance. It corrects the reproduced v25 defect where retained A atlas metadata admitted B pixels after another tab installed B. Exact verified index, manifest and file identities now remain together through deferred loads, eviction, rollback and decoding. No new UI layout, palette, geometry or art is authored here.

## Frozen versions and actual checks

- **V1:**460 runtime tests and both TypeScript checks passed. Independent review then reproduced136-ID startup queue overflow and permanently cached temporary failures. Do not promote v1.
- **V2:**465 runtime tests and both TypeScript checks passed. Core queue permits1,024 descriptor-only waiters with four active/128MiB bounded reads. Sheet/image/cameo temporary failures can recover; same-index retry recaptures; transient pages back off. Independent review then showed terminal errors were hidden after an earlier transient failure. Do not promote v2.
- **V3:**466 runtime tests and both TypeScript checks passed, including14 core and12 consumer tests. Terminal errors are now reported once even following a temporary failure and held. Independent frozen-source review confirms all prior regressions and lifecycle cases. See [review](../evidence/art-generation-review/v3-review.md).

The three archives and source locks preserve247 exact files each, including five content test inputs. Generated frozen folders can be reconstructed from their corresponding archive. Original setup, queue-regression and earlier-version failures remain in the saved check logs and separate review evidence.

## Actual browser and full App boundaries

The Chromium v3 fixture reached22 functional assertions: A remained A across B installation and eviction, fresh B was B, missing A failed closed, changed online bytes rejected before decode, and cold cached C loaded. **Strict result remains failed for three unclassified native request aborts.** See [unaltered browser result](../art-generation-browser-v1/browser-result.md). This is a small test document, not the full game.

`build-app.mjs` makes a private App from frozen v3, unchanged v25+36 incomplete art and Go0.3.4. Build01 omitted source font/chrome dependencies and retained unresolved CSS URLs; it is rejected. Build02 failed before bundling because the source inventory traversed a dependency symlink. Build03 captures16 original CSS assets whose hashes already occur in the immutable base, and verifies every emitted CSS URL against its newly written manifest. It preserves4,815 art/runtime/content/font descriptors byte-for-byte. Receipts and logs preserve all attempts. Full-App browser acceptance is in progress separately in `../art-generation-app-v3`; build success alone is not acceptance.

Battlefield art, cameos, preflight and effects use this generation binding. Other consumers are explicitly inventoried in [scope](../../docs/asset-consumer-generation-scope.md); menu atlas fallback and an audio retry cache mismatch need separate correction. No physical LAN, final roster, long-match, listening or release claim follows.
