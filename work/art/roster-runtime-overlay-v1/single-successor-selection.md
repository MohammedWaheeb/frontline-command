# Single handoff successor selection

`replace-handoff-catalog.py` prepares a **new** catalog after a completed successor has its full exact handoff. It requires the explicitly expected old handoff SHA, verifies that the same ID exists exactly once, and rejects a no-op selection. It preserves a separate `*-selection.json` receipt containing the old selection and both input hashes, then invokes the unchanged strict append/graph adapter. Every unrelated selected row must remain byte-equivalent as JSON data and the selected ID set must remain identical.

This is prepared for the accepted ISR service successor after its full export, copied-raw/hardpoint proof and native review. It has not selected the unfinished output. The existing catalogs and original ISR export remain immutable. It performs no product build, UI normalization or live publication.

Example invocation after those gates, using repository-relative paths and the then-current catalog:

```text
work/art/.venv/bin/python work/art/roster-runtime-overlay-v1/replace-handoff-catalog.py PRIOR_CATALOG/result.json NEW_CATALOG work/art/ir-isr-service-final-production-v1/runtime-handoff/unit.IR.isr.json --expected-prior-handoff-sha256 80ee0525cabb3136cfb340e235c57354e7c90115cc31ac31fb7f20764ff4df91
```

The final normalization receipt must match the new selection explicitly; current53 normalization does not cover ISR or the later aircraft.
