# Targeting caption placement — 29 September

Model: claude-opus-5-5. Scope: `client/src/styles/game.css`, `client/src/ui/App.tsx`, this report. I did not run any browser, test or build step; root owns QA.

## Defect
In `chromium-08/1280x720-scale150-placement-free-site-pending.png` the audio caption stack was lifted above the targeting card (measured hint height + 22px). That put it at y≈340–388, in the middle of the field and over the placement ghost.

## Change
While targeting, captions now sit in a column to the right of the card instead of above it:

- **game.css**
  - New `:root` token `--fc-targeting-hint-span` = `min((100% − sidebar) × .68, 100% − sidebar − 68px − 150px × scale)`. The targeting card's `max-width` now uses this token. The second term means a caption column of at least 150px (scaled) is always left free, even on narrower fields. It replaces the previous `100% − sidebar − 38px` guard, which it fully covers.
  - `body:has(.targeting-hint) .audio-captions` changes:
    - `left: 44px + span` (card left 24px + span + 20px gap)
    - `right: sidebar + 24px`
    - `bottom: tray-h + 14px` (the same baseline as the card, above the tray)
    - `width:auto; max-width:none; transform:none`
  - Caption `<p>` gets `overflow-wrap:break-word` while targeting. This is only a safety net for very narrow columns. Font size, scale, text and line-height are unchanged, and nothing is hidden or truncated.
- **App.tsx**: Removed the `hintNode` state, the `ref={setHintNode}` on the card, and the `ResizeObserver` effect that wrote and cleared `--fc-targeting-hint-h` on `documentElement`. The layout no longer needs the card's measured height, so that global lifecycle is gone. The `ResizeObserver` inside `useCommandOverflow` is unrelated and unchanged.

## Expected bounds at 1280×720, scale 1.5
Sidebar = 248 × 1.5 = 372 → field = 908.
- span = min(617.4, 908 − 68 − 225 = 615) = **615**
- The card spans x 24 → at most **639**.
- The caption column spans x **659 → 884** (225px wide). A 20px gap separates it from the card, and it ends 24px before the sidebar.
- Both bottoms sit at tray-h + 14px, so the caption grows upward in the lower-right field. "Vehicle crew ready." fits in one or two lines at 22.5px. Longer captions wrap in full.
- There is no horizontal overlap with the card by construction. The top notice is at the top of the field and the command keys, including the overflow tab, are inside the tray below this baseline, so neither can meet the caption.

At scale 1 (and any field ≥ ~681px), the span equals the existing 68% bound exactly. At 1280@150% the card is at most 2px narrower than before.

## Unchanged
- Caption placement when not targeting (the centred rule at `body:has(.battlefield-screen)`).
- Caption font and scale.
- Audio, commands and the text of the card.
- All earlier bounded fixes: locked art, concise reasons, the command-overflow cue, and Awaiting orders wrapping.

## Suggested QA checks for root
- In the placement-pending / blocked / free-site cases, compare `getBoundingClientRect()` for `.targeting-hint` and `.audio-captions`. They should not intersect, and the caption's right edge should be ≤ the sidebar's left edge.
- Check with several captions stacked, to see how high the column grows.

Ownership of `game.css` and `App.tsx` is released.
