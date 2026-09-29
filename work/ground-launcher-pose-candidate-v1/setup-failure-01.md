# Preserved setup failure

Initial preparation copied the frozen src tree, then failed because integration-v24 does not include package.json. No test or browser ran. Subsequent private candidate edits were retained. Setup recovery copies current dependency/config files with independent hashes; frozen rendering source stays the v24 baseline.
