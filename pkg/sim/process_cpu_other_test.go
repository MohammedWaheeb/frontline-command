//go:build !darwin && !linux

package sim

// Process CPU time is unavailable on these targets. The route benchmark still
// reports ordinary wall time and work counts, without a misleading CPU metric.
func processCPUTime() int64 { return 0 }
