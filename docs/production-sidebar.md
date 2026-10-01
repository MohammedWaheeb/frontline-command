# Production while commanding troops

The production sidebar keeps its own chosen engineering rig or facility while
the selection tray continues to show the controlled troops. Category tabs can
choose a compatible owned source; the facility list distinguishes multiple
buildings of the same type. Its adjacent button explicitly selects and centers
that source. Selecting one production facility in the world follows it in the
sidebar. Mixed selection and Select All preserve the previous facility.

Training, research and queue cancellation use that exact facility without
replacing the combat selection. Starting construction selects its actual rig
before placement, preserving selection-bound targeting. Removed, dead, carried
or captured sources leave the list. Incomplete and offline sources stay visible
so the Go advice can explain their disabled options.

Catalog categories help navigate only. Every production button still comes from
Go command affordances and production status; final orders use normal Go preview
and execution. Extra facility advice never adds Sell, Rally or Train to army
commands. Requests stay within the existing 64-entity bound, including a separate
sequential request when the selected group fills that bound. Online command and
refresh requests retain their shared cancellation/rate budget.

## Evidence

The isolated 04:35 UTC 28 September US04 product journey passes real paid infantry
training, cancellation, preserved aircraft selection, choice of the second
airfield, construction targeting using the real rig, quick-save and command
access at 1280×720 / 150%. Screenshots at both native sizes were inspected.
The first attempt's case-sensitive assertion against CSS-uppercase text failed;
the actual selection was intact. The corrected test reads the selection heading
text rather than its visual text transform.

Evidence is under `work/evidence/production-sidebar/source/work/evidence/production-sidebar/`.
The isolated source tree records exact overlay hashes, uses the frozen 0.3.1 Go
engine before later bot recovery, and uses the accepted raised-terrain renderer
before the environment-prop slice. Art remains incomplete.

All six extended one-to-four-player configurations pass on that frozen0.3.1
source (one human, one+bot, two humans, two+two bots, three-player FFA and four
humans in teams). Real queue/cancel commands preserve troop selection, followed
by reconnect, surrender results and rematch. First-run Select All accidentally
changed the production source to HQ; the fix follows only deliberate single
facility selection and preserves prior focus for mixed groups. Failure retained.
The completed run is `2026-09-28T04-40-06.582Z` under that source's rendered
multiplayer evidence directory. Independent loopback profiles do not establish
physical multi-device LAN readiness or normal combat victories.

A second frozen source at `work/evidence/production-inspection/source/` uses
simulation0.3.3, current environment renderer/loader code and shipping art cloned
after the first three new US buildings completed. Its05:01 actual product journey
passes paid production/cancellation, preserved army selection, real rig targeting,
quick-save, enlarged controls and archived replay inspection. A real paid infantry
queue remains visible but disabled in replay; seeking to its end exposes it,
rewinding removes it, and inspection emits no orders. Queue hotkey cancellation
uses the displayed facility in live games. Observer/replay/finished inspection
never enables commands. Exact source hashes accompany the capture.

Native review found the old floating replay dock covered objective controls.
Replay transport now occupies the inactive bottom command well; its order-log
modal remains outside that tray. The05:05 follow-up passes at1280×720 in100% and150% scale. All timeline,
perspective, speed, playback and log controls fit inside the command well;
objectives remain unobstructed, the modal stays inside the viewport and rewind
removes future queue state. Both native screenshots were inspected. The exact
run is `2026-09-28T05-05-57.079Z` in that source's production-sidebar evidence.
No final release follows from this bounded UI change.
