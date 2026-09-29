# Third native UI course: fractional scroll endpoint

At720p/150%, the recorded native End position is2642px while the separately rounded `scrollHeight-clientHeight` is2641px. End reached the browser's constrained endpoint; the absolute-distance assertion rejected a position one pixel beyond its rounded estimate. Extending the wait did not change this and is not a fix.

The next fixture checks the directional fact `scrollTop >= scrollHeight-clientHeight` for End, with no tolerance added. Home remains exactly zero. This does not synthesize a key, change scroll position, change source or loosen any pixel/privacy comparison; it corrects the invalid assumption that rounded extent subtraction must equal the browser's fractional native scroll limit. Raw failed reports and the3s timeout remain preserved.
