# Native acceptance source snapshot

Captured 2026-09-28T01:48:37.543792+00:00 before the clean capture9 and core57 runs.

The sorted path-and-byte SHA-256 of 115 engine/content files is `e751137fee9ceffb10d9b639b1bfef6a8627c1cf181d9135dc1f1c31efed0f2a`. It includes non-test Go files directly in `pkg/sim` and `pkg/content`, plus map/mission JSON under `content/maps` and `content/missions`. This is an evidence identifier, not a cross-version golden hash.

- `pkg/sim/authored_tutorial_acceptance_test.go`: `538cdf6829249bc126425304e36c16e70bbf55e9fa2299b5334a912e8bafa424`
- `pkg/sim/authored_campaign_acceptance_test.go`: `4fbad79b120afcd26b16084c3edf7d896cc169d7d3c74ce12fdd4ae35d65c2b2`

## Final defense driver record

Captured 2026-09-28T02:17:00.091036+00:00 after the
clean defense12/assault18 runs completed. Since the earlier snapshot, the
campaign driver added the ordinary late SA04 defensive screen described in
`docs/authored-mission-playthroughs.md`; unrelated driver routes were unchanged.
The clean core57 and capture9 binaries were already built before that narrow
defense-route adjustment. These are disjoint within-build acceptance runs, not
one immutable release binary. Concurrent core work can change source after a
test binary is built; this post-run driver record is not a compiled-engine
fingerprint.

- `pkg/sim/authored_tutorial_acceptance_test.go`: `538cdf6829249bc126425304e36c16e70bbf55e9fa2299b5334a912e8bafa424`
- `pkg/sim/authored_campaign_acceptance_test.go`: `3901796cbe85c4a8dc65f7575ea278961a05e182ec23a359ed802e923564c984`
