# UI polish v4 — source-only authoring report, 29 September 2026

**Author:** exact `claude-opus-5-5`, no fallback. I did not use Bash, a browser, Blender, a subagent or any other model.

**Status:** these edits are private, unaccepted candidate source.
- **TypeScript, runtime tests and browser tests were not run.**
- No native capture was taken.
- Nothing here is native acceptance.
- Root owns compilation, tests, captures and review.

**Inputs:**
- `AGENTS.md`
- `work/claude/29sept-integration-review-v3.md` (P1–P7)
- `work/claude/06-rts-reference-study.md`
- The approved preimage under `work/claude/ui-polish-v4/baseline/`
- Current live read-only context: `client/src/design/tokens.css`, `client/src/ui/AudioCaptions.tsx`, `client/src/app/battle-controller.ts` (the Escape action), `client/src/runtime/keybindings.ts` (`textEntryFocused`) and `pkg/content/rules.json` (catalog names)

**Native images inspected:**
- `presentation-ui-stress/chromium-01/layout-1280-720-1.5-{review-bottom,target-top}.png`
- `layout-1600-900-1-target-top.png`
- `presentation-memory-v5/chrome-150-01/1280x720-scale150-last-seen-and-off.png`

**Files written (only these five):**
- `work/claude/ui-polish-v4/candidate/client/src/ui/App.tsx`
- `work/claude/ui-polish-v4/candidate/client/src/styles/game.css`
- `work/claude/ui-polish-v4/candidate/client/src/ui/StrikeReview.tsx`
- `work/claude/ui-polish-v4/candidate/client/src/ui/strike-review.css`
- This report

**Scope boundaries:**
- No fog, terrain, renderer, art, replay, protocol, Go or gameplay change.
- P4 (fog spur) is out of scope and untouched.
- Command admission is unchanged: `orderCommands` only re-sorts kinds that the affordances already provide.

## Measured constraints used (from native captures, CSS px)

| Quantity at 1280×720 / 150% | Value | Source |
| --- | --- | --- |
| Sidebar | 372 (248 × 1.5) | tokens.css |
| Tray content width | 870 (908 − 12 − 26 padding) | game.css:191/278 |
| Rig overview / grid | 283 / 575 → 4 columns | review-bottom.png 12–295, 303–878 |
| Howitzer overview / grid | 323 / 537 → 3 columns | last-seen-and-off.png |
| Four 132px columns + 3×5 gap + 8 padding | 551 | `minmax(88px×scale)` |
| Information column (current) | 495 of a 908 field (54%) | target-top.png 18–510 |
| Column height | ≈431 (720 − 59 top − 230 bottom) | game.css:507 |
| Display-font width, 19px × 1.5 title | ≈12.7–13.5 px per uppercase character | "ENGINEERING RIG" 191px; "PRECISION HOWITZ…" 229px |

At 1600×900/100%, the overview occupies 12–312 (300px) and the column is 330px (target-top 1600 image).

## P1 — Strike review follows the UI scale; the decision row is always reachable

**`strike-review.css` (rewritten; every rule changed)**

- **`.strike-review.console`**
  - Compound selector, so it beats `.console` regardless of stylesheet order.
  - All sizes use `--fc-ui-scale`. The shared `--sr-pad` is `14px × scale`.
  - The standalone width is `390px × scale`.
  - Look: a recessed charcoal well (`#24221d → #1b1a16`), metal-highlight and black keylines, and a 7px amber/black hazard edge drawn as a background layer. This is the strategic plate's own stripe, so no positioned pseudo-element is needed and the column's `position:static` override stays valid.
  - The old 1px olive web-form border is gone.
  - The `@media(max-height:780px)` shrink rule is removed.
- **`header`, `header>span`, `h2`, `header p`**
  - Brass eyebrow (mono, 11px × scale).
  - Stencil display heading (22px × scale).
  - Approach line in amber label type (14px × scale) above a brass-dark rule with a metal highlight, matching the page-panel headers.
- **`p`, `.strike-review-note`, `small`**
  - Body 13px × scale (19.5px at 150%). Review age 12px × scale mono (18px).
- **`table`, `th/td`, `thead th`, `tbody th`, `td`, `tbody tr:last-child>*`**
  - The timing table is a black inset well.
  - Times are LCD-amber tabular mono at 13px × scale (19.5px).
  - Headers are brass Barlow Condensed at 12px × scale (18px at 150%).
- **`.button-row`, `.button-row>.primary`, `.button-row>button`, `kbd`**
  - Layout: CONFIRM STRIKE is the full-width existing primary brass key. RETARGET and CANCEL share a two-column row beneath it.
  - Labels are 13px × scale (19.5px) with `min-height: 34px × scale`, and they may wrap.
  - Cancel carries the bound Escape key cap, styled like the target card.
  - The row is `position:sticky; bottom:0` and opaque (`#1b1a16`). A negative inline margin spans it across the card, but it stops at the hazard edge.

**Scroll-ancestor reasoning (not "sticky alone")**
- In play, the card is portaled into `.battle-information-orders`, which sits inside `.battle-information-scroll`.
- The column rule `.battle-information.active :is(.mission-objectives,.strike-review)` resets the card to `position:static; overflow:visible; max-height:none`. The card is therefore **not** a scroll container.
- The nearest scrollport is `.battle-information-scroll` (`overflow:auto`, `flex:0 1 auto`, `min-height:0`, bounded by the fixed column). `.battle-information-orders` (a flex column) and the card itself do not scroll.
- Sticky can only move the row within the card's own box. So:
  1. **Card taller than the scrollport, top visible:** the row pins to the scrollport bottom, so Confirm, Retarget and Cancel stay visible.
  2. **Card entirely below the scrollport** (under long captions): sticky cannot pull the row out of its card. This case is handled by (3).
  3. **`StrikeReview.tsx`:** `useLayoutEffect(() => card.current?.scrollIntoView({block:'nearest', inline:'nearest'}), [review.phase])`.
     - It runs on open (loading) and again when the card grows (ready or unavailable).
     - For a card taller than the scrollport, `nearest` aligns its top edge, so the heading shows at the top and the row pins at the bottom. A shorter card is revealed whole.
     - Focus is never moved. The card's `onKeyDown` stops every key, so focusing it would silently disable game hotkeys.
     - Per-tick re-renders do not re-run the effect, so a user's manual scroll is kept.
     - Its other ancestors are the fixed column, `#root` and `body` (`overflow:hidden`, no overflow expected), so it should scroll only the column.
- **Card padding-bottom is 0** and the row supplies the bottom padding, so the pinned row sits flush with the card's lower edge.
- **Height budget at 150%:** about 131px of header plus about 144px of decision row, inside the 431px column. Only the row is pinned; the header scrolls away when the user scrolls.
- **Width at 150%:** the card sits in the 381px capped column, so its content is about 318px after padding and the scrollbar. Estimated table min-content is about 290px, and Retarget/Cancel need about 116px and 140px of the roughly 154px each gets. This is **tight and unmeasured**, so root must check horizontal overflow.
- **Unchanged:** `disabled={review.phase!=='ready'}`, all three callbacks and the `onKeyDown` Escape branch.
  - The bound Escape action already cancels a review (`battle-controller.ts:214`), so the key cap is truthful.

**`StrikeReview.tsx`** changes:
- The `card` ref.
- The layout effect above.
- New optional props `escapeKey` and `escapeShortcut`, which render `<kbd aria-hidden>` and `aria-keyshortcuts` on Cancel.

**`App.tsx`** passes the same `escapeKey` / `escapeCode` values that the target card already uses.

## P2 — Stable command-grid origin, two-line unit names, Force fire promoted

**Why not the review's `196px × scale + 90px`:** that is 384px at 150%. It would leave 870 − 8 − 384 = 478px, which is **three** columns. It would reproduce the defect for every unit.

**Track chosen from the constraints above**

- **`.battlefield-screen .selection-overview`**
  - `flex:0 1 calc(120px*scale + 110px); min-width:0; max-width:none`.
  - At 150% that is **290px**, which leaves a 572px well: four columns plus 21px of slack for a classic scrollbar.
  - At 100% it is 230px; at 125% it is 260px.
  - It overrides the unscaled 215/245/260/300px minimums and the 320px maximum, which previously let the heading's intrinsic width set the track.
- **`@media(min-width:1500px) and (min-height:840px)`**
  - `flex-basis: calc(100px*scale + 200px)` gives **300px at 1600×900/100%**, exactly the captured width. The grid there is not narrowed.
- **Shrink behaviour:** `flex-shrink:1` only engages if the grid is already at its 120px minimum, so in normal layouts the origin is fixed.
- **`.battlefield-screen .selection-overview h2:not(.awaiting-orders)`**
  - `-webkit-box` with `line-clamp: 2`, `white-space: normal` and `overflow-wrap/word-break: normal` (whole words only, no hyphenation).
  - `line-height: 1`; letter-spacing reduced from .06em to .03em. The size is unchanged.
  - A third line ends in an ellipsis. The empty-state `.awaiting-orders` rule is untouched.
- **Width estimates at 150%** (text column 290 − 72 portrait − 12 gap = 206px; ≈12–13px per character at .03em):
  - "ENGINEERING RIG" ≈178px → one line.
  - "PRECISION HOWITZER" ≈220px → **PRECISION / HOWITZER**.
  - The longest single catalog words, "INFRASTRUCTURE" and "RECONNAISSANCE", are ≈182px each and fit.
  - The longest names are 25 characters: "Precision missile carrier", "Tactical missile launcher" and "Strategic operations site". The first and third break into two lines. "WHEELED INFANTRY CARRIER" and "TACTICAL MISSILE LAUNCHER" sit near the limit and may show `…` on line 2. That is the accepted graceful fallback, but it is **unmeasured**.
- **Vertical budget:** the overview contents were ≈116px tall inside a ≈196px tray content height; a second 28px line fits.
- **`App.tsx`:**
  - The unit-name `<h2>` gets `title={full name}` for pointer users. The full text remains the heading's accessible text.
  - `COMMAND_FIRST` is now `move, attack_move, attack, stop, hold, force_fire, guard, patrol, escort`. The doc comment is updated.

## P3/P7 — Column cap, overflow discovery, tab stop, key contract

- **`.battle-information.active` width** is `min(330px×scale, (100vw − sidebar) × .42, 100vw − sidebar − 36px)`.
  - 1280×720/150%: **381px** (42.0% of 908).
  - 1600×900/100%: **330px** (unchanged).
  - 1280×720/100%: 330px.
- **Generalized hook: `useCommandOverflow` becomes `useScrollOverflow(scroller, cue, count, focusable=false)`**
  - Counters: `hiddenKeys` (the old per-key rectangle count, unchanged) and `hiddenExtent` (1/0 per edge from scroll extent).
  - It writes `data-count` on the cue spans, `data-overflow` on the well and `--fc-overflow-h` (the well's height) on the cue.
  - Triggers:
    - One rAF per burst.
    - A `ResizeObserver` on the well **and its direct children**. The column's three stable hosts grow when captions, alerts or orders change, even after the well stops growing.
    - A child-list `MutationObserver` that observes added children and unobserves removed ones, so detached keys are not retained.
    - Scroll events.
    - `blur`.
  - There is no subtree or characterData observation, so the review's per-tick age text does not trigger measurement. No per-frame polling. React state is never written.
  - Cleanup cancels the frame, disconnects both observers, removes both listeners and clears every attribute and property it wrote, including `tabindex`.
- **Tab stop (P7):** with `focusable`, the region gets `tabindex=0` only while `scrollHeight > clientHeight + 1`.
  - A focused region keeps its stop until blur, so focus is never dropped mid-use.
  - The React `tabIndex` prop was removed so React and the hook do not both control the attribute.
- **Cue DOM (`App.tsx`):**
  - `<div class="information-overflow" aria-hidden>` with `.more-above` / `.more-below`.
  - It is rendered only when `battlefield`, as the **last** child of `.battle-information`, after the target host. The scroll region, `AudioCaptions` and all three portal hosts keep their positions and identity, and nothing is keyed or remounted.
- **The scroll node is now a stable `useState` callback ref** (`setInformationScroll`), matching the other hosts. The key listener effect depends on that node, so it attaches once to the permanently mounted element with matching cleanup.
- **CSS:**
  - **Shared tab styling:** the command-overflow tab rules now use `:is(.battlefield-screen .command-overflow, .battle-information.active .information-overflow)`. That covers `>span`, `>span[data-count]`, both caret rules and both caret directions. The count-only `::before/::after` content rule stays command-only.
  - **`.battle-information.active .information-overflow`**
    - Placement: vertical brass tabs placed **outside** the column's right edge (`left: calc(100% + 5px)`) and as tall as the scroll region.
    - Why outside: they cannot cover text, the scrollbar or the pinned strike row.
    - Behaviour: `pointer-events:none`, static.
  - **`… .more-above::after`, `… .more-below::before`:** the word `MORE`, read down, with carets.
  - **`… .battle-information-scroll[data-overflow=above|below|both]`:** a 2px brass outer rule on each clipped edge. It uses box-shadow, so there is no layout shift and no measure loop.
  - **No fade mask.** It would dim the pinned Confirm/Cancel keys; this is a deliberate deviation from the review.
  - **`.battle-information.active .battle-alert{text-align:left}`:** wrapped notices are left-aligned. Short ones look unchanged.
- **Scroll-key contract (documented in `App.tsx`):**
  - **What is intercepted:** unmodified ArrowUp/Down, PageUp/Down, Home and End at the column, in the capture phase. The default scroll still runs, and propagation stops so the keys never reach the window hotkeys.
  - **Accepted cost:** React `onKeyDown` inside the column never sees these keys.
  - **New exemption:** targets for which `textEntryFocused` is true (input, textarea, select, contenteditable, IME composition and roles textbox, searchbox, combobox, spinbutton and slider) are left alone. The game already ignores keys from them, so their editing semantics are preserved.
  - **Everything else passes:** Escape and all other keys are never intercepted.

## P5/P6 — Upper MORE tab, pinned strategic well

- **P5:** `.battlefield-screen .command-overflow>.more-above::after` shows `'MORE\00a0' attr(data-count)` in vertical writing, mirroring the lower tab (caret first).
- **P6:** inside `@media (max-height:1000px)`, the only range in which the sidebar scrolls:
  - **`.battlefield-screen .command-sidebar>.strategic-panel`**
    - `position:sticky; bottom:0; z-index:2`, with an upward shadow.
    - `margin-bottom:0` plus `border-bottom:6px solid #2b2924`, which replaces the 6px margin with identical geometry. The hazard stripe stops at the border.
  - **`.battlefield-screen .command-sidebar`** gets `scroll-padding-bottom: calc(46px*scale + 18px)`, so focus-driven scrolling keeps a focused tile or queue key above the pinned well.
- **Coverage estimate at 720p/150%:** the queue ended near y≈655 and the pinned well occupies about 659–720, so there is little or no cover at scrollTop 0. This is **unmeasured**.

## Remaining verification needs (all unrun)

1. **Compile and tests:**
   - `tsc` for `App.tsx` and `StrikeReview.tsx`: the new props, `textEntryFocused` imported via `../runtime`, and `useLayoutEffect`.
   - Existing runtime and browser suites, especially the presentation-ui-stress checks: rectangle disjointness, no horizontal overflow, 3 alerts / 3 captions, caption node identity and the camera scroll-key invariant (line 31–32 focuses a column button, which is still intercepted).
   - **Check:** the disjointness probe may enumerate the new out-of-column cue tabs.
   - **Check:** any assertion that the region always has `tabindex=0` now fails **by design** (P7).
2. **1280×720/150% with three captions**, then open the review:
   - The heading and all three keys are visible without scrolling, and the focused element is unchanged.
   - Button and table text measures ≥18px.
   - No horizontal overflow in the ≈318px content box.
   - Escape and the Cancel keycap both cancel.
   - Repeat at a short viewport (for example 1280×600).
3. **Grid origin and columns** at 1280×720/150%:
   - Rig, Precision howitzer, "Tactical missile launcher" and "Wheeled infantry carrier" all show the same grid x and 4 columns, in Chromium **and** Firefox, with classic scrollbars.
   - The howitzer shows PRECISION / HOWITZER, and MOVE, ATTACK-MOVE, ATTACK, STOP, HOLD and FORCE-FIRE are unscrolled.
   - At 1600×900/100%, the grid x is still 322.
4. **Information column:**
   - Its width is ≤381px at 720p/150% and 330px at 1600×900.
   - With content clipped, a still frame shows the lower (and, after scrolling, the upper) MORE tab and brass edge.
   - Tab reaches the region only when it scrolls.
5. **Sidebar at 720p/150%:** the strategic well stays fully visible while cameos scroll, and a Tab-focused cameo or queue key is not hidden under it.
6. **Not addressed:**
   - Multi-type selections still show `.unit-subgroups` (up to 150px). At 150% that can drop the grid to 3 columns, so the "same origin" guarantee covers single-type selections only.
   - The review's F4 fog item and all asset gaps.
   - A rebound (non-Escape) cancel key still reaches the game only when focus is outside the card; this is unchanged behaviour.

No deployment, no model fallback, no files outside the five listed.
