# Older base asset lineage

The 48 base-only assets contain 3,731 poses, 1,068 sprite descriptor/PNG files and 88 packaged runtime UI images. Every sprite file matches both the immutable v25 product and the recorded ink-metadata publication. Every packaged UI image matches the current source output. All 10,899 raw PNG hashes match the preserved pre-ink inventory. No images, sources, metadata or products were changed.

All 48 assets have historical zero-failure integrity reports and recorded visual review. The 22 unit/building roles also have historical 20-check UI reports. These reports were read and pinned, not rerun; the audit does not provide a new visual or actual-game acceptance. The source mapping for older buildings follows the preserved original, repair-arm and interceptor amendments and their recorded production history, rather than attributing old pixels to the latest model.

Remaining lineage limitations are explicit:

- The original logistics lock pins model and specs but not every render-era helper. The later transparent-team helper must not be credited as the renderer of these older pixels.
- Five original props have unchanged current model files and preserved pixel history, but need an older source snapshot traced before a new fully source-pinned handoff.
- Props have no indexed portrait or build-cameo requirement. The current overlay-v3 adapter requires eight UI images for every new handoff, so it cannot be applied to these props unchanged. Do not invent images to satisfy that catalog-specific rule.
- Base index presence is now backed by exact file and historical evidence, but is still separate from a new per-asset native review, in-game behavior and final packaging validation.

The first two audit attempts are preserved. The first incorrectly assumed the immutable runtime product contained source 1x UI derivatives; it intentionally packages only four 2x UI files per catalog role. The second expected a numeric failure count from old reports that use an empty failure list. The corrected audit accepts only zero or an empty list and independently requires every reported result to pass. Neither failure was an asset defect or a relaxed integrity gate.

`result.json` pins the input receipts, every inspected runtime file, exact preserved source references and per-asset historical reports. This is a read-only audit, not a handoff or publication recipe.
