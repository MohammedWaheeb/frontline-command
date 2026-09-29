package storage

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type MatchMember struct {
	Profile string `json:"profile"`
	Player  uint32 `json:"player"`
}

func (s *SQLite) initModerationSchema(version int) error {
	if version >= 6 {
		return nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, statement := range []string{
		`CREATE TABLE IF NOT EXISTS match_access(match_id TEXT PRIMARY KEY,public_replay INTEGER NOT NULL CHECK(public_replay IN (0,1)))`,
		`CREATE TABLE IF NOT EXISTS match_members(match_id TEXT NOT NULL REFERENCES match_access(match_id),owner TEXT NOT NULL REFERENCES profiles(id),player INTEGER NOT NULL,PRIMARY KEY(match_id,owner))`,
		`CREATE INDEX IF NOT EXISTS match_members_owner ON match_members(owner,match_id)`,
		`CREATE INDEX IF NOT EXISTS reports_owner_created ON reports(owner,created)`,
		`CREATE INDEX IF NOT EXISTS reports_created ON reports(created,id)`,
		`CREATE TABLE IF NOT EXISTS report_reviews(report_id TEXT NOT NULL REFERENCES reports(id),revision INTEGER NOT NULL,decision TEXT NOT NULL,note TEXT NOT NULL,reviewed INTEGER NOT NULL,PRIMARY KEY(report_id,revision))`,
		// Rating events are trusted committed participant evidence. Old unranked
		// payloads contain simulation players, not authenticated profile identities.
		`INSERT OR IGNORE INTO match_access(match_id,public_replay) SELECT DISTINCT match_id,0 FROM rating_events`,
		`INSERT OR IGNORE INTO match_members(match_id,owner,player) SELECT match_id,owner,0 FROM rating_events`,
		`PRAGMA user_version=6`,
	} {
		if _, err = tx.Exec(statement); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func (s *SQLite) StartMatchAccess(ctx context.Context, id string, tick uint32, data []byte, members []MatchMember, publicReplay bool) error {
	if !ValidID(id) || len(data) > 64<<20 || len(members) > 4 {
		return errors.New("invalid initial match checkpoint or membership")
	}
	profiles, players := map[string]bool{}, map[uint32]bool{}
	for _, member := range members {
		if !ValidID(member.Profile) || member.Player < 1 || member.Player > 4 || profiles[member.Profile] || players[member.Player] {
			return errors.New("invalid match membership")
		}
		profiles[member.Profile], players[member.Player] = true, true
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `INSERT INTO match_access(match_id,public_replay) VALUES(?,?)`, id, publicReplay); err != nil {
		return err
	}
	for _, member := range members {
		if _, err = tx.ExecContext(ctx, `INSERT INTO match_members(match_id,owner,player) VALUES(?,?,?)`, id, member.Profile, member.Player); err != nil {
			return err
		}
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO active_matches(id,tick,data,updated) VALUES(?,?,?,?)`, id, tick, data, time.Now().Unix()); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *SQLite) MatchMember(ctx context.Context, id, owner string) (MatchMember, error) {
	member := MatchMember{Profile: owner}
	err := s.db.QueryRowContext(ctx, `SELECT player FROM match_members WHERE match_id=? AND owner=?`, id, owner).Scan(&member.Player)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	return member, err
}
func (s *SQLite) MayReadReplay(ctx context.Context, id, owner string) (bool, error) {
	var allowed bool
	err := s.db.QueryRowContext(ctx, `SELECT public_replay OR EXISTS(SELECT 1 FROM match_members WHERE match_id=? AND owner=?) FROM match_access WHERE match_id=?`, id, owner, id).Scan(&allowed)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return allowed, err
}
func (s *SQLite) ListOwnResults(ctx context.Context, owner string, limit int) ([]Result, error) {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `SELECT r.id,r.payload,r.created,r.void FROM results r JOIN match_members m ON m.match_id=r.id WHERE m.owner=? ORDER BY r.created DESC,r.id LIMIT ?`, owner, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Result{}
	for rows.Next() {
		var v Result
		if err = rows.Scan(&v.ID, &v.Payload, &v.Created, &v.Void); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
