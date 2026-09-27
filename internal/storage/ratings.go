package storage

import (
	"context"
	"database/sql"
	"errors"
	"math"
)

type RatingMatch struct {
	Profiles [2]string `json:"profiles"`
	Winner   string    `json:"winner"`
	Draw     bool      `json:"draw"`
}
type Rating struct {
	Owner              string `json:"owner"`
	Name               string `json:"name"`
	Rating             int    `json:"rating"`
	Games              int    `json:"games"`
	Wins               int    `json:"wins"`
	Losses             int    `json:"losses"`
	PlacementRemaining int    `json:"placement_remaining"`
	Local              bool   `json:"local"`
}
type RatingChange struct {
	Owner  string `json:"owner"`
	Before int    `json:"before"`
	After  int    `json:"after"`
	Delta  int    `json:"delta"`
}

func (s *SQLite) PairAllowed(ctx context.Context, a, b string) (bool, error) {
	var blocked int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM relations WHERE kind='block' AND ((owner=? AND target=?) OR (owner=? AND target=?))`, a, b, b, a).Scan(&blocked)
	return blocked == 0, err
}

func (s *SQLite) initRatingSchema() error {
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS rating_events(match_id TEXT NOT NULL REFERENCES results(id),owner TEXT NOT NULL REFERENCES profiles(id),before_rating INTEGER NOT NULL,after_rating INTEGER NOT NULL,delta INTEGER NOT NULL,PRIMARY KEY(match_id,owner))`,
	} {
		if _, err := s.db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}
func (s *SQLite) GetRating(ctx context.Context, owner string) (Rating, error) {
	v := Rating{Owner: owner, Local: true}
	err := s.db.QueryRowContext(ctx, `SELECT p.name,COALESCE(r.rating,1000),COALESCE(r.games,0),COALESCE(r.wins,0),COALESCE(r.losses,0) FROM profiles p LEFT JOIN ratings r ON r.owner=p.id WHERE p.id=?`, owner).Scan(&v.Name, &v.Rating, &v.Games, &v.Wins, &v.Losses)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	v.PlacementRemaining = max(0, 10-v.Games)
	return v, err
}
func (s *SQLite) Leaderboard(ctx context.Context) ([]Rating, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT p.id,p.name,r.rating,r.games,r.wins,r.losses FROM ratings r JOIN profiles p ON p.id=r.owner WHERE r.games>0 ORDER BY r.rating DESC,r.games DESC,p.id LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Rating{}
	for rows.Next() {
		v := Rating{Local: true}
		if err = rows.Scan(&v.Owner, &v.Name, &v.Rating, &v.Games, &v.Wins, &v.Losses); err != nil {
			return nil, err
		}
		v.PlacementRemaining = max(0, 10-v.Games)
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *SQLite) RatingChanges(ctx context.Context, match string) ([]RatingChange, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT owner,before_rating,after_rating,delta FROM rating_events WHERE match_id=? ORDER BY owner`, match)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RatingChange{}
	for rows.Next() {
		var v RatingChange
		if err = rows.Scan(&v.Owner, &v.Before, &v.After, &v.Delta); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// Ratings and the result are one transaction. No reward can be repeated by
// reconnect, retry, replay seeking, or recovery of an interrupted server.
func commitRating(ctx context.Context, tx *sql.Tx, match string, result RatingMatch) error {
	if result.Profiles[0] == result.Profiles[1] || !ValidID(result.Profiles[0]) || !ValidID(result.Profiles[1]) || result.Draw && result.Winner != "" || !result.Draw && result.Winner != result.Profiles[0] && result.Winner != result.Profiles[1] {
		return errors.New("invalid rated outcome")
	}
	ratings := [2]int{1000, 1000}
	games := [2]int{}
	for i, owner := range result.Profiles {
		if _, err := tx.ExecContext(ctx, `INSERT INTO ratings(owner) VALUES(?) ON CONFLICT(owner) DO NOTHING`, owner); err != nil {
			return err
		}
		if err := tx.QueryRowContext(ctx, `SELECT rating,games FROM ratings WHERE owner=?`, owner).Scan(&ratings[i], &games[i]); err != nil {
			return err
		}
	}
	delta := 0
	if !result.Draw {
		k := 32.0
		if games[0] < 10 && games[1] < 10 {
			k = 40
		}
		expected := 1 / (1 + math.Pow(10, float64(ratings[1]-ratings[0])/400))
		score := 0.0
		if result.Winner == result.Profiles[0] {
			score = 1
		}
		delta = int(math.Round(k * (score - expected)))
		if delta == 0 {
			if score == 1 {
				delta = 1
			} else {
				delta = -1
			}
		}
	}
	for i, owner := range result.Profiles {
		change := delta
		if i == 1 {
			change = -delta
		}
		win, loss := 0, 0
		if !result.Draw {
			if owner == result.Winner {
				win = 1
			} else {
				loss = 1
			}
		}
		if _, err := tx.ExecContext(ctx, `UPDATE ratings SET rating=rating+?,games=games+1,wins=wins+?,losses=losses+? WHERE owner=?`, change, win, loss, owner); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO rating_events(match_id,owner,before_rating,after_rating,delta) VALUES(?,?,?,?,?)`, match, owner, ratings[i], ratings[i]+change, change); err != nil {
			return err
		}
	}
	return nil
}
