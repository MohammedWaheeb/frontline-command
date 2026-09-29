# Minimap attachment lifetime correction — 29 September 2026

Model: `claude-opus-5-5` (no fallback, no subagents).

## Defect
`attachMinimap(canvas)` returned a detach closure guarded by `this.minimap?.canvas===canvas`. Re-attaching the same canvas replaced (and disconnected) the first attachment, but the first attachment's stale detach still matched on canvas identity and tore down the new attachment. Evidence: `work/evidence/replay-hud-publication/minimap-first-runtime.log`.

## Change (sole source write: `client/src/render/battlefield.ts`, `attachMinimap` only)
The new attachment object is captured as `attachment` and stored in `this.minimap`. The returned detach disconnects only while `this.minimap===attachment`, so cleanup belongs to that subscription instance rather than to the reused DOM element.

```ts
const attachment={canvas,resize,view:[] as number[]};
this.minimap=attachment;this.minimapDirty=true;this.minimapAt=-Infinity;this.paintMinimap(performance.now());
return()=>{if(this.minimap===attachment)this.detachMinimap()};
```

Unchanged: the prior-attachment detach on entry, the disposed early return, the ResizeObserver dirtying, immediate paint, `MINIMAP_MS` throttling in `paintMinimap`, camera-view invalidation, disposal, and all other source.

## Not done (out of scope, per brief)
No test, UI, asset or Go edits. `client/tests/runtime/minimap-lifecycle.test.ts` was not modified. No browser, build, typecheck, test or host runs. Root reruns the focused actual-method tests and actual-App pixel course.

Ownership of `client/src/render/battlefield.ts` released.
