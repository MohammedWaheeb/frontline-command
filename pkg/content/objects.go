package content

// Object classes are rules, not map layout or art. All class footprints become
// passable rubble when destroyed; mandatory routes may not contain these objects.
type ObjectClass struct {
	ID       string `json:"id"`
	HP       int64  `json:"hp"`
	Width    int32  `json:"width"`
	Height   int32  `json:"height"`
	Capacity int32  `json:"capacity"`
}

type MapObject struct {
	ID       uint32 `json:"id"`
	Class    string `json:"class"`
	Position Point  `json:"position"`
}

func ObjectClasses() []ObjectClass {
	return []ObjectClass{
		{ID: "light_prop", HP: 150000, Width: 1, Height: 1},
		{ID: "heavy_prop", HP: 600000, Width: 2, Height: 2},
		{ID: "garrison", HP: 900000, Width: 3, Height: 3, Capacity: 2},
	}
}
func ObjectRule(id string) (ObjectClass, bool) {
	for _, c := range ObjectClasses() {
		if c.ID == id {
			return c, true
		}
	}
	return ObjectClass{}, false
}
func (o MapObject) TileIndices(width int32) []int {
	c, ok := ObjectRule(o.Class)
	if !ok {
		return nil
	}
	left, top := o.Position.X-c.Width*500, o.Position.Y-c.Height*500
	right, bottom := o.Position.X+c.Width*500, o.Position.Y+c.Height*500
	var result []int
	for y := top / 1000; y <= (bottom-1)/1000; y++ {
		for x := left / 1000; x <= (right-1)/1000; x++ {
			result = append(result, int(y*width+x))
		}
	}
	return result
}
