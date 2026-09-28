# Exact request, uncertain capture tick

The optimized four-human run captured one HTTP 503 `advice_timeout` for
player 3 (SY), with a real 24-order build-barracks request from rig 6.
`request.json` preserves only its already sanitized body. No profile/slot
credentials are present. `context.json` preserves the timing and observation
bracket copied while the match was still running. The failure remains a strict
product acceptance failure.

The request began at 15:58:29.987706 UTC and reached response-start after
2282.119 ms. The surrounding periodic player-3 snapshots were tick 1272 at
15:58:11.744 and tick 1884 at 15:58:45.696. Neither the actual server capture tick
nor the exact client snapshot at request time was recorded. Do not interpolate
wall time and call it an exact simulation state.

## Source trace and proposed bounded follow-up

`independent:false` selects `PreviewSavedOrderAdvice`, with one `Restore` for
this whole request. `previewDetachedAdvice` runs normal public/owned source
checks for each order; building requirements use owned prerequisites, credits,
counts and build radius. They do not perform collision or pathfinding checks.
Once a valid build becomes `indeterminate`, later orders skip even that building
requirements call and retain nonbinding advice. `CommandAffordances` receives an
empty selection in the match actor, followed by `SaveForAdvice`. Therefore this
is not 24 independent expensive placement probes; measure the real path.

After the live match and its native replay audit close, use its exact earned
replay and compatible frozen navigation-lookup source. Reconstruct selected
states spanning the recorded bracket, including the observed build rejection
(tick 1527), subsequent accepted build (tick 1713), and bracket endpoints. Record
each exact reconstructed hash, replay/source identity, owner view and request
results. Treat these as bounded neighboring states, never the unknown exact
capture. Keep replay reconstruction outside timed loops.

Measure empty-selection affordances, `SaveForAdvice`, `Restore`, detached exact
24-order advice, and the complete saved-advice call separately. Compare one
order with the captured batch; retain rejection/indeterminate codes rather than
requiring synthetic success. Verify all live source hashes and perspectives stay
unchanged. If elapsed detached work remains far below two seconds, report that
it does not reproduce actor-queue/scheduler/GC delay. Do not change timeouts,
authorization, gameplay or response semantics on that basis.

The follow-up has now run in isolation from live multiplayer, with no production edit. The earlier 3H movement/return profile remains separate evidence.


## Completed diagnostic, 2026-09-28 16:19 UTC

`runs/20260928T161904Z` passed reconstruction and stage measurements. The earned
replay has SHA-256 `f03f6b2b0519e592236098fd807ff2817492bb1d5c46fb343aca346d622b5da9`;
its separate native audit verifies ordinary team-1 elimination at tick 13475,
full/checkpoint/restored-midpoint equality, and seed `4866468222137547733`.
This does not erase the HTTP 503 from the product acceptance result.

All four sampled states matched full and indexed replay hashes, full and compact
advice outputs, unchanged original save bytes/hash and every original player
view. A player-2 request using player-3 rig 6 was denied. Each exact captured
24-order batch returned 24 `indeterminate` results, not a collision guarantee.
There were only 30–38 live actors at these states.

Source lock: `c9718cb618a7dad95593ed7277cb01aac7efb994cbae3a48a6b5ca2ce01b2fcb`.
Binary: `61ca2b88bc9f52c39a762208c8104296347d6daf9da23e76004a90f2654ea0e3`.
The 356 frozen navigation source files are unchanged, with one added diagnostic
test file. Source and input hashes were verified after execution.

Measurements below are **three-iteration means in milliseconds**, Go 1.27.1,
Darwin ARM64, Apple M4, GOMAXPROCS=2. The live host/browser and its audit were
closed; art and parent work were permitted on the shared desktop. These are
neither quiet-host latency measurements nor percentiles. Detached checks exclude
clone setup explicitly. The complete saved-batch call includes one restore.

| Replay tick | Save for advice | Restore | Saved first order | Saved 24 orders | Detached 24 orders |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1272 | 25.704 | 71.615 | 68.730 | 73.367 | 0.366 |
| 1527 | 21.314 | 54.005 | 54.766 | 53.901 | 0.259 |
| 1713 | 25.664 | 57.146 | 63.739 | 57.790 | 0.298 |
| 1884 | 24.184 | 65.341 | 53.619 | 58.018 | 0.243 |

Empty-selection affordances took 0.005–0.060 ms and 144 bytes per call. Restore
allocated 14.43–14.47 MB per call. Detached 24-order checks allocated about
121 KB, versus 14.56–14.59 MB for the complete saved-batch call. The small samples
and allocation/GC conditions explain why these independent stage means need not
sum exactly or rank monotonically; they are not paired tail-latency evidence.

This did **not reproduce the two-second timeout**. It supplies no basis to
attribute the live failure specifically to building checks, JSON restore,
rendering or networking. Actor queue delay, capture scheduling and GC/CPU
contention inside the live request remain unmeasured. No timeout, authorization,
response or gameplay semantics were changed. The next discriminating evidence
is a controlled live course with exact request/capture/stage timestamps, or the
already planned quiet-host comparison; it must retain any failure.
