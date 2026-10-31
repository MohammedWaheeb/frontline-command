package main

import "testing"

func TestParseTrustedProxies(t *testing.T) {
	got, err := parseTrustedProxies(" 127.0.0.1, 172.16.0.0/12,::1,::ffff:10.0.0.1 ")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"127.0.0.1/32", "172.16.0.0/12", "::1/128", "10.0.0.1/32"}
	if len(got) != len(want) {
		t.Fatalf("got %v", got)
	}
	for i := range want {
		if got[i].String() != want[i] {
			t.Errorf("entry %d: got %s want %s", i, got[i], want[i])
		}
	}
	if empty, err := parseTrustedProxies(""); err != nil || len(empty) != 0 {
		t.Fatal("empty list must trust nothing", empty, err)
	}
	if _, err := parseTrustedProxies("proxy.example"); err == nil {
		t.Fatal("hostname accepted")
	}
}
