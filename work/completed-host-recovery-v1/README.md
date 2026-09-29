# Completed host backup and restart rehearsal

Corrected run02 passes with three clean native host starts and18 HTTP checks. It copies the closed earned three-human/one-bot match directory from `work/multiplayer-current-loader-v1/3h1ai-01/host-data`; the original directory is never opened as a database or passed to a host, and every original file hash stays unchanged. The exact original0.3.4 host binary and frozen product are used. No production code, browser or deployment changed.

Every start loads the actual32maps/31missions, each path/SHA/length verified against the original locked pack; both catalog APIs return the exact expected IDs after every restart. The original three profiles, result, membership/access records and3,799,718-byte earned replay object remain byte/row-identical. The original match was unrated: empty rating tables remain empty. This proves no spurious new result/rating records, not idempotent replay of a populated ranked award.

A new synthetic profile is created only in the working copy. Its sign-in key stays in process memory. An exact186,887-byte valid native Go save is stored/downloaded through the real API. The host closes normally; the whole data directory is copied to a separate backup and restored directory. Restored authentication/download succeed; stale revision0 is rejected409, missing/wrong credentials401. A second ordinary restart keeps all stored rows and replay bytes exact. All three hosts exit0; backup and original directory remain unchanged.

## Preserved limits and correction

Run01 proved storage/profile/save/replay preservation but accidentally supplied nonexistent map/mission directories. The server supports that configuration, so its three starts had empty installed catalogs. Independent review caught the scope gap; run02 uses the exact product paths, asserts nonempty complete inventories and checks both APIs on all starts. Run01 and its original helper/receipt/logs stay unchanged.

Original players' ephemeral browser sign-in keys were not exported. This course does not recover them, authenticate as them, download their replay through a profile endpoint, or change any credential. The earned replay is preserved as an external object and its existing native replay proof is not rerun here.

The directory was known closed from the original course's process receipts and agent coordination. The helper requires an empty/absent WAL before each copy but does not acquire the host lock; it is not a general live-database backup utility. No active-match crash/nonempty-WAL/power-loss/disk-full/Windows/Linux/reference-hardware or simulation-version migration claim. Private databases, moderator keys and copied objects remain ignored; the archive contains only original helper copies, compact receipts and logs, checked by `evidence-files.json`.

Reproduce in a new directory with `python3 work/completed-host-recovery-v1/run.py run-03` (or another numeric unused suffix). It refuses existing output. The original fixed source course must still exist and be closed; this is a bounded acceptance rehearsal, not a player-facing recovery command.
