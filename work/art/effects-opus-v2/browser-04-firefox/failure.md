# Preserved expanded-pause oracle failure

The first Firefox course failed the old whole-report deep comparison after the new fixture added actual muzzle attachment positions. The manual Go simulation stayed at the same tick/hash and cue/clip phase. The pre-existing actor renderer continued its wall-clock recoil/idle pose, and the new attachment correctly followed that painted pose by fractions of a pixel. No page, console or HTTP errors occurred.

The successor driver compares the unchanged authoritative report, cue identity, selected variants and effect frame indices, excluding actor attachment/sprite transforms from the claim that manual stepping is held. It does not claim actor animation freezes on pause. The actual fallback/recoil/alias attachment test checks the displayed-frame mapping separately. Original report, driver, fixture, log and failure image remain unchanged.
