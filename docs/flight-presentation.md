# Aircraft and launcher presentation

The renderer now follows authorized Go flight transitions without delaying
orders or changing simulation state. Stable initial/load snapshots render the
current altitude. Observed takeoff, landing and destruction interpolate only the
sprite's height; grounded wreck presentation loses its airborne depth priority.
Replay rewind and perspective changes clear transitions. Reduced motion selects
the settled altitude and stable state immediately.

Pose selection uses public landing, service, health and heading changes. Exact
empty magazines, launcher charge counts and orbit orders use owner-private
fields only. Armed aircraft may show `empty`; unarmed transports and scout
drones cannot. Repair deployment and salvage use their corresponding authored
work states. The existing independent hull/turret ground shadows are preserved.

## Verification

Four focused tests cover initial/reset/interrupted flight, landing, crash,
reduced motion, drone aliases, ammunition and launcher privacy, unarmed aircraft
and work-state routing. Both TypeScript checks and all 195 then-current runtime
tests pass.

The real browser renderer fixture uses public practice orders to spawn an IR
hub and aircraft, then ordinary Return and Move orders. Go reports landing and
service at tick 170, completed service at tick 650 and departure at tick 652.
The renderer settles from 35 pixels to ground and back. Public practice removal
at tick 654 selects the crash pose and settles at ground height. The Go hash
remains exactly unchanged while this presentation runs. This removal is not a
combat kill or aircraft balance proof.

The same browser run passes visible selection, actual tank destruction and
rubble, rewind, deployment/packing, production/power/selling, feedback
accessibility, context loss and save restoration, independent turret shadows,
and disposal across five scenes. No browser errors occur; screenshot readback
produces the recorded software-driver performance warnings. Evidence is in
[renderer results](../work/evidence/render/browser-results.json) and
`work/flight-renderer-browser.log`.

## Remaining art integration

The preserved legacy IR strike sample lacks parked, rearm, launch and recover
plates: the browser check explicitly records its fly-pose fallback during
service. New eleven-aircraft source states have not yet completed sprite
production. Their pose and altitude registration still need browser review
once packed. Carrier boarding context, airlift low hover, and a distinct IR
volley cue remain open. This checkpoint does not certify complete aircraft art.
