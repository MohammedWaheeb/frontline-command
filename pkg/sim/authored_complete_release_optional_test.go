package sim_test

import "testing"

// These seventeen extra release courses add positive named optional assertions
// without redefining the original 133 courses. Commanders, starting rules,
// mission content and wait budgets are unchanged. Failure is retained whenever
// the original commander wins without earning its optional award.
func TestAuthoredOptionalCompleteReleaseGaps(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated positive release optional gap courses")
	}
	cases := []struct {
		mission, difficulty, optional string
		play                          func(*authoredRun)
	}{
		{"ir-04-hold-the-network", "hard", "no-emergency-loss", playCampaignDefense},
		{"sa-04-intercept-window", "easy", "clean-interception", playCampaignDefense},
		{"sa-04-intercept-window", "hard", "clean-interception", playCampaignDefense},
		{"sa-05-three-positions", "easy", "service-preserved", playCampaignAssault},
		{"sa-05-three-positions", "normal", "service-preserved", playCampaignAssault},
		{"sa-05-three-positions", "hard", "service-preserved", playCampaignAssault},
		{"sa-06-shieldline", "normal", "connected-routes", playCampaignAssault},
		{"sa-06-shieldline", "hard", "connected-routes", playCampaignAssault},
		{"sy-06-open-road", "easy", "no-lost-raid", playCampaignAssault},
		{"sy-06-open-road", "normal", "no-lost-raid", playCampaignAssault},
		{"sy-06-open-road", "hard", "no-lost-raid", playCampaignAssault},
		{"us-05-split-front", "easy", "no-transport-loss", playCampaignAssault},
		{"us-05-split-front", "normal", "no-transport-loss", playCampaignAssault},
		{"us-05-split-front", "hard", "no-transport-loss", playCampaignAssault},
		{"us-06-clear-horizon", "easy", "site-before-launch", playCampaignAssault},
		{"us-06-clear-horizon", "normal", "site-before-launch", playCampaignAssault},
		{"us-06-clear-horizon", "hard", "site-before-launch", playCampaignAssault},
	}
	for _, entry := range cases {
		t.Run(entry.mission+"/"+entry.difficulty, func(t *testing.T) {
			r := newAuthoredRun(t, entry.mission, entry.difficulty, "")
			r.evidenceSuffix = "-complete-release-optional-" + entry.optional
			r.requireCampaignOptionals = true
			// Verify exact unchanged authored identity before any commander orders.
			found := false
			for _, goal := range r.definition.Objectives {
				if goal.ID == entry.optional && goal.Optional && !goal.Failure {
					found = true
				}
			}
			if !found {
				t.Fatal("named authored optional missing", entry.optional)
			}
			entry.play(r)
		})
	}
}
