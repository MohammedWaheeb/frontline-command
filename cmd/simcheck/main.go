// simcheck is a native headless harness for parity, save and replay evidence.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"log"
	"os"
	"time"
)

func main() {
	input := flag.String("input", "", "config JSON or save file")
	restore := flag.Bool("restore", false, "input is a save envelope")
	advance := flag.Uint("ticks", 0, "number of ticks to advance")
	output := flag.String("save", "", "optional output save")
	flag.Parse()
	if *input == "" {
		log.Fatal("-input is required")
	}
	data, err := os.ReadFile(*input)
	if err != nil {
		log.Fatal(err)
	}
	catalog, err := content.Base()
	if err != nil {
		log.Fatal(err)
	}
	var engine *sim.Engine
	if *restore {
		engine, err = sim.Restore(catalog, data)
	} else {
		var cfg sim.Config
		if err = json.Unmarshal(data, &cfg); err == nil {
			engine, err = sim.New(catalog, cfg)
		}
	}
	if err != nil {
		log.Fatal(err)
	}
	start := time.Now()
	for i := uint(0); i < *advance && !engine.Outcome().Finished; i++ {
		engine.Advance()
	}
	elapsed := time.Since(start)
	if *output != "" {
		save, err := engine.Save()
		if err != nil {
			log.Fatal(err)
		}
		if err = os.WriteFile(*output, save, 0600); err != nil {
			log.Fatal(err)
		}
	}
	out := map[string]any{"tick": engine.Tick(), "hash": engine.Hash(), "metadata": engine.Metadata(), "outcome": engine.Outcome(), "elapsed_ms": elapsed.Milliseconds()}
	b, _ := json.MarshalIndent(out, "", "  ")
	fmt.Println(string(b))
}
