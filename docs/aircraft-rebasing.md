# Aircraft home reassignment

US04 asks the player to shift service assignments to a backup airfield. The
previous interface exposed Return only; that returns to the existing home.
Home replacement after a base is destroyed is still automatic, but deliberately
selling a healthy base should not be the required evacuation control.

The selection tray now provides **Rebase** for aircraft. Choose it and click an
owned, completed, enabled compatible airfield or drone service building. An
ordinary right-click on a compatible owned service building also requests
rebasing. Return and its remappable shortcut keep their existing meaning.

## Authoritative command

This uses `return` with an entity `target`; the protocol shape is unchanged.
Targetless Return remains queueable. Targeted Return is immediate and cannot be
queued, because it changes the reserved home slot at command execution. A whole
selected group must fit, with no partial reservation changes. Living aircraft
and paid started production jobs both retain their reservations. An aircraft
already assigned there is not counted twice.

The selected aircraft must match the building's service role. Another player's
slots, incomplete, disabled or selling bases, active servicing and emergency
recovery are rejected. A grounded departing group must have clear airspace
before any home changes. Advice defers this geometry check to execution so a
hidden aircraft cannot be discovered through preview results.

Changing home never changes position, HP, ammunition or endurance. Grounded
planes take off; all aircraft fly to a normal reserved landing point and use the
existing service and paid repair rules. Loss of the newly selected base still
invokes ordinary home recovery and updates any explicit Return target.

## Verification status

The focused native suite passes all 12 aircraft types through ordinary flight,
landing and servicing, an in-flight save/restore, and full replay. Separate
regressions cover whole-group capacity, paid reservations, sequential advice,
no free replenishment, all rejection classes, blocked takeoff and home loss.
Both TypeScript checks and 209 runtime tests pass, including targeted command
shape, unchanged ordinary Return, current-visibility filtering and Go-controlled
context selection.

Actual US04 product input passes original-save import, native/WASM start-hash
agreement, Rebase to the backup field, ordinary service, quick-save, right-click
Rebase back and unchanged targetless Return. The first run exposed a missing
Return entry in the read-only candidate allowlist; that failure is retained.
The correction also proves independent advice does not consume service slots,
while a combined over-capacity order remains rejected. Enlarging the command
tray fixes the clipped aircraft command rows at 1600×900 and 1280×720.

Evidence: `work/evidence/aircraft-rebase/source/work/evidence/aircraft-rebase/`,
04:08 failed and 04:15 successful runs, exact build hashes and captured source
provenance. This isolated client is deliberately the pre-height renderer. The
terrain agent separately verifies the serviced plane remains visibly above its
service footprint in the current renderer; neither screenshot is substituted for
the other source revision.

US04's optional route also passes all three difficulties using genuine hostile
damage, paid repair, service and evacuation of both original jets, followed by
normal timed victory, midpoint restoration, full replay, restart and failure
checks. The bounded UI rebase journey does not itself claim that full route.
The shared runtime build still needs the subsequent candidate allowlist change;
the 04:25 product run also passes at 1280×720 / 150% interface scale, with first-row visibility, last-command scrolling and normal Return/Rebase still working. No page or console errors occurred.
