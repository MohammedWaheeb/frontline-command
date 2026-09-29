# Actual audio mix headroom and lifecycle course

The live pre-correction mixer exceeds full scale when valid authored cues coincide. Chromium run02 uses the real24kHz AudioContext, trusted gesture, native OGG decoder and current mixer. A silent AudioWorklet branch observes every sample after the master gain. No audio asset is modified; the browser is muted. The deliberately synchronized cue loads do not represent measured normal-match frequency or subjective listening.

| Synthetic load | Baseline peak | Samples above1 |
| --- | ---: | ---: |
| Default controls, six weapon cues + warning + four continuous sounds + three music sources (one audible) |1.121115|3|
| Default controls, sixteen weapon cues + same8 sources (24-source cap) |1.894008|441|
| All controls1, same24 sources |2.959359|2379|

All three reached exact14/24/24 source counts, finite nonzero PCM and closed-context cleanup.162 pinned inputs stayed exact. Strict diagnostics separately fail10 raw aborts, zero page/console/HTTP errors. Clip decode/inventory acceptance cannot establish mixed-output headroom.

## Candidate and preserved failures

- Run01 preflights the baseline. Run03 failed candidate preparation for missing snapshot React resolution/runtime/errors.ts; run04 adds those existing dependencies and passes.
- Compressor-only run05 still clips at maximum controls: peak1.219026/50 above-range samples. Its exact source is `candidate-compressor-only-v1`.
- V2 adds a stateless soft-peak WaveShaper after the compressor and before the existing master control. Three-engine real PCM courses06/08/09 pass their amplitude/cleanup gates. FF/WebKit have zero diagnostics; Chromium06 retains9 raw aborts/strict failure. The original v2 source is `candidate-softpeak-v2`.
- Firefox07's expected-value view was detached by native AudioBuffer acquisition; its quietError became NaN. The corrected fixture snapshots expected samples before starting playback and retains the same1e-6 threshold. Original07 stays failed; corrected08 reports original view length0/independent expected8192.
- Independent review found the compressor's buffered tail survives a source stop. Accepted v3 rebuilds only that compressor at reset/stopTransient, retaining existing bus gains, master, stateless ceiling and ongoing music sources. Disposal explicitly disconnects and drops the full graph. Independent final source review found no blocking defect. The exact one-file v3 correction is integrated; all498 runtime tests and both TypeScript checks pass. All1721 client source/test inputs were guarded.
- Firefox10 fails because its native OfflineAudioContext has no suspend method. Later runs explicitly capability-detect this and report the exact-boundary probe unrun on that engine, while still running its actual real-time mixed-signal checks. This is not silently counted as passed.

## Native boundaries and signal meaning

The output path is bus gains → DynamicsCompressor(threshold−3dB,knee3,ratio20,attack0,release100ms) → non-oversampled WaveShaper → existing master control. A4097-value odd curve is linear through magnitude.8, then bends to endpoint.952318847. Native shaper-only sweeps cover finite inputs−24…24 plus quiet−.75….75: peak.952318847 and maximum quiet error5.96e-8. **Quiet preservation is a shaper-only fact**; the compressor affects dynamics. No intersample/device resampling, perceptual quality or universal performance guarantee follows.

The [Web Audio specification](https://www.w3.org/TR/webaudio-1.0/#WaveShaperNode) defines endpoint clamping for inputs outside the curve's domain. Oversampling stays off to retain the sampled amplitude bound. Normalized user settings constrain master to0…1. Compressor lookahead is documented in the [processing definition](https://www.w3.org/TR/webaudio-1.0/#DynamicsCompressorNode).

Chromium11 uses actual native OfflineAudioContext suspend at frame1536 to exercise both actual before/after mixer reset and stopTransient methods. Graph setup and the diagnostic DC buffer are declared fixtures; no game cue/view/save is fabricated. Each original v2 negative control emits144 stale samples after the boundary, peak.502445. Each v3 method emits exactly0 subsequent samples, and replaces the compressor. This proves the bounded mixer path; it is not hardware-output timing or an App-level focus event test. Sources register through the actual mixer source method. All native contexts finish closed.

The full v3 real-time mix runs also check actual source admission, priority100 warning caption, finite PCM, reset counters, closure and absence of retained master/limiter/ceiling/bus references. Current maximum peak is.952318847 in Chromium, and.809278 in Firefox. Browser engines differ in compressor response; bit-identical cross-engine audio is not expected. Final run13/WebKit passes all headroom/disposal and exact-boundary tail gates with zero diagnostics. Firefox12 passes its supported headroom/disposal gates with zero diagnostics; its offline-tail limitation remains explicit. Chromium11 headroom/tail/disposal passes but strict diagnostics fail20 raw aborts. All169/168/169 pins respectively remain exact. Independent source review confirms the recorded scope and lifecycle correction.

From candidate06 onward the test disconnects only the device destination and routes the unchanged upstream mixer through the silent measurement node, so all engines stay silent. Earlier baseline02/compressor05 retained the destination with Chromium's browser-level mute. The actual sampled point is the same master output.

## Reproduction and scope

Use `node work/audio-mix-headroom-v1/run-candidate.mjs run-14 --engine=chromium` only with an unused numeric directory and the single browser lane available. `--prepare-only` does no browser work. All owned browsers/HTTP connections close in finally, with a two-minute independent watchdog. Native source/bundle inputs and original audio pack descriptors/lengths/hashes are checked; raw diagnostics remain separate and unwaived. Receipts retain exact original helpers and logs. No original clip, Go rule, UI composition or frozen product is changed; only the reviewed live mixer source is integrated. Codex authors this nonvisual mixer correction under the user’s authorization; Claude remains primary audio asset author/reviewer.

The future runner now asserts actual PCM frames exceed sampleRate×3, instead of total channel-sample count. Independent integration auditing confirms every retained final case already exceeds that exact3-second frame gate; original run helpers remain unchanged in their directories.
