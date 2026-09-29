# Presentation fixes — 29 September 2026

Author: Claude, exact `claude-opus-5-5`, one bounded session, no subagents. Implements findings 1–4 and the ability-key guard from `work/claude/29sept-presentation-review/review.md`.

**Scope:** I edited only two files: `client/src/styles/game.css` and `client/src/ui/App.tsx`, both working tree over `ae8a378`.
- I added no dependencies, assets, Go, renderer or art changes.
- I did not stage or commit anything.
- I ran no build, typecheck, test, host, browser or Blender job.
- I viewed two current images: chromium-07 `1280x720-scale150-placement-free-site-pending.png` and `1280x720-scale150-countdown-live.png`.

**Unvalidated:** none of this has been rendered. Root owns validation.

## Changes

### 1. Locked and waiting cameo strips (`game.css` cameo block, `App.tsx` production tile)

- **One-line strip.** The reason strip is now a single line (`nowrap`), sitting directly above the caption. It no longer uses a two-line `max-height` crop.
- **Short visible tag.** When the reason matches a known readable string, the strip shows a short tag through `data-tag` → `::after`, for example `🔒 Needs building` or `Wait · Credits`.
  - The table (`REASON_TAGS`) is keyed by `reason(code)` from `labels.ts`, so it follows the same text the controller already shows.
  - Unknown reasons show the full text with an ellipsis.
- **Full reason kept.** The complete reason stays in:
  - the button text, in a visually hidden `.reason-text` span, so `.disabled-reason` `innerText` is unchanged and the advice-recovery `'Options unavailable'` assertion still holds;
  - the existing `title`.
  - The generated tag uses `content: … / ''` so it is left out of the accessible name.
- **Art stays visible.**
  - Locked art is dimmed with `grayscale(.9) brightness(.72)`, replacing the near-black `.55`.
  - Waiting art is slightly desaturated.
  - The strip covers only the lower edge of the art.

### 2. Command overflow cue (`App.tsx` `useCommandOverflow`, new `.command-overflow` CSS)

- **What it shows.** Two small brass tabs sit in the tray's existing 26 px right margin, outside the key well and clear of the sidebar:
  - `▲ N` means N keys are hidden above.
  - `N ▼` means N keys are hidden below.
- **How it is measured.** Counts come from the actual child rectangles against the scrolled well. After scrolling to the bottom, only `▲` shows; at the top, only `▼`.
- **Test hook.** The well also gets `data-overflow="above|below|both"`.
- **Update path.**
  - The hook uses a `ResizeObserver` on the well, a `MutationObserver` for command-set changes and a passive `scroll` listener.
  - Updates are coalesced to one `requestAnimationFrame`.
  - It writes DOM attributes only, never React state.
  - Cleanup cancels the frame, disconnects both observers, removes the listener and clears the attributes.
- **Motion.** No animation or transition, so reduced-motion and reduced-flashing are unaffected.
- **Replay console.** Handling is unchanged: one stable `useCallback` ref sets `replayHost` only in replay, and the cue is not rendered in replay.

### 3. Empty-selection heading

- `Awaiting orders` gets `.awaiting-orders`, which wraps whole words onto two lines. Unit-name headings keep their ellipsis.
- `Right-click` is wrapped in `.nowrap` so it no longer breaks at the hyphen. The visible text is otherwise identical.

### 4. Compact placement and target guidance

- **Width.** The card is left-bound and shrinks to fit. Its maximum width is 68% of the battlefield, so it no longer stretches across the whole field.
  - The existing guarantee that the card never reaches the sidebar is kept.
  - The old appended `right:` rule and the two stale caption-lift rules were removed and replaced.
- **Layout.**
  - Row 1: icon, title, then cost and `Power after build a/b` as nowrap amber facts that wrap as whole units, then Cancel.
  - Row 2: the actual reason, in full, never truncated.
- **Reason wording.** The reason is driven by `data-verdict`:
  - Rejection (`blocked`): the actual reason in copper, with a copper left rule.
  - Indeterminate (`pending`): "The host will check this when the order executes." in amber.
  - A clear preview no longer reads "Accepted.". It reads "Preview clear · the host confirms when the order executes."
  - No reason yet: "Choose a visible site."
  - Non-build targets keep their existing text.
- **Cancel shortcut.** The inline "· Esc cancels" moved onto Cancel as a `kbd`.
  - It is read from the actual `escape` binding and gets `aria-keyshortcuts`.
  - The `kbd` is `aria-hidden`, so the button's name stays "Cancel".
- **Captions.** They now sit 8 px above the card's measured height instead of a fixed 110 px estimate.
  - A `ResizeObserver` writes `--fc-targeting-hint-h` on the root.
  - The property is removed on cleanup.
- **Expected size at 1280×720 / 150%.** I estimate about 3 short rows at roughly 620 px wide, compared with 3 rows at about 870 px before. A true single line is geometrically impossible at 150% with cost, power and a full host reason. I kept all three rather than ellipsizing.

### 5. Ability keys

- They use exactly the same guard as regular commands: `disabled={battle.pending||!!snapshot?.countdown}`.
- They get the same `active` treatment while their own targeting is live.
- A restrained 3 px brass left rule (`.ability-key::before`) marks them as a group; it is dimmed when the key is disabled.
- Commands sent are unchanged. There is no new legality inference, and host errors are still shown.

## Checks for the root validation lane

- **Tests that read changed text.** `tutorial-product.mjs` and `strike-product-browser.mjs` read the hint text.
  - It no longer contains "Esc cancels"; it now ends with "CancelEsc" in `textContent`.
  - A clear preview now says "Preview clear…" instead of "Accepted.".
  - I found no assertion on either string.
- **`production-cameo-layout.browser.mjs` fixture.** It uses raw reason markup without `data-tag`, so it exercises the full-text ellipsis fallback. Its overlap assertions should still hold.
- **Visual inspection needed at 1×:**
  - BASE locked tiles at 1600×900@100% and 1280×720@150%.
  - `placement-free-site-pending` at 150%.
  - An 11-key selection at 150%: `1 ▼` visible, then `▲ 1` only after scrolling.
  - `countdown-live` and `replay-end` at 150%.
  - Firefox and WebKit rendering of `content: … / ''`. Browsers without it fall back to the plain `attr()` declaration.

## Limitations

- This is unrendered and untypechecked by me.
- The tag table covers the common production codes only. Other reasons show the ellipsized full text; the full text is still in `title` and accessible text.
- The overflow tabs are decorative (`aria-hidden`). The well's aria-label still says "scroll for more actions" whether or not anything overflows.
- Item 5 of the review (the raw rejection code in the notice) and items 7–10 (fog, terrain, ambient effects, SA fallbacks) are untouched and remain with their owners.
- This does not certify final art or the game.

## Ownership

I release `client/src/styles/game.css` and `client/src/ui/App.tsx` back to root. No other files were written apart from this report.
