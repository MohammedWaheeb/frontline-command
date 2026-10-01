# Frontline Command — takeover handover

Prepared 1 October 2026, approximately 10:39 Qatar. **The release is unfinished.** This document records the latest actual state after the interrupted F17 rebuild. It supersedes older pending descriptions for the items below; preserve all older sources and failed evidence.

## Takeover instruction

Continue the existing Frontline Command goal until the complete, playable local release is delivered. Do not create a duplicate goal, set a token budget, deploy, or mark a milestone complete. Use `get_goal` first: its last returned status was `blocked` despite resumed work making progress; it was not complete. The tool cannot directly set status to active. Do not interpret that old status as permission to stop implementation.

Work in `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i`, **not** the default `/Users/mohammedkalouti/dev/game`.

Read these sources before work:

1. This handover.
2. `work/coordination/2026-09-30-goal-resume.md` (append-only actual checkpoint).
3. `outputs/frontline-command-agent-handoff.md`.
4. `outputs/frontline-command-game-design.md`.
5. `docs/implementation-status.md`.
6. `docs/release-blockers.md`.
7. `docs/2026-09-30-user-gameplay-additions.md`.

The user wants playable completion soon and authorized implementation. Go owns deterministic simulation/backend. The latest user assigns assets to another model: **do not generate, render, import, or redesign assets**. Retain functional faction colour distinctions; package existing assets. Root owns integration and Git. Do not stage broad dirty/untracked trees or other model changes.

Inspect collaboration and processes before execution. Reuse the existing roughly 48-worker tree with distinct useful ownership; do not manufacture duplicate reviews to fill slots. Many old agents errored because `gpt-6.1-sol` was unsupported after an account/model switch. User explicitly permits Luna for simple scoped tasks. Existing newer `/root/readable_prerequisites`, `/root/archives_protocol_type`, and `/root/archives_protocol_retry` are completed. Most original workers are completed/errored, not actively executing. Only root should integrate shared files. Serialize heavy Go/build and browser work on this machine; no Blender work under current asset ownership.

## Actual process state at handover

A fresh process inspection after interruption found:

- No active `node scripts/local.mjs build`, Go build, Archives runner, or F17 server.
- Ports 8088 and 8089 have no listener. `curl` to F16 8088 fails. Earlier F11–F16 host PIDs/session IDs in checkpoints are stale: their processes are no longer present.
- User service PID **89984** remains on port **8080**; preserve it, its data, and related user services.
- Protected user Chrome PID **27272** remains running. Do not terminate or reuse its profile. Browser acceptance launches a separate owned profile/process and closes only that owner.
- F17 foreground server session39781 was explicitly stopped before the last build. Old `native-host-01/pid` contains failed background-launch PID30735 and is stale.
- Last disk check had approximately 20 GiB free before the latest package was written. Check again before large copies. Use APFS `cp -cR` for required source clones; retain historical failures/packages.

## Current package: F17 / simulation 0.3.8

Source:
`work/playable-release-integration-v1/frontend-17/source`

Package:
`work/playable-release-integration-v1/frontend-17/source/dist/frontline-darwin-arm64`

F17 was APFS-cloned from F16, then changed only the prerequisite disclosure CSS and its summary aria-label. Backend/content rules remain the qualified Core26 production code. No asset authoring occurred.

The initial F17 build at 07:27 UTC completed normally. Its app/runtime TypeScript checks passed; runtime tests: **646 total, 641 passed, 0 failed, 5 skipped**. A browser run then exposed its close control being covered by the top HUD. Root changed the expanded pane's top inset from `clamp(8px,4vh,32px)` to `clamp(56px,8vh,72px)`, preserving the side/bottom insets.

The subsequent build tool call was interrupted by the user, but the build finished on disk at **2026-10-01T07:32:47.218Z**. No build process remains. Root then independently ran `verifyProduct` and `buildSourceIdentity`; both succeeded. This confirms current static package integrity, **not** the pending browser acceptance or a captured build-process exit status.

Current identities:

| Field | Actual value |
|---|---|
| Simulation / protocol | `0.3.8` / numeric `1` |
| Content | `8b21347ab06fdb653dcbe17cedb50dbcc49f3ed25df66cc53fe52b53f07ef108` |
| Go source identity | 249 files, `d37d26d34027eb3102c346ff195d8377caff5fdec5d1ec161d5bb59e28e5f6e9` |
| Presentation source | `7a18bc649cb5414fb23d8e572a3560e574cf86e79ec9f6cb0aba8f3060504d08` |
| Pack SHA256 | `b562977d8a28c2b7f2637a199fd7048d97faa52fcc6f14c757976e16e537dced` |
| Pack | 6751 files, 1,110,451,511 bytes |
| WASM SHA256 | `ae5f3a064a0899d290fa4fb87ddd6d8ab6bfde65d497239e0c19c6ed54958a2b` |
| Current game.css SHA256 | `459060c47edcff00a512644a0ab4360f662a8e1512621ca804fe9ad01f3db0ce` |

The old F17 package is preserved as `dist/frontline-darwin-arm64.previous-1790839968993`; the earlier cloned package is also preserved. Do not call these current acceptance.

To launch the current package in an owned foreground terminal after confirming port8089 is free:

```sh
cd /Users/mohammedkalouti/Documents/Codex/2026-09-27/i/work/playable-release-integration-v1/frontend-17
./source/dist/frontline-darwin-arm64/frontline \
  -addr 127.0.0.1:8089 \
  -data "$PWD/native-host-01/data" \
  -static "$PWD/source/dist/frontline-darwin-arm64/client" \
  -maps "$PWD/source/dist/frontline-darwin-arm64/content/maps" \
  -missions "$PWD/source/dist/frontline-darwin-arm64/content/missions" \
  -state-updates-hz 10
```

Verify `/api/v1/health` and `/runtime/version.json`. `/health` is not the health endpoint. A previous `nohup` launch did not persist; foreground exec sessions worked. Keep the owned session alive for browser tests.

## First next action: finish prerequisite readability

Current driver directory:
`work/resume-20260930/browser/editor-frontend17-readable-prerequisites`

This copies the prior actual onboarding course and its passive Go observer. Root changed only the runner's fixed source stage to F17; the existing 240-second course, input checks, money limits, campaign budget and colour-vision tests remain.

Actual failures retained:

- Initial attempt stopped before browser because freeze was outside the F17 stage.
- `onboarding-native-01/result.json`: pre-browser stale F16 campaign mission path.
- `onboarding-native-02/result.json`: real UI run failed at `ordinary-courses.mjs:210` while closing the expanded Factory prerequisite disclosure. No raw browser errors, no cleanup errors. The top HUD covered part of the sticky summary. Screenshot: `onboarding-native-02/money-1000000-native-hit-005-failure.png`.

The source now moves the pane below the HUD, but **has not been retested**. Do not infer this is sufficient: inspect the actual geometry/hit evidence and screenshot. Other HUD/tooltips also sit above the pane; actual readable content and close control must both be usable.

**Existing F17 freeze and configs are stale after the second build.** Do not run them unchanged:

- `work/playable-release-integration-v1/frontend-17/browser-source-freeze-01.json`
- driver `frontend17-source-freeze.json`
- `config.ROOT-GRANTED.json` and `config.ROOT-GRANTED-02.json`

They pin the initial F17 pack `0f21bcd0…`, not current `b562977d…`. Preserve them and write a fresh freeze/config/output. The runner requires `sourceFreeze.file` inside the F17 stage directory. Config must pin current package/native/WASM/protocol/pack/browser and every copied driver/helper. `campaignMission.file` must point to F17's installed US01 JSON. Keep original course bounds and all assertions. Command:

```sh
node /absolute/driver/runner.mjs --execute --config /absolute/fresh-config.json
```

The disclosure source is `client/src/ui/BuildingPrerequisiteDetails.tsx` and `client/src/styles/game.css`. Expanded native details uses a fixed scrolling pane with sticky summary. Original private patch (before HUD correction): `work/resume-20260930/graphics/functional-prerequisites/readable-disclosure-v1/change.patch`. F17 source is now newer than that patch.

## New earned Archives acceptance on F16

**Actual PASS:**
`work/resume-20260930/browser/archives/frontend16-seek/native-10-actual/result.json`

Status `completed-fixed-healthy-public-archives`, `nativeConsumerAcceptance: true`; both producer and recovery phases completed; `cleanupErrors: []`, `finalPinDrift: []`. Result SHA256:
`d449d6fe818c56dfbd259fa846719ee13a4e3389d98f20d1956a143057081693`.

The ordinary course produced US01 save/replay downloads, imported into a fresh profile, reloaded the document, exported portable/original bytes, loaded the save, watched and sought the replay, then returned through ordinary UI. This is F16 evidence. Do not relabel it F17 or whole-browser cold persistence.

Preserve all earlier Archives attempts. Their causes were stale fixture assumptions: protocol numeric1 versus string1 in runner, terminal observer, producer admission and consumer checks; and a nonexistent `Command center` main-menu button. Corrections normalize only protocol representations and navigate directly to actual `Load operation`/`Replay archive`. All other identity and gameplay assertions remain. Latest successful source/config is `config.ACTUAL-ROOT-09.json`; old configs/results are historical. Original runner/manifest preimages exist in `archives/protocol-preimage`; sibling `source-successor-01` contains earlier source. The relative-argv launch error had no result directory. Failed `native-04` through `native-09` retain their outputs.

## Other earned results and remaining feature work

F16 matching Go0.3.8 package had actual WASM parity: **463 operations and 20 credited Save states**, plus current runtime646:641PASS/0FAIL/5SKIP. F16 cold offline and cold audio passed original120/240s bounds, all6751 cached files, actual advancing clock and nonzero waveform. These remain version-labelled subsystem evidence; final F17 cold/audio and changed WASM need appropriate matching verification.

F16 onboarding actual PASS:
`work/resume-20260930/browser/editor-frontend16-campaign-money-prerequisites-title/onboarding-native-ROOT-20261001T041043Z-01/result.json`.
It proved custom1/1,000,000 credits, invalid input disabled, prescribed US01 6000 credits, and colour-vision persistence. It exposed the narrow unreadable expanded prerequisite panel; that is why F17 exists.

F16 whole-five native04 failed only after earning normal Import/Load, Radar Pulse, mixed Recon Observe with unsupported rig FIFO preserved, a completed150-credit forward barricade, paid launcher2400/55s, deployment, natural second charge, an accepted two-point volley with600-credit debit and two missile projectiles, Shahed400/18s production, and natural second Radar recast. Shahed commitment failed Go preview at tick10711, exactly Radar10591+120 expiry; UI correctly withheld submission. Terminal Shahed behavior and final manual save/export remain unearned in that ordinary course.

Existing source correction:
`work/resume-20260930/browser/controller/whole-five038-shahed-expiry-source/feature-course.mjs`.
It waits for scan expiry and chooses a currently visible valid point, preserving10–30tile range, clearance, physical terminal checks and374603ms total bound. Inspect existing controller worker/source for the additionally authorized normal Save→Export→Load span; do not invent a save or alter its bytes. Rebind to final package, then run one bounded successor after the prerequisite UI test closes.

Faction colours already distinguish US steel blue-grey, IR green, SY rust and SA sand, with public-owner and player-slot colouring and colour-vision support. Actual four-player/same-faction lobby colour acceptance remains outstanding. Source packet: `work/resume-20260930/graphics/functional-faction-identity/multiplayer-coverage-v1/ready.json`.

## Campaign: actual failures still block completion

Current0.3.8 full150: **132PASS/18FAIL**, originals preserved.

Focused successor04 exact19 completed **7PASS/12FAIL/0UNRUN**, all7 passes with strict persistence. Six former failures fixed; NormalFactory control remained passing. Actual run:
`work/resume-20260930/release/campaign/actual-core26-bind03-successor04/execution/runs/20261001T035737Z-all-subset/run.json`.

Remaining causes: six SY01 rig combat losses, SY03Normal post churn/Hard attrition and engineer duty override, SY05Normal/Hard captured relay losses, Hard Observer optional network progress1 despite required victory.

Root partial successor05:
`work/resume-20260930/root/campaign-test-successor-05/composition.json` and `source/`.
Status SOURCE_ONLY_PARTIAL_SUCCESSOR05_NO_EXECUTION, production delta0. Already composed:

- SY03Normal stable posts (`renderer/picking/territory-successor-05-normal038-stable/literal-operations.json`).
- Hard Observer arrival using actual carrier radius600 (`ai/current038-ir06-hard-arrival-v1/literal-operations.json`).
- SY01 public visible threat direct attacks by the existing escort (`ai/sy01-sy05/actual19-sy01-armed-escort-v1/literal-ops.json`).

Do not apply these twice. Unintegrated candidates include:

- `systems/lifecycle/sy03-hard-home-engineer-duty-successor/ready.json`.
- `ai/sy01-sy05/actual19-sy05-hard-capable-siege-v1/literal-ops.json`.
- SY05Normal: actual relay dies with an empty defense lease because paid replenishment waits until stabilization ends. Existing `/root/ai/bridges` identified the seam; inspect messages/source and implement a narrow public-information commander correction.

Complete source05, select remaining failed leaves plus truly affected passing controls, compile once, run serially. Do not repeatedly rerun the unchanged full150. Preserve original budgets, mission goals, survival gates, optional objectives and deadlines. These are test commander corrections unless actual product evidence proves a product bug.

## Multiplayer, endurance, editor, final package

Existing multiplayer queue:
`work/resume-20260930/release/multiplayer/queued-f16-pending-freeze.json`.
`prepared-f16-01` was absent. Rebind to the final package instead of blindly running F16 commands. Existing helper:
`work/resume-20260930/release/multiplayer/source-f15/prepare-binding.mjs --package <package-root> --source <source> --out <fresh-prepared>`.

Existing worker `/root/release/multiplayer` has exact compile/matrix commands. Cases:2,1,1ai,2ai,3,4,Convoy,Twin,endurance1h3ai. Compile the native replay auditor once against final source. Run serially. Endurance must earn **two consecutive natural rendered games of at least20 active minutes each**, original60-minute bound per round, actual exported replays. Do not claim bot-only simulations as rendered endurance. Include reconnect, earned visibility removals, results and faction-slot identity. Input/pending/paint timing remains unmeasured where actual hooks are absent; report null rather than infer it.

Editor ordinary persistence and Test Play remain unrun. The existing F16 editor entry is prepared alongside onboarding; adapt package bindings, preserve actual ordinary UI requirements and bounds. Archives acceptance does not prove editor acceptance.

After source stabilizes, finish final matching WASM/native parity, cold offline/audio, package integrity and player launch documentation. The guide `outputs/frontline-command-local-play.md` currently points to F16/8088 and must be updated only after the chosen preview/package is actually launched and verified. No deployment.

## Load results: retain measured scope and labels

Actual F15 same-Go-production500-client arms passed:125 canonical four-player rooms,500 authenticated clients,120 seconds per10/20Hz state arm. All measured commands/advice accepted. Actual comparison:
`work/resume-20260930/art_load/load_correctness/frontend15-comparison-01.json`.

| Metric | 10Hz state | 20Hz state |
|---|---:|---:|
| Median TPS | 19.999873 | 19.999881 |
| Stream traffic | 34.725MB/s | 69.419MB/s |
| Execution p95 | 49.01ms | 48.31ms |
| Advice p95 | 22.247ms | 21.412ms |
| Missed tick intervals | 0 | 1 |

Retain10Hz state default,20Hz simulation/receipts/removals, immediate feedback and bounded interpolation.20Hz doubled traffic with little latency difference. Heap maxima are sampled Go heap, not RSS. This course did not prove rendering, peak actor counts, physical LAN or visibility removal. Preserve the F15 label. If production Go changes, run fresh matching actual500-client10/20Hz arms; never retag old evidence.

## Completion and operating discipline

Finish demonstrated problems and actual acceptance. Do not spend the critical path on repeated review paperwork, new harnesses for already-working cases, unchanged test repetitions, or speculative polish. Browser fixtures have accumulated stale labels and protocol type assumptions: inspect all related comparisons before launching repeated courses. Bind actual output hashes, not expected guesses.

Current Git revision in built metadata is `2834fcc4f28a090cb4b1b3b6767988f56a7fb2ae`; subsequent Archives/F17 work is uncommitted. The repository contains a very large unrelated dirty/untracked tree. Root must use explicit paths and preserve external work. Previous useful commits: `f5f50b4` launch guide; `2834fcc` prior acceptance checkpoint. This handover is newly written, not a release commit.

Existing continuation automation ID is `continue-frontline-command`. Update it, if needed, to point at this handover/current checkpoint; do not create a duplicate. Stay quiet on unchanged/non-actionable states. The user asked for this document so another agent can take over; no message was sent to another user-owned chat.

Physical second-machine LAN, reference hardware performance, Safari/other OS, human balance and human listening require their actual environment or participation. Report those limits separately from missing implementation/local acceptance. External assets remain the other model's responsibility. Deliver the playable matching package, verified launch instructions, honest actual results and limitations. **Do not mark the goal complete until the full intended release is handled.**
