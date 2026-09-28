package storage

import (
	"context"
	"database/sql"
	"errors"
)

func (s *SQLite) initMapPublicationSchema(version int) error {
	if version >= 7 {
		return nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, statement := range []string{
		`CREATE TABLE IF NOT EXISTS map_state(map_id TEXT PRIMARY KEY REFERENCES maps(id) ON DELETE CASCADE,published INTEGER NOT NULL CHECK(published IN(0,1)),removed INTEGER NOT NULL CHECK(removed IN(0,1)),content_revision INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS map_versions(map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,revision INTEGER NOT NULL,data BLOB NOT NULL,PRIMARY KEY(map_id,revision))`,
		`INSERT OR IGNORE INTO map_state(map_id,published,removed,content_revision) SELECT id,0,0,revision FROM maps`,
		`INSERT OR IGNORE INTO map_versions(map_id,revision,data) SELECT id,revision,data FROM maps`,
		`CREATE TABLE IF NOT EXISTS map_reports(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES profiles(id),map_id TEXT NOT NULL,map_revision INTEGER NOT NULL,reason TEXT NOT NULL,created INTEGER NOT NULL,FOREIGN KEY(map_id,map_revision) REFERENCES map_versions(map_id,revision))`,
		`CREATE INDEX IF NOT EXISTS map_reports_owner_created ON map_reports(owner,created,id)`,
		`CREATE TABLE IF NOT EXISTS map_report_reviews(report_id TEXT NOT NULL REFERENCES map_reports(id),revision INTEGER NOT NULL,decision TEXT NOT NULL,note TEXT NOT NULL,reviewed INTEGER NOT NULL,map_revision INTEGER NOT NULL,PRIMARY KEY(report_id,revision))`,
		`PRAGMA user_version=7`,
	} {
		if _, err = tx.Exec(statement); err != nil {
			return err
		}
	}
	return tx.Commit()
}

const mapRecordColumns = `m.id,m.owner,m.title,m.revision,m.data,p.name,v.published,v.removed,v.content_revision`
const mapRecordJoin = ` FROM maps m JOIN profiles p ON p.id=m.owner JOIN map_state v ON v.map_id=m.id `

type mapQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func scanMapRecord(row interface{ Scan(...any) error }) (MapRecord, error) {
	var v MapRecord
	err := row.Scan(&v.ID, &v.Owner, &v.Title, &v.Revision, &v.Data, &v.OwnerName, &v.Published, &v.Removed, &v.ContentRevision)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	return v, err
}
func getMapRecord(ctx context.Context, q mapQuerier, id string) (MapRecord, error) {
	return scanMapRecord(q.QueryRowContext(ctx, `SELECT `+mapRecordColumns+mapRecordJoin+` WHERE m.id=?`, id))
}

func (s *SQLite) PublishMap(ctx context.Context, id, owner string, published bool, expected int64) (MapRecord, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return MapRecord{}, err
	}
	defer tx.Rollback()
	v, err := getMapRecord(ctx, tx, id)
	if err != nil {
		return v, err
	}
	if v.Owner != owner {
		return v, ErrUnauthorized
	}
	if v.Revision != expected {
		return v, ErrConflict
	}
	if v.Removed && published {
		return v, ErrUnauthorized
	}
	if v.Published == published {
		return v, nil
	}
	v.Published = published
	if err = saveMapPolicy(ctx, tx, &v); err != nil {
		return v, err
	}
	return v, tx.Commit()
}
func saveMapPolicy(ctx context.Context, tx *sql.Tx, v *MapRecord) error {
	revision, err := reserveRevision(ctx, tx, "map", "", v.ID, v.Revision, true)
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE maps SET revision=? WHERE id=?`, revision, v.ID); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE map_state SET published=?,removed=? WHERE map_id=?`, v.Published, v.Removed, v.ID); err != nil {
		return err
	}
	v.Revision = revision
	return nil
}
func (s *SQLite) MapVersion(ctx context.Context, id string, revision int64) ([]byte, error) {
	var data []byte
	err := s.db.QueryRowContext(ctx, `SELECT data FROM map_versions WHERE map_id=? AND revision=?`, id, revision).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	return data, err
}
