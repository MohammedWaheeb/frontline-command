# Copper Junction: bounded authored scenery acceptance

The approved ten-entry pilot is implemented for Copper Junction only. Two pylons
occupy existing blocked height-3 plateaus, six scrub patches occupy existing
cover, and the two original garrisons use the ruined-house skin. No Go map,
mission, collision, cover, visibility, resource, ownership or objective data was
changed. Each pair is reflected exactly about the map center.

The map remains SHA-256
`9ce72f0cbb236557ad75e37feed6c2aa7f5726e6f77cd61803eb84d0b1545057`.
The sole optional index descriptor is:

```json
{"url":"/content/environment/copper-junction.json","sha256":"e2995ab0f5cecc294ba85eb7d51bd60057c5fe4e944746b05997c78e045d19ef","bytes":1977}
```

`content/index.json` was already an untracked full shipping index. Root owns its
initial checkpoint; this lane changed only this descriptor and checkpoints the
sidecar, tests and documentation separately.

## Actual product and simulation evidence

`client/tests/render/environment-authored-browser.mjs` builds an isolated product
and bundles a test entry around the actual React `App`, `Application`,
`ContentLibrary`, `SessionController` and `BattlefieldRenderer`. A fresh temporary
headed Chromium profile clicks through onboarding, Skirmish, Copper Junction,
zero AI commanders and deployment. Subsequent acceptance orders use that actual
product session's ordinary public Go transport; these orders are automated, not
claimed as a complete mouse-driven gameplay acceptance. The engine stays under
standard-v2 rules with the ordinary starting economy and no injected actors,
visibility, credits, damage or practice commands.

The run uses Go simulation **0.3.3**, seed **249030696**, Chromium
**151.0.7922.34**, and WASM SHA-256
`4e67eebdd53c6ce588c14f0f01b54c236e193feacfbd2936bed0af4002a45efa`.
The initial exact save is also loaded into an independent renderer-free Go worker.
Both receive identical ordinary orders and tick advances. All **21 checkpoints**
have identical hashes, including actual save restoration in the mirror.

| Actual action | Tick | Proof |
|---|---:|---|
| Complete paid power, supply, hauler, barracks, recon and rifle | 2599 | Prerequisites, real construction/production queues, costs and hauling remain active. |
| Traverse west cover and board original garrison 3 | 3007 | Rifle's owner-private container is the actual garrison; no fake occupant. |
| Complete paid radar, second power, airfield and fighter | 5957 | Ordinary prerequisite, power and economic chain. |
| Scout west/east plateaus by fighter | 6079 / 6201 | Pylon centers actually visible; undiscovered nodes absent at opening. |
| Traverse remaining four cover locations | 6969 | Real recon position reaches each ordered location; no scenery collider. |
| Scout original east garrison | 7211 | Original object ID 4, unmodified footprint and state. |
| Complete paid factory and tank | 8835 | Ordinary production and Supply. |
| Damage east ruin to 455/1000 visual health | 9839 | Real tank attack, damaged skin, no direct HP mutation. |
| Destroy east ruin | 10199 | Go rubble object 4 selects the same ruined-house skin. |

There were 27 ordinary submissions: 26 accepted, one correctly rejected with
`mandatory_corridor`. Build previews are deliberately fog-safe and
`indeterminate`; the driver records actual execution receipts and retries rather
than interpreting advisory acceptance as guaranteed geometry. The final state
hash is `b2bc4e4cad9d6b7deff581743820fdbe7159228051656e33d9de0263f71ef0d2`.
Final balance is 8,350 credits after genuine income and purchases.

The negative path supplies a mismatched sidecar response to the real loader. It
emits “Optional scenery unavailable: Optional scenery differs from its installed
checksum.”, loads Copper Junction, and returns no optional environment. The original run exposed an 8-second notice timeout during long asset preflight.
Root fixed that timing in `26e20f6`; a focused actual-product rerun now confirms the
checksum warning remains visible after preparation and battlefield mount, with no
browser errors. Its report and screenshot are in
`work/evidence/environment-authored/notice-after-loading/`. The fallback mount naturally
resumes for a few ticks, so its post-mount hash is not asserted against the paused
opening tick. Exact same-tick scenery/no-scenery parity is proven separately at
all 21 checkpoints. Leaving the session removes every battlefield canvas.

## Evidence and limits

Evidence lives in `work/evidence/environment-authored/`:

- `browser.json`: compact final results, exact orders/receipts and all hashes;
  no browser errors.
- `opening.save.json`, `paid-opening-final.save.json` and
  `paid-opening-final.replay.json`: exact bytes produced by Go, never roundtripped
  through JavaScript engine-state JSON. Large generated files are not committed.
- `occupied-west-ruin.png`, `west-cover.png`, `west-plateau.png`,
  `east-plateau.png`, `east-cover.png`, `east-cover-1280.png`, `east-ruin.png`,
  `damaged-east-ruin.png`, `destroyed-east-ruin.png`,
  `mismatch-safe-fallback.png`: actual product pixels at 1600×900 and the named
  1280×720 view. Pylon contact, preserved cover gaps, usable garrison entrance and
  damage/rubble state were visually inspected.

This is a functional one-map pilot, not a balance certificate, complete map-art
review, proof that every game order is usable by mouse, or completion of the
remaining 31 maps' optional dressing. Existing terrain crack repetition and fog
edge aesthetics are unchanged and remain visual review items. Aircraft/building
roster fallback status remains visible and separately tracked by the art lane.

Validation: both TypeScript checks, strict isolated fixture typecheck, and the
current 233 runtime tests passed. The added authored contract test verifies the
exact map hash, descriptor integrity, ten-entry count, reflected positions and
skin object classes. It does not replace Go gameplay acceptance.

Reproduce from the repository root:

```sh
node client/tests/render/environment-authored-browser.mjs
npm --prefix client run typecheck
npm --prefix client run typecheck:app
npm --prefix client run test:runtime
```

`FRONTLINE_ENV_ONLY_NOTICE=1` runs just the opening and checksum-fallback path,
without repeating the paid gameplay sequence.

`FRONTLINE_REUSE_PRODUCT=1` skips only the static packaged asset copy during local
harness iteration; the test entry is still rebuilt. Omit it for a clean run.
