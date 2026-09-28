# One corrected SA05 Hard route — passed

Executed once after the quiet four-player host and replay audit closed.
GOMAXPROCS=2; shared desktop with other source/art/menu work. Elapsed times
are diagnostic only. No production Go, content, objective, resource, or
existing wait limit changed.

- Source lock: `36630bbd299e85e976b04d1d9caccf3ad5e2dd8294ecefa9861cf36cdd3c4abd`
- Binary: `d4cbdab700893b940d57e5b22cb47561e66feb75355006a357858fbe587a7a39`
- Build 3.706 s; two focused tests 0.909 s; one mission 28.856 s.
- Ordinary team-1 mission victory at tick 11,965; all three relays and original
  Service optional complete. Failure objectives remain false.
- 634 batches, 661 orders, 661 `ok` execution receipts. No practice command or
  surrender in the victory trace.
- Final hash `912a1dac034109e5cc6d6f7b88fd37626fbf93ea117a7538122c917c478a777c`;
  paired midpoint branch at 1,157 and checkpoint-free full replay match.
- Fresh restart and separate ordinary-surrender failure/debrief/save/replay
  checks also pass. Surrender is not the victory path.

See `analysis.json` for counts and `evidence/sa-05-three-positions-SA-hard.json`
for actual objectives, debrief and full order/receipt ledger. The standard
success record does not export a separate final success save. Original failed
pilots and the frozen 93/102 main / 12/21 optional matrix remain unchanged.
