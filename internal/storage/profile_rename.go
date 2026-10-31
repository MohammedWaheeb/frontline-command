package storage

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"unicode"
)

func (s *SQLite) RenameProfile(ctx context.Context, id, name string) (Profile, error) {
	name = strings.TrimSpace(name)
	if len([]rune(name)) < 1 || len([]rune(name)) > 32 {
		return Profile{}, errors.New("name must contain 1–32 characters")
	}
	for _, r := range name {
		if unicode.IsControl(r) || unicode.In(r, unicode.Cf) || r == '<' || r == '>' {
			return Profile{}, errors.New("name contains control characters")
		}
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Profile{}, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, "UPDATE profiles SET name=? WHERE id=?", name, id); err != nil {
		return Profile{}, err
	}
	var p Profile
	err = tx.QueryRowContext(ctx, "SELECT id,name,created FROM profiles WHERE id=?", id).Scan(&p.ID, &p.Name, &p.Created)
	if errors.Is(err, sql.ErrNoRows) {
		return Profile{}, ErrNotFound
	}
	if err != nil {
		return Profile{}, err
	}
	p.Local = true
	return p, tx.Commit()
}
