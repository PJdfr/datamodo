# datamodo local edition — app image. Built from the PRUNED local-only tree
# (scripts/build-local-package.mjs), so the cloud layer is physically absent
# from the image, not just disabled.
#
#   node scripts/build-local-package.mjs            # → dist/local-package/
#   docker build -f packaging/local/docker/Dockerfile -t datamodo/local dist/local-package
#
# The container expects a real Postgres via DATABASE_URL (compose provides it,
# with neon/schema.sql loaded by initdb) — no embedded pglite in Docker, and
# therefore no single-connection shim (lib/prisma.ts pools normally).
# Model weights are NOT baked in: Ollama runs on the HOST by default (§7 —
# macOS containers can't use the GPU) or as the compose `gpu` profile on
# Linux/NVIDIA; either way the app just talks to OLLAMA_BASE_URL.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# The pruned tree ships without a lockfile — a plain install resolves from the
# same ranges the repo pins.
RUN npm install --no-audit --no-fund
COPY . .
ENV DATAMODO_LOCAL=1 NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATAMODO_LOCAL=1 NEXT_TELEMETRY_DISABLED=1 \
    DATAMODO_DATA_DIR=/data BLOB_DIR=/data/blobs PORT=4321 HOSTNAME=0.0.0.0
COPY --from=build /app /app
# /data holds everything user-owned: blobs, llm.json, connectors.json, secrets.
VOLUME /data
EXPOSE 4321
# The entry wraps `next start` with the same local skin `datamodo serve` sets
# up (secrets, defaults, IMAP poller) — minus the embedded DB.
CMD ["node", "bin/docker-entry.mjs"]
