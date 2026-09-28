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

This checkpoint does not claim actual combined-Go event acceptance, audible output review, new audio assets, all 132 visual effects or complete presentation. Those remain separate gates.
