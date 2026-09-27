# Mission content inventory

There are five tutorial records, four six-mission campaigns, and two co-op
records. All are original fictional scenarios. Every record includes briefing,
debrief, explicit failure, optional objective, three difficulty budgets, and a
mid-mission checkpoint trigger; the engine supplies the opening checkpoint.
Reachability and full completion remain the playthrough acceptance gate.

## Authored missions

| Mode / faction | Mission ID | Required objective | Optional objective | Mid-mission checkpoint |
|---|---|---|---|---|
| tutorial / US | `tutorial-1-give-an-order` | Move the marked infantry into the training area.; Destroy the hostile training target.; Produce a new rifle squad, then move the original group into the second marker. | Preserve all four original rifle squads. | first-order |
| tutorial / US | `tutorial-2-operate-a-base` | Deliver cargo, build a power station and produce a squad.; Replace the original HQ after its loss, using an emergency rig produced by the factory.; Spend credits repairing actual battle damage. | Keep both original haulers alive. | base-cycle |
| tutorial / US | `tutorial-3-read-the-counter` | Move two original rifle squads into the marked cover.; Defeat the anti-armor infantry and the tank.; Find and defeat the covered scout.; Bring both marked transport squads to the forward marker outside a carrier. | Preserve the training APC. | cover-lesson |
| tutorial / US | `tutorial-4-defend-the-sky` | Complete service on the marked strike aircraft.; Destroy the hostile aircraft.; Intercept one tactical missile.; Move the marked rifle group to the danger marker, then return after the warning.; Move the marked rifle group to the exercise warning marker. | Keep both original aircraft alive. | service-cycle |
| tutorial / US | `tutorial-5-command-a-match` | Neutralize opposing command and production.; Practice the chosen faction’s command ability. | Keep the original HQ alive. | ability-used |
| campaign / US | `us-01-first-foothold` | Build a supply center and deliver two cargo loads.; Reconnect both isolated Ranger teams. | Recover the intact engineering rig and keep it alive. | first-contact |
| campaign / US | `us-02-open-corridor` | Escort at least one convoy truck through either marked branch.; Deliver at least one convoy truck to the exit depot. | Preserve all three original convoy trucks. | valley-entry |
| campaign / US | `us-03-relay-ridge` | Capture both marked military radars.; Hold either captured radar continuously for four minutes. | Finish without losing a scout. | two-relays |
| campaign / US | `us-04-broken-umbrella` | Keep at least one airfield operational through twelve minutes. | Evacuate both marked aircraft to the backup site, service each and repair battle damage on the wing. | six-minute-line |
| campaign / US | `us-05-split-front` | Destroy or capture all three command relays in any order. | Finish without losing any airlift transport. | first-front |
| campaign / US | `us-06-clear-horizon` | Neutralize both production bases while holding both supply-corridor sections. | Neutralize the strategic site before any launch from it. | forward-base |
| campaign / IR | `ir-01-forward-signal` | Establish supply and observe the first ridge for twenty seconds. | Keep the original recon team alive. | observation-contact |
| campaign / IR | `ir-02-eyes-above` | Escort both marked launch vehicles to the exit depot. | Keep and fully service both starting drones. | launchers-midway |
| campaign / IR | `ir-03-beyond-the-basin` | Control both marked expansion fields before the starting field empties. | Own both military supply stations at victory. | first-expansion |
| campaign / IR | `ir-04-hold-the-network` | Keep any two of the three network sites operational continuously for twelve minutes. | Finish without losing a drone or losing its service capacity. | network-half |
| campaign / IR | `ir-05-the-second-volley` | Destroy or capture all three marked military outposts. | Spend at most 1,200 credits on missiles. | first-outpost |
| campaign / IR | `ir-06-iron-signal` | Neutralize the command base after breaking two outer defense positions. | Keep both original observers alive at the two forward observation sites. | outer-line |
| campaign / SY | `sy-01-workshop-foothold` | Recover the intact engineering rig.; Establish HQ, supply, barracks and a vehicle workshop, then deliver cargo. | Recover both separated mechanic teams and keep them alive. | rig-contact |
| campaign / SY | `sy-02-supply-trail` | Escort a truck through either branch.; Deliver a marked truck to the exit depot. | Collect at least 300 credits of salvage, from hostile vehicle wrecks. | trail-branch |
| campaign / SY | `sy-03-three-crossings` | Hold any two approaches continuously for three minutes. | Optional: keep the marked scout concealed for one uninterrupted minute. | approach-held |
| campaign / SY | `sy-04-open-doors` | Keep both safehouses and the factory operational through ten minutes. | Evacuate both marked squads to the rear safe region. | evacuation-contact |
| campaign / SY | `sy-05-relay-break` | Capture all three communication buildings. | Capture the marked factory and preserve it under your control. | first-communications |
| campaign / SY | `sy-06-open-road` | Neutralize both blocking production bases. | Finish without a canceled or blocked temporary-raid deployment. | forward-road |
| campaign / SA | `sa-01-arrival-point` | Establish supply, deliver cargo and hold the assembly area for thirty seconds. | Keep both original APCs alive. | assembly-contact |
| campaign / SA | `sa-02-moving-shield` | Escort the convoy through the first contested sector.; Escort it through the second contested sector.; Deliver a marked truck to the exit depot. | Spend no more than 700 credits on repairs. | first-sector |
| campaign / SA | `sa-03-distant-depots` | Control both marked supply positions and operate two supply centers. | Hold both military stations simultaneously at victory. | first-depot |
| campaign / SA | `sa-04-intercept-window` | Keep both outposts and the fixed battery operational through ten minutes. | Intercept a missile from the marked detachment without losing an original defended building. | window-half |
| campaign / SA | `sa-05-three-positions` | Capture all three marked relays. | Keep the original Service vehicle alive. | first-position |
| campaign / SA | `sa-06-shieldline` | Neutralize the command complex and forward production base. | Keep both permanent supply corridors controlled and maintain two supply centers. | forward-shield |
| coop / US | `convoy-union` | Deliver convoy 1 to the exit.; Deliver convoy 2 to the exit.; Deliver convoy 3 to the exit. | Preserve all six original convoy trucks. | first-arrival, second-arrival |
| coop / US | `twin-outposts` | Control the contested central connection for thirty seconds.; Neutralize both hostile production bases after reconnecting. | Keep both original HQs alive. | river-reconnected, final-assault |

## Scenario rules and presentation

Human credits and authored starting assets are explicit in each mission file.
Default enemy credit budgets are multiplied by 0.7 / 1 / 1.4 on easy / normal /
hard. Wave entry timing is multiplied by 1.3 / 1 / 0.8; normal columns add a car
to three rifle squads, and hard columns also add a tank. Finite exceptions are
listed in each presentation transcript and announced before their approach.
Normal AI production spends real resources and shares the same caps and rules.

Recovery transfers existing allied ground actors through Go `recover_tag`; it
does not spawn duplicates. Convoy Union uses three sequential script-owned
two-truck convoys, alternate region routes and shared Advance/Hold approvals.
The first arrival unlocks one separately owned repair depot per commander;
repair remains paid. Twin Outposts keeps both human economies and ownership
separate, with two hostile production bases and two approach checkpoints.

Preservation and budget optional objectives are evaluated at victory using
`at_end`. A marked SY scout’s uninterrupted concealment exercise is an optional
achievement that may complete earlier. Campaign four-minute/twelve-minute
holds use simulation ticks, so changing solo speed does not change their
simulation duration. Mission outcomes retain the simulation ruleset and exact
selected mission definition in saves and replays.

Tutorial five contains explicit US, IR, SY and SA `tutorial_variants`, each
with its own complete human starting list, objective/trigger set and ability
instructions. Go chooses and validates the requested variant. The mission ID
and story slot remain stable; no frontend role substitution is used.

Tutorial one’s select/stop/control-group/rally/rejected-order steps and tutorial
three’s boarding lesson are authored in `presentation.tutorial_steps`. Current
world predicates prove arrival/combat/production, not those local inputs. The
presentation controller must combine input evidence with world conditions
before claiming every lesson action is verified.

All 31 presentation files include caption/transcript text. Briefing/loading
art and voice/music keys are declared dependencies of the separate art/audio
assignment, not evidence those media were delivered. Marker records identify
military objectives; no civilian targets or copied franchise narrative is used.

## Validation and remaining review

See `content-validation-evidence.md` for the native checks, measured economy
spread and unresolved gates; `content-authoring.md` documents source ownership
and exact rebuild commands. A passing release inventory is not a full mission
playthrough, finished visual presentation, or ranked map certification.
