# Independent audio headroom v3 review

29 September 2026. Read-only source, native receipt and hash review; no compiler, test, browser, playback or source edit by the reviewer. `audit.json` pins the exact reviewed inputs and compact results. **No new product lifecycle blocker was found in this bounded change.** This is not subjective listening or full audio acceptance.

Live baseline mixer `adfab5522ebc325ee3714a2fc6215581195ec2d94362176411aca815912e3a4e` remains exact. Private v3 mixer is `9d073e9e34a03c225efc3c624be69e217aa50e4ab4482a1ff32b09aa6ae860cf`, candidate lock `9bde193db8735aa0bb678ef09968fd1c906b68744a12ea3263cf06a9e5699e0d`. Preserved soft-peak v2 mixer is `5ce837d9d5a0d562fde7233e88b56f03699e7408fe89a4128a5cd8adf56fd8f5`. All five baseline and candidate source pins match. All 169/168/169 recorded inputs of runs 11/12/13 independently recheck exact, including both mixer versions, fixture, meter, bundle, original clips and the frozen pack descriptor. No source/hash mismatch was found.

## Graph and lifecycle

The private graph is sources → existing bus gains → compressor → non-oversampled soft-peak curve → existing master gain → destination. Consent/trusted-gesture context creation, descriptor-keyed decode/cache, cue admission, gain preferences, scheduling, captions and source limits remain the baseline code. The master/bus controls retain their meaning; the compressor and nonlinear ceiling intentionally change loud simultaneous output.

`resetLimiter()` disconnects the old compressor's output, builds the replacement with the same parameters and reconnects the existing private buses to it. It does not recreate buses, their gain automation, the master, shaper or music sources. `stopTransient()` stops nonmusic sources and then discards compressor lookahead; `reset()` stops all sources and invalidates pending session work before the same flush. No stale old-compressor path remains connected to the shaper. A short gap/change in compression envelope is possible while the fresh compressor fills; source identity retention is not proof of gapless or perceptually unchanged music.

Disposal marks the mixer closed before reset, so reset does not allocate a new compressor. It then disconnects buses, limiter, shaper and master; clears all those references; and closes the captured context. Native disposal receipts show zero sources, buffers, pending work and graph references with the real context closed. No new late-load path bypasses the existing generation/closed guards.

The shaper is identity within the quiet central range, transitions smoothly above magnitude 0.8, and saturates its finite input endpoints near ±0.952319 with oversampling disabled. The quiet claim applies to the shaper, **not** to the entire compressor graph under a loud concurrent mix. The native synthetic ramp tests preserve samples within ±0.75 to about 5.96e-8 and bound magnitudes up to 24. They are explicitly diagnostic samples, not edited or generated shipped audio. The output argument also assumes normal validated bus/master preferences within [0,1]; it is not protection against an arbitrary caller setting a post-shaper master above 1, downstream OS processing or intersample analog peaks.

## Native counterfactual and fixture validity

Runs 11 and 13 build equivalent real OfflineAudioContext graphs for preserved v2 and v3, register a source through each actual mixer's `source()` method, and call the actual `reset()` or `stopTransient()`. The diagnostic DC buffer is explicitly synthetic. Both versions use identical compressor parameters and curve. Context/graph assignment is a test fixture, not a replacement implementation of the lifecycle methods.

The offline context suspends at sample 1536. Every before/after case records pre-boundary peak 0.480863, so silence is not caused by a graph that never carried signal. For each boundary method, v2 retains 144 nonzero samples at peak 0.502445 (6 ms at 24 kHz) and does not replace the limiter. V3 replaces it and records zero post-boundary samples. The old version is a meaningful negative control against an accidentally silent fixture. Source counts reach zero in both versions; the difference therefore measures buffered graph output, not merely bookkeeping.

The online course separately uses trusted gesture, actual original-clip fetch/hash/decode, the real v3 graph, repeated reset followed by new mixed output and final disposal. It retains nonzero PCM after reset, avoiding a false headroom pass caused by permanently disconnecting all buses. The silent meter replaces only the destination connection during the test; it observes all upstream samples and emits no stress audio. This does not measure already queued hardware/device output, audible clicks, compressor pumping, continuous music across blur, or subjective listening.

| Run | Native evidence | Strict diagnostics |
| --- | --- | --- |
| 11, Chromium 151.0.7922.34 | Both v2/v3 tail boundaries, quiet curve, 14/24/24-source mixed headroom and complete disposal pass | **FAILED: 20 raw request aborts**, zero page/console/HTTP errors; no body attribution or waiver |
| 12, Firefox 153.0 | Quiet curve, mixed headroom and complete disposal pass | PASS, zero recorded errors; exact offline tail course explicitly **not run** because `OfflineAudioContext.suspend` is absent |
| 13, WebKit 26.5 | Both v2/v3 tail boundaries, quiet curve, mixed headroom and complete disposal pass | PASS, zero recorded errors |

Chromium/WebKit mixed peaks are about 0.761855 at default master and 0.952319 at maximum; Firefox's measured peaks are lower. All retained samples are finite, with zero samples above 1. The earlier compressor-only, fixture failures and baseline clipping evidence remain preserved; their statuses are not changed by this review. Run 10's Firefox missing-method failure is separately retained.

## Small assertion/documentation improvements

The meter's `samples` is the sum across channels, while `frames` measures time. The driver currently asserts `samples > 24000*3` for a stated three-second observation. A two-channel 1.6-second capture could satisfy that numerical assertion. Use `frames > sampleRate*3` in a future driver. **Current retained runs are not affected:** every case records roughly 84,352–84,480 frames at 24 kHz, about 3.5 seconds, and the driver actually waits 3.5 seconds. No current receipt was relabeled.

The top-level audio-course README still describes the earlier compressor-only candidate and pending execution. Update it before integration reporting to include the shaper, v3 tail flush, Firefox capability limit and run 11 strict failure. These are reporting corrections, not production-source changes requested from the reviewer.

The exact tail fixture measures reset/stopTransient without continuing music; music object/bus retention is confirmed by source, not an independent uninterrupted-music PCM experiment. This is an explicit coverage boundary rather than a claim of a proven audible regression.
