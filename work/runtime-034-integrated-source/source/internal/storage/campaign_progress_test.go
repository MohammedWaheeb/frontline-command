package storage

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

const campaignFixture = `{"version":1,"results":["solo-result-one"],"missions":{"us-01:1:normal":{"mission":"us-01","mission_version":"1","difficulty":"normal","completions":1,"first_completed":1750000000000,"last_completed":1750000000000,"best_tick":1200,"optional_objectives":["save-convoy"]}}}`

func TestCampaignLedgerValidationBounds(t *testing.T) {
	if err := ValidateCampaignLedger([]byte(campaignFixture)); err != nil {
		t.Fatal(err)
	}
	if err := ValidateCampaignLedger(emptyCampaign); err != nil {
		t.Fatal(err)
	}
	invalid := []string{strings.Replace(campaignFixture, `"version":1`, `"version":2`, 1), campaignFixture + `{}`, strings.Replace(campaignFixture, `"version":1`, `"version":1,"owner":"other"`, 1), strings.Replace(campaignFixture, `["solo-result-one"]`, `["solo-result-one","solo-result-one"]`, 1), strings.Replace(campaignFixture, `"best_tick":1200`, `"best_tick":1.5`, 1), strings.Replace(campaignFixture, `"best_tick":1200`, `"best_tick":9007199254740992`, 1), strings.Replace(campaignFixture, `"last_completed":1750000000000,`, ``, 1), strings.Replace(campaignFixture, `"last_completed":1750000000000`, `"last_completed":1`, 1), strings.Replace(campaignFixture, `"best_tick":1200`, `"best_tick":null`, 1), strings.Replace(campaignFixture, `"us-01:1:normal"`, `"different:1:normal"`, 1), strings.Replace(campaignFixture, `["save-convoy"]`, `["<script>"]`, 1), strings.Repeat(" ", CampaignProgressLimit) + campaignFixture}
	for index, input := range invalid {
		if err := ValidateCampaignLedger([]byte(input)); err == nil {
			t.Fatalf("accepted invalid case %d", index)
		}
	}
}
func TestCampaignProgressProfileIsolationAndConcurrentCAS(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	a, _, _ := s.CreateProfile(ctx, "A")
	b, _, _ := s.CreateProfile(ctx, "B")
	var wg sync.WaitGroup
	var lock sync.Mutex
	wins := 0
	for range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			v, err := s.PutCampaignProgress(ctx, a.ID, json.RawMessage(campaignFixture), 0)
			if err == nil {
				lock.Lock()
				wins++
				lock.Unlock()
				if v.Revision != 1 || v.Updated <= 0 {
					t.Error("bad stored metadata", v)
				}
			} else if !errors.Is(err, ErrConflict) {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if wins != 1 {
		t.Fatal("CAS winners", wins)
	}
	other, err := s.GetCampaignProgress(ctx, b.ID)
	if err != nil || other.Revision != 0 || string(other.Data) != string(emptyCampaign) {
		t.Fatal("profile isolation", other, err)
	}
	if _, err = s.PutCampaignProgress(ctx, a.ID, emptyCampaign, 0); !errors.Is(err, ErrConflict) {
		t.Fatal("stale replacement", err)
	}
	current, _ := s.GetCampaignProgress(ctx, a.ID)
	if string(current.Data) != campaignFixture {
		t.Fatal("stale attempt changed bytes")
	}
	if _, err = s.PutCampaignProgress(ctx, "missing-profile", emptyCampaign, 0); err == nil {
		t.Fatal("orphan progress accepted")
	}
	var rows int
	s.db.QueryRow(`SELECT COUNT(*) FROM record_revisions WHERE kind='campaign' AND owner='missing-profile'`).Scan(&rows)
	if rows != 0 {
		t.Fatal("failed write consumed revision")
	}
	if _, err = s.PutCampaignProgress(ctx, a.ID, emptyCampaign, 1); err != nil {
		t.Fatal(err)
	}
}
func TestCampaignSchemaEightMigrationPreservesOldFiles(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "profile.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	p, _, _ := s.CreateProfile(ctx, "Commander")
	old, err := s.PutSave(ctx, Save{ID: "slot", Owner: p.ID, Name: "Exact old file", Data: []byte{0, 255, 128, 7}}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.db.Exec(`DROP TABLE profile_campaign`); err != nil {
		t.Fatal(err)
	}
	if _, err = s.db.Exec(`PRAGMA user_version=7`); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	var version int
	s.db.QueryRow(`PRAGMA user_version`).Scan(&version)
	if version != 8 {
		t.Fatal(version)
	}
	saved, err := s.GetSave(ctx, p.ID, old.ID)
	if err != nil || saved.Revision != old.Revision || string(saved.Data) != string(old.Data) {
		t.Fatal("migration changed save", err)
	}
	summary, err := s.ListSaves(ctx, p.ID)
	if err != nil || len(summary) != 1 || summary[0].Bytes != 4 || summary[0].Data != nil {
		t.Fatal("metadata list read or lost payload size", summary, err)
	}
	if _, err = s.PutCampaignProgress(ctx, p.ID, json.RawMessage(campaignFixture), 0); err != nil {
		t.Fatal(err)
	}
}
