package sim

import (
	"strings"
	"testing"
)

func TestReplayLobbyPolicyIsInformationalDetachedAndValidated(t *testing.T) {
	e := fixture(t)
	r, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	r.Lobby = &ReplayLobby{Name: strings.Repeat("x", 100), Mode: "coop", Private: true, LiveObservers: true, PauseEnabled: true}
	initial := e.Hash()
	copy := r.LobbyInfo()
	copy.Name = "mutated"
	if r.Lobby.Name == copy.Name {
		t.Fatal("policy getter leaked mutable recorder state")
	}
	encoded, err := r.Encode()
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := DecodeReplay(encoded)
	if err != nil || loaded.Lobby == nil || *loaded.Lobby != *r.Lobby {
		t.Fatal("recorded policy changed", err)
	}
	restored, err := loaded.Seek(e.catalog, e.Tick())
	if err != nil || restored.Hash() != initial {
		t.Fatal("lobby policy affected simulation", err)
	}
	loaded.Lobby.Rated = true
	if _, err = loaded.Encode(); err == nil {
		t.Fatal("rated co-op/live observers accepted")
	}
	loaded.Lobby.Rated = false
	loaded.Lobby.Private = false
	if _, err = loaded.Encode(); err == nil {
		t.Fatal("public live observers accepted")
	}
}
