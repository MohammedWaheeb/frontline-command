# Remaining authored optional routes

This supplemental acceptance lane attempts the seven routes that had not earned
an award in the original authored-path matrix. It never changes mission
predicates, maps, starting assets or balance values to obtain a pass. All routes
use actual public commands, paid production/repair, authorized vision, ordinary
combat and the real terminal optional-objective result. Passing records also
compare a midpoint save branch, full replay without checkpoints, fresh restart,
and the existing explicit surrender failure/replay path.

This is incomplete route evidence, not campaign or balance sign-off.

| Route | Easy | Normal | Hard | Source/evidence |
|---|---|---|---|---|
| IR05 missile-budget | Pass | Pass | Pass | Preserved 0.3.0, `optional-0.3.0/first-three` |
| SA03 stations-together | Pass | Pass | Pass | Preserved 0.3.0, `optional-0.3.0/first-three` |
| SY02 limited-salvage | Pass | Pass | Pass | Preserved 0.3.0, `optional-0.3.0/first-three` |
| US04 wing-evacuated | Pass | Pass | Pass | 0.3.1, `optional-0.3.1/pilot-03` and `pilot-04` |
| SY01 mechanic-teams | Pending | Pass | Pending | Normal 0.3.1, `optional-0.3.1/pilot-04` |
| IR06 observer-network | Pass | Pass | Pending | Current 0.3.3, `optional-0.3.3/pilot-01`; hard pilots remain incomplete |
| SY05 factory-captured | Pending | Pending | Pending | Captured factory during latest pilot, but later mission failure; no award claimed |

All paths above are relative to `work/evidence/mission-playthroughs/`.
The successful 0.3.0 overlay remains immutable. They have not been relabeled as current evidence. Rows explicitly identify
their simulation version; only IR06 Easy/Normal currently have successful
0.3.3 optional-route records. A fresh final-source run remains required for
the older passing strategies.

## Earned route strategies

- IR05 packs and preserves the marked original launchers, then uses a paid
  conventional assault on the three military outposts. Hard adds a paid home
  turret and prioritizes those objectives rather than an early enemy-HQ detour.
- SA03 captures both actual neutral stations with engineers before constructing
  the final required supply center; paid mixed forces protect the regions.
- SY02 fights the actual hostile vehicles and collects visible dropped salvage
  with surviving engineers/repair teams. The driver waits for at least 300 real
  credits of progress before advancing the convoy to the exit. The award itself
  is checked only after the mission's `at_end` predicate evaluates.
- US04 flies ordinary sorties until actual hostile damage occurs, issues
  targeted Return to the owned backup airfield, completes service and paid
  repair there, and protects both original jets with a paid ground screen until
  the real twelve-minute ending. Both original airfields remain available; no
  healthy-home sale is required. Normal ends at tick14500, midpoint8214,
  hash `d7a02b213d8d1a0a2dcb7027f6a2a683687fd3e62c5ee63daeeac4b6cf08329d`.
  Hard also ends at tick14500, midpoint8730,
  hash `d52aabc1ded2105d436c7eb6320c07456522c05b24a2acad0434ddef5bf0d74c`.
- SY01 normal recovers all four original mechanics, withdraws them through
  queued rear waypoints, then builds the paid workshop economy. It ends at
  tick6439, midpoint444,
  hash `e6ea80d05f637d7dd032f83a91a9b9a7aa25a27a7f7c9b690c6e7843283e5d65`.

## Preserved failures and genuine defects

The original SY01 withdrawal uncovered the queued-waypoint engine defect
specified in [Queued command completion](queued-command-completion.md). The
0.3.0 failure remains preserved; fixing the general queue behavior made the
normal route earn its real preservation award. Easy still lost an original
mechanic, and hard later lost its base or recovery economy under the attempted
tactics. Adding a repairing starting engineer did not solve those routes and
is not reported as a passing strategy.

The first US04 rebase pilot successfully landed and serviced both jets, then
lost one on its pad to a hostile approach. Concentrating an ordinary ground
screen ahead of the backup site solved that tactical failure on all three
difficulties. This was distinct from the missing manual rebase product control,
which was implemented and tested as a general 0.3.1 command.

IR06's normal ground withdrawal/advance pilot lost the eastern original
observer despite completing the main mission. The current protected transport
route pays for two APCs, boards the originals, obtains ordinary vision and
clears the approach before unloading at each authored post. A tank and rifle
escort remain with each original while the main force finishes the assault.
Easy earns the real award at tick8326 (midpoint1504, 99 receipts), hash
`3fc1145ed7c0b6b047f9152c9e287e3f84be1f086c2f5413e40143ba33e54a47`;
Normal at tick10684 (midpoint1504, 124 receipts), hash
`35e0a7e3b8d6f029bbdca985946247cf03244508e4d64f28f2d81d68631320f7`.
Hard still needs a successful defense and preservation route.

Current SY01 pilots preserve the four mechanics in some attempts but lose the
recovery rig or economy, so they do not earn the mission or optional award.
The failed IR06 extra-turret pilot also caught a test-driver mistake: an
`indeterminate` advisory preview does not prove clear placement geometry. The
chosen site overlapped a visible service-building footprint. The driver now
considers visible obstacles when choosing a site, while actual placement
remains validated by the unchanged Go simulation.

SY05's latest normal pilot legally captured the
factory and the first two relays, then failed when a required relay was lost.
No optional award or completed mission is claimed for the failed attempts.
