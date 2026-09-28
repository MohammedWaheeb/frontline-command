# Combat feedback presentation

The client consumes the isolated0.3.4 Go combat disclosure through
`app/combat-feedback.ts`. Actual shot weapon and positive resolved armor drive
visual and audio descriptors. A current/prior actor's type cannot replace redacted
metadata. Area impacts do not disclose victims. A missing outcome is neither a
miss nor an obstructed projectile; the existing firing rules remain unchanged.

`CombatTimeline` deduplicates ordered event IDs, ignores future/stale events and
expires cosmetic cues by Go tick. Pausing freezes that timeline. First load,
replacement, perspective change, backward seek and long observation gaps establish
a baseline without replaying buffered effects. Lost target anchors disappear
immediately. An explicit intercepted event is shown at its disclosed warning
point, without claiming a physical interception endpoint or defender identity.

`CombatEffects` is below tactical warnings, route reviews and actor status labels.
Confirmed hits, positive cover, decoys and interception retain steady distinct
marks regardless of the decorative budget. It uses the optional verified FX
library, with at most192 decorative sprites and the independent32MiB page budget.
Active paused frames are touched before pressure trimming. Atlas clips select
standard/low/reduced-motion/reduced-flash/combined variants without substituting
standard flashing art for missing accessibility art. There are still **no
production FX atlases**; native shape fallbacks are functional feedback, not
completion of the132-effect inventory.

Projectile trails join only past authorized samples of the same ID and owner.
They clear immediately when disclosure is lost or the projectile disappears.
Exact tile traversal prevents even a narrow diagonal segment from crossing a
currently hidden tile. No flight arc, muzzle-to-target tracer, hidden origin,
future path or interceptor reservation is invented.

The offline adapter emits a presentation reset before every frame received while
a replacement RPC is pending, including its actual successful replacement frame.
This handles already-queued worker frames without changing the frozen worker or
Go binary. Online full snapshots reset before publication. Renderer reset clears
transient death sprites as well as shot cues and shake. The independent audio
review corrected repeated observer `connected` notifications so normal observer
polling does not reset sound on every frame.

Actual combined-WASM courses pass on Chromium151, Firefox153 and WebKit26.5:
ordinary covered infantry attack, landed-aircraft light armor, source conversion/
death/removal, actual airborne decoy, fixed/mobile interception, pause, reduced
settings, culling/reappearance, exact save/hash restore and replay seek. A separate
recorded-practice course fires across raised terrain with a real cover tile and
fog. Chromium additionally exercises graphics-context loss/recovery and an actual
ordinary combat death followed by same-player load and a short forward replay
seek; transient corpses clear on both replacements. Root inspected
native1280/1600 captures. See [evidence and limits](../work/evidence/combat-renderer/acceptance.md).

The shared suite passed327 tests and both TypeScript checks. A final exact-tile
visibility refinement passed the focused ten geometry/reset/pose tests. Fourteen
existing renderer groups also pass, including five-scene release to zero actor
pages. The tests retain the legacy IR strike-drone service-pose gap explicitly.
Synthetic FX-page integration passes all three browsers with688 essential marks,
192 decorations, paused loading/pressure recovery and late disposal. It remains
a separate course, never finished-art evidence.

Interceptor pose hooks now support an owned battery's `launch_empty` state, and
owned `lowpower/disabled/damaged/critical_charges_0/1` variants where those exact
states exist. Structural priorities stay intact; foreign/missing private data
uses generic art, and legacy sheets retain existing fallbacks. Four-battery art
production/review is still pending under the sole Blender worker.

Remaining work includes production FX authoring/native review, all-frame shader/
atlas acceptance in actual combat, complete roster scenes, listening/mix review,
long combined-load measurements and the full local release gates. These checks
are seeded mechanics/presentation evidence, not paid campaign or balance wins.
