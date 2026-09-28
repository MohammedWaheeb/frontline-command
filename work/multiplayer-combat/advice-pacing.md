# Command advice dispatch pacing

Root's existing runtime suite exposed a real minimum-spacing failure while the
machine was loaded. The original failure remains at
`work/owner-ranges-candidate/client-tests.log` (331 pass, one pacing failure).

`OnlineCommandAdvice` previously set its next deadline before constructing the URL
and dispatching fetch. A main-thread stall during that interval shortened the time
between actual requests. The deadline now starts immediately after `fetch` returns
its promise, before awaiting the response. Failed HTTP responses still consume the
same budget, and existing cancel/stale-selection behavior is unchanged.

The new deterministic test advances a virtual clock by 200 ms during request URL
construction and uses microtask-scheduled fake timers. It does not spin or depend
on the machine load. Before the fix, actual fetch times are 1,200 and 1,260 ms;
after the fix they are 1,200 and 1,460 ms. The original real-time >=240 ms
assertions remain unchanged. Focused evidence:

- `advice-delay-red.log`: nine pass, new deterministic test fails with the 60 ms gap.
- `advice-delay-green.log`: all ten advice tests pass, including cancellation and
  the original real-time pacing test.
- `advice-typecheck.log`: runtime typecheck passes.
- `advice-full-runtime.log`: full current runtime suite result.

The active ordinary-combat browser suite intentionally retains its frozen product
build from root checkpoint `1305dcb`; this source correction is not silently
injected into those running matches. It is a separate runtime fix, not a change
to game speed, command legality or server rate limits.
