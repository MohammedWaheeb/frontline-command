# Optional Hard repairer reassignment — real mission defeat

Source lock `8950b35bf329f08f8f28998a1741674ff240be45ff8d176385a5ab51a347061f`;
binary `0c972b6a90dff58f9db6fea9eff03ae79fd4c61de483c014b0cb796d49bcc4f5`.
The selector uses current owner-view state only: a complete fully repaired own
site, available own engineer, no visible armed ground threat, and stable nearest
selection. Focused healthy/damaged/threatened/foreign/working cases pass.

Factory capture remains tick 2484; relay 2 capture remains 6121. At 6883,
engineer 44 receives an ordinary Move after its reservation at healthy relay 70
is released. The mission nevertheless fails at 8516 when relay 2 is destroyed.
Factory 79 and relay 70 remain owned at full health; the engineer survives.
The original 6000-tick cohort wait stops at real defeat. This is not an empty
selection failure or a successful optional route.

The earlier saved owner view at tick 6883 shows relay 2 defenders chasing
7–10 tiles north: tank 540 has 3 health; four rifles are near Y 56–59k while
the relay is at Y 65.5k. The driver repeatedly orders Attack Move/Attack toward
visible threats within 14 tiles. The authoritative design §5.2 instead defines
ordinary Guard as engagement within six tiles followed by return to its anchor.
A separate next pilot will use actual Guard for optional Hard site defenders,
leaving Go, costs, resources, objectives and wait bounds unchanged. No navigation
or engine defect is established by this failed route.

The unique run retains fatal save, owner view, complete receipt ledger, and
before/after source and executable verification. Shared-host correctness only.
