# Nonvisual battlefield controls

These utilities implement local interaction state and command intentions for the
Claude-authored battlefield UI. They contain no rendering, styles, asset work,
global DOM listeners, network sends, movement simulation, damage calculation,
prices, faction counters or hidden enemy inspection. The Go simulation remains
authoritative.

## Modules and integration

| Module | Main exports |
| --- | --- |
| `client/src/runtime/interaction.ts` | `BattlefieldSelection`, `selectableOwnEntities`, `currentVisibleEntity`, `sameSelection`, `escapeIntent`, `latestAlertCenter` |
| `client/src/runtime/keybindings.ts` | `SHORTCUT_DEFINITIONS`, `defaultBindings`, `validateBindings`, `remapBindings`, `resolveShortcut`, `resolvePointer`, `ModifierToggles`, `exceedsDragThreshold` |
| `client/src/runtime/command-intent.ts` | `STANDARD_COMMAND_DESCRIPTORS`, `COMMAND_LIMITS`, `planCommand`, `planContextCommand`, `commonCommands`, `batchOrders`, `resolveCommandTarget`, `targetRelationship`, `CommandTargeting` |

Claude connects these functions to its canvas picking, DOM events, portraits,
command buttons and visible acknowledgment states. Input handlers should pass
plain event data and current focus state. The utilities install no listeners and
do not call `preventDefault`; a resolved keyboard intent includes
`preventDefault: true` for the handler to apply.

Reconcile `BattlefieldSelection` against each current **authorized** snapshot,
using a unique session scope such as the match ID or a newly created local session
ID. Changing player perspective or scope clears groups and selection so reused
entity IDs cannot control units from a different session. Supply an additional
selectable predicate for Go/catalog-declared noncontrollable actors, such as
scripted support aircraft. Temporarily disabled combat units can remain selected.

Selection includes only owned, alive, unembarked entities with current positions.
The authorized snapshot entity list is the source of selectable/targetable IDs;
last-seen building memory is never promoted into a visible entity. The renderer
may separately inspect a currently visible enemy through
`currentVisibleEntity`, but that enemy cannot enter the command selection.

## Selection and control groups

`click(id, shift)` selects or toggles one owned entity. Clicking ground with no
Shift clears selection. Box selection takes screen-space bounds from the
renderer and intersects current owned entity bounds. Shift-box removes all
members if the entire box is already selected; otherwise it adds those members.
`sameTypeOnScreen` implements double-click or the remappable same-type shortcut,
limited to the supplied screen viewport.

Control groups 1–9 store detached ID lists. Missing, destroyed, captured and
explicitly noncontrollable entities are pruned on reconciliation. Embarked units
remain in the saved group but cannot be recalled into active selection until they
disembark. Store/append/recall are separate operations. A second recall within the
configured interval returns a camera-center intention; the default interval is
350 ms and zero disables double-tap detection. The independent center-selection
shortcut makes camera centering available without a double tap.

`token` captures the session, player, selection revision and IDs. It remains
stable when selected units merely move, and changes when composition or context
changes. `subgroups()` exposes type-based selection groups without rendering
portraits or guessing unit roles.

`latestAlertCenter` returns the newest actionable, nondismissed alert with a
location and leaves selection untouched. `escapeIntent` gives targeting
cancellation priority over drag cancellation, modal dismissal and opening the
pause menu. A text-entry surface consumes its own Escape behavior; battlefield
shortcuts are suppressed there.

## Defaults, remapping and focus

The required defaults are implemented:

| Input | Intention |
| --- | --- |
| Left-click / drag | Select / box-select |
| Shift-selection | Add/remove members |
| Double-click or T | Select same type on screen |
| Right-click | Contextual command |
| A, then target click | Attack-move |
| Ctrl + ground-click | Force-fire targeting |
| S / H / G | Stop / hold / guard |
| Ctrl + 1–9 / 1–9 | Store / recall group |
| Ctrl + Shift + 1–9 | Append selection to group |
| Shift + order | Queue intention |
| Space / Home | Center latest alert / selection |
| Middle-drag / arrow keys | Pan intention |
| Equal or Numpad Add / Minus or Numpad Subtract | Keyboard zoom intentions |

Additional familiar command keys and unbound optional commands are listed in
`SHORTCUT_DEFINITIONS`; content-specific ability slots start unbound. Commands
whose button needs a specific unit/building/ability ID obtain that ID from the
selected content entry. The `cancel_production` shortcut maps to the wire command
`cancel`. Mouse-wheel deltas and camera zoom bounds remain inputs for the UI's
camera controller; these helpers do not choose artistic zoom limits.

The classic preset uses left-click for a contextual command when a selection
exists and the target is ground or another visible owner. Left-click still
selects own units, left-drag box-selects, and right-click clears selection or
cancels targeting. Target confirmation always preserves the targeted action's
identity, including while modifiers change.

Every registered shortcut may be unbound or assigned up to four physical key
chords. Queue, multiselect and force-fire modifiers and mouse buttons can also be
remapped. `validateBindings` detects overlapping shortcuts, including overlaps
caused by the queue modifier. `remapBindings` applies a change transactionally;
unknown actions, invalid data and conflicts return issues without changing the
existing settings or silently stealing another action's key. Persist valid
bindings through the existing settings store; defaults remain available for
reset.

Text inputs, textareas, selects, editable elements, text-related ARIA controls,
IME composition, disabled input surfaces and already-consumed events suppress
battlefield shortcuts. Pass focus from the actual event target or its composed
editable ancestor, including chat, rather than relying on the canvas's last
focus state. Held-key repeat pans/zooms but never repeatedly stores groups or
casts commands. Optional `ModifierToggles` supports accessible queue and additive
selection modes; clear its state on focus loss and session/perspective switches.
Force-fire remains an explicit held modifier or a separately targeted command.

## Order planning and Go validation

`CommandEnvironment` provides the current authorized snapshot, a
`supports(entity, descriptor)` affordance callback derived from Go/catalog data,
optional sequential `validateBatch` and independent `validateCandidates` callbacks,
a legacy per-order callback, and an optional `isCurrent`
guard. Standard descriptors encode wire/input shape: required target kind,
single/group/per-entity selection, queue support and whether a group command can
be split safely. They do not establish damage layers, range, affordability,
research, aircraft service capacity or actual ability legality.

`planCommand` resolves targets from the authorized entity/field/station/salvage
lists, verifies selection ownership, copies input buffers and returns intentions
plus explicit issues. Mixed unsupported selections do not partially execute
unless `allowPartial` was requested. Ten queued orders are recognized from owned
private snapshot data; the server rechecks the actual queue at execution.

Movement and other equivalent group orders split into at most 64 entity IDs.
An ability is never silently multiplied to bypass that limit. Commands that the
Go API applies to one producer at a time, such as rally and power, become separate
orders. `batchOrders` partitions the resulting intentions into at most 32 orders
per transport batch without truncation. Batches do not bypass the server's
command-rate or pending-command limits and are not automatically sent.

`planContextCommand` uses input priorities and supplied capabilities to choose
move/rally on ground, gather on a known field, salvage on visible salvage,
capture on a known station, and appropriate interaction with a visible entity.
Go advice rejects repair/capture/boarding/layer choices using owned information
and authorized public target properties. Unresolved conditions return
`indeterminate`; this permits an intention but is not a successful execution. A support unit with no applicable hostile action receives
`no_context_command`; the planner does not invent an attack or chase. Friendly
relationships use the snapshot's declared teams, and an unknown relationship
does not become a hostile contextual order.

Use `createOfflineCommandEnvironment` or `createOnlineCommandEnvironment` from
`runtime/advice.ts` to prefetch Go affordances and supply the correct batch
callbacks. Bind their required `isCurrent` guard to session, selection and targeting.
The planner batches the highest remaining contextual candidates by 32, probes only
rejected units' fallbacks, coalesces equivalent chosen intentions, and checks all
final batches with sequential Go validation. Independent candidate approvals do
not reserve resources or construction assignments.

Preview failures such as countdown or replay-read-only rejection propagate for
the surrounding controller to present. A successful preview is advisory for its
current tick. Separate preview calls do not reserve shared resources, and the
actual submitted batch remains authoritative. Rendering may acknowledge an input
immediately, but must not claim accepted purchases, hits or movement before
authoritative results arrive.

The [Go command-advice contract](command-advice.md) now supplies offline
affordances and slot-authenticated LAN advice. Without a validation callback a
plan remains **`unverified`**. The ready adapter batches proposed candidates and spaces LAN requests by at least
260 ms across affordances, candidate probes and final checks. Reuse it for the
match, debounce UI hover updates and cancel stale requests. The final Claude UI
still needs rendered input and feedback acceptance.

Never render `indeterminate` as green placement approval. Online contextual input
needs accurate Go command affordances; returning `true` for every affordance would
choose inappropriate initial candidates. No TypeScript combat simulation is used.

## Targeting cancellation

`CommandTargeting.begin` freezes the action/ability identity and selection token.
Multi-point abilities collect a caller-declared one to six points, then return a
request with the original identity. Selection or session changes cancel the
targeting operation. A completed choice returns a generation number; use
`targeting.current(generation, selection.token)` as `isCurrent` while planning so
an asynchronous preview cannot submit after targeting was canceled or changed.
Clear targeting after the resulting intention is consumed, or explicitly begin
the same command again when presenting a retry.

## Verification and remaining acceptance

On 2026-09-27, `npm --prefix client run typecheck` passed and all 56 then-current
runtime tests passed. The new tests cover owned/visible selection, group pruning,
scope changes, modifier focus suppression/remapping, classic pointer behavior,
hostile ownership and fog rejection, mixed contextual orders, transport limits,
queue bounds, immutable preview inputs and stale multi-point ability targeting.

This is nonvisual utility verification. Actual browser pointer/keyboard wiring,
rendered selection affordances, 100 ms acknowledgment, camera behavior, controller
affordance data, online receipt presentation and visual accessibility still need
integration and rendered acceptance in the Claude-authored UI.
