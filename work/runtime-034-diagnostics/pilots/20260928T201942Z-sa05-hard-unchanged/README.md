# SA05 Hard unchanged route: actual nonterminal driver failure

The approved rerun used source `9313438021d25fe211e214b50d516c3ee4b5827c8cf90148663a09f141042aa3`
and existing binary `8791a92ca420ab997ca3bc7c9943299f716b336de9ea5367ae5ede3840f04edb`.
No compile, strategy, Go rule, mission, resource, objective or deadline changed.
The original 15:32 pilot remains separate. Both runs log captures at ticks 1156
and 5619; only this new run has an actual final diagnostic state.

The driver again fatals at its missing capture-tank check, at **tick 6856**.
The authoritative outcome is **not finished**. Two required relays are owned at
full health; the third remains unowned. Neither failure objective is complete.
The original Service vehicle is alive. This is an unearned route interrupted by
a test-driver cohort requirement, not an actual mission defeat.

State hash: `188b3d66f7261bf79c68df652a2970b7beaf403b32831f1f073069c22c1430b6`.
Save SHA-256: `2c2a9ac9c62e585f9ce6ce632588f5f7b41b59be6f9b2f7e67fd44ce030b9202`.
Cleanup records state unchanged and no capture errors. All three artifact lengths
and SHA-256 values were checked against the manifest after execution.

## Owned evidence and exact selection failure

One own tank survives: ID 34, health 903/1000, idle near the first relay. It was
included with that relay's guards in sequence 328 at tick 6757, and repeatedly in
the preceding guard orders. At the fatal boundary the cohort selector excludes
only reserved actors of the relevant own type. The surviving tank therefore
remains reserved; this conclusion follows from selector + current view + fatal,
not merely from the tank's position.

The third-relay approach was dispatched at tick 6620, sequence 321, with IDs
473, 635, 819, 907, 911 and 959: an infantry-only group with no tank. The whole
cohort was not empty, so the old `waitingForRelief` condition did not run its tank
readiness gate. The later immediate tank requirement then failed.

Factory 18 is complete, enabled, at full health and actually producing a paid
SA tank: work 1002/1200, 1,400,000 milli-credits already paid. Five further tanks
are unpaid waiting jobs. The bank holds 720,000 milli-credits; army Supply is 51
plus 6 reserved; power is 340 capacity / 205 demand. These facts distinguish
pending legal reinforcement from loss of production. They do not guarantee its
future survival, arrival or the affordability of every queued job.

The complete ledger contains **336 submitted batches, 355 orders and 355 `ok`
execution receipts**. There is no in-flight attempted batch at this driver fatal.
Preview-denied intentions were never submissions; this count does not relabel
those as accepted orders. The final state also contains 13 own rifles, four AT
squads, two AA units and a recon unit, so a broad army count would be misleading
as evidence of a free capture tank.

## Next bounded driver correction

Root has authorized a separate test-only successor, not a change to this source:
require a completed unreserved tank and a real usable assault group even when
infantry remain; preserve one free assault tank when replenishing guards; allow
normal paid production to supply replacements within the existing acquisition
budget. Recheck after clearing guards so later losses cannot bypass readiness.
Keep actual defenders and ordinary production rules, and retain every failed
leaf. No extra resources, time extension, objective change or guaranteed victory
claim is involved. Execution of that successor remains held for coordination.

The run took 13.393 seconds on a shared Apple M4 host with the single Blender IR
producer active, GOMAXPROCS=2. This is correctness evidence, not throughput or a
quiet-host benchmark. The native process is closed.
