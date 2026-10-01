# Persistence integrity on local and LAN origins

Ordinary HTTP LAN origins support local saves, replays, editor drafts, recovery
files, and optional profile synchronization. They do not need `crypto.subtle` or
`crypto.randomUUID`. Offline service workers and downloadable cache packs still
require a secure context: localhost or HTTPS. This distinction is deliberate.

## Shared browser cryptography utilities

`client/src/runtime/crypto.ts` provides:

- `sha256Hex(Uint8Array): Promise<string>`: snapshots the exact bytes, prefers
  native Web Crypto, and otherwise computes the same digest in JavaScript.
- `sha256Fallback(Uint8Array): Promise<string>`: the independently callable
  fallback used by conformance tests.
- `randomUUID(): string`: native UUID generation where available, otherwise
  UUIDv4 from `crypto.getRandomValues`. It never substitutes `Math.random` or a
  timestamp for entropy. If the browser provides no secure random source, the
  operation fails with `secure_random_unavailable` before storing a new file.

The fallback was reviewed against [FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final),
sections 4.1.2, 4.2.2, 5.1.1, and 6.2: eight initial words, 64 round constants,
32-bit unsigned accumulation, big-endian message words, 64-bit bit-length padding,
and eight output words. It operates on bytes and does no text normalization.
A 64-word schedule and at most two padding blocks avoid another full-file padded
allocation. The input snapshot is still one full copy. The fallback yields every
256 KiB so large file hashing allows browser events to run. Per-file limits remain
owned by the save/replay/editor/cache callers.

UUID version and variant bits follow [RFC 9562 section 5.4](https://www.rfc-editor.org/rfc/rfc9562.html#section-5.4).
These UUIDs identify local documents and recovery files; server authentication
continues to use Go's token generation. SHA-256 checks file integrity; it is not a
password hash, signature, authenticity proof, or FIPS-certified implementation.
No new dependency was added.

Tests cover the empty string, `abc`, the standard 56-byte multiblock message, one
million `a` bytes, padding boundaries, nonzero-offset views, arbitrary high-byte
binary data, comparison with Node's independent SHA-256, input mutation while a
hash is pending, event-loop yielding, UUID layout, and unavailable secure entropy.

## Durable revision semantics

Public CAS signatures are unchanged. Revision `0` means that the destination must
currently be missing. A nonzero revision must match the live record the caller
reviewed. Missing records stay missing in list/get responses: private tombstones
are not returned as live files, settings, drafts, or credentials.

The revision returned after a successful write is greater than every revision
previously committed for that ID in that database. After create 1, delete 1,
create with expected 0 returns revision 2. A stale write or delete using revision
1 then conflicts, even if the recreated file has identical contents and a matching
timestamp. Callers must retain the returned revision and never assume a creation
returns 1 or compute the next revision themselves.

Each record namespace has its own durable high-water mark. CAS, revision
allocation, file writes, and deletion occur in one transaction. Failed writes
roll back the high-water mark too. Deletion removes content while retaining the
last committed revision. Recreating an ID advances from that mark. Backup restore,
three rotating autosaves, and shared co-op checkpoints use the same allocator.

| Storage | Schema | Revision namespace |
| --- | --- | --- |
| Local game IndexedDB | 3, migrating versions 1 and 2 | Save, setting, progress, or replay store plus ID |
| Editor IndexedDB | 2, migrating version 1 | Draft ID; draft bytes and summary are one transaction |
| Credential IndexedDB | 2, migrating version 1 | Credential host origin; no token in the revision ledger |
| Host SQLite | 5, migrating supported earlier schemas | Save owner plus ID; global map ID; settings owner |

Upgrades seed high-water marks from live records without changing their original
bytes or revisions. Tombstones are not pruned during normal operation. Deleted
IDs from before the upgrade cannot be reconstructed; the guarantee starts with
records present at upgrade and subsequent writes. Clearing a browser database,
restoring an older entire SQLite file, or manually modifying database tables is
outside this live-database concurrency contract. A whole-database replacement
requires closing existing sessions and producing fresh previews.

Both implementations stop before exceeding JavaScript's largest exact integer,
`9007199254740991`, instead of wrapping or rounding a revision. Browser errors use
`revision_exhausted`; callers can explicitly copy to a different ID. Existing
files remain available.

Settings and progress have no public delete operation, but use the same durable
allocation rule. Server maps also have no public delete route and use a global
ID high-water mark. Replays stored as server filesystem objects do not expose a
mutable per-file CAS API; this change does not invent one. Recovery files use
fresh UUIDs with insert-only creation, so deletion has no replace-by-revision
path. Credential cleanup checks both the token and its reviewed revision,
preventing a stale logout from removing even the same token remembered again.

Browser portable backups intentionally omit private revision tombstones and
credentials. Importing a backup into an existing browser database keeps that
database's high-water marks and assigns fresh local revisions. An entirely new
database starts a new revision history. SQLite `VACUUM INTO` backup includes the
revision ledger along with its live data.

## Verification and scope

```sh
npm --prefix client run typecheck
npm --prefix client run test:runtime
go test -race ./internal/storage ./internal/server
node client/tests/runtime/persistence.browser.mjs
node client/tests/runtime/account.browser.mjs
FRONTLINE_TEST_INSECURE=1 node client/tests/runtime/account.browser.mjs
```

The account integration fixture uses the real Go host and Go WASM validators.
`FRONTLINE_TEST_HOST=/absolute/path/to/frontline` selects a freshly built isolated
host executable. `FRONTLINE_TEST_RUNTIME=/absolute/path/to/runtime` selects a
separately built Go WASM/worker directory without replacing the main runtime. In ordinary-HTTP mode, Chromium resolves the nonlocalhost name
`frontline-lan.test` to the temporary loopback server. No flag declares this host
secure, and the test asserts `isSecureContext === false`, absent `crypto.subtle`
and native `crypto.randomUUID`, and available `getRandomValues`. It verifies
actual save/settings migration, byte-exact save downloads, replay hashing,
recovery bytes, editor draft export/import and practice validation, and rejects
a delete/recreate deliberately inserted after synchronization preflight but before
the final real HTTP write. It also checks cache installation remains unavailable.

This exercises the browser security-origin behavior of HTTP LAN without opening
a network listener to other machines. It does not measure a physical LAN or
certify actual Safari/Edge devices. Playwright is used because no browser testing
plugin is available. Separate evidence records are
`work/evidence/runtime/account-browser-results.json`,
`work/evidence/runtime/account-http-lan-results.json`, and
`work/evidence/runtime/persistence-browser-results.json`, and
`work/evidence/runtime/persistence-http-lan-results.json`.


## Recorded result on 2026-09-27

Type checking and 97 runtime tests passed. The Go storage package passed under the
race detector, including migration, concurrent recreation, checkpoint rollback,
revision exhaustion, and SQLite-backup tombstones. Both browser fixtures passed
Chromium, Firefox, and WebKit on localhost; ordinary HTTP mode passed Chromium
with the asserted insecure-origin capabilities above. The combined fixture used
fresh isolated Go host and WASM builds and confirmed a stale final HTTP write
received `save_conflict` after its destination was recreated at revision 3.

A later whole-server race run encountered the concurrently changing ranked-map
fixtures (`no_ranked_maps` in matchmaking/admission tests); those tests belong to
the lobby/ranked-map lane. They are not reported as passing by this slice. The
actual profile/save/settings browser integration and storage race tests passed.
