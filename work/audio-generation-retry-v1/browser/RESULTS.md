# Native audio browser proof

Chrome03 passes all ten functional checks; its strict overall result remains **FAILED** for one unexpected Chrome `net::ERR_ABORTED` report. The same exact request has native original-reader EOF and matching bytes/SHA, but that evidence does not explain or waive the diagnostic. No production change or audio promotion occurred.

## Frozen inputs and environment

- Genuine task-local Google Chrome **154.0.8037.58**, executable SHA256 `633aa60f1ee2346804e006071d8f6a2114106e9c17abd601fe61bf9754638740`; fresh temporary profile, native headed browser, mute-audio. Profile deleted and Chrome exited0.
- Browser plugin/skill absent; existing Playwright1.62.1 used. Final run connects with `noDefaults:true` to the owned browser's default context. This prevents Playwright's automatic focus emulation; no synthetic focus/visibility events or AudioContext mocks.
- Private audio-v1 source lock **4ccb087b72fb00c69f1e3c86fb5fd67db5321457b4affbca1f6c8cde7e3ebedd**, all23 inputs rechecked exact after execution. Full application integration and generation-pinned audio loading remain separate.
- Exact current product audio index SHA `e509585aba77734dd319a5159317fc86544898ebfe2ceef3b50ff5b5b2619433` and base-pack SHA `9387365786fcd3f53049bdd1a87482a37eac8f18561fa276d36c977f26224559`.
- A: original `vo.unit.US.pilot.select`, OGG11972B, SHA `c3ed4ccd827f67727c7a27be2fc7df93cd31706996595860239d5f1cab969951`.
- B: original `vo.unit.US.pilot.move`, OGG12353B, SHA `1256554fa336eae23b09b31507d4ba7af398ea63ac4cecca60663f9e29689654`.
- Existing MP3 fallback files were also pinned and copied unchanged; Chrome used OGG, so MP3 decode/fallback is not certified. Only the small test index aliases change URLs. No generated or edited audio.

## Actual checks

The flow is: denied audio → explicit consent → trusted gesture → real A decode → same-URL B index retry → invalid retry → held old request canceled on replacement → normal source start → actual tab visibility change → trusted resume → withdrawal → disposal while normal play is pending.

1. Trusted input with consent denied creates no context.
2. A synthetic pointer event after consent still creates no context.
3. Trusted input creates a real running AudioContext; A decodes to mono24kHz,24878 samples,1.036583s.
4. Same URL with B descriptor returns a new real buffer, mono24kHz,25592 samples,1.066333s. PCM SHA changes from `e349c3c26d383ded8f1eed37764d8cfbc64d5a59935e2a485acf2c331a01121e` to `694b7fdb00a33e2211d86f6ec9c94340859109d807f8520fa74c718f3b710a38`.
5. Exact unchanged index retry preserves the B buffer identity.
6. Invalid candidate index preserves the preceding B descriptor and cached buffer identity.
7. Original pending A HTTP request is actually aborted when B commits. Its promise rejects AbortError; B subsequently decodes to the same B PCM. This is an HTTP-pending test, not native-decoder timing control.
8. Normal `play()` starts a native source. Switching actual tabs produces trusted visibility hidden→visible events; hidden suspends the context and removes sources, and a trusted gesture resumes it. The run does not independently prove OS-window blur.
9. Consent withdrawal leaves context suspended, sources/buffers/pending0.
10. Disposal during a fresh normal pending play aborts the fetch, closes the actual context, leaves sources/buffers/pending/decodedBytes0 and prevents a later trusted input recreating it.

Screenshot inspection confirms the fixture page and controls render without an error overlay. It is a functional fixture, not product UI acceptance. No subjective listening, codec-wide, cross-browser or performance claim.

## Preserved failures and diagnostics

`browser-chrome-01`: five checks passed then tab suspension timed out. Installed Playwright enables focus emulation on its own CDP session. Zero unexpected request/HTTP/console/page failures.

`browser-chrome-02`: seven checks passed then the same tab test timed out. Disabling focus emulation on an additional CDP session did not remove Playwright's own override; no native visibility events were delivered. One unrelated raw index abort remains. Both source snapshots and failed screenshots are retained.

`browser-chrome-03`: native launch plus documented `connectOverCDP(...,{noDefaults:true})` supplies actual visibility events; ten checks pass. One raw index response abort remains strict failure: browser Request7, GET `/art/audio/index.json`, exact URL ordinal3,445B, SHA `9f7b3398d897bce4c16a7d94c4f0ceb901cbad3abdb6b3a03455c0c8111d5f35`. The original consumed body reached EOF and matches exact served bytes. Relative browser-error/native-EOF ordering was not measured on one clock, and no cancellation cause is inferred.

The two deliberately held fetches (Requests10/13) separately record actual abort signals, rejected fetches, zero consumed bytes. Request10 closed server-side before writing; Request13's server called res.end on controlled release after the original fetch had rejected. No server pre-write-close claim is made for Request13. Only those exact Request identities are expected intentional cancellations. No broad error matcher was added. Zero HTTP errors, page exceptions or console errors. Owned Chrome stderr retains the native allocator notice separately.

The post-close independent audit checks all11 native records: nine exact consumed responses and two controlled pre-response cancellations. Unique URL/method/ordinal mappings match browser Request identity and server request identity. Final observer faults/overflow/pendingHashes/copiedBytes are all zero. Request/console/HTTP diagnostics are reconciled after browser close; no task browser, server or profile remains.

## Evidence and checks

- `browser-chrome-01/`, `browser-chrome-02/`, `browser-chrome-03/`: exact run source, raw receipts and screenshots.
- `browser-prepared-v2/prepared.json`, `browser-prepared-v3/prepared.json`: exact bundles and clip descriptors. Generated binaries remain local/reproducible.
- `evidence/browser-postclose-audit.json`: final immutable receipt/hash audit.
- Strict fixture TypeScript passes after a test-only typed boundary for the existing JavaScript observer. Initial never[] inference failure is preserved. Candidate source remains unchanged. Node runner syntax and bundle preparation pass.

Stop here: functional correction is supported, strict diagnostic acceptance remains open. No repeated rerun merely to obtain a clean receipt.
