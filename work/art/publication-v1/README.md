# Private receipt-bound art publication candidate

**No live publication, real full-tree preparation, rendering, browser or product build has run.** This directory is the only implementation scope. The current catalog59 count-only check stops with the expected incomplete result: 107/162 declared IDs,55 missing. The full copy/pack branch of the previous normalized overlay is unchanged. No source art, accepted adapter or production plugin was edited.

`publication.mjs` provides separate `prepare`, `check`, `promote` and explicit `recover` operations. `io.mjs` supplies sequential streaming hashes, regular-file/no-symlink checks, exact inventories and synced JSON receipts. The plugin and normalizer under `upstream/` are byte-exact copies of reviewed current sources. Every operation verifies both those copies and the original source identities; a later production/helper change requires a reviewed successor instead of silently using stale behavior.

## Selection contract

The caller supplies an independently reviewed selection JSON **and its expected SHA**. It is the approval boundary, not an automatic claim that a self-consistent handoff is artistically approved. All descriptors have `{path, bytes, sha256}`, with repository-relative paths. The manifest is:

```text
format: 1
reviewed: true
scope: "subset" | "complete" | "fixture"
expectedIds: exact selected ID list
baseline: {assets: relative asset root, inventory: pinned JSON descriptor}
entries: [handoff or inherited entry, exactly one per expected ID]
normalization: {receipt: pinned reviewed receipt (optional only for an empty scope),
                requiredIds: exact normalization coverage}
provenance: optional additional pinned source/receipt descriptors
```

The pinned baseline JSON contains `{files:[{path,bytes,sha256}]}`: the complete file inventory of the asset root's `build`, `ui`, `fonts`, `audio` and `manifest` trees. `captureBaseline` can produce this inventory, but **does not approve it**. A real capture can be large because `build/frames` is preserved; none was attempted here. All hashing is sequential and streaming. Source-only `pipeline`/`source` trees are not copied or replaced; referenced model/spec/editable files are individually pinned.

A handoff entry has `id`, `kind:"handoff"`, and descriptors named `handoff`, `spec`, `model`, `editable`, `production`, `native`, `integrity`, `ui`; optional extra `provenance` is also pinned. Receipt identities must agree with the handoff and production lock. Every production-lock source and every handoff receipt is checked. Native acceptance and zero integrity/UI failures are required. The exact export set must close over sidecar, every declared atlas JSON/image, and the eight authored portrait/build UI files. The selected model/spec hashes and explicit editable-file digest are checked; no editable hash is merely measured after the fact.

A legacy entry has `id`, `kind:"legacy"`, a pinned `lineage` audit, exact `acceptedLimits`, and either a pinned `editable` descriptor or the explicit value `editableScope:"not-certified-by-legacy-lineage"`. It selects the matching row of the existing lineage audit, retains its declared limits, checks its inputs/spec/model/historical check links, and binds its exact sprite and UI bytes to the baseline. This does **not** repair or claim missing historical editable provenance. Props intentionally have no UI. Legacy catalog art requires its four runtime2x images; existing1x files remain unchanged baseline files. Fresh handoffs retain all eight UI images. Complete promotion must be reviewed with these legacy limits visible.

The original normalization receipt is checked through the existing prepared-plan helper, including selected handoff path/SHA, original mask, paired beauty and candidate bytes. Four masks are required per reviewed role. This wrapper applies the derivatives last, after all original export copies, and checks the final entire tree. Complete publication requires every fresh selected catalog role in that new normalization receipt. Current53 is not a final normalization snapshot.

## Operation boundaries

1. **Prepare:** create a new private output below `work/art/publication-v1`, leaving an explicit failed/unsealed state on error. Recheck every dependency immediately before/after the copy course and each copied file before/after its individual copy. Clone the baseline files, remove stale selected sprite directories **only in the new tree**, copy exact selected exports, then apply exact mask derivatives. Check full physical inventory and call the actual `artPackageSources` implementation. Require exact advertised sprite IDs, portrait/build keys and independently enumerated runtime atlas/UI closure; silently omitted malformed exports cannot pass. Unknown output aliases, duplicate/case/Unicode destinations and symlinks reject. Seal `prepared.json` only after all checks and input/code rechecks.
2. **Check:** require the pinned prepared receipt and repeat input, entire tree, plugin graph and code checks; seal `checked.json`. A changed export, missing2x image, extra stale page, late original-mask overwrite or changed source cannot pass.
3. **Promote:** require both receipt digests, recheck again, and acquire the destination's exclusive `.publication-lock` directory before mutation. Live promotion only accepts `scope:"complete"`, the exact pinned136-catalog+26-prop universe, and destination `assets`. A subset can never promote. Fixture promotion can only target this directory's disposable `fixtures/.../assets` roots, and fault hooks are forbidden for non-fixtures. Stage and target must share a filesystem. Move old `build` to a unique preserved backup outside scanned roots, install the new tree, and recheck the installed/backup inventories, external dependencies and remaining source inputs. No old tree, source model or handoff is deleted. The success receipt is synced before releasing the cooperative lock.
4. **Recover:** an explicit command checks the pinned prepared/checked receipts, exact transaction paths/inventories and that the recorded process is gone. Before a durable `promotion.json` decision, it restores verified old bytes and quarantines an installed new tree; after that decision, it verifies the committed tree/backup and finishes lock archival. Repeated recovery is idempotent. It never steals a live owner's lock. An empty lock created before `transaction.json` has insufficient ownership evidence: recovery refuses and leaves it for manual inspection. Unexpected/corrupt transaction trees are preserved rather than deleted or guessed at.

For real promotion, a separately pinned boundary receipt must state `readersStopped:true`, `writersStopped:true`, `target:"assets/build"`, matching `selectionSHA256`, a nonempty `recordedBy`, and a future `expiresAt`. This is an explicit operator/coordinator assertion, **not process discovery**. The directory lock excludes cooperating publishers; it cannot stop an unrelated Blender, editor or hostile writer. Baseline/stage symlink or file replacement between the final guard and rename is excluded by that required exclusive boundary, not by a claim of hostile-writer atomicity. The fault tests cover process interruption and rollback, not storage hardware/power-loss durability. No running server may read the two-rename gap.

The wrapper does not invoke `make build`, copy an old `art/index.json`, or write a pack version. After a reviewed publication, ordinary guarded `make build` must derive the index, exact current runtime files and fresh content identity; final16,000-file/2GiB limits, complete encoded bytes, visual review and product tests remain separate gates.

## Commands and evidence

All commands take an explicit repository root, private output and externally pinned receipt SHA. No command defaults to live promotion.

```sh
node work/art/publication-v1/cli.mjs prepare --root <repo> --out <private-output> --selection <relative-json> --selection-sha <reviewed-sha>
node work/art/publication-v1/cli.mjs check --root <repo> --out <private-output> --prepared-sha <sha>
# Only after a complete reviewed generation and exclusive operational boundary:
node work/art/publication-v1/cli.mjs promote --root <repo> --out <private-output> --prepared-sha <sha> --checked-sha <sha> --boundary <relative-json> --boundary-sha <sha>
node work/art/publication-v1/cli.mjs recover --root <repo> --out <private-output> --prepared-sha <sha> --checked-sha <sha>
```

Run tiny tests with a new name: `PUBLICATION_TEST_RUN=checks06 node --test work/art/publication-v1/publication.test.mjs`. Tests use synthetic metadata and tiny bytes to exercise integrity/transaction logic, not product images, decode correctness or native visual acceptance. They include duplicate/missing IDs, closed-file graphs, changed exports/model/editable sources, path/symlink/alias rejection, failed receipts, masks overwritten in the wrong order, source changes during copying, tampered check receipts, late extra files, exclusive-lock conflicts, ordinary rollback after both renames, and hard child-process exits before journal/after renames/before and after the commit decision. The frozen actual plugin is used throughout.

Final `checks-05.log` is the current22-test pass. Earlier exploratory logs and their fixture receipts are retained separately; exact old source snapshots are included where captured. `catalog59-incomplete.json` and its command receipt prove only the declared readiness gap, not actual full-art byte verification. The fixture archive/index and final source lock provide a compact handoff without adding thousands of tiny generated files to Git.
