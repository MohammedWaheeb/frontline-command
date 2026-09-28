# Exact SY03 failed-save continuation — natural victory

This is a separate diagnostic, not a rewritten acceptance result. The original
22,606 test timeout remains failed; its source/save/owner view/ledger are unchanged.
The authored mission has **no defeat timer**, only3,600 ticks of uninterrupted
control and its ordinary command-asset loss condition.

Source `23897cb8586f39b91b984953c05da71bda6dbb7af5feff953120f9ddba4d975c`; binary `53f4d87236fd88f4e432262063b0c800ddc206b4436e0b822a87644563e766de`.
Run `20260928T213001Z-sy03-original-failed-save-continuation` restores that exact failed save and reconstructs its complete
accepted command trace independently from the original opening. Both branches
match the original canonical hash. Then ordinary existing orders, paid queues,
AI and game rules advance with **zero additional human commands**.

The mission naturally wins at **24,858**, exactly **2,252 additional ticks**
(112.6seconds), as expected from1,348/3,600 progress. No sampled hold-counter
reset occurs. Save/restored and full from-opening reconstruction agree through
final hash `39aee9544d4b3175a17b3b1edde920faf331236c308d3f5c8d0e82f27117faab`; the continued final save reloads correctly.
Owner view, final save, hundred-tick objective samples and exact outcome are
preserved. The diagnostic guard was6,000 extra ticks, not an authored deadline.

This supports explicitly revising the acceptance commander's wait in a separate
fresh full-gate run. It does not by itself provide that run's restart/surrender
coverage, nor does it retroactively pass the original test. Build3.393s and
trace/continuation15.716s are shared-host process times only.
