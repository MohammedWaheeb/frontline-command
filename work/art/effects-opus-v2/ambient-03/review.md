# Preserved numeric failure

This draft is rejected. Float32 sine at the clamped endpoint returned a tiny negative value, and fractional power produced NaN. Numpy warned during opacity and byte conversion. These outputs are not accepted even though packing finished.

The successor clamps sine nonnegative before fractional power and runs with Python warnings treated as errors. All original source, pixels and warning log remain preserved.
