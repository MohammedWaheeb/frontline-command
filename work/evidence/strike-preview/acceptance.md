# Skybreaker review evidence

Capture: 2026-09-28T09:53:29.583Z; **passed**.

Actual product: `Frontline Command` at `http://127.0.0.1:64103` (ephemeral test server closed). Headed Chromium `151.0.7922.34`; 1600×900 and 1280×720.

Isolated optional-wire runtime: `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/work/tactical-wire-candidate/runtime`.
WASM SHA-256: `7b5c451ed5b5ee759eb1e25f3f58a429d4973b127d7dd31312a2d1f66f6448d1`.
Simulation metadata: `0.3.3`; protocol `1`; Go `go1.27.1`. This is an isolated optional-view/advice candidate, not promoted shipping code.
Go practice setup hash: `19e2cb5a16ac3f9dacc47ec575de0ae1e0a3bf4a0081648722b92c57ffb46df4` at tick 3726.

Confirmed North strike: tick 3962 → 3974; credits in mills 100000000 → 98800000 (1,200 credits spent). Exactly one submitted strategic order. No orders submitted before explicit keyboard confirmation, during Retarget, Escape, Cancel or selection invalidation.
Replay end inspected at tick 3981 with actual strategic site selected; strike controls absent, no extra orders; rewind removed future warnings.
Page errors: 0; console errors: 0. Failed resource requests: 0.

Validation: both project typechecks, strict setup-fixture compilation, 268/268 runtime tests (five new preview/review cases; root actor-status tests included), actual product browser course. No max-load or rendered LAN claim.

Source SHA-256:

- `client/src/runtime/types.ts`: `dda0e8dfc20461f0661e9af0736a6a9b077c5dca3bde76a2208974bb2afc13fe`
- `client/src/runtime/advice.ts`: `a716d5a35d177c51ded10a77a47d5dc7808ae21c21e6cd75682abfbf5eaedbe4`
- `client/src/runtime/offline.ts`: `b54f0187ae0d196d20ce73fac2dbf2bc21d040b908674e6414783deee6630f84`
- `client/src/runtime/operation-preview.ts`: `d5a47dfbe56ce5ec6665e21c2f852448a77378e3906fae5ab0fd3c43b0f214a0`
- `client/src/app/strike-review.ts`: `0c05dc8e04e1825b53d6f5ae4cb03619caebeb371fdae80bd5c34ac91a1d676b`
- `client/src/app/battle-controller.ts`: `87445ddd6226827f4c01730ea3c4d437adb761b0ad3f03579e517be57cf26453`
- `client/src/render/strike-preview.ts`: `0b05ca0ac93cb8ed09ffe494ef48f4efeafa6b679e88ae4d18ef9644d1e64955`
- `client/src/render/battlefield.ts`: `5bd5ceb3a9286909a89ca1b254ebc02c36a8c5c6c7eda66ffdb67de4816730ec`
- `client/src/ui/StrikeReview.tsx`: `747a800dd7150549058d64717472780861bf7a1375b5f216d030c6651db61d80`
- `client/src/ui/strike-review.css`: `037fa71a1c0478b1acc12437c4837eb8ef937436b0717cd0ab198e21a8b2fcc1`
- `client/src/ui/App.tsx`: `c6c21a3fc713759f34569c7782717182824d63fb0caa6cfa93320daf968619c4`
- `client/tests/render/strike-setup.ts`: `e07dffe50d6a22ceb57cce56e78665fc3b8ccdacca17e5ce12c932ee9d50ff1d`
- `client/tests/render/strike-product-browser.mjs`: `3070b5fd43bf5c6a2b0ca83d652183b9cfaa8761f4ea811b4363ff39072bb440`

Native captures in this directory: `review-west-1600.png`, `review-north-1280.png`, `confirmed-authoritative-warnings-1280.png`, `replay-read-only-1280.png`. Screenshots/raw JSON/save/replay remain local evidence; only this compact Markdown record is checkpointed.

See [contract, reproduction and limitations](../../../docs/skybreaker-preview.md).
