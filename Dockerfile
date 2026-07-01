# syntax=docker/dockerfile:1

# ── Build stage ────────────────────────────────────────────────────────────
# Node 22 LTS (Vite 8 needs >= 22.12). pnpm is pinned via the packageManager
# field in package.json and activated by Corepack, so the build resolves the
# exact same pnpm on CI, in Docker, and on a laptop.
FROM node:22-alpine AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
RUN corepack enable

# Install deps first (cached layer): only re-runs when the manifest/lock change.
# pnpm-workspace.yaml carries `allowBuilds` (sharp/esbuild) — pnpm 11 refuses to
# run those native build scripts without it and `install` fails.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Then the source and the production build → dist/.
COPY . .
RUN pnpm build

# ── Runtime stage ──────────────────────────────────────────────────────────
# Tiny Caddy image serves the static dist/ and reverse-proxies /api. Node and
# node_modules are left behind in the build stage.
FROM caddy:2-alpine

# Run rootless on an unprivileged port. TLS is handled by the host proxy, so
# Caddy never needs root or the low-port capability.
RUN addgroup -S app && adduser -S -G app app \
	&& mkdir -p /data /config /srv \
	&& chown -R app:app /data /config /srv

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=app:app /app/dist /srv

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
	CMD wget -qO- http://localhost:8080/ >/dev/null 2>&1 || exit 1

# The base image's default entrypoint runs:
#   caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
