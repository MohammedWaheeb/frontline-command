# User direction and ownership update — 2026-09-27

The user explicitly requests a beautiful classic Command & Conquer-inspired RTS
visual language, with an art style rather than a fully realistic look. Preserve
original assets, faction insignia and UI design. Take inspiration from the
readability, dramatic military command interface, sidebar production, tactile
buttons, distinctive silhouettes and saturated team accents of classic RTS
interfaces, without copying protected game assets or exact layouts.

Prioritize a coherent finished game look: stylized painted/material-treated 3D
sprites, readable elevated terrain, clear shadows, strong faction differences,
restrained panel weathering, deliberate typography and purposeful motion. Avoid
generic dashboard cards, photorealistic brown visual noise, tiny text, and merely
geometric placeholder armies. The battlefield must be the dominant area. Show
actual unit/building art in concepts, including selection, production queues,
minimap, credits/power/supply, command actions and in-world warnings. Test both
1600×900 and 1280×720 and enlarged interface scaling.

The user now authorizes Codex to build nonvisual frontend utilities, functions,
runtime adapters and their tests while you are rate limited. UI/rendering/art/
audio/assets, asset pipeline, map layouts and mission presentation remain your
exclusive exact-model ownership. Assignment 02 must not resume writing runtime
files until Codex supplies a fresh read-only review or new bounded task; Codex
is taking over the integration lane to keep progress moving during this limit.
Continue assignment 01 only in assets/, work/art/, client/src/design/, its token
build script and assigned visual Markdown reports. Do not touch runtime files,
root tooling or cmd/wasm/ concurrently.

Before acceptance, fix the 21 reported failures in work/art/check-report.md,
inspect rendered concepts and sprites, and accurately distinguish finished from
missing work. Do not claim your interrupted pipeline is complete. Exact model
claude-opus-5-5 only; no fallback/subagents with another model.

Backend integration has advanced. Read current docs/protocol.md and
content-format.md before UI work. Changes include replay format 2, fog-safe
neutral map objects/rubble, strategic warnings, owner command sequence, scripted
versus AI versus human mission controllers, co-op checkpoint/resume endpoints,
local ranked matching/ratings, shared pause/status and team surrender votes.
All UI interaction must use typed adapters and actual returned state; never
invent gameplay success, show hidden information or duplicate simulation rules.
Report missing APIs to Codex. Every rejection/error needs a clear recovery path.

## Concrete sample review before resuming

Codex inspected the current tank, HQ and UI-shot preview PNGs. The low-poly,
strong team-accent treatment is compatible with the user's stylized direction;
keep this readable foundation. Make the final composition feel richer and more
intentional through lighting/material contrast, terrain treatment and faction
shape language. The HQ currently reads as a plain office block: strengthen its
recognizable military-command silhouette. Hull/turret layers must align at every
heading; test the actual assembled sprites, not only isolated frame sheets.
Use a clearer destruction silhouette and ground contact so wrecks cannot be
mistaken for functioning vehicles. Do not hide missing frames behind a nominal
manifest entry. The 21 clipping/coverage failures still need a clean rerun.

The browser integration now lives in client/src/runtime with generated protocol
bindings. Chromium, Firefox and WebKit have passed real worker/native parity and
two-context multiplayer through the actual server. Read docs/browser-runtime.md
and import typed transports; do not replace these with placeholder state or mock
commands. Root client/package.json is authoritative. Keep existing runtime
scripts/tests/dependencies when adding the React/Pixi/Vite UI toolchain.
