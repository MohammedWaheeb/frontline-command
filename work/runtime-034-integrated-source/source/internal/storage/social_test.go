package storage

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"
)

func TestFriendsBlocksMuteAndTeamChat(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "social.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	a, _, _ := s.CreateProfile(ctx, "Alpha")
	b, _, _ := s.CreateProfile(ctx, "Bravo")
	c, _, _ := s.CreateProfile(ctx, "Charlie")
	if err = s.SetRelation(ctx, a.ID, b.ID, "request"); err != nil {
		t.Fatal(err)
	}
	if err = s.SetRelation(ctx, b.ID, a.ID, "accept"); err != nil {
		t.Fatal(err)
	}
	relations, _ := s.Relations(ctx, a.ID)
	if len(relations) != 1 || relations[0].Kind != "friend" {
		t.Fatal("friend acceptance not reciprocal")
	}
	_, err = s.SendChat(ctx, ChatMessage{Room: "lobby", Sender: a.ID, Team: 1, Recipients: []string{a.ID, b.ID}, Text: "Team message"})
	if err != nil {
		t.Fatal(err)
	}
	own, _ := s.ReadChat(ctx, b.ID, "lobby", 1, 0)
	enemy, _ := s.ReadChat(ctx, c.ID, "lobby", 1, 0)
	if len(own) != 1 || len(enemy) != 0 {
		t.Fatal("team chat crossed team boundary")
	}
	if err = s.SetRelation(ctx, b.ID, a.ID, "mute"); err != nil {
		t.Fatal(err)
	}
	muted, _ := s.ReadChat(ctx, b.ID, "lobby", 1, 0)
	if len(muted) != 0 {
		t.Fatal("muted chat delivered")
	}
	if err = s.SetRelation(ctx, b.ID, a.ID, "block"); err != nil {
		t.Fatal(err)
	}
	if err = s.SetRelation(ctx, a.ID, b.ID, "request"); err == nil {
		t.Fatal("blocked friend request accepted")
	}
	relations, _ = s.Relations(ctx, a.ID)
	if len(relations) != 0 {
		t.Fatal("block left active friendship")
	}
}
func TestSettingsConflictAndPlainText(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	p, _, _ := s.CreateProfile(ctx, "Settings")
	data := json.RawMessage(`{"volume":0.5,"hotkeys":{"attack":"KeyA"}}`)
	v, err := s.PutSettings(ctx, p.ID, 0, data)
	if err != nil || v.Revision != 1 {
		t.Fatal(err)
	}
	if _, err = s.PutSettings(ctx, p.ID, 0, json.RawMessage(`{}`)); err != ErrConflict {
		t.Fatal("stale settings overwrote newer version")
	}
	got, _ := s.GetSettings(ctx, p.ID)
	if string(got.Data) != string(data) {
		t.Fatal("conflict mutated settings")
	}
	for _, name := range []string{"<script>", "hidden\u202e"} {
		if _, _, err = s.CreateProfile(ctx, name); err == nil {
			t.Fatal("accepted hidden or markup profile name")
		}
	}
}
