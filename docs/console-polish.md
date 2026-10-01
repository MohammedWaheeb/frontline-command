# Console and menu integration, 28 September 2026

Claude Code exact `claude-opus-5-5` authored the warm metal keys/plates, calmer
console wells, wrapped unit names and sprite-based motor-pool menu diorama in
its08:35 session. Codex completed integration and repairs after the reported
session quota. The diorama uses original existing game sprites and terrain;
it is decorative staging, not simulated gameplay or the still-unapproved
final key-art illustration. Blue remains a team color, not interface chrome.

The menu draw owns abortable, temporary atlas resources. Completed draws drop
all page references. Resize cancels stale work; unmount aborts fetch/image work,
disconnects its observer and clears the canvas. A failed decorative load leaves
menu controls usable. A localized dark scrim keeps introductory text readable.
Enlarged navigation keys grow to fit their labels and scroll inside the menu
well. They no longer shrink two-line labels across adjacent buttons. The
skirmish summary shows starting positions; internal authoring credits remain
in content metadata rather than the deployment flow. Its decorative arrow is
excluded from the accessible button name.

## Evidence and limits

- `client/tests/render/menu-diorama-browser.mjs`: actual React component under
  StrictMode, authored atlas pages,1600×900/1280×720/900×600 resize, pending-fetch
  interruption, unload/remount and deliberately missing index.226 image objects
  were created across the run; zero remained reachable after forced browser GC
  at the checked completed/disposed boundaries. Zero unhandled rejections/page
  errors. This checks object lifetime, not total process/GPU memory. Receipt:
  `work/evidence/menu-diorama/2026-09-28T08-56-21.055Z/result.json`.
- Actual Go0.3.3 product: untouched US04 import, original-wing selection retained
  through paid training/cancellation, independent facility selection, construction
  targeting, quick-save, replay production inspection, disabled replay commands,
  rewind, command/log layout at1280×720 and100%/150%. No page/console errors.
  `work/evidence/production-sidebar/2026-09-28T08-56-53.008Z/result.json` records
  its exact isolated build, pack and source hashes. The later changes affect
  menu navigation/labels only; no battle/replay styles changed after this run.
- The first menu inspection exposed the accessible arrow suffix; the next native
  screenshot exposed150% navigation-label overlap missed by coarse button bounds.
  Both failures are preserved. The corrected check measures label containment
  and first/last key reachability, as well as actual Options→150%→command center
  →skirmish navigation. Final native1600×900 and1280×720 captures are under
  `work/evidence/visual-review/menu-final-0908`; no page/HTTP errors.
- Browser plugin was unavailable; existing Playwright infrastructure was used.
  Both TypeScript checks and the current251 runtime tests pass at the associated
  tactical-descriptor checkpoint. Menu/app TypeScript was checked again after
  the styling change.

Root reviewed native menu, deployment, pause, battle and enlarged replay views.
This bounded acceptance does not complete all-mode UI review, final key art,
full roster art, tactical effects, audio listening or a finished game. Claude
must review the completed fallback work after13:30UTC /16:30Qatar access reset.
