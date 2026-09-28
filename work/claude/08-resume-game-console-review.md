# Resume assignment 04 — product visual review and final console character

This brief supersedes assignment 04's old broad write reservation. Read AGENTS.md,
the authoritative handoff/design, and the actual screenshot study at
`work/claude/06-rts-reference-study.md`. Use exactly `claude-opus-5-5`; no fallback,
advisor, Agent or Task model. Implementation is already authorized. Do not deploy.

The user wants a real, expressive RTS, with the character of Generals and Red
Alert rather than a web dashboard. They explicitly reject blue UI chrome.
The direction is original charcoal/warm gunmetal, olive, brass and restrained
amber. Blue unit team paint is a tactical palette choice, not UI chrome. Preserve
readability, useful density and the large battlefield. Do not copy C&C assets.

## Current ownership, mandatory before any edit

Codex has implemented most product functionality during the quota interruption.
The latest code and Markdown evidence are authoritative; never restore an old
session's version of a file. Your write reservation on this resume is:

- `client/src/styles/`, `client/src/design/` and visual tokens.
- Presentational JSX and CSS in `client/src/ui/`, preserving all existing data,
  controls, accessibility labels and event handlers. Read the current controller
  contract before changing composition. Coordinate a needed behavioral change in
  `work/claude/04-integration-issues.md` instead of rewriting the controller.
- Original static console chrome/emblems under `assets/ui/console/` and
  `assets/ui/emblems/`, plus their owned source files.
- `docs/visual-design.md`, a new `work/claude/04-visual-review.md`, and your report.

Do not edit `client/src/app/`, `runtime/`, `protocol/`, `render/`, `content/`, Go,
shipping maps/missions, package files, shared asset manifests, Blender pipeline,
infantry/building/vehicle art or audio. Codex owns renderer and behavior. Report
rendering/art defects precisely with screenshots and affected states. Another
Claude job owns remaining vehicle/air models; a Codex worker owns the single
Blender queue for infantry and buildings. Do not start Blender.

## What is already real

Read `docs/frontend-status.md`, `docs/renderer-integration.md`,
`docs/account-sync.md`, `docs/map-workshop-ui.md` and `docs/audio-runtime.md`.
Actual Go/WASM solo, native LAN, saves, replay, editor, profile copy/backup,
moderation, private sign-in keys and audio all have connected product controls.
Never remove an implemented journey because it does not fit a static concept.
Some battlefield art is still missing; placeholder controls/sprites must remain
honestly identified until the production pack arrives. Asset completeness is
not a visual-polish claim.

## Required work

1. Open actual current game screens and compare them with the inspected RTS
   references. Use existing local product scripts and Playwright. Record the
   actual URL/build and viewports. Avoid judging from an obsolete screenshot.
2. Write a short mismatch ledger, then implement substantive improvements:
   one connected command appliance, distinctive original faction identity,
   tactile recessed production tiles, legible costs/locks/queues, an expressive
   selected-unit tray, and deliberate material/typographic hierarchy. No giant
   rounded cards, generic analytics gauges, neon gradients or empty ornament.
3. Inspect main menu, briefing, loading, actual battle, pause, debrief, replay,
   editor, options, LAN lobby, archives and copy/recovery panels. Their character
   should be coherent with the battlefield console, with clear recovery actions.
   Do not let secondary panels become a generic dashboard or sacrifice legibility.
4. Test a real sequence: select rig, place power, train rifle, select/box-select,
   move/attack, save, reload and inspect the restored state. Verify visible
   production/queue feedback. Exercise a disabled production option, dialog
   keyboard focus and large UI scale. The real Go engine remains authoritative.
5. Capture and inspect 1600×900 and 1280×720 gameplay, native sidebar/minimap/
   portrait crops, and 150% interface scale. Keep visual detail subordinate to
   tactical clarity. World richness, missing art or lighting issues belong in
   the integration ledger with exact examples, not a claim that CSS fixed them.

Run both TypeScript checks and the relevant browser journey after edits. Preserve
historical failures and state what remains unfinished. A palette change, concept
image, passing build, or attractive menu alone does not finish this assignment.
The requested full game remains in development; do not label it release-ready.

## Latest integration update before resume

Root added real mission location markers (world/minimap) and camera-focus buttons
for explicitly authored public regions; completed objective-linked markers hide.
The mission objective card contains the tutorial reminder in one scrollable
column to prevent overlap. Tutorial hints show actual configured bindings, and
hidden reminders can be reopened. T3 accepted boarding/unloading input is recorded
locally; Go alone verifies the world objective and victory. Preserve these
behaviors and accessible control labels when improving their visual treatment.
Read `docs/tutorial-product-acceptance.md` when available for exact current proof.
Your visual review must still distinguish temporary geometric structure art from
completed original sprites. Codex's building pilot library does not mean those
59 variants have been produced into the shipping pack yet.

The latest objective panel also has a collapsible **Marked forces** section.
These buttons select only living, currently owned original mission actors,
joined through Go's private `missionOrigin`; paid replacements are excluded.
An embarked group shows its aboard count and becomes selectable after unloading.
Preserve those buttons/labels/disabled behavior and the minimize/show panel control.
The 150% scale caption strip was moved above the HUD and targeting hint; preserve
caption visibility while reworking composition. `MissionObjectives.tsx` and
`TutorialGuide.tsx` are included in your visual reservation, behavior preserved.
Root is running the T3 original-squad transport product proof around resume time;
coordinate browser tests and do not change source mid-run. Read the status file
`work/claude/04-root-browser-window.md` before editing or launching a browser.
