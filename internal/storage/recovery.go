package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
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
	// The journal and its prior/current provenance are one durable update.
	// Missing, finalized and stale checkpoints are no-ops: they must not mint
	// provenance for bytes this journal never accepted or overwrite recovery.
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var prior []byte
	var priorTick uint32
	err = tx.QueryRowContext(ctx, `SELECT tick,data FROM active_matches WHERE id=? AND NOT EXISTS(SELECT 1 FROM results WHERE id=?)`, id, id).Scan(&priorTick, &prior)
	if errors.Is(err, sql.ErrNoRows) {
		return tx.Commit()
	}
	if err != nil {
		return err
	}
	if priorTick > tick {
		return tx.Commit()
	}
	if _, err = tx.ExecContext(ctx, `UPDATE active_matches SET tick=?,data=?,updated=? WHERE id=? AND tick<=?`, tick, data, time.Now().Unix(), id, tick); err != nil {
		return err
	}
	if len(prior) > 0 {
		if _, err = tx.ExecContext(ctx, insertServerCheckpoint, id, priorTick, digest(prior)); err != nil {
			return err
		}
	}
	if _, err = tx.ExecContext(ctx, insertServerCheckpoint, id, tick, digest(data)); err != nil {
		return err
	}
	return tx.Commit()
}

// Server-issued checkpoint provenance. CheckpointMatch (the server's own
// 30s/co-op persistence) records the digest of every state it stores.
// Client uploads (PutSave) never write this table, so a fabricated save
// cannot acquire provenance. Existing builds created this table lazily; Open
// now initializes the same additive table without a format-version change.
// Rows are (match, digest) pairs joined to match_members at check time, so
// provenance is per participant.
const serverCheckpointsSchema = `CREATE TABLE IF NOT EXISTS server_checkpoints(match_id TEXT NOT NULL,tick INTEGER NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(match_id,digest))`
const insertServerCheckpoint = `INSERT OR IGNORE INTO server_checkpoints(match_id,tick,digest) VALUES(?,?,?)`

func (s *SQLite) recordServerCheckpoint(ctx context.Context, id string, tick uint32, data []byte) error {
	_, err := s.db.ExecContext(ctx, insertServerCheckpoint, id, tick, digest(data))
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
		if result, lookup := s.GetResult(ctx, m.ID); lookup == nil {
			// A recovery void may have retained this journal because its
			// diagnostic could not be written. Retry archival without creating
			// another result or changing its original payload/creation time.
			if result.Void {
				if archiveErr := objects.Put(ctx, m.ID+".diagnostic", m.Data); archiveErr != nil {
					if ctx.Err() != nil {
						return count, ctx.Err()
					}
					log.Printf("match %s recovery diagnostic still unavailable; checkpoint retained: %v", m.ID, archiveErr)
					count++
					continue
				}
			}
			if _, err = s.db.ExecContext(ctx, `DELETE FROM active_matches WHERE id=?`, m.ID); err != nil {
				return count, err
			}
			count++
			continue
		} else if !errors.Is(lookup, ErrNotFound) {
			return count, lookup
		}
		archiveErr := objects.Put(ctx, m.ID+".diagnostic", m.Data)
		if ctx.Err() != nil {
			return count, ctx.Err()
		}
		payload, _ := json.Marshal(map[string]any{"match_id": m.ID, "void": true, "reason": "host_restart", "available_tick": m.Tick})
		_, err = s.commitResult(ctx, Result{ID: m.ID, Payload: payload, Void: true}, archiveErr != nil)
		if err == nil && archiveErr != nil {
			log.Printf("match %s voided after host restart; diagnostic unavailable and checkpoint retained: %v", m.ID, archiveErr)
		}
		if errors.Is(err, ErrConflict) {
			// A completed transaction wins over a stale checkpoint journal.
			// Keep an unarchived void's bytes even if another caller won.
			result, lookup := s.GetResult(ctx, m.ID)
			if lookup != nil {
				return count, lookup
			}
			err = nil
			if !result.Void || archiveErr == nil {
				_, err = s.db.ExecContext(ctx, `DELETE FROM active_matches WHERE id=?`, m.ID)
			}
		}
		if err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}
