# Prepared consolidated ordinary mission acceptance — NOT RUN

This runner uses immutable source in `../runtime-034-observer-reboard/source`,
lock `757b31785a0c0b869cca06ad01299ef199fd124989e722dce559c2919dddab8d`.
Its production Go, bindings, mission and map bytes match original proposed 0.3.4
`ed509668…`; only three existing and eleven added acceptance test files differ.
All nine previous main and all nine previous optional failures have separate
successful routes. That does not establish that the combined tactics have no
regressions; this runner will retain every actual result.

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
