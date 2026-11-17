package storage

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestConcurrentObjectWritesRespectWholeStoreBounds(t *testing.T) {
	previousBytes, previousCount := maxObjectBytesTotal, maxObjectCount
	t.Cleanup(func() { maxObjectBytesTotal, maxObjectCount = previousBytes, previousCount })
	for _, tc := range []struct {
		name   string
		bytes  int
		budget int64
		count  int
	}{
		{name: "count", bytes: 64, budget: 1 << 20, count: 2},
		{name: "bytes", bytes: 64 << 10, budget: 128 << 10, count: 1000},
	} {
		t.Run(tc.name, func(t *testing.T) {
			maxObjectBytesTotal, maxObjectCount = tc.budget, tc.count
			for round := 0; round < 3; round++ {
				objects := Files{Root: t.TempDir()}
				cwd, err := os.Getwd()
				if err != nil {
					t.Fatal(err)
				}
				relative, err := filepath.Rel(cwd, objects.Root)
				if err != nil {
					t.Fatal(err)
				}
				copies := []Files{objects, {Root: relative}, {Root: objects.Root + string(os.PathSeparator) + "."}}
				start := make(chan struct{})
				results := make(chan error, 24)
				var workers sync.WaitGroup
				for i := 0; i < 24; i++ {
					workers.Add(1)
					go func(i int) {
						defer workers.Done()
						<-start
						results <- copies[i%len(copies)].Put(context.Background(), fmt.Sprintf("object-%02d.replay", i), []byte(strings.Repeat("x", tc.bytes)))
					}(i)
				}
				close(start)
				workers.Wait()
				close(results)
				for err := range results {
					if err != nil {
						t.Errorf("concurrent valid write failed: %v", err)
					}
				}
				entries, err := os.ReadDir(objects.Root)
				if err != nil {
					t.Fatal(err)
				}
				var count int
				var bytes int64
				for _, entry := range entries {
					if strings.HasPrefix(entry.Name(), ".") {
						t.Errorf("temporary file retained: %s", entry.Name())
						continue
					}
					info, err := entry.Info()
					if err != nil {
						t.Fatal(err)
					}
					count++
					bytes += info.Size()
				}
				if count > tc.count || bytes > tc.budget {
					t.Errorf("round %d exceeded object-store limits: count=%d/%d bytes=%d/%d", round, count, tc.count, bytes, tc.budget)
				}
			}
		})
	}
}

// Gate contention must not turn a five-second actor context into an unbounded
// wait, mutate history after cancellation, or block independent readers/stores.
func TestObjectWriteGateCancellationAndIndependentStore(t *testing.T) {
	busy := Files{Root: t.TempDir()}
	if err := busy.Put(context.Background(), "retained.replay", []byte("retained")); err != nil {
		t.Fatal(err)
	}
	gate := objectWriteGate(busy.Root)
	<-gate
	defer func() { gate <- struct{}{} }()
	independent := Files{Root: t.TempDir()}
	for attempts := 0; objectWriteGate(independent.Root) == gate && attempts < 64; attempts++ {
		independent.Root = t.TempDir()
	}
	separateStripe := objectWriteGate(independent.Root) != gate
	if !separateStripe && (runtime.GOOS == "darwin" || runtime.GOOS == "linux") {
		t.Fatal("known physical directory identities all fell back to the same gate")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	result := make(chan error, 1)
	go func() { result <- busy.Put(ctx, "canceled.replay", []byte("must not publish")) }()
	otherCtx, otherCancel := context.WithTimeout(context.Background(), time.Second)
	defer otherCancel()
	if separateStripe {
		if err := independent.Put(otherCtx, "independent.replay", []byte("independent")); err != nil {
			t.Fatalf("unrelated stripe blocked: %v", err)
		}
	} else {
		t.Log("platform lacks device/inode metadata; conservative shared gate applies")
	}
	if got, err := busy.Get(otherCtx, "retained.replay"); err != nil || string(got) != "retained" {
		t.Fatalf("write gate blocked or changed independent read: %q %v", got, err)
	}
	select {
	case err := <-result:
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("waiting writer ignored context: %v", err)
		}
	case <-otherCtx.Done():
		t.Fatal("canceled writer remained blocked on gate")
	}
	entries, err := os.ReadDir(busy.Root)
	if err != nil || len(entries) != 1 || entries[0].Name() != "retained.replay" {
		t.Fatalf("canceled waiting writer changed history: %v %v", entries, err)
	}
}

// APFS may resolve case and Unicode-normalization aliases to the same physical
// directory even after EvalSymlinks. They must share one quota admission gate.
func TestObjectWriteGateUsesPhysicalDirectoryIdentity(t *testing.T) {
	parent := t.TempDir()
	for _, names := range [][2]string{{"CaseStore", "caseStore"}, {"Unicode-\u00e9", "Unicode-e\u0301"}} {
		root := filepath.Join(parent, names[0])
		alias := filepath.Join(parent, names[1])
		if err := os.Mkdir(root, 0700); err != nil {
			t.Fatal(err)
		}
		info, err := os.Stat(root)
		if err != nil {
			t.Fatal(err)
		}
		aliasInfo, err := os.Stat(alias)
		if errors.Is(err, os.ErrNotExist) {
			t.Logf("filesystem treats %q and %q as distinct names", names[0], names[1])
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		if !os.SameFile(info, aliasInfo) {
			t.Logf("filesystem resolved %q as a distinct directory", names[1])
			continue
		}
		t.Logf("verified physical alias %q / %q", names[0], names[1])
		gate := objectWriteGate(root)
		if objectWriteGate(alias) != gate {
			t.Errorf("same physical directory has separate write gates: %q / %q", root, alias)
			continue
		}
		<-gate
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
		err = (Files{Root: alias}).Put(ctx, "alias.replay", []byte("must wait"))
		cancel()
		gate <- struct{}{}
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Errorf("alias bypassed held physical-directory gate: %v", err)
		}
		entries, err := os.ReadDir(root)
		if err != nil || len(entries) != 0 {
			t.Errorf("blocked alias writer changed store: %v %v", entries, err)
		}
	}
}
