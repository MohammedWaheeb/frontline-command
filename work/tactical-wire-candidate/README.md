# Tactical presentation and strategic preview candidate

This isolated Go module preserves shipping simulation0.3.3 state semantics.
It is not a released runtime. Its protocol additions and view/advice API are
under integration; shipping `client/public/runtime`, Go and bindings remain
unchanged. The eventual parking change requires a new simulation version.

## Authoritative presentation

- Projectile splash comes from each actual projectile, including explicit zero.
  `position_visible` distinguishes a genuinely visible body from a warning whose
  hidden position has been replaced by its public impact point. Protobuf optional
  fields preserve zero/false versus absent older-runtime data.
- Skybreaker warnings use the actual shared2000mt blast constant; pending volley
  radius comes from its launcher's weapon. Raid/transfer have no invented radius.
- The owner receives `emergency_takeoff_until` inside private entity data.
- Authorized actor views carry a stable allowlist of visible active effects and
  actual expiries. No buff source identity, internal exit lock or private cooldown
  is exposed. Concealed/fogged actors remain absent. Indefinite deployed/aura
  states use `until:0`; Shieldline's zone supplies its meaningful end time.

## Skybreaker route advice

`PreviewOrders` and authenticated host command advice add optional `plans`:

```json
{"order_index":0,"kind":"skybreaker","edge":0,"routes":[
  {"entry":{"x":601,"y":52400},"drop":{"x":54000,"y":52400},
   "impact":{"x":54000,"y":54000},"entry_at":64,"release_at":242,
   "impact_at":243,"splash":2000}
]}
```

This shape example shows one route; actual plans always contain three ordered
routes. All coordinates are millitiles and times are absolute20TPS ticks. Go
alone computes geometry and travel time, using the same function for the actual
launch. Advice estimates the earliest next-tick execution: impact is one tick
after bomb release. Aircraft may be delayed or destroyed; a plan is not a promise
of execution or damage. `results` retains the existing advisory `indeterminate`
contract. Confirmation must submit through ordinary admission again.

Only owned US strategic requests with three valid, currently visible clustered
points receive plans. Map dimensions, selected points and owner knowledge are
the only geometric inputs. Hidden anti-air/obstacles cannot alter the response.
Plans describe the observed snapshot, not hypothetical effects of earlier batch
orders. Independent contextual candidates still reject abilities. Existing host
authentication,4requests/second,32orders,8clone workers and timeout limits remain.
The host restores its captured save once, outside the match actor. Solo/replay
authorization and batch validation remain unchanged.

## Evidence

- `tactical-route-tests.log`: focused native simulation, actual HTTP and WASM
  Session adapter tests pass. Four edge previews match ordinary real launch
  geometry/deadlines; long-flight timing, fog/ownership, nonmutation, bad targets,
  private metadata, codec presence, expiry and replay read-only checks pass.
- `native-wasm-parity.json`: all11 actual Go view/plan JSON outputs are byte
  identical on native and js/WASM. Includes both effect exports and four edges.
- `canonical-parity.json`: eight800-tick actual strategic runs (US/IR×4edges),
  with320 sampled hashes,8 final hashes and8 final-save digests, are identical
  between a preserved shipping0.3.3 copy and this candidate. Mid-run restore and
  repeated view calls preserve state. This proof precedes the parking merger.
- `runtime/frontline.wasm`: isolated test runtime, SHA256
  `7b5c451ed5b5ee759eb1e25f3f58a429d4973b127d7dd31312a2d1f66f6448d1`.
  The copied worker forwards the existing preview RPC. It is never installed
  over shipping files. Final browser confirmation/UI evidence is still pending.
- `source-lock.json`, `changed-files.json`, `candidate-review.diff`: bounded
  review source and original shipping hashes, including generated bindings.

The first route privacy test incorrectly assumed an engineering rig cannot
select a global US strategic ability. Existing Go affordances intentionally
allow it; the test now probes another ability instead. No permission or gameplay
rule was changed to satisfy that test. A concealed-effect fixture was also moved
outside its real detector radius rather than weakening concealment checks.

## Reproduction

Run from `source/`, with the installed Go1.27.1:

```sh
FRONTLINE_TACTICAL_VIEW_DIR="$PWD/../native-views" go test ./pkg/sim ./cmd/wasm ./internal/server -run 'TestTactical|TestSkybreaker|TestSaturation|TestPreview|TestCommandAdvice|TestEditor' -count=1
FRONTLINE_TACTICAL_VIEW_DIR="$PWD/../wasm-views" GOOS=js GOARCH=wasm go test -exec /opt/homebrew/Cellar/go/1.27.1/libexec/lib/wasm/go_js_wasm_exec ./pkg/sim -run '^TestTactical' -count=1
```

The canonical comparison harness takes `FRONTLINE_CANONICAL_OUTPUT` and runs
`TestTacticalCanonicalStatePreservation` against both recorded source copies.
It otherwise skips. Existing development saves are not migrated by this work.
This evidence does not certify complete effect art, balance, long sessions,
physical LAN, the combined parking runtime or the full game.
