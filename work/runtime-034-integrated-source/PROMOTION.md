# Exact selective Go/protocol/runtime promotion

2026-09-29,08:25:33UTC: root-reviewed promotion completed. **Live source and
runtime now report0.3.4. Product/art-pack publication is still root-owned and
was not performed here.** Old0.3.3 saves/replays and all immutable product/source
freezes remain untouched; no relabeling or implicit migration was performed.

The exact manifest is
`promotion-review/20260929T082155Z/manifest.json`, SHA-256
`970dde9b71798e6a41888580918de0713446a42cd1260880ed10df9d83d56537`.
Root independently checked every old/new hash pair and authorized execution.
`prepare-promotion.py` only prepared the manifest and reversible backups;
`apply-promotion.py` performed the later authorized copy with full preflight,
immediate prewrite drift guards, temporary-file replacement and final rehash.

## Exact transaction

- 83 source paths:34 production/schema, three generated,32 focused regression
  tests and14 passing commander successors. The14 are the three changed plus
  eleven new test-only files in the integration receipt; old live edits matched
  the explicitly preserved ancestors.48 paths were absent before promotion.
- 272 unchanged locked source files were verified and left untouched. There
  were no live Go/proto files outside the integrated inventory to reconcile.
  All355 live source bytes now equal lock3d49f3c0…53750.
- Seven runtime copies from `runtime-builds/20260929T081745Z/runtime`: five
  `client/public/runtime` files, `bin/runtime-native`, and the host binary renamed
  from `bin/frontline-host` to `bin/frontline`. Their exact paths/digests are in
  the manifest. Generated TS is already one of the83 source entries; its runtime
  copy matches exactly, so it was not copied a second time.
- No directory mirroring or deletion. The12 excluded historical native-scene
  files remain excluded. No catalog, mission, map, storage schema or database
  migration was introduced. No UI, renderer, application or client-test source
  was copied by this transaction.

Before copying,44 existing source/runtime/service-worker files were copied
byte-for-byte, retaining permissions, into the local `prior-live/` subtree.
`manifest.json` records all backup hashes/lengths/modes and the48 originally
absent source paths. Source, public metadata and native adapter all independently
reported0.3.3 before the transaction. These backups include both old native
binaries and old WASM; they are local reversible artifacts, not Git payloads.

After copying, the native adapter and public metadata agreed on0.3.4/protocol1/
adapter1/content318de812…c4612. A new ephemeral loopback-only host returned
matching `/api/v1/health` and `/runtime/version.json`; its served WASM bytes
hashed tod1d7b97d…db7ae. The host closed cleanly with exit0 and no stderr.
`promotion.json` preserves the actual health payload and all destination hashes.
This smoke created an empty isolated temporary data directory, no user profile.

No Go rebuild or broad retest was necessary because the promoted bytes are the
already accepted ones. The existing service-worker JavaScript/source map stayed
unchanged: their three embedded source inputs (`crypto.ts`, `cache.ts`,
`service-worker.ts`) exactly equal current source. Runtime bytes enter the new
content pack, not the service-worker code itself.

## Remaining packaging steps, owned by root

The exact source/runtime copy is complete; **do not rerun the apply script**.
It refuses an existing transaction receipt and its old-live guards no longer
match intentionally. Root should keep the83-path source snapshot and seven
artifact digests pinned while assembling the chosen client/art freeze.

1. Recheck current client against the generated TS binding and run root's bounded
   client preflight. Do not overwrite a frozen product directory.
2. Build the chosen new product with Vite (`npm --prefix client run build`, or
   its equivalent isolated output invocation). That invokes the art plugin and
   regenerates `assets/packs/base.json` from exact output bytes. Never reuse an
   old pack after changing WASM. `runtime:build` is unnecessary for this copy and
   would create new VCS/path-sensitive output bytes requiring a new receipt.
3. If service-worker source changes later, bundle that entry alone using the
   same esbuild options (`bundle`, browser/iife, targetes2022, source map), then
   regenerate the product pack. Do not change runtime identity incidentally.
4. Qualify the final served product/runtime together: actual browser load/save/
   replay/privacy/reconnect and cold-offline installation, old-save readable
   rejection, required multiplayer repeats, final complete-art/load gates. The
   [historical release-gap audit](../go-promotion-audit/README.md) retains exact
   distinctions between native proof, past product proof and open qualification.

To reverse this local promotion if root chooses: first stop consumers of the
promoted binary; verify each current destination still equals its promoted
digest; restore only its matching `prior-live/` file with recorded permissions,
and remove only the48 listed additions if their bytes still equal this manifest.
Preserve subsequent divergent work instead of overwriting it. Restore native
and WASM versions together. Never convert0.3.4 saves to0.3.3 by editing metadata.
Frozen old products and this rollback archive remain independent of new builds.
