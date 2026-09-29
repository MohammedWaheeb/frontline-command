# Follow-up: run-03 delta review

Both run-02 findings are corrected in the new run-03. No further blocking issue found in this bounded storage rehearsal. This review used only file/git/hash inspection; no SQLite connection, test, compiler, host or browser was launched.

- Every Python connection is now explicitly closed using `contextlib.closing`, including the read-only table inventory and the future-version edit. The edit also has a transaction context. Go handles are closed and child processes exit before copies. The runner still requires no nonempty WAL and hashes the full copied directory.
- Invalid-input checks now capture and compare the whole directory, including any WAL/SHM and object files, before/after the rejected open. The future case requires the precise newer-version error. Corrupt input requires a typed SQLite error with base code NOTADB (26) or CORRUPT (11), so generic lock/permission failures cannot satisfy the guard.
- The runner itself now rechecks all 16/13/15 staged source inputs after execution. Independent review confirms those 44 hashes and exact historical non-helper git content, all 19 log hashes, and both old-table/backup digest comparisons. The preserved future main-file headers are version 9; the final invalid directories contain their unchanged replay objects and identity files.

The original run-01 and run-02 remain unchanged and are not retrospectively upgraded. Run-03 still covers closed clean-directory copies, not recovery of a nonempty WAL/crash/concurrent host; most social/match tables are empty; exact native payload preservation is not simulation/replay migration. The other limits in `review.md` remain applicable.

Exact reviewed inputs and directory facts are recorded in `run03-read-only-audit.json`. The successful receipt plus its preserved source asserts before/after directory equality; the receipt does not separately serialize those two intermediate directory maps. No stronger forensic pre/post inventory is inferred.
