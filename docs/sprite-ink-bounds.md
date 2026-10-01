# Sprite ink bounds

Sprite atlas frames may include `ink_bounds`, measured from the final packed image. The value is an integer rectangle `{x,y,w,h}` relative to that frame, or `null` for an empty frame. The normal frame rectangle, source size and anchor remain unchanged.

Beauty and team layers share the smallest rectangle containing every pixel with alpha at least1 in either layer. Shadows and other independent layers use their own alpha coverage. Each1×/2× export is measured independently. The atlas metadata records `fc-ink-bounds/1`, `frame_local_px`, alpha minimum1 and the contributing layer names. Shadows are never included in the body union.

The Go simulation does not consume these bounds. They describe painted sprite coverage for presentation only; they do not change collision radii, service parking, weapon range or aircraft scale.

The packer adds bounds after it writes the images and before it computes the export content hash. No image is cropped or resampled for this metadata. Existing exports can be migrated from their final PNGs by changing only atlas JSON and the truthful sidecar content hash.

The first migration covered67 existing exports and two independent staged aircraft exports:834 atlas descriptors and50646 checked frame/layer rectangles. All834 packed PNGs and25323 raw PNGs stayed byte-identical. Original aircraft stage-v1 stayed unchanged across3794 files. The migration used atomic whole-export directory exchanges and retained the previous outputs. See `work/art/sprite-ink-bounds/promotion-v1/README.md` and its machine-readable receipts for exact paths and hashes.

Eighteen pipeline tests pass, including metadata union/empty/scale/path cases, alpha downsampling and shadow cleanup. Representative original asset checks and the full product renderer regression also passed. These results establish this metadata contract; global performance, complete roster production and final artistic approval remain separate gates.
