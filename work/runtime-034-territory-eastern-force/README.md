# SY03 Hard eastern mixed force — original bounded-test failure

Source `242c51f4fb427b2088c2038c192b6042bc1c2cdf8421b0d96fe83919edd327e7`; binary `56141bd268abb7075bf52373a89410daeeb2b9e4e2ce35a72dcfda668f10a98c`.
Run `20260928T212424Z-sy03-hard-eastern-mixed-force` ends at tick22,606 with **unfinished** outcome. Home command
assets and a substantial force survive. Both regions are controlled and the
uninterrupted objective counter is1,348/3,600. No enemy is currently visible
in the final owner view. 2276 batches, receipts `{'ok': 2285}`.
Final hash `87803299165914187f2034ba9f9f69e8b78ece8e8435d5da5b8787c1a41f0ebe`. Save/view/ledger and all failures are preserved.

The22,000-tick wait after opening is only an acceptance-driver bound. **There
is no authored SY03 defeat timer.** The actual mission requires3,600 continuous
ticks controlling two approaches and separately fails on losing command assets.
Do not present this test timeout as a mission loss or proof of impossibility.

The separate [exact saved continuation](../runtime-034-territory-continuation/README.md)
wins naturally at24,858 with no additional human command. This original test
attempt remains failed. A separate fresh run explicitly revises its test-only
budget and requires the full ordinary acceptance gates.
