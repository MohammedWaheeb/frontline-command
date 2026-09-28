# Same-page ordinary rematch acceptance

The new driver is prepared for an actual two-human course. This document does not
claim that two matches, or two long matches, have passed before their recorded
run completes. The existing six-configuration combat evidence is summarized in
[multiplayer-combat-acceptance.md](multiplayer-combat-acceptance.md).

## Scope and duration

The authoritative design §26.3 requires two consecutive long matches without a
page reload. It provides no numeric minimum. For this acceptance course we use
**20 minutes of active simulation per match** (24,000 ticks), drawing from the
lower bound of the §2 standard 1v1 duration target. This is an operational test
criterion, not a new gameplay rule or a claim that every match should last that
long. The verifier subtracts the actual initial Go countdown from the replay
interval. Pauses, loading, postgame time, and wall-clock delays cannot satisfy it.

The driver uses the unchanged reviewed ordinary-combat Commander: two independent
human profiles, US versus IR on Industrial Valley, paid construction and
production, normal field income, public-spawn attack-move and visible-target
attack orders, with Go validation. It does not alter state, spawns, resources,
deadlines, victory conditions, or bot behavior. It never surrenders or withholds
the normal command policy to extend a won game. A genuine shorter victory remains
valid combat evidence and separately fails the long-session qualification.

## Same-page and lifecycle checks

`client/tests/render/multiplayer-rematch.browser.mjs` creates one isolated host,
one browser, and two browser contexts/pages. After the first launch there are no
navigation, reload, new-page, or Application replacement calls. The requester
uses the actual **Create rematch lobby** control; the other participant returns
to Multiplayer, closes the completed lobby, joins the new ID, and both mark ready
again. They retain their original profiles and acquire new match sessions.

The acceptance-only entry exposes readonly Application/session identity,
subscriber and asset statistics, and replay IDs/hashes. Test initialization
observes Worker creation/termination and socket events without replacing their
implementation. At both menu boundaries the driver requires:

- Original page time origin, instrumentation identity, Application identity and
  main-frame navigation count.
- No match transport, open match socket, or battlefield snapshot subscriber.
- The original Go worker identities and resident sprite pages/bytes/picking bits
  back at the initial menu baseline. Source-identified Pixi decoder workers may
  remain in their documented bounded pool, but must have no pending work; unknown
  workers, extra/replaced Go workers, live support probes, or a pool beyond the
  actual hardware-concurrency bound fail.
- Original profile IDs and preservation of both exact replay archives.

Audio buffer counts and optional heap measurements are recorded as diagnostics;
they are not treated as proof that all browser memory is reclaimed. No forced GC
or global browser configuration change is used. Same-machine loopback contexts
are not physical LAN proof.

Each round reconnects a live participant through the real menu, checks sequence
continuity, tests both foreign-command rejections, and rejects foreign private
fields in every decoded snapshot. The final result must be an ordinary committed
elimination. Each participant must recover the exact result; an eliminated
participant's frozen private snapshot remains unchanged. The normal archive
action imports the exact host replay through the game's Go inspector. The second
archive must have a distinct ID and preserve the first.

After both browser contexts and the host close, the separate native verifier
replays each earned result from the initial state and from a restored midpoint,
compares final checkpoint/full/resumed hashes, verifies paid income and
production for both players, and reports the actual initial countdown. This is
offline save/restore validation; it is not a live co-op checkpoint-resume claim.

Unexpected page/console/decoder/HTTP errors are retained throughout and evaluated
after the independent result/history/archive checks. An early 503 still fails
strict acceptance; it does not prevent collecting the later recovery evidence.
The report has separate combat, lifecycle, strict-error and long-duration results.
Overall long-session acceptance passes only when all four pass.

## Frozen inputs and reproduction

Coordinate a served-asset publication boundary before creating a new product.
The builder refuses to overwrite an existing directory. It freezes the current
client and entry, packages current art, verifies every file in source lock
`c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122`, and installs
only its receipt-verified host/WASM/worker bytes. It recompiles only the separate
test verifier against that immutable Go source and records its source/binary
hashes. Shipping runtime and previous evidence directories remain unchanged.

```sh
FRONTLINE_COMBAT_BUILD="$PWD/work/multiplayer-combat/build-rematch-UNIQUE" \
  node client/tests/render/multiplayer-rematch-build.mjs

FRONTLINE_COMBAT_BUILD="$PWD/work/multiplayer-combat/build-rematch-UNIQUE" \
FRONTLINE_COMBAT_REUSE=1 FRONTLINE_COMBAT_HEADED=1 \
FRONTLINE_REMATCH_AUDITOR="$PWD/work/multiplayer-combat/build-rematch-UNIQUE/audit-replay" \
  caffeinate -di node client/tests/render/multiplayer-rematch.browser.mjs
```

`caffeinate` is scoped to the test command on macOS; it does not change system
settings or override low-battery protection. Record actual power/host conditions
and verify the CDP GPU backend. Hardware acceleration is checked explicitly;
headless runs do not imply hardware or reference-FPS acceptance. Missing art and
fallback mappings remain visible in each client's asset record.

Small source checks before execution:

```sh
node --check client/tests/render/multiplayer-rematch.browser.mjs
node --check client/tests/render/multiplayer-rematch-build.mjs
node --test client/tests/render/rematch-contract.test.mjs
client/node_modules/.bin/tsc -p client/tests/render/multiplayer-combat-tsconfig.json --noEmit
```

Prepared contract checks pass: actual countdown subtraction and the exact
threshold; application/page replacement rejection; socket/worker/subscriber/
sprite-residency cleanup rejection. Browser and earned-result evidence will be
added only after the actual course.

## First actual course and worker diagnosis

`work/multiplayer-combat/rematch-2026-09-28T21-00-22.222Z/` is **FAILED at the
between-match test gate**, not a two-match pass. Its first ordinary game is valid
separate evidence: IR won by elimination at tick 13,185, seed
`859761103783007190`, after 163 command batches. Both ownership probes rejected
with `not_owner`; the host reconnected at 3,632→3,636 preserving sequence 19.
Both committed results and the normal host replay archive succeeded, with zero
unexpected browser/HTTP errors. Replay SHA-256 is
`04fe7f29eade905834495052a9ad89c1306a2d64391f744a609f0ee3eff32434`;
initial/checkpoint/restored-midpoint playback all end at
`61ca68ed9587e44d22265c2bb9b7bf5a306723f4926c229304ad751d141f8e07`.
The actual initial countdown is 100 ticks, leaving **654.25 active seconds**;
this does not qualify as a long match.

The first test counted every Worker against a cold-menu count of one. It stopped
after the legitimate rematch lobby was created because ten workers remained.
That instrumentation did not record URLs, so the original outcome is preserved
without retrospectively assigning ownership to every worker.

The separate short diagnostic at
`work/multiplayer-combat/worker-diagnostic-2026-09-28T21-16-38.162Z/` used the
same frozen client/art/runtime and actual ordinary admission/render/menu return.
It records constructor URLs/names, exact Blob-script comparisons, and decoder
message/completion counters. Each original named Go worker remained unchanged.
Player 1 retained six Pixi decoders and player 2 retained three, all idle with
every job completed; the actual pool limit was ten. Each support-probe worker
terminated. Transport and battlefield subscriber counts returned to zero, as did
resident sprite pages/bytes/picking bits. There were no unexpected browser/HTTP
errors. This deliberately interrupted short match is ownership diagnosis, not
combat or rematch acceptance.

The matched Pixi worker source hashes are
`9d10b11cf15844e5bb768493df95ad58334901be58d1e5aa62b973a0889b90d7`
(decoder, 932 bytes) and
`fa376b4c9c8b4d4973191c0ebb515f8f6ea8e7d35724a162a818da0902ed7a63`
(support probe, 674 bytes). Pixi 8.21.0 `WorkerManager` retains its decoder pool
up to `navigator.hardwareConcurrency`; the successor test accounts for that
explicitly. It does not reset the library or change any production code.
Four focused contract tests pass, including pending jobs, unknown workers,
replaced Go identities and exceeded pool limits as failures. A fresh full
same-page repetition is still required.
