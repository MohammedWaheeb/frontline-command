# Advertised illustration keys

Building illustration IDs in the actual art index use names such as `building.US.barracks`; unit illustrations use names such as `US.rifle`. The prior consumer and preflight stripped both prefixes. A full-key building therefore fell back to world-sprite composition, and preflight did not request its advertised portrait/build PNGs.

`client/src/content/art-ui.ts` now resolves portrait and build keys separately. Each list prefers the exact advertised asset ID, then its stripped legacy spelling if that spelling is actually advertised. Unknown UI stays absent. Keys are validated before becoming a URL; no asset is renamed and no key is invented. `ArtLibrary.composeCameo` and `planArtPreparation` share this rule. Build still falls back to the selected portrait, then world composition. Missing portrait still conservatively verifies every2x beauty/team page needed by the world fallback; shadow remains unnecessary solely for a cameo. A declared but missing UI file still fails preflight.

The regression calls the actual `ArtLibrary.cameo` composition path with a nonvisual canvas/image harness: before the fix it returned undefined for a full building key, and preflight fetched none of the four advertised UI images. Both failures are retained. The28 focused tests now pass, including separate mixed legacy/full portrait/build spelling, exact-key preference, unit compatibility, missing UI fallback, path rejection and missing-file failure. Both TypeScript checks pass. This is source/graph verification; fresh product visual checks remain for root's next freeze.

The same immutable `current-four-v19` product was audited before and after. All four complete unit overlays stay byte/dependency-identical. Across its entire partial index of69 sheets plus22 terrain images:

| Quality | Files before→after | Encoded bytes before→after | UI pairs before→after |
| --- | ---: | ---: | ---: |
| Standard | 1249→1197 | 143,847,325→105,663,326 | 48→78 |
| High | 1057→1117 | 259,385,215→260,643,362 | 48→78 |

Both qualities add60 actual PNGs covering portrait/build pairs for15 already-indexed buildings. Standard removes112 unnecessary2x fallback metadata/image dependencies; high already needs its world2x pages and removes none. The four-unit subset stays250files at28,208,090/82,951,987bytes standard/high. The index and build receipt hashes match exactly before/after. This partial graph does not close the eventual complete-roster2GiB encoded-budget gate, prove full PNG decode, or certify current art visually.

Evidence is under `work/evidence/art-ui-key/`: preserved red/green test logs, both typecheck logs, before/after graph reports, source hashes and exact URL changes in `receipt.json`. Production changes are limited to the shared resolver and small art/preflight call-site changes.
