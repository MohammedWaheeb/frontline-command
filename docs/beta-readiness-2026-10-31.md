# Beta readiness — 31 October 2026

**Verdict: beta-ready for a local / explicit-LAN closed beta on Apple Silicon
macOS with desktop Chrome.** Every automated gate passes on the final tree, the
whole UI was redesigned, and the known first-session gameplay blockers are
fixed. This is a beta, not the finished game: the limits below are real and
must travel with any beta build. No deployment occurred. The work is committed
in six slices on `main` (`e2b7723ea`..`a7c2f9581`: sim/content, server,
client, assets, docs, evidence). After committing, the package was rebuilt from
that tree, with no tracked changes. The rebuild produced the same QA-verified
bundle, `index-C2nIBGnO.js` (`logs/build-post-commit.log`).

Scope is the 20 October user scope in `AGENTS.md`: six skirmish maps, both co-op
scenarios, 1–4 commanders, Campaign, commander mastery and the map editor
unhidden. Audio is outside this pass.

Run it: `make build && make play`, then open http://127.0.0.1:8080
(`make lan` for explicit LAN hosting).

## Gates on the final tree (observed)

| Gate | Result | Receipt |
|---|---|---|
| `make build` (native package, content, client) | PASS | `work/beta-2026-10-31/logs/build-final.log` |
| `make test-extended` (all Go packages incl. full authored campaign/co-op/tutorial set, vet, TS, runtime) | **PASS**, 66m50s; `pkg/sim` 4004 s; runtime 821 pass / 0 fail / 5 skip | `logs/test-extended-final.log` |
| `make test-browser` (native/WASM parity, IndexedDB saves, offline reload, sync, two-browser multiplayer/reconnect/result) | PASS in Chromium, Firefox, WebKit | `logs/test-browser-final.log` |
| UI product smokes (product, solo-journey, practice-editor, assets-debrief, audio-product, audio, offline, offline-audio) | 8/8 PASS | `work/beta-2026-10-31/final-smokes.md` |
| Skirmish AI matrix, 6 maps × easy/normal/hard, AI vs AI | 18/18 natural elimination, 13–42 min, save/restore and full replay identical | `logs/final-ai-matrix.log`, `logs/final-ai/` |
| Authored campaign/co-op routes (incl. `sy-05` hard, FactoryCapture) | 88/88 main + 47/47 optional | `work/beta-2026-10-31/fix-sim.md` |
| Hard and Normal AI vs Easy, paid mirror | 6/6 on both test maps | `fix-ai.md` (ai-2) |
| Server `-race`, contentcheck, packaging tests 49/49 | PASS | `fix-integration.md` |
| Full-screen capture of every menu screen + live battle, 1280×720 and 1600×900 | 0 console errors | `work/beta-2026-10-31/screens-final/` (baseline: `screens/`) |

`sy-05-relay-break` hard, the last red campaign route in the 20 October
receipts, passes.

### UI QA pass (later on 31 October)

Muse and Codex sub-agents ran hands-on browser QA and code/screenshot QA of the new
UI. Fixes were made in disjoint-file Codex lanes, then re-verified in a real browser
on a re-cut build. Details: `work/beta-2026-10-31/qa/README.md`.

- **P0 found and fixed: online play.** Before this pass, multiplayer and co-op
  could not start through the new UI. Ready left a permanent "VALIDATING…"
  overlay, and guests never entered the battle. Now full online matches pass
  start → results → rematch, and both co-op scenarios start with both commanders
  in control.
- **Every QA finding re-tested as FIXED in the browser**, with no regressions:
  2 P0, about 26 P1 and about 30 P2 across keyboard/focus, HUD, menus and online
  flows.
- **Gates on the final build (`index-C2nIBGnO.js`):**
  - `test:runtime`: 919 pass, 0 fail.
  - Server/storage `-race`: PASS.
  - `make test-browser`: PASS in Chromium, Firefox and WebKit.
  - UI smokes: 7/7 PASS.
  - `make test-extended` was not rerun after the QA fixes; `pkg/sim` was not
    touched.

## What changed in this pass

Evidence for each item is in `work/beta-2026-10-31/` (audits, fix-lane and
revamp reports, captures).

### Gameplay
- **Starting supply field is now known at spawn.** Before, on 13 of 20 spawn
  slots the free hauler could idle forever (`no_known_supplies`), which also
  broke spawn parity. Every spawn on all eight launch maps now loads within
  75 s and earns first income within 90 s (`pkg/sim/starting_fields.go`).
- **Base building is discoverable.** The sidebar opens on the Engineering rig,
  and a dismissible opening hint walks through power → supply → barracks →
  factory.
- **Balance (content 2.0.0 → 2.0.1):**
  - Shahed is now 350 credits with 300 damage, so one hit kills an engineer or scout.
  - Elite infantry is −25% price and 2 Supply.
  - APC text now matches its real capacity.
  - The proposed Syrian tank buff was **reverted** because it broke three
    campaign routes; that outlier is deferred.
  - Saves and replays from content 2.0.0 are rejected rather than reinterpreted.
- **Explicit spawn positions.** A 1v1 on a 4-start map now uses diagonal
  starts, and lobbies and skirmish can choose starts.

### Skirmish AI
These changes are gated off for authored missions, so campaign routes are unchanged.
- Coherent attack waves replace the one-at-a-time trickle: combat-power
  threshold, rally point, release on readiness, regroup after losses, and a
  two-prong attack on Hard.
- Distinct Easy / Normal / Hard policies.
- A faction opening for each faction: US air, Iran ISR and missiles, Syria
  raiders and portable AA, Saudi mechanized.
- Second-factory growth, collector failover, and no wasted purchases on Easy.

### Multiplayer
- Automatic local profile, so a host reaches a lobby in 3 actions from the main
  menu, or 4 from the first-run welcome (was about 11).
- A single invite code with Copy, and join-by-code for co-op.
- Rematch invites with a rematch flag.
- Spawn choice, faction and team on join, and a kicked-player notice.
- Readable error text, LAN join addresses shown in-game, and profile rename.

### UI/UX revamp
Research and specs: `ui-ux-research.md`, `design-audit-menus.md`, `design-audit-hud.md`.
- **Front end:**
  - Grouped home (Play / Learn / Records) with a Continue card and one-click
    Quick Skirmish; nothing hidden below the fold at 720p.
  - Mode screens use a fixed footer.
  - Skirmish setup is a one-screen lobby: per-player rows, a live map with
    clickable starts, quick setups and remembered settings.
  - Multiplayer opens on Host / Join / Browse.
  - Campaign, field training, saves, replays, command record, help, briefing
    and debrief are rebuilt.
  - Options has six tabs with confirm-before-reset.
- **In-game HUD:**
  - A C&C-style right command sidebar: credits, power and supply header,
    full-width minimap, keycapped tabs, a cameo grid showing every base
    structure, and rich tooltips.
  - A compact selection tray with a fixed 4×3 command card.
  - An alert feed with Space-to-jump.
  - Debug text moved to an opt-in diagnostics overlay.
  - The drag-blocking left info column is removed.
- **Battlefield share** with a unit selected: 75.2% at 720p, 76.8% at 900p,
  80.1% at 1080p (was 64.5 / 68.3 / 73.1%).
- **Battlefield rendering:**
  - feathered fog over a dimmed, readable map instead of a black void;
  - terrain variety;
  - relation-coloured selection rings and building brackets;
  - segmented health bars;
  - typed order routes with instant markers;
  - a per-cell placement grid;
  - a brighter minimap;
  - distinct team colours even for same-faction players.
- **Controls:**
  - Default hotkeys in C&C style: production tabs on Q–Y, F1–F12 cameo
    slots, idle-worker and base cycling, Space for the last alert.
  - Classic and Grid presets.
  - Edge scrolling on by default.
- **Assets:**
  - scenery dressing for the 7 bare launch maps;
  - 31 new research, ability and operation icons;
  - generated previews for all 8 maps;
  - a Shahed launch effect;
  - the asset checker repaired.

## Known limits (must ship with the beta)

1. **Not verified with real people or hardware:**
   - Physical two-machine LAN.
   - A full four-human FFA/2v2 lifecycle on four real sockets; tests use
     1 human plus bots, or 2–3 humans.
   - Human balance and natural human co-op victory.
   - Other operating systems and Safari.
2. **Art is complete in coverage, not approved in quality.**
   - 880 of 1118 manifest entries are status `sample`.
   - Map loading screens and briefing illustrations were never authored;
     code substitutes are used.
   - Custom cursors use CSS defaults.
3. **Deferred balance:**
   - Syrian refitted tank per-credit outlier (reverted).
   - Tactical missiles are over-countered by interceptors for US, SA and SY.
   - Power is a cliff.
   - Industrial Valley has no chokepoints.
   - Supply stations are weak.

   See `audit-gameplay.md`.
4. **AI:**
   - US AI rarely fields aircraft in AI-vs-AI samples.
   - Strategic targeting ignores area value and saturation.
   - Campaign AI deliberately keeps its older planner.
5. **Test infrastructure:**
   - `tests/stock-browser/product-smoke.mjs` stays pinned to the frozen v23
     product and was not run: no Firefox/geckodriver, and Safari remote
     automation is off. A new-UI draft is saved in
     `work/beta-2026-10-31/final-smokes/`.
   - `client/tests/render/history-recovery-build.mjs` needs its frozen base
     snapshot refreshed (24 newer modules missing).
   - The `terrain-fog-*` / `terrain-height-*` render fixtures pin the old fog
     and need re-baselining.
   - About a dozen other `tests/render` browser fixtures were updated for
     renamed labels but only syntax-checked.
6. **Release hygiene:**
   - The bulk generated assets stay untracked and local, so a fresh clone
     needs the asset pipeline before `make build`: about 1.3 GB in
     `assets/build`. Only the new map previews and the Shahed FX are
     committed.
   - The beta evidence screenshots and large logs (about 940 MB) are also
     local only.
   - Older `work/` evidence directories are also local only.
   - Audio acceptance is not claimed.
   - Plaintext LAN tokens: the trusted-LAN model is documented, and TLS is
     not implemented.

## Recommended next steps

- Run one physical two-machine LAN session and one four-human session.
- Do a human playtest pass on the new default hotkeys and AI difficulty, then
  a balance pass on the deferred items.
- Run an art-approval pass to promote `sample` assets, and author briefing and
  loading art.
- Refresh the frozen test baselines listed above.
