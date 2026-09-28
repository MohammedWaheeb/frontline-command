# Assignment 04 — product visual review (resume, 2026-09-28)

Model: Claude Code CLI, `claude-opus-5-5` (this session). No other model, Agent or
Task worker was used.

## Method

- Product: current working tree, Vite dev server `http://127.0.0.1:5173`
  (released to this assignment by root, see `04-root-browser-window.md`), actual
  Go/WASM solo skirmish, installed Copper Junction content. No Go host on 8080;
  solo runs in the browser worker.
- Driver: `work/claude/visual-review/capture.mjs` (Playwright Chromium 151 from
  `client/node_modules`). Evidence: `work/evidence/visual-review/<tag>/`.
- Viewports: 1600×900 and 1280×720; interface scale 100% and 150%.
- References compared: `work/art/references/generals_zh.jpg`, `ra2_yr.jpg`,
  `cnc_remastered.jpg` per `06-rts-reference-study.md`.

## Baseline mismatch ledger (tag `baseline`, before any edit)

| # | Area | Observed in actual product | Reference expectation | Owner / action |
|---|---|---|---|---|
| 1 | Command appliance | Resource shoulder floats as a separate slab left of the sidebar; flat olive-grey fill equal to sidebar; no join, no bevel. Power is not in the shoulder at all. | RA2: cash and power are part of one connected appliance; Generals: cash window is a recessed well in the console. | CSS/JSX (mine): attach shoulder to the sidebar as one machined plate; add power readout. |
| 2 | Material | Sidebar, tray and shoulder are one uniform `#34372b` fill with thin borders; reads as a web panel. | Machined metal: raised frame, recessed dark wells, bevel light, seams. | CSS (mine): gunmetal plate with brass trim, rivets, recessed wells. |
| 3 | Production tabs | Six icon-only tabs, low contrast, no labels; active state only a thin amber stripe. | Category strip readable at a glance. | JSX+CSS (mine): labelled tactile keys, lit active key. |
| 4 | Power gauge | 9 px track, fill barely visible; value only "40" at bottom. | RA2 full-height continuous gauge, colour + level. | CSS+JSX (mine): wide segmented LED column with demand/capacity readout and state label. |
| 5 | Build tiles | Locked tiles show a grey generic building glyph; reason only on hover; queued tile covered by "Wait: Queued." overlay hiding the art; price tag low-contrast. | Illustrated cameos, visible Ready/queue states, clear locks. | CSS+JSX (mine): recessed tile wells, always-visible lock reason strip, queue count + progress badge that does not hide art. Missing building illustrations remain an asset gap (#12). |
| 6 | Selection tray | Flat slab 900 px wide from the left edge, mostly empty; small portrait; command buttons without hotkeys; at 150% labels truncate ("Headqu…"). | Generals: purposeful lower console with portrait well and command keys. | CSS+JSX (mine): portrait well with team backlight, segmented HP, hotkey badges, tighter shape. |
| 7 | Typography | Section headings/labels in mixed small sizes; eyebrow mono often 9–12 px. | Deliberate hierarchy, stencil display for identity, mono for numbers. | CSS (mine). |
| 8 | Minimap | Unexplored map is pure black; frame is a thin line. | Recessed well with bezel; clear camera box. | Frame: CSS (mine). Minimap content (black unexplored, small explored island) is renderer (#13). |
| 9 | Alerts/countdown | Plain boxes; countdown plain numerals. | Stamped military readouts. | CSS (mine). |
| 10 | Menu | Backdrop is a single US tank portrait scaled 140% → blurred, muddy; nav is a plain list. | Expressive but legible key art. | CSS (mine): sharper, smaller art treatment, console-framed nav. Real key art is an asset gap. |
| 11 | Modals | Generic plate; header ok. | Coherent with console. | CSS (mine). |
| 12 | World art | Only HQ, power, rig/tank, rifle etc. have sprites; other buildings use procedural geometry. | — | Asset/renderer owners; recorded in integration issues. |
| 13 | World rendering | Fog outside explored area is flat pure black with blurred diamond rim; large empty dark area dominates frame at game start; health bar floats above HQ top. | Generals/RA2 frames show readable terrain everywhere visible; shroud is darker but textured. | Renderer (Codex); recorded in `04-integration-issues.md`. |

## Result after redesign

See "After" section below (filled after capture).
