package server

import (
	"context"
	"frontlinecommand/internal/storage"
	"net/http"
	"strings"
	"unicode"
)

// The storage owner supplies this optional capability. Never replace a profile
// or keep a server-only alias when persistent rename is unavailable.
type profileRenamer interface {
	RenameProfile(context.Context, string, string) (storage.Profile, error)
}

func (s *Server) renameProfile(w http.ResponseWriter, r *http.Request) {
	repo, _ := any(s.repo).(profileRenamer)
	s.renameProfileUsing(w, r, repo)
}

func (s *Server) renameProfileUsing(w http.ResponseWriter, r *http.Request, repo profileRenamer) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if !decode(w, r, &body, 4096) {
		return
	}
	// Match CreateProfile exactly: Unicode display names, trim surrounding
	// whitespace, 1–32 runes, no controls/format characters or angle brackets.
	// Names are deliberately nonunique; profile IDs remain the identity.
	name := strings.TrimSpace(body.Name)
	valid := len([]rune(name)) >= 1 && len([]rune(name)) <= 32
	for _, ch := range name {
		if unicode.IsControl(ch) || unicode.In(ch, unicode.Cf) || ch == '<' || ch == '>' {
			valid = false
		}
	}
	if !valid {
		fail(w, 400, "invalid_profile", "Choose a display name of 1–32 characters without control characters.")
		return
	}
	if repo == nil {
		fail(w, 501, "profile_rename_unavailable", "This host needs the profile storage update before commander names can be changed.")
		return
	}
	// Serialize storage and cached presentation updates with lobby admission and
	// other renames so older responses cannot overwrite newer roster names.
	s.mu.Lock()
	defer s.mu.Unlock()
	renamed, err := repo.RenameProfile(r.Context(), p.ID, name)
	if err != nil {
		fail(w, 500, "storage_error", "Could not save the commander name. Try again.")
		return
	}
	for _, l := range s.lobbies {
		for i := range l.Slots {
			if l.Slots[i].Profile == p.ID {
				l.Slots[i].Name = renamed.Name
			}
		}
	}
	for _, invite := range s.invites {
		if invite.Sender == p.ID {
			invite.SenderName = renamed.Name
		}
	}
	if entry := s.queue[p.ID]; entry != nil {
		entry.Profile.Name = renamed.Name
	}
	respond(w, 200, renamed)
}
