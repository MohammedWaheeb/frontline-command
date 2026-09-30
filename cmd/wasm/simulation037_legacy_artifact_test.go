//go:build !(js && wasm)

package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"

	"frontlinecommand/pkg/sim"
)

const compat037LegacyContent = "318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612"

type compat037Original struct {
	name, simulation, path, sha256 string
	bytes                          int
	saveTick                       sim.Tick
	replayInitialSHA               string
}

// Earned native originals remain byte-exact historical rejection inputs. The
// 0.3.6 files are supplied by the existing custom-money persistence packet.
var compat037Originals = []compat037Original{
	{"035-save", "0.3.5", "testdata/simulation035-original.save.json", "842e4e62800842ab6ee74228b6647648fd47419d1903d0f6cbb94da47d61f2dc", 736469, 200, ""},
	{"035-replay", "0.3.5", "testdata/simulation035-original.replay.bin", "d3341f4c0271f34979633b8baeed6d0cbcaad501eaa0d385735263f0b83e13a0", 8050, 0, "29fdc2edbd35607ad2e1336ac94fc0f8760f8ecd68ecb75b857967522ce0a2e2"},
	{"036-save", "0.3.6", "testdata/starting-money-r3-original.save.json", "09864830adf19bc0576353f87db77a467e960fb392603b631213435e3b07f531", 733742, 0, ""},
	{"036-replay", "0.3.6", "testdata/starting-money-r3-original.replay.bin", "5d1e1f2cb9aa1b9c18fd5f17eaf7cd2cfc959a6ddde929e1ae88f01cc1971937", 8049, 0, "09864830adf19bc0576353f87db77a467e960fb392603b631213435e3b07f531"},
}

func compat037Digest(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func compat037ReadOriginal(t *testing.T, fixture compat037Original) []byte {
	t.Helper()
	raw, err := os.ReadFile(fixture.path)
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) != fixture.bytes || compat037Digest(raw) != fixture.sha256 {
		t.Fatal("earned original artifact identity changed", fixture.path)
	}
	return raw
}

// Read the raw envelope without Restore, normalization, or checksum rewriting.
func compat037Envelope(t *testing.T, data []byte, simulation, contentHash string) (sim.Metadata, sim.Tick) {
	t.Helper()
	var envelope saveEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Version != 1 || len(envelope.State) == 0 || compat037Digest(envelope.State) != envelope.SHA256 {
		t.Fatal("artifact lost its valid original format-1 raw state checksum")
	}
	var header struct {
		Metadata sim.Metadata `json:"metadata"`
		Tick     sim.Tick     `json:"tick"`
	}
	if err := json.Unmarshal(envelope.State, &header); err != nil {
		t.Fatal(err)
	}
	if header.Metadata.Simulation != simulation || header.Metadata.Protocol != 1 || header.Metadata.ContentHash != contentHash {
		t.Fatal("artifact simulation/protocol/content identity changed", header.Metadata)
	}
	return header.Metadata, header.Tick
}

func compat037RequireError(t *testing.T, err error, found, expected sim.Metadata) {
	t.Helper()
	e, ok := err.(*Error)
	if !ok || e.Code != "save_incompatible" || !e.Recoverable || e.Found == nil || e.Expected == nil || *e.Found != found || *e.Expected != expected {
		t.Fatalf("legacy rejection must report exact recoverable Found/Expected identities: %#v", err)
	}
	if !strings.Contains(e.Message, "preserved for export") {
		t.Fatal("original-file export guidance missing", e.Message)
	}
}

// This is the current 0.3.7 boundary, including the genuinely changed content.
// It supersedes the old version-only 0.3.6 test in the new source union; that
// old source and all original receipts remain untouched in Core24R3.
func TestSimulation037RejectsOriginalArtifacts(t *testing.T) {
	if sim.Version != "0.3.7" || AdapterVersion != "1" || ProtocolVersion != 1 {
		t.Fatal("requires current simulation0.3.7 and adapter/protocol1", sim.Version, AdapterVersion, ProtocolVersion)
	}
	for _, fixture := range compat037Originals {
		t.Run(fixture.name, func(t *testing.T) {
			raw := compat037ReadOriginal(t, fixture)
			original := append([]byte(nil), raw...)
			s := newSession(t)
			t.Cleanup(s.Dispose)
			expected := s.ExpectedMetadata()
			shahed, exists := s.catalog.Unit("IR.shahed")
			if !exists || shahed.Name != "Shahed attack drone" || shahed.Faction != "IR" || shahed.Weapon != "IR_SHAHED" || len(s.catalog.Units()) != 76 || expected.ContentHash == compat037LegacyContent || expected.ContentHash != s.catalog.Hash() {
				t.Fatal("boundary requires the current Shahed catalog and its actual changed hash")
			}
			beforeInfo := s.Info()
			beforeHash, err := s.Hash()
			if err != nil {
				t.Fatal(err)
			}
			beforeSave, err := s.Save()
			if err != nil {
				t.Fatal(err)
			}
			metadata, _ := compat037Envelope(t, beforeSave.Data, "0.3.7", expected.ContentHash)
			if metadata != beforeInfo.Metadata || beforeSave.Metadata != metadata || beforeInfo.Adapter != "1" {
				t.Fatal("fresh current Save/session identities disagree")
			}
			beforeReplay, err := s.ExportReplay()
			if err != nil {
				t.Fatal(err)
			}
			fresh, err := sim.DecodeReplay(beforeReplay)
			if err != nil || fresh.Version != 2 || fresh.Metadata != metadata {
				t.Fatal("fresh current Replay lost format2/current metadata", err)
			}
			compat037Envelope(t, fresh.Initial, "0.3.7", expected.ContentHash)
			// Matching current content must restore/play, so a blanket rejection
			// of every artifact cannot satisfy the four historical negatives.
			current, err := sim.Restore(s.catalog, beforeSave.Data)
			if err != nil || current == nil || current.Hash() != beforeHash {
				t.Fatal("matching current Save rejected or changed", err)
			}
			currentReplay, err := fresh.Open(s.catalog, beforeInfo.Tick)
			if err != nil || currentReplay == nil || currentReplay.Engine().Hash() != beforeHash {
				t.Fatal("matching current Replay rejected or changed", err)
			}
			unchanged := func() {
				t.Helper()
				afterHash, err := s.Hash()
				if err != nil || afterHash != beforeHash || !reflect.DeepEqual(s.Info(), beforeInfo) {
					t.Fatal("rejection changed active session identity/state", err)
				}
				afterSave, err := s.Save()
				if err != nil || !reflect.DeepEqual(afterSave, beforeSave) {
					t.Fatal("rejection changed active native Save bytes/summary", err)
				}
				afterReplay, err := s.ExportReplay()
				if err != nil || !bytes.Equal(afterReplay, beforeReplay) {
					t.Fatal("rejection changed active Replay/export bytes", err)
				}
				if !bytes.Equal(raw, original) || !bytes.Equal(compat037ReadOriginal(t, fixture), original) {
					t.Fatal("original input buffer or filesystem artifact changed")
				}
			}
			if fixture.replayInitialSHA == "" {
				found, tick := compat037Envelope(t, raw, fixture.simulation, compat037LegacyContent)
				if tick != fixture.saveTick {
					t.Fatal("original earned Save tick changed", tick)
				}
				restored, err := sim.Restore(s.catalog, raw)
				if err == nil || restored != nil || !strings.Contains(err.Error(), "incompatible simulation/content version") || !strings.Contains(err.Error(), "preserve file for export") {
					t.Fatal("native Restore must reject original with export guidance", err)
				}
				unchanged()
				_, _, err = s.Inspect(raw)
				compat037RequireError(t, err, found, expected)
				unchanged()
				_, err = s.Load(raw, []sim.PlayerID{1})
				compat037RequireError(t, err, found, expected)
				unchanged()
			} else {
				replay, err := sim.DecodeReplay(raw)
				if err != nil || replay.Version != 2 || replay.Metadata.Simulation != fixture.simulation || replay.FinalTick != 240 {
					t.Fatal("original earned compact full Replay identity changed", err)
				}
				found, start := compat037Envelope(t, replay.Initial, fixture.simulation, compat037LegacyContent)
				if found != replay.Metadata || start != 0 || compat037Digest(replay.Initial) != fixture.replayInitialSHA {
					t.Fatal("original full Replay initial native Save changed")
				}
				player, err := replay.Open(s.catalog, start)
				if err == nil || player != nil || !strings.Contains(err.Error(), "incompatible simulation/content version") || !strings.Contains(err.Error(), "preserve file for export") {
					t.Fatal("native Replay Open must reject original before playback", err)
				}
				unchanged()
				_, err = s.InspectReplay(raw)
				compat037RequireError(t, err, found, expected)
				unchanged()
				_, err = s.LoadReplay(raw)
				compat037RequireError(t, err, found, expected)
				unchanged()
			}
		})
	}
}
