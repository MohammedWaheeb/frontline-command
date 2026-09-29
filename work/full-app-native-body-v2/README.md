# Corrected bounded actual-App resource and EOF course

Successor to immutable `work/full-app-native-body-v1/chrome-01`, which remains **failed**. It reached actual solo readiness but the fixture wrongly waited for build geometry advice to become `clear`. Actual `pkg/sim/preview.go` deliberately returns accepted + `indeterminate`, and the native screenshot says the host will check execution. V1 retained no exact preview RPC timeline; it cannot establish a product stall. Its separate post-close body audit proves 680 original static bodies, including 29 of 30 raw aborts. The map request was outside its selected paths. All 30 raw reports remain strict failures.

This private successor changes only the course:

- Records exact original preview request/decoded batch and reply/tick/timestamps without sending any RPC. `indeterminate` is accepted as the documented advice result, never reported as clear.
- Selects one reasonable site from the actual current authorized view: every footprint tile must be currently visible, within a conservative fraction of a disclosed **owned** build radius, and clear of disclosed actor footprints. This is a conservative public selection filter, not a second placement simulation. It neither inspects foreign save state nor grants permission to an invalid site. There is exactly **one paid click**; actual Go rejection fails immediately and is preserved.
- Reads actual `Save()`'s version1 `{version,sha256,state}` envelope for owner power paid amounts. Flat invented save data is rejected by the observer test.
- Selects all exact manifest paths for passive original fetch-consumer observation, including the map. Native JSON/Blob/HTML image/worker/service-worker limitations remain explicit, with no extra body read or request.
- Captures native scene-ready and paid/failure screenshots, original worker observation, and resource samples even on early failure. Tries normal targeting cancel/pause/menu cleanup independently on failure, then always reconciles body/raw diagnostics after actual browser/server close. Unrun controls no longer prevent recording the independent body/raw status; the overall course still fails.
- Separates UI scene-loading dismissal from scene-ready time including the normal countdown. RAF/heap/GL figures remain shared-host diagnostic measurements, not reference performance or actual GPU totals.

The original product/package is unchanged. `product-01.config.json` pins the same ordinary Go0.3.4 build, root version SHA `531626f5…d29e`, pack `b73e3325…9553`, original generated protocol and genuine Chrome154 executable. `parent-lock.json` records copied helper identity; original helpers/runs are untouched. Limits and native-reader semantics otherwise follow v1. Blender remains active.

Preparation: strict worker TS/bundle in `prepare-01`; 21 focused tests in `checks-01.log`; runner syntax passes. A source/preflight lock and fresh product-specific guard precede the one root-authorized execution. No automatic retry follows any failure.

```sh
node work/full-app-native-body-v2/runner.mjs --config work/full-app-native-body-v2/product-01.config.json --out work/full-app-native-body-v2/product-preflight-01
# Only with root's explicit lane release, in a new evidence directory:
/usr/bin/caffeinate -i node work/full-app-native-body-v2/runner.mjs --config work/full-app-native-body-v2/product-01.config.json --out work/full-app-native-body-v2/chrome-01 --execute
```
