# Match debrief telemetry

The simulation now records actual paid production, completed construction,
casualties, repair and tactical missile expenditure, interceptor launches,
station control time, economy samples, and important match events. These are
saved deterministic state and survive replay and save/load. Ordinary building
sales do not count as combat casualties. Cargo-loss accounting is checked by
the transport acceptance tests.

`PlayerSnapshot.debrief` exists **only when the entire match has finished**.
An eliminated player's still-active match receives no debrief. Delayed observers
get it only in their delayed finished snapshot. It includes player identity,
faction/team/color, final economy and surviving forces, explored tile count,
per-type production, metrics and a bounded event history. Each view is an
independent copy. No live opponent economy/timeline is sent to clients.

`metrics.timeline` samples at the opening, every20 simulation seconds and at the
final tick. Credits, income, spending and repair/missile costs use the same
mill-credit integer units as the engine. `station_control_ticks` accumulates one
tick per owned active station, so two stations held for10seconds yield400ticks.
It is objective control time, not a fabricated percentage of territory. The
explored tile count records actual historical sight, not unit kills or score.

`interceptors_fired` counts fired interceptors. It must not be relabeled as
successful interceptions or hit accuracy. `lost_value` preserves the engine's
existing lost paid-value total; it includes asset removal such as sales and is
not equivalent to enemy damage or combat casualties. Display the separate unit/
building casualty fields with their actual labels.

Important events retain the first32 and latest224 entries, with `omitted_events`
for an explicit truncated-history message. Do not invent missing history or
interpolate events that never occurred. Mission objective/checkpoint text is
captured after the mission runtime has filled it. The ordinary mission snapshot
supplies final objective status alongside the debrief. `MissionProgress.version`
now reports the actual mission definition revision for progress provenance.

Completed service history stores public player summaries and the debrief, rather
than serializing complete private Player state. Access is still governed by the
authenticated participant ledger. Imported files remain local data, not proof of
online rating or verified public achievements.

`telemetry_test.go` covers real paid queue output, no active-match disclosure,
save/restore equality, view immutability, actual repair spending, station time,
sale exclusion, bounded milestones and malformed future samples. Protocol tests
verify exact int64 counters above JavaScript's safe-integer limit and mission
revision transport. Actual Go/WASM Chromium, Firefox and WebKit runs passed
finished-result save/load and replay equality, live/replay-opening privacy,
matching two-client final snapshots, and participant-only persisted history.
The new rendering still requires product-level verification.
