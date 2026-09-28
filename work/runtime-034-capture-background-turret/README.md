# Background turret attempt — unchanged main win and optional loss

Source `0484fb84ad1b3f6fc74c2a3ffe162589bd3a131055edebefa5f985ce08087ce5`;
binary `14bf082165e116c666c85b8c787adf2ed309c2a748067099f12c85fcc6ffc307`.
The optional background turret plan never executes: before enough spare credits
exist, the owned rig is lost at tick4570. The plan abandons without pausing the
army or reserving money. Actual mission still completes at8313 with factory
lost, the same finalhash `5fe8b425898b4ba76fd6f0f7775ca55db6f2481f5e4b4391e531802d35c60ca7`
as the original positioned-rifle-screen route. Optional test correctly fails.
No construction success is claimed. Exact fail artifacts and source preserved.

Next step separates tactical route choice from required optional assertion so
the MAIN Hard acceptance leaf can verify that earned main victory through all
ordinary midpoint/full-replay/restart/surrender gates. The optional leaf retains
its required factory-preservation assertion and remains unresolved.
