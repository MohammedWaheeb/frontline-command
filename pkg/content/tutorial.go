package content

import "fmt"

func (v Mission) tutorialHuman() (uint32, error) {
	var human uint32
	for i, player := range v.Players {
		if player.Control(i) == "human" {
			if human != 0 {
				return 0, fmt.Errorf("faction tutorial must have one human")
			}
			human = player.ID
		}
	}
	if human == 0 {
		return 0, fmt.Errorf("faction tutorial needs a human")
	}
	return human, nil
}

func (v Mission) applyTutorialVariant(variant TutorialVariant, human uint32) Mission {
	result := v
	result.TutorialVariants = nil
	result.Faction, result.Briefing = variant.Faction, variant.Briefing
	result.Players = append([]MissionPlayer(nil), v.Players...)
	for i := range result.Players {
		if result.Players[i].ID == human {
			result.Players[i].Faction = variant.Faction
		}
	}
	result.Initial = append([]MissionSpawn(nil), variant.Initial...)
	for _, spawn := range v.Initial {
		if spawn.Owner != human {
			result.Initial = append(result.Initial, spawn)
		}
	}
	result.Objectives = variant.Objectives
	result.Triggers = variant.Triggers
	return result
}

func (v Mission) validateTutorialVariants(c *Catalog, m Map) error {
	if v.Mode != "tutorial" || len(v.TutorialVariants) != 4 {
		return fmt.Errorf("faction variants require a tutorial and all four factions")
	}
	human, err := v.tutorialHuman()
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, variant := range v.TutorialVariants {
		if !ValidFaction(variant.Faction) || seen[variant.Faction] || variant.Briefing == "" || len(variant.Initial) > 256 {
			return fmt.Errorf("invalid tutorial faction variant")
		}
		seen[variant.Faction] = true
		for _, spawn := range variant.Initial {
			if spawn.Owner != human {
				return fmt.Errorf("tutorial variant may replace only human initial assets")
			}
			if unit, ok := c.Unit(spawn.Type); ok && unit.Faction != variant.Faction {
				return fmt.Errorf("tutorial variant unit faction mismatch")
			}
			if building, ok := c.Building(spawn.Type); ok && building.Faction != "" && building.Faction != variant.Faction {
				return fmt.Errorf("tutorial variant building faction mismatch")
			}
		}
		if err := v.applyTutorialVariant(variant, human).Validate(c, m); err != nil {
			return fmt.Errorf("tutorial variant %s: %w", variant.Faction, err)
		}
	}
	return nil
}

// ForTutorialFaction validates the complete authored template, then returns the
// selected effective definition. Its initial assets and mission script are saved
// by Go so save/replay never depends on a later client-side transformation.
func (v Mission) ForTutorialFaction(c *Catalog, m Map, faction string) (Mission, error) {
	if faction != "" && v.Mode != "tutorial" {
		return Mission{}, fmt.Errorf("faction selection requires a tutorial")
	}
	if err := v.Validate(c, m); err != nil {
		return Mission{}, err
	}
	if len(v.TutorialVariants) == 0 {
		if faction != "" && faction != v.Faction {
			return Mission{}, fmt.Errorf("mission has no selectable faction")
		}
		return v, nil
	}
	if faction == "" {
		faction = v.Faction
	}
	human, err := v.tutorialHuman()
	if err != nil {
		return Mission{}, err
	}
	for _, variant := range v.TutorialVariants {
		if variant.Faction == faction {
			return v.applyTutorialVariant(variant, human), nil
		}
	}
	return Mission{}, fmt.Errorf("unknown tutorial faction")
}
