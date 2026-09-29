# AudioContext browser course — prepared, not run

Prepared against unchanged private audio-v1 (source lock SHA256 `4ccb087b72fb00c69f1e3c86fb5fd67db5321457b4affbca1f6c8cde7e3ebedd`). No production source, audio or art was changed. Browser execution remains held for power and lane clearance.

`prepare.mjs` verifies the frozen source and exact existing US pilot select/move OGG and MP3 clips against both the audio index and base-pack manifest in `work/art-generation-consumer-v1/app-v3-build-03/product`. Test aliases deliberately reuse one URL while retaining the original audio bytes. The generated `browser-prepared-v1/prepared.json` pins every input/output. Bundle generation and Node syntax checks passed; no strict fixture TypeScript or browser acceptance is claimed.

The intended headed Chromium course uses the real AudioContext and native decoder after consent plus a trusted click. It checks cached and HTTP-pending same-URL descriptor replacement, failed candidate retaining A, consent withdrawal, real tab focus suspension, actual source lifetime, and context disposal. Pending HTTP is controlled by the task-local server; this is not proof of a native decode-in-progress race. Original-consumer bytes are traced, hashed and matched to server URL ordinals; the exact deliberately canceled Request is retained separately. All other page/console/HTTP/request errors remain strict failures through browser close. No prior application diagnostic is reclassified.

Run only after explicit lane/power release, from repository root:

```sh
node work/audio-generation-retry-v1/browser/prepare.mjs
node work/audio-generation-retry-v1/browser/runner.mjs --execute --executable /verified/path/to/chrome
```

`runner.mjs` refuses execution without `--execute` and an explicit verified executable. It uses an isolated browser with mute-audio, not the user's profile. It records executable/version, exact byte proof, decoder buffer/PCM fingerprints and cleanup. This can prove decode/control behavior, not subjective listening. The focus course may expose platform-specific failure; preserve it rather than substituting synthetic focus. No cross-browser claim. Generated clips/bundles remain local and are reproducible from pinned originals.

At checkpoint: all preparation processes exited; no browser, HTTP server or playback was launched.
