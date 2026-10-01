# Original building art and simulation integration

The inventory has 61 faction-specific buildings covering the design's 19 types.
The original US headquarters and power station already have complete initial
sprite sets. `assets/pipeline/blender/models/building_roster.py` now authors the
remaining 59 variants, with 2,618 required source poses. These are specifications
and models, not a claim that all buildings have been rendered or approved.

## Visual approach

Each role has an identifiable function: open supply gantry, twin factory bays,
radar mast, repair boom, bunker firing slits, interceptor racks, aircraft apron
or faction-specific strategic machinery. Faction variants change both massing
and equipment. US buildings use modular steel frames; Iranian buildings use
battered industrial walls; Syrian buildings use patched sheets, brick and
awnings; Saudi buildings use pale buttresses and shaded facades. Warm instrument
lights and limited team-paint bands retain tactical contrast. Geometry is
original; no C&C model or texture is copied.

The common library supplies construction slices, scaffolding, disabled/low-power
lighting, damage, critical damage and rubble. Roles add actual doors, machinery,
charge racks, service arms and weapon assemblies. Editable Blender sources,
paired team masks, projected hardpoints and 1×/2× atlases remain part of the
production contract. A single sequential Blender worker avoids competing for
this host's GPU and memory.

## Current bounded review

`work/art/building-roster/pilot/` holds isolated source snapshots, pose-order
checks, selected-frame renders and native-scale contact sheets. The first group
covers Iranian HQ, Saudi factory, Syrian barracks, US radar and US gun turret.
All five now pass bounded numerical and visual review after correcting the HQ's
command silhouette, uncovering the barracks production door and including the
whole turret in portraits. Independent turret ground shadows exposed a renderer
ordering defect; all actor ground shadows now draw behind its body and weapon.
An actual pixel check changes 1,741 ground pixels and zero of 3,552 opaque base
pixels when toggling the turret shadow. Damage hides the separate weapon and
shadow together. These are pilot checks, not full building production approval.

A second group now passes bounded review for the Saudi airfield, Iranian
interceptor battery and strategic site, Syrian safehouse/power, and US supply.
Its 102 selected poses, 189 pose-order comparisons and 60 UI checks have no
numerical failures. Root inspected the native contacts. The strategic site's
first hatch pilot was rejected despite numerical passes because it revealed
solid gold disks; the corrected dark wells and more readable interceptor noses
were rerendered and accepted. That review used model SHA
`320d2de9e9d0b02b19e236e288ef476b66580842eed981a9cb1052880b2070d2`.
Historical source hashes, rejected versions and native before/after crops stay
in the pilot evidence tree. No pilot writes shipping sprite directories.

Seven further role pilots pass bounded review: US tech, Saudi repair depot,
Iranian outpost, US bunker, Saudi AA post, Iranian drone hub and Syrian air
workshop. Their 117 selected poses, 314 source-pose comparisons and 70 UI checks
have no numerical failures. The repair depot's first service arm merged into
the doorway at native size; a separate articulated apron arm now reads clearly.
A real Blender comparison proved the other 58 specs and 2,590 poses unchanged.

The remaining US, Syrian and Saudi strategic-site pilots also pass local review:
63 selected poses, 132 source-pose comparisons and 30 UI checks. US has three
flight-status panels and an uplink gimbal; Syrian Rebels has three dispatch
consoles with radio links and an improvised operations shelter; Saudi has four
articulated defensive relay plates. These forms follow the actual operations
without implying aircraft dispatch for Syria or a missile launch for Saudi.
The first US candidate folded ready panels before activation; it was rejected
and replaced by continuous movement from the ready pose. That rejected pilot
and the native before/after comparison remain in the evidence tree.

The current frozen model SHA is
`2a02082931443050f811e892bf64e1628f416239cae45cf90a9d43b469fcd39e`.
The three strategic corrections preserve all 56 other specs and 2,486 source
poses exactly. Ten hinge checks cover ready/activation continuity, parked
low-power/disabled states and unchanged charge-lamp progression. See
`work/art/building-roster/strategic-pilot-acceptance.json` and the native contacts
for the bounded evidence. Full building production still requires coordinator
approval; source checks and selected pilots do not certify unrendered poses or
final gameplay composition. Claude's full-game visual review remains pending.

A separate completed insertion adds six HQ production frames. Browser testing
found the missing production state; visual inspection then found a raised
shutter revealing a solid wall. A dark inset aperture corrected that defect.
The six frames were rerendered, the full HQ repacked, and 15 source/frame/metadata
checks passed. Before/after evidence is retained in
`work/art/building-insertions/`. This is a reviewed correction to the existing
HQ, not approval of the unrendered roster.

## Connection to game state

The renderer uses the Go snapshot for construction and selling progress,
enabled state, health and production activity. Own power status comes from the
permitted economy view. Own interceptor charges and aircraft service assignments
come only from private owner fields. Enemy economy, charges and service slots
are not inferred. Strategic charge is the deliberately public design signal.

The native and Go/WASM browser tests observe actual production, low-power and
disabled states, plus selling at 500/1000 with the reversed construction frame.
Damage thresholds choose damaged at 50% and critical at 25%. Separate live
turret layers are hidden when construction or damaged building plates already
contain that assembly. Role-state and privacy tests accompany this mapping.
Full rendered weapon, service, safehouse and strategic-site acceptance requires
those assets to finish production.

## Completed family pilot gate

The combined gate now covers 21 accepted variants across all 18 source role
families: 367 selected renders, 891 source forward/reverse pose comparisons and
230 UI checks. The original Saudi factory and US radar UI gaps are closed by
separate current-source supplements, with 50 old-to-current pose comparisons
proving their historical gameplay samples still apply. All 59 new building
variants still need full production and individual pixel review. See
`work/art/building-roster/production-planning.md` for counts, exact inventory,
local timing estimates and the explicit production authorization boundary.

## Approved repair-arm correction

The original US repair export passed structural checks but its working arm was
hidden at the bay trim. An isolated US/IR/SY correction reuses the accepted SA
open-apron articulated arm. Parent reviewed all three native contacts and the
paired UI, then approved source promotion and full three-asset rerenders.
The active model hash is now
`a905465687806e58bc1dabbfa5f770111b0b040288dc3c3417e2f5aa98a34c56`.
Actual Blender parity proves all 56 unrelated buildings / 2,534 poses unchanged.
The old failed US export and source/lock are preserved byte-for-byte in
`work/art/repair-arm-pilot/production-before/` (136 files). See the pilot's
`review.md` and `promotion.json`; full corrected export acceptance is recorded
per asset after rendering. No service-building or aircraft source changed.
