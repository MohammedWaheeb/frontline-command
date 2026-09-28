# SY05 Hard paid home defense / relief pilot — actual mission loss

Frozen source lock: `74d5b7b4541c3e0b00de78c15fec7551240c21fec92d52cfd17562802025c864`.
Run `runs/20260928T210536Z-sy05-hard-capture-defense/` closed at 21:05:58 UTC,
2026-09-28. Binary: `44a8db06526a4d02d2175c9c8c1e603ce3008ec2a11be5fb5f27f6fea0eea158`.
Only the test campaign commander changes from the proved SA capture-ready source;
all 345 other files remain identical, including production and content.

The SY05 Hard main route now purchases the existing home turret, retains a
completed free tank before capture dispatch, and keeps paid reinforcement
queues running instead of taking the discretionary forward-outpost/turret detour.
The distinct factory-capture optional route is untouched. Costs, deadlines,
mission objectives and game rules are unchanged. Readiness tests pass.

This strategy **fails** at tick **6,143**: a required communication building
is destroyed and Go reports `mission_failed`. It captures relay 1 at 1,147 and
has a real three-actor/tank group ready for the second approach at 3,043. At
failure the home HQ, supply center and both production buildings survive, but
relay 1 does not. The final owner-authorized events identify damage and loss of
owned relay 70 at (50,500,82,500); several visible US anti-tank squads remain
nearby. The assigned engineer 44 still has a repair order for relay 70, so this
is not the prior missing-repairer bug. Four rifle guards have attack orders on
a visible anti-tank squad; another AT guard has attack-move. Removing the
forward defense did not establish sustainable relay control.

All **308 submitted orders** are accepted. The fatal-cleanup save, owner view
and complete command ledger are preserved and checksum-verified. Canonical hash:
`bfae39ad7e7ef43abb41999313de136b3ac9cfd014471483d32358aba6aaf61b`.
No optional route is earned. No hidden attacker identity or cause is inferred
from the private save; the analysis uses only the owner view and issued ledger.

Build 3.301 seconds, readiness 0.930 seconds, mission 17.621 seconds. These are
shared-host correctness process times, not performance evidence. Source and
binary verify unchanged afterward. This failed leaf does not update the frozen
93/102 main or 12/21 optional matrix counts. A later tactic must preserve both
forward defenses and a sufficient advancing force; this pilot is not promoted.
