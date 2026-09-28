# Simulation 0.3.1 compatibility boundary

Simulation 0.3.1 adds explicit aircraft home reassignment and corrects completion
of queued finite tasks. A targeted Return now reserves a compatible owned home
and flies there normally. Completing movement, aircraft service, unloading,
capture, construction or salvage properly initializes the next queued command
instead of skipping it or losing its tail. These changes alter future outcomes.

The earlier 0.3.0 boundary included deterministic AI planner and depot-access
corrections: exploration, observed-target validation, paid lost-hauler replacement,
legal emergency production and bounded alternate unloading approaches.

The save envelope format, protocol 1 and rules content 2.0.0 are unchanged.
Older development saves and replays require their original engine and remain
preserved/exportable; neither headers nor stored state are silently migrated.
Historical evidence retains its original source and build identity.

Native and browser WASM publish simulation 0.3.1, adapter 1, protocol 1 and content
hash `318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`.
This version number does not mean the full game is ready.

## Verification

The complete native short suite passes, including simulation, WASM adapter,
server, storage, content and validation. Valid-checksum saves claiming 0.3.0,
0.2.0 or 0.0.1 produce structured incompatibility errors, retain exact input
bytes and leave the active match unchanged.

Actual Chromium, Firefox and WebKit each pass native/WASM state parity, ordinary
save/replay, IndexedDB persistence, cached offline reload, exact-byte account
sync, isolated workers and two-browser multiplayer/reconnect/results. Each also
rejects a correctly re-checksummed 0.3.0 fixture without changing the active match
or input bytes. Playwright WebKit does not imply physical Safari verification.

Evidence: `work/simulation-031-short.log`,
`work/simulation-031-browser.log`, and
[the preserved 0.3.1 browser result](../work/evidence/runtime/simulation-031-browser-results.json).
The initial short run caught a prepared capture-channel test with no queued
order; its failure remains in `work/simulation-031-short-before-empty-queue-guard.log`.
The shared completion helper now handles that state, and the full rerun passes.

The complete 13-game authored bot matrix passed on 0.3.0 before this boundary.
New-version mission/bot evidence is being collected separately. Earlier victories
and performance recordings are not relabeled as 0.3.1 results.
