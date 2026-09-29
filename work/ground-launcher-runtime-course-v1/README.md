# Ground-launcher runtime course

Native and Session-adapter checks pass; rendered payload art is incomplete and
browser integration is pending. No live production source was changed.

Exact integrated Go 0.3.4 base source lock:
`3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750`.
The course adds one test file to a fresh verified source copy. Nine component
fixtures explicitly grant initial launchers, ordinary spotters/targets and, in
four branches, initial damage/empty charge stores. Every change after the initial
replay is ordinary Submit/Advance. This is not paid-opening or balance evidence.

`native-03` passes **92 boundaries**: four factions deploy, pay for actual
shots, pack, move, stop, redeploy and regenerate exactly one charge at a time.
IR's first and second volley events are 30 ticks apart; movement cancels the
second without consuming its charge/cost. Four initially damaged empty vehicles
follow the same movement and deployment state clocks. Each checkpoint has exact
save/hash/owner/actually-visible-foreign agreement and a full replay seek with
checkpoints removed. No foreign private charges are disclosed.

Native receipt SHA: `79740adedb492d3399bd924ab0fda7bde5b64cb9bad5b9b3b36e1af54610a3ab`.
Test source lock SHA: `18e3853ceff952413ebeb52a43061cd68d15197d697f8dcf37d534b3ce829617`.

`oracle-01` exports **534 untouched actual Session protobuf records**
for load, seek and real tick−1 → Step(1) continuation. Perspective is selected
before stepping. Static install feedback is independently checked as empty;
no emitted protobuf field is filtered or fabricated. Save bytes remain exact.
Oracle receipt SHA: `5e7b97787c9636c2e58b7cd50557650166a4673bf9fc8ca3e2d47f158aedeb1b`.

Preserved attempts: `native-01` incorrectly assumed exact clicked-coordinate
arrival and a newly spawned IR launcher with two charges. The fixture actually
spawns with one; arrival legitimately completes within the navigation tolerance.
`native-02` fixed the declared initial full-payload grant, but its attempted text
replacement had not changed the overly strict arrival predicate. `native-03`
checks actual completed order/path and distance below 250, consistent with the
existing engine arrival contract. No game rules were changed.

Run a fresh immutable attempt with:

```sh
python3 work/ground-launcher-runtime-course-v1/run-native.py native-04
python3 work/ground-launcher-runtime-course-v1/run-oracle.py native-04 oracle-02
```

One GOMAXPROCS=1 process ran at a time on the shared browser/Blender host;
these durations are not performance qualification. All processes are closed.
`course-artifacts.tar.gz` preserves the successful and failed native evidence
and all oracle wire files. Source locks preserve exact reconstruction inputs.
The companion private renderer is `work/ground-launcher-pose-candidate-v1`;
matching art proposal is `work/art/ground-launcher-charge-contract-v1`.
