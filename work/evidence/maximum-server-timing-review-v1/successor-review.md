# Runner correction review

29 September 2026. Read-only delta review; no tests, compiler, browser, host or native timing course launched by this reviewer.

**R1 and R2 are resolved by the separately prepared runner successor.** No remaining blocker was found for the parent's separately authorized quiet course. This does not report a timing result.

- `run-server.py`: `4e9265c9cb5358e27cdf2d2ad8306c6097577f01fd0ba6deddba19540c148a1c`
- `runner_guard.py`: `55bc657f42ab0cc53fed601dbb2c75a0c86d9e412d4a524e1d39e5d4a7e3a3db`
- `test_runner_guard.py`: `547221bc1e042e907e584def8932e3e8286dbdf2c523c23a551d6e97a5ee7b13`
- Owner's `runner-guard-checks.json`: `ad4793c243c3cc879096c53f6ec9000a938d22c90b10cbc3597673e0a83db017`
- Preserved original runner `run-server-before-review.py`: `6811116576d2e0937aab992c4bc957e81a082c1806044b06e739e1fe0d3eae11`
- Go source lock remains `4671ae3aae65169d1824a84c200cdeadfe709a6ae821f773538e2e426e20836e`.

All seven pins in the owner's guard receipt independently match. The actual Go workload, test and instrumentation diff are unchanged. The six filesystem test bodies cover extra source, changed/missing/symlinked inputs, altered lock/allowance, initial failure finalization, original-error/artifact retention and final-only failure. The owner reports six passing tests; this reviewer inspected rather than re-executed them.

The runner writes its initial receipt before entering the guard. Initial failure flows through the ordinary failed report and finalizer. The helper catches final verification failures, records them separately, hashes available artifacts and writes a finished failed receipt without replacing the original workload error. A failure found only during final verification now also produces exit 1.

Verification compares the exact complete regular-file inventory and every digest, pins the reviewed lock itself, rejects symlinks and allows only `.gitignore` with its exact known bytes. An extra compilable file now fails before compilation. As with any filesystem receipt, an unwritable/full output filesystem can still prevent saving; the correction addresses the reviewed source-verification failure paths, not an impossible guarantee that disk writes always succeed.

The original unrun review and its exact hashes remain intact. Positive measurement scope and forced-kill cleanup limitations from the original report still apply.
