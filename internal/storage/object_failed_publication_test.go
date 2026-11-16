package storage

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCanceledStagedObjectRetainsPreviouslyRecordedHistory(t *testing.T) {
	previousBytes := maxObjectBytesTotal
	maxObjectBytesTotal = 32 << 20
	t.Cleanup(func() { maxObjectBytesTotal = previousBytes })
	objects := Files{Root: t.TempDir()}
	if err := objects.Put(context.Background(), "recorded.replay", []byte("previous recorded history")); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	observed := make(chan struct{}, 1)
	finished := make(chan struct{})
	go func() {
		ticker := time.NewTicker(time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-finished:
				return
			case <-ticker.C:
				entries, _ := os.ReadDir(objects.Root)
				for _, entry := range entries {
					if strings.HasPrefix(entry.Name(), ".write-") {
						if info, err := entry.Info(); err == nil && info.Size() > 0 {
							cancel()
							observed <- struct{}{}
							return
						}
					}
				}
			}
		}
	}()
	err := objects.Put(ctx, "canceled.replay", bytes.Repeat([]byte("x"), 32<<20))
	close(finished)
	select {
	case <-observed:
	default:
		t.Fatalf("cancellation was not exercised after staging output: %v", err)
	}
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("staged publication ignored cancellation: %v", err)
	}
	if retained, err := objects.Get(context.Background(), "recorded.replay"); err != nil || string(retained) != "previous recorded history" {
		t.Fatalf("failed object write deleted recorded history: %q %v", retained, err)
	}
	entries, err := os.ReadDir(objects.Root)
	if err != nil || len(entries) != 1 || entries[0].Name() != "recorded.replay" {
		t.Fatalf("canceled write left new/temp output: %v %v", entries, err)
	}
}

func TestInvalidPublicationTargetRetainsRecordedHistory(t *testing.T) {
	previousBytes := maxObjectBytesTotal
	maxObjectBytesTotal = 8
	t.Cleanup(func() { maxObjectBytesTotal = previousBytes })
	objects := Files{Root: t.TempDir()}
	if err := objects.Put(context.Background(), "recorded.replay", []byte("retained")); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(objects.Root, "blocked.replay"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := objects.Put(context.Background(), "blocked.replay", []byte("new-data")); err == nil {
		t.Fatal("invalid publication destination accepted")
	}
	if retained, err := objects.Get(context.Background(), "recorded.replay"); err != nil || string(retained) != "retained" {
		t.Fatalf("failed publication deleted recorded history: %q %v", retained, err)
	}
}
