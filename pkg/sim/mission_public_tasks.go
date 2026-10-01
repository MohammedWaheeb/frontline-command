package sim

// MissionTaskView contains only explicitly published task/marker metadata and
// authored public map geometry. It conveys no actor IDs, vision, predicates,
// conditions, timers, enemy clearance or permissions to command a teammate.
type MissionTaskView struct {
	ID        string `json:"id"`
	Objective string `json:"objective"`
	Kind      string `json:"kind"`
	Marker    string `json:"marker"`
	Region    string `json:"region"`
	Team      uint32 `json:"team"`
	Min       Vec    `json:"min"`
	Max       Vec    `json:"max"`
}

func (e *Engine) publicMissionTasks(team uint32) []MissionTaskView {
	if e.state.Mission == nil {
		return nil
	}
	definition := e.state.Mission.Definition
	var tasks []MissionTaskView
	for _, task := range definition.PublicTasks {
		if task.Team != team || task.MissionVersion != definition.Version || task.MapVersion != e.state.Map.Version {
			continue
		}
		for _, region := range e.state.Map.Regions {
			if region.ID != task.Region {
				continue
			}
			tasks = append(tasks, MissionTaskView{
				ID: task.ID, Objective: task.Objective, Kind: task.Kind,
				Marker: task.Marker, Region: task.Region, Team: task.Team,
				Min: Vec{X: region.Min.X, Y: region.Min.Y},
				Max: Vec{X: region.Max.X, Y: region.Max.Y},
			})
			break
		}
	}
	return tasks
}
