package storage

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Shared checkpoints are copied into each participant's private save list in
// one transaction. A repeated checkpoint cannot overwrite an edited save.
func (s *SQLite) PutSharedSave(ctx context.Context, owners []string, id, name string, data []byte) error {
	if !ValidID(id) || len(owners) < 1 || len(owners) > 2 || len(name) > 100 || len(data) > 64<<20 {
		return errors.New("invalid shared checkpoint")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	seen := map[string]bool{}
	for _, owner := range owners {
		if seen[owner] || !ValidID(owner) {
			return errors.New("invalid checkpoint participants")
		}
		seen[owner] = true
		var prior []byte
		err = tx.QueryRowContext(ctx, `SELECT data FROM saves WHERE owner=? AND id=?`, owner, id).Scan(&prior)
		if err == nil {
			if digest(prior) != digest(data) {
				return ErrConflict
			}
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO saves(owner,id,name,revision,updated,data) VALUES(?,?,?,1,?,?)`, owner, id, name, time.Now().Unix(), data); err != nil {
			return err
		}
	}
	return tx.Commit()
}
