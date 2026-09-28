# Preserved first placement diagnostic — unsupported preview API

This separate test-only source attempted to reconstruct the exact 830 accepted
batches from the failed SY03 budget pilot. No tactic or production file changed.
At tick 1,839 it successfully exported the authorized owner view, then stopped
with `unsupported_candidate`: this frozen engine's `PreviewCandidates` endpoint
does not support Build. That is a diagnostic harness API error, not a new
mission defeat or a placement rejection. The failure cleanup also preserved
the then-unfinished state. No completed trace equality is claimed for this run.

Run: `runs/20260928T205132Z-sy03-placement-diagnosis/`.
Source lock `83273ff7ab73e939cfa641e8993b6f05bd77bf01abc716f3cd30a3c95b37b341`;
binary `33fe13c82cae02e73c3430e3b462b6ad8f265033b0e5aa0cb341b29233f642d1`.
Both reverified unchanged. Build 2.531 s, diagnostic 1.673 s process, shared
host; no timing acceptance. The source and failure remain intact.

The separate `../runtime-034-territory-placement-v2/` corrects only the probe
to one ordinary `PreviewOrders` call per intended Build and proves complete
trace equality. It never treats `indeterminate` as known legal placement.
