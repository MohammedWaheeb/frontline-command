# Ordinary expansion policy for endurance acceptance

This test policy has completed native behavioral preflight, not a new game AI
or a passed browser long-session gate. The two completed same-page US/IR rush matches are preserved
in [multiplayer-rematch-acceptance.md](multiplayer-rematch-acceptance.md). Their
575.65/576.85 active seconds pass the functional journey and fall short of the
separate operational long-session criterion.

The design §26.3 asks for two consecutive long matches without reloading. It
does not define a numeric minimum. We use 20 active simulation minutes per game,
guided by §1.3's 20–35-minute standard 1v1 distribution target. A legitimate
shorter victory is still valid combat evidence. Waiting after a win, pausing,
blocking victory until a clock threshold, or counting slow wall time is excluded.

## Map and matchup

Use the unchanged authored **Dry River**, version 1, SHA-256
`1dc851211269974f5cadb1c6e30850e67014970f90a96c0be9b85feb7ef7b747`.
It is a 128×128 two-player map with three permanent crossings, six finite fields
and two supply stations. Two 36,000-credit starting fields, two 24,000-credit flank
expansions and two 24,000-credit contested fields support actual economic
decisions. US versus Saudi Arabia tests mobile armor, infantry scouting, paid
repair and artillery against a defensive faction. No map bytes, source rosters,
initial credits, construction times or victory rules change.

Copper Junction is a suitable later open-lane comparison, and Relay Heights a
height/vision comparison. Dry River is chosen for its separate crossing and flank
decisions, not because a choke or longer travel can guarantee a particular match
duration. Unlike the earlier Industrial Valley course, this uses a designated
1v1 map rather than two slots of a four-player map.

## Policy contract

`client/tests/render/expansion-commander.mjs` receives one authorized snapshot,
the public map/catalog, and ordinary advice/submission callbacks. It has no
engine instance or opponent-private data. Go retains placement, navigation,
fog, expenditure, supply, combat, repair and elimination rules. A build preview
can be indeterminate; the policy records actual rejection receipts and rotates
candidates instead of treating advisory acceptance as a placement guarantee.

The policy applies these simultaneous priorities:

1. Establish power, harvesting, barracks and a factory. Reserve the **actual
   catalog price** for the selected economic/technology goal, then spend it as
   soon as it can be attempted. The old rush test reserved 1500 credits for an
   1800-credit factory while continuously buying infantry, which could starve
   that purchase. Correcting this policy defect is independent of endurance.
2. Send paid scouts toward public expansion/crossing locations. They may inspect
   only currently disclosed opponents and retreat from observed threats. Paid
   engineers capture currently visible, apparently unthreatened stations and
   repair damaged owned structures; an active channel is not reset every cycle.
3. Field rifles, armor and real support units; reserve a chosen vehicle's actual
   cost so a cheap infantry queue cannot perpetually consume its savings. Add
   radar and artillery through normal prerequisites. Air threats that have
   actually been seen can prompt AA. This initial slice does not yet script
   aircraft, strategic abilities or every research option.
4. Withdraw damaged survivors only if a real owned medic/repair source is
   present, then return them when recovered. Paid repairs use the ordinary
   300-credit player reserve. No health reset, invulnerability or altered
   in-combat repair rule is available to the policy.
5. Prepare a visible, unthreatened flank expansion as the known home field is
   depleted, or when spare credits can fund it. A paid outpost supplies the
   required build radius; a supply center does not. A second center and its
   normal included/paid haulers support continued army production.
6. Defend disclosed threats to the home/forward economy, and apply normal
   attack-move pressure once a small combat force is assembled. A disclosed
   qualifying target triggers a direct attack without waiting for a time
   threshold. Preserve a supported damaged unit, not an already-won opponent.
7. Respond to actual blocked-order feedback with a different public crossing
   approach. A unit that reaches the far waypoint proceeds immediately, including
   the normal case where Go stops just short of its exact coordinate. Search
   last-seen structures and announced endgame indicators by moving to the known
   location; never turn a stale memory into a legal direct-target attack.

Decision intervals/candidate cooldowns only bound duplicate command traffic.
No 20-minute constant exists in the commander. Unit choices and targets depend
on observed resources, production, composition, health and disclosed targets.
The independent verifier measures duration after the actual outcome.

## Preflight and acceptance separation

`expansion-native-build.mjs` verifies every c7e0 candidate source-lock entry,
copies only the three unchanged platform-neutral Session files, and compiles a
JSON-lines test bridge against that frozen Go module. It refuses to replace an
existing build. `expansion-native-bridge.go` exposes only Session create/view,
catalog, ordinary preview/submit/step, hash/save/replay. It does not expose raw
engine state, practice actions, player mutation or a second rules implementation.

`expansion-native.mjs` runs the same JavaScript policy against those APIs and
checks each returned entity for foreign private data. It retains rejected
orders, periodic authorized snapshots, exact source/build/map hashes and the
command/replay bytes. A bounded cap means **incomplete**, not a victory or a
long-session pass. Native stepping is a faster behavioral diagnostic and does
not prove browser resource lifetime, wall-clock performance or actual LAN.

`multiplayer-expansion-rematch.browser.mjs` reuses the existing same-page rematch journey,
strict-error/result/history/archive checks, worker identity classification,
ownership rejection, reconnect and exact replay audit. Its frozen integrated
client/art/runtime needs a fresh receipt after current art integration. No
browser game has run with this policy yet.

## Current evidence

Ten focused policy checks pass: exact factory reservation; the same prompt
qualifying-target attack before and after 20 minutes; support-backed retreat;
unseen expansion; candidate exhaustion; capture-channel preservation;
maintained expansion sight; blocked-route alternatives; near-coordinate waypoint
completion; memory-only scouting; and stale-source cancellation. Some checks
cover multiple related assertions within one test.

The first native three-minute opening was bounded at tick 3617, unfinished. Both
sides paid for and completed factories, started radar, harvested resources and
produced units. Its 4 unseen-placement and 12 occupied-site rejections are retained
in `work/multiplayer-combat/expansion-2026-09-28T21-59-55.875Z/`. It exposed two
policy issues: cheap infantry could also starve the first support vehicle, and
an engineer could repeatedly restart an active capture channel. The successor
prioritizes/reserves vehicle spending and preserves active channels. These are
test-policy corrections, not changes to game rules.

The first bridge compilation failed because its test module name could not
import the frozen internal snapshot converter. The successor uses the allowed
module namespace without modifying that converter or frozen source. A test
syntax error was corrected before the six passing checks; neither failed
preparation is represented as a completed gameplay run.

## Native progression and final policy result

All cases use unchanged standard-v2 Go 0.3.4, public Dry River and ordinary US/SA
players. Each directory under `work/multiplayer-combat/` retains its exact
commander source and compact receipt. Every predecessor remains distinct:

| Native directory suffix | Result | Finding |
|---|---|---|
| `expansion-2026-09-28T21-59-55.875Z` | Unfinished at tick 3617 | Initial paid factory opening; support-queue and channel corrections above |
| `expansion-2026-09-28T22-01-04.474Z` | US elimination, tick 16578; 823.9 active seconds | Genuine short victory; old candidate cooldown could revisit occupied near cells before trying wider sites, and expansion needed maintained current sight |
| `expansion-2026-09-28T22-03-17.727Z` | Unfinished at tick 48008 | Forward economies built, but retained blocked central routes made duration unsuitable as endurance evidence |
| `expansion-2026-09-28T22-07-49.876Z` | Harness failure after the tick 34213 progress sample | A unit died while earlier awaited commands advanced Go; later use of the stale source failed `not_owner`. Exact submitted command history is retained; this predecessor did not export a final save on failure |
| `expansion-2026-09-28T22-09-28.207Z` | Unfinished at tick 60036 | A route-completion bug kept some units at x80499 waiting to cross x80500, despite ordinary arrival. This longer diagnostic cap changed no 90-minute gameplay limit and did not qualify the run |
| `expansion-2026-09-28T22-11-20.302Z` | US elimination, tick 37916; 1890.8 active seconds | Final corrected policy, seed 731; full replay/checkpoint/restored-midpoint hashes match |
| `expansion-2026-09-28T22-13-32.837Z` | US elimination, tick 37916; 1890.8 active seconds | Same final policy, seed 732; full replay/checkpoint/restored-midpoint hashes match; not an independent balance sample |

The final source SHA-256 is
`31e2fba43279ce37b89f5d08f72019bd2d55c37451f9d84309ffa30bb05b68b5`.
Seed731's exact replay SHA-256 is
`022e726c9aff6de16774b79fa72ff6aec53668e60ed71b649876d888617c88ba`.
Initial playback, final checkpoint and restored midpoint all finish at
`09e4701ba042e2414934dc4a441e5a95ee03d1fb87b3fa6d4e2bae275b263c55`.
Seed732's replay SHA-256 is
`0b1a6a8989703b8cc2d82bd6e316e5d90644b58acd7274214d82daa5a657618f`.
Its same three playback/restore paths finish at
`e3612ce09030e74ee049e31280a527c7ec0a97ebc4161344320b632334137565`.
The global native ledger records 2911 weapon shots, 136 destructions, 31 completed
buildings, 140 ready units, two station captures and two paid emergency rigs.
Authorized per-player event counts can differ from global native replay counts;
the policies never receive the latter. The generic replay verifier's inherited
“host orders” scope text does not change this input's origin: these are native
Session orders, not a network-host or browser course.

The final strategy remains deliberately bounded. Its normal rejected orders
include unseen/occupied placement, targets lost during combat and unavailable
repair targets. Those receipts are retained. There is no claim of competitive
strength, roster completeness, 50-minute play quality in a failed predecessor,
or browser resource stability from the native outcomes.

Reproduction, with a new build directory and no other native preflight active:

```sh
FRONTLINE_EXPANSION_BUILD="$PWD/work/multiplayer-combat/expansion-build-UNIQUE" \
  node client/tests/render/expansion-native-build.mjs

node --test client/tests/render/expansion-commander.test.mjs
FRONTLINE_EXPANSION_BUILD="$PWD/work/multiplayer-combat/expansion-build-UNIQUE" \
FRONTLINE_EXPANSION_SEED=731 FRONTLINE_EXPANSION_MAX_TICK=48000 \
  node client/tests/render/expansion-native.mjs
```

The browser entry point is
`client/tests/render/multiplayer-expansion-rematch.browser.mjs`. It requires a
fresh explicit immutable `FRONTLINE_COMBAT_BUILD`, `FRONTLINE_COMBAT_REUSE=1`,
headed hardware selection and the source-matched native replay verifier, as in
the original rematch recipe. It must still earn both complete games and preserve
every strict error before the browser endurance requirement can pass.

## Integrated browser preparation

`build-expansion-current-v1` freezes current source, shipping actor art and the
unchanged receipt-verified c7e0 host/WASM. Its client source digest is
`87f0e5c0faf91d0c728b101479cbdc17d10d2b31f91cfff4967896baead03766`.
The 59 effects remain an **isolated reviewed candidate**, not shipping art.
`multiplayer-expansion-effects.mjs` validates its whole dependency graph, copies
exact files into this unrun test product, preserves the original build/art/pack
receipts, and regenerates the exact offline pack. The effect-index SHA is
`7ed104b52445915761e17654500fb217ca79843924a3a56c000e4a009d49aac5`;
the final 4060-file base-pack SHA is
`ef697e4543c312294c7c27381d5dc1be28ba6d529689242047a6a8a5496d2b22`.
These preparations alone do not pass either browser game or complete the art.

The first integrated attempt is now preserved in
[multiplayer-expansion-acceptance.md](multiplayer-expansion-acceptance.md): the
first36m36.7s victory passed exact native replay/restore checks; the second was
explicitly aborted for queue-recovery and finite-search omissions in this test
policy. The two-long-match gate is still open despite zero browser/HTTP errors.
