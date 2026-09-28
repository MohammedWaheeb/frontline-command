# Authorized tactical overlay acceptance

The renderer now uses real world-space blast/zone geometry, simulation deadlines, distinct raid exits and transfer destinations, and private queued order intent. This closes the fixed-pixel warning and minimap omissions identified by the [original audit](tactical-presentation.md). It does **not** complete the 132-effect art manifest or all actor-status/range presentation.

## Implementation and privacy

- `BattlefieldRenderer` caches the pure descriptor on snapshot/selection changes. `TacticalOverlay` caches graphics/text geometry by that descriptor, terrain surface, zoom and team palette. Its paused-frame check observes no rebuild. The existing actor, hull/turret, flight, terrain, fog and shadow algorithms remain unchanged.
- Known blast radii and scan/shieldline zones are sampled in millitiles and projected through `TerrainSurface.projectGround`. Strokes, symbols and caption fonts stay a readable screen size. A blast field is not a center-distance hit guarantee: Go still accounts for the target's physical edge.
- Every warning retains its own identity and rounded-up, simulation-tick deadline. Six saturation markers at three paired points retain six stacked captions and both wave deadlines. A pending volley says **Next launch**, not impact. A late or paused operation remains until the authoritative snapshot removes it.
- Raid destinations have exact disclosed exit squares. Transfer destinations have a diamond only; their hidden source and collision-tested exits are never reconstructed. Preparing/active zone captions derive from `start`/`until`. Publicly warned terrain remains fogged; warnings do not change visibility.
- Projectile bodies use only unambiguous currently disclosed positions. On runtime 0.3.3, a hidden warning body may be replaced by its impact position; the conservative equality fallback withholds ambiguous bodies. Unknown strategic splash remains a point and ETA, never a made-up radius.
- Own selected orders show queue number plus a command symbol: `M` move, `A` attack, `AM` attack-move, `F` force-fire, `G` guard/escort, `R` Return, `P` patrol, `U` unload, `B` build, `C` capture, `+` repair and `$` gather/salvage. Rally uses a flag. Lines are order intentions, not computed paths; unknown targets have no line to the origin or stale memory. Blocked first orders retain the existing crossed marker.
- Authorized team pings use steady diamonds for at most 60 simulation ticks. A baseline suppresses prior events after replacement/perspective change/backward seek and survives a subsequent selection-only refresh. History is bounded to 32 entries; disposal clears it.
- Endgame structure pulses are **minimap-only** `!` diamonds. They create no world marker, entity, selectable target, fog reveal or health information. Warnings/zones/pings also use the same minimap projection and map clip.
- Essential geometry is steady under reduced motion, reduced flashing and color-vision-safe team palettes. It is independent of cosmetic particle budgets. A caption can be outside the viewport when its destination is offscreen; the minimap indicator remains. This is not an edge-of-screen HUD alert implementation.

## Actual Go browser course

The flow under test is: isolated battlefield loads → recorded Go practice setup → ordinary charge/paid ability/orders → authoritative snapshot → rendered warning/order/minimap result → pause/save/replay/disposal verification.

`client/tests/render/tactical-fixture.ts` creates a clearly synthetic 64×64 map with a raised plateau. Practice spawn/resources establish the infrastructure; subsequent charging, costs, missiles, boarding, transfer, visibility and pings use ordinary Go commands. No JavaScript snapshot/state victory is fabricated. This is **presentation acceptance**, not a paid build-order, economy, balance or full product-menu journey.

| Actual scenario | Tick | Verified rendered/authoritative result |
|---|---:|---|
| IR banked tactical volley | 4334 | Two 2,000-millitile areas; first impact 8 s, banked launch 2 s; first launch spends 300 credits |
| Opposing perspective after launch reveal expires | 4486 | Hidden launcher absent, no own order descriptor, foreign command rejected `not_owner`; public impacts remain, hidden body withheld |
| Saturation | 4556 | Six separate captions for two waves at three points; 1,500 credits spent; unknown strategic radius is point-only |
| Recon Sweep | 3730 / 3771 | Exact 9,000 radius; preparation changes to active from Go ticks |
| Skybreaker | 3953 | Three authorized impact points/ETAs; route and exact radius remain unavailable in 0.3.3 |
| Shieldline | 3734 / 3975 | Exact 10,000 radius, preparation then active expiry; 1,000 credits spent; reduced-effects descriptor unchanged |
| Raid | 4336 | Two houses, each with two actual reserved exit points and 12-second deployment caption; 1,200 credits spent |
| Safehouse transfer | 4706 / 4767 | Destination-only warning during final 3 seconds, then removed after real arrival |
| Own move, attack-move, patrol, rally and ping | 3738 | Distinct numbered markers at 1280×720; actual Advance 10 ticks button changes Go tick |
| Endgame pulse | 42000 | One minimap indicator while enemy headquarters remains absent and its terrain unexplored; no world warning |

The banked-volley checkpoint reloads to the identical Go hash. Its live replay seeks 0 → 4334 → 0 → 4334, with no future labels at zero and identical endpoint hashes. Export after loading that save starts a **new recording at tick 4334**; it records through 4346 and successfully seeks both declared bounds with matching hash. Pause retains the exact hash and warning deadlines.

Raw proof is retained locally in `work/evidence/tactical-overlay/volley.save.json`, `volley-live.replay.gz`, `volley-restored.replay.gz`, and `browser.json`. These bulky/raw artifacts are not part of the source checkpoint. The compact [evidence record](../work/evidence/tactical-overlay/acceptance.md) records exact source/runtime hashes.

## Browser QA

Browser plugin not available; the existing installed Playwright workflow was used with isolated headed Chromium 151.0.7922.34 on localhost. Viewports are 1600×900 and the game's desktop minimum 1280×720. No mobile game layout or Firefox/WebKit tactical visual acceptance is claimed. The ephemeral URL, title and browser version are saved in the evidence record; the server/browser are closed after the run.

| Check | Result |
|---|---|
| Correct page identity | Pass: Tactical warning acceptance, isolated localhost URL |
| Meaningful rendered content / no framework overlay | Pass: inspected native battlefield, captions, controls and minimap |
| Page/console errors | Pass: zero |
| Interaction | Pass: visible Advance 10 ticks control changes authoritative tick |
| Native screenshots | Pass: raised-ground circles, six salvo captions, exact raid exits, transfer, reduced effects, queued orders, hidden-enemy and endgame controls |
| Pause / cache | Pass: same Go hash/deadline; no graphics rebuild during a paused 250 ms observation |
| Save / replay / rewind | Pass: matching hashes at legal recording bounds; no future warning labels at initial tick |
| Disposal | Pass: zero battlefield canvases, resident art pages/bytes, labels and ping history |

Native screenshots inspected (all under `work/evidence/tactical-overlay/`):

- `banked-volley-raised-ground.png`
- `six-salvo-markers-distinct-deadlines.png`
- `raid-exact-exit-markers.png`
- `shieldline-active-reduced-effects.png`
- `orders-rally-and-ping-1280.png`
- `endgame-pulse-minimap-only.png`

The existing renderer regression also passes all **14** check groups: minimap coordinate mapping, lazy art, illustrations, selection/box selection, real weapon destruction/rubble, rewind, reduced-effects feedback, deploy/pack and building poses, actual aircraft flight/service transitions, graphics-context recovery, repeated disposal, and hull/shadow composition. It reports zero errors and four expected `ReadPixels` GPU-stall warnings from pixel assertions. Aircraft crash in that suite uses explicit `practice_remove`, not a combat kill. Current accepted art plus development fallback buildings is visible; this does not certify finished roster art.

## Reproduction and limits

```sh
npm --prefix client run typecheck
npm --prefix client run typecheck:app
npm --prefix client run test:runtime
node client/tests/render/tactical-browser.mjs
node client/tests/render/browser.mjs
cd client
./node_modules/.bin/tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable --strict --skipLibCheck tests/render/tactical-fixture.ts
```

Both typechecks, strict isolated fixture compilation and **256 runtime tests** pass, including 11 descriptor and five geometry/ping-lifecycle tests. The runtime suite reads the real Go catalog and manifest; it does not reimplement gameplay. The stable compact renderer report is `work/evidence/tactical-overlay/renderer-regression.json`.

Three earlier harness assumptions were corrected without engine changes: launcher reveal legitimately persists for six seconds after a shot; a recording resumed from a save cannot seek before its declared start; and a newly created skipped-countdown session already begins at tick 100, so the endgame test advances *to* 42000 rather than adding 42000. A missing test-only player name was caught by strict compilation and corrected. The final source-specific run passes.

Remaining work is explicit: optional authoritative projectile splash/body visibility, operation splash and active-effect/emergency deadlines await the root wire candidate; selected advisory ranges and most actor-status descriptors are not mounted in this slice; owner Skybreaker route/three-target review is a separate upcoming integration; detailed impact outcomes, effect art and all 132 manifest assets remain incomplete. No 688-actor performance claim, strategic aircraft-loss/reconnect acceptance or full release readiness is made here.
