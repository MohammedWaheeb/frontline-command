package storage

import (
	"context"
	"errors"
	"os"
	"path/filepath"
)

type Files struct{ Root string }

func (f Files) Put(ctx context.Context, id string, data []byte) error {
	if !ValidID(id) || len(data) > 64<<20 {
		return errors.New("invalid object")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := os.MkdirAll(f.Root, 0700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(f.Root, ".write-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if _, err = tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err = tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err = tmp.Close(); err != nil {
		return err
	}
	if err = ctx.Err(); err != nil {
		return err
	}
	if err = os.Rename(name, filepath.Join(f.Root, id)); err != nil {
		return err
	}
	dir, err := os.Open(f.Root)
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}
func (f Files) Get(ctx context.Context, id string) ([]byte, error) {
	if !ValidID(id) {
		return nil, errors.New("invalid object ID")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	b, err := os.ReadFile(filepath.Join(f.Root, id))
	if errors.Is(err, os.ErrNotExist) {
		err = ErrNotFound
	}
	return b, err
}
