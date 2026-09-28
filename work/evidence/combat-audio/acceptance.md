# Combat audio selection — unit checkpoint

Date: 2026-09-28, 10:42 UTC. Base source: `c3120d77b4685c558b259821829d890bb187c098`, including the shared `combatFacts` helper. No shared runtime rebuild.

- Runtime type check: PASS.
- Application type check: PASS.
- Complete runtime suite: 314 tests PASS, including seven focused combat audio tests.
- After adding the initial-baseline future-event assertion, the 26 focused audio/shared-facts tests pass again. A simultaneous expanded full run saw one unrelated in-progress combat-presentation assertion (`hit` versus `impact`) and three type errors in that new test's `samples` access; parent owns and was notified. Application type check remains PASS. These are not represented as a passing final expanded suite.
- Test engine: Node 26.5.0; actual catalog from `pkg/content/rules.json`; synthetic snapshots and recording mixer.
- Targeted source fixes cover actual weapon attribution, resolution armor, conservative unknown/legacy paths, explicit decoy/interception separation, event deduplication/future-event protection and fixed/mobile interceptor charge depletion.

Source hashes at checkpoint:

| File | SHA-256 |
| --- | --- |
| `client/src/audio/combat-sound.ts` | `8f653dd2b910ff98b6d0084c1775894c295fcf34af8bc174dbb360fca5aee051` |
| `client/src/audio/director.ts` | `338f262f3d565c73b628bc3a11e89233cafb124104837306c3ee79bc15b68206` |
| `client/src/app/combat-feedback.ts` (root-owned dependency) | `91b326d1dab239623d79cc24e192483f714540ba6b0084a41670086f23cf27fc` |
| `client/tests/runtime/combat-sound.test.ts` | `bbd5553a72793f3e99f214a178bb77064d750da8446f6f095b54aaf42de5fd04` |

Initial verification found a wrong TypeScript Event import and test catalog path; both were fixture/source integration errors and were fixed before the passing run. Detailed local logs are `work/evidence/combat-audio-typecheck.log`, `combat-audio-app-typecheck.log` and `combat-audio-runtime-tests.log`.

## Combined Go consumption follow-up

The final follow-up passes both project type checks and **327 runtime tests**, including eight combat audio tests. It fixes duplicate `connected` observer notifications resetting audio history before every poll; genuine reconnection still clears old events and announces once.

An isolated copy of frozen combined simulation 0.3.4 (`work/runtime-034-candidate/source-lock.json` SHA-256 `ed50966897139f973e143ba0f83c9776849b6d7924839c228238e7dc1370ed20`) adds only two test fixture files. It produces:

- 14 actual native and js/WASM Go view pairs, exactly equal.
- 28 corresponding native/WASM protobuf snapshots, exactly equal, decoded using the candidate's generated binding.
- Audio facts/selection/director assertions pass for original-shot identity after conversion/death/removal, landed fighter resolved as light armor, six public/redacted visibility cases, explicit decoy, fixed/mobile interception and ordinary covered attack.
- Every case also verifies repeated snapshots and discontinuity do not replay cues.
- 21 save exports pass native/WASM restore and exact state-hash checks, with identical bytes. The deliberately forged embarked-privacy setup has container 999; its invalid save is correctly rejected and never exported.

The fixtures seed exceptional states and invoke the actual Go projectile, damage, fog and view code. They do not claim paid production or authored mission achievements. Initial fixture assumptions failed because source loss also removed the only sight provider, and because the decoy expired at exactly tick 100; corrected setup adds a genuine living observer and keeps the buff active through impact. No production rule changed. `initial-fixture-errors.log` preserves that attempt.

Final local receipts:

| Receipt | SHA-256 |
| --- | --- |
| `go-consumer.json` (14 actual-wire consumer results) | `3dc84b5de5f1c434df2da27742e4bc9f1d1265cf2892ab1c231aff49e125ab61` |
| `native-wasm-parity.json` (14 view pairs and 21 save hashes) | `a80c89f56c0646b8a599a627d60eb9b01fb0a85b9c9dc7f1b264743258f52787` |
| final `client/src/audio/director.ts` | `24e28cf1e0d9b58640951c36de4be4dc110c31b243a031f1c8b3261818364d71` |
| final `client/tests/runtime/combat-sound.test.ts` | `26d0496f5e7bb73224b26ff3b10f674a487b5ddc8deb7050c644db916a98f72e` |

This is actual Go/protobuf consumer acceptance with a recording mixer, not audible output review, new audio assets, all 132 visual effects or complete presentation. No shared candidate, shipping runtime or production Go files changed. The independent renderer review is recorded in `renderer-review.md`.
