You are the sole UI author, using exactly claude-opus-5-5 with no fallback and no subagents. Correct the bounded presentation candidate in /Users/mohammedkalouti/Documents/Codex/2026-09-27/i. Source authoring only: no Bash, browser, host, builds, tests, Blender or installs. Root runs acceptance.

Read work/claude/presentation-polish-v1/report.md and your prior review work/claude/29sept-v24-review/report.md. All v1 evidence remains untouched. The new source is work/claude/presentation-polish-v2/source/client, copied from exact v1 UI plus latest accepted generation-v3 and audio-retry logic. Do not touch generation/audio/gameplay code.

Independent source review confirms your fog and remembered-entity changes preserve public-array privacy. Both TypeScript checks pass. Runtime test attempt1 also had omitted non-client fixture inputs in root preparation, now corrected without changing source. One concrete authored test issue remains: in presentation-polish.test.ts, the changed diagonal visible=false but explored=true is remembered, therefore actual175/4=43.75 correctly differs from expected255/4=63.75. Make the test explicitly assert remembered175/4 first, then set explored=false and assert unknown255/4. Do not alter correct fog logic to satisfy the wrong expectation.

The v1 F6 known overlap is unacceptable. Current targeting captions z120 left18/top alertsBottom+6 overlay mission-objectives left15/top130/z90 and strike-review left18/top62(or72)/z8. Three allowed captions can cover objectives or strike confirmation. Establish one bounded flow/layout owner for alerts, targeting captions, mission objectives and strike review, with a vertical budget above the command tray. Keep all content and actions accessible. At 1280x720/150% and narrow supported widths, maximum alerts/captions plus long objectives/strike must have pairwise disjoint visible content and usable scrolling when necessary. Do not shrink readable fonts, hide objectives, drop captions, disable accessible live regions or change ordering/targeting/gameplay semantics. Keep AudioCaptions mounted consistently so changing targeting never drops/reannounces its state. Preserve regular non-targeting caption presentation where practical. Clean up any observers/listeners. Warm olive/gunmetal/brass/amber, no blue chrome, no unrelated redesign.

You may edit only these paths under work/claude/presentation-polish-v2/:
- source/client/src/ui/App.tsx
- source/client/src/styles/game.css
- source/client/src/ui/MissionObjectives.tsx
- source/client/src/ui/StrikeReview.tsx
- source/client/src/ui/strike-review.css
- source/client/src/ui/AudioCaptions.tsx
- source/client/tests/runtime/presentation-polish.test.ts
- report.md

No production live edits, no art edits, no changes to other candidate source, old reports or evidence. Final report must enumerate changes, tradeoffs, unrun acceptance, and acknowledge any remaining overlap risks without claiming acceptance. Root will independently compare the allowlist, test, and inspect actual game pixels.
