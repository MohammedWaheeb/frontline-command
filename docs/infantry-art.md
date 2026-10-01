# Infantry roster asset work

Codex is authoring this batch during the user-authorized Claude quota takeover.
The shared projection/material library was authored by Claude Code exact
`claude-opus-5-5`. The original US Ranger remains in `models/infantry.py` and is
not replaced. The new source is
`assets/pipeline/blender/models/infantry_roster.py`, with 24 new specs: five US,
six Iranian, seven Syrian and six Saudi infantry roles. All carry explicit
model authorship and provenance.

## Current status

All eight family pilots have passed numerical and visual review: 742 selected
poses, 1,792 forward/reverse source-pose comparisons, and 80 portrait/cameo
checks. The reviewed source and all 24 specs are frozen in
`work/art/infantry-roster/source-lock.json`. Production is in progress. All five new US roles and all six Iranian roles have complete checked and
visually accepted output; the Syrian and Saudi faction groups follow in the
single-worker queue. The current per-asset count, pose totals, checks and output sizes are in
`work/art/infantry-roster/production-summary.md`. That rolling record separates
checked output from packed-contact/portrait visual acceptance and lists every
unrendered asset. It is the authoritative current production status.
The full assignment requires 5,424 poses and uses one Blender worker at a time.
The pilot summary and acceptance record are in the same evidence directory.

The first US anti-armor sample passed its numerical checks but was rejected
during visual review: the final death pose left the launcher upright as it
inherited the fallen torso's rotation. That complete sample and its review are
preserved under `work/art/infantry-roster/pilot-rejected-ground-drop`. Released
weapons, tools and cases now settle in the ground frame while the character
falls independently. The corrected 81-pose pilot and portrait/cameo passed review. All 200 pose-reset
comparisons and 10 UI-image checks pass; the maximum recorded grip error is
1.67e-8 tiles. The before/after comparison is
`work/art/infantry-roster/ground-drop-comparison-3x.png`.

## Visual contract

One cosmetic member represents a Go infantry actor or squad. Every spec retains
the authoritative 350-millitile radius. Four-member squads use the existing
cosmetic member offsets; engineers and medics have one member. Source geometry
uses the same world scale as the existing Ranger. The initial review canvas is
192×160 at 2× with ground anchor (84,108); it can be enlarged after proof of
clipping without altering world scale. Production uses separate beauty, team
and shadow layers, common union trim, and matched 1×/2× atlases.

| Faction | Geometry distinction |
|---|---|
| US | Modular front/rear plates, low helmet, pouch rows and knee pads |
| Iran | Longer field jacket, round helmet, woven webbing and shoulder bedroll |
| Syrian Rebels | Asymmetric repaired field vest, soft cap, crossbody strap and side bag |
| Saudi Arabia | Broad plate carrier, visor helmet, neck scarf and hydration equipment |

These are original fictional uniforms without real insignia. Role identification
also changes geometry: a large shoulder tube for anti-armor troops; a slimmer,
raised launcher for portable AA; binoculars, map case and antenna radio for
recon; reinforced mission gear for elites; tool apron, repair pack and spanner
for unarmed engineers; pale medical pack, satchel and hand case for unarmed
medics. Rifle and launcher silhouettes have their own muzzle hardpoints.

## State contract

Every new spec copies its required states, heading counts, frame counts, frame
rates, loops, channel flags and concealment notes from the existing manifest.
All models reset joint transforms before posing. The model has actual joint
motion for walking, recoil, cover scanning, observation channels, capture,
repair, medical work and sabotage. Iranian recon lowers a beacon kit during its
channel; other recon raises observation optics. Two-frame cover/concealment use opposing
cosine phases so both samples cannot collapse to the same sine value. Death
settles into a final fallen pose. The healthbar and work hardpoints are exported
for every state; armed roles additionally provide muzzle positions.

Hands use two-segment arm posing around explicit weapon, binocular, tool and
case grip sockets. A bounded reach check runs for each grip. Specialist work
attachments are placed within arm reach rather than below the character's
hands; pilot reports include the resulting grip distances and errors. Fallen
poses release equipment and retain their authored arm positions.

Concealed infantry keeps its complete silhouette in the asset. Visibility and
concealment effects remain controlled by the authorized Go view and renderer.
No pose alters collision, sight, range, actor count or gameplay targeting.

## Pilot acceptance plan

After the completed logistics/cover render, render a bounded set spanning
all factions and specialist silhouettes. Include every heading of the largest
launcher/radio/tool and lowest crouch/fallen poses, not only the cardinal views.
Review at actual game scale and in portraits. Verify silhouette identification,
hand/equipment placement, feet and work gear near the ground, intact shadow
extent, team-mask coverage and frame-to-frame motion. Preserve failures and
before/after evidence, correct demonstrated defects, then run complete required
states through the standard packer and integrity checker.

The authored spec inventory is
`work/art/infantry-roster/spec-inventory.json`. It is an inventory of required
work, not evidence of completed art. There is no full-batch completion claim.

The eight planned pilots are US anti-armor, Iranian recon, Syrian elite,
Syrian portable AA, Saudi rifle, US engineer, Saudi medic and US recon. They
contain 742 selected poses. The additional US recon pilot exercises the
binocular/designation channel, which differs from Iranian beacon placement. Each pilot also compares the geometry and visible parts
of every required pose after forward and reverse traversal of the state list;
this detects transforms left behind by an earlier state. Pilot images and
reports stay under `work/art/infantry-roster/pilot`, outside shipping output.
The pilot portraits use the standard `render_ui_shots.py` functions with an
isolated output root. The wrapper leaves shared source files unchanged and
records the renderer hash; the camera and material logic remain the real
production implementation.

The prepared production driver requires a recorded visual acceptance and a
matching source hash. Production checks use the existing integrity checker,
then verify exact manifest states, role/faction identity, the 350-millitile
radius, cosmetic squad size, retained ground anchor and every exported
hardpoint. The checks also record all-page decoded sizes separately from the
renderer's actual resident memory. The standard UI renderer and alpha-safe
downsampling produce portraits and build cameos at both scales.

## Public-state integration

Go reports both medic healing and paid repair as `repairing`; the public catalog
role distinguishes a medic’s `work_heal` from an engineer’s `work_repair`.
Recon channels report `designate` and `beacon` and use the `channel` sprite state.
Capture and sabotage use their corresponding work states. Exit-blocked states
represent waiting and should not show a successful work channel. These mappings
were sent to the renderer owner; this source lane does not edit renderer logic.

## Production scheduling

The first complete asset must pass packed output, UI-image and runtime metadata
checks and visual review before larger groups run. Subsequent groups are bounded
so building-art pilots can use the same worker between assets. The local driver
can stop cleanly after the current asset when
`work/art/infantry-roster/pause-after-current` exists; it finishes that asset's
render, packing and checks before yielding. It never launches a second Blender.
This stop reports a paused group, not completion of unrendered IDs.

The shared building sources, renderer and material library remain outside this
lane. The original US Ranger is also unchanged by this new infantry source.

The first production wrapper reported an exit error after successfully completing
US anti-armor: its shell source was edited while the running shell was reading
it. All output stages and completion marker were verified independently. The
incident is recorded in `work/art/infantry-roster/first-production-wrapper-exit.md`.
Subsequent groups use immutable driver copies; the pause sentinel remains the
only supported way to interrupt scheduling after a completed asset.
