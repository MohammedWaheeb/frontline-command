package viewproto

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"google.golang.org/protobuf/proto"
)

// This source-matched corpus comes from the paid public hauler controls/damage
// tests. The eight retained path inputs have seven distinct byte hashes: the
// two damage branches began from the same normal initial state. No artificial
// state or duplicated files are used to meet a generic coverage threshold.
func TestPlayerHaulerActualSavedContract(t *testing.T) {
	fixtures := []struct{ name, sha string }{
		{"TestPlayerHaulerDamageOptInPublicPaidDelivery-default_continue/default-continues-after-damage.save.json", "c7f208aa4fa0329aa06843298b1ef31dddc57ba6c4bad77f45724ea6d0449d16"},
		{"TestPlayerHaulerDamageOptInPublicPaidDelivery-default_continue/initial.save.json", "8fac6ba85b5906361c496dbb39cc8179e1cd0865dd524155913a51dadff025ef"},
		{"TestPlayerHaulerDamageOptInPublicPaidDelivery-opt_in_retreat/initial.save.json", "8fac6ba85b5906361c496dbb39cc8179e1cd0865dd524155913a51dadff025ef"},
		{"TestPlayerHaulerDamageOptInPublicPaidDelivery-opt_in_retreat/retreat-delivered-and-resumed.save.json", "7bca3a7e5c3774bef596e2f69aab2cc4e24a651b068d7415277121dec0ce94e0"},
		{"TestPlayerHaulerDamageOptInPublicPaidDelivery-opt_in_retreat/retreat-in-progress.save.json", "f3eef2fa19445bab82e300b48a304e2f68da9ff228551fac26c120df76ad270c"},
		{"TestPlayerHaulerEndpointPinsPublicOrdersRestoreReplay/chosen-controls.save.json", "68df89448c83430924b3215eb5e5e5e7111e62c6328cbe9ee548355394589cf8"},
		{"TestPlayerHaulerEndpointPinsPublicOrdersRestoreReplay/continued-controls.save.json", "08dc2aca191fe5e0138d023aafae971d2ff7d16a60ea0d7e19d57e5633bd934a"},
		{"TestPlayerHaulerEndpointPinsPublicOrdersRestoreReplay/initial.save.json", "443e98d01cc7f2c7d91b54af5b00c25f3dfa57fa2f63aafea180f10ab0a42bb2"},
	}
	dir := os.Getenv("FRONTLINE_HAULER_SAVE_DIR")
	if dir == "" {
		t.Skip("requires sealed exact-source paid hauler save corpus")
	}
	switch sim.Version {
	case "0.3.5":
		// Keep the original version-matched historical byte pins.
	case "0.3.6":
		fixtures = []struct{ name, sha string }{
			{"TestPlayerHaulerDamageOptInPublicPaidDelivery-default_continue/default-continues-after-damage.save.json", "8758389f27565aeedf7118d6f2488adfd288dfbc1e51d5bdabdc6fa436287a0d"},
			{"TestPlayerHaulerDamageOptInPublicPaidDelivery-default_continue/initial.save.json", "01e9ce1566b4209f22da459fde5813e9e762987001ecea117c9b84a71487ebdb"},
			{"TestPlayerHaulerDamageOptInPublicPaidDelivery-opt_in_retreat/initial.save.json", "01e9ce1566b4209f22da459fde5813e9e762987001ecea117c9b84a71487ebdb"},
			{"TestPlayerHaulerDamageOptInPublicPaidDelivery-opt_in_retreat/retreat-delivered-and-resumed.save.json", "b200d6e29c6cd8ae5ca260c7e2ea15c88250550e8ad16603d900e54c6c8fe7d2"},
			{"TestPlayerHaulerDamageOptInPublicPaidDelivery-opt_in_retreat/retreat-in-progress.save.json", "c9115e62445d1f82c217c1c89bb51a23ef7bcd053524feec5b4f55e228713a13"},
			{"TestPlayerHaulerEndpointPinsPublicOrdersRestoreReplay/chosen-controls.save.json", "77c0312cecdabb78d475a0501dfc678f612b26a2b285650f8312aa67336d6d6b"},
			{"TestPlayerHaulerEndpointPinsPublicOrdersRestoreReplay/continued-controls.save.json", "fcc8f4a639ab7c135d4c835887858178cd8aa926642b47a240a1cf536d8c65b7"},
			{"TestPlayerHaulerEndpointPinsPublicOrdersRestoreReplay/initial.save.json", "9edd60c848edd4e3804a9017c883bba2ee010f41a6bb50aba0a66791d5a3263e"},
		}
	case "0.3.7":
		// Raw current-source producer outputs from hauler037-producer-01; historical rows remain unchanged.
		fixtures = []struct{ name, sha string }{
			{"TestPlayerHaulerDamageOptInPublicPaidDelivery-default_continue/default-continues-after-damage.save.json", "a922d127b8bb913127d464f947cb70edcfe0aca3e117455de2d86066f63b9757"},
			{"TestPlayerHaulerDamageOptInPublicPaidDelivery-default_continue/initial.save.json", "5eb70f56978d73a61f0f15bc26258d9d3745101b1ae7b96230f922d0917be23c"},
			{"TestPlayerHaulerDamageOptInPublicPaidDelivery-opt_in_retreat/initial.save.json", "5eb70f56978d73a61f0f15bc26258d9d3745101b1ae7b96230f922d0917be23c"},
			{"TestPlayerHaulerDamageOptInPublicPaidDelivery-opt_in_retreat/retreat-delivered-and-resumed.save.json", "ce56f874f1d7dba1edc84d9fecab7e16e1eb976b1c292f3fbf4227febbbafd1e"},
			{"TestPlayerHaulerDamageOptInPublicPaidDelivery-opt_in_retreat/retreat-in-progress.save.json", "b798cdca8adfa3615f448a82e5189a2231cce3afa3d275c947b09d24a51e7fbc"},
			{"TestPlayerHaulerEndpointPinsPublicOrdersRestoreReplay/chosen-controls.save.json", "24e1e351db01bbbaf193bf1e0e39a9ff20b425516184cd7bb0f72e0555e9f2cf"},
			{"TestPlayerHaulerEndpointPinsPublicOrdersRestoreReplay/continued-controls.save.json", "853852d8b5382fb88364a2bab05cf862f7dacd78951ab3fc8fa988779271a1e6"},
			{"TestPlayerHaulerEndpointPinsPublicOrdersRestoreReplay/initial.save.json", "da0a7980c4af0218bfce828ab732260abe9a50152e54dca11eaf390d95e8d75a"},
		}
	case "0.3.8":
		// Exact earned Core26 fresh-hauler-identity-01 native outputs; historical rows remain unchanged.
		fixtures = []struct{ name, sha string }{
			{"TestPlayerHaulerDamageOptInPublicPaidDelivery-default_continue/default-continues-after-damage.save.json", "d2142c7f1a8a5981bb4305e241c4c43f390976e58df9bdc0ee0a56231ec55958"},
			{"TestPlayerHaulerDamageOptInPublicPaidDelivery-default_continue/initial.save.json", "ada59a5b60c199db91f0c1956e3b86a9696902820cfc7f84006689bbd76ad1a3"},
			{"TestPlayerHaulerDamageOptInPublicPaidDelivery-opt_in_retreat/initial.save.json", "ada59a5b60c199db91f0c1956e3b86a9696902820cfc7f84006689bbd76ad1a3"},
			{"TestPlayerHaulerDamageOptInPublicPaidDelivery-opt_in_retreat/retreat-delivered-and-resumed.save.json", "fd85c407d22498d771650dbaf08bc424a13ae29704de0c6615757f33428aa84d"},
			{"TestPlayerHaulerDamageOptInPublicPaidDelivery-opt_in_retreat/retreat-in-progress.save.json", "ac8bb840fd55d3680292d03ceb0deaa0cfd8a77cb5f00244d876d56730df3f05"},
			{"TestPlayerHaulerEndpointPinsPublicOrdersRestoreReplay/chosen-controls.save.json", "71c3331af0d558d1d2f7a8f5b3975f607d8516136c3deec00bd5458a9daa6b49"},
			{"TestPlayerHaulerEndpointPinsPublicOrdersRestoreReplay/continued-controls.save.json", "b6583f2b83b0301fd5eb428c706e8f7e213edca896da4f0f95456ecf431445a3"},
			{"TestPlayerHaulerEndpointPinsPublicOrdersRestoreReplay/initial.save.json", "ddb7901c63141e784f4897a98a4cfae8984f808dc339561e0af751a6c7952df1"},
		}
	default:
		t.Fatal("unsupported simulation version for sealed hauler corpus", sim.Version)
	}
	presence := map[string]bool{
		"field": false, "depot": false, "pinned_field": false,
		"pinned_depot": false, "preference_on": false,
		"default_off": false, "retreating": false, "cargo": false,
		"own_reservation": false, "known_fields": false,
	}
	hashes := map[string]bool{}
	views := 0
	for _, fixture := range fixtures {
		data, err := os.ReadFile(filepath.Join(dir, fixture.name))
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(data)
		actual := hex.EncodeToString(sum[:])
		if actual != fixture.sha {
			t.Fatal("sealed actual save changed", fixture.name, actual)
		}
		hashes[actual] = true
		engine, err := sim.Restore(content.MustBase(), data)
		if err != nil {
			t.Fatal("source-matched save rejected", fixture.name, err)
		}
		before := engine.Hash()
		for _, player := range engine.StateCopy().Players {
			view, ok := engine.PlayerView(player.ID)
			if !ok {
				t.Fatal("missing actual owner view", fixture.name, player.ID)
			}
			if !reflect.DeepEqual(view.KnownFields, player.KnownFields) {
				t.Fatal("owner observation disclosure differs from saved owner knowledge", fixture.name, player.ID)
			}
			presence["known_fields"] = presence["known_fields"] || len(view.KnownFields) > 0
			for _, entity := range view.Entities {
				private := entity.Private
				if private == nil {
					continue
				}
				if entity.Owner != player.ID {
					t.Fatal("private endpoint/cargo data disclosed to another player", fixture.name, player.ID, entity.ID)
				}
				if entity.Type != "US.hauler" {
					continue
				}
				presence["field"] = presence["field"] || private.Field != 0
				presence["depot"] = presence["depot"] || private.Depot != 0
				presence["pinned_field"] = presence["pinned_field"] || private.PinnedField != 0
				presence["pinned_depot"] = presence["pinned_depot"] || private.PinnedDepot != 0
				presence["preference_on"] = presence["preference_on"] || private.RetreatWhenAttacked
				presence["default_off"] = presence["default_off"] || (!private.RetreatWhenAttacked && !private.Retreating)
				presence["retreating"] = presence["retreating"] || private.Retreating
				presence["cargo"] = presence["cargo"] || private.Cargo > 0
				presence["own_reservation"] = presence["own_reservation"] || (private.HarvestQueuePosition > 0 && private.HarvestQueueLength >= private.HarvestQueuePosition)
			}
			got, want := Snapshot(view), jsonSnapshot(t, view)
			if !proto.Equal(got, want) || !bytes.Equal(wire(t, got), wire(t, want)) {
				t.Fatal("actual saved hauler binary/JSON view differs", fixture.name, player.ID)
			}
			detached := wire(t, got)
			erase(reflect.ValueOf(&view).Elem())
			if !bytes.Equal(detached, wire(t, got)) {
				t.Fatal("actual saved hauler snapshot aliases its input", fixture.name, player.ID)
			}
			views++
		}
		if engine.Hash() != before {
			t.Fatal("actual saved view/conversion changed simulation state", fixture.name)
		}
	}
	if len(hashes) != 7 || views != 16 {
		t.Fatal("unexpected sealed corpus coverage", len(fixtures), len(hashes), views)
	}
	for key, observed := range presence {
		if !observed {
			t.Error("required real saved hauler state absent", key)
		}
	}
	t.Logf("%d sealed actual save inputs (%d distinct byte hashes), %d owner views: state presence, privacy, detached binary/JSON parity", len(fixtures), len(hashes), views)
}
