# SY05 current factory route audit

The unchanged current Normal optional route passes at tick11,598 with all three
communication buildings captured and the marked factory still owned. This is a
separate route proof; the frozen original0.3.4 matrix remains93/102 main and12/21
optional. The original failed runs remain intact.

The source is the frozen `runtime-034-territory-perimeter/source` copy, lock
`cd82f1e43a109a01a5ee1f5919bd78c58a261442c25012a4e7fc1b2d780238b6`.
It reuses the verified existing binary
`bb0c8b1f36b0adcd4ac1a655cf7654a3afe6f848cc4a50d6bea6ad1065ba15dc`;
there is no compile, source edit, tactic change or gameplay/content change.
The perimeter delta concerns SY03 only. Its SY05 code already contains queued
rearward Move for non-force-fire infantry and current-cohort perimeter control.

Normal run `20260928T214009Z-factory-normal-unchanged` captures relay1 at1,144,
the optional factory at2,361, relay2 at6,808 and relay3 at11,598.
All937 execution receipts in892 batches are accepted `ok`. The victory trace
contains no surrender/practice order. Midpoint1,145 restore branch, full replay
without seek checkpoints, fresh restart, independent surrender defeat,
defeat-save/replay and debrief checks pass. Final hash
`208f5b1fa31ad986b5d2ca0e24607fe3c83642dd9a32235cf792e2d1a7399c6b`.
The success record includes objectives, exact commands and debrief; it does not
export a final success save. Source and binary verify unchanged after exit.

The earlier Normal AT-destroys-relay artifact predates the current queued Move
fallback. It is historical evidence of that earlier commander, not evidence that
the current fire-control policy needs another change. A possible stale initial
withdrawal list was identified read-only, but this fresh pass does not reproduce
a defect from it. No speculative shared-policy patch is made.

The64.521-second process duration is shared-host correctness evidence only
(`GOMAXPROCS=2`), not a performance measurement.
