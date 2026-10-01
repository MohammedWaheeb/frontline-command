# Transport receiver presentation

An owned infantry actor in an active Go boarding channel identifies its receiver
through the first owner-private board order. The renderer uses that exact target
to choose an existing doors-open pose. It does not search nearby actors, simulate
boarding permissions or mutate the Go state. Foreign and undisclosed receivers
remain unknown. An explicitly disclosed neutral garrison is also eligible.

Context is rebuilt every snapshot, so interruption, expiry, completion, ownership
change, view loss and replay seek clear it. Destruction, construction, disabling
and damaged poses retain priority. Assets without an authored opening pose retain
their existing fallback and remain visibly incomplete. Blocked unloading keeps
the ordinary unload opening pose and shows a separate blocked-exits status.
Flight altitude and landing/takeoff timing are unchanged.

Fifteen receiver tests cover exact target selection, multiple passengers,
interruption, hidden/foreign data, queued orders, immutable protobuf bytes and
wire restore. Pose tests cover healthy receiving activity, missing assets,
blocked unloading and higher-priority damage/disabled/destruction states.

The actual Go browser course on shipping0.3.3 passes ordinary APC boarding,
Stop, exact save/load, completion and replay rewind/forward. The receiver flag
opens at tick4114, closes on Stop4115, restores at4114, and clears on completion
4164. Final replay hash is
`85a7dad97e9cb367b18f33f14d6d317950548488b2e76a012259ec30868a1ab3`.
Disposal leaves zero canvases/pages and no application errors.

Evidence: `work/evidence/transport-receiver/browser.json`. Browser plugin not
available; the course uses headed Playwright Chromium151.0.7922.34. It is a
recorded practice setup followed by ordinary commands, not an economy victory.
The current US APC is still a declared stand-in with idle art, so this proves
real Go-to-renderer context and lifecycle, not native open-door art acceptance.
The staged full APC/airlift sheets must be inspected with these same controls
before their presentation can be called complete. The source-spec audit in
`work/art/state-binding-audit/` remains an explicitly historical baseline.
