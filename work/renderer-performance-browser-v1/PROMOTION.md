# Renderer source recommendation

Recommend parent-controlled promotion of exactly the following three private files after normal integration review. No live files were edited by this agent. The private fighter overlay is acceptance data and is not included in this source promotion.

| Live target | Exact candidate | Live baseline SHA256 | Candidate SHA256 |
|---|---|---|---|
| `client/src/render/art.ts` | `work/renderer-performance-v1/combined-candidate/client/src/render/art.ts` | `d4a4049fb2d9192fe13fff01f6725c2521dbd6382992cb8e9dfc41cc1822ce7a` | `ea018ee1df9aaddb3a42b34d530cf188929049bc551a47ebef809990a5ce49f8` |
| `client/src/render/battlefield.ts` | `work/renderer-performance-browser-v1/memory-label-v1/candidate-battlefield.ts` | `b0ac869e0e825bc11cd934ebfb781a588aa04bc68a4a1041b470818a49a6196c` | `259e490c099a7f1b67e22bece69ba6f1cab6a443839a47d96500eddd77d2648f` |
| `client/src/render/terrain.ts` | `work/renderer-performance-v1/combined-candidate/client/src/render/terrain.ts` | `6820e55a251ea711e3121033c0f5264ad46c3cb1832a2064a4c511d27d3c3788` | `de219a85e70a1cb9ed02ec41ab7eb7d3e40a780fa375649eac16ffc8a5d0c005` |

The battlefield candidate reverses exactly to prior performance SHA `60a925f92a6a15d68a837c75b56a1d3148f48738d04cda79e94c1cbcb8b7069a` after undoing only the remembered-root Container ownership and inherited-alpha change. No other logic differs. The ArtLibrary completed-frame trim remains after tactical/minimap reads at the existing60-frame cadence. Terrain topology, fog alpha, geometry, picking tolerance, per-frame two-bake budget and prefetch margins are unchanged.

Evidence supports bounded promotion:

- Both TypeScript projects and498 runtime tests pass for this final exact set (`final-validation-01/result.json`);247 copied inputs unchanged.
-23 strict native comparisons preserve synthetic terrain seams/fog/depth, warmed pending views and the initial actual-art rifle view. The original actor reentry freeze is reproduced; candidate rifle alpha picking/native click pass.
-5 further strict native comparisons preserve the actual reviewed fighter initial view and4 remembered-label views. Actual fighter reentry/native click and authorized earlier-snapshot absence pass. Proper remembered-root Container emits no child warning and preserves alpha/geometry/native pixels.
-2 pressure comparisons have0 changed pixels/channels. Real decoded atlas residency218,135,092→199,663,636 bytes,14 current-painted pages protected,7 exact LRU victims destroyed/closed, real page reload and actor picking pass. Decoded pages do not establish total GPU allocation. Reload briefly exceeds the192MiB soft target; active/pending pages are also allowed to exceed it.
- Source admission/caller/lifetime tests and native pending call counts remain separate from timing: on the96² center course the first required chunk appears at render call1 versus4, and all14 required chunks at7 versus15. No FPS or wall-clock claim.

Strict browser receipts remain **FAILED** from retained raw aborted requests and, on old variants, the real remembered-label warning. `chrome-01`, `chrome-02`, the supplement's failed initial pressure setup, and the first overbroad opacity review remain preserved. The final Container native views specifically resolve the ownership warning without suppression. These facts do not authorize rewriting historical strict statuses.

There is no claim of complete162-role art, ordinary App all-feature acceptance, new Go cadence validation from these older captured snapshots, multiplayer/endurance,256² native coverage, total GPU/JS memory, or reference-hardware FPS. Parent's ordinary App evidence and separate UI/fog work remain separate. No fog MAX/min-fill proposal is included here.
