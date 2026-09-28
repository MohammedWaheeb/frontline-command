# Exact failed SY03 trace placement diagnosis — passed

Run: `runs/20260928T205349Z-sy03-placement-diagnosis/`, completed 20:53:57 UTC.
This is successful **diagnosis of a lost mission**, not a successful mission.
It replays only the 830 original accepted batches and reaches the same tick
11,916, `mission_failed`, and exact canonical hash
`e48e93628a6397aa984cd4403165e568fea21e839a9d8ac604ab32fbac42ab62`.

Only the prior diagnostic API call changes: each Build uses supported ordinary
`PreviewOrders`, rather than unsupported `PreviewCandidates`. All 347 other
files stay unchanged. Source lock:
`bef6cda7dff292c9926f496a35ec0fe89ede84247a4b877014f633190411daf8`.
Binary: `267a93171c35f49ddb80fc814d8d9f73cc1fa21cd3fb5d665d5197cb163eb453`.
Build 2.422 s; diagnostic 5.872 s process, shared host, no timing claim. Source
and binary verify afterward. The original probe failure is preserved separately.

Authorized owner views are exported at ticks 1,839, 2,462 and 4,353. At all
three, supply field 2 is visible at (47,500,78,500), and all five intended
turret sites fail the test driver's conservative resource/occupancy prefilter:
(49,500,80,500), (47,500,80,500), (51,500,80,500), (49,500,82,500),
(49,500,78,500). All fall inside that observed field's 5,000-by-axis exclusion
for a 2×2 turret. Several are also occupied by the player's own troops.
The map terrain at their footprints is ordinary passable ground.

The real Go advice returns `indeterminate` for all 15 intended builds. That
response deliberately withholds collision information; it does **not** certify
the sites or reject them based on a hidden field. Owner-view and advice calls
leave each captured state hash unchanged. No unseen enemy information was
used to choose an alternative.

This identifies why the existing five-position plan could keep saving and
moving the healthy builder without ever submitting another Build. The legal
commander correction belongs to `../runtime-034-territory-alternatives/`:
bounded additional visible intended sites, normal Go validation, and abandonment
of an unstarted discretionary step rather than indefinite production starvation.
