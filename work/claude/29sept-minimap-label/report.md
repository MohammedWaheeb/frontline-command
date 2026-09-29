# Minimap readiness, camera invalidation and command-label fit — 29 September 2026

Author: Claude, exact `claude-opus-5-5`, one session, no subagents or fallback.

**What I ran:** I launched no browser, host, build, typecheck, test or Blender. The only command I ran was a local Python read of the Barlow Condensed Bold `hmtx`/`cmap` tables, to measure label widths.

**What I edited:** `client/src/ui/App.tsx`, `client/src/styles/game.css` and `client/src/render/battlefield.ts` (a small minimap API). I did not touch Application, BattleController, tests, assets, Go or content.

**Scope:** I read BattleController `mount`/`frame`/`dispose` read-only. These fixes come from my v21 review findings A and B (`work/claude/29sept-v21-review/review.md`). Nothing here claims that v21 passes, or that the Application replay-HUD fix applies to v21 after the fact.

## 1 + 2. Minimap: renderer-owned attached canvas

### `battlefield.ts`

**New public API: `attachMinimap(canvas): () => void`**
- It replaces any earlier attachment and paints immediately if a snapshot exists.
- It observes the canvas with its own `ResizeObserver`.
- It returns a detach function. That function does nothing if a different canvas has attached since.
- On a disposed renderer, `attachMinimap` does nothing.

**Private `paintMinimap(now)`**
- It runs at the end of the existing `render()` Pixi ticker callback. I added no new timer, rAF loop or React state.
- It compares a camera key: `camera.x`, `camera.y`, `zoom`, `screen.width` and `screen.height`.
- This key changes when the player:
  - pans with the pointer, keyboard or edge-scroll;
  - zooms;
  - calls `center()` (minimap click, HQ/facility/alert/group recall);
  - resizes the window.

  It changes whether or not the simulation is paused, because the ticker keeps running.
- It repaints only when the key changed or the minimap is otherwise dirty, and at most once per 80 ms (`MINIMAP_MS`). Idle frames do a five-number compare and no drawing.

**What marks the minimap dirty:**
- `setSnapshot`, through `refreshTactical`, so every snapshot, replay seek, fog change and rubble change;
- `setSelection`, through `refreshTactical`, because tactical overlays appear on the minimap;
- `setStrikePreview`;
- `setMissionMarkers`;
- `updateSettings` (palette);
- a canvas resize.

**Disposal:** `dispose()` detaches the minimap. The observer is disconnected and the canvas reference is dropped, so a disposed or stale renderer can never paint a canvas again.

**Unchanged:**
- `renderMinimap` and `minimapPoint` behave exactly as before, so the render fixtures that call them directly still work.
- Fog authorization is unchanged: the minimap still uses only `snapshot.visible`/`explored` and snapshot entities.
- Map and picker geometry are unchanged.

### `App.tsx` (Battlefield)

- **Mount effect:** it now calls `setSceneLoading(true)` at the start of every controller mount. Only that mount's own non-canceled `finally` sets it to false, so a stale controller cannot clear the new controller's loading state.
- **Removed:** the snapshot/strike-review-driven `renderMinimap` effect.
- **New attach effect:** `useEffect(() => … control.renderer?.attachMinimap(canvas), [control, sceneLoading])`.
  - It attaches only once readiness is real: `sceneLoading` is false and the renderer exists.
  - Its cleanup is the detach function.
  - A paused initial snapshot (imported save, replay, command-lost countdown) reaches the renderer through the controller's `transport.current` replay at mount. `attachMinimap` then draws it immediately, even if no later snapshot ever arrives.
  - Replacing the operation in the same App gives a new `control`. The old renderer is disposed, and with it the old attachment. The new renderer attaches after its own mount.
- **Settings:** `updateSettings` also depends on `sceneLoading`, so a settings change made while the scene was loading reaches the renderer once it mounts. This is a one-line hardening in the same pattern as the existing `setRangeMode` effect.

## 3. Command and ability label fit (`game.css`)

Label widths measured from Barlow Condensed Bold at 12 px with `.02em` spacing:

| Word | Width at 12 px (100%) | Width at 18 px (150%) |
|---|---|---|
| COORDINATED | 62.2 px | 93.3 px |
| SKYBREAKER | 58.4 px | 87.7 px |
| SATURATION | 56.5 px | — |
| ATTACK-MOVE | 64.2 px (can break at the hyphen) | 96.4 px |

The old 64 px × scale column left about 58 px of label width. On ability keys, the 3 px brass rule also covered the first letter.

Changes:
- **Column floor:** the command well minimum is now `calc(74px * var(--fc-ui-scale))`, up from 64.
- **Ability keys:** `padding-inline: 7px 2px`, so the brass rule plus its 1 px shadow ends 3 px before the text. Letter-spacing on ability keys is now `0`.
- **Resulting label space:**

  | Scale | Ability label space | Longest ability word | Ordinary label space |
  |---|---|---|---|
  | 100% | ≥ 63 px | COORDINATED ≈ 59.8 px | ≥ 68 px |
  | 150% | ≥ 100 px | — | ≥ 105 px |

- **Font size:** unchanged at 12 px × scale.
- **Wrapping:** label spans have `max-width: 100%; overflow-wrap: break-word`. Labels wrap between words, and a word breaks only if a wider fallback font ever appears. Text never spills under the rule or past the key.
- **Unchanged:** hotkey `kbd` placement, the brass rule, the overflow tabs, whole-row scroll snap, and the replay console.

## Unresolved limitations and what root should check

- **Unverified:** nothing here has been typechecked, built or seen in a browser. Root owns typechecks, the focused regressions and all browser cases.
- **Fewer visible columns:** the wider floor can drop the well by one column at some sizes, most likely 1280×720 at 150%. More keys then sit behind the existing brass `N ▼` cue instead of being clipped.
  - Please check that the overflow count matches the hidden keys.
  - Please check that every label has `scrollWidth ≤ clientWidth` at 1280×720, 1600×900 and 1920×1080, at 100% and 150%. At 150%, check after scrolling to the last key.
- **Two-line labels:** vertical space was not changed. Two-line labels still use the existing row height, the same as v21. I found no label that needs three lines at the new widths.
- **WebGL context loss:** while the context is lost, `render()` returns early, so the minimap keeps its last frame until the context is restored.
- **No early minimap:** the minimap stays blank while "Loading battlefield art…" is shown, because it attaches when the controller's mount promise settles. Painting earlier would need a controller hook, and I did not edit BattleController.
- **Suggested checks for root:**
  - After mount in `countdown-live`, the minimap canvas is not uniformly `#0b0c08`.
  - While paused, pan with the keyboard or wheel, or click the minimap. Within about 100 ms, the canvas pixels at the view box change.

## Ownership

I release `client/src/ui/App.tsx`, `client/src/styles/game.css`, `client/src/render/battlefield.ts` and this directory.
