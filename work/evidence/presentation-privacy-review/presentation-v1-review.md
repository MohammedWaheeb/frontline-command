# Independent presentation v1 review

The original Claude v1 candidate remains unmodified and is **not accepted as a whole**. One reachable caption/objective layout conflict needs correction, the authored diagonal-fog test has a wrong expected value, and the original GPU comparison against accepted v4 failed. The bounded source review found no new hidden-world reads or clear resource-lifetime leak. This is not final visual acceptance.

## Exact scope

- Candidate: `work/claude/presentation-polish-v1/source/client`, compared against `work/art-generation-consumer-v1/frozen-v3/client`.
- Exact author/model audit: `work/claude/authoring-20260929/presentation/run-20260929T144314691446Z.model-audit.json`; status `completed-exact-model`, requested/returned `claude-opus-5-5`, no fallback.
- Author report SHA256: `41b72af8c38564620ddbaedac7ab7d86e85685e5b1f9c05ca9b4ee6357c2b57d`.
- Independently recorded source pins: `presentation-v1-source-review.json`; complete five-path diff: `presentation-v1-reviewed.diff` (SHA256 `d97fd01283942834822b2d88b3808abf5e57508eec076e207793105401e8d6ee`).
- Changed paths: `src/ui/App.tsx`, `src/styles/game.css`, `src/render/terrain.ts`, `src/render/battlefield.ts`, and the new `tests/runtime/presentation-polish.test.ts`. `actors.ts` is byte-identical to baseline.

## Concrete findings

### Caption flow can overlap mission objectives

The new targeting-caption rule puts captions below the alerts rail, while the mission panel remains independently fixed at top 130px. The ResizeObserver only measures the alerts rail; it does not allocate space for mission objectives. A reachable state with targeting, three captions and mission objectives can overlap: at 150% UI scale, three single-line caption rows alone occupy about 123px before wrapping, starting around 26px with no alerts. This is a source-derived layout counterexample, not a measured native screenshot.

The minimal correction should give alerts, persistent captions and mission objectives one bounded flow/scroll owner with a budget above the command tray. Keep the live-caption node mounted, full text and objective controls available, and ordinary targeting/review input behavior intact. Do not hide a caption or objective to satisfy a screenshot.

The author's claimed strike-review overlap is **not established by this change**. `BattleController.reviewStrike()` calls `cancel()` before publishing the review, which clears targeting and therefore disables the new `body:has(.targeting-hint)` caption rule. Test the ordinary third-target → review transition instead of forcing an unreachable concurrent hint/review state. Any pre-existing strike/caption overlap needs its own reproduction.

### Authored diagonal expectation confuses remembered with unknown

The test changes the diagonal visible bit to false but leaves explored true. Its fan-center contribution is `175/4 = 43.75`, not `255/4 = 63.75`. Keep a remembered test, then clear explored separately for the unknown case. Production logic should not be changed to satisfy that incorrect expectation.

### Accepted-v4 pixel monotonicity fails; constant-floor privacy is a separate gate

`work/claude/presentation-polish-v1/fog-chromium-01/browser.json` compares exact accepted v4 `65421e5…` with candidate `6820e55…`. Its strict current-baseline comparison failed. All 48 computed cases are flat; raised cases were not reached after the first assertion. Edge maximum drops are 1–2 alpha, but corner cases reach **3**, including an observed 2→0 edge sample. Zero `unknownLost` is useful, but alone does not prove every remembered/partially-covered pixel safe.

Root's independent `fog-floor-chromium-01/browser.json` compares the same candidate against original constant fog `52d20cd…`: all 96 flat/raised cases passed with zero lighter pixels and zero lost opaque pixels. Preserve both results. A zero-tolerance comparison against the original floor is a narrower privacy claim; it must not retroactively turn the failed accepted-v4 comparison into a pass.

The source changes only currently visible top fan centers, raising them to the four-corner mean capped at 128. Unknown/explored triangles retain constant 255/175 at all three vertices. Pixi's non-centroid interpolant can extrapolate outside a triangle at an MSAA pixel center, so a raised center can reduce an extrapolated value with a negative center weight. That explains a plausible mechanism, but vertex monotonicity is **not** proof of raster monotonicity. A separate three-source derivative preserves exact floor/current/candidate values and protected-class raster coverage; see its own receipt rather than assuming the cause.

## Bounded privacy and lifetime review

F1 topology adds four tile-corner point references per top triangle and a retained Float32 alpha scratch buffer. Temporary Maps remain inside the topology builder; runtime closures capture returned typed arrays. New dependencies include the far corner across chunk boundaries. Invalidation still compares effective public opacity values, not array identity or tick. No entities, enemy-private fields, simulation mutations or projection changes were added.

F5 memory labels retain the prior authorized-memory filter: remembered entry with a position on explored but currently nonvisible terrain, absent from current entities, with a valid `seen` value. `memoryCaption` is the absolute **LAST SEEN timestamp**, not elapsed age; its stable caption across later ticks is intentional. The new container owns its Text and plate Graphics; old memory graphics recursively destroy these children, settings invalidation rebuilds on scale change, and camera counter-scaling remains. No new async atlas work or borrowed texture destruction was introduced. Native readability, zoom/scale and real Pixi lifetime remain separate visual/runtime gates.

F2–F4 keep handlers, command admission and disabled-state semantics. The stable order partition favors ordinary unit actions, preserving relative contextual order. The wider command columns and one-line waiting caption still need actual 1280/150% reachability and full-label inspection; pure source reasoning cannot certify those dimensions. F6's observer/listener/rAF cleanup is locally balanced, but its independent placement model causes the mission conflict above.

## Independent no-browser CPU coverage

`memoization-audit.mjs` ran the exact candidate TerrainBaker through the existing non-rendering Pixi buffer adapter. `cpu-v1-01/result.json` records **51 passing transitions**, with an independent point/square intersection oracle rather than the candidate's topology/helper implementation.

- Actual Float32 UV and uploaded-buffer equality for same-array mutations, fresh equal perspectives, sparse/missing arrays, rewind, hidden updates and show recovery.
- Far southeast diagonal outside a 16×16 chunk changes center alpha to remembered43.75 and unknown63.75 correctly.
- Equal effective opacity values produce zero buffer updates; irrelevant explored changes on visible tiles do not upload.
- Public-index-only proxy reads cover289 valid tile indices; an entities getter throws if accessed.
- Geometry signatures remain exact; owned adapter resources dispose.

This proves the CPU cache/data path only. It does not prove browser GC, actual GPU edge coverage, overall performance or subjective appearance. Earlier baseline CPU/GC/GPU scopes are listed in `terrain-baseline.md`; they are not relabeled as acceptance of this new candidate.
