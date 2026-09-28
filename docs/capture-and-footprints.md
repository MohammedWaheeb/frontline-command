# Capture, retained foundations and aircraft recovery

This document records the Go implementation decision needed to apply design
section 16 without changing a captured structure's physical size. It describes
runtime behavior, not accepted artwork or completed visual gameplay testing.

## Capturing an occupied structure

The ordinary engineer capture still requires an enemy completed ordinary
structure below 25% HP, visibility and eight uninterrupted seconds at its
entrance. HQs and strategic sites cannot be captured. Engineer damage, moving
away, loss of vision, or a repair reaching 25% interrupts the channel. Both
players can observe the channel where their visibility permits it.

Capture pre-reserves legal, nonoverlapping exits for every living garrison
passenger within two tiles of the existing footprint. Passengers keep their
owner, identity, current HP, paid basis, rank and ordinary unit reservations.
They emerge idle on hold; capture never steals them and does not apply the
50%-HP destruction escape rule.

If any passenger lacks an exit, the transfer is atomic: ownership, passenger
positions, production queues and paid state all remain unchanged. The engineer
shows `state: capture_exit_blocked`, receives a `capture_exit_blocked` owner
event, and retries after one second. The normal capture interruption rules keep
applying during that wait. The event's entity is the engineer and its value is
the target structure ID. UI should explain that exits must be cleared or the
order canceled. One failed exit does not eject only part of the garrison.

Successful capture clears the old active/waiting queues without refunds,
releases their reservations, and does not grant completed research. Existing
owner-specific buffs and obsolete channels/orders are cleared. Existing missile
charges, charge progress and firing cooldowns are not refilled. Capture itself
creates no world actor and may take the new owner over the structure/defense
cap; further construction remains blocked by the ordinary category limits.

## Physical foundation versus operating type

Every structure stores these immutable physical fields from its original
construction/spawn:

- `footprint_width`, `footprint_height`: integer tile dimensions.
- `footprint_type`: original catalog building ID.

A captured air producer changes its operating `type` to the new faction's air
producer and uses the new roster, max HP and service-slot count. Its HP preserves
the previous health fraction, rounded down to milli-HP with a minimum of one.
Its paid basis and physical fields remain unchanged. A safehouse converts to an
ordinary unarmed outpost, retaining no safehouse transit or passenger capacity.
Both conversions take ten seconds without operation. Recapture applies the same
rules to the existing actor and never expands or replaces its foundation.

This explicitly permits, for example, a US-operating airfield on a captured
3×3 Syrian workshop foundation. Enlarging it to the US catalog's new-build 6×5
footprint would overlap terrain, buildings or units and could seal a corridor;
the retained foundation avoids that result. It also avoids silently deleting a
legitimate capture near the map edge or next to obstacles.

The same retained dimensions drive ground collision, navigation, construction
placement against existing structures, scenario placement, entrance approach,
combat edge range, production/passenger exits and service-pad placement. New
construction still uses its own catalog footprint. Physical conversion does not
increment navigation revision because the occupied rectangle has not changed.

`EntityView` and fog `Memory` expose all three physical fields whenever the
building is legitimately observed. Memory retains the last observed dimensions,
not hidden current data. Units have zero/empty physical fields. Save validation
requires dimensions matching the original catalog entry and a legal conversion
family; forged widths or arbitrary footprint origins are rejected.

Claude rendering must use these retained bounds for selection, footprint
outlines, foundation/collision art and appropriate converted-building visuals.
Operating-type icons, roster and faction ownership remain the new owner's.
Do not render the unmodified catalog size over a different retained footprint.

### Renderer acceptance on 28 September

The renderer now resolves building art from the observed `footprintType` while
retaining the operating `type` for orders, production and UI. A captured Syrian
workshop operating as a US airfield therefore requests the original Syrian
workshop sprite. A converted safehouse keeps safehouse geometry. Generic
buildings keep their shared dimensions and change faction art immediately;
actor replacement now considers faction and physical identity as well as type.
Procedural fallback structures and remembered silhouettes use the same retained
physical role. Team paint continues to follow the current visible owner.

`client/tests/render/captured-art-browser.mjs` exercises three actual Go0.3.3
captures: a workshop, safehouse and power station. Its synthetic mission only
arranges initial actors. Ordinary anti-armor fire damages each full-health
structure, the attacker withdraws, and an engineer completes the real capture
channel and conversion outage. All three preserve dimensions, select the
expected art identity, restore the exact saved hash and rewind to the original
owner/art. The generic power station displays the actual US sheet immediately.
Workshop and safehouse shipping sheets remain incomplete, so their native views
explicitly show procedural fallback; this is functional acceptance, not final
building-art acceptance.

Passing source-specific evidence is in
`work/evidence/captured-art/2026-09-28T05-32-10.975Z/`. The preceding failed driver
run is retained: it requested201steps in one call, exceeding the public200step
limit. Splitting that request corrected the harness; no simulation change was
needed. Browser errors and remaining canvases/atlas pages were zero after the
passing run. Two focused runtime cases also cover original physical art and
identity changes across capture/restore.

## Service loss and legal pads

At air-producer capture, old aircraft remain the old owner's units. Their old
home assignments are dropped immediately; living aircraft claim free owned
operational replacement slots in stable actor order before deferred paid jobs.
The emergency endurance maximum is 60 seconds. Grounded aircraft keep their HP
and ammunition and take two seconds to lift off; endurance remains paused while
they are landed. Assignment loss emits `service_lost` for their owner.

Started aircraft jobs in another producer that had reserved the captured home
keep paid cost, supply reservation and work. They request another owned service
slot and wait without progressing when none is usable. They do not spawn with
an enemy-owned home. Captured producer queues themselves are cleared without
refund, as required. Disabled producers retain existing assignments but do not
accept new service reservations until operational again.

A smaller retained foundation does not reduce the new operating type's nominal
service capacity. Landing/production instead checks actual available pads on
or within two tiles of the retained foundation. Pads must fit aircraft ground
radii, passable terrain, other structures, grounded aircraft and ground units;
only the aircraft's own service foundation is exempted from that ground check.
Two planes cannot land on the same physical pad.

If blocked, returning aircraft show `landing_blocked` and continue consuming
ordinary airborne endurance. A finished production job shows `exit_blocked`,
retains its paid/reserved state, and waits rather than spawning inside obstacles.
Clearing the space resumes ordinary landing/production. Rearming and paid repair
keep their existing timers and costs. This is a concrete geometry choice to
preserve both new service capacity and the original captured footprint; congested
captured producers need UI playtesting and balance review.

## Verification

Go tests cover healthy garrison evacuation, blocked atomic exits with save/resume,
interrupted capture, real eight-second capture replay parity, cramped workshop
conversion beside a cliff, repeated recapture, original geometry in combat and
adjacent construction, fog memory, safehouse conversion, research isolation,
unchanged interception charges, capture above both caps, immediate aircraft
rebase, paid remote-job reassignment, six distinct legal pads on a converted
workshop and blocked production-pad recovery. These use synthetic backend
geometry. Converted sprites, crowding readability and multiplayer interaction
still require the Claude UI/assets and browser gameplay acceptance.
