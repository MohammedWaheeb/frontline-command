# Simulation 0.3.0 compatibility boundary

Simulation 0.3.0 includes the deterministic planner and depot-access corrections
from `9e37ce6` and `09eaae7`. AI now explores when it knows no usable field,
rejects invalid observed ability/capture targets, replaces a lost sole hauler
through ordinary paid production, and checks emergency production legality.
Human and AI haulers can choose bounded legal alternate depot approaches when
their radial unloading point is crowded. These changes alter future outcomes.

The save envelope format, protocol 1 and rules content 2.0.0 are unchanged.
The simulation identifier changes from 0.2.0 to 0.3.0. Old development saves and
replays require their original engine and remain preserved/exportable; neither
headers nor stored state are silently migrated. Historical evidence remains
associated with its original source and build hashes.

Native and browser WASM are rebuilt from the same current Go sources. Both
publish simulation 0.3.0, adapter 1, protocol 1 and content hash
`318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`.
This version number does not mean the full game is ready.

## Verification

The complete native short suite passes after the boundary, including simulation,
WASM adapter, server, storage, content and content validation. A focused native
regression checks valid-checksum saves claiming 0.2.0 and 0.0.1: both produce a
structured incompatibility error, retain exact input bytes and leave the active
match unchanged.

Actual Chromium, Firefox and WebKit each pass native/WASM state parity, ordinary
save/replay, IndexedDB persistence, cached offline reload, exact-byte account
sync, isolated workers and two-browser multiplayer/reconnect/results. Each also
loads a correctly re-checksummed 0.2.0 negative fixture and verifies the same
incompatibility and preservation behaviour. Real Safari hardware is not implied
by the Playwright WebKit result.

Evidence is `work/simulation-030-short.log`,
`work/simulation-030-browser.log`, and
[the current browser result](../work/evidence/runtime/browser-results.json).
The final 13-game authored bot matrix is being rerun under 0.3.0 separately;
earlier matrices are not relabeled as new-version evidence.
