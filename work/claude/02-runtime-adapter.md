# Assignment 02 — browser Go/WASM runtime and transport

Use exactly claude-opus-5-5 with no model fallback or subagent/model switches.
Read AGENTS.md, the approved handoff and design section 24, docs/protocol.md,
docs/content-format.md, pkg/sim/state.go, engine.go, visibility.go and
protocol/frontline.proto. Backend is implemented and being expanded by Codex.
This independent assignment runs alongside another Claude process creating
assets/concepts. DO NOT edit its assets, pipeline, design documents or reports.

Allowed write paths ONLY: cmd/wasm/, client/src/runtime/, client/src/protocol/,
client/tests/runtime/, client/scripts/runtime/, client/runtime-package.json,
docs/browser-runtime.md, work/claude/02-report.md. If package tooling is needed,
use a self-contained package under client/src/runtime with its own package.json
temporarily; do not create root client/package.json yet. No backend/pkg/internal
edits, no map layouts, no visual UI in this slice. Report backend defects.

Build a robust typed browser runtime interface shared by two transports:
1. Offline Go/WASM in a dedicated Web Worker using the ACTUAL Go engine. You own
   cmd/wasm/main.go even though it is Go. No TypeScript combat rewrite. Copy the
   installed Go 1.27.1 wasm_exec.js from the actual GOROOT in your build script;
   don't download a mismatched runtime. Expose create/order/step/view/save/load/
   hash/dispose and errors. Preserve sequencing, 20 Hz simulation, authorized
   player views, pause, 0.75/1/1.5 speed, tick-boundary saves and visibility.
2. Online binary protobuf WebSocket transport for the implemented Go service:
   ClientHello, OrderBatch, results, PlayerSnapshot/StateDelta with baseline
   checks, Ping, ResumeMatch, MatchResult. Generate TS bindings from the shared
   schema; do not hand-maintain an incompatible protocol. No hidden-state UI.
3. IndexedDB versioned local manual saves + 3 rotating autosaves, settings,
   export/import, checksums/compatibility surfaced as typed recoverable errors.
   Never silently overwrite conflicts or delete incompatible saves. Offline
   cache/service-worker strategy documented for the future Vite shell. Do not
   claim offline first-start before assets are cached or promise LAN SW support
   on insecure non-localhost origins.
4. Tests for create/advance/save/restore, worker isolation, disposal, corrupt /
   incompatible saves, delta application/lost vision, reconnect behavior, and
   binary codec parity. Use a native Go harness if available; Codex can provide
   a native saved test fixture for exact WASM hash parity. Tests must be authored
   by you. Use Node/browser harnesses and record actual commands/results. Do not
   pretend mocked websocket success is actual server multiplayer verification.

No gameplay is considered finished yet. Do not work around engine bugs by
reimplementing rules in the browser. Return changed files, actual model, build/
test results, blocked backend dependencies and integration instructions at
work/claude/02-report.md. End after completing this bounded slice; Codex will
review it before the main client/editor assignment. No deployment.
