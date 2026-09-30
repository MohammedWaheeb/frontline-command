package main

import (
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/content"
	"path/filepath"
)

// Only the authored public marker contract is read, never scenario conditions.
type publicTaskPresentation struct {
	MissionID      string `json:"mission_id"`
	MissionVersion string `json:"mission_version"`
	Markers        []struct {
		ID        string `json:"id"`
		Objective string `json:"objective"`
		Region    string `json:"region"`
	} `json:"markers"`
}

func validatePublicTaskPresentation(mission content.Mission, presentation publicTaskPresentation) error {
	if presentation.MissionID != mission.ID || presentation.MissionVersion != mission.Version {
		return fmt.Errorf("public task presentation identity/version mismatch")
	}
	for _, task := range mission.PublicTasks {
		matches := 0
		for _, marker := range presentation.Markers {
			if marker.ID == task.Marker {
				if marker.Objective != task.Objective || marker.Region != task.Region {
					return fmt.Errorf("public task marker/objective/region mismatch")
				}
				matches++
			}
		}
		if matches != 1 {
			return fmt.Errorf("public task needs one actually presented marker")
		}
	}
	return nil
}

func publicTaskPresentations(root string, missions map[string]content.Mission) error {
	needed := map[string]bool{}
	for id, mission := range missions {
		if len(mission.PublicTasks) > 0 {
			needed[id] = true
		}
	}
	if len(needed) == 0 {
		return nil
	}
	if err := files(filepath.Join(root, "presentation"), 2<<20, func(_ string, data []byte) error {
		var presentation publicTaskPresentation
		if err := json.Unmarshal(data, &presentation); err != nil {
			return err
		}
		mission, exists := missions[presentation.MissionID]
		if !exists || len(mission.PublicTasks) == 0 {
			return nil
		}
		if !needed[mission.ID] {
			return fmt.Errorf("duplicate public task presentation")
		}
		if err := validatePublicTaskPresentation(mission, presentation); err != nil {
			return err
		}
		delete(needed, mission.ID)
		return nil
	}); err != nil {
		return err
	}
	if len(needed) != 0 {
		return fmt.Errorf("missing public task presentation")
	}
	return nil
}
