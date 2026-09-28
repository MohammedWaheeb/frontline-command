# Preserved test bundler failure

No browser or host was started. The isolated generated protobuf source sits outside the client tree; esbuild could not resolve its `@bufbuild/protobuf/codegenv2` import. The successor explicitly resolves all protobuf imports from the installed client dependency, without changing game source or runtime bytes. This failed attempt is not a gameplay or renderer result.
