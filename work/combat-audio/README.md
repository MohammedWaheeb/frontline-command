# Isolated combined-runtime combat audio acceptance

Base: `work/runtime-034-candidate/source`, frozen source-lock SHA-256 `ed50966897139f973e143ba0f83c9776849b6d7924839c228238e7dc1370ed20`, simulation 0.3.4, Go 1.27.1. `source/` is a local copy with only `fixtures/combat_audio_capture_test.go` copied to `pkg/sim/` and `fixtures/combat_audio_codec_test.go` copied to `cmd/wasm/`. Neither production nor the frozen candidate is modified.

The capture is a controlled backend fixture: starting actors, exceptional source conversion/death/removal, temporary decoy buff, landed state, interceptor charge, incoming round and visibility conditions are seeded explicitly. Actual Go launch, damage resolution, fog, disclosure and snapshot code produce all exported feedback. The ordinary case submits a legal attack and advances the engine until a covered hit. These are not balance, paid economy or authored mission completion tests.

Native and js/WASM runs execute `TestCombatAudioCapture` in `./pkg/sim`, setting `FRONTLINE_AUDIO_OUTPUT` to the absolute `native/` or `wasm/` directory here. `TestCombatAudioCodec` in `./cmd/wasm` reads that directory from `FRONTLINE_AUDIO_INPUT` and writes `native-wire.json` or `wasm-wire.json` to `FRONTLINE_AUDIO_WIRE_OUTPUT`. Actual js/WASM commands add `GOOS=js GOARCH=wasm` and `-exec=/opt/homebrew/Cellar/go/1.27.1/libexec/lib/wasm/go_js_wasm_exec`; the runtime is Node 26.5.0. The four final logs are `native-capture.log`, `wasm-capture.log`, `native-codec.log`, `wasm-codec.log`.

`consume.ts` bundles against the frozen candidate `runtime/frontline_pb.ts` and current audio/shared facts. Build it from `client/` using local esbuild with Node platform, ESM format, `nodePaths:['node_modules']`, input `../work/combat-audio/consume.ts` and output `../work/combat-audio/consume.mjs`; run the output with Node. It decodes actual protobuf, checks sound/caption choices, deduplication and discontinuity with a recording mixer, and writes `work/evidence/combat-audio/go-consumer.json`.

## Restorable browser fixture saves

All paths below are relative to `work/combat-audio/native/saves/`; matching WASM files have identical bytes. Every exported save passed `Restore` and exact state-hash equality. These starts use a synthetic open 64×64 map and perspective 1.

| Start save | Live action or pending event |
| --- | --- |
| `ordinary.start.save.json` | Submit player 1 unit 6 attack target 7; normal advance produces a covered infantry hit. |
| `landed.start.save.json` | Same attack, but target 7 is a landed IR fighter. Resolved armor is light. |
| `source-converted.start.save.json` | Actual RIF round is queued; source 6 now has US tank identity. Advance normally. |
| `source-dead.start.save.json` | Same queued actual round, source dead. Living observer 8 retains genuine sight. |
| `source-removed.start.save.json` | Same queued actual round, source removed. Living observer 8 retains genuine sight. |
| `decoy.start.save.json` | Actual AA round is approaching buffed target 7; advance through impact. No interception event should be invented. |
| `abm.start.save.json` | One IR missile approaches a fixed battery with one charge. Charge consumption and interception at tick 10 are real. |
| `SA.mobile_abm.start.save.json` | Same operation with deployed mobile Aegis. |

The other 13 exported end saves contain completed feedback. A proper presentation baseline must not replay their buffered events merely because they were loaded. The deliberately invalid container-999 privacy fixture is useful for the disclosure filter but is not a valid game save; it is correctly refused and absent from exports.

The first capture assumed a dead shooter's last location would remain visible after its only sight source disappeared, and expired its decoy at the impact tick. `initial-fixture-errors.log` records those test errors. A living observer and a longer test buff correct the setups without changing gameplay. No audible mix or browser playback quality is claimed here; root's separate rendered course consumes the valid starts.
