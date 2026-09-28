# Actor atlas eviction lifecycle regression

The long 0.3.4 candidate multiplayer course exposed a real renderer failure:
`Cannot read properties of null (reading 'addressModeU')`. The original visual
run is failed; subsequent repair evidence does not replace it.

## Cause and bounded correction

`ArtLibrary.trim()` correctly destroys frames and unloads pages unused for ten
seconds when decoded residency exceeds its budget. Culled `ActorVisual` objects
retain their last Sprite texture. On reappearance, the previous implementation
requested the missing page again but continued drawing that stale texture until
its asynchronous load completed. Pixi then tried to bind a destroyed texture
source whose style was null.

The correction is confined to `client/src/render/actors.ts`. Both current and
previous poses must resolve through the sheet's current resident frame table.
While neither frame is resident, that layer is hidden and detached to
`Texture.EMPTY`. A valid old pose remains usable during a different animation's
upload. A missing authored layer stays hidden. Cache budgets, eviction timing,
art resolution, fog/ownership, simulation, and missing-art reporting are
unchanged. There is no exception handler or render-loop error suppression.

## Deterministic browser regression

`client/tests/render/atlas-lifecycle-fixture.ts` uses the actual authorized
US infantry snapshot at tick 19,356 from the failed FFA and its frozen authored
atlas bytes. Its companion is another genuinely present own infantry actor.
No game state is changed: this is a renderer lifecycle fixture, not gameplay.
The fixture advances only its presentation/cache clock to avoid a slow sleep.

`client/tests/render/atlas-lifecycle-browser.mjs` verifies:

- Resident actor pixels, then explicit old-page eviction and immediate redraw
  before asynchronous reload.
- Two actors sharing one sheet; the visible actor refreshes that page's age.
- Four rapid recull/reload cycles, without drawing destroyed textures.
- Real `ArtLibrary.trim()` above its unchanged 192 MiB budget: 70 actual pages,
  217,873,192 decoded bytes, all stale pages evicted, actor frames reloaded.
- Genuine absent-sheet reporting remains `missingArt:true`, `standIn:false`.
- Disposing while page loading is pending returns resident pages/bytes to zero.

The baseline failed with the same Pixi stack in `applyStyleParams →
GlTextureSystem.updateStyle → bindSource → GlBatchAdaptor.execute`. Its exact
bundle/source map, stack and native screenshot remain under
`work/multiplayer-combat/texture-lifecycle/2026-09-28T12-04-40.814Z/`.
The corrected pressure courses passed Chromium, Firefox and WebKit with zero
page/console errors. Native before/after images were inspected. Evidence directories:

- Chromium: `2026-09-28T12-10-56.245Z`.
- Firefox: `2026-09-28T12-11-13.128Z`.
- WebKit: `2026-09-28T12-11-48.882Z`.

All are below `work/multiplayer-combat/texture-lifecycle/`.
The application typecheck also passed. The earlier Firefox fixture's
missing-charset warning is preserved; the fixture now declares UTF-8 explicitly.

Browser plugin was unavailable. Tests use installed Playwright and isolated
browser contexts, not a user profile. These tests make no FPS, final artwork,
or physical LAN claim.

## Interrupted long-match evidence

The original live FFA reached the renderer failure before tick 20,824. It later
reached tick 25,204 when a late diagnostics attachment used a Node-inspector
`import()` that lacked a VM dynamic-import callback. That independent harness
fault terminated its Node runner. The Go host survived, finished ordinary
elimination at tick 25,826, persisted the result/replay, and was then stopped.
No clean rendered completion is claimed for that interrupted course.

The exact replay is
`work/multiplayer-combat/2026-09-28T11-34-59.603Z/1h3ai-interrupted.replay.gz`,
SHA256 `d76c2be709ce87c37635f6db2fb11ad08626404a52f55e34392d35aa37a1a9c1`.
Native full replay, final checkpoint seek, and a midpoint save/restore plus
continuation agree at final hash
`5618aa67f13b5bd11f0c141cd4f4c350deb87d81d035a6716a68441e87c1f664`.
The human remained alive and the three opponents lost through ordinary defeat
countdowns. No surrender, practice grants, save mutation or forced damage was
used. This proves the combat recording, not recovery of the failed visual run.
