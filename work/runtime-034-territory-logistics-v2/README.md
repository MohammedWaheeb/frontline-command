# SY03 Hard observed logistics — nonterminal acceptance failure

Source lock `73bdd6126bd0ca14e6eace4899f4ba0cd2b24dd8e6cbbe81cfe29e27eafc1889`.
Run `runs/20260928T211109Z-sy03-hard-observed-logistics/` closed 21:12:13 UTC,
2026-09-28. Binary `fe1c283d97c10e810e150dc2694c2d16f186f7a6e7ce16b5f5d977e3a37e85a0`.
The first copy's compile error is preserved in ../runtime-034-territory-logistics;
this successor adds only explicit field-ID/order-ID conversions. Production and
mission content remain identical to the frozen proposed 0.3.4 engine.

The ordinary commander builds a paid supply center at (40,500,78,500), tick
3,351, after the existing first outpost/turret. It chooses only a disclosed,
positive nearby field, cancels only unstarted army jobs once to fund construction,
then resumes ordinary queues and paid hauler replacement. Bounded site/deadline
checks remain. Four focused helper tests pass. The original mission wait remains
22,000 ticks after the opening; no funds, units or victory flags are granted.

This strategy **fails acceptance at tick 22,606 with outcome unfinished**.
It does not constitute a game defeat. All 1,435 submitted orders in 1,426 batches
are accepted. Home factory/HQ and most of the army are lost before the deadline;
the final owned view contains barracks, radar, power and the concealed scout.
The scout flag alone does not earn an optional route without mission victory.
Final hash `9af7b43aebb54f39f2ca036f7e151f251721ffe0dfb8eea5ff52b896ae6e63b9`.
Fatal cleanup preserves the exact authoritative save, owner view and ledger;
checksums and unchanged source/binary pass. Build 4.426 seconds, focused tests
1.028 seconds, mission 58.548 seconds on a shared host, not a timing certification.

The separate ../runtime-034-logistics-diagnosis reconstructs this exact trace
and exports eight authorized owner views, leaving gameplay and hashes unchanged.
It shows why improved hauling alone did not fix permanent regional force
allocation. This failed strategy is not promoted as a completed main route.
