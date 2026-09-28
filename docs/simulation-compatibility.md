# Simulation 0.3.3 compatibility boundary

Simulation 0.3.3 prevents bots from repeatedly attempting to capture a station
owned by a publicly defeated player. The planner now uses its existing public
active-opponent check; neutral stations and active opponents remain eligible.
The authoritative capture rule, fog access, movement and combat are unchanged.

Simulation 0.3.2 corrected healthy-unit recovery, blocked rally orders and shared
faction-ability scheduling. Its full 13-game matrix reached ordinary elimination,
with exact restores and complete replays. Receipt review found eight actors lost
after planning, two moving friendly actors crossing a construction footprint,
and 104 repeated attempts on the defeated player's station. All 312 replayed
public snapshots for the latter showed the owner defeated. This was a planner
defect, not a timing rejection. The original evidence is preserved in
`work/evidence/authored-skirmish/final-0.3.2-2026-09-28/` and the
[0.3.2 compatibility record](history/simulation-032-compatibility.md).

The previous aircraft and queued-task changes remain documented in
[the 0.3.1 record](history/simulation-031-compatibility.md).
Native and browser engines target simulation 0.3.3, adapter 1, protocol 1,
and unchanged content hash
`318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`.
Save envelope and content formats are unchanged. Older development saves/replays
remain preserved and exportable for their original engine; headers or state are
never silently rewritten to bypass compatibility checks. This is an
implementation checkpoint, not the completed release.

## Verification

Six focused station-planner cases and existing observed-target/ability tests
pass with the Go race detector on frozen source `f2b41e8`. They cover neutral,
active, defeated and allied ownership, including a valid neutral alternative
after an invalid defeated-owner candidate. Eligible ordinary captures execute.

Native host and browser worker now publish 0.3.3. The complete native short suite
passes. Chromium, Firefox and WebKit pass actual native/WASM parity, IndexedDB
saves, cold offline reload, exact-byte account copies, isolated workers and
two-browser multiplayer/reconnect/committed results. Valid-checksum0.3.2 saves
are rejected with original bytes and the active match preserved. Exact results
are in `work/evidence/runtime/simulation-033-browser-results.json`.
The final authored thirteen-game bot matrix remains in progress. The full0.3.2
short race suite also passed, with the subsequent0.3.3 station change separately
covered by focused race tests. Earlier rendered product, terrain,
aircraft, art, audio and performance evidence retains its original source and
version identity; it is not relabeled as this build.
