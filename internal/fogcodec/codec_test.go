package fogcodec

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"testing"
)

type maskVector struct {
	Name        string   `json:"name"`
	Tiles       uint32   `json:"tiles"`
	TrueIndices []uint32 `json:"trueIndices"`
	PackedHex   string   `json:"packedHex"`
}

func TestSharedMaskVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var data struct {
		Vectors []maskVector `json:"vectors"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		t.Fatal(err)
	}
	if len(data.Vectors) != 9 {
		t.Fatal("shared literal vector set changed")
	}
	for _, v := range data.Vectors {
		t.Run(v.Name, func(t *testing.T) {
			mask := make([]bool, v.Tiles)
			for _, i := range v.TrueIndices {
				mask[i] = true
			}
			before := append([]bool(nil), mask...)
			want, err := hex.DecodeString(v.PackedHex)
			if err != nil {
				t.Fatal(err)
			}
			packed, err := Pack(mask, v.Tiles)
			if err != nil || !bytes.Equal(packed, want) {
				t.Fatalf("Pack=%x want=%x err=%v", packed, want, err)
			}
			decoded, err := Unpack(want, v.Tiles)
			if err != nil || !reflect.DeepEqual(decoded, mask) {
				t.Fatalf("Unpack mismatch err=%v", err)
			}
			if !reflect.DeepEqual(mask, before) {
				t.Fatal("encoder mutated disclosed mask")
			}
		})
	}
}

func TestFullLegalCardinality(t *testing.T) {
	for _, value := range []bool{false, true} {
		mask := make([]bool, MaxTiles)
		for i := range mask {
			mask[i] = value
		}
		packed, err := Pack(mask, MaxTiles)
		if err != nil || len(packed) != 8192 {
			t.Fatalf("maximum map err=%v bytes=%d", err, len(packed))
		}
		want := byte(0)
		if value {
			want = 255
		}
		for _, b := range packed {
			if b != want {
				t.Fatal("maximum map differs")
			}
		}
		decoded, err := Unpack(packed, MaxTiles)
		if err != nil || !reflect.DeepEqual(decoded, mask) {
			t.Fatal("maximum map round-trip", err)
		}
	}
}

func TestExactMaskCardinality(t *testing.T) {
	for _, bad := range []uint32{0, MaxTiles + 1, ^uint32(0)} {
		if _, err := Pack(nil, bad); !errors.Is(err, ErrCardinality) {
			t.Fatal("invalid tile count accepted", bad)
		}
		if _, err := Normalize(nil, bad); !errors.Is(err, ErrCardinality) {
			t.Fatal("invalid tile count normalized", bad)
		}
	}
	for _, size := range []int{8, 10} {
		if _, err := Pack(make([]bool, size), 9); !errors.Is(err, ErrCardinality) {
			t.Fatal("wrong bool count accepted")
		}
	}
	for _, size := range []int{0, 1, 3} {
		if _, err := Unpack(make([]byte, size), 9); !errors.Is(err, ErrCardinality) {
			t.Fatal("wrong byte count accepted")
		}
	}
}

func TestPaddingNormalizationAndIndependentOutputs(t *testing.T) {
	raw := []byte{0x81, 0xff}
	canonical, err := Normalize(raw, 9)
	if err != nil || !bytes.Equal(canonical, []byte{0x81, 1}) {
		t.Fatal("tail normalization", canonical, err)
	}
	if !bytes.Equal(raw, []byte{0x81, 0xff}) {
		t.Fatal("normalization mutated received bytes")
	}
	decoded, err := Unpack(raw, 9)
	if err != nil {
		t.Fatal(err)
	}
	for i, value := range decoded {
		if value != (i == 0 || i == 7 || i == 8) {
			t.Fatal("padding created a tile", i)
		}
	}
	canonical[0] = 0
	if raw[0] != 0x81 || !decoded[0] {
		t.Fatal("outputs share mutable storage")
	}
}

func TestMasksDoNotSynthesizeExplorationOrRetainLostVision(t *testing.T) {
	explored := []bool{true, true, false, false, true, false, false, false, true}
	visible := []bool{false, true, false, false, false, false, false, false, false}
	e, err := Pack(explored, 9)
	if err != nil {
		t.Fatal(err)
	}
	v, err := Pack(visible, 9)
	if err != nil {
		t.Fatal(err)
	}
	de, _ := Unpack(e, 9)
	dv, _ := Unpack(v, 9)
	if !reflect.DeepEqual(de, explored) || !reflect.DeepEqual(dv, visible) {
		t.Fatal("public mask planes changed")
	}
	visible[1] = false
	v, err = Pack(visible, 9)
	if err != nil {
		t.Fatal(err)
	}
	dv, _ = Unpack(v, 9)
	if dv[1] || !de[1] || de[2] || dv[2] {
		t.Fatal("lost sight or unknown tile was synthesized")
	}
}
