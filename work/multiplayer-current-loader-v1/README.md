# Preparation03: bounded cleanup and independent reconnect attempts

29 September 2026, before the first3H+1AI launch. The execution target is now
`prepared-03`, receipt
`55422bb2345e7381ac7cd886eb1c6e262c91623a95198633867582cb73693c83`.
It preserves the exact App build03 product and both commander files. Only the
test driver plus new safety helper/tests differ from prepared02; six tests pass
and build-only verifies5,631 pins. Prior preparations and their notes below
remain unchanged historical author records.

An independent `--minutes` timer (default60) now bounds all browser phases from
successful browser launch through readiness/combat/replay/menu cleanup, even
while a decision await stalls. It invokes the same once-only context/browser/host
cleanup used by ordinary completion, records expiry as failure, and preserves
raw diagnostics. Host/browser startup retain separate startup limits; the
subsequent earned-replay native audit is outside this browser timer. For any
future two-round endurance run, the caller must explicitly choose an adequate
whole-course budget; no game timer or outcome is changed.

Reconnect scheduling records each inactive/missed attempt as a failed requirement
without starving later eligible humans. Death during an attempt or an actual
error is also explicit; no skipped human counts as a reconnect pass. The existing
all-human journey assertion still fails when any required reconnect is missing.

The safety tests cover dead-first/survivor-next, mid-attempt loss, propagated
reconnect error, cleanup despite stalled work, once-only cleanup, normal timer
cancellation and retained cleanup failure. See `successor03/receipt.json`.
Use the prepared03 copied driver/receipt; do not rewrite prepared01/02. The
initial current-loader body diagnostic is separately checkpointed under
`../multiplayer-current-loader-diagnostic-v2`; its strict387-abort FAIL is not
relabeled and its instrumentation is not added to this match.

# Frozen current-loader multiplayer course — author handoff

29 September 2026. **Ready for coordinated execution; browser and native matches
UNRUN.** This checkpoint changes test drivers and private preparation only. It
preserves the earlier v24/current-loader failures and does not rebuild or alter
any product, Go rules, UI, art or deployment.

The ready directory is `prepared-02`. `prepared-01` is preserved as the earlier
successful author preflight before the earned-replay UI course was added.
Preparation02 and the copied driver's `--build-only` each checked **5,627**
source/runtime/helper/package entries. Eight focused Node tests pass. Only two
small passive TS helpers (protobuf decoder and minimap projection) were bundled;
no App/Vite build, Go compilation, native executable, host or browser ran.

## Exact boundary

| Input | Identity |
| --- | --- |
| Unchanged product | `work/art-generation-consumer-v1/app-v3-build-03/product` |
| Product build receipt | `f714d2d6c761dc9b389f91034f361e4662f0c420e42905b1229b1ee76d7cd445` |
| Loader v3 source lock | `a70a5df5cb053b9f1ee96f5ced310b83f99c2514764f6409c27b286d8ab21282` |
| Integrated Go0.3.4 lock | `3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750` |
| Integrated runtime receipt | `cc990ac7f78d5a1094dd635d06bff0cb04d2c055ce413dbd114a7233bb176e69` |
| WASM | `d1d7b97deaa4c73f58ba8b8035858d524d24c64d5c52f4ce4e71bcd47dbdb7ae` |
| Host | `36ca8c93f538696206317113d50af6ee31ac92fcbcd626a0a9f9b0ceaab8a5e0` |
| Base pack | `9387365786fcd3f53049bdd1a87482a37eac8f18561fa276d36c977f26224559` |
| Preparation02 receipt | `e7637f6546778c4bc38c79d4f00317860c69c405b627cfa5415e4dac444875f2` |
| Existing native replay auditor | `20b16cdc09b5d440b0b5230069ac44b9c6e7a750a78dcaaffc6123f9ecda1849` |

The pack contains **4,845 files / 587,425,553 encoded bytes**. It retains the
**v25+36 incomplete art** union; the art index has 85 sprite records, 22 terrain
records and 59 portrait/build-icon records. These are index counts, not complete
roster or visual approvals. No later staged43 roster, pending audio candidate,
Claude review, or live UI change is silently included. The earlier genuine
Firefox17-check solo/save/replay pass belongs to this exact build; it does not
provide multiplayer coverage.

The existing auditor is copied from `work/multiplayer-combat/v24-34-prepared-02`
only after its receipt, binary, source, modfile and integrated source lock are
verified. The old **product** is not reused. The auditor runs only after the new
browser/host closes and verifies full replay, checkpoint seek, midpoint
save/restore continuation, actual initial countdown, ordinary standard resources,
paid income/build/train for every participant, elimination outcome and hash.

## Matrix and priority

Each row needs a separate explicit launch. There is no automatic next-case
launch, no default case, and no bundled broad matrix execution.

| Case | Humans / normal Go bots | Format; human factions | Current build03 result |
| --- | --- | --- | --- |
| `3h1ai` | 3 / 1 | FFA; US/IR/SY, SA bot | **UNRUN — first priority** |
| `3h` | 3 / 0 | FFA; US/IR/SY | UNRUN |
| `1h1ai` | 1 / 1 | Custom opposing teams; US, IR bot | UNRUN |
| `1h3ai` | 1 / 3 | FFA; US, IR/SY/SA bots | UNRUN |
| `2h` | 2 / 0 | 1v1; US/IR | UNRUN |
| `2h2ai` | 2 / 2 | Human team US/IR versus SY/SA bots | UNRUN |
| `4h2v2` | 4 / 0 | US/IR versus SY/SA | UNRUN |
| `endurance2h` | 2 / 0 | Dry River US/SA, two hosted rematches | UNRUN |

All nonendurance cases use unchanged Industrial Valley. The host generates the
seed; the driver neither replaces it nor selects a convenient replay. For the
new 3H+1AI case, profiles1–3 are independent contexts and normal UI-created
accounts; player4 is an actual host Go **normal SA AI**. Lobby and earned-replay
roster gates both check exact role/faction/team; a fourth human, script actor or
different bot difficulty cannot satisfy the gate.

Historical proofs remain source-specific: v24 1H+3AI earned an ordinary tick31,479
victory with lifecycle/native replay success but **strict FAIL on1,131 raw
request diagnostics**. Older 3H earned ordinary combat/native success and a
separate copied-host recovery pass, with fresh full strict coverage still open.
Older optimized4H quiet strict pass is not this package. Two short same-App2H
wins do not satisfy two long matches; the later long expansion round2 was an
explicit policy abort. See the unchanged
[historical matrix](../../docs/multiplayer-v24-acceptance.md),
[3H/4H course](../../docs/multiplayer-combat-acceptance.md), and
[expansion evidence](../../docs/multiplayer-expansion-acceptance.md).

## What the driver checks

Normal App controls create profiles/lobby, choose factions and bot difficulty,
gate start on all humans' readiness, load/render the battlefield, reconnect each
human, recover each authenticated durable result, save the earned replay and
return to menus. Human combat is **API-assisted** through the existing frozen
Application's authenticated `sendOrders`/advice path. It is not an all-click
combat playthrough. `MatrixCommander`/`ExpansionCommander` are unchanged and see
only their own current authorized snapshot and public map/catalog. Go alone
spends resources, executes combat and determines elimination.

Every human needs an accepted paid build, train and tactical order, an actual
visible-enemy ownership rejection and a live reconnect. Reconnects begin after
tick600, one human per decision cycle; a player lost before reconnect does not
get a substituted success. Every live decoded snapshot checks its player and
own-only `EntityPrivate`. The replay roster checks bot identity and actual paid
production independently. Default bounded wall wait is60minutes; a timeout or
explicit SIGUSR2 policy stop is failure with views/ledger/screens, never a
manufactured outcome. Surrender, practice and selling to accelerate are forbidden.

The host opens the last earned replay using normal `Watch`, Home/End timeline,
Play/Pause and perspective controls. All human/bot fog perspectives must keep
private metadata owner-only. Read-only UI has no production choices and a normal
right-click must not forward a Go `submit`. A narrow method-name observer counts
only original worker calls, preserving arguments/transfer lists/return values
and exceptions; it never reads replies or command bodies and never changes
worker lifetime. The replay remains byte-identical afterward. Full simulation
hash equality is the separate native audit; a visual seek is not called a hash
proof.

Captures include independent1600×900 host and1280×720 other-human contexts,
roster/opening/result/replay/menu and periodic combat views. Lifecycle gates keep
Application/document/profile identity and verify sockets, frame subscribers,
Go workers, current art pages/bytes and picking storage return to menu baseline.
The existing entry cannot separately certify every FX or audio object, total
GPU memory, actual speakers or reference-hardware performance.

Page/console/HTTP and passive CDP/Playwright failures remain strict. Any new
`ERR_ABORTED` is an unclassified failure, even if an unrelated earlier instrumented
request delivered exact bytes. No body-consumption instrumentation or blanket
whitelist is imported into this match. Failures persist through cleanup, and the
native audit can still preserve a genuine combat success after browser failure.

## Execution handoff

**Do not run during Einstein's audio/browser lane or another live match.** Parent
must release the sole browser/host lane. This course also starts one native
replay audit with `GOMAXPROCS=1` **after** all game contexts and the host close;
coordinate that sequential CPU slot with the artist. There is no Go compile.
The package requires a working power/awake window long enough for an ordinary
match. Browser plugin is absent; this course uses existing Playwright Chromium
(or explicitly supplied compatible Chromium executable), not stock Firefox or
Safari evidence.

Safe author-only recheck:

```sh
node work/multiplayer-current-loader-v1/prepared-02/source/multiplayer-current-loader.browser.mjs \
  --prepared work/multiplayer-current-loader-v1/prepared-02 --case 3h1ai --build-only
```

After explicit lane release, one actual course (new output required):

```sh
caffeinate -i node work/multiplayer-current-loader-v1/prepared-02/source/multiplayer-current-loader.browser.mjs \
  --prepared work/multiplayer-current-loader-v1/prepared-02 --case 3h1ai \
  --out work/multiplayer-current-loader-v1/3h1ai-01 --headed --minutes 60 \
  --conditions 'Shared host with documented artist activity; correctness only, no performance claim.'
```

Preparation verifies the entire manifest and all frozen source/helper/binary pins
again before launch and after process closure. Reuse the copied **prepared-02
source driver**, not a later mutable repository file. If source or product
changes, create a new preparation/output; do not rewrite this receipt.

A separate native commander preflight is optional, not yet earned. If the parent
wants it before the first long match, prepare a new test-only bridge against
exact integrated3d49 source and run a **single1,200-tick bounded 3H+1normalSA
opening** with public-view MatrixCommander, default starts/resources and a fixed
recorded diagnostic seed. Check real paid production, own-only views and command
receipts; preserve final save/replay even when unfinished. Compile/run only after
CPU coordination, `GOMAXPROCS=1`, no concurrent native cases. This can catch setup
or policy bugs but cannot prove ordinary match completion, host timing,
reconnect, renderer or this random-seed browser course. Do not substitute the
older c7e0 bridge's exact source identity for integrated3d49.

The two large preparation receipts are checkpointed as exact-byte gzip archives
(`prepared-01-build.json.gz`, `prepared-02-build.json.gz`), with original and
archive hashes in `build-receipt-archives.json`. The local executable preparation
keeps their unmodified `prepared-*/build.json` files. Compiled host/auditor and
node_modules are excluded from the Git checkpoint.
