package storage

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestBackupPreservesExistingDestination(t *testing.T) {
	s := repository(t)
	for _, original := range [][]byte{nil, []byte("newer export chosen independently")} {
		dir := t.TempDir()
		path := filepath.Join(dir, "backup.db")
		if err := os.WriteFile(path, original, 0600); err != nil {
			t.Fatal(err)
		}
		if err := s.Backup(context.Background(), path); err == nil {
			t.Error("backup replaced an existing destination")
		}
		retained, err := os.ReadFile(path)
		if err != nil || !bytes.Equal(retained, original) {
			t.Fatal("existing destination changed", err)
		}
		files, err := os.ReadDir(dir)
		if err != nil || len(files) != 1 || files[0].Name() != "backup.db" {
			t.Fatal("failed publication retained a staging file", files, err)
		}
	}
}

func TestBackupCancellationBeforeWorkCreatesNoOutput(t *testing.T) {
	s := repository(t)
	dir := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := s.Backup(ctx, filepath.Join(dir, "backup.db")); !errors.Is(err, context.Canceled) {
		t.Fatal("cancellation did not propagate", err)
	}
	files, err := os.ReadDir(dir)
	if err != nil || len(files) != 0 {
		t.Fatal("canceled backup created output", files, err)
	}
}

func TestBackupConcurrentPublicationHasOneWinner(t *testing.T) {
	s := repository(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "backup.db")
	results := make(chan error, 2)
	for range 2 {
		go func() { results <- s.Backup(context.Background(), path) }()
	}
	winners := 0
	for range 2 {
		if <-results == nil {
			winners++
		}
	}
	if winners != 1 {
		t.Fatal("publication had wrong winner count", winners)
	}
	files, err := os.ReadDir(dir)
	if err != nil || len(files) != 1 || files[0].Name() != "backup.db" {
		t.Fatal("concurrent publication retained staging output", files, err)
	}
	backup, err := Open(path)
	if err != nil {
		t.Fatal("winning backup is unreadable", err)
	}
	defer backup.Close()
	var check string
	if err := backup.db.QueryRow(`PRAGMA quick_check`).Scan(&check); err != nil || check != "ok" {
		t.Fatal("winning backup failed integrity", check, err)
	}
}
