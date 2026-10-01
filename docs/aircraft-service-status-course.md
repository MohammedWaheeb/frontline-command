# Actual aircraft service-status course

This bounded course exercises the service presentation correction in `8e6ef32`
using unchanged authored **US04, Normal, seed 941**. Fourteen native Go stages
and all fourteen corresponding renderer stages pass in Chromium, Firefox and
WebKit on immutable v19. This is not a mission victory, paid-opening, full aircraft-lifecycle,
final-art or reference-hardware acceptance claim.

The mission supplies its normal initial assets and credits. The test issues only
ordinary Return, train, move, queued Return, power and sell orders, and advances
the Go simulation. It does not grant resources, create practice actors, edit
mission/save/view data or substitute client simulation. Every order receives
normal Go preview and execution validation. Selling the service home deliberately
exercises a legitimate service-loss path; it does not accelerate a victory.

## Native proof and renderer contract

The shared command policy is `client/tests/render/aircraft-service-course.mjs`.
The native driver uses the existing single-CPU Session bridge from
`work/multiplayer-combat/expansion-build-v2/bridge` and verifies the complete frozen
c7e0 source lock before execution. The native result is preserved at
`work/evidence/aircraft-service-status/native-2026-09-29T00-00-52.299Z/`.
Each stage has its actual unmodified Go save, owner-authorized view and state hash.
Each of the two original-start cases also has a complete recorded replay.

| Stage | Tick | Actual behavior checked |
| --- | ---: | --- |
| Original service, case A | 181 | Original fighter lands and accumulates service work |
| Paid reservation | 182 | Backup producer pays 1,600 credits; its fighter job reserves the original home |
| Disabled reserved home | 224 | Original fighter work and paid job work both remain frozen for 40 ticks; enabled producer reports `service_full` |
| Active low-power service | 245 | Enabled home continues actual half-rate service: 20 work over 20 ticks |
| Paid fighter ready | 996 | Normal production creates the fighter with its real reserved home |
| Outbound, Return queued | 997 | Current order is move; Return is second, not active flight status |
| Return active | 1,072 | Return becomes the real first order |
| Paid fighter servicing | 1,112 | Ordinary return reaches service admission |
| Home sold, reassigned | 1,218 | Actual `service_lost` accompanies an already assigned replacement home and grounded takeoff deadline |
| Replacement service | 1,353 | Aircraft enters service at its replacement home |
| Original service, case B | 181 | Fresh unchanged mission start; original fighter servicing |
| Home sold, no replacement | 288 | Disabled backup cannot admit; home is zero while grounded emergency takeoff is pending |
| No-home airborne | 328 | Actual takeoff occurs; the separate emergency endurance cap is present |
| Capacity restored | 330 | Enabling backup admits the unassigned aircraft normally |

Case A final hash is
`36c5daa0d2609c1ba6908e60c217a59827d8b2db1ef688f4fff9d7d9dc00317b`;
case B is
`a6be1e9c17c2a572f5279fedb801364360113004043449a259443e571da3d160`.
Both outcomes remain unfinished.

Chromium 151.0.7922.34 evidence is preserved in
`work/evidence/aircraft-service-status/chromium-01/`. All fourteen native hashes
match. Save/restore and rewind to the actual disabled-home tick 224 match their
recorded hashes; paused/reduced-effect status, culling/reappearance and disposal
also pass. Eleven ordinary command batches have accepted receipts. Recorded page,
console and HTTP errors are zero; final actor pages, picking bytes and canvases
are zero. Native 1280×720 and 1600×900 captures show the disabled-home and
generic producer labels, and distinguish grounded emergency takeoff from actual
no-home status. Root and the course author inspected the native screenshots.

The original Chromium driver snapshot is preserved with SHA256
`515f933958d034ec428563261c762ce5f2f978d14ed8b8a716cb2c3ad4874972`.
A subsequent test-only change adds explicit final fixture-error/cleanup checks
after browser close for Firefox and WebKit; the original successful Chromium run
is not relabeled as having executed those new checks. No production source or
old evidence changed.

Firefox01 and WebKit01 each pass all fourteen stages, exact save/replay hashes,
pause, reduced effects, culling/reappearance and final disposal. Their post-close
page/console/HTTP diagnostics are zero. This driver does not collect
`requestfailed` events, so these receipts do not assert zero request failures.
`work/evidence/aircraft-service-status/three-engine-receipts.json` pins each
original report and its exact driver version.

The browser driver replays the same **commands from each original start**, rather
than injecting those recorded views into the renderer. It requires exact native
tick/hash agreement at all fourteen stages before checking live Pixi labels and
recording screenshots. It also checks pause, reduced effects, actual save/load,
recorded replay rewind within its valid range, viewport culling/reappearance and
resource disposal. The AudioDirector receives actual snapshots through a
recording mixer: this tests the choice of the no-slot warning, not sound decoding
or speaker output. Owner-only privacy regressions remain covered separately by
the focused tests; this mission authorizes only human perspective 1.

## Frozen build and reproduction

Root's immutable `work/art/effects-opus-v2/integration-v19/product` is pinned to
client source digest
`38b29b7f2664424d0a92830a325eb1afdc81b4ee025c7ba3b59f4d4c0e1ec549`.
The driver verifies every frozen source file, runtime file and native input hash
before running. The renderer uses the product's current incomplete actor art and
isolated candidate FX; neither is promoted by this course.

The earlier v18 freeze missed the final catalog-service-home guard in
`actor-status.ts`; labels and AudioDirector were identical to `8e6ef32`.
`v18-comparison.json` records that precise difference. V19 contains the final
guard. No old freeze was edited.

```sh
node client/tests/render/aircraft-service-native.mjs

node client/tests/render/aircraft-service-browser.mjs \
  --product work/art/effects-opus-v2/integration-v19/product \
  --native work/evidence/aircraft-service-status/native-2026-09-29T00-00-52.299Z \
  --out work/evidence/aircraft-service-status/chromium-v19-01 \
  --browser chromium
```

Use a new output directory for each attempt. `--build-only` bundles and records
the exact fixture without opening a server or browser. It passed in
`build-v19-02`, along with an isolated frozen-source TypeScript check. The first
focused type check caught a test callback signature mismatch; its original red
log remains in `build-v19-01`. The command policy and native evidence did not
change. All engine runs were serialized through root's browser lane.
