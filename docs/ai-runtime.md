# Skirmish AI runtime

The ordinary AI runs inside the shared Go simulation. It plans every four
seconds on Easy, two seconds on Normal, and one second on Hard. Combat and
movement continue at the same 20 ticks per second for all players. These
strategies create ordinary commands; they never spawn units, grant income,
change damage, skip construction, or award an artificial victory.

This document records the implemented behavior and its test coverage. It is
not shipped-map acceptance or evidence of faction balance.

## Information and execution boundaries

- The current `PlayerView` identifies owned actors and visible opponents.
  Internal actor state is inspected only for actors in that owned view.
  References to an old repair or escort target must still resolve in the
  current owned view before the AI reads its state.
- `AIKnowledge` remembers observed enemy identity, type, position and timestamp.
  Mobile observations expire after 60 seconds; structure observations after
  300 seconds. Seeing an empty last-known position removes the stale record.
  Threat and anti-air estimates use bounded ages within that record.
  Public defeat removes that owner's observations immediately. Current visible
  and remembered inactive wrecks cannot become defensive, composition, capture,
  launcher or designation targets. Previously observed hostile intentions are
  released through ordinary grouped Stop commands before those records expire.
- `AIFields` holds only previously observed field amounts. Hidden extraction
  does not update this estimate; a new observation does.
- Construction planning uses ordinary Go geometry against a collision set
  reconstructed from the authorized view and known fields. A concealed enemy
  cannot change the selected location. Actual construction can still reject
  hidden occupancy when the submitted command executes.
- The AI chooses at most one intention per actor and at most 32 orders per
  planning cycle. `Submit` and normal execution still validate ownership,
  visibility, targets, prerequisites, costs, Supply, service slots, channels,
  cooldowns and routes. Advisory planning does not reserve authoritative funds
  or capacity.
- Knowledge, decision timestamps and strategy state use existing saved player
  state. This extension introduces no alternate simulation or save schema.

## Economy, production and recovery

The AI reconstructs missing headquarters, power, supply, barracks, factories,
radar, air production and technology. It can resume an already paid foundation
after its builder disappears and use the ordinary emergency rig order after
headquarters loss.

Power planning has no six-plant ceiling. It counts unfinished power capacity
and demand, and adds capacity when the forecast margin falls below 35.
Production recovery also reacts to a deficit of service capacity.

The planning budget subtracts unpaid queued jobs and proposed construction.
When a useful, visible construction site exists, the AI saves toward its cost
instead of spending every arriving shipment on more infantry. It forecasts
queued Supply and service demand across producers before proposing purchases.
Only normal job start actually pays or reserves anything. Repairs retain a
300-credit reserve.

Expansion starts when a nearby observed field falls below 6,000 credits. The
AI chooses a known, uncovered field away from recently observed enemies. Once
all known local fields are depleted, a smaller remnant is eligible only if its
known remaining resources cover the supply depot and any required outpost.
Existing ordinary hauler behavior can long-haul smaller remnants. Additional
hauler purchases target at most six, preserving room under the eight-hauler
limit for the paid haulers included with new depots. Known queued haulers also
count before an expansion is proposed.

Research is purchased from idle, active, appropriate producers with the real
tier and faction requirements. It avoids duplicate completed/queued research,
keeps a 1,000-credit planning float, and prioritizes upgrades useful to the
owned force:

| Research | Trigger |
|---|---|
| Weapons training | At least four armed units |
| Vehicle armor | At least three light/heavy vehicles |
| US countermeasures and service crews | At least two aircraft |
| Iranian drone servicing | At least two aircraft |
| Iranian launcher crews | An owned launcher |
| Syrian prepared exits | Two owned safehouses |
| Syrian field restoration | An owned repair vehicle |
| Saudi service crews | An owned repair vehicle |
| Saudi interception | An owned fixed or mobile interception unit |

Easy uses the generic research only. Normal and Hard use the relevant faction
research as well. Research still takes the ordinary time and money.

## Tactical and faction decisions

The existing observed-target goals, scouting, repair/capture engineering,
salvage, deployment, faction abilities and strategic operations remain in the
same command path. The following Normal/Hard behavior extends that path:

- Ground units below 35% health seek a compatible owned repair source away
  from a recent known threat. Repaired combat vehicles leave a fixed repair
  depot at 85% health. Ordinary healing costs and repair reserves still apply.
- Infantry can guard visible passable cover within three tiles when it stays
  close enough to the observed objective to engage. A positional guard resumes
  advancing when its local known threat has passed.
- Damaged aircraft return for service. Nonfighter aircraft also retreat from
  observed anti-air range. An injured Iranian drone can use paid Drone Recall
  when its headquarters, tier, energy and cooldown permit; otherwise it uses
  ordinary Return. Only one recall is proposed per cycle.
- Idle fighters escort moving owned nonfighter aircraft outside known anti-air
  danger, and return when their leader lands. Idle rifle/AA units can escort a
  nearby moving medic or repair vehicle once the force has 24 Supply. Existing
  escorts prevent repeatedly assigning another guard to the same support unit.
- Idle healthy APCs can collect nearby permanent combat infantry for a distant
  objective, then unload short of the last observed objective. Boarding,
  movement, exit clearance and unload time all remain ordinary mechanics.
  A partly loaded APC waits for its second squad. An own blocked-route report
  or a squad more than six tiles away releases that boarding order so delivery
  can continue.
- Syrian safehouses can board permanent infantry and transfer toward a closer
  owned safehouse away from a known threat. The ordinary transfer channel,
  combat quiet period, exit validation and transit exclusivity still apply.
  A loaded source without a useful link unloads its occupants normally.

All difficulties revisit passable scouting grid points currently under fog
after the grid has been explored. The rotation uses the saved `AIScout` cursor;
it reads no hidden enemy data and does not provide extra sight. The public
endgame structure pulse can set a movement goal toward an active opponent,
while an observed immediate threat still takes defensive priority. These
position-only pulses never create a target identity or firing vision.

## Verification

`pkg/sim/ai_layers_strategy_test.go` covers ordinary paid research and later
faction research, seventh-plant power recovery, viable depleted-field
expansion and the hauler cap, healing/cover decisions, fighter escort release,
paid Drone Recall and its fallback, real APC boarding/travel/unloading, partial
boarding recovery, real safehouse transfer, and concealed occupancy/economy
noninterference. Existing tests cover stale observations and their restore,
hidden enemy changes, unsafe expansion and abandoned foundation recovery.

Run focused race checks:

```sh
go test -race ./pkg/sim -run 'TestAIHidden|TestAIKnowledge|TestAIExpansion|TestAIResumes|TestAIPaid|TestAIBuildsBeyond|TestAIDepleted|TestAIRetreat|TestAIFighter|TestAIDroneRecovery|TestAIAPC|TestAISyrian|TestAITransport|TestAIConcealed|TestAIAdvanced' -count=1 -v
```

Run economy and complete synthetic matches:

```sh
go test ./pkg/sim -run 'TestAIUsesBaseEconomy|TestAICompleteStandardMatches' -count=1 -v
```

The complete-match test runs all six cross-faction pairings and four mirrors on
one synthetic map/seed, with a 90-minute simulation safety limit. It requires
ordinary elimination and checks nonnegative credits and the normal Supply cap.
The latest captured output is
`work/evidence/ai-expanded-strategy-matches-final.log`. An earlier failed
iteration is preserved in `work/evidence/ai-expanded-strategy-matches.log`:
the US mirror exposed production spending that starved construction. Reserving
the planned construction budget corrected that regression.

Observed on 2026-09-27: the final 15 focused race scenarios passed in 4.574
seconds; economy plus all ten complete synthetic matches passed in 30.619
seconds; `go vet ./pkg/sim` passed. The full short simulation race suite passed
in 32.940 seconds immediately before the final Drone Recall priority correction;
the focused race and complete-match runs include that correction. Focused race
output is preserved in `work/evidence/ai-expanded-strategy-race.log`.

The subsequent three/four-player endgame regression, final combined mechanics
verification, and before/after evidence are recorded in
[AI endgame verification](ai-endgame-verification.md).

## Remaining acceptance and strategy limits

These scenarios do not establish every authored map, faction spawn, choke,
bridge destruction, moving objective or mission difficulty. Prolonged global
resource exhaustion and shipment-only recovery need broader map coverage.
Ten deterministic synthetic games are a regression sample, not independent
human playtests, skill-adjusted win rates or a balance conclusion.

The AI uses conservative local cover and transport decisions, rather than a
route-scored logistics planner. Automatic transport currently uses ground APCs
and Syrian safehouses; it does not plan airlift pickup/delivery missions.
Safehouse transfer legality can reject a reasonable intention when fighting or
exit occupancy changes. There is no hidden map scan or forced transfer to
work around those failures. Broader composition tuning, formation behavior and
human tactical evaluation remain part of full-game acceptance.
