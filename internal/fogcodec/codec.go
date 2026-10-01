// Package fogcodec encodes only already-disclosed row-major visibility masks.
// It has no simulation, protocol, rendering, or transport dependencies.
package fogcodec

import "errors"

const MaxTiles uint32 = 65536

var (
	ErrCardinality = errors.New("fog mask cardinality mismatch")
)

func byteCount(tiles uint32) (int, error) {
	if tiles == 0 || tiles > MaxTiles {
		return 0, ErrCardinality
	}
	return int((tiles + 7) / 8), nil
}

// Pack maps tile i to bit i%8 in byte i/8. Unused high bits are always zero.
func Pack(mask []bool, tiles uint32) ([]byte, error) {
	n, err := byteCount(tiles)
	if err != nil || len(mask) != int(tiles) {
		return nil, ErrCardinality
	}
	out := make([]byte, n)
	for i, visible := range mask {
		if visible {
			out[i/8] |= 1 << uint(i%8)
		}
	}
	return out, nil
}

// Normalize copies an exact-cardinality bitset and clears unused tail bits.
// Padding cannot create tiles or alter any disclosed in-range bit.
func Normalize(packed []byte, tiles uint32) ([]byte, error) {
	n, err := byteCount(tiles)
	if err != nil || len(packed) != n {
		return nil, ErrCardinality
	}
	out := append([]byte(nil), packed...)
	if tail := tiles % 8; tail != 0 {
		out[n-1] &= byte((1 << tail) - 1)
	}
	return out, nil
}

// Unpack returns exactly tiles booleans, without inferring or unioning masks.
func Unpack(packed []byte, tiles uint32) ([]bool, error) {
	canonical, err := Normalize(packed, tiles)
	if err != nil {
		return nil, err
	}
	out := make([]bool, int(tiles))
	for i := range out {
		out[i] = canonical[i/8]&(1<<uint(i%8)) != 0
	}
	return out, nil
}
