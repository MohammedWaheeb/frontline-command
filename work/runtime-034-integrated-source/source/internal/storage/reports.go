package storage

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

var ErrReportRate = errors.New("report_rate_exceeded")

type ReportRecord struct {
	ID       string `json:"id"`
	Owner    string `json:"owner,omitempty"`
	MatchID  string `json:"match_id"`
	Tick     uint32 `json:"tick"`
	Reason   string `json:"reason"`
	Created  int64  `json:"created"`
	Revision int64  `json:"revision"`
	Decision string `json:"decision"`
	Note     string `json:"note,omitempty"`
	Reviewed int64  `json:"reviewed,omitempty"`
}
type ReportReview struct {
	Revision int64  `json:"revision"`
	Decision string `json:"decision"`
	Note     string `json:"note"`
	Reviewed int64  `json:"reviewed"`
}

const reportColumns = `r.id,r.owner,r.match_id,r.tick,r.reason,r.created,COALESCE(v.revision,0),COALESCE(v.decision,'pending'),COALESCE(v.note,''),COALESCE(v.reviewed,0)`
const reportJoin = ` FROM reports r LEFT JOIN report_reviews v ON v.report_id=r.id AND v.revision=(SELECT MAX(revision) FROM report_reviews WHERE report_id=r.id) `

func scanReport(row interface{ Scan(...any) error }) (ReportRecord, error) {
	var v ReportRecord
	err := row.Scan(&v.ID, &v.Owner, &v.MatchID, &v.Tick, &v.Reason, &v.Created, &v.Revision, &v.Decision, &v.Note, &v.Reviewed)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	return v, err
}
func (s *SQLite) CreateReport(ctx context.Context, owner, matchID, reason string, tick uint32) (ReportRecord, error) {
	reason = strings.TrimSpace(reason)
	if len(reason) < 3 || len(reason) > 2000 || PlainText(reason, 2000) != nil || !ValidID(matchID) || tick > 216000 {
		return ReportRecord{}, errors.New("invalid report")
	}
	id, err := Token()
	if err != nil {
		return ReportRecord{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ReportRecord{}, err
	}
	defer tx.Rollback()
	var member bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM match_members WHERE match_id=? AND owner=?)`, matchID, owner).Scan(&member); err != nil {
		return ReportRecord{}, err
	}
	if !member {
		return ReportRecord{}, ErrUnauthorized
	}
	old, err := scanReport(tx.QueryRowContext(ctx, `SELECT `+reportColumns+reportJoin+`WHERE r.owner=? AND r.match_id=? AND r.tick=? AND r.reason=? ORDER BY r.created,r.id LIMIT 1`, owner, matchID, tick, reason))
	if err == nil {
		return old, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return ReportRecord{}, err
	}
	now := time.Now().Unix()
	var hourly, daily, perMatch int
	if err = tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(created>?),0),COALESCE(SUM(created>?),0),COALESCE(SUM(match_id=?),0) FROM reports WHERE owner=?`, now-3600, now-86400, matchID, owner).Scan(&hourly, &daily, &perMatch); err != nil {
		return ReportRecord{}, err
	}
	if hourly >= 10 || daily >= 50 || perMatch >= 5 {
		return ReportRecord{}, ErrReportRate
	}
	record := ReportRecord{ID: id, Owner: owner, MatchID: matchID, Tick: tick, Reason: reason, Created: now, Decision: "pending"}
	if _, err = tx.ExecContext(ctx, `INSERT INTO reports(id,owner,match_id,tick,reason,created) VALUES(?,?,?,?,?,?)`, record.ID, owner, matchID, tick, reason, now); err != nil {
		return ReportRecord{}, err
	}
	return record, tx.Commit()
}
func (s *SQLite) GetReport(ctx context.Context, id string) (ReportRecord, error) {
	return scanReport(s.db.QueryRowContext(ctx, `SELECT `+reportColumns+reportJoin+`WHERE r.id=?`, id))
}
func (s *SQLite) ListReports(ctx context.Context, owner, status, before string, limit int) ([]ReportRecord, error) {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	if status != "all" && status != "pending" && status != "reviewed" {
		return nil, errors.New("invalid report filter")
	}
	cursor := ReportRecord{}
	if before != "" {
		var err error
		cursor, err = s.GetReport(ctx, before)
		if err != nil {
			return nil, err
		}
		if owner != "" && cursor.Owner != owner {
			return nil, ErrNotFound
		}
	}
	rows, err := s.db.QueryContext(ctx, `SELECT `+reportColumns+reportJoin+`WHERE (?='' OR r.owner=?) AND (?='all' OR ?='pending' AND v.revision IS NULL OR ?='reviewed' AND v.revision IS NOT NULL) AND (?='' OR r.created<? OR (r.created=? AND r.id<?)) ORDER BY r.created DESC,r.id DESC LIMIT ?`, owner, owner, status, status, status, before, cursor.Created, cursor.Created, before, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ReportRecord{}
	for rows.Next() {
		v, err := scanReport(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *SQLite) ReviewReport(ctx context.Context, id, decision, note string, expected int64) (ReportReview, error) {
	note = strings.TrimSpace(note)
	if !ValidID(id) || (decision != "confirmed" && decision != "dismissed" && decision != "needs_context") || len(note) > 1000 || PlainText(note, 1000) != nil || expected < 0 || expected > 10000 {
		return ReportReview{}, errors.New("invalid review")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ReportReview{}, err
	}
	defer tx.Rollback()
	var exists bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM reports WHERE id=?)`, id).Scan(&exists); err != nil {
		return ReportReview{}, err
	}
	if !exists {
		return ReportReview{}, ErrNotFound
	}
	var current int64
	if err = tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(revision),0) FROM report_reviews WHERE report_id=?`, id).Scan(&current); err != nil {
		return ReportReview{}, err
	}
	if current != expected {
		return ReportReview{}, ErrConflict
	}
	if current >= 10000 {
		return ReportReview{}, errors.New("review revision limit")
	}
	v := ReportReview{Revision: current + 1, Decision: decision, Note: note, Reviewed: time.Now().Unix()}
	if _, err = tx.ExecContext(ctx, `INSERT INTO report_reviews(report_id,revision,decision,note,reviewed) VALUES(?,?,?,?,?)`, id, v.Revision, v.Decision, v.Note, v.Reviewed); err != nil {
		return ReportReview{}, err
	}
	return v, tx.Commit()
}
func (s *SQLite) ReportReviews(ctx context.Context, id string, before int64) ([]ReportReview, error) {
	if before == 0 {
		before = 10001
	}
	rows, err := s.db.QueryContext(ctx, `SELECT revision,decision,note,reviewed FROM report_reviews WHERE report_id=? AND revision<? ORDER BY revision DESC LIMIT 100`, id, before)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ReportReview{}
	for rows.Next() {
		var v ReportReview
		if err = rows.Scan(&v.Revision, &v.Decision, &v.Note, &v.Reviewed); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
