# Preserved destruction test failure

The run did not pass. Light- and heavy-vehicle images were captured before an assertion failed. The final report writer then threw on a raw protobuf BigInt and obscured the original assertion; `failure.png`, the exact driver and frozen fixture, and the outer log remain available. No cause for the original assertion is claimed from the image alone.

The successor fixture converts actor and event records with their protobuf JSON schemas. The driver also serializes any remaining diagnostic BigInts and closes the browser/server in a nested `finally` even if report writing fails. A fresh run is required; the missing report is not reconstructed as a success.
