package main

import (
	"context"
	"encoding/json"
	"fmt"
	"frontlinecommand/internal/storage"
	"os"
	"path/filepath"
)

func must(err error) {
	if err != nil {
		panic(err)
	}
}
func main() {
	ctx := context.Background()
	dir := os.Args[1]
	save, err := os.ReadFile(os.Args[2])
	must(err)
	replay, err := os.ReadFile(os.Args[3])
	must(err)
	db, err := storage.Open(filepath.Join(dir, "frontline.db"))
	must(err)
	owner, token, err := db.CreateProfile(ctx, "Recovery drill")
	must(err)
	other, _, err := db.CreateProfile(ctx, "Isolated second profile")
	must(err)
	var revision int64
	for i := 0; i < 3; i++ {
		value, err := db.PutSave(ctx, storage.Save{Owner: owner.ID, ID: "slot", Name: "Exact native bytes", Data: save}, revision)
		must(err)
		revision = value.Revision
	}
	deleted, err := db.PutSave(ctx, storage.Save{Owner: owner.ID, ID: "deleted", Name: "Deleted slot", Data: save}, 0)
	must(err)
	must(db.DeleteSave(ctx, owner.ID, deleted.ID, deleted.Revision))
	revision = 0
	for i := 0; i < 2; i++ {
		value, err := db.PutMap(ctx, storage.MapRecord{ID: "private-map", Owner: owner.ID, Title: "Recovery drill map", Data: []byte("preserved map payload")}, revision)
		must(err)
		revision = value.Revision
	}
	_, err = db.PutSettings(ctx, owner.ID, 0, json.RawMessage(`{"uiScale":1.25}`))
	must(err)
	must(db.SetRelation(ctx, owner.ID, other.ID, "block"))
	inserted, err := db.CommitResult(ctx, storage.Result{ID: "fixture-result", Payload: []byte(`{"fixture":true}`), Void: true})
	must(err)
	if !inserted {
		panic("fixture result not inserted")
	}
	objects := storage.Files{Root: filepath.Join(dir, "objects")}
	must(objects.Put(ctx, "exact-replay", replay))
	identity, err := json.Marshal(map[string]string{"owner": owner.ID, "other": other.ID, "token": token})
	must(err)
	must(os.WriteFile(filepath.Join(dir, "fixture-identity.json"), identity, 0600))
	must(db.Close())
	fmt.Println(`{"status":"seeded-and-closed","profiles":2,"saveRevision":3,"mapRevision":2,"deletedSlot":true,"voidFixtureResult":true}`)
}
