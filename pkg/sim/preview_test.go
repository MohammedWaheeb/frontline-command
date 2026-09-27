package sim

import "testing"

func TestOrderPreviewIsAdvisoryAndDoesNotChangeMatch(t *testing.T) {
	e := fixture(t)
	issue(t, e, 1, Order{Kind: "stop", Entities: []ID{2}})
	before := e.Hash()
	orders := []Order{{Kind: "build", Entities: []ID{2}, Type: "power", Position: Vec{X: 13000, Y: 13000}}}
	results, err := e.PreviewOrders(1, orders)
	if err != nil || len(results) != 1 || !results[0].Accepted {
		t.Fatal("valid preview", results, err)
	}
	if e.Hash() != before || e.player(1).LastSequence != 1 {
		t.Fatal("preview mutated live match")
	}
	e.player(1).Credits = 0
	results, err = e.PreviewOrders(1, orders)
	if err != nil || results[0].Code != "insufficient_credits" {
		t.Fatal("preview ignored current resources", results, err)
	}
	before = e.Hash()
	_, err = e.PreviewOrders(1, []Order{{Kind: "move", Entities: []ID{4}, Position: Vec{X: 24000, Y: 20000}}})
	if err == nil || e.Hash() != before {
		t.Fatal("preview bypassed ownership or mutated match", err)
	}
}
