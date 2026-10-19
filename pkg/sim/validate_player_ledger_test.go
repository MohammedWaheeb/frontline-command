package sim

import "testing"

// Fabricated saves must not smuggle economy state that legitimate play can
// never produce (duplicate upgrades, negative ledger totals) through
// Restore into shared co-op lobbies.
func TestRestoreRejectsFabricatedPlayerLedger(t *testing.T) {
	cases := map[string]func(*Player){
		"duplicate_upgrade": func(p *Player) {
			p.Upgrades = []string{"vehicle_armor", "vehicle_armor"}
		},
		"negative_spent":  func(p *Player) { p.Spent = -5000 },
		"negative_income": func(p *Player) { p.Income = -5000 },
	}
	for name, tamper := range cases {
		t.Run(name, func(t *testing.T) {
			e := fixture(t)
			tamper(e.player(1))
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			if _, err := Restore(e.catalog, saved); err == nil {
				t.Fatal("fabricated player state restored without error")
			}
		})
	}
	// The untampered baseline (one legitimate upgrade) still restores.
	e := fixture(t)
	e.player(1).Upgrades = []string{"vehicle_armor"}
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Restore(e.catalog, saved); err != nil {
		t.Fatal("legitimate save rejected", err)
	}
}
