# Preserved Chromium01 failure: interpolation outside a covered triangle

Root ran the first browser course. `chromium-01/browser.json` preserves the
failure: flat edge, zoom0.45, offset0 has112 pixels changing alpha175→174,
maximum drop1, zero unknown255 losses. Flat corner cases also fail (84 pixels
at offset0;4 at offset0.375). All-uniform-explored cases pass. No tolerance was
relaxed and no source was changed to pass the result.

The actual renderer is ANGLE Metal on AppleM4. Both returned fragment precision
records (`medium` and `high`) have23 mantissa bits and127 exponent range. Thus
the evidence does not support blaming a minimum-mediump implementation.

Pixi's default batch shader declares ordinary interpolated `vUV`, without
`centroid`. Its `GenerateTextureSystem` sets antialias from the active renderer,
which this fixture initializes to true. Under multisampling, a covered primitive
can shade using a pixel-centre interpolation point outside that primitive. The
handoff's convex-interpolation premise then does not apply.

At the first failed pixel centre(1044.5,363.5), the fixture's exact flat camera
inverse is ground tile coordinates(18.4826388889,1.5034722222). In tile(18,1):

| Fan | Pixel-centre barycentrics | Vertex alphas | Extrapolated ramp texel |
|---|---|---|---|
|0 |1.0069444444,0.0138888889,-0.0208333333 |175,175,255 |173.5833333 |
|1 |1.0347222222,-0.0208333333,-0.0138888889 |175,255,255 |172.4722222 |
|2 |0.9930555556,-0.0138888889,0.0208333333 |175,255,175 |174.1388889 |
|3 |0.9652777778,0.0208333333,0.0138888889 |175,175,175 |175.25 |

These are analytic calculations from actual source geometry and the recorded
failed pixel, not a new browser run or a measurement of exact GPU sample
locations. They establish the permitted extrapolation mechanism and explain
why mixed gradients fail while constant-value triangles do not. A quarter-texel
bias cannot cover arbitrarily steep projected gradients, particularly skinny
cliff triangles; simply increasing it is not a geometry-independent proof.

Smallest conservative candidate: leave every base175/255 triangle constant at
its original opacity; feather only triangles whose old base is0. This gives up
explored→unknown feathering while preserving the visible-side feather and the
current public API/mesh structure. Preserve constant-alpha sampling carefully
and rerun the **unchanged strict alpha gate**; this proposal is not yet a pass.

A full explored→unknown feather would need centroid-qualified interpolation
and validation, or an explicit fragment floor from a non-interpolated triangle
base. That needs shader/batch scope beyond a texture-coordinate-only fix. An
unchanged baseline fog layer plus a nonnegative extra fog layer is another
conservative construction, at additional draw/mesh cost. Root is coordinating
the bounded successor; this lane has edited neither candidate nor live renderer.
