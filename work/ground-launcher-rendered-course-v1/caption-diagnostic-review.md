# Caption footprint diagnostic

One isolated Chromium 151.0.7922.34 course used the unchanged prepared-02 bundle, renderer, native oracle, Go runtime and artwork. It loaded three real US boundaries and changed only the fixture DOM caption display/position after the final stopped-renderer boundary. All three authoritative/presentation assertions and final zero-page/zero-worker cleanup passed; strict status remains FAILED for 12 unclassified raw `net::ERR_ABORTED` reports, with no page/console/HTTP error. All 284 read inputs were unchanged. Browser/HTTP closed before handing the lane back to root.

Native PNG analysis (`caption-diagnostic-01-pixels.json`) independently establishes the observed footprint:

| Caption | Transparent screenshot pixels | Transparent bounds | Other changed pixels outside caption + vertical mirror |
|---|---:|---|---:|
| Original x12 y12, 569×35 | 19,915 | x12..580, y853..887 | 0 |
| Display none | 0 | None | 0 |
| Moved x800 y120 | 19,915 | x800..1368, y745..779 | 0 |
| Restored original | 19,915 | x12..580, y853..887 | 0 |

The black-looking rectangle is actually an alpha-zero hole in the captured PNG, not black authored pixels. The caption removal screenshot shows the original terrain underneath without image editing. Moving the caption moves only the caption and its vertically mirrored hole; the launcher/body/terrain pixels elsewhere are exact. This identifies the interaction with the fixture DOM overlay, while the underlying browser compositor/readback mechanism is unproven. It does not establish whether unrelated product overlays exhibit the same browser behavior. No generalized screenshot or network waiver follows.

The diagnostic attempted native canvas `toDataURL()` after presentation: all four reads were uniformly opaque black, so those captures are explicitly unusable as backing-store evidence. The frozen renderer is stopped and uses ordinary non-preserved WebGL presentation. No renderer or product change is justified by those reads.

For subsequent launcher body acceptance, a separate browser-v3 keeps the same frozen bundle/oracles and hides only the fixture caption from capture. Scenario/stage/tick/viewer remain in JSON and filenames. Original driver-v2 receipts/images remain untouched. The full product UI and its overlays are outside this isolated body fixture’s acceptance.
