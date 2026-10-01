# Defeat and inactive assets

Design section2.2 makes a defeated player's remaining assets inactive wrecks.
The simulation preserves their owner and physical presence but blocks new
attacks, capture, designation and sabotage. Existing visible attacks release
their inactive target; channels revalidate before completion. A visible attack
order receives `inactive_target`, also available from safe command advice.

Damage resolution independently ignores inactive victims, so an already queued
direct projectile or another damage source cannot turn a wreck into experience
or salvage. Defeated units cannot gain veterancy. A projectile that was actually
fired before its owner lost continues to impact active targets; unfired second
volley shots and delayed unit-spawning operations are canceled. Defeated scan
zones no longer share sight, and inactive structures receive no endgame pulse.

`pkg/sim/defeated_assets_test.go` reproduced attack, capture, designation,
channel-completion, scan, delayed missile and experience defects before the fix.
The corrected tests pass, including an actual rejected order, release of an
existing attack, post-defeat projectile impact, and deterministic save/restore.
These are synthetic regression tests, not authored-map playtesting.
