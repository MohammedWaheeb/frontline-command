package main

import (
	"fmt"
	"frontlinecommand/pkg/content"
	"os"
)

func main() {
	c, e := content.Base()
	if e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
	fmt.Printf("Rules %s: %d units, %d buildings, %d upgrades; SHA-256 %s\n", content.Version, len(c.Units()), len(c.Buildings()), len(c.Upgrades()), c.Hash())
	for _, path := range os.Args[1:] {
		b, e := os.ReadFile(path)
		if e != nil {
			fmt.Fprintln(os.Stderr, e)
			os.Exit(1)
		}
		m, e := content.DecodeMap(b)
		if e != nil {
			fmt.Fprintf(os.Stderr, "%s: %v\n", path, e)
			os.Exit(1)
		}
		fmt.Printf("Validated map %s (%dx%d, %d starts)\n", m.ID, m.Width, m.Height, len(m.Spawns))
	}
}
