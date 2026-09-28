# SA05 Hard: capture cohort audit and unchanged diagnostic rerun

Read-only audit, 2026-09-28. No mission, simulation, strategy, resource or deadline
changes; no native/compiler/browser process started during the quiet multiplayer
window. The current 0.3.4 production/content source lock remains unchanged.

## What the driver actually requires

The authored `sa-05-three-positions` main objective requires all three original
marked relays to be owned simultaneously. Losing any required relay to
destruction is failure. Losing every listed command/production/rig asset is
another failure; preserving the original Service vehicle is optional at victory.
There is no mission requirement to own a tank or maintain a particular defender
count. Design §16.3 requires an engineer, current sight, an ordinary structure
below 25% HP and an uninterrupted eight-second entrance channel. The driver's
tank is its chosen controlled damage source, not an additional gameplay rule.

In `source/pkg/sim/authored_campaign_acceptance_test.go`:

- Lines 1020–1026 define `cohort()` as currently owned rifle, AT and tank actors
  whose IDs are **not** in the driver's `reserve` map. It does not mean the whole
  army, all surviving tanks, or specifically paid replacements. Initial tanks
  satisfy this selector too.
- Lines 1255–1281 reserve up to four rifles and one tank after each of the first
  two captures. Those actors remain guards for that captured relay.
- Lines 878–904 replenish each committed relay every 100 ticks to four rifles,
  one tank and one AT actor. Captured sites are processed in ascending ID order.
  Replenishment takes any currently owned unreserved actor of the needed type;
  it does not preserve the last assault tank or check whether the actor is
  already moving with the assault. Newly completed paid tanks may therefore be
  consumed as guard replacements before the assault selector can use them.
- Lines 816–830 additionally reserve up to two non-original rifle squads for
  home defense. `reserve` is written at these three allocation sites and never
  cleared. Dead IDs no longer appear in the view; surviving reserved actors stay
  excluded even if a later change makes their old assignment unsuitable. The
  site loop skips a no-longer-owned site without releasing its survivors.
- Lines 973–991 attempt ordinary paid production every 600 ticks, including two
  queued tanks. A queue attempt is not a completed replacement: affordability,
  Supply, producer state, work and travel remain real simulation constraints.

`clearGuards()` records `waitingForRelief := len(cohort()) == 0` once at entry
(line 1038). Only that entirely empty case waits for at least three actors and a
tank before its first dispatch. An infantry-only cohort is nonempty, so it skips
the tank gate. The gate is not reapplied if a tank dies or becomes reserved while
acquiring/clearing the guards. Immediately after `clearGuards`, lines 1168–1177
search the remaining cohort for a tank and fatal if absent. There is no paid
replacement wait at that boundary. These exact control choices permit an empty
assault cohort or an infantry-only cohort while required-site tank guards remain
alive.

The progress log's `army19` comes from the different `army()` selector in
`authored_tutorial_acceptance_test.go`: all currently owned, unembarked armed
ground units, including reserved guards, AA and recon. It cannot establish that
an unreserved capture tank exists.

## What the preserved failure proves

The 15:32 pilot logs relay captures at ticks 1156 and 5619, then
`no surviving paid capture tank`. Its last earlier progress point at tick 4788
reports 19 army actors and 852,620 milli-credits. The direct fatal bypassed the
old failure writer. No final save, final owner view, final tick, actual terminal
outcome or complete command ledger exists for that pilot.

Therefore the source proves how the selection can exclude living guards, but the
old artifact does **not** prove that living tank guards actually remained at the
fatal moment, that every tank died, that the whole cohort was empty, or that the
mission had ended. No retrospective final state is manufactured.

## First next execution, only after explicit quiet-window release

Reuse the already compiled diagnostics executable:

```text
work/runtime-034-diagnostics/runs/20260928T161842Z/sim.test
-test.run=^TestAuthoredCampaignCaptureCompletion$/^sa-05-three-positions$/^hard$
-test.count=1 -test.timeout=30m -test.v
```

Run from the diagnostics copy's `source/pkg/sim` directory, GOMAXPROCS=2, with a
new unique `FRONTLINE_MISSION_EVIDENCE` directory. Remove the diagnostic child
probe environment variables so this runs only the real unchanged Hard mission
leaf. No compile, broadened matrix or extra tactic variant is needed.

Verify before and after:

- Source lock `9313438021d25fe211e214b50d516c3ee4b5827c8cf90148663a09f141042aa3`.
- Executable `8791a92ca420ab997ca3bc7c9943299f716b336de9ea5367ae5ede3840f04edb`.
- The only differences from old `e4fcd239…` are the proven fatal diagnostics and
  their tests/bookkeeping, never gameplay or capture tactics. The original
  `7226b09a…` binary and 15:32 log remain preserved separately.

Record the exact command, environment scope, source/executable digests, full log,
exit code, host conditions and artifact digests. The new cleanup captures the
actual final authoritative save, owner-1 view, completed receipt ledger and any
in-flight attempt, without advancing the world. It does not fabricate a defeat
or turn a driver fatal into a successful mission. If this leaf unexpectedly
passes, preserve its existing full acceptance gates; do not call one leaf a new
consolidated matrix.

Stop at that result boundary. Inspect only owned/permitted facts to establish:

1. Actual final tick, outcome and mission objective flags.
2. All own tanks and their health, current orders and positions; other own
   infantry/AA/recon; relay ownership and health; nearby currently visible threats.
3. Own factory completion/power/queue/payment/progress, credits and Supply, so
   absence of a completed free tank can be distinguished from a production stall.
4. The last accepted guard/assault/production commands, with rejected receipts
   retained. Driver reservation maps are closure-local and are not authoritative
   save fields; infer no exact membership solely from actor position. If their
   remaining ambiguity matters, propose a further diagnostic-only allocation log
   before changing a tactic.

Only then propose a bounded ordinary tactic correction from the actual owned
state. Do not borrow a guard, extend the acquisition deadline, add a free unit,
edit objectives or claim impossibility based on this source audit alone.
