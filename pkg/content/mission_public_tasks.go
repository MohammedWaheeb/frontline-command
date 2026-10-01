package content

import "fmt"

// This validates the declaration itself, including embedded definitions after
// Save/Restore. The authored-content checker additionally joins its marker to
// the shipped public presentation; a condition/tag is never that join.
func (v Mission) validatePublicTasks(m Map, humanTeam uint32) error {
	if len(v.PublicTasks) > 32 {
		return fmt.Errorf("public task limit exceeded")
	}
	seen := map[string]bool{}
	for _, task := range v.PublicTasks {
		if task.ID == "" || len(task.ID) > 80 || seen[task.ID] || task.Objective == "" || len(task.Objective) > 80 || task.Marker == "" || len(task.Marker) > 80 || task.Region == "" || len(task.Region) > 80 {
			return fmt.Errorf("invalid public task identity")
		}
		seen[task.ID] = true
		if task.Kind != "hold_region" || task.Team == 0 || task.Team != humanTeam || task.MissionVersion != v.Version || task.MapVersion != m.Version {
			return fmt.Errorf("invalid public task kind/team/version")
		}
		goal, region := false, false
		for _, objective := range v.Objectives {
			if objective.ID == task.Objective && !objective.Optional && !objective.Failure && !objective.AtEnd {
				goal = true
			}
		}
		for _, candidate := range m.Regions {
			if candidate.ID == task.Region {
				region = true
			}
		}
		if !goal || !region {
			return fmt.Errorf("public task requires a primary goal and public region")
		}
	}
	return nil
}
