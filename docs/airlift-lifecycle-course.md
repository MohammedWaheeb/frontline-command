# Actual paid airlift lifecycle

The native Go course passes all 16 stages on the unchanged authored US04 Normal
mission, seed 941. Chromium, Firefox and WebKit each pass all 16 stages at standard quality. This is a transport and
renderer lifecycle course, not a mission victory or complete aircraft art gate.

The existing single-process Session bridge runs with `GOMAXPROCS=1` against
source lock `c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122`.
The shared JavaScript driver only reads the current owner-authorized view and
submits ordinary production, board, unload, move and Return orders. All
requirements, placement, movement, health, transport channels, reservations,
endurance and service remain in Go. No map, mission, save or view is edited;
there are no free actors, resources or outcome triggers.

## Native result and preserved failure

The passing run is
`work/evidence/airlift-lifecycle/native-2026-09-29T07-39-30.706Z`.
It closed with code 0 after seven accepted command batches. It paid the actual
900-credit airlift cost at the original service producer, used two original
rifle squads, and preserved their health through both unloads. Every stage
exports its exact save and authorized view, followed by the recorded replay and
final save. File hashes for both native attempts are retained in
`work/evidence/airlift-lifecycle/native-inventory.json`.

| Actual stage | Tick |
| --- | ---: |
| Paid production job | 101 |
| Paid aircraft ready and legally parked | 661 |
| Service-pad boarding channel | 677 |
| Both squads aboard | 927 |
| Service-pad unloading channel | 928 |
| Both squads exited healthy | 988 |
| Second boarding channel / completion | 989 / 1049 |
| Loaded departure / destination hover | 1050 / 1150 |
| Airborne unloading channel / healthy exits | 1151 / 1211 |
| Active Return | 1212 |
| Landed with actual service work | 1327 |
| Service complete, endurance restored to 2400 | 1617 |

Final state hash:
`6340e73efed3f97d156d336a79b60ca0cfb6e5dd3a7c40b24e92f29f77590212`.
Replay SHA256:
`eb7be939a1a41081071b152249dd22e854db3570b7c6242d525eac4fd0139ef3`.
The mission remains unfinished, as expected.

The first run at `native-2026-09-29T07-38-24.875Z` failed a test assumption:
newly produced aircraft already arrive fully serviced at a legal pad. Issuing
Return while full and landed does not create another service interval. Its
failure save, replay and raw report remain unchanged. The corrected driver
uses that actual initial parked state, then proves nonzero service work after
real flight. No engine change was made.

## Frozen renderer course

The browser fixture uses the exact v19 source digest
`38b29b7f2664424d0a92830a325eb1afdc81b4ee025c7ba3b59f4d4c0e1ec549`
and private full-aircraft overlay
`work/art/aircraft-runtime-overlay-v1/outputs/lifecycle-pair-v19/product`.
The overlay has the full 656-pose airlift. Its explicit original-base receipt,
selected source lock, runtime bytes, all published aircraft bytes and base-pack
hash are verified before compilation. It never resolves production source
from the current checkout. Unrelated actors can still use existing stand-in
art; that is not final visual acceptance.

The flow under test is: original US04 starts, an ordinary paid airlift completes,
original squads board/unload at its service pad, board again, fly and unload,
then the airlift returns and completes service. The real renderer must use
authored door activity, service and parked art, while every stage matches its
native tick and state hash. Takeoff/landing are recorded as cosmetic renderer
transitions over actual Go state; their timing is never simulation timing.

The driver captures each stage at 1600×900 and four transport/service phases
also at 1280×720. A 700 ms presentation-only wait records frame choices without
advancing Go; the actual authored takeoff/landing clips are 600 ms. It checks
pause and reduced-motion invariance, save/restore, replay back to the real
boarding tick, aircraft-body cull/reappearance and final disposal. Page,
console, HTTP and request failures remain strict through browser close. Audio
selection is recorded through the real AudioDirector, with no speaker or
decoded-audio claim.

This course does not establish crash/damage variants, foreign ammunition
privacy, every authored direction/frame, full-menu input controls, FPS or total
GPU memory. The independent three-engine atlas course covers asset residency
and frame reachability; it does not substitute for this gameplay course.

## Reproduction

```sh
node client/tests/render/airlift-lifecycle-native.mjs
node client/tests/render/airlift-lifecycle-browser.mjs \
  --product work/art/aircraft-runtime-overlay-v1/outputs/lifecycle-pair-v19/product \
  --native work/evidence/airlift-lifecycle/native-2026-09-29T07-39-30.706Z \
  --out work/evidence/airlift-lifecycle/chromium-01 \
  --browser chromium --quality standard
```

Use a new evidence directory. `--build-only true` verifies identities and builds
without starting a browser or server. The final authoring build and isolated
frozen-source TypeScript check are in `build-v19-02`. The Browser plugin skill
is unavailable; this existing Playwright course runs only in the root agent's
coordinated browser lane. No dependencies or global browser settings changed.

## Three-engine browser result

On29September2026, `chromium-01`, `firefox-01` and `webkit-01` each pass the actual16-stage course. Every stage tick and state hash matches the native run. All three have zero page/console/HTTP/request failures after browser close, and final canvas, resident-art and picking allocations are zero. Exact report, bundle and overlay identities are retained in `work/evidence/airlift-lifecycle/three-engine-receipts.json`. The atlas course separately verifies both1x/2x qualities; this gameplay course uses standard quality only.

Root directly viewed native Chromium boarding, field-unloading and return-service screenshots; see that evidence directory's `root-native-review.md`. Full roster integration and subjective review beyond those representative images remain separate. No live art/runtime was published by this acceptance.
