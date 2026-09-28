# Optional Hard mobile continuation — full queue submission failure

Source698e509d0a6e0a4c5d43a79caca9557423d2057300a739a8643e72bdc31f8ed7;
binaryd5fe21007e92075011d3d1aa1744fbcf0d7bc9c59eb2ddd0587887d2d4c65cca.
This commander omits discretionary forward fortification after factory repair;
no authored objective requires it. Prices, available resources, rules and maximum
waits stay fixed. Main Hard and Easy/Normal sequences are unchanged.

Factory captured2,484. An actual completed13-actor/two-tank force is ready at4,725;
relay2 captured6,121. The mission is unfinished when the stage3 commander submits
an unconditional engineer train order into full barracks28 at6,882. The actual
`queue_full` receipt at6,883 correctly fails acceptance. Every prior completed
batch, attempted rejected order, final authoritative save and owner view remain.
This is a driver submission bug, not an army defeat. The next scoped correction
waits/retries ordinary engineer admission inside the original2,400-tick worker
budget and avoids duplicate queued engineers. Build1.949s/mission18.702s are
shared-host correctness durations only.
