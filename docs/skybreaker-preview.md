# Skybreaker approach review

The Skybreaker input flow chooses an entry edge and three ground impact points, then opens an explicit review. **Confirm strike** submits the original intention through fresh Go advice and ordinary command execution. **Retarget** starts three points again on the chosen edge; **Cancel**, Escape, changing selection, loss of the selected site, perspective/session changes, defeat, replay/observer mode or disposal invalidate the review. No credits or strategic charge are spent by preview itself.

The review is single-use. It holds a cloned request and an asynchronous generation/selection/session guard; a late host response cannot reopen a canceled review or alter a newer one. Input targets do not change when server response objects are mutated. Ordinary target-only and entity-target abilities retain their existing resolution; ground-target abilities treat an actor click as the ground point beneath that click.

## Source of truth

Go's sequential preview response and slot-authenticated `/api/v1/matches/{id}/advice` optionally return:

```ts
interface OrderPreview {
  tick: number;                         // frozen observation tick
  results: AdviceOrderResult[];
  plans?: Array<{
    order_index: number;
    kind: 'skybreaker';
    edge: 0 | 1 | 2 | 3;                // West, East, North, South
    routes: Array<{                     // exactly three; preserves target order
      entry: Point;
      drop: Point;
      impact: Point;
      entry_at: number;
      release_at: number;
      impact_at: number;
      splash: number;
    }>;
  }>;
}
```

Entry/release/impact times are **absolute Go ticks**, estimated using the earliest next-tick execution from that observation. The UI subtracts `tick` and formats seconds at the established 20 ticks/second; it computes no flight timing, path, clustering, readiness, visibility or damage rules. Times are estimates from the reviewed state, not a countdown to an already-issued order. Aircraft can be delayed or lost, and execution may reject changed conditions.

The parser accepts only plans matching a requested strategic order, edge and all three exact impact points. It validates bounded integer fields, three routes, unique order indices and monotonic timestamps. It does not infer a missing route or splash value. Independent candidate advice cannot expose plans. Local and LAN sequential preview adapters preserve the same optional contract; the Go command environment provides a guarded `onPreview` callback after its normal result checks.

An older runtime without `plans` shows a clear unavailable-preview message with Retarget/Cancel; it cannot silently issue an unreviewed Skybreaker strike through this flow. No automatic fallback route calculation exists in JavaScript.

## Renderer and control contracts

- `StrikePreviewOverlay` accepts only the reviewed owner plan. Squares are entry points, triangles are release points, and numbered impact markers carry the exact reviewed splash circle. A faint release-to-impact assignment tether is not a bomb trajectory. Approach arrows indicate the supplied entry → release intent. No AA coverage, hidden actor, future visibility or interception prediction is added.
- World points use public terrain projection; the same plan draws on the existing clipped minimap. Text/line sizes remain screen-readable; nearby labels stack with leaders. Review geometry does not alter terrain, fog, gameplay or aircraft animation.
- Preview is cleared on a perspective/backward snapshot reset, cancellation and disposal. It is separate from actual operation warnings, which appear only after Go accepts the order.
- `StrikeReview.tsx` uses the existing charcoal/olive/brass console. The game keeps running. Its timing table shows each reviewed wing's entry, release and impact estimates, the review age, and the fact that no strike has been ordered. It contains Confirm strike / Retarget / Cancel and introduces no account or approval flow.
- Reduced effects retain steady essential lines, shapes and text. There are no moving preview aircraft, flashes or motion effects.

## Verification status

Initial parser/lifecycle checks pass as part of 261 runtime tests. They cover exact values and response-copy isolation, malformed/mismatched plans, independent-mode rejection, LAN uncertainty, waiting state, cancellation/session invalidation, old responses after a newer request, immutable target requests, older-runtime fallback and single-use confirmation. Both project typechecks pass.

Actual product browser acceptance passes against the root's isolated optional-wire candidate. The shipping runtime and generated protocol remain unchanged. The test imports an exact Go-generated practice save, uses the real entry-edge modal and three battlefield clicks, and exercises West/East/South/North plans. It verifies zero submitted orders before confirmation, after Retarget, after Escape, after Cancel and after selecting HQ. Another command also clears the pending review; confirmation cannot overlap an in-flight command. Confirmation submits exactly one North strike; Go accepts it and spends 1,200 credits. The archive replay remains read-only with the strategic site selected; seeking to its recorded start removes future warnings. The last pass also uses Enter on the focused Confirm control, with battlefield shortcuts suppressed inside the review panel.

The course's resource/infrastructure setup uses explicit recorded practice orders, then waits for ordinary strategic charge. It is presentation/input acceptance, not an economy/build-order or mission victory claim. Raw setup save/replay and exact preview/order responses are retained under `work/evidence/strike-preview/`. The actual production `Application`, `BattleController`, library, archive importer and renderer are used; there is no test-only gameplay API on the product page. The test runner observes worker frames/orders passively after import.

A first run found a real input defect: ground-target ability clicks over actors were treated as entity targets and ignored by the multi-point picker. The bounded ground-target ability correction passes the same course. Target-only/entity abilities, including transfer and designation, retain entity resolution. A stale “Choose 1 more target point” notice is now cleared when targeting finishes or is canceled. Initial failure evidence is preserved locally in `initial-ground-target-failure/`; its unrelated setup-page favicon 404 is removed with an explicit data favicon.

## QA record and remaining coverage

Browser plugin not available; the existing installed Playwright workflow runs isolated headed Chromium 151.0.7922.34. Viewports: 1600×900 and 1280×720. Page identity is **Frontline Command** on an ephemeral localhost Vite server; setup is a separate clearly named test page. Native captures show actual nonblank product content with no framework overlay. Final page/console errors are zero. Native images were inspected for panel/control clipping, table readability, distinct target/release labels and minimap routes.

- `review-west-1600.png`: all three static ETA rows, stacked release/target labels and complete approach overview on the minimap.
- `review-north-1280.png`: minimum desktop viewport, reachable Confirm/Retarget/Cancel, no stale targeting toast.
- `confirmed-authoritative-warnings-1280.png`: review removed, Go-owned warnings appear and credits fall by the real cost.
- `replay-read-only-1280.png`: selected strategic site, replay console and no strike controls/review.

Exact hashes, URL, ticks and final test totals are in the compact [evidence record](../work/evidence/strike-preview/acceptance.md). Full local JSON evidence is `work/evidence/strike-preview/browser.json`. Root's actor-status hookup is mounted in the final source, but this course is not a substitute for its dedicated status/effect acceptance.

Reproduce with:

```sh
npm --prefix client run typecheck
npm --prefix client run typecheck:app
npm --prefix client run test:runtime
# Uses the optional-wire candidate by default; it never overwrites public/runtime.
node client/tests/render/strike-product-browser.mjs
# Set FRONTLINE_STRIKE_RUNTIME to a compatible isolated or promoted runtime directory.
```

Remaining coverage: a live two-profile LAN product strike, mobile/Firefox/WebKit visual checks, changed-readiness rejection during the final confirmation, actual intercepted/delayed aircraft outcome and maximum-load performance of the combined overlays. Host route generation already has its own Go tests, but this client lane does not claim those as rendered LAN acceptance. Full strategic effect art and all 132 manifest effects remain separate work. Older shipping runtime0.3.3 lacks the new plan response until root promotes the candidate; the explicit unavailable-preview path is covered by pure tests.
