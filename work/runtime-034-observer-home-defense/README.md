# IR06 observer route: visible home defense

One Normal pilot adds the same ordinary home-threat priority already used by other assault routes, scoped only to Normal/Hard observer-network. The prior fatal owner view shows armed opponents at home while newly paid rifles march to the distant barracks. The old rule ignores threats near own actors south of Y=70000. Only currently visible armed enemies within 22 tiles of home may redirect the attack. Existing production, observation dispatch, waits, resources and all completion gates are unchanged. Prior failures remain intact.

Shared-host correctness only. No production/content change.

Outcome: **optional FAIL**, ordinary main victory at13116. Both original observers remain alive at full health inside their home APCs. Home production survives, but dispatch incorrectly waits for every original enemy production building; the airfield still exists when nearby troops autonomously finish the HQ. This is an overly strict commander sequencing gate, not an authored requirement. Full success-only replay gates were not reached. Source/binary verification and fatal cleanup save/view/ledger pass. Next isolated tactic should dispatch after the two public outer positions are actually visibly cleared, retaining the current safe-point/escort/unload checks.
