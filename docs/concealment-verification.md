# Concealment and Ambush verification

The current regression suite verifies four-second acquisition for the three
Syrian concealment roles, ordinary/recon/scout detection at one millitile before,
on and beyond each exact radius, detector sight blockers, overlapping detectors,
continuous six-second Ambush preparation and its exact 30-second cooldown.

Three failing cases exposed real defects: a landed scout detected through a
cliff using another unit's shared sight, an unfinished foundation contributed
detection despite supplying no sight, and a continuously detected squad retained
the first-shot Ambush bonus. Detection now uses the detector's valid sight and
resets continuous concealment. The combat check rechecks detection in the firing
tick, including after an enemy moves into range.

The owning commander's `Entity.private.ambushReady` is the authoritative indicator.
It is not sent to opposing or allied commanders as private data. It reflects
the real rifle-class weapon, timer, detection and cooldown checks used by combat.
The UI should use this field instead of reconstructing concealed time locally.

Two saved scenarios in `work/evidence/concealment/` replay the actual initial
state and command sequence without checkpoints. The undetected rifle's first
shot inflicted 10.08 HP and its next shot 8.4 HP against a light-armored rig;
with an enemy recon detector both shots inflicted 8.4 HP. The prepared fixture
explicitly sets a first-shot cooldown to allow observation of the acquisition
boundary; it does not claim an ordinary economic opening or balance conclusion.

Run `go test ./pkg/sim -run '^TestConcealment' -count=1`. Set
`FRONTLINE_BALANCE_EVIDENCE=../../work/evidence/concealment` to refresh saved
setups, commands, outcomes and verified replay files. Broader splash/re-conceal,
movement and mission journeys remain part of the next acceptance pass; this is
not complete coverage of required playable suite item 6.
