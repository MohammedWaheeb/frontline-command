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
- Runtime worker count and resident sprite pages/bytes/picking bits back at the
  initial menu baseline.
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
