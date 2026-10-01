# Go-owned command advice

Command affordances and advisory previews are supplied by the same Go simulation
in local WASM and the LAN host. They never replace authoritative order execution.
The browser planner handles input shape, splitting and selection conventions; it
must not recreate faction capability, production or targeting rules.

## Affordances

`Engine.CommandAffordances(player, ids)` accepts up to 64 unique living owned
entity IDs and returns:

```json
{
  "tick": 120,
  "player": 1,
  "entities": [{
    "id": 2,
    "commands": ["build", "move"],
    "abilities": [],
    "builds": ["power"],
    "trains": [],
    "research": []
  }],
  "player_commands": ["ping", "repair_reserve", "surrender"]
}
```

The example lists are abbreviated. Every list is an array, including when empty.
Entities and string lists have stable sorted order. Empty `ids` requests only
player commands. Unknown, dead, duplicate and non-owned IDs fail without revealing
why that foreign ID was unavailable. Embarked or autonomous support aircraft have
no controllable affordances. Finished matches have no command affordances.

These lists describe command families and selectable type IDs. A listed building,
unit, upgrade or ability can still require technology, money, power, cooldown,
capacity, an appropriate target or a living source at execution. The UI can show
locked catalog options without reproducing those rules.

## Preview meaning and fog

`Engine.PreviewOrders(player, orders)` accepts the normal bounded command batch
and returns advisory `OrderResult` values at the **examined current tick** with
sequence zero. A real submitted order receives its own sequence and execution
result later. Advice never advances time or consumes real sequence/rate counters.

| Code / accepted | Meaning |
| --- | --- |
| `ok` / true | Current owned-state checks passed on an isolated copy. |
| `indeterminate` / true | Submission is reasonable; unresolved conditions remain. |
| Any other code / false | An owned-state or authorized-public-target check failed. |

**`indeterminate` must never produce a green placement approval.** It is not a
successful placement, ability activation, route, attack or transport reservation.
Commands can always fail later because the world or ownership changed.

Construction advice shares Go's real checks for owned prerequisites, resources,
structure/defense/unique caps and owned build radius. It deliberately never checks
placement collision. In particular, a concealed hostile actor cannot be discovered
by probing whether a proposed foundation is accepted. Abilities and practice tools
are conservatively deferred, including safehouse exit checks. Ordinary movement
previews do not run navigation or promise a reachable route.

Guessed hidden entity IDs and nonexistent IDs both yield `target_not_visible`.
For visible non-owned targets, advice checks only public type, ownership, completed
state, quantized health and weapon layer rules; their private passengers, production,
resistance or cooldowns are not inspected. These checks reject impossible contextual
capture/board/repair choices before the planner considers attack or escort. Such
target commands still return `indeterminate` after their public checks pass.

Exact owned-only queue changes are evaluated sequentially on the detached copy.
After the first deferred effect, later orders are also deferred: advice does not
invent a resource reservation or assume a proposed foundation already exists.
Separate preview requests likewise do not reserve resources. This contract applies
to offline play too, so local command hints do not reveal hidden opponents.

## LAN endpoint

`POST /api/v1/matches/{id}/advice` requires the commander's **match slot** token in
`Authorization: Bearer ...`. A profile token or observer ticket is insufficient.
Tokens belong in the authorization header, never the URL.

The JSON body is `{ "entities": [...], "orders": [...], "independent": false }`;
either array and the optional boolean may be omitted. `independent: true` requests
contextual candidate probes rather than a sequential final batch. Orders use normal Go JSON keys (`queued`, `position`, `points`). The
response is the affordance object above plus `results`, always an array. No save,
full state, mission definition or enemy private data is serialized into a response.

Bounds: 64 KiB request body, 64 affordance IDs, 32 orders, 64 entities and six points
per order; four requests per second and one in flight per authenticated slot;
eight concurrent expensive requests across the host; two-second request deadline;
300 advice requests per minute per IP in a separate admission category. The match
actor captures an immutable tick and only copies a save when orders are requested.
The internal advice snapshot omits pending submissions, replay logs and event/result
history, so its cost does not grow with the command-log window. Restore and
detached preview run outside the live match actor. Timeouts do not
interrupt Go in the middle of a bounded clone; the worker slot stays held until it
returns. There is no unbounded clone queue or automatic retry.

## Browser adapter

`runtime/advice.ts` exports `OnlineCommandAdvice`:

- `request(ids, orders, {signal, isCurrent})` gets both responses at one tick.
- `affordances(ids, options)` gets command families.
- `preview(orders, options)` gets `{tick, results}` for a sequential batch.
- `candidates(orders, options)` gets independent contextual probe results.
- `cancel()` / `dispose()` abort outstanding requests.
- `adviceSupports(...)` supplies the planner's Go-backed capability callback.
- `adviceLegality(...)` preserves `checked`, `indeterminate` or `rejected` certainty.

Batch proposed orders into one request. Do not call per animation frame or
independently for every contextual candidate. The adapter spaces request starts
by at least 260 ms, sharing the budget across all three request types. Reuse one
`OnlineCommandAdvice` instance for the entire match. Debounce hover/selection
refreshes by at least 250 ms in the UI and cancel obsolete targeting; do not start
a separate planning operation on each animation frame. The adapter enforces one pending
request, bounds response size, verifies player/ID/tick/result correspondence,
rejects redirects, uses no browser credentials, discards superseded targeting
responses and performs no retries. It sends no actual orders. The caller must
bind `isCurrent` to session/selection/target identity and discard affordances when
ownership or selection changes. Use authoritative execution results for feedback.

## Ready-to-use planner environment

`createOfflineCommandEnvironment(runtime, snapshot, ids, options)` and
`createOnlineCommandEnvironment(advice, snapshot, ids, options)` return a
`CommandEnvironment` ready for `planCommand` or `planContextCommand`. Options
require `isCurrent`, bound to the session ID, selection token and targeting
generation; they also accept an abort signal. Affordances are loaded once for the
selection in groups of 64. All asynchronous boundaries check cancellation, and
returned snapshots/intentions are detached from the caller's buffers.

```ts
const advice = new OnlineCommandAdvice(hostURL, matchConnection); // once per match
const environment = await createOnlineCommandEnvironment(
  advice, currentSnapshot, selection.ids,
  {signal: targetingAbort.signal, isCurrent: stillSameSessionSelectionAndTarget},
);
const plan = await planContextCommand(selection.ids, chosenTarget, environment);
// Show plan.issues. Only an unchanged targeting generation may submit plan.batches.
// plan.validation === 'indeterminate' is unresolved advice, not green approval.
```

The planner prepares candidate input shapes locally, then probes the highest
remaining priority for all selected units in batches of at most 32. Only rejected
units move to a later candidate round. It does not send an attack plus an unused
boarding fallback for every rifle unit. Go rejects publicly impossible capture
or board choices before an indeterminate successful candidate can be chosen.

Candidate mode allows only `move`, `rally`, `repair`, `resume`, `board`, `guard`,
`escort`, `capture`, `attack`, `gather`, `salvage` and `unload`. Every candidate is
checked independently using shared read-only Go command validation, with **one**
Restore per request and no per-candidate clone. A probe cannot reserve a foundation
builder or displace another alternative's order. Abilities, construction, training,
research, selling and resource changes are rejected in candidate mode.

After choosing and coalescing compatible intentions, the planner rechecks **all**
final orders, including singletons, with sequential `validateBatch` calls matching
wire batches. Independent approvals never imply shared affordability or reservation
success. For example, two rigs can independently be eligible to resume a foundation;
the final sequential check reserves the first and rejects the second. Explicit
commands likewise use sequential batch validation rather than individual previews.
Multiple separate batches remain `indeterminate`, since advice does not reserve
resources across requests. Execution remains authoritative.

Custom environments can implement `validateBatch` and `validateCandidates` with
these same contracts. A sequential-only validator cannot stand in for independent
candidate probes. Legacy `validate(order)` remains available for existing local
callers, but the ready adapters never invoke one RPC per unit. Custom contextual
candidate lists must stay within the contextual whitelist above.

## Verification

Go tests exercise fog-equivalent hidden blockers and IDs, private enemy state,
visible contextual choices, exact owned queue previews, deferred batch effects,
no live mutation, slot authentication, bounded work and separate IP budgets.
Restart tests cover unsorted original spawn slots and saved mission/practice resets.
TypeScript tests cover slot-token transport, uncertainty, malformed responses,
request bounds, stale targeting and no rate-limit retries. Visual placement colors
and the final Claude-authored command UI still need integrated browser acceptance.

## Independent production menu status

Each owned entity's `production_status` describes all its build/train/research
options in the existing bounded affordance response. The UI no longer needs a
separate network request and state clone for every production button. Each entry
contains `kind`, `type`, `code` and an optional `waits_for`.

`code` is the real enqueue admission result for training/research. A job may be
queued without enough credits, Supply or service space: `waits_for` describes why
it cannot start now, and must not disable an otherwise legal unpaid queue entry.
An existing job yields `queued`, rather than predicting the future economy. These
checks share the exact enqueue and payment/allocation helpers with execution.

Build entries use the same owned prerequisite, affordability and cap checks as
construction. Passing them returns `indeterminate`: the actual build radius,
visible site and occupancy still require normal placement and execution. Enemy
units, hidden blockers and enemy economy never enter menu status. No gameplay
state, credits, jobs, service reservations or command sequences are mutated.

Go tests compare admission with actual queues, cover empty-credit and full-cap
waiting, disabled producers, research duplication, unchanged hashes and enemy
noninterference. The network parser rejects undeclared options, duplicates and
invalid status combinations while retaining optional-field compatibility.
