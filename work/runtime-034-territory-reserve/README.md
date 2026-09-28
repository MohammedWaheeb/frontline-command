# SY03 Hard bounded reserve — nonterminal acceptance failure

Source `ee8b970b03ce953ecb1175654dc15d36574986b6dac2ef46f7243b26fb55644c`; binary `a88b0b1bb2fb3d619be1b9f8038d96e95040f80addcfabe4dd1e39280d249923`.
Run `20260928T212131Z-sy03-hard-bounded-home-reserve` closed `2026-09-28T21:22:35.070409+00:00`. Only the test commander/helper tests
change. The home alarm recalls at most two tanks, four rifles and two AT from
current owned actors, retains the sentinels and has a 400-tick intention after
the last visible threat. Paid AT is capped at four and AA at two rather than
allowing the previous large AT-heavy queue. All orders/rules remain ordinary.

The main route still **fails the unchanged wait at tick 22613**, with
outcome unfinished. All command assets and the forward supply remain owned;
the final force has four tanks, many rifles and four working haulers. Most
healthy armor remains in the fortified western region, while only a small
rifle contingent reaches the contested eastern approach. The bounded recall
improves home survival but does not solve that strategic allocation.

2713 batches; receipts `{'ok': 2722}`.
Canonical hash `af9ff79e0a4bf582c56689227d9c87ba2f57f2cdbab9f118fa6d25989e63b3b9`. Authoritative failure save/view/ledger checksums
and source/binary after verification pass. Helper tests pass. No mission,
optional or consolidated matrix success is claimed. Process times in run.json
are shared-host correctness only. A separate eastern-force allocation pilot
uses this observed imbalance without changing mission conditions or deadlines.
