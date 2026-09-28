# Actor status presentation

The status descriptor reads the authorized entity and current Go snapshot.
Badges use disclosed active effects and their actual expiry ticks; cooldowns
never imply an active effect. Emergency takeoff retains an untimed state marker
on older runtimes that omit its private deadline. Magazine/charge values, ambush,
Return, service-home and low-power information are owner-only, even if malformed
foreign private fields are supplied. Enemy economy is never reconstructed.

The renderer adds steady, compact insignia above the healthbar's real sprite
anchor, including aircraft altitude. Selected actors show named labels and exact
rounded-up seconds, ammunition counts/pips and Go channel progress. Unselected
actors use up to four symbols; selected stacks show the three highest-priority
badges plus the number of additional effects. Selections larger than four use
compact symbols on the battlefield. This cap controls world clutter; it is not
a complete detailed inspector for arbitrarily many simultaneous buffs.
Label size stays constant through camera zoom. Reduced motion/flashing use the
same steady information. Statuses clear on actor destruction/removal/replacement.

The base0.3.3 wire supports state, channels and private ammunition. Public active
effect and owner emergency countdown fields are in the isolated tactical Go
candidate and require its generated protocol binding to decode. No frontend
timer or hidden-status approximation fills the gap before promotion.

Both TypeScript checks pass; the combined runtime suite currently passes270
tests, including seven status privacy/expiry/cancellation/catalog tests. An
initial test accidentally JSON-serialized protobuf BigInt and used an incomplete
Vec fixture; those test fixtures were corrected. The implementation did not
change to accommodate them.

The dedicated headed Chromium course passes actual Go Relay Boost/Drone Recall,
service-home destruction/emergency takeoff/save/restore/expiry, foreign privacy,
Hull Down/Emergency Power/Disperse, eleven-actor compact selection, ordinary APC
boarding progress, fighter ammunition, pause, camera zoom/culling, reduced motion
and flashing, and zero remaining canvases/pages after disposal. Native1600/1280
captures were inspected. The initial capture exposed the aircraft's emergency
label behind its collapsed home: statuses now use a separate authorized overlay
above world bodies. A cull/return check protects visibility-cache restoration.
The original failed zoom assertion counted blank unrendered nodes; diagnostics
now count only visible labels. The failed run remains preserved.

The existing fourteen renderer regression groups also pass, including graphics
context recovery, five-scene disposal and terrain/flight/shadow behavior. Four
headless GPU ReadPixels warnings accompany screenshot readback; there are no
application errors. These are presentation fixtures with recorded practice
setup, not ordinary economy or balance wins. The runtime/protocol are isolated;
shipping0.3.3 remains unchanged. See [the exact evidence](../work/evidence/actor-status/acceptance.md).
This does not certify the132-effect manifest or complete presentation.
