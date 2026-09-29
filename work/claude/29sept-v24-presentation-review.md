# Fresh integrated v24 presentation review

This replaces the incomplete, rate-limited v23 review. Use only exact `claude-opus-5-5`; no fallback. This is a fresh read-only assignment. Read `AGENTS.md` and `work/claude/06-rts-reference-study.md` for the user's original stylized C&C / Generals / Red Alert direction. The user explicitly rejects blue UI chrome and generic dashboard presentation. Tactical team blue is allowed. Retain charcoal, warm gunmetal, brass, olive and amber.

Your sole write target is `work/claude/29sept-v24-review/report.md`. No source, model, spec, asset, renderer or test edits. No browser/Blender/host launch or network installation. Root owns the browser lane; Mencius owns ongoing art production; Boole owns packaging/cache logic; Einstein owns multiplayer test preparation. Other old ownership footers do not apply.

Review these actual full-App native captures first (at most eight images, not old failed layouts):

- `work/battlefield-clarity/union-v24-stock-chrome-01/1280x720-scale150-placement-free-site-pending.png`
- `work/battlefield-clarity/union-v24-stock-chrome-01/1280x720-scale150-command-overflow-bottom.png`
- `work/battlefield-clarity/union-v24-stock-chrome-01/1280x720-scale150-countdown-live.png`
- `work/battlefield-clarity/union-v24-stock-chrome-01/1280x720-scale150-replay-paused-camera.png`
- `work/battlefield-clarity/union-v24-stock-edge-01/1280x720-scale150-placement-free-site-pending.png`
- For the full-size prior layout only: `work/battlefield-clarity/firefox-v23-01/1600x900-scale100-range-weapon.png` and `work/battlefield-clarity/firefox-v23-01/1600x900-scale100-last-seen-and-off.png`.
- `work/stock-browser-smoke/firefox-02/paid-production-completed.png` is genuine Firefox156 on v23 at native retina resolution. Inspect the lower command label's awkward `SKYBREAKE` / `R WING` split and the fog-edge scallops at normal scale. This capture is an ordinary paid opening, unlike the prepared clarity fixtures.

The v24 union is `work/art/roster-runtime-overlay-v1/outputs/infantry-vehicles-ui-v24`. Build SHA-256 `1c86560a299c2c2ae99fd6c44df476d4cecab091bb1b4d4b6e78d8b63ee8077d`. Its base source is `work/art/effects-opus-v2/integration-v24/source/client`; inspect this frozen source if needed. Mutable live source may already contain subsequent packaging changes. Source paths of interest: `src/styles/game.css`, `src/ui/App.tsx`, `src/render/terrain.ts`, `src/render/terrain-surface.ts`.

The 720p/150% Chrome and Edge cases exercise real normal UI inputs, exact Go saves, accepted/rejected placement, replay, paused minimap camera updates, countdown and cleanup. Functional gates pass. Raw Chromium aborted-request diagnostics are recorded separately and unresolved; do not call either browser diagnostically clean. They are not visible UI quality evidence. The art union contains 34 completed assets with 9,240 poses; the rest of the roster is still in production. Prepared gameplay fixtures are sparse and are not normal-map scenery compositions.

Specific decisions needed:

1. Does the current warm command console feel like a coherent RTS game and remain readable at 720p/150%? Identify concrete clipping, visual hierarchy or command discoverability defects with exact screenshot locations. The bottom command grid and compact production sidebar have intentional ordinary scrolling, already exercised; do not report merely offscreen-but-scrollable content as unreachable.
2. The new terrain fog feather is formally conservative (unknown opacity never reduced and remembered opacity never below175/255), geometry/picking exact, privacy-safe and tested on three engines. Root sees repeated bright triangular scallops/spikes at the visibility edge, especially the countdown image. Judge their visual cost versus classic RTS references. Propose a small bounded correction only if warranted, retaining no-leak opacity, height/cliff alignment, deterministic public visibility inputs and current caching/disposal. Do not propose smoothing that reveals unknown terrain or lowers remembered fog just for appearance.
3. Do building production portraits now read correctly? The shared resolver fixes an actual `building.*` key mismatch; required UI assets load. Separate low-detail unfinished world assets from current UI hierarchy.

Return an ordered, short findings report: severity, exact visual evidence, concrete suggested scope, acceptance criteria and any tradeoff. Identify acceptable areas too. Do not approve the full game or demand broad reimplementation without a specific demonstrated defect. An independent complete-roster/infantry/mask review is assigned separately; do not repeat that work.
