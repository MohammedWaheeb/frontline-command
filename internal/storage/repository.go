// Package storage contains replaceable service repositories. Simulation ticks
// never call a repository; callers persist immutable copies outside the engine.
package storage

import (
	"context"
	"errors"
)

var ErrNotFound = errors.New("not_found")
var ErrConflict = errors.New("revision_conflict")
var ErrUnauthorized = errors.New("unauthorized")

type Profile struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Created int64  `json:"created"`
	Local   bool   `json:"local"`
}
type Save struct {
	ID       string `json:"id"`
	Owner    string `json:"owner"`
	Name     string `json:"name"`
	Revision int64  `json:"revision"`
	Updated  int64  `json:"updated"`
	Data     []byte `json:"-"`
}
type Result struct {
	ID      string `json:"id"`
	Payload []byte `json:"payload"`
	Created int64  `json:"created"`
	Void    bool   `json:"void"`
}
type MapRecord struct {
	ID       string `json:"id"`
	Owner    string `json:"owner"`
	Title    string `json:"title"`
	Revision int64  `json:"revision"`
	Data     []byte `json:"-"`
}
type AccountRepository interface {
	CreateProfile(context.Context, string) (Profile, string, error)
	Authenticate(context.Context, string) (Profile, error)
}
type SaveRepository interface {
	PutSave(context.Context, Save, int64) (Save, error)
	GetSave(context.Context, string, string) (Save, error)
	ListSaves(context.Context, string) ([]Save, error)
	DeleteSave(context.Context, string, string, int64) error
}
type ResultRepository interface {
	CommitResult(context.Context, Result) (bool, error)
	GetResult(context.Context, string) (Result, error)
	ListResults(context.Context, int) ([]Result, error)
}
type MapRepository interface {
	PutMap(context.Context, MapRecord, int64) (MapRecord, error)
	GetMap(context.Context, string) (MapRecord, error)
	ListMaps(context.Context) ([]MapRecord, error)
}
type ObjectRepository interface {
	Put(context.Context, string, []byte) error
	Get(context.Context, string) ([]byte, error)
}
