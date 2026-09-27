package storage

import (
	"context"
	"database/sql"
	"errors"
)

// Keep wire revisions exact in JavaScript as well as SQLite. IDs can always be
// copied to a fresh name if this deliberately unreachable-in-practice bound is hit.
const maxRevision int64 = 1<<53 - 1

func (s *SQLite) initRevisionSchema(version int) error {
	if version >= 5 {
		return nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS record_revisions(kind TEXT NOT NULL,owner TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),PRIMARY KEY(kind,owner,id))`,
		`INSERT INTO record_revisions(kind,owner,id,revision) SELECT 'save',owner,id,revision FROM saves WHERE revision>0 ON CONFLICT(kind,owner,id) DO UPDATE SET revision=MAX(record_revisions.revision,excluded.revision)`,
		`INSERT INTO record_revisions(kind,owner,id,revision) SELECT 'map','',id,revision FROM maps WHERE revision>0 ON CONFLICT(kind,owner,id) DO UPDATE SET revision=MAX(record_revisions.revision,excluded.revision)`,
		`INSERT INTO record_revisions(kind,owner,id,revision) SELECT 'settings',owner,'',revision FROM profile_settings WHERE revision>0 ON CONFLICT(kind,owner,id) DO UPDATE SET revision=MAX(record_revisions.revision,excluded.revision)`,
		`PRAGMA user_version=5`,
	} {
		if _, err = tx.Exec(stmt); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// reserveRevision is called within the same transaction as CAS and the actual
// write/delete. Missing records still compare as revision zero; their private
// tombstone is only an allocation high-water mark and is never returned as live.
func reserveRevision(ctx context.Context, tx *sql.Tx, kind, owner, id string, current int64, advance bool) (int64, error) {
	var prior int64
	err := tx.QueryRowContext(ctx, `SELECT revision FROM record_revisions WHERE kind=? AND owner=? AND id=?`, kind, owner, id).Scan(&prior)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return 0, err
	}
	// No row is an unused allocation namespace, not a failed reservation.
	err = nil
	if current < 0 || prior < 0 {
		return 0, errors.New("record revision is corrupt")
	}
	next := max(current, prior)
	if advance {
		if next >= maxRevision {
			return 0, errors.New("record revision limit reached; copy to a new ID")
		}
		next++
	}
	if next > 0 {
		_, err = tx.ExecContext(ctx, `INSERT INTO record_revisions(kind,owner,id,revision) VALUES(?,?,?,?) ON CONFLICT(kind,owner,id) DO UPDATE SET revision=excluded.revision`, kind, owner, id, next)
	}
	return next, err
}
