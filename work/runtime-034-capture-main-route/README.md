# SY05 Hard main acceptance — exact earned route passes all gates

Source lock `cda55b903cef1f9eb78d5fd7d0e40a10528f147dd259b5a99197cedc79c34ad5`;
binary `83f16854356204091564fddeb0e41d486a10d7dba7056b23a9ba054cd1d67b91`.
The MAIN Hard leaf starts the unmodified authored mission and wins at **8313**.
All **659 batches / 707 orders** receive accepted `ok` receipts. Midpoint 1159,
full replay with seek checkpoints removed, fresh restart initial hash, and a
separate ordinary surrender defeat/debrief/save/replay all pass. No practice or
surrender order appears in the victory ledger. The 24.732-second process time is
shared-host correctness, not performance certification.

Final hash: `5fe8b425898b4ba76fd6f0f7775ca55db6f2481f5e4b4391e531802d35c60ca7`.
The entire accepted command ledger is byte-value identical to the earlier
positioned-screen route that won the main mission but failed its requested
factory optional award. The new test-only helper separates tactical route choice
from acceptance assertions: SY05 Hard main can choose the same factory-first
strategy; `requiredOptional`, `finish()`, and the optional tests remain untouched.
The factory bonus is explicitly **false**, and optional Hard is still unresolved.
Nothing converts that old optional failure into an optional success.

Relative to frozen combined proposed 0.3.4 source `ed509668…`, three existing
acceptance test files differ and ten test files are added. All production Go,
protocol, mission and map bytes remain identical; no original file is removed.
Every original failed main leaf now has a separate ordinary successful route.
A new consolidated 102-main / 21-optional run is still required and is held while
the multiplayer browser course is active.
