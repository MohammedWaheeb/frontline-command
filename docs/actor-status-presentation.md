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
badges plus the number of additional effects. This cap controls world clutter;
it is not a complete detailed inspector for arbitrarily many simultaneous buffs.
Label size stays constant through camera zoom. Reduced motion/flashing use the
same steady information. Statuses clear on actor destruction/removal/replacement.

The base0.3.3 wire supports state, channels and private ammunition. Public active
effect and owner emergency countdown fields are in the isolated tactical Go
candidate and require its generated protocol binding to decode. No frontend
timer or hidden-status approximation fills the gap before promotion.

Both TypeScript checks pass; the combined runtime suite currently passes268
tests, including seven status privacy/expiry/cancellation/catalog tests. An
initial test accidentally JSON-serialized protobuf BigInt and used an incomplete
Vec fixture; those test fixtures were corrected. The implementation did not
change to accommodate them.

Einstein's actual Skybreaker product capture includes the actor-hook integration
and reports zero errors, but its selected strategic site does not exercise the
full status repertoire. Dedicated native-size status captures, foreign/own
perspectives, actual channel/ability playback, dense selection and disposal
verification remain pending. Do not count this checkpoint as complete status
visual acceptance or the132-effect manifest's completion.
