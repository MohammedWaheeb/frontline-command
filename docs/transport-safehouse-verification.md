# Transport and safehouse acceptance evidence

This covers design sections 12.3, 16.2 and canonical scenario 25.5(7), using
ordinary Go orders, channels, projectile impact, damage, cleanup, save/restore
and replay. It uses synthetic backend geometry, not authored game maps or UI
acceptance. No unit price, health, damage, capacity or duration was retuned.

## Existing coverage retained

The existing suite already checks atomic reservation of two safehouse exits,
AI APC boarding/travel/unloading, AI safehouse transfer, garrison firing and
unloading, neutral-garrison ownership, helicopter endurance drops and return to
base, and healthy evacuation on capture. The new acceptance files concentrate
on interruption boundaries, simultaneous actions, loss and congestion gaps:

- `pkg/sim/safehouse_acceptance_test.go`
- `pkg/sim/transport_acceptance_test.go`

## Every preparation boundary

The safehouse fixture uses `fixtureMap()` (64×64 synthetic map), seed 913,
player 1 Syrian/player 2 Iranian, and no AI. Owned safehouses stand at
(14,18) and (38,36) tiles. A rifle and engineer board the source using an
ordinary two-actor Board command. Their starting health is 123.456 and 99.999
HP. They retain their identities, owners, Supply and health throughout a
canceled transfer.

The setup can have completed Prepared Exits research or an active Rapid
Transfer window. Those are prepared test-state prerequisites, not a claim
about the time or cost of acquiring them. The rapid case also has Prepared
Exits, proving the durations do not stack.

| Mode | Preparation | Injected impact boundaries | Outcome |
|---|---:|---:|---|
| Normal | 120 ticks / 6 s | 242 | Both endpoints cancel atomically at every offset 0–120 |
| Prepared Exits | 100 ticks / 5 s | 202 | Both endpoints cancel atomically at every offset 0–100 |
| Rapid Transfer | 60 ticks / 3 s | 122 | Both endpoints cancel atomically at every offset 0–60 |

All **566** impact cases passed. Offset zero is the command-acceptance tick;
the last offset is the completion tick. The fixture schedules a real projectile
impact, so the ordinary frame order resolves damage before channel completion.
Each cancellation emits one owner-only `transfer_canceled` event. Neither
squad teleports, takes passenger damage, loses capacity reservation or receives
an exit lock on cancellation.

A further 24 cases destroy either endpoint at acceptance, halfway through,
on completion, or one tick after completion in all three duration modes:

- Destination destruction through the completion tick cancels and leaves both
  healthy passengers in the source.
- Source destruction through the completion tick produces ordinary garrison
  escape at distinct legal exits with half of each passenger's previous HP.
- Destruction one tick after completion does not retroactively relocate or
  damage already exited squads.

## Reproducible command traces

In the standard safehouse fixture, the ordinary Board command is accepted at
tick 1 and completes at tick 41. Submit the following transfer on the next tick:

```json
{"kind":"ability","type":"transfer","entities":[6],"target":7}
```

The source is entity 6, destination 7, rifle 8 and engineer 9 in this fixture.
The accepted transfer starts at tick 42. With no interruption:

| Mode | Destination warning starts | Transfer completes | Exit firing/capture lock ends |
|---|---:|---:|---:|
| Normal | 102 | 162 | 202 |
| Prepared Exits | 82 | 142 | 182 |
| Rapid Transfer | 42 | 102 | 142 |

For each damage case, preload one enemy rifle projectile targeting entity 6
or 7 with impact tick `42 + offset`, then run the same transfer command. This
is a deterministic initial-state event used to test impact ordering; it is not
an exposed player command or a bypass of combat resolution. The helper
`transportImpact` contains its complete definition.

`TestSafehouseTransferSaveReplayAndExactExitFireLock` saves the normal transfer
at tick 161, restores it, advances across completion, checks the 40-tick exit
lock, then compares both engine hashes. It also records, encodes, decodes and
seeks the replay to tick 261 with an identical hash. The emitted test log
records the actual hash, rather than documenting a hash that future schema
changes would invalidate.

For congestion, seal a nine-tile square centered on the destination with
synthetic blocked terrain. An initial rejected transfer retains its Rapid
Transfer window. A transfer accepted while clear and blocked before completion
cancels without moving either squad. Save/restore preserves that outcome. After
clearing the exits, a new legal transfer succeeds; an already accepted Rapid
Transfer window is not refunded. These terrain changes are test setup actions,
not a player ability or authored map edit.

## Simultaneous commands and information boundaries

- Two transfers submitted in one batch yield `ok` and `transfer_active` in
  stable command order. Only one transfer per player is active.
- An explicit source Unload replaces preparation, emits `transfer_canceled`,
  and unloads at the source through the normal timer. A later transfer from
  another source can proceed; there is no leaked network reservation.
- A squad that was still boarding when preparation began cannot join late and
  obtain a shorter transfer. Its ordinary boarding channel is interrupted;
  only the originally embarked squad transfers.
- The destination warning is absent before the final three seconds, visible
  to a player who sees the destination, and disappears when that area is fogged.
  The warning exposes no source identity, passenger list or hidden geometry.
- Exited squads cannot fire or capture for exactly two seconds. Normal firing
  and accepted capture resume when that lock expires.

## Ordinary transport outcomes

The transport fixture uses the same synthetic map, seed 915, owned player-1
transports at (25,19), and ordinary Board/Unload commands. The helicopter has an
owned airfield. Test projectile impacts occur while loading and unloading.

| Transport | Capacity | Boarding | Unloading | Damage during channel |
|---|---:|---:|---:|---|
| US APC | 3 squads | 40 ticks | 40 ticks | Does not cancel |
| Syrian troop technical | 2 squads | 20 ticks | 20 ticks | Does not cancel |
| US transport helicopter | 2 squads | 60 ticks | 60 ticks | Does not cancel |

All three complete on the exact expected tick, retain Supply, preserve passenger
HP on ordinary unloading, and produce distinct legal exits within two tiles.
Movement of a boarding carrier or loss of either participant cancels boarding.
Five simultaneous boarders into a three-seat APC produce exactly three embarked
squads in stable actor order; the other two remain outside without capacity
reservations. The result saves and restores without changes.

| Destruction case | Passengers | Outcome |
|---|---:|---|
| Ground APC, clear exits | 3 | All escape at 50% of previous HP |
| Ground APC, blocked exits | 3 | All lost |
| Bunker, clear exits | 2 | Both escape at 50% of previous HP |
| Bunker, blocked exits | 2 | Both lost |
| Airborne helicopter | 2 | Both lost |
| Landed helicopter, clear exits | 2 | Both escape at 50% of previous HP |
| Landed helicopter, blocked exits | 2 | Both lost |

A congested ordinary unload retains healthy passengers and retries once per
second. A one-exit/two-squad case unloads the first squad safely and retains the
second; clearing space later unloads the second at a distinct exit. Complete
blockage and subsequent recovery remain deterministic after save/restore.

## Demonstrated failures corrected

The new tests exposed and corrected these implementation defects:

1. The exit lock blocked firing but did not block engineer capture.
2. The required final-three-second destination warning was missing.
3. Late boarders could join an already preparing safehouse and transfer with
   shortened preparation.
4. Explicit Unload silently canceled a transfer without its cancellation event.
5. Blocked ordinary unloading provided neither a distinct state nor an alert.
6. A passenger created before its carrier could die after its own cleanup
   iteration, then disappear without a destruction event or lost-value entry.
7. Cargo death could reward an earlier attacker with experience and a kill.
   The regression produced 250,000 experience and one kill before the fix;
   both are now zero for that cargo loss.

Cleanup now resolves passenger escape/loss before the single destruction
accounting pass. Each lost actor receives exactly one destruction event and
lost-value entry regardless of creation order. Cargo deaths clear prior combat
contributions; they cannot pay experience to an attacker who previously damaged
that passenger. Ground escape remains half-health and grants no invented rescue.

## UI integration contracts

The following data is Go-authored and uses existing view/event schemas:

- `View.Warnings` with `kind: "transfer"`, destination `position`, owner and
  completion tick `at`. `source` is zero and there are no exit coordinates. Render a
  destination preparation warning only while this authorized warning exists.
- Entity `state: "unload_exit_blocked"` while an unload is waiting for space.
  The first failed exit attempt emits owner event `unload_exit_blocked`, with
  the carrier ID, position and remaining passenger count in `value`. Repeated
  blocked retry ticks do not repeatedly emit the same alert. The channel remains
  `unload`; its next attempt is one second later.
- `transfer_canceled` remains owner-only and now also covers explicit Unload
  replacement. No enemy source is disclosed by that notification.

Claude still owns the visible markers, explanatory text, icons and alerts.
These tests establish the runtime contract, not that those visuals are finished.

## Verification and limits

```sh
go test ./pkg/sim -run '^TestSafehouse|^TestTransport' -count=1 -v
go test -race ./pkg/sim -run '^TestSafehouse|^TestTransport|^TestPassengerExitReservations|^TestCapture|^TestRaid|^TestDefeated|^TestAlreadyFired|^TestTelemetry' -count=1 -v
go test -short -race ./pkg/sim -count=1
go vet ./pkg/sim
```

Evidence:

- `work/evidence/safehouse-acceptance-before.log`: original exit-lock and
  warning failures, with the boundary-damage and endpoint-loss cases passing.
- `work/evidence/transport-acceptance-before.log`: original blocked-unload
  feedback failure alongside passing duration and loss cases.
- `work/evidence/transport-safehouse-acceptance.log`: final detailed outcomes
  for the 16 new test families and their timing/capacity/destruction cases;
  passed in 2.216 seconds.
- `work/evidence/transport-safehouse-focused-race.log`: focused race run,
  including adjacent capture, raid, inactive-actor and telemetry regressions;
  passed in 39.542 seconds.
- `work/evidence/transport-safehouse-short-race.log`: full short simulation race
  run after the implementation corrections; passed in 94.370 seconds. The
  separate long balance matrices are excluded by `-short` and retain their
  dedicated evidence runs. `go vet ./pkg/sim` and `git diff --check` also passed.

These deterministic cases do not establish authored-map route quality,
multiplayer rendering clarity, accessibility of the warnings, or human tactical
balance. Existing airlift endurance-return and garrison-combat tests remain
part of the broader suite. No deployment or UI/asset changes were made here.
