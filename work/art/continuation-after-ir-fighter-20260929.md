# Serial export continuation after IR fighter

This snapshot supplements the immutable earlier preparation plan. Work in `/Users/mohammedkalouti/Documents/Codex/2026-09-27/i`; the default `dev/game` directory is not this repository. Keep one Blender process with four threads. All exports below are private, already-authorized unchanged source work, with per-asset integrity, UI and native review still required.

SA launcher688, replacement US rifle200 and IR fighter832 are complete. Their exact handoffs are included in `roster-runtime-overlay-v1/catalog-v54-v1/result.json`: 54 handoffs, 2,786 files, 494,146,422 bytes and 15,137 poses. The separate 48 older base assets have a read-only current-byte/historical-lineage audit at `base-only-lineage-audit-v1/result.json`. They are not new handoffs. Together with the old reference base the graph has102 of162 unit/building/prop IDs; it is not a newly built product or final visual certification.

IR gunship832 is currently rendering in `aircraft-final-production-v3` under the same approved a8207d model and 8c3f streaming packer. Driver session34915 began after the parent released the server timing window at approximately17:13UTC. At17:31:55UTC it had528 required complete raw tuples. Recheck actual processes and `progress.py`; this is a historical checkpoint, not a current completion claim.

After every whole asset:

1. Require driver exit0, exact `FC_RENDER_DONE`, complete packing, world/UI reports with zero failures and generated contact pages. A Blender exit code alone is insufficient.
2. Inspect every native1x page and paired UI. Record exact image hashes and honest limitations. Aircraft review belongs in the top-level `contacts/ID/native-review.json` with `accepted:true`; ground review belongs in the staged family contact directory with `accepted_bounded_export:true`; building review belongs in the top-level contact directory with that same bounded key.
3. Run the correct family handoff script: aircraft `make-runtime-handoff.py ID`; ground/building `make-handoff.py ID`. Preserve all original exports, source locks and failed evidence. Do not modify an already sealed handoff to add later review.
4. Validate the exact graph with `overlay-v3.mjs --check`. The historical v25 base is read-only inventory context; actual integration must explicitly select a current compatible base. Do not silently replace the old43-asset generic-launcher product.
5. Append the completed handoff to a fresh catalog with `append-handoff-catalog.py`, retaining the prior catalog. Recompute the offline file projection with all prior exact substitutions plus the new handoff. The current all-eight-UI conservative upper is15,621 files; the installer remains limited to16,000 files and2GiB. Pending estimates and later fixed-pack changes remain uncertain.
6. Start the next approved whole asset once no Blender/packer remains and no explicitly coordinated quiet window is active. Native review and metadata work may run alongside the next already-approved source export when the parent has released that queue.

Remaining order is seven aircraft (including active IR gunship), then21 ground units, then32 buildings. Their exact IDs, spec hashes and pose counts are in catalog54's `remaining_families`:5,616 aircraft poses,5,584 ground poses and1,614 building poses. Use one ID per driver invocation:

```sh
zsh work/art/aircraft-final-production-v3/run-staged.sh ID
zsh work/art/vehicle-final-production-v1/run.sh ID
zsh work/art/building-final-production-v1/run.sh ID
```

Aircraft order after IR gunship: IR ISR, SA fighter, SA gunship, SA strike, SY scout drone, US strike. Frozen model/spec ownership remains unchanged. Do not rerender completed fighter, airlift, US gunship, launchers, rifle or HQ corrections merely to unify stage names.

Stop on a new defect and preserve its output. If an interrupted process has disappeared, audit its actual raw tuple state and logs before deciding a bounded continuation; never erase the existing full log to bypass the driver's no-overwrite guard. UI normalization remains private under `normalized-current53-v1`, pinned to exactly53 handoffs and212 masks; it is not automatically applicable to newly completed aircraft or published in any existing product.
