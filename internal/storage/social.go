package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode"
)

func (s *SQLite) initSocialSchema() error {
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS relations(owner TEXT NOT NULL REFERENCES profiles(id),target TEXT NOT NULL REFERENCES profiles(id),kind TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(owner,target,kind))`,
		`CREATE TABLE IF NOT EXISTS chat(id INTEGER PRIMARY KEY AUTOINCREMENT,room TEXT NOT NULL,sender TEXT NOT NULL REFERENCES profiles(id),team INTEGER NOT NULL,text TEXT NOT NULL,tick INTEGER NOT NULL,created INTEGER NOT NULL)`,
		`CREATE INDEX IF NOT EXISTS chat_room_id ON chat(room,id)`,
		`CREATE TABLE IF NOT EXISTS chat_recipients(message INTEGER NOT NULL REFERENCES chat(id) ON DELETE CASCADE,owner TEXT NOT NULL REFERENCES profiles(id),PRIMARY KEY(message,owner))`,
		`CREATE TABLE IF NOT EXISTS moderation(report_id TEXT PRIMARY KEY REFERENCES reports(id),resolution TEXT NOT NULL,reviewed INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS ratings(owner TEXT PRIMARY KEY REFERENCES profiles(id),rating INTEGER NOT NULL DEFAULT 1000,games INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0)`,
		`CREATE TABLE IF NOT EXISTS active_matches(id TEXT PRIMARY KEY,tick INTEGER NOT NULL,data BLOB NOT NULL,updated INTEGER NOT NULL)`,
	} {
		if _, err := s.db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}
func PlainText(text string, maxRunes int) error {
	if strings.TrimSpace(text) == "" || len([]rune(text)) > maxRunes {
		return errors.New("text is empty or too long")
	}
	for _, r := range text {
		if unicode.IsControl(r) || unicode.In(r, unicode.Cf) || r == '<' || r == '>' {
			return errors.New("text contains markup or invisible control characters")
		}
	}
	return nil
}

type Relation struct {
	Target   string `json:"target"`
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	Incoming bool   `json:"incoming"`
}

func (s *SQLite) Relations(ctx context.Context, owner string) ([]Relation, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT r.target,p.name,r.kind,0 FROM relations r JOIN profiles p ON p.id=r.target WHERE r.owner=? UNION ALL SELECT r.owner,p.name,r.kind,1 FROM relations r JOIN profiles p ON p.id=r.owner WHERE r.target=? AND r.kind='request' ORDER BY 2,3`, owner, owner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Relation{}
	for rows.Next() {
		var v Relation
		if err = rows.Scan(&v.Target, &v.Name, &v.Kind, &v.Incoming); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *SQLite) SetRelation(ctx context.Context, owner, target, action string) error {
	if owner == target || !ValidID(target) {
		return errors.New("invalid social target")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var exists int
	if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM profiles WHERE id=?", target).Scan(&exists); err != nil {
		return err
	}
	if exists == 0 {
		return ErrNotFound
	}
	switch action {
	case "request", "accept":
		var blocked int
		if err = tx.QueryRowContext(ctx, `SELECT count(*) FROM relations WHERE kind='block' AND ((owner=? AND target=?) OR (owner=? AND target=?))`, owner, target, target, owner).Scan(&blocked); err != nil {
			return err
		}
		if blocked > 0 {
			return ErrUnauthorized
		}
		if action == "request" {
			_, err = tx.ExecContext(ctx, `INSERT OR IGNORE INTO relations(owner,target,kind,created) VALUES(?,?,'request',?)`, owner, target, time.Now().Unix())
		} else {
			var pending int
			if err = tx.QueryRowContext(ctx, `SELECT count(*) FROM relations WHERE owner=? AND target=? AND kind='request'`, target, owner).Scan(&pending); err != nil {
				return err
			}
			if pending == 0 {
				return ErrNotFound
			}
			_, err = tx.ExecContext(ctx, `DELETE FROM relations WHERE kind='request' AND ((owner=? AND target=?) OR (owner=? AND target=?))`, owner, target, target, owner)
			if err != nil {
				return err
			}
			_, err = tx.ExecContext(ctx, `INSERT OR IGNORE INTO relations(owner,target,kind,created) VALUES(?,?,'friend',?),(?,?,'friend',?)`, owner, target, time.Now().Unix(), target, owner, time.Now().Unix())
		}
	case "block", "mute":
		_, err = tx.ExecContext(ctx, `INSERT OR IGNORE INTO relations(owner,target,kind,created) VALUES(?,?,?,?)`, owner, target, action, time.Now().Unix())
		if err != nil {
			return err
		}
		if action == "block" {
			_, err = tx.ExecContext(ctx, `DELETE FROM relations WHERE kind IN ('request','friend') AND ((owner=? AND target=?) OR (owner=? AND target=?))`, owner, target, target, owner)
		}
	case "unblock", "unmute":
		_, err = tx.ExecContext(ctx, `DELETE FROM relations WHERE owner=? AND target=? AND kind=?`, owner, target, strings.TrimPrefix(action, "un"))
	case "remove", "decline":
		_, err = tx.ExecContext(ctx, `DELETE FROM relations WHERE kind IN ('request','friend') AND ((owner=? AND target=?) OR (owner=? AND target=?))`, owner, target, target, owner)
	default:
		return errors.New("unsupported social action")
	}
	if err != nil {
		return err
	}
	return tx.Commit()
}

type ChatMessage struct {
	Recipients []string `json:"-"`
	ID         int64    `json:"id"`
	Room       string   `json:"room"`
	Sender     string   `json:"sender"`
	Name       string   `json:"name"`
	Team       uint32   `json:"team"`
	Text       string   `json:"text"`
	Tick       uint32   `json:"tick"`
	Created    int64    `json:"created"`
}

func (s *SQLite) SendChat(ctx context.Context, m ChatMessage) (ChatMessage, error) {
	if !ValidID(m.Room) || PlainText(m.Text, 400) != nil || m.Team > 0 && (len(m.Recipients) < 1 || len(m.Recipients) > 4) {
		return m, errors.New("chat must contain 1–400 plain-text characters")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return m, err
	}
	defer tx.Rollback()
	m.Created = time.Now().Unix()
	var recent int
	if err = tx.QueryRowContext(ctx, `SELECT count(*) FROM chat WHERE sender=? AND created>?`, m.Sender, m.Created-10).Scan(&recent); err != nil {
		return m, err
	}
	if recent >= 5 {
		return m, errors.New("chat_rate_exceeded")
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO chat(room,sender,team,text,tick,created) VALUES(?,?,?,?,?,?)`, m.Room, m.Sender, m.Team, m.Text, m.Tick, m.Created)
	if err != nil {
		return m, err
	}
	m.ID, _ = result.LastInsertId()
	for _, owner := range m.Recipients {
		if _, err = tx.ExecContext(ctx, `INSERT OR IGNORE INTO chat_recipients(message,owner) VALUES(?,?)`, m.ID, owner); err != nil {
			return m, err
		}
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM chat WHERE room=? AND id NOT IN (SELECT id FROM chat WHERE room=? ORDER BY id DESC LIMIT 500)`, m.Room, m.Room); err != nil {
		return m, err
	}
	if err = tx.QueryRowContext(ctx, `SELECT name FROM profiles WHERE id=?`, m.Sender).Scan(&m.Name); err != nil {
		return m, err
	}
	return m, tx.Commit()
}
func (s *SQLite) ReadChat(ctx context.Context, owner, room string, team uint32, after int64) ([]ChatMessage, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT c.id,c.room,c.sender,p.name,c.team,c.text,c.tick,c.created FROM chat c JOIN profiles p ON p.id=c.sender WHERE c.room=? AND c.id>? AND (c.team=0 OR EXISTS(SELECT 1 FROM chat_recipients cr WHERE cr.message=c.id AND cr.owner=?)) AND NOT EXISTS(SELECT 1 FROM relations r WHERE (r.owner=? AND r.target=c.sender AND r.kind IN ('mute','block')) OR (r.owner=c.sender AND r.target=? AND r.kind='block')) ORDER BY c.id LIMIT 100`, room, after, owner, owner, owner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ChatMessage{}
	for rows.Next() {
		var m ChatMessage
		if err = rows.Scan(&m.ID, &m.Room, &m.Sender, &m.Name, &m.Team, &m.Text, &m.Tick, &m.Created); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

type Settings struct {
	Revision int64           `json:"revision"`
	Data     json.RawMessage `json:"data"`
}

func (s *SQLite) GetSettings(ctx context.Context, owner string) (Settings, error) {
	var v Settings
	err := s.db.QueryRowContext(ctx, `SELECT revision,data FROM profile_settings WHERE owner=?`, owner).Scan(&v.Revision, &v.Data)
	if errors.Is(err, sql.ErrNoRows) {
		return Settings{Data: json.RawMessage(`{}`)}, nil
	}
	return v, err
}
func (s *SQLite) PutSettings(ctx context.Context, owner string, expected int64, data json.RawMessage) (Settings, error) {
	var object map[string]json.RawMessage
	if expected < 0 || len(data) > 32768 || json.Unmarshal(data, &object) != nil || object == nil {
		return Settings{}, errors.New("settings must be a bounded JSON object")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Settings{}, err
	}
	defer tx.Rollback()
	var revision int64
	err = tx.QueryRowContext(ctx, `SELECT revision FROM profile_settings WHERE owner=?`, owner).Scan(&revision)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return Settings{}, err
	}
	if revision != expected {
		return Settings{}, ErrConflict
	}
	allocated, err := reserveRevision(ctx, tx, "settings", owner, "", revision, true)
	if err != nil {
		return Settings{}, err
	}
	next := Settings{Revision: allocated, Data: data}
	_, err = tx.ExecContext(ctx, `INSERT INTO profile_settings(owner,revision,data) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET revision=excluded.revision,data=excluded.data`, owner, next.Revision, data)
	if err != nil {
		return Settings{}, err
	}
	return next, tx.Commit()
}
