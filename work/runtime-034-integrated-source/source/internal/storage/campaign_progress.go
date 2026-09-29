package storage

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"regexp"
	"time"
)

const CampaignProgressLimit = 256 << 10

var campaignID = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$`)
var emptyCampaign = json.RawMessage(`{"version":1,"results":[],"missions":{}}`)

type CampaignMissionProgress struct {
	Mission            string   `json:"mission"`
	MissionVersion     string   `json:"mission_version"`
	Difficulty         string   `json:"difficulty"`
	Completions        int64    `json:"completions"`
	FirstCompleted     int64    `json:"first_completed"`
	LastCompleted      int64    `json:"last_completed"`
	BestTick           int64    `json:"best_tick"`
	OptionalObjectives []string `json:"optional_objectives"`
}
type CampaignLedger struct {
	Version  int                                `json:"version"`
	Results  []string                           `json:"results"`
	Missions map[string]CampaignMissionProgress `json:"missions"`
}
type CampaignProgress struct {
	Revision int64           `json:"revision"`
	Updated  int64           `json:"updated"`
	Data     json.RawMessage `json:"data"`
}
type CampaignProgressRepository interface {
	GetCampaignProgress(context.Context, string) (CampaignProgress, error)
	PutCampaignProgress(context.Context, string, json.RawMessage, int64) (CampaignProgress, error)
}

// Story backup validation only. Imported ledgers never establish ranked rewards,
// live mission completion, simulation state or authenticated result authority.
func ValidateCampaignLedger(data []byte) error {
	if len(data) == 0 || len(data) > CampaignProgressLimit {
		return errors.New("campaign progress exceeds 256 KiB")
	}
	var value CampaignLedger
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return err
	}
	if decoder.Decode(new(any)) != io.EOF {
		return errors.New("one campaign document required")
	}
	if value.Version != 1 || value.Results == nil || len(value.Results) > 4096 || value.Missions == nil || len(value.Missions) > 4096 {
		return errors.New("unsupported campaign ledger")
	}
	unique := func(values []string, max int) bool {
		if values == nil || len(values) > max {
			return false
		}
		seen := map[string]bool{}
		for _, value := range values {
			if !campaignID.MatchString(value) || seen[value] {
				return false
			}
			seen[value] = true
		}
		return true
	}
	if !unique(value.Results, 4096) {
		return errors.New("invalid campaign result IDs")
	}
	var raw struct {
		Missions map[string]map[string]json.RawMessage `json:"missions"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	for key, mission := range value.Missions {
		if len(raw.Missions[key]) != 8 || !campaignID.MatchString(mission.Mission) || !campaignID.MatchString(mission.MissionVersion) || key != mission.Mission+":"+mission.MissionVersion+":"+mission.Difficulty || (mission.Difficulty != "easy" && mission.Difficulty != "normal" && mission.Difficulty != "hard") || mission.Completions < 1 || mission.Completions > int64(len(value.Results)) || mission.FirstCompleted < 0 || mission.LastCompleted < mission.FirstCompleted || mission.LastCompleted > maxRevision || mission.BestTick < 0 || mission.BestTick > maxRevision || !unique(mission.OptionalObjectives, 100) {
			return errors.New("invalid campaign mission record")
		}
		for _, field := range raw.Missions[key] {
			if bytes.Equal(bytes.TrimSpace(field), []byte("null")) {
				return errors.New("null campaign mission field")
			}
		}
	}
	return nil
}
func (s *SQLite) initCampaignProgressSchema(version int) error {
	if version >= 8 {
		return nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`CREATE TABLE IF NOT EXISTS profile_campaign(owner TEXT PRIMARY KEY REFERENCES profiles(id),revision INTEGER NOT NULL,updated INTEGER NOT NULL,data BLOB NOT NULL)`); err != nil {
		return err
	}
	if _, err = tx.Exec(`PRAGMA user_version=8`); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *SQLite) GetCampaignProgress(ctx context.Context, owner string) (CampaignProgress, error) {
	var value CampaignProgress
	err := s.db.QueryRowContext(ctx, `SELECT revision,updated,data FROM profile_campaign WHERE owner=?`, owner).Scan(&value.Revision, &value.Updated, &value.Data)
	if errors.Is(err, sql.ErrNoRows) {
		return CampaignProgress{Data: append(json.RawMessage(nil), emptyCampaign...)}, nil
	}
	return value, err
}
func (s *SQLite) PutCampaignProgress(ctx context.Context, owner string, data json.RawMessage, expected int64) (CampaignProgress, error) {
	if expected < 0 || expected > maxRevision {
		return CampaignProgress{}, errors.New("invalid progress revision")
	}
	if err := ValidateCampaignLedger(data); err != nil {
		return CampaignProgress{}, err
	}
	snapshot := append(json.RawMessage(nil), data...)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return CampaignProgress{}, err
	}
	defer tx.Rollback()
	var current int64
	err = tx.QueryRowContext(ctx, `SELECT revision FROM profile_campaign WHERE owner=?`, owner).Scan(&current)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return CampaignProgress{}, err
	}
	if current != expected {
		return CampaignProgress{}, ErrConflict
	}
	revision, err := reserveRevision(ctx, tx, "campaign", owner, "campaign", current, true)
	if err != nil {
		return CampaignProgress{}, err
	}
	value := CampaignProgress{Revision: revision, Updated: time.Now().Unix(), Data: snapshot}
	if _, err = tx.ExecContext(ctx, `INSERT INTO profile_campaign(owner,revision,updated,data) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET revision=excluded.revision,updated=excluded.updated,data=excluded.data`, owner, value.Revision, value.Updated, []byte(snapshot)); err != nil {
		return CampaignProgress{}, err
	}
	return value, tx.Commit()
}
