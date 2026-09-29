# Independent final offline file-budget review

29 September 2026. **The latest conservative count is 15,621 files, 379 below the existing 16,000 cap, after the newly completed IR fighter replaces its estimate.** This is a count projection, not a completed full pack or encoded-byte acceptance. No asset, renderer, source queue, installer limit or packaging behavior was changed. No browser, renderer, native simulation or pack build ran.

`audit.py` independently reads and pins the old projection, the 53 sealed handoffs, the older base graph, the three frozen remaining queues and actual loader/packaging sources. It validates metadata graph membership and recalculates file counts without decoding PNGs or treating partial renders as completed. `result.json` preserves that original 53-handoff boundary. `ir-fighter-delta.json` independently verifies the later sealed handoff and preserves the reduction separately. PNG payload hashes are inherited from the authored handoffs, not freshly rehashed in this metadata-only review.

## Reproduced counts

| Component | Original 53-handoff boundary | After sealed IR fighter |
| --- | ---: | ---: |
| Completed sprite graph files | 3,341 | 3,422 |
| Remaining frozen-spec sprite upper bound | 9,393 | 8,900 |
| All eight UI exports for 136 roles | 1,088 | 1,088 |
| Fixed v25 files | 2,211 | 2,211 |
| **Full-export UI conservative upper** | **16,033** | **15,621** |
| Margin to unchanged 16,000 cap | −33 | **379** |

The original 3,341 completed sprite files are 2,273 from the 53 handoffs and 1,068 from 48 older base-only IDs. The 53 handoffs have 2,697 unique paths including 424 UI images. The base-only entries are inventory evidence, not fresh visual acceptance.

The original remaining 61 IDs exactly match the frozen queues: eight aircraft (3,804-file upper), 21 ground units (3,401) and 32 buildings (2,188). Their current source-spec ceilings match the old projection exactly despite source-family revisions. The calculation uses actual per-state layer/direction/frame counts, a 2,048-pixel page and two-pixel padding; each atlas page has JSON and PNG at both world qualities. Existing union trimming can reduce the count, but its future effectiveness is not assumed.

The newly sealed IR fighter handoff `1f6578903b83a790042640ede6337b5146e6ce078436abe30eef26b39c0bd028` has 832 poses, 81 sprite files and eight UI files, 20,955,114 bytes total. Its 81 replaces a 493-file pending ceiling: −412. All descriptor hashes and file lengths recheck, and its actual sprite file set exactly closes over sidecar → atlas JSON → atlas PNG. The old 53 result is not overwritten or retroactively relabeled as a 54-handoff audit.

The sealed runtime scope is 75 unit IDs, **61 faction building sheet IDs** and 26 props, totaling 162 world IDs. The actual catalog resolver inventory is 136 unit/building IDs. A shorthand count of 59 buildings must not be used to drop two runtime sheet IDs. The two editor-only prop markers stay included in the 26-prop scope.

## Duplication and reachability

No duplicate URL/path explains the old 33-file overrun: all 2,697 handoff paths are distinct, the frozen base pack has 3,826 distinct entries and the arithmetic replaces existing sprite rows by ID rather than adding the old and new sheets together. The runtime packer's `runtimeFiles()` also uses a Set. Overlay replacement removes the old sprite directory for each replaced ID before copying its complete new graph, avoiding orphaned pages from that replaced sprite.

There is one intentional difference between the full-export projection and current runtime dependency selection. All authored handoffs include eight UI PNGs per role: portrait/build × beauty/team × 1x/2x. **Current production `art-plugin.mjs` copies only the four UI@2x files; `ArtLibrary.composeCameo` and `planArtPreparation` request those same @2x pairs regardless of world quality.** World 1x and 2x atlases are independently required and stay included. The frozen v25 pack has no UI@1x entries.

The overlay adapter copies all eight authored UI files, and `writeBasePack` includes every file physically present in the product directory. Thus the planning upper deliberately adds 544 UI@1x files that current runtime consumers do not request. They are real authored exports, not duplicate file paths, and should remain untouched in their source handoffs.

If a future clean product follows the existing production runtime UI selection, its corresponding conservative count is 15,489 at the old boundary or **15,077 after IR fighter**, a 923-file margin. This is a source-supported packaging option, not a filter implemented by this review. Because the new all-eight count already fits, the parent explicitly deferred a new filtering implementation unless final assembly requires it. No original @1x UI export or either world quality has been removed.

Fixed audio provides no hidden surplus: 1,789 pack entries consist of 1,784 media paths explicitly referenced by the audio index (OGG plus MP3 fallback), the index itself and four required notice/license documents. Media codecs and legal notices must not be stripped to manufacture a pass. Other fixed categories are 204 raster-effect entries, 22 terrain, 97 content, 23 fonts, four Go runtime, 19 other UI and 53 app/other files; their current counts are held constant by this projection rather than proven final forever.

## Concrete integration gate

1. Finish and seal the remaining actual handoffs; replace only the corresponding conservative rows. Partial PNGs and an ID appearing in an old index do not certify a complete new asset.
2. Select one immutable current client/runtime with the integrated launcher pose/privacy logic. Stage a **new** product directory and replace sprite graphs by exact ID. Keep original handoffs, all eight authored UI exports and all prior products immutable.
3. Preserve current packaging behavior unless an actual final count requires a deliberate runtime-closure selection. If UI@2x-only staging is chosen, use the existing advertised full/legacy key resolution separately for portrait and build, require both beauty/team files and retain world fallback dependencies when explicit UI is absent. A private successor must test missing required @2x files as hard failures and verify both world qualities still close.
4. Traverse the assembled art index recursively through every sprite sidecar, every atlas and image, all advertised UI pairs, terrain and effect graph; validate audio descriptors and all ordinary app/runtime/content/license dependencies. Reject missing references, duplicate destinations, stale unreferenced sprite pages and unsafe paths. Hash exact served files against their sealed sources. The current `writeBasePack` directory walk alone is not a complete reachability audit.
5. Generate the final index/version and manifest from the exact assembled files. Keep the 16,000-file, 2 GiB aggregate, 128 MiB file and 4 MiB captured-manifest limits. Count the pack's own manifest separately as the fetched index rather than adding a self-reference. Verify the actual final bytes and browser quota; pose/file estimates cannot establish encoded-byte fit.
6. Preserve install/reload/active-generation isolation and cold offline acceptance on that exact product. A proposed split into faction packs is **not** currently a zero-code fallback: `artGenerationInput` chooses the pack whose manifest is `/assets/packs/base.json`, and `ArtLibrary` binds its graph to that generation. Splitting gameplay art would require an explicit multi-pack dependency/generation design and tests before being claimed compatible.

No new filter, increased limit, omitted role, asset mutation or final release acceptance follows from this audit. Later fixed-file additions or changed canvases/states must update the bound rather than consume the margin invisibly.
