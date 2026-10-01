package storage

import (
	"bytes"
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Cancel only after actual output has reached disk. This exercises SQLite's
// interrupt path rather than an already-canceled call that never writes a file.
func TestBackupCancellationDoesNotPublishPartialFile(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	p, _, err := s.CreateProfile(ctx, "Backup cancellation")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`PRAGMA wal_autocheckpoint=0`); err != nil {
		t.Fatal(err)
	}
	data := bytes.Repeat([]byte("retained-checkpoint"), (32<<20)/len("retained-checkpoint"))
	if _, err := s.PutSave(ctx, Save{ID: "source", Owner: p.ID, Name: "Exact source", Data: data}, 0); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "backup.db")
	canceled, cancel := context.WithCancel(ctx)
	defer cancel()
	type output struct {
		name  string
		bytes int64
	}
	observed := make(chan output, 1)
	finished := make(chan struct{})
	go func() {
		ticker := time.NewTicker(time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-finished:
				return
			case <-ticker.C:
				files, err := os.ReadDir(dir)
				if err != nil {
					continue
				}
				for _, file := range files {
					info, err := file.Info()
					if err == nil && info.Mode().IsRegular() && info.Size() > 0 {
						observed <- output{file.Name(), info.Size()}
						cancel()
						return
					}
				}
			}
		}
	}()
	err = s.Backup(canceled, path)
	close(finished)
	var seen output
	select {
	case seen = <-observed:
	default:
		t.Fatalf("cancellation was not exercised: backup finished before observable output; error=%v", err)
	}
	t.Logf("cancel observed output %s at %d bytes; returned error=%v", seen.name, seen.bytes, err)
	if err == nil || canceled.Err() == nil {
		t.Fatal("backup did not report the exercised cancellation")
	}
	left, statErr := os.Stat(path)
	if statErr == nil {
		t.Logf("failed backup left final path with %d bytes", left.Size())
		readOnly, openErr := sql.Open("sqlite", "file:"+filepath.ToSlash(path)+"?mode=ro")
		if openErr == nil {
			var check string
			checkErr := readOnly.QueryRow(`PRAGMA quick_check`).Scan(&check)
			t.Logf("partial final quick_check=%q; error=%v", check, checkErr)
			readOnly.Close()
		}
	} else if !os.IsNotExist(statErr) {
		t.Fatal(statErr)
	}
	retryErr := s.Backup(ctx, path)
	t.Logf("explicit same-path retry error=%v", retryErr)
	if statErr == nil {
		t.Error("canceled backup published a final file")
	}
	if retryErr != nil {
		t.Error("explicit backup retry was blocked by failed output:", retryErr)
	} else {
		backup, openErr := Open(path)
		if openErr != nil {
			t.Fatal(openErr)
		}
		defer backup.Close()
		copied, readErr := backup.GetSave(ctx, p.ID, "source")
		if readErr != nil || !bytes.Equal(copied.Data, data) || copied.Revision != 1 {
			t.Fatal("retry lost the exact SQLite/WAL source", readErr)
		}
		var revision int64
		if err := backup.db.QueryRow(`SELECT revision FROM record_revisions WHERE kind='save' AND owner=? AND id='source'`, p.ID).Scan(&revision); err != nil || revision != 1 {
			t.Fatal("retry lost revision ledger", revision, err)
		}
	}
	original, readErr := s.GetSave(ctx, p.ID, "source")
	if readErr != nil || !bytes.Equal(original.Data, data) || original.Revision != 1 {
		t.Fatal("cancellation or retry changed source", readErr)
	}
}
