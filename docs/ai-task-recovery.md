# AI recovery from completed healing and failed rallies

The first full authored 0.3.1 matrix passed twelve of thirteen cases. Its
SA-versus-SY game on Port Outskirts reached the ordinary ninety-minute time
limit. The preserved initial state, every admitted command, final save and
replay remain under
`work/evidence/authored-skirmish/final-0.3.1-2026-09-28/pair-SY-SA/`.

Read-only final-state and trace inspection found specific planner traps:

- SA retained 40 movement orders with no actual progress for more than five
  minutes. Most were the barracks' automatic rally at `(26500,41500)`; generic
  attack dispatch only considered units with no current order. Actor649 had no
  explicit AI command after production and had accumulated 2,231 blocked-route
  retries. Three other SA guards retained a destroyed destination.
- SY retained 20 healthy units guarding mobile healing/repair sources. Rifle268
  last received Guard(medic297) at tick7822. Medic297 guarded rifle268 in turn;
  both were stationary from approximately tick7950. The release condition
  recognized repaired units only when their healing source was a building.
- Both sides still had 100 Supply and substantial actual income. Final cash was
  15,902.026 SA credits and 31,940.603 SY credits. This was not an economy that
  had simply exhausted all purchasing power.

`stall-final-audit.json` records each classified actor and its last actual
admitted command. `stall-route-audit.json` records a separate read-only route
probe with unchanged original state hash. Several clustered infantry have no
immediate dynamic path to their current strategic goal, so a planner intention
alone is not sufficient evidence that the dense congestion clears.

## Bounded recovery change

The planner now proposes ordinary validated orders when a unit has healed to
85% at a compatible owned mobile medic/repair team, as it already did at a
repair building. It also releases orphaned recovery destinations; critically
wounded actors retain the existing retreat priority. Unarmed support actors
return to idle duties instead of receiving a combat assault intention.

A healthy armed ground actor whose single Move exactly matches an owned
compatible producer's declared rally can receive the current authorized AI goal
only after confirmed blockage and at least the existing twelve-second
no-progress interval. Active channels, deployed actors, air service, queued
work, recent movement, damaged retreat and unrelated destinations are preserved.
This changes no navigation, collision, costs, unit capabilities or fog access.

Focused race tests pass (`port-stall-recovery/focused-race.log`, 7.097s), including
ordinary movement/save/replay, working-order preservation and unseen-enemy
noninterference.

The original 0.3.1 replay was then independently replayed under a captured
production-source overlay. Its final hash matched the timeout save exactly;
there were zero execution rejections. The same uninterrupted replay exported
unchanged checkpoints at ticks12000 and24000. The replay inspection passed in
267.68s on the shared development host.

Starting from the untouched tick24000 checkpoint, the revised planner advanced
another12000 ticks without manual commands or state changes. Of the actors
classified as stalled or fully healed at that checkpoint, 38 SA and23 SY actors
moved more than5000 millitiles. A separately restored twin and full replay of
this branch matched exactly. This test passed in215.31s; the branch remained an
active match at tick36000, so this establishes actual recovery from congestion,
not eventual victory. Its original hash was
`79437dec8c0806d11b711827098e5948bf36f0c74e4e2285c2c349683ef3a589` and
its final hash was
`9f84f93a3dab1e7aaa32a6a3cb6691abcf8e110a395cce7834d977c0748c5687`.

The preserved logs and source overlays are in
`work/evidence/authored-skirmish/port-stall-recovery/`. The original matrix
folder's `recovery-fork-result.json` contains each tracked actor's original
position/task, accepted commands and movement result. The fresh ordinary Port match (`fresh-match/`) ended by elimination at
tick19720: 16m21s of active play after the five-second countdown. SY won, real
income/production gates passed, and initial/final restore plus full replay
matched hash `8cba23e9d97732cdebea5c3cef10643a2d193366dfea6d4f9b1ec3ef139ed2d4`.
The run passed in8.99s of shared-host wall time; this is functional evidence,
not a hardware timing claim or balance approval.

This first corrected run had one rejected command among1000 executed commands.
Independent replay inspection established exactly why: SA sequence183 at
tick11502 requested `recovery_order` from repair476 and repair716 in the same
batch. The first succeeded and started the shared player cooldown; the second
correctly returned `cooldown`. Both source actors were valid in their owner's
view. This is preserved as a planner duplicate, not mislabeled as a destruction
or visibility race (`fresh-receipt-inspection.log` and the accompanying
`rejection-context.json`).

A final small guard deduplicates each named command-energy faction ability
within the special planner and across selected planning layers. Actor skills
such as Designate and Volley retain independent cooldowns. Two repair actors
now produce one Recovery Order; two Recon Teams can still execute two genuine
Designate orders in the same ordinary command batch. Focused race coverage,
including the earlier recovery/preservation/fog tests, passes in
`focused-final-race.log` (6.840s).

The final guarded planner repeats the ordinary Port elimination at tick19720,
now with all999 executed commands accepted. Initial/final restore and full
replay match hash
`d10a644903091abb9a829797ddaa330efe8bf375a4366ceca315bf04d80d5a26`.
`final-port-match/` and `final-source/` preserve this distinct run/source; its
wall duration was11.76s. No previous artifact was relabeled as final-source
evidence.

The source still reports developmental0.3.1 while this bounded planner fix is
evaluated. Original0.3.1 compatibility and final packaging must be handled
explicitly at the next simulation-version boundary. A final-source thirteen-case
matrix is required before replacing the earlier12/13 report.
