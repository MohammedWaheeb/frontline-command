# SY03 logistics pilot — compile failure preserved

The frozen source 162d510c105c19b0b9b374babd1048a3049eab315eff9fe603a0f188a8e72e5c failed to compile because the test driver compared/passed a public uint32 field ID as sim.ID without explicit conversion. No mission ran or changed state. The source and failed build log are retained. The separate successor ../runtime-034-territory-logistics-v2 changes only those two explicit conversions.
