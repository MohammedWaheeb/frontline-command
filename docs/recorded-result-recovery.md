# Recorded results after elimination or host restart

The authenticated Operations screen now lists the current profile's latest 50
host records. A player can inspect a completed result and save its exact replay
through the existing Go replay inspector even when its lobby no longer exists.
Signing out clears private history from the screen and preserves browser files.
This is local-host profile authentication, not an invented hosted account service.

An earlier-eliminated participant can retain a frozen battlefield until the match
finishes. The network controller keeps polling its actual lobby. A completed
lobby uses authenticated history; `lobby_missing` also attempts that same history.
Only an exact matching committed record marks the retained operation completed.
Missing records and transient failures remain visible and retry on the ordinary
poll. A confirmed vanished lobby stops further lobby/chat requests. It cannot
offer rematch or reopen a live connection. No replacement lobby is invented.

The battlefield then displays a keyboard-accessible recorded-result cue opening
the existing operation menu. It does not replace the live snapshot, reveal enemy
fog, update the old camera, award a synthetic live victory, or grant commands.
Observers and replay viewers do not receive this participant cue. Result parsing
extracts only validated outcome metadata; the original payload and its uint64
seed are not serialized through JavaScript. The server still authorizes every
history/replay request, and the local replay archive validates the original bytes.

## Actual earned-data verification

The original three-human ordinary FFA ended at tick 16,074 with IR/team 2 winning
by elimination. Its US host had already been eliminated at tick 9,020. The first
driver failed waiting for an archive button on that frozen battlefield. Its
original report remains **failed**; recovery was tested in a separate course.

Final browser evidence:
`work/multiplayer-combat/history-recovery-2026-09-28T15-11-03.629Z/`.
The course passed in Chromium 151.0.7922.34, using the exact frozen combined
0.3.4 Go host/WASM and prior headed-course art. This correctness course ran
headless on loopback; it proves neither physical LAN reachability nor performance.

The runner made a SQLite backup of the completed host database. It reissued only
one test profile's token hash in that copy, comparing every table and row except
that single column before starting the host. Credentials were held in memory and
never recorded in screenshots, receipts or logs. The original database and exact
replay remained byte-identical. No outcome, unit, economy, result or replay data
was edited. The copied database is private test state and is not checkpointed.

Seven actual-browser checks passed:

- Restore the original profile through the product form on the restarted host.
- Load its actual recorded result without a surviving lobby.
- Download and archive the exact 560,009-byte earned replay using normal controls.
- Sign out, preserve the browser replay, create another real profile, and verify
  that the second profile has no prior result.
- In an explicitly labeled retained-client fixture, restore only the original
  public lobby and original authorized own view as client memory. Real periodic
  polling gets `lobby_missing`, then the real history result. The frozen own
  tick-9,020 JSON remains unchanged; no simulation runs in this fixture.
- Use keyboard focus and Enter on the cue to open the real `NetworkMatchPanel`,
  archive the exact replay, and return to the unchanged frozen view.
- Preserve the one expected missing-lobby HTTP/console 404, with no page errors
  or unrelated console/HTTP errors.

Exact replay SHA256:
`f9fb9af2e46c11cbcf2d9ee221b3b6b097a60c9f7f2a9100586ea16095e690c0`.
Original database SHA256:
`6324a8db3a5291f96af9143eb3a29942319c7c32253fcc8fd71062b088b3cf65`.
The browser report records the code/build hashes and unchanged-original checks.
Native screenshots were inspected at 1280 and 1600 pixels:

- `recorded-result-1280.png` and `recorded-result-1600.png`: actual product history.
- `profile-isolation.png`: separate profile with no prior operation.
- `frozen-result-cue.png` and `retained-result-menu.png`: explicitly labeled client
  memory fixture, actual polling/result/menu and keyboard action.

Earlier fixture failures are preserved, not counted as passes: 15:07 assumed
sign-out switches the profile form to Create; 15:08 authenticated after wrongly
declaring an active mock session, which correctly triggered the activity guard;
15:09 used `close()` rather than `dispose()` in test cleanup. The final 15:11
course passed. A subsequent fixture-only TypeScript correction made its unused
unsubscribe callback return the boolean required by the real subscription
contract; it does not change the tested production source or polling behavior.

## Regression checks and limits

Both production TypeScript checks and the separate fixture check pass. The first
checkpoint ran 344 passing runtime tests; the final shared-source rerun passed
347/347, including three concurrent aircraft-picking tests. Focused recovery tests
cover completed existing lobbies, vanished lobbies with a matching record,
vanished lobbies without a result, transient history failure/retry, malformed
metadata, strict cue gating, unknown replay selection, sign-out and profile
isolation. The retained fixture's separate TypeScript check also passes.

The history API currently returns the latest 50 records without a pagination
cursor. This UI states that limit. Deleted or unavailable host replay files still
produce the actual server error. The cue was mounted in the product, but its
automatic appearance during a fresh uninterrupted four-human match remains a
subsequent live acceptance gate; the earned copied-host recovery above is a
separate proof. No complete-multiplayer or final-art claim follows from this fix.

Reproduction uses `client/tests/render/history-recovery-build.mjs` with a new
`FRONTLINE_HISTORY_BUILD` directory, then
`client/tests/render/history-recovery.browser.mjs` against the preserved original
three-human evidence. Keep the original databases and old source-specific builds
unchanged. Never publish the copied private database or sign-in credentials.
