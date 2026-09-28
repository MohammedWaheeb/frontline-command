# Aircraft service presentation audit

Read-only review against design§4.3, §7.2–7.4, §22–23 and the partial
`fx.unit.no_landing_slot` row in
`work/art/effects-opus-v2/dynamic-consumer-audit.md`. Source receipt is
`work/evidence/aircraft-service-status/audit-receipt.json` (HEADa261b57 plus exact
reviewed file hashes). No production code, Go rule, protocol, asset or test was
changed or executed for this review. Existing tests below were inspected, not
rerun. The multiplayer recovery proofs are unrelated evidence.

## Actual reasons and current display

| Authoritative situation | Current source contract | Presentation consequence |
| --- | --- | --- |
| Air production cannot obtain an active free reservation | `productionAllocation` returns `service_full`; `updateJobs` puts it on the producer. Started jobs and living aircraft count against capacity. | Production reasons already reach the command UI. `actorStatus` has no badge for this owner-only state. |
| A started air job retains its reservation but its home is disabled/sabotaged | `updateJobs` also sets `service_full`, even if capacity is not full. Active outages preserve assigned slots. | The existing reason “This base has no unreserved service slots…” overstates the cause when used for this production state. |
| Airborne returning aircraft has a reservation but no physical legal pad | `serviceLandingPosition` fails actual terrain/actor clearance within the retained foundation area; `updateAircraft` sets `landing_blocked`. | Existing “Landing area blocked” badge is accurate. This is physical obstruction, not capacity exhaustion. Do not derive blockers or a pad point from enemy/private state. |
| Aircraft loses its home and cannot get a new active free reservation | `loseService` sets private `Home=0`, caps remaining endurance at1200ticks, and retries admission on later ticks. A grounded aircraft gets a separate40-tick emergency-takeoff deadline. | Existing airborne owner-only “No service base” is accurate but does not appear during grounded emergency takeoff. The2-second takeoff badge is not the60-second endurance limit. Selected App telemetry already shows actual endurance and `Home LOST`. |
| Destroyed/captured home is replaced immediately by another owned free reservation | `loseService` still emits `service_lost` after assigning the replacement and ordinary Return. | This event does **not** establish that no landing slot is available. |
| Landed aircraft is rearming but its reserved base becomes inactive | `updateAircraft` retains `ServiceWork` and returns without work while `!home.Active(tick)`. Low power instead continues work at a slower rate. | Current “Aircraft servicing” badge does not distinguish a disabled base from active rearming; the base's current owner-authorized `enabled` flag can distinguish the pause. Do not label low power as fully paused. |
| Explicit Rebase cannot reserve the requested home | Receipt/advice codes are `owned_service_required`, `service_unavailable`, `incompatible_service`, `aircraft_servicing`, `aircraft_recovering`, `service_full` or `rebase_not_queueable`. Actual departure can also reject `takeoff_blocked`. | These are order-specific refusals, already given readable reason strings. A rejected rebase does not remove the aircraft's existing home and must not create a persistent “no home” badge. |

The key sources are `pkg/sim/{service_loss,service_geometry,aircraft,
aircraft_rebase,production_advice,economy,visibility}.go`.
`visibility.go` strips `service_full` and related production/economic states
from foreign actors, including allies. `landing_blocked` remains a public state
on an otherwise authorized visible actor. `Home`, orders and service work are
owner-private; no hostile capacity or ownership inference is justified.

## Concrete findings and minimal correction proposal

1. **Missing owner producer badge and misleading shared reason.** Add a static
   owner-only `service_full` badge labeled “Aircraft service unavailable” to
   `actorStatus`. Use a generic production explanation that covers no free slot
   **or** an unavailable reserved base. Keep the precise Rebase receipt meaning
   if its caller supplies context; do not claim a specific capacity count from
   `service_full` alone. Current raw state/production text remains available, so
   this is a badge/causal-text gap, not an absence of all UI feedback.
2. **Queued Return is labeled as current flight.** `actorStatus` currently uses
   `private.orders.some(order => order.kind === 'return')`. An airborne aircraft
   performing `move`/`attack` with a later queued Return receives “Returning to
   base” while still outbound. Require the current first order to be Return.
   Automatic airlift `unload` followed by Return is a separate preparation phase;
   show “Unloading before return” only if desired, not an active-flight claim.
3. **Paused rearming is not identified.** For an owned landed aircraft with
   positive `serviceWork`, resolve only its disclosed owned home in the current
   snapshot. When that home is disabled, show “Service paused: base disabled”
   instead of the active servicing badge. Missing home data is unknown; do not
   infer its cause. Resume removes the pause. This requires no simulated timer
   or new wire field.
4. **Adjacent audio false positive.** `audio/director.ts` announces the authored
   “No landing slot is available” line for every own `service_lost` event. Go
   emits it even after a successful immediate reassignment. Check the current
   authorized own aircraft's private home before using that specific line.
   If it has a replacement home, a neutral “Service base changed” caption is
   truthful; absent/dead/currently unknown aircraft data must not be treated as
   proof of no capacity. No new audio asset is required for a caption fallback.

The smallest production scope would be `app/actor-status.ts`, focused status
tests, one context-appropriate service reason in `content/labels.ts`, and the
small audio guard plus audio tests. `ActorStatusDetails` and the renderer already
consume badges and would not need a new UI component. Keep the current static
symbol plus text and priority rules; reduced-motion users need no separate pulse
to receive the warning. The manifest row should remain partial until real Go
snapshots and native rendered review exercise the added states.

## Focused tests proposed before implementation

- Own producer with `service_full` gets one generic unavailable badge; an ally
  or enemy carrying a deliberately injected identical private state gets none.
- Started job with inactive reserved home does not claim “all slots full”. A
  restored snapshot removes the badge as soon as the current state changes.
- Airborne `[move, return]` and `[attack, return]` do not say “Returning”; current
  `[return]` does. Landed current Return stays servicing/landed, matching the
  existing retained-order regression. Airlift `[unload, return]` is not flight.
- Own landed positive service work plus current own disabled home gives paused;
  enabled low-power home remains servicing; missing/foreign home cannot provide
  a guessed reason. Privacy remains unchanged when malformed foreign private
  fields are supplied to the pure presentation helper.
- Grounded40-tick emergency takeoff with `home=0`, airborne unassigned1200ticks,
  successful new-home admission and ordinary completion remain distinct. Do not
  use the takeoff deadline as the endurance deadline or invent expiry for a
  blocked pad. Existing selected endurance telemetry remains authoritative.
- Audio `service_lost` with replacement home produces no “No landing slot”;
  current own `home=0` may warn. Foreign/absent/dead actor, repeated event IDs,
  discontinuity and rewind must not replay or fabricate that warning.
- Actual Go fixtures: capacity and paid reservations from
  `aircraft_rebase_test.go`; live admission priority, disabled/low-power service
  and production wait states from `drone_service_acceptance_test.go`. Add a
  bounded actual physical-pad blockage fixture if no equivalent saved course is
  available: this review did not find a `landing_blocked` assertion. Export authorized
  snapshots for a bounded browser course instead of mutating product views.

No extra reason field is necessary for the minimal generic badge, current-order
fix or inactive-home check. A future exact distinction between unavailable
capacity and a disabled reserved producer would need either caller context or
explicit authoritative reason metadata; it must not be guessed from a foreign
actor roster or by reproducing Go reservation logic in JavaScript.

## Authorized minimal implementation

After the read-only handoff, root authorized only the described client fixes.
`actor-status.ts` now displays the owner-only generic service-unavailable badge,
requires the first order for an active Return label, distinguishes an inactive
current owned service building from active rearming, and retains the no-home
warning during actual grounded emergency takeoff. A malformed home pointing to
a non-service building cannot diagnose a service pause. No new timer, capacity
count or missing-home cause is calculated.

The shared `service_full` reason now asks the player to check free slots and
whether the base is enabled, covering both actual Go meanings. Audio uses only
the current living owned aircraft and its current private home: `service_lost`
with a replacement produces no false no-slot announcement. This minimal patch
does not add an extra reassignment caption or an audio asset. Existing event
deduplication, rewind and discontinuity behavior is unchanged.

Six focused regression cases were added. Before the source changes, five failed
and the duplicate/reset safety test already passed; the preserved red log has
15/20passing. The changed source passes **20/20** isolated status/audio tests and
both application/runtime TypeScript checks. Tests were built only into
`client/.test-aircraft-service-status`, without touching the shared
`.test-runtime` output. Source and log hashes are in `implementation-receipt.json`
beside the original audit receipt. No broad runtime suite, browser, host, Go
build, wire change or shipping runtime update occurred in this slice.

These are logic checks using typed authorized-view fixtures. Actual Go snapshot
and rendered native-pixel checks on the next combined frozen product remain
pending; the partial FX coverage row has not been promoted by these unit tests.
