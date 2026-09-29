package sim

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"
)

func signedState(s State) []byte {
	b, _ := json.Marshal(s)
	sum := sha256.Sum256(b)
	envelope, _ := json.Marshal(saveEnvelope{Version: 1, SHA256: hex.EncodeToString(sum[:]), State: b})
	return envelope
}
func TestRestoreRejectsStructurallyCorruptState(t *testing.T) {
	e := fixture(t)
	for _, mutate := range []func(*State){func(s *State) { s.Fields = append(s.Fields, nil) }, func(s *State) { s.Projectiles = append(s.Projectiles, nil) }, func(s *State) { s.Entities[0].Jobs = []Job{{Type: "US.rifle", Required: 0}} }, func(s *State) { s.Entities[0].Passengers = []ID{9999} }, func(s *State) { s.Operations = []Operation{{Kind: "second_volley", Owner: 1}} }, func(s *State) { s.Pending = []Scheduled{{Tick: 1, Player: 99, Orders: []Order{{Kind: "move"}}}} }} {
		s := e.StateCopy()
		mutate(&s)
		if _, err := Restore(e.catalog, signedState(s)); err == nil {
			t.Fatal("corrupt checksummed state accepted")
		}
	}
}
func FuzzRestoreSignedState(f *testing.F) {
	e := fixture(f)
	seed := e.StateCopy()
	for kind := uint8(0); kind < 8; kind++ {
		f.Add(kind, uint32(0))
	}
	f.Fuzz(func(t *testing.T, kind uint8, value uint32) {
		b, _ := json.Marshal(seed)
		var s State
		json.Unmarshal(b, &s)
		switch kind % 8 {
		case 0:
			s.Entities[0].Cargo = int64(value)
		case 1:
			s.Entities[0].MaxHP = int64(value)
		case 2:
			s.Entities[1].Position.X = int32(value)
		case 3:
			s.Entities[1].Endurance = value
		case 4:
			s.Players[0].Energy = int64(value)
		case 5:
			s.Entities[0].Jobs = []Job{{Type: "US.rifle", Required: value, Work: value}}
		case 6:
			s.NextID = ID(value)
		case 7:
			s.Operations = []Operation{{Kind: "second_volley", Owner: 1, Points: []Vec{{X: int32(value), Y: 1000}}}}
		}
		restored, err := Restore(e.catalog, signedState(s))
		if err == nil {
			restored.Advance()
		}
	})
}
