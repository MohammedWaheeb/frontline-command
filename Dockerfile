# syntax=docker/dockerfile:1
# Build for the target architecture: the package builder executes a native Go
# helper to generate the browser runtime version. Supports linux/amd64 and arm64.
FROM golang:1.27.1-bookworm AS go-toolchain
FROM node:26.5.0-bookworm-slim AS build
COPY --from=go-toolchain /usr/local/go /usr/local/go
ENV PATH="/usr/local/go/bin:${PATH}" CGO_ENABLED=0 GOTOOLCHAIN=local

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
# Match the project's protoc version; verify the upstream release checksums.
RUN set -eu; \
    case "$(dpkg --print-architecture)" in \
      amd64) arch=x86_64; checksum=121f6c7afe1d4d0e3ea6aab9432038599250134cbf4474cb1167d2c7decd4278 ;; \
      arm64) arch=aarch_64; checksum=8b8f18bd2b30346efbc698dd5a73dd7c805f3ef8380f6dfc95c768f3f1852f6a ;; \
      *) echo "Unsupported architecture" >&2; exit 1 ;; \
    esac; \
    curl -fsSL --retry 3 "https://github.com/protocolbuffers/protobuf/releases/download/v36.2/protoc-36.2-linux-${arch}.zip" -o /tmp/protoc.zip; \
    echo "${checksum}  /tmp/protoc.zip" | sha256sum -c -; \
    unzip -q /tmp/protoc.zip -d /usr/local; \
    rm /tmp/protoc.zip

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY client/package.json client/package-lock.json ./client/
RUN npm --prefix client ci --no-audit --no-fund

COPY cmd ./cmd
COPY internal ./internal
COPY pkg ./pkg
COPY protocol ./protocol
COPY scripts ./scripts
COPY licenses ./licenses
COPY content ./content
COPY client ./client
COPY assets ./assets
COPY docs/local-package.md docs/player-guide.md ./docs/
COPY LICENSE ./LICENSE
# Reuse the existing content validation, WASM/client build, product integrity
# checks and third-party license packaging. Art is shipped pre-rendered.
ENV FRONTLINE_PACKAGE_DIR=/out
RUN node scripts/local.mjs build

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 frontline \
    && useradd --uid 10001 --gid frontline --no-create-home --home-dir /data frontline \
    && mkdir /data \
    && chown frontline:frontline /data
WORKDIR /opt/frontline
COPY --from=build /out/ ./
COPY --from=build /src/LICENSE ./LICENSE
USER 10001:10001
VOLUME ["/data"]
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl --fail --silent --max-time 4 http://127.0.0.1:8080/api/v1/health > /dev/null || exit 1
ENTRYPOINT ["/opt/frontline/frontline"]
CMD ["-lan", "-addr", "0.0.0.0:8080", "-data", "/data", "-static", "/opt/frontline/client", "-maps", "/opt/frontline/content/maps", "-missions", "/opt/frontline/content/missions"]
