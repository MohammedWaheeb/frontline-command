# Private UI and renderer integration

Four Claude-authored UI files and three separately reviewed renderer candidates are frozen together. Both TypeScript checks and all498 runtime tests pass;247 live inputs remain exact. The ordinary Vite entry is built with the original Go/WASM/art package. No live source or asset is modified.

The builder restricts emitted paths to index/manifest and the single-level assets namespace. Any non-code decoration must match original package bytes, so future Vite output cannot overwrite art, runtime or content. It verifies source closure, exact non-client files and closed versioned package inventory.

The separate native display course passes56 functional checks while retaining strict89 raw abort failures. See ../ui-polish-native-v1/README.md. This private build has incomplete art and is not a release. The scoped seven-file changes and all exact build identities are in build-01/receipt.json; compact evidence is readback-verified under evidence/.
