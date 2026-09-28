# Optional Hard explicit rifle counter-siege — nonterminal capture failure

Source3b82573b86f18e8198d1b1b9ef36f08d47fc058bfaaa4bde497be10666de3a81,
binary75de826a6181085245566adbb0e8555322cdb1b6796741fa2d1ed5dfc9f11054.
The route actually captures factory at3203 and retains it at941health, relay1
at1000health and functioning income. It fails its original6000-tick capture
fire-control wait at11168: relay2 is still hostile at577health; no defeat has
occurred. Most advancing armor is lost. This policy reacts to visible AT within
14tiles with rifle Attack then queuedGuard, while tanks/AT retain Guard. Final
views show first-site rifles engaging well forward of their own protected site.
The full failure ledger/source/save/view remain unchanged. Next bounded variant
returns to Guard-only and places rifles a short distance toward visible siege,
using its existing leash instead of an explicit target pursuit.
