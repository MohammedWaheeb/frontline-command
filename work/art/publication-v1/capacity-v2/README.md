# Private publication metadata capacity successor

The original `de21c9d` publication implementation is unchanged. This candidate changes only the JSON reader's explicit metadata purposes and their call sites. No real art tree was hashed, copied, assembled or promoted; no browser or product build ran in this course.

The descriptor-only scan observed 41,229 files, including 39,410 under `assets/build`. The baseline inventory would encode to 7,818,153 bytes. The first projection retained all old output rows and encoded to 15,924,913 bytes. That is an unchanged-output scenario, **not** a guaranteed lower bound after sprite replacement; its original source/result remains preserved.

`project-v2.mjs` corrects that scope using the same captured descriptors. It excludes every potentially replaced `build/sprites/` and `build/ui/` output row, leaving 38,400 guaranteed preserved rows. The baseline dependencies plus those rows alone encode to **15,370,566 bytes**, already exceeding the old 8,388,608-byte reader limit. Additional handoff/source/code/runtime descriptors are omitted. SHA values in the projection are zero placeholders of the correct encoded width, never verification descriptors. Only path enumeration and file sizes were observed; no art body was consumed.

The new reader has fixed, explicit purposes:

| Purpose | Limit | Call sites |
| --- | ---: | --- |
| Authored asset/default | 8 MiB | Selection, handoff, specs, atlas metadata, receipts and boundary inputs |
| Inventory | 64 MiB | Baseline inventories during preparation/check/recovery |
| Publication | 128 MiB | Prepared and checked publication receipts |

Unknown purposes and over-limit descriptors reject before filesystem reads. Exact bytes and SHA remain mandatory, including a post-read length check. The complete ID gate, 262,144-file inventory bound, no-symlink/path rules, all source checks and transaction semantics are unchanged. These limits are bounded headroom for metadata, **not proof that a future final generation fits**. Actual complete receipt size, final pack file/byte limits, current source pins, art normalization coverage and publication approval remain gates. This successor is not integrated or approved for live promotion.

Validation:

- `capacity-checks-02.log`: 4/4 focused tests pass. The real descriptor lower bound rejects in the old reader and parses exactly only with the new publication purpose; altered hashes still reject. A larger synthetic inventory tests the separate inventory purpose. All three caps reject cap+1 before I/O; a descriptor at each exact cap reaches the integrity guard. This last check is admission/integrity coverage, not a full 128 MiB parse or memory stress claim.
- `publication-checks-01.log`: the unchanged 22 original transaction/fault assertions pass against the successor, including hard process interruptions, original-tree rollback, commit recovery, stale files and mask order.
- `candidate.diff`: only reader purposes/call sites plus the nested test's repository-root adjustment differ from v1.
- `parent-lock.json`, `source-lock.json` and `receipt.json`: parent preservation and exact candidate/evidence identities.
- `fixtures-capacity06.tar.gz`: exact disposable fixture artifacts, including symlinks without dereferencing; its index and archive verification are in the receipt.

The original 4-test run and first projection remain separate evidence. The corrected reader test uses `capacity-02.test.mjs`; it requires an absent disposable `test-data-02` directory. To repeat transaction tests, choose a new `PUBLICATION_TEST_RUN` prefix. Never reuse a completed output directory or reinterpret an old receipt.
