# Historical storage upgrade and recovery rehearsal

Two actual historical storage implementations, commits `2774b38` (schema6) and `d316398` (schema7), created isolated databases through their original Go repository APIs. Current storage then upgraded copies to schema8. **Both cases passed in corrected run-03**, independently reviewed in `5605690`. No live host, browser, personal database, simulation source or deployed file was touched.

The synthetic fixture contains two profiles, an owned save at revision3, a deleted slot with its revision ledger, a private map at revision2, settings, a block relationship, a void test result and an external replay object. Save/replay bytes come unchanged from the already preserved native US-launcher course. This proves storage byte preservation; it does not prove a previous simulation version can load a current save, and it creates no gameplay result or rated reward.

## Earned checks

- The actual old code produces schema6/7, rather than relabeling a newly created schema8 database or hand-writing an incomplete SQL approximation.
- After every seed/verify process exits, no nonempty WAL remains. Whole isolated data directories with spaces in their names are copied and every file hash matches before migration.
- Schema8 opens successfully. Every pre-existing table has exactly the same canonical row bytes/counts after upgrade. The new map-publication records keep the map private and preserve immutable bytes; the new campaign ledger invents no progress.
- Original profile authentication still works; a wrong token is rejected. Another profile cannot retrieve the save. The deleted save stays deleted. Existing result insertion is idempotent, and external replay bytes match exactly.
- Reopening the upgraded database changes no row. `VACUUM INTO` creates a backup; an existing backup target is rejected. Restoring that database with the external `objects/` directory preserves all rows and files. Recreating the deleted save advances to revision2, and the stale revision1 writer is rejected.
- Future-schema9 and corrupted database copies are rejected while their original file bytes remain unchanged. The original historical database directories also remain unchanged.
- Current and historical staged source trees were checked after execution:16/13/15 pinned files unchanged. Toolchain is Go1.27.1 on macOS arm64 with one Go worker. This is correctness evidence, not a performance or cross-platform benchmark.

`run-01` used a generic `replays/` object directory; `run-02` corrected it to the host's actual `objects/` layout. Their original receipts and helper sources remain preserved. Independent review `928cf6e` then found that Python transaction contexts did not explicitly close connections, and negative cases checked only the main database hash plus a generic error. Those runs do not earn the stated connection-closure or complete invalid-directory preservation gates.

Corrected `run-03` explicitly closes every Python connection, requires the exact newer-version error or typed SQLite NOTADB/CORRUPT error, compares every invalid-directory file before/after (including any WAL/SHM and objects), and rechecks staged source pins inside the runner. Both schema cases and19 commands pass; closed16:06:55UTC on29September. Independent review `5605690` confirms these corrections and44 staged source/19 log hashes. It did not launch a second database test. The runner asserts complete invalid-directory equality; it does not separately serialize both intermediate inventories.

Only7 of18 historical schema6 tables and9 of22 schema7 tables contain fixture rows. Preservation of empty tables is not proof for every populated social/match feature.

## Limits and reproduction

This course operates closed SQLite repositories and object files. It does not start a network host, exercise active-match recovery after a crash, copy a live WAL database, certify disk-full behavior, launch Windows/Linux, or migrate incompatible simulation saves. Existing host locking, crash recovery and simulation compatibility require their own evidence.

```sh
python3 work/storage-recovery-rehearsal-v1/run.py run-NEW
```

The runner refuses an existing output directory. All databases, generated test credentials and binaries remain isolated under that run and are not in Git. `source-and-receipts.tar.gz` preserves runs01/02 unchanged; `run03-source-and-receipts-complete.tar.gz` preserves corrected run03 including both historical source directories. The initial run03 archive omitted those directories due to its name filter; it is retained separately and is not the complete-source receipt. Both contain only exact helper/staged source, locks, logs and compact receipts, with read-back hashes in their corresponding evidence-files inventories. No original or restored database is overwritten during reproduction. No production code changed.
