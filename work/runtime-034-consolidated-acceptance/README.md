# Prepared consolidated ordinary mission acceptance — NOT RUN

This runner uses immutable source in `../runtime-034-capture-relief-gunner/source`,
lock `cc20b7c036d5625ce863a282eef58a702a0606c36d43ebc70bb77309763c33dd`.
Its production Go, bindings, mission and map bytes match original proposed 0.3.4
`ed509668…`; only three existing and eleven added acceptance test files differ.
All nine previous main failures have separate successful routes, but that does
not establish that the combined tactics have no regressions. Two optional
routes remain unresolved and the runner will retain their actual results.

The prepared plan contains exactly **102 main and 21 optional leaves**, runs
serially with GOMAXPROCS=2, records source/binary/artifact hashes and each exact
leaf result, and keeps fatal diagnostics for failed routes. Execution is held
until root releases the active multiplayer browser course. Planning alone builds
or runs no Go code:

```sh
python3 work/runtime-034-consolidated-acceptance/run-authored-matrix.py
```

After explicit coordination, use `--run main --execute-after-release`, then
`--run optional --execute-after-release`. A `--select` run is explicitly a subset
and must never be represented as the full matrix. Existing evidence is preserved
in unique run directories; no old save or outcome is relabelled.
