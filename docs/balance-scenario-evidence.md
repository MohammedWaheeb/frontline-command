# Reproducible balance scenario evidence

Recorded 2026-09-28 against simulation `0.2.0`, protocol `1`, base-content hash `318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`, seed `2505`.

**70 measured scenarios pass:** 16 prepared ground engagements, 36 legal opening comparisons and 18 aircraft sorties. The focused Go run completed in 26.658 seconds on Go 1.27.1, darwin/arm64; `go vet ./pkg/sim` also passes. These are deterministic acceptance fixtures for the first three items in design §25.5. They do not establish complete roster balance, visual playability or completion of the entire playable test suite.

Implementation: [balance_scenarios_test.go](../pkg/sim/balance_scenarios_test.go). Evidence: [scenario directories](../work/evidence/balance), [file/hash manifest](../work/evidence/balance/manifest.json), [complete passing log](../work/evidence/balance/test-run.log).

## Reproduce and inspect

From the project root:

```sh
FRONTLINE_BALANCE_EVIDENCE="$PWD/work/evidence/balance" go test ./pkg/sim -run '^TestBalance' -v -count=1 -timeout=180s
go vet ./pkg/sim
```

The three long matrix entrypoints skip under `-short`; run the dedicated command above without `-short` for their measured evidence. These guards were added after the recorded full run and do not change scenario behavior.

Omit the environment variable to test without writing artifacts. Every case produces:

- `initial.save.json`: exact Go save, independently restored before the test; includes the synthetic 96×96 map and all prepared state.
- `commands.json`: accepted authoritative commands with ticks, player IDs, sequences and orders.
- `result.json`: measured economics/combat, metadata, final tick/hash and replay verification.
- `replay.fcr`: normal encoded Go replay, decoded and simulated from its initial save to the final tick **without checkpoints**, requiring exact engine-hash equality.

All post-setup commands use `Engine.Submit` and normal ticks. Tests reject failed execution receipts, negative credits and Supply above 100. Prepared structures must pass normal prerequisites, build-zone and placement checks, excluding their own footprint from the collision check. No gameplay values or rules are retuned. JSON credits and HP are integer thousandths; ticks run at 20/second and positions use 1,000 fixed units per map cell.

## Ground compositions: 16 resolved engagements

Each matchup runs with equal initial army budgets and equal army Supply, on open terrain and broad cover, in normal and mirrored positions. HQ and rig remain the standard common endowment. Both sides receive identical prepared, paid power/supply/barracks/outpost/factory infrastructure costing 5,700 credits and the included hauler parked on Hold. The exact fixture grant is that infrastructure cost plus the stated army budget. Army purchases are debited at catalog cost and counted in Spent; surplus remains unspent. There is no harvesting, reinforcement or support healing.

These are prepared-force battles, not simulated build orders. They cover two single-type counter matchups; mixed-army coverage remains future work. A normal five-second countdown runs. Both forces attack-move to the opposing start, then every five seconds regroup toward the centroid of **currently visible** enemies, or the arena center without enemy sight. This policy is recorded in each result/replay. All battles end by army elimination within three minutes. HQs remain alive, so the result is a combat outcome, not a full-match victory.

| Comparison | Army A | Army B | Army budget each | Surplus A / B |
|---|---|---|---:|---:|
| Equal credits, rifles/cars | 10 US rifles, 20 Supply | 6 IR cars, 12 Supply | 3,000 | 0 / 0 |
| Equal Supply, rifles/cars | 6 US rifles, 12 Supply | 6 IR cars, 12 Supply | 3,000 | 1,200 / 0 |
| Equal credits, AT/tanks | 5 US AT, 10 Supply | 2 SA tanks, 8 Supply | 2,800 | 300 / 0 |
| Equal Supply, AT/tanks | 4 US AT, 8 Supply | 2 SA tanks, 8 Supply | 2,800 | 800 / 0 |

Both orientations are shown. Survivor HP and value are recorded per case.

| Matchup / constraint | Terrain | Winner | Survivors, normal / mirrored | Combat seconds, normal / mirrored |
|---|---|---|---:|---:|
| Rifles/cars, equal credits | Open | IR cars | 4 / 3 | 50.15 / 51.05 |
| Rifles/cars, equal credits | Cover | US rifles | 3 / 5 | 72.15 / 55.60 |
| Rifles/cars, equal Supply | Open | IR cars | 6 / 6 | 29.40 / 28.95 |
| Rifles/cars, equal Supply | Cover | IR cars | 6 / 5 | 35.00 / 38.95 |
| AT/tanks, equal credits | Open | US AT | 5 / 5 | 21.05 / 21.80 |
| AT/tanks, equal credits | Cover | US AT | 5 / 5 | 24.40 / 22.60 |
| AT/tanks, equal Supply | Open | US AT | 4 / 4 | 25.20 / 23.55 |
| AT/tanks, equal Supply | Cover | US AT | 3 / 4 | 26.05 / 23.75 |

Cover reverses the equal-credit rifle/car outcome in both orientations. It improves rifle survival in the equal-Supply fight without overturning the car advantage. AT defeats this tank force in every case. Mirrored differences show formation and tactical timing still matter; these are not universal win-rate estimates.

## Air and AA openings: 36 legal comparisons

Every opening starts from the untouched standard 6,000-credit HQ/one-rig state, including the five-second countdown. Construction, the supply center's included hauler, real loading/delivery income, a purchased second hauler when specified, builder travel, prerequisites, power, queued payments and training all run normally. Both players build concurrently. There are no fixture grants or prepared units/buildings.

Air scripts build power → supply → barracks → radar → faction air facility. Three variants use the included hauler alone, buy a second hauler, or buy a second hauler plus faction recon. The one rig builds sequentially at deterministic legal candidate positions. Each variant is independently compared with all three AA responses.

These are **observed legal timings, not proof of globally earliest possible air**. The tests do not search all builder counts, placements, build orders or tactical options. Time includes the five-second countdown.

| Aircraft | One hauler, no scout | Two haulers, no scout | Two haulers + scout | Fastest tested spend / income / cash |
|---|---:|---:|---:|---:|
| US Strike | 209.05 s | 234.10 s | 218.20 s | 8,300 / 4,800 / 2,500 |
| IR Strike | 181.15 s | 181.15 s | 181.15 s | 6,550 / 3,600 / 3,050 |
| SY Scout drone | 172.50 s | 172.50 s | 172.50 s | 5,800 / 3,600 / 3,800 |
| SA Strike | 217.05 s | 219.05 s | 221.90 s | 8,050 / 4,800 / 2,750 |

For tied fastest times, the table shows the cheapest tested variant. SY's scout drone is unarmed; its timing represents information capability. The US scout/two-hauler opening spends exactly the design's 9,550 credits: 6,000 starting credits plus 4,200 earned leave 650 at aircraft completion.

Milestones record completion positions, credit/income/spending totals, builder travel, foundation funding waits, production queue cash waits and low-power ticks. Every completed aircraft also receives a real move order toward the defender; evidence includes departure distance and first ordinary visual contact with AA.

| AA response | Actual prerequisites and queue | Ready | Spend | Income | Cash |
|---|---|---:|---:|---:|---:|
| SY portable AA | Power → barracks → portable AA | 49.95 s | 1,450 | 0 | 4,550 |
| IR static AA | Power → barracks → AA post | 65.65 s | 1,900 | 0 | 4,100 |
| IR mobile AA | Power → supply → barracks → factory → AA; second hauler | 162.45 s | 6,500 | 2,400 | 1,900 |

All three tested responses are ready before every tested air opening. Urgent static/portable branches legally skip supply because the real rules do not require it for barracks/AA. Mobile AA includes its economy and factory prerequisites.

Buying a second hauler is not monotonically faster in these scripts. The US two-hauler/no-scout variant finishes later than the one-hauler and scout variants. Records expose actual funding, construction positions and travel but do not isolate the cause. A controlled throughput/traffic investigation remains necessary before attributing this to a gameplay defect or changing economy balance.

## Aircraft sortie value: 18 measured flights

One US Strike is trained normally from prepared, paid, powered and placement-validated infrastructure. A paid ground recon unit supplies ordinary sight of an enemy power-plant target. The defender has a paid outpost and one, two or three powered AA posts. Every configured AA source must actually damage the aircraft. Included haulers are parked, no income occurs and paid repair comes from the explicit 2,000-credit service reserve.

Routes place the target 16, 32 or 52 cells horizontally from the airfield. Actual launch coordinates and distances are recorded. AA formation stays identical relative to the target. Policies either expend both ammunition charges and use normal automatic return, or issue Return on the command tick after the first shot. Surviving cases wait for `aircraft_serviced` and assert ammunition/endurance restoration and paid repair. Each result contains one-second flight samples and exact AA weapon-fire tick/source traces.

| Route | AA posts | Policy | Target HP damage | Minimum aircraft HP | Repair credits | Launch-to-service | Loss value |
|---|---:|---|---:|---:|---:|---:|---:|
| Short | 1 | Both shots | 400 | 490 | 21 | 27.15 s | 0 |
| Short | 1 | First-shot recall | 200 | 630 | 7 | 22.95 s | 0 |
| Short | 2 | Both shots | 400 | 280 | 42 | 27.15 s | 0 |
| Short | 2 | First-shot recall | 200 | 560 | 14 | 22.95 s | 0 |
| Short | 3 | Both shots | 400 | 70 | 63 | 27.15 s | 0 |
| Short | 3 | First-shot recall | 200 | 490 | 21 | 22.95 s | 0 |
| Medium | 1 | Both shots | 400 | 420 | 28 | 32.70 s | 0 |
| Medium | 1 | First-shot recall | 200 | 630 | 7 | 27.45 s | 0 |
| Medium | 2 | Both shots | 400 | 140 | 56 | 32.70 s | 0 |
| Medium | 2 | First-shot recall | 200 | 560 | 14 | 27.45 s | 0 |
| Medium | 3 | Both shots | 400 | 0 | 0 | Lost | 1,800 |
| Medium | 3 | First-shot recall | 200 | 490 | 21 | 27.45 s | 0 |
| Long | 1 | Both shots | 400 | 490 | 21 | 37.45 s | 0 |
| Long | 1 | First-shot recall | 200 | 630 | 7 | 33.25 s | 0 |
| Long | 2 | Both shots | 400 | 280 | 42 | 37.45 s | 0 |
| Long | 2 | First-shot recall | 200 | 560 | 14 | 33.25 s | 0 |
| Long | 3 | Both shots | 400 | 70 | 63 | 37.45 s | 0 |
| Long | 3 | First-shot recall | 200 | 490 | 21 | 33.25 s | 0 |

The medium three-AA full-ammunition sortie deals 400 HP but loses the 1,800-credit aircraft. First-shot recall deals 200 HP, survives at a minimum 490/700 HP and pays 21 credits repair. Other three-AA full-ammunition routes survive with 70 HP. These nonmonotonic results come from actual flight/fire timing: the medium route receives more AA shots than the short/long routes. Distance alone is not an exposure measure.

This covers one aircraft, static AA, one target class and one outbound heading. It does not cover escorts, mobile-AA repositioning, service denial, low power, upgrades, repeated sorties, maximum endurance, other factions' strike packages or shipping-map geometry. Individual mechanic tests do not substitute for an expanded measured matrix.

## Remaining acceptance work

- Bound or prove optimal opening searches across legal placements, additional builders, queues and competing economies before calling a timing globally earliest.
- Add mixed ground compositions, more faction pairs and tactical policies while preserving surplus cash and actual losses.
- Extend sortie matrices to other factions/roles, mobile AA, multiple service sites, low power, repeat missions and endurance-risk routes.
- Isolate the recorded second-hauler/opening differences before proposing economy or navigation changes.
- Complete the remaining §25.5 scenarios in the assigned AI, mission, support, multiplayer and performance lanes.

No gameplay rules, product UI, art, shipping map layout or mission narrative was changed by this lane.
