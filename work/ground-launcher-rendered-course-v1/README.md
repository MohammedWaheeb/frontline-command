# Ground-launcher rendered course — prepared, not executed

`prepared-02` is ready for a separately coordinated browser run. No browser, HTTP host, native simulation, Blender, production source or live asset write was performed in this task. SA is explicitly held until its full art handoff is accepted. This is a component presentation course, **not ordinary paid-opening, multiplayer, balance, full-roster or final visual acceptance**.

## Frozen inputs

The source snapshot was taken after live v5 integration `3d196fd` (HEAD at capture `083ae7b1a9ce2fc239df5bc6c1136b0a5b726b97`). Only three private files differ from that snapshot: exact reviewed candidate `actors.ts`, `poses.ts`, and new `ground-launcher-payload.ts`. Current actors/poses had to match the original reviewed baseline before replacement. The current generation-aware ArtLibrary, terrain, feedback, runtime transport and UI sources remain current, rather than inheriting the candidate's older loader.

- Prepared receipt: `5115afa3d9311048206c10344ae992b023832cdee641e36e16bb4d376fce7328`.
- Source lock: `c23c9a52470520df3627ddc10280ed85f155a147cea1f7fc90595bd33b6a6e4a`.
- Fixture bundle: `6676f2d76f640e56e41d3d39afad3734094460a7555905c7cf409c9a7dfa71a6`.
- Browser driver: `b1f95cb8bb24ab7d288d56d16883dca88f9afa776a2027defc3bb3dbe6143c64`.
- Rebuilt private pack: `080ddd51d13244658c7292c00f8c65fe22dfc0c905201e25c9e749644c623e8b`, 660,491,461 encoded bytes. Uses the actual production `writeBasePack` with an updated exact content-index pack version.
- Go simulation **0.3.4**, content `318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`. Current live WASM `d1d7b97deaa4c73f58ba8b8035858d524d24c64d5c52f4ce4e71bcd47dbdb7ae`; worker `ced862a30a9d91dbab59befcf6ea0e4af9dabfc289acffbe7678a6dd33b2bed9`; wasm_exec `0c949f4996f9a89698e4b5c586de32249c3b69b7baadb64d220073cc04acba14`; version `8dae8e5b4addb054083ea188779e6104b5e79ca5846c0e1c4ca7b58bb9709bea`. All exactly match the already qualified native-oracle runtime, without rebuilding or borrowing an old runtime.

Private art is a copy of immutable `work/presentation-fallback-v5/build-01/product` plus the three complete Mencius launcher handoffs. Other roster art remains the base's incomplete mix; only the target launcher is required to have complete authored pixels. No main-menu/App acceptance is implied by this renderer fixture.

| Asset | Actual poses | Handoff files | Handoff SHA256 |
|---|---:|---:|---|
| US launcher | 688 | 141 | `3361620bd33ba183de766b141e4096c1cf907390a39b0e6d092501150f7fc750` |
| IR launcher | 1120 | 225 | `b5a4285dc78f5b2b9b7e5a8e77cceee96476733059b20c0c4718a4add4249284` |
| SY launcher | 688 | 105 | `de11de332394387866e26b585d7fb06a4e240de70ee3f19c6f4d21afcc6d21f7` |
| SA launcher | — | — | Held; no accepted full art candidate |

## Real Go evidence and future checks

The unchanged `work/ground-launcher-runtime-course-v1/native-03` starts with explicitly granted units/resources and three declared damaged-empty branches. All subsequent deployment, shots, packing, movement, cancellation and refills were earned through ordinary Submit/Advance. The renderer does not invent charges, mutate saves or create foreign private fields.

Its original **nine-scenario 92-boundary** receipt remains separate. This subset uses seven scenarios and **73 boundaries**, with **424 original SessionPB wire records** from `oracle-01`: US/IR/SY main, US/IR/SY damaged-empty, and IR canceled second volley. SA main/damaged are not included. Original native failures remain at their original locations.

The prepared runner checks exact runtime hash, save bytes and authorized protobuf bytes before display assertions. It covers load, replay seek, and actual prior-tick replay Step for every nonzero boundary, with perspective set before stepping. The shot cue can restart its cosmetic clock only after a real current authorized `weapon_fired` event; the world/event state is never altered. Static loads retain ordinary current-state poses without fabricated event history.

The actual ActorVisual/BattlefieldRenderer must select the independent expected pose, use its matching real beauty/team atlas frames, retain half-progress deployment/reversed pack frames, and never expose private empty/partial/full charge artwork to a foreign viewer. Real PNG pixels are extracted and hashed at execution. Each quality includes cull/reappearance, reduced-motion preservation, exact disposal and named Go worker closure. Cold generic-to-owned-empty transitions delay only actual HTTP PNG delivery; the old payload body must hide until its real page arrives.

A CPU audit proves generic-idle and empty-idle beauty pages are disjoint for both qualities in all three families, so that pending-page test has an actual cold request. It does not certify the browser's future scheduling or pixel result.

All page, console, HTTP and request failures are retained through final browser close. The final aggregate remains strict: a raw abort is not waived from a loaded scene, native oracle, previous standalone finding, or an inferred cancellation. This course does **not** instrument original-consumer native EOF; any such diagnostic must remain unclassified here.

## Completed preparation checks

- Full source/fixture strict TypeScript: pass.
- Existing candidate actor/aircraft/launcher/pose regressions: **21/21 pass** against the combined current source.
- Rebundled browser fixture: pass.
- CPU exact graph audit: **222 atlas pages, 14,880 frame rectangles** inside actual PNG dimensions, aliases/progress declarations valid, every referenced byte included in the hash-verified pack.
- Four negative admission controls reject missing path, traversal, truncated bytes and same-size changed bytes.
- Plan references original protobuf files on demand: **127,918 bytes**, rather than retaining all full snapshots concurrently.
- **No browser result exists yet.** No subjective native screenshot review or GPU budget is claimed.

`prepared-01` is preserved as the first successful build/typecheck receipt. Its 101.7 MiB plan duplicated raw views and oracle JSON; it was never run. `prepared-02` removes that unnecessary retention while preserving all original binary comparisons. Do not execute or relabel `prepared-01`.

## Smallest next browser slice (only after lane release)

Run from repository root:

```sh
node work/ground-launcher-rendered-course-v1/browser.mjs \
  --prepared work/ground-launcher-rendered-course-v1/prepared-02 \
  --out work/ground-launcher-rendered-course-v1/chromium-us-standard-01 \
  --engine chromium --scenario US.launcher --quality standard
```

Then add the other scenarios/quality only after preserving and inspecting that first result. Omit `--scenario`/`--quality` for the entire prepared subset; it is not necessary for the initial bounded validation. Chromium/Firefox/WebKit are supported by the driver, but none has been launched for this course. The executable/version is recorded by every future run; same-host browser contexts are not physical-device acceptance.

Reproduce source-only preparation under a **new** label with `node .../prepare.mjs prepared-N`; never overwrite a prior output. `audit.mjs prepared-N` performs only CPU integrity checks. Product/source trees are local frozen artifacts; the committed receipts and helper sources pin their bytes.

## First executed subset

The subsequent US-standard Chromium run is documented in `browser-us-standard-review.md`: 42 render boundaries and 22 replay views functionally passed, but strict status remains FAILED on 35 raw request diagnostics. Attempt01's Playwright import failure is preserved; `browser-v2.mjs` fixes only the test import. No other faction/quality/engine has run. The native review also records an unexplained bottom-left black capture rectangle; no blanket visual acceptance is claimed.
