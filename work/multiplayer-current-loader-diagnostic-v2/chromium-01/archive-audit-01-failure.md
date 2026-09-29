The first post-run archive audit failed JavaScript object equality because the
recomputed helper retains optional `server: undefined` members while JSON
serialization omits them. The corrected comparison applies the same JSON
boundary before deep equality. No evidence record, actual browser source,
classification, descriptor or assertion about bytes/errors was changed.
This author-tool failure is separate from the preserved actual strict FAIL.
