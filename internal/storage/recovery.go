package storage

import (
	"context"
	"database/sql"
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
	if err := s.StartMatchAccess(ctx, id, tick, data, nil, false); err != nil {
		return err
	}
	return s.recordServerCheckpoint(ctx, id, tick, data)
}
func (s *SQLite) CheckpointMatch(ctx context.Context, id string, tick uint32, data []byte) error {
	if !ValidID(id) || len(data) > 64<<20 {
		return errors.New("invalid match checkpoint")
	}
	// Capture the bytes being replaced too: the opening checkpoint is only
	// written by StartMatchAccess, so its digest would otherwise be lost
	// when the first 30s/co-op checkpoint overwrites it.
	var prior []byte
	priorErr := s.db.QueryRowContext(ctx, `SELECT data FROM active_matches WHERE id=?`, id).Scan(&prior)
	if priorErr != nil && !errors.Is(priorErr, sql.ErrNoRows) {
		return priorErr
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE active_matches SET tick=?,data=?,updated=? WHERE id=? AND tick<=?`, tick, data, time.Now().Unix(), id, tick); err != nil {
		return err
	}
	if len(prior) > 0 {
		if err := s.recordServerCheckpoint(ctx, id, tick, prior); err != nil {
			return err
		}
	}
	return s.recordServerCheckpoint(ctx, id, tick, data)
}

// Server-issued checkpoint provenance. CheckpointMatch (the server's own
// 30s/co-op persistence) records the digest of every state it stores.
// Client uploads (PutSave) never write this table, so a fabricated save
// cannot acquire provenance. The table is created lazily to avoid a schema
// version bump; rows are (match, digest) pairs joined to match_members at
// check time so provenance is per participant.
const serverCheckpointsSchema = `CREATE TABLE IF NOT EXISTS server_checkpoints(match_id TEXT NOT NULL,tick INTEGER NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(match_id,digest))`

func (s *SQLite) recordServerCheckpoint(ctx context.Context, id string, tick uint32, data []byte) error {
	if _, err := s.db.ExecContext(ctx, serverCheckpointsSchema); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO server_checkpoints(match_id,tick,digest) VALUES(?,?,?)`, id, tick, digest(data))
	return err
}

// HasServerCheckpoint reports whether data is byte-identical to a state the
// server checkpointed for a match owner participated in. The live
// active_matches row also counts, covering the opening checkpoint before
// the first CheckpointMatch records it.
func (s *SQLite) HasServerCheckpoint(ctx context.Context, owner string, data []byte) (bool, error) {
	if !ValidID(owner) || len(data) == 0 || len(data) > 64<<20 {
		return false, nil
	}
	if _, err := s.db.ExecContext(ctx, serverCheckpointsSchema); err != nil {
		return false, err
	}
	want := digest(data)
	var recorded int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM server_checkpoints c JOIN match_members m ON m.match_id=c.match_id WHERE c.digest=? AND m.owner=?`, want, owner).Scan(&recorded); err != nil {
		return false, err
	}
	if recorded > 0 {
		return true, nil
	}
	rows, err := s.db.QueryContext(ctx, `SELECT a.data FROM active_matches a JOIN match_members m ON m.match_id=a.id WHERE m.owner=?`, owner)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var live []byte
		if err = rows.Scan(&live); err != nil {
			return false, err
		}
		if digest(live) == want {
			return true, nil
		}
	}
	return false, rows.Err()
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
		// A committed result wins even if its stale journal cannot be archived.
		// In particular, object-store failure must not prevent startup for an
		// already completed match.
		if _, lookup := s.GetResult(ctx, m.ID); lookup == nil {
			if _, err = s.db.ExecContext(ctx, `DELETE FROM active_matches WHERE id=?`, m.ID); err != nil {
				return count, err
			}
			count++
			continue
		} else if !errors.Is(lookup, ErrNotFound) {
			return count, lookup
		}
		if err = objects.Put(ctx, m.ID+".diagnostic", m.Data); err != nil {
			return count, err
		}
		payload, _ := json.Marshal(map[string]any{"match_id": m.ID, "void": true, "reason": "host_restart", "available_tick": m.Tick})
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
