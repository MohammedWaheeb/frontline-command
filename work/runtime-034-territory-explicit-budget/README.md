# Fresh SY03 Hard with explicit test budget — passed

Source `4c102f4c378ea1a77f23d609b50ee1a7b833161932e521d3cf9565a413dfbd4a`; binary `afdc894c70fe5dd8edc8dd2a14e33ce3992bdc5a1f4113e54f313835e943c058`.
Run `20260928T213118Z-sy03-hard-explicit-test-budget` passes from the ordinary opening at **24,858 ticks**
(20m42.9s), with the same eastern-force tactic as the earlier unfinished22,606
attempt. The sole source delta changes the **test driver's bounded wait** from
22,000 to30,000 ticks for SY03 Hard, documenting why. Other missions retain
their original bounds. No authored timer, predicate, difficulty, resources or
simulation rule changes. SY03 has no authored defeat deadline.

The separate exact saved continuation demonstrated that the old boundary won
naturally2,252 ticks later without another human command. This fresh run keeps
executing its ordinary policy and reaches the same completion tick. Its hash
differs legitimately because those later player commands differ from hands-off
continuation: `28558e7a6b93427ffab92203eb6968ffcfc2cac1eb6ef641d84d6ffe2dcaeb4b`.

All 2630 submitted orders in2621 batches are accepted.
The genuine three-minute hold and Scout Mark optional are complete. Midpoint604
restore, full replay without seek checkpoints, fresh restart, separate ordinary
surrender/defeat save/replay and debrief gates pass. Source/binary verify afterward.
The original failed acceptance remains failed in its own immutable evidence.
This proof is separate from the faster exterior-screen route that passed at12,687
under the old test bound. No consolidated matrix is claimed.

Build3.375s, focused tests0.921s, full mission acceptance78.334s are shared-host
correctness process durations, not performance measurements.
