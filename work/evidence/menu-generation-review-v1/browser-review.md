# Native menu course read-only review

Reviewed the exact preserved Chromium01 driver, fixture, result and source. Current helper bytes equal the preserved helpers; pins are in `browser-audit.json`. No test, host or browser was run and no production file was changed.

The eight functional gates are supported within their stated component scope: exact baseline/candidate canvas PNG bytes at 1600×900 and 1280×720, exact painted screenshot, failed replacement retains the original blob and generation, successful replacement obtains a new generation/blob lease, blocked-image unmount, replacement, and resize. The old/new byte equality is a meaningful composition check with unchanged artwork. This is not a full-App load/reload test or a multi-browser result.

Two assertion limits should be retained in the claim or tightened in a future bounded successor:

1. **Native A/B payload distinction is absent.** `menu-browser.mjs` lines 26–29 modify index/pack versions and key-art presence, but A/B serve identical metadata and image bodies. A new blob URL and B generation establish rebinding, yet cannot independently detect a stale A decoded image being reused when real B bytes differ. The pure generation tests cover mismatches separately. For a native changed-content claim, use two existing, separately hash-pinned valid artwork/metadata closures at the same logical test URL and assert the expected B pixels; do not recolor or manufacture shipping art.
2. **No after-release stale-draw observation.** Lines 61–63 release the held old response only after capturing the successful replacement/resize and immediately clear the component. An old completion that paints after release is not directly observed while the new canvas remains mounted. Retain the completed new canvas, release the old response, await its completion/cancellation and bounded draw drain, then require unchanged B hash and zero old leases/scopes. Source guards plus unit tests remain the actual evidence for that late-completion boundary in the present run.

Final diagnostics are reconciled after browser/server close, correctly retaining all 107 raw aborts and strict FAILED. There is no original-consumer byte/EOF/request-ID proof in this driver, so none is classifiable here as a complete-body report or intentional cancellation merely from its phase. Page, console and HTTP error lists are empty.

Final `dispose()` clears ArtLibrary generation access, so the returned final object has no resource counters. Earlier `clear()` calls explicitly wait for zero current leases/in-flight/queue and all captured scope signals are aborted, supporting the observed clean lifecycle. It does not directly report counters for every detached old generation after final disposal; the focused source/core tests cover that separately.

No new production defect was found. The two gaps limit stronger native mixing/late-completion acceptance and do not invalidate the recorded composition/rebinding checks. Original strict failure must remain intact.
