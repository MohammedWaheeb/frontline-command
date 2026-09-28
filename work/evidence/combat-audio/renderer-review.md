# Independent combat renderer lifecycle review

Read-only review of root-owned `combat-presentation.ts`, `combat-effects.ts`, reset hooks and existing FX residency, 2026-09-28. This is source review, not an FPS or pixel acceptance claim.

Three concrete issues were reported to root:

1. **Offline replacement ordering:** request-time `presentation-reset` can be consumed by an already queued old frame before the successful replacement frame arrives. A short forward load/seek can then replay buffered cues. Root is coupling reset to frames while a replacement RPC is pending, using the worker's FIFO result boundary.
2. **Repeated observer connection state:** every successful observer poll emits `connected`; unconditionally resetting audio on that notification suppresses every subsequent observer cue. This lane now ignores duplicate phases and tests continuous polls, actual reconnection and a new operation.
3. **Old death sprites after forward replacement:** `resetFeedback` cleared live cues, shake and the timeline, but old `deaths` survived unless tick went backward or player changed. Root is disposing that collection on explicit reset too.

No other concrete defect was found in the inspected FX budget/disposal path: metadata is awaited before first rendering; missing art retains explicit code-native marks; textures are separately owned; the hard pending/resident page budget is unchanged; active sprite pages are touched before idle eviction; detached cropped textures do not own page storage; release/late-response guards prevent resurrection. Decorative nodes are bounded independently of essential outcome marks. Real dense-load and native pixel verification remain root's integration gates.

The descriptors consume only supplied combat facts, retain unknown impacts, keep interception at its disclosed warning point rather than inventing an interceptor endpoint, and remove anchored cues when their identified actor disappears. Projectile traces use only successive authorized body positions and sample visibility along each segment. Reduced-motion/flashing variants do not remove essential outcome marks. This does not certify any of the 132 missing authored FX assets or prove a miss/blocked-shot distinction that the wire does not supply.
