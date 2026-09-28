package storage

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

type MapReport struct {
	ID          string `json:"id"`
	Owner       string `json:"owner,omitempty"`
	MapID       string `json:"map_id"`
	MapRevision int64  `json:"map_revision"`
	Reason      string `json:"reason"`
	Created     int64  `json:"created"`
	Revision    int64  `json:"revision"`
	Decision    string `json:"decision"`
	Note        string `json:"note,omitempty"`
	Reviewed    int64  `json:"reviewed,omitempty"`
}
type MapReview struct {
	ReportReview
	MapRevision int64 `json:"map_revision"`
}

const mapReportColumns = `r.id,r.owner,r.map_id,r.map_revision,r.reason,r.created,COALESCE(v.revision,0),COALESCE(v.decision,'pending'),COALESCE(v.note,''),COALESCE(v.reviewed,0)`
const mapReportJoin = ` FROM map_reports r LEFT JOIN map_report_reviews v ON v.report_id=r.id AND v.revision=(SELECT MAX(revision) FROM map_report_reviews WHERE report_id=r.id) `

func scanMapReport(row interface{ Scan(...any) error }) (MapReport, error) {
	var v MapReport
	err := row.Scan(&v.ID, &v.Owner, &v.MapID, &v.MapRevision, &v.Reason, &v.Created, &v.Revision, &v.Decision, &v.Note, &v.Reviewed)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	return v, err
}

// Only published content can be newly reported here. The original bytes are
// retained by content revision even if the author repairs/unpublishes it later.
func (s *SQLite) CreateMapReport(ctx context.Context, owner, id, reason string) (MapReport, error) {
	reason = strings.TrimSpace(reason)
	if !ValidID(id) || len(reason) < 3 || len(reason) > 2000 || PlainText(reason, 2000) != nil {
		return MapReport{}, errors.New("invalid map report")
	}
	token, err := Token()
	if err != nil {
		return MapReport{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return MapReport{}, err
	}
	defer tx.Rollback()
	m, err := getMapRecord(ctx, tx, id)
	if err != nil {
		return MapReport{}, err
	}
	if !m.Published || m.Removed {
		return MapReport{}, ErrNotFound
	}
	old, err := scanMapReport(tx.QueryRowContext(ctx, `SELECT `+mapReportColumns+mapReportJoin+` WHERE r.owner=? AND r.map_id=? AND r.map_revision=? AND r.reason=? ORDER BY r.created,r.id LIMIT 1`, owner, id, m.ContentRevision, reason))
	if err == nil {
		return old, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return MapReport{}, err
	}
	now := time.Now().Unix()
	var hourly, daily, perMap int
	if err = tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(created>?),0),COALESCE(SUM(created>?),0),COALESCE(SUM(map_id=?),0) FROM map_reports WHERE owner=?`, now-3600, now-86400, id, owner).Scan(&hourly, &daily, &perMap); err != nil {
		return MapReport{}, err
	}
	if hourly >= 10 || daily >= 50 || perMap >= 5 {
		return MapReport{}, ErrReportRate
	}
	v := MapReport{ID: token, Owner: owner, MapID: id, MapRevision: m.ContentRevision, Reason: reason, Created: now, Decision: "pending"}
	if _, err = tx.ExecContext(ctx, `INSERT INTO map_reports(id,owner,map_id,map_revision,reason,created) VALUES(?,?,?,?,?,?)`, v.ID, owner, id, v.MapRevision, reason, now); err != nil {
		return v, err
	}
	return v, tx.Commit()
}
func (s *SQLite) GetMapReport(ctx context.Context, id string) (MapReport, error) {
	return scanMapReport(s.db.QueryRowContext(ctx, `SELECT `+mapReportColumns+mapReportJoin+` WHERE r.id=?`, id))
}
func (s *SQLite) ListMapReports(ctx context.Context, owner, status, before string, limit int) ([]MapReport, error) {
	if status != "all" && status != "pending" && status != "reviewed" {
		return nil, errors.New("invalid report filter")
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}
	cursor := MapReport{}
	if before != "" {
		var err error
		cursor, err = s.GetMapReport(ctx, before)
		if err != nil {
			return nil, err
		}
		if owner != "" && cursor.Owner != owner {
			return nil, ErrNotFound
		}
	}
	rows, err := s.db.QueryContext(ctx, `SELECT `+mapReportColumns+mapReportJoin+`WHERE (?='' OR r.owner=?) AND (?='all' OR ?='pending' AND v.revision IS NULL OR ?='reviewed' AND v.revision IS NOT NULL) AND (?='' OR r.created<? OR r.created=? AND r.id<?) ORDER BY r.created DESC,r.id DESC LIMIT ?`, owner, owner, status, status, status, before, cursor.Created, cursor.Created, before, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MapReport{}
	for rows.Next() {
		v, err := scanMapReport(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *SQLite) ReviewMapReport(ctx context.Context, id, decision, note string, expected, expectedMap int64) (MapReview, error) {
	note = strings.TrimSpace(note)
	if !ValidID(id) || (decision != "removed" && decision != "restored" && decision != "dismissed" && decision != "needs_context") || len(note) < 1 || PlainText(note, 1000) != nil || expected < 0 || expected >= 10000 {
		return MapReview{}, errors.New("invalid map review")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return MapReview{}, err
	}
	defer tx.Rollback()
	report, err := scanMapReport(tx.QueryRowContext(ctx, `SELECT `+mapReportColumns+mapReportJoin+` WHERE r.id=?`, id))
	if err != nil {
		return MapReview{}, err
	}
	if report.Revision != expected {
		return MapReview{}, ErrConflict
	}
	m, err := getMapRecord(ctx, tx, report.MapID)
	if err != nil {
		return MapReview{}, err
	}
	if decision == "removed" || decision == "restored" {
		if m.Revision != expectedMap {
			return MapReview{}, ErrConflict
		}
		m.Removed = decision == "removed"
		m.Published = false
		if err = saveMapPolicy(ctx, tx, &m); err != nil {
			return MapReview{}, err
		}
	}
	v := MapReview{ReportReview: ReportReview{Revision: expected + 1, Decision: decision, Note: note, Reviewed: time.Now().Unix()}, MapRevision: m.Revision}
	if _, err = tx.ExecContext(ctx, `INSERT INTO map_report_reviews(report_id,revision,decision,note,reviewed,map_revision) VALUES(?,?,?,?,?,?)`, id, v.Revision, v.Decision, v.Note, v.Reviewed, v.MapRevision); err != nil {
		return v, err
	}
	return v, tx.Commit()
}
func (s *SQLite) MapReportReviews(ctx context.Context, id string, before int64) ([]MapReview, error) {
	if before == 0 {
		before = 10001
	}
	rows, err := s.db.QueryContext(ctx, `SELECT revision,decision,note,reviewed,map_revision FROM map_report_reviews WHERE report_id=? AND revision<? ORDER BY revision DESC LIMIT 100`, id, before)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MapReview{}
	for rows.Next() {
		var v MapReview
		if err = rows.Scan(&v.Revision, &v.Decision, &v.Note, &v.Reviewed, &v.MapRevision); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
