# Combat effect integration, 28 September 2026

Status: bounded actual-Go and browser acceptance passes for the current attachment/orientation integration. This is not the complete 132-effect release, complete roster art or final presentation acceptance. The 59-effect pack remains isolated from `assets/build/fx`.

## Exact source and behavior

`integration-v4/build.json` locks client source digest `02d7d15fe8555c6061e55f85f74b682948de3f6181ee05bd68dbe201f92aa062`, the unchanged optimized Go/WASM runtime and earlier frozen actor art. It adds the byte-exact 59-effect candidate and includes it in the offline pack. The product includes a test-only read-only acceptance entry. Previous unused and tested freezes remain separate; none is a clean final package.

- A muzzle flash follows the hardpoint of the actually displayed beauty frame, including frame-zero/page fallback, reversed aliases, recoil, squad member, altitude and independent turret offset. Axial rotation follows the quantized displayed sprite heading. An asset without a muzzle point keeps a directionless fallback. No target is reconstructed. Pitched barrel-axis metadata and all-roster native review remain future work; the heading is a planar direction, not a claim of exact 3D barrel elevation.
- A projectile body is oriented only after successive disclosed positions provide a direction through currently visible tiles. The first sample retains the existing tactical point. No future position, hidden target or height/ballistic arc is manufactured. The current wire supplies no projectile elevation, so its existing ground-projected cosmetic point remains; this does not certify a muzzle-to-projectile 3D trajectory.
- Raster outcome symbols and their code fallbacks no longer overprint each other. Outcome labels and undecorated fallback marks remain independent of the 192-decoration cap. Rotated crop bounds prevent a tall smoke plume disappearing just because its ground origin is outside a fixed 96-pixel guard.

Einstein independently reviewed the attachment/frame pairing, authorized-position direction, reset/cull and essential-feedback handling without finding an additional blocker. Root directly reviewed native actual-game rifle/cannon, cover, decoy, interception and reduced-effects captures. Small flashes align with the displayed barrels; the later outcome-symbol correction removes duplicated outlines. The later seven building exports are intentionally absent from this frozen comparison.

## Verification and preserved failures

All **361** runtime tests and both app/runtime TypeScript checks pass. A new actual `ActorVisual`/`SpriteSheet` test covers delayed-page pose fallback, exact recoil frame, alias reversal, part offset, direction and hidden/dead attachment rejection. Geometry tests cover first-sample ambiguity, same-position samples, hidden pockets and rotated/offscreen-origin artwork bounds.

The first complete runtime run passed 358/359: attachment lookup unnecessarily touched `sourceFrame` on a no-muzzle test double. Production now skips that lookup when the sheet has no muzzle metadata; the original log remains preserved. Tests were not disabled.

Actual optimized Go fixtures plus ordinary Attack and practice-created cannon combat pass in:

| Browser evidence | Result |
| --- | --- |
| `browser-03-chromium` | Pass |
| `browser-05-firefox` | Pass |
| `browser-06-webkit` | Pass |

All three cover five artwork variants; muzzle/cannon direction; hit, cover, landed-aircraft armor, converted/dead/removed shooter, decoy and interception facts; held simulation clock; cull/re-entry; exact save/restore/replay; and resource disposal. Chromium also exercises graphics-context loss/recovery. All have zero unexpected page/console/HTTP errors, and zero retained actor/FX pages or canvas after disposal. Browser-engine WebKit is not certification of physical Safari hardware.

`browser-04-firefox` is a preserved failure of the expanded whole-report pause oracle: the manual Go clock/hash and cue frames held while existing wall-clock actor recoil changed its painted attachment. The corrected test preserves exact authoritative/cue/clip assertions and does not claim frozen actor pixels. See its `failure.md`. Earlier `browser-01` and `browser-02` preserve pre-symbol/culling variants and are not relabeled as final-source runs.

## Combined actual-Go workload

`combined-01/browser.json` passes two same-page 600-tick segments of the earlier exported native course: 688 actors, 64 ordinary aircraft returns, mass routes, 24 paid strategic missiles and 24 actual interceptions, 72 command batches and 150 exact owner-feedback boundaries per segment. Both segments match native final hash `71bf256a2a95d16e3a65c39977e5d247ebcd81b3088495864806fca313beb8c1`, save/restore, and the original native replay checks.

Shared-M4 diagnostics were 19.9993 and 20.0001 TPS, with 18.4 ms frame p95 in both segments. The second segment had six frames above 50 ms, maximum 83.4 ms. This is shared-host functional evidence during art/mission work, not a quiet benchmark. Actual effects reached nine resident pages / 381,936 RGBA bytes and eight simultaneous decorations; not every effect was exercised by this workload. All texture, picking and canvas counts return to zero. There are no unexpected errors.

Remaining: larger destruction specialization and its truthful altitude/class inputs, remaining 73 IDs and dynamic consumers, all-roster/native/variant review, full-family residency and pressure, audio mix/listening, complete latest-art load and final local/LAN packaging. No rule, warning deadline, authoritative projectile, shipping runtime or deployment changed.
