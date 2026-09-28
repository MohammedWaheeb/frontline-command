// Package viewproto converts only an already-authorized simulation view. It
// neither reads engine state nor makes visibility or gameplay decisions.
package viewproto

//go:generate go run ./gen

import (
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"strings"
	"unicode/utf8"
)

// Snapshot returns a detached protobuf value equivalent to the original
// encoding/json -> protojson conversion, including explicit optional zeros.
func Snapshot(view sim.View) *pb.PlayerSnapshot { return toPlayerSnapshot(view) }
func pointer[T any](value T) *T                 { return &value }
func optional[S, R any](value *S, convert func(S) *R) *R {
	if value == nil {
		return nil
	}
	return convert(*value)
}
func list[S, R any](values []S, convert func(S) R) []R {
	if values == nil {
		return nil
	}
	result := make([]R, len(values))
	for i, v := range values {
		result[i] = convert(v)
	}
	return result
}
func text(value string) string {
	// encoding/json replaces each invalid UTF-8 decoding unit with U+FFFD. Keep
	// that established contract; ordinary validated names allocate nothing here.
	if utf8.ValidString(value) {
		return value
	}
	return strings.Map(func(r rune) rune { return r }, value)
}
