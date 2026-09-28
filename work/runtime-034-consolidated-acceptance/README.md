# Prepared consolidated ordinary mission acceptance — NOT RUN

This runner uses immutable source in `../runtime-034-capture-main-route/source`,
lock `cda55b903cef1f9eb78d5fd7d0e40a10528f147dd259b5a99197cedc79c34ad5`.
Its production Go, bindings, mission and map bytes match original proposed 0.3.4
`ed509668…`; only three existing and ten added acceptance test files differ.
All nine previous main failures have separate successful routes, but that does
not establish that the combined tactics have no regressions. Three optional
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
