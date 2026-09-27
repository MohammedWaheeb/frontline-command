package storage

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

type InterruptedMatch struct {
	ID   string
	Tick uint32
	Data []byte
}

func (s *SQLite) StartMatch(ctx context.Context, id string, tick uint32, data []byte) error {
	if !ValidID(id) || len(data) > 64<<20 {
		return errors.New("invalid initial match checkpoint")
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO active_matches(id,tick,data,updated) VALUES(?,?,?,?)`, id, tick, data, time.Now().Unix())
	return err
}
func (s *SQLite) CheckpointMatch(ctx context.Context, id string, tick uint32, data []byte) error {
	if !ValidID(id) || len(data) > 64<<20 {
		return errors.New("invalid match checkpoint")
	}
	_, err := s.db.ExecContext(ctx, `UPDATE active_matches SET tick=?,data=?,updated=? WHERE id=? AND tick<=?`, tick, data, time.Now().Unix(), id, tick)
	return err
}

// RecoverInterrupted is called only after acquiring the exclusive host data
// lock. It never resumes a competitive game from an older state.
func (s *SQLite) RecoverInterrupted(ctx context.Context, objects ObjectRepository) (int, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,tick,data FROM active_matches ORDER BY id`)
	if err != nil {
		return 0, err
	}
	matches := []InterruptedMatch{}
	for rows.Next() {
		var v InterruptedMatch
		if err = rows.Scan(&v.ID, &v.Tick, &v.Data); err != nil {
			rows.Close()
			return 0, err
		}
		matches = append(matches, v)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return 0, err
	}
	count := 0
	for _, m := range matches {
		if err = objects.Put(ctx, m.ID+".diagnostic", m.Data); err != nil {
			return count, err
		}
		payload, _ := json.Marshal(map[string]any{"match_id": m.ID, "void": true, "reason": "server_outage", "available_tick": m.Tick})
		_, err = s.CommitResult(ctx, Result{ID: m.ID, Payload: payload, Void: true})
		if errors.Is(err, ErrConflict) {
			// A completed transaction wins over a stale checkpoint journal.
			if _, lookup := s.GetResult(ctx, m.ID); lookup != nil {
				return count, lookup
			}
			_, err = s.db.ExecContext(ctx, `DELETE FROM active_matches WHERE id=?`, m.ID)
		}
		if err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}
