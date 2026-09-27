package storage

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	_ "modernc.org/sqlite"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"
)

type SQLite struct{ db *sql.DB }

func Open(path string) (*SQLite, error) {
	if path != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			return nil, err
		}
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	var schemaVersion int
	if err = db.QueryRow("PRAGMA user_version").Scan(&schemaVersion); err != nil {
		db.Close()
		return nil, err
	}
	if schemaVersion > 6 {
		db.Close()
		return nil, errors.New("database was created by a newer game version")
	}
	s := &SQLite{db: db}
	for _, stmt := range []string{"PRAGMA foreign_keys=ON", "PRAGMA journal_mode=WAL", "PRAGMA busy_timeout=5000", `CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,name TEXT NOT NULL,created INTEGER NOT NULL,token_hash TEXT UNIQUE NOT NULL)`, `CREATE TABLE IF NOT EXISTS saves(owner TEXT NOT NULL REFERENCES profiles(id),id TEXT NOT NULL,name TEXT NOT NULL,revision INTEGER NOT NULL,updated INTEGER NOT NULL,data BLOB NOT NULL,PRIMARY KEY(owner,id))`, `CREATE TABLE IF NOT EXISTS results(id TEXT PRIMARY KEY,payload BLOB NOT NULL,created INTEGER NOT NULL,void INTEGER NOT NULL,checksum TEXT NOT NULL)`, `CREATE TABLE IF NOT EXISTS maps(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES profiles(id),title TEXT NOT NULL,revision INTEGER NOT NULL,data BLOB NOT NULL)`, `CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES profiles(id),match_id TEXT NOT NULL,tick INTEGER NOT NULL,reason TEXT NOT NULL,created INTEGER NOT NULL)`, `CREATE TABLE IF NOT EXISTS profile_settings(owner TEXT PRIMARY KEY REFERENCES profiles(id),revision INTEGER NOT NULL,data BLOB NOT NULL)`} {
		if _, err = db.Exec(stmt); err != nil {
			db.Close()
			return nil, err
		}
	}
	if err = s.initSocialSchema(); err != nil {
		db.Close()
		return nil, err
	}
	if err = s.initRatingSchema(); err != nil {
		db.Close()
		return nil, err
	}
	if err = s.initRevisionSchema(schemaVersion); err != nil {
		db.Close()
		return nil, err
	}
	if err = s.initModerationSchema(schemaVersion); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}
func (s *SQLite) Close() error { return s.db.Close() }
func Token() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}
func digest(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }
func ValidID(id string) bool {
	if len(id) < 1 || len(id) > 80 {
		return false
	}
	for _, r := range id {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_' || r == '.') {
			return false
		}
	}
	return id != "." && id != ".."
}
func (s *SQLite) CreateProfile(ctx context.Context, name string) (Profile, string, error) {
	name = strings.TrimSpace(name)
	if len([]rune(name)) < 1 || len([]rune(name)) > 32 {
		return Profile{}, "", errors.New("name must contain 1–32 characters")
	}
	for _, r := range name {
		if unicode.IsControl(r) || unicode.In(r, unicode.Cf) || r == '<' || r == '>' {
			return Profile{}, "", errors.New("name contains control characters")
		}
	}
	token, err := Token()
	if err != nil {
		return Profile{}, "", err
	}
	id, err := Token()
	if err != nil {
		return Profile{}, "", err
	}
	p := Profile{id[:24], name, time.Now().Unix(), true}
	_, err = s.db.ExecContext(ctx, "INSERT INTO profiles(id,name,created,token_hash) VALUES(?,?,?,?)", p.ID, p.Name, p.Created, digest([]byte(token)))
	return p, token, err
}
func (s *SQLite) Authenticate(ctx context.Context, token string) (Profile, error) {
	if len(token) != 64 {
		return Profile{}, ErrUnauthorized
	}
	var p Profile
	err := s.db.QueryRowContext(ctx, "SELECT id,name,created FROM profiles WHERE token_hash=?", digest([]byte(token))).Scan(&p.ID, &p.Name, &p.Created)
	if errors.Is(err, sql.ErrNoRows) {
		return p, ErrUnauthorized
	}
	p.Local = true
	return p, err
}
func (s *SQLite) PutSave(ctx context.Context, v Save, expected int64) (Save, error) {
	if !ValidID(v.ID) || len(v.Name) > 100 || len(v.Data) > 64<<20 || expected < 0 {
		return v, errors.New("invalid save metadata or size")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return v, err
	}
	defer tx.Rollback()
	var revision int64
	err = tx.QueryRowContext(ctx, "SELECT revision FROM saves WHERE owner=? AND id=?", v.Owner, v.ID).Scan(&revision)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return v, err
	}
	if revision != expected {
		return v, ErrConflict
	}
	v.Revision, err = reserveRevision(ctx, tx, "save", v.Owner, v.ID, revision, true)
	if err != nil {
		return v, err
	}
	v.Updated = time.Now().Unix()
	_, err = tx.ExecContext(ctx, `INSERT INTO saves(owner,id,name,revision,updated,data) VALUES(?,?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET name=excluded.name,revision=excluded.revision,updated=excluded.updated,data=excluded.data`, v.Owner, v.ID, v.Name, v.Revision, v.Updated, v.Data)
	if err != nil {
		return v, err
	}
	return v, tx.Commit()
}
func (s *SQLite) GetSave(ctx context.Context, owner, id string) (Save, error) {
	var v Save
	err := s.db.QueryRowContext(ctx, "SELECT id,owner,name,revision,updated,data FROM saves WHERE owner=? AND id=?", owner, id).Scan(&v.ID, &v.Owner, &v.Name, &v.Revision, &v.Updated, &v.Data)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	return v, err
}
func (s *SQLite) ListSaves(ctx context.Context, owner string) ([]Save, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id,owner,name,revision,updated FROM saves WHERE owner=? ORDER BY updated DESC,id", owner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Save{}
	for rows.Next() {
		var v Save
		if err = rows.Scan(&v.ID, &v.Owner, &v.Name, &v.Revision, &v.Updated); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *SQLite) DeleteSave(ctx context.Context, owner, id string, revision int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var current int64
	err = tx.QueryRowContext(ctx, "SELECT revision FROM saves WHERE owner=? AND id=?", owner, id).Scan(&current)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrConflict
	}
	if err != nil {
		return err
	}
	if current != revision {
		return ErrConflict
	}
	if _, err = reserveRevision(ctx, tx, "save", owner, id, current, false); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM saves WHERE owner=? AND id=?", owner, id); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *SQLite) CommitResult(ctx context.Context, v Result) (bool, error) {
	if !ValidID(v.ID) || len(v.Payload) > 4<<20 {
		return false, errors.New("invalid match result")
	}
	hash := digest(v.Payload)
	if v.Rating != nil {
		if v.Void {
			return false, errors.New("void matches cannot change ratings")
		}
		data, _ := json.Marshal(v.Rating)
		hash = digest(append(append([]byte(nil), v.Payload...), data...))
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	var prior string
	var void bool
	err = tx.QueryRowContext(ctx, "SELECT checksum,void FROM results WHERE id=?", v.ID).Scan(&prior, &void)
	if err == nil {
		if prior != hash || void != v.Void {
			return false, ErrConflict
		}
		return false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}
	if v.Created == 0 {
		v.Created = time.Now().Unix()
	}
	_, err = tx.ExecContext(ctx, "INSERT INTO results(id,payload,created,void,checksum) VALUES(?,?,?,?,?)", v.ID, v.Payload, v.Created, v.Void, hash)
	if err != nil {
		return false, err
	}
	if v.Rating != nil {
		if err = commitRating(ctx, tx, v.ID, *v.Rating); err != nil {
			return false, err
		}
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM active_matches WHERE id=?`, v.ID); err != nil {
		return false, err
	}
	return true, tx.Commit()
}
func (s *SQLite) GetResult(ctx context.Context, id string) (Result, error) {
	var v Result
	err := s.db.QueryRowContext(ctx, "SELECT id,payload,created,void FROM results WHERE id=?", id).Scan(&v.ID, &v.Payload, &v.Created, &v.Void)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	return v, err
}
func (s *SQLite) ListResults(ctx context.Context, limit int) ([]Result, error) {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, "SELECT id,payload,created,void FROM results ORDER BY created DESC,id LIMIT ?", limit)
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
func (s *SQLite) PutMap(ctx context.Context, v MapRecord, expected int64) (MapRecord, error) {
	if !ValidID(v.ID) || len(v.Title) > 100 || len(v.Data) > 16<<20 || expected < 0 {
		return v, errors.New("invalid map metadata")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return v, err
	}
	defer tx.Rollback()
	var owner string
	var rev int64
	err = tx.QueryRowContext(ctx, "SELECT owner,revision FROM maps WHERE id=?", v.ID).Scan(&owner, &rev)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return v, err
	}
	if rev != expected {
		return v, ErrConflict
	}
	if owner != "" && owner != v.Owner {
		return v, ErrUnauthorized
	}
	v.Revision, err = reserveRevision(ctx, tx, "map", "", v.ID, rev, true)
	if err != nil {
		return v, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO maps(id,owner,title,revision,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,revision=excluded.revision,data=excluded.data`, v.ID, v.Owner, v.Title, v.Revision, v.Data)
	if err != nil {
		return v, err
	}
	return v, tx.Commit()
}
func (s *SQLite) GetMap(ctx context.Context, id string) (MapRecord, error) {
	var v MapRecord
	err := s.db.QueryRowContext(ctx, "SELECT id,owner,title,revision,data FROM maps WHERE id=?", id).Scan(&v.ID, &v.Owner, &v.Title, &v.Revision, &v.Data)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	return v, err
}
func (s *SQLite) ListMaps(ctx context.Context) ([]MapRecord, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id,owner,title,revision FROM maps ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MapRecord{}
	for rows.Next() {
		var v MapRecord
		if err = rows.Scan(&v.ID, &v.Owner, &v.Title, &v.Revision); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *SQLite) Report(ctx context.Context, owner, matchID, reason string, tick uint32) error {
	_, err := s.CreateReport(ctx, owner, matchID, reason, tick)
	return err
}
func (s *SQLite) Backup(ctx context.Context, path string) error {
	if !filepath.IsAbs(path) {
		return fmt.Errorf("backup path must be absolute")
	}
	_, err := s.db.ExecContext(ctx, "VACUUM INTO ?", path)
	return err
}

var _ AccountRepository = (*SQLite)(nil)
var _ SaveRepository = (*SQLite)(nil)
var _ ResultRepository = (*SQLite)(nil)
var _ MapRepository = (*SQLite)(nil)
