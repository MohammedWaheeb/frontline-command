package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"frontlinecommand/internal/storage"
	sqlite3 "modernc.org/sqlite"
	"os"
	"path/filepath"
)

func must(err error) {
	if err != nil {
		panic(err)
	}
}
func require(ok bool, text string) {
	if !ok {
		panic(text)
	}
}
func main() {
	ctx := context.Background()
	dir := os.Args[1]
	mode := os.Args[4]
	save, err := os.ReadFile(os.Args[2])
	must(err)
	replay, err := os.ReadFile(os.Args[3])
	must(err)
	data, err := os.ReadFile(filepath.Join(dir, "fixture-identity.json"))
	must(err)
	identity := map[string]string{}
	must(json.Unmarshal(data, &identity))
	db, err := storage.Open(filepath.Join(dir, "frontline.db"))
	if mode == "reject-future" || mode == "reject-corrupt" {
		if err == nil {
			db.Close()
			panic("invalid/future database admitted")
		}
		if mode == "reject-future" {
			require(err.Error() == "database was created by a newer game version", "future database rejected for the wrong reason")
		} else {
			var detail *sqlite3.Error
			require(errors.As(err, &detail), "corrupt file rejected for a non-SQLite reason")
			require(detail.Code()&255 == 26 || detail.Code()&255 == 11, "corrupt file rejected for a different SQLite error")
		}
		fmt.Printf("{\"status\":\"rejected-for-expected-reason\",\"mode\":%q}\n", mode)
		return
	}
	must(err)
	owner, err := db.Authenticate(ctx, identity["token"])
	must(err)
	require(owner.ID == identity["owner"], "profile identity lost")
	_, err = db.Authenticate(ctx, "0000000000000000000000000000000000000000000000000000000000000000")
	require(errors.Is(err, storage.ErrUnauthorized), "wrong token admitted")
	value, err := db.GetSave(ctx, owner.ID, "slot")
	must(err)
	require(value.Revision == 3 && bytes.Equal(value.Data, save), "save bytes/revision lost")
	_, err = db.GetSave(ctx, identity["other"], "slot")
	require(errors.Is(err, storage.ErrNotFound), "private save exposed")
	_, err = db.GetSave(ctx, owner.ID, "deleted")
	require(errors.Is(err, storage.ErrNotFound), "deleted slot resurrected")
	m, err := db.GetMap(ctx, "private-map")
	must(err)
	require(m.Owner == owner.ID && m.Revision == 2 && m.ContentRevision == 2 && !m.Published && !m.Removed && string(m.Data) == "preserved map payload", "map changed or became public")
	immutable, err := db.MapVersion(ctx, m.ID, 2)
	must(err)
	require(bytes.Equal(immutable, m.Data), "immutable map lost")
	settings, err := db.GetSettings(ctx, owner.ID)
	must(err)
	require(settings.Revision == 1 && string(settings.Data) == `{"uiScale":1.25}`, "settings lost")
	allowed, err := db.PairAllowed(ctx, owner.ID, identity["other"])
	must(err)
	require(!allowed, "block relationship lost")
	result, err := db.GetResult(ctx, "fixture-result")
	must(err)
	require(result.Void && string(result.Payload) == `{"fixture":true}`, "result changed")
	inserted, err := db.CommitResult(ctx, result)
	must(err)
	require(!inserted, "duplicate result inserted")
	objects := storage.Files{Root: filepath.Join(dir, "objects")}
	loaded, err := objects.Get(ctx, "exact-replay")
	must(err)
	require(bytes.Equal(loaded, replay), "external replay bytes lost")
	campaign, err := db.GetCampaignProgress(ctx, owner.ID)
	must(err)
	require(campaign.Revision == 0, "new campaign ledger invented progress")
	if mode == "backup" {
		must(db.Backup(ctx, os.Args[5]))
		err = db.Backup(ctx, os.Args[5])
		require(err != nil, "existing backup overwritten")
	}
	if mode == "write" {
		recreated, err := db.PutSave(ctx, storage.Save{Owner: owner.ID, ID: "deleted", Name: "Recreated", Data: save}, 0)
		must(err)
		require(recreated.Revision == 2, "tombstone revision lost")
		_, err = db.PutSave(ctx, recreated, 1)
		require(errors.Is(err, storage.ErrConflict), "stale writer accepted after restore")
	}
	must(db.Close())
	fmt.Printf("{\"status\":\"verified-and-closed\",\"mode\":%q,\"saveRevision\":3,\"mapRevision\":2,\"exactReplay\":true,\"privateRows\":true}\n", mode)
}
