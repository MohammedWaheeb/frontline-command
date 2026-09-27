# Assignment 01 — visual concepts, design system and production pipeline

You are the exclusive frontend/UI/art/assets owner of Frontline Command. Use
exactly `claude-opus-5-5` throughout; no alternative models, fallbacks, advisor
models, or subagents on other models. Work in this repository. Implementation is
authorized. Read AGENTS.md and outputs/frontline-command-agent-handoff.md, then
the authoritative outputs/frontline-command-game-design.md (especially 1, 5,
9–19, 22–26). Codex is concurrently building the pure Go simulation/backend.

This is a bounded first assignment: produce the professional visual concepts,
reusable design system, exhaustive asset inventory and working initial asset
production pipeline. Do not attempt the entire game/client yet. We will review
your actual outputs before the next integration slice.

Read the frontend-app-builder skill at
/Users/mohammedkalouti/.codex/plugins/cache/openai-plugin-examples/build-web-apps/0.1.2/skills/frontend-app-builder/SKILL.md
and imagegen skill at
/Users/mohammedkalouti/.codex/skills/.system/imagegen/SKILL.md.
Apply relevant guidance through your own CLI tools. All assets must originate
through your work; do not ask Codex to draw them or implement frontend fixes.

Allowed write boundaries: assets/, client/, content/maps/, content/missions/,
cmd/wasm/ (not needed yet), work/art/, docs/visual-design.md,
docs/asset-pipeline.md, docs/frontend-status.md, work/claude/01-report.md.
Do not alter backend code, pkg/, internal/, protocol/, go.mod, shared documents,
or the original outputs. Do not deploy, publish or send external messages. No
real extremist markings; use original fictional military insignia.

Deliver:
1. Coordinated readable concepts at 1600×900 and 1280×720 for actual battlefield
   HUD, production/selection states, main menu, lobby, campaign/briefing, editor,
   debrief/replay and settings/recovery. Make battlefield the largest area. This
   is a polished 2.5D fixed-elevated-camera RTS, not a marketing site.
2. Exact typography/color/spacing/component/state tokens and asset treatment,
   keyboard/focus/scale/caption/reduced-motion approach; maintainable React +
   TypeScript + Vite + PixiJS 8 architecture. Backend uses millitile/milliunit
   integers, 20 ticks/s; UI never invents gameplay authority.
3. Exhaustive manifest for 75 units, 19 building types with faction variants,
   all applicable animation/work/special states, portraits/icons/cursors,
   terrain, effects, strategic warnings, announcer/response audio, music,
   briefings and localization. Each entry states source, license, editable
   origin, output, state/frame/direction dimensions and completeness.
4. An actually exercised reproducible art pipeline and first production-quality
   terrain/unit/building samples matching concepts, with team masks/shadows and
   useful states. Preserve editable sources. Use image generation for concept
   and central raster art per skill if configured. Inspect available tools and
   credential presence without printing secret values. If image/audio tooling
   requires missing credentials, report precise setup blocker; continue design
   inventory and other allowed independent work. Do not mislabel placeholders,
   generic shapes or synthesized beeps as finished game art/audio. You may
   propose a high-quality original 3D sprite-rendering pipeline if image tooling
   cannot run, documenting the deviation for review before acceptance.
5. Run asset integrity/dimension/transparency/state-coverage checks. Inspect
   rendered outputs. Report changed files, exact commands and results, concept
   paths/screenshots, actual remaining gaps and blockers. Include no invented
   test results. Report at work/claude/01-report.md and in your final output.

Do not stop for unnecessary design approval; Codex will review the concrete
result. Avoid uncontrolled scope expansion. Development tools may be installed
locally if needed; never purchase services or expose credentials. No runtime AI
or CDN dependencies will be allowed in the final packaged game.
