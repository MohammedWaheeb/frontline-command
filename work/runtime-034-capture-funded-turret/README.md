# Funded turret plan — no construction, nonterminal third capture

Source `637cf9b171e04fc476d846893b7e153469bd08ee93d4ecea156ee0b28ceeb161`;
binary `d61a99577799892345575a647d51fcfa679ac9513b43c723251a08a01a6eb7dc`.
Focused current-view placement, actual-cost reservation and repairer selection
checks pass. Factory capture 3399; owned rig is moved toward the front, ordinary
unpaid queues are cancelled once and actual turret cost is reserved temporarily.
No turret starts: the rig dies by 5100 and the plan correctly releases its
reservation. Relay2 captured6252; third force ready7185. Its engineer is later
lost and the original 2400 replacement wait expires at11188, still nonterminal.
Factory79 remains1000 health; relays70/73 are owned1000/866. Income has collapsed.
Engineer45 remains alive at the full-health factory. The outer-stage worker
selector supports safe reassignment, but mid-capture replacement only trains.

A separate next driver reuses that same current-view selector during replacement,
with ordinary Move/capture and the original2400 wait. No free engineer, revival,
extra cash/time or engine change. Exact nonterminal view/save/ledger and source
identities remain retained. The main Hard policy is unaffected by optional-only
fortification and remains independently certified in `../runtime-034-capture-main-route`.
