# Simulation 0.3.2 compatibility boundary

Simulation 0.3.2 corrects deterministic bot recovery and scheduling. Healthy
combat units leave mobile medics or lost recovery targets, and confirmed stuck
producer rallies can receive ordinary new orders. Working or queued movement,
active channels and low-health retreats are preserved. One bot plan schedules
each shared faction ability once, while per-unit abilities remain independent.
No pathfinding, collision, income or combat rules were changed by this correction.

The previous 0.3.1 boundary added explicit aircraft rebasing and correct finite
queue completion. Its evidence and exact scope remain in
[the preserved 0.3.1 record](history/simulation-031-compatibility.md).
Earlier 0.3.0 changes covered planner target knowledge and depot access.

Native and browser engines now publish simulation 0.3.2, adapter 1, protocol 1,
and unchanged content hash
`318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`.
Save envelope and content formats are unchanged. Older development saves/replays
remain preserved and exportable for their original engine; headers or state are
never silently rewritten to bypass compatibility checks. This version remains
an implementation checkpoint, not the completed release.

## Verification

Focused recovery and faction-scheduling race tests pass. The final AI-source
Port match ends through ordinary elimination at tick19720, with all999 submitted
commands accepted, exact initial/final restores and full replay. That recorded
run still reports 0.3.1 because it predates this metadata boundary. The earlier
90-minute failure and intermediate cooldown rejection remain preserved.

The fresh 0.3.2 native short suite passes across simulation, WASM adapter,
server, storage, content and validation. Rebuilt Chromium, Firefox and WebKit
integration passes native/WASM parity, IndexedDB saves, cold offline reload,
exact-byte account copies, isolated workers and two-browser multiplayer,
reconnect and committed results. Valid-checksum0.3.1 saves are rejected while
preserving both the original bytes and the active match. Exact browser evidence
is [recorded separately](../work/evidence/runtime/simulation-032-browser-results.json).

The full thirteen-game authored bot matrix and native race suite are still
running. Earlier product, aircraft, terrain, audio and performance captures
retain their precise earlier source/version identity.
