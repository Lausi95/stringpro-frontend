# Build and deploy via GitHub Actions → GHCR → Ansible onto a Traefik VServer

ADR 0013 containerized the SPA (multi-stage `Dockerfile` → Caddy on `:8080`, TLS terminated upstream, `/api` proxied to the public backend, `BACKEND_ORIGIN` overridable at runtime) but explicitly deferred CI/CD: *"The GitHub Actions build is deferred; the Dockerfile takes no build args, so wiring CI later is additive."* This ADR wires that pipeline. Nothing in the image changes.

## Topology

`push to main` → **build job** (GitHub-hosted runner) builds `linux/amd64` and pushes to GHCR → **deploy job** (same workflow) runs Ansible **from the runner** over SSH into the VServer → Ansible templates a compose stack into `~/stringpro-frontend` and brings it up behind the server's existing Traefik.

```
GitHub Actions (push to main)
├─ build:  docker buildx → ghcr.io/lausi95/stringpro-frontend:<sha> + :latest
└─ deploy: ansible-playbook (over SSH, user tom@lausi95.net:22)
             └─ templates docker-compose.yml + .env(IMAGE_TAG=<sha>) → ~/stringpro-frontend
                └─ docker compose pull && up -d (wait: healthy)
                     └─ Traefik (external network `traefik`) routes
                        Host(`stringpro.lausi95.net`) websecure → container:8080
```

## Decisions

**Image distribution: GHCR, public package, pinned by commit SHA.** CI pushes two tags — the immutable commit `<sha>` and a moving `latest`. The package is **public**, so the server pulls with **no credentials** — no registry auth on the server, nothing in Ansible or compose. The bundle is client-side JS that ships to browsers anyway, so the image is not a secret. Ansible templates the exact `<sha>` into the server's `.env` as `IMAGE_TAG` and pulls that digest, so the running version is always pinned and reproducible; `latest` exists for humans only. The build push authenticates with the built-in `GITHUB_TOKEN` (workflow needs `permissions: { contents: read, packages: write }`) — no PAT.

**Auto-deploy on push to main, single workflow.** Merge to `main` = live. The build job and deploy job are stages of one workflow; deploy depends on build. A `concurrency` group cancels/serializes overlapping deploys so two pushes can't race the compose stack.

**Rollback = re-run or revert, not tag-selection.** We deliberately did *not* add a `workflow_dispatch` release gate, so there is no button to hand-pick a tag. Rollback is therefore: re-run the older commit's successful workflow (rebuilds that SHA and redeploys it), or `git revert` + push. SHA pinning still buys reproducibility and an unambiguous "what's running"; it does **not** buy a one-click tag picker. (If that ever becomes painful, adding a `workflow_dispatch` deploy that takes a tag input is additive.)

**Traefik integration via Docker-provider labels.** The compose service carries:
- `traefik.enable=true`
- `traefik.http.routers.stringpro.rule=Host(\`stringpro.lausi95.net\`)`
- `traefik.http.routers.stringpro.entrypoints=websecure`
- `traefik.http.routers.stringpro.tls.certresolver=letsencrypt`
- `traefik.http.services.stringpro.loadbalancer.server.port=8080`

The container publishes **no host ports** — Traefik reaches it over the shared external network `traefik` (declared `external: true` in compose; owned/created by the Traefik stack, not this one). HTTP→HTTPS redirect is handled **globally** by Traefik's entrypoint config, so the service needs only the single `websecure` router — no per-service redirect middleware. `restart: unless-stopped`.

**Ansible lives in-repo under `ansible/`,** versioned alongside the code it ships. A static inventory pins `lausi95.net` / user `tom` / port `22`. The playbook: ensures `~/stringpro-frontend` exists → templates `docker-compose.yml.j2` and `.env.j2` → runs **`community.docker.docker_compose_v2`** with `pull: always` and **`wait: true`** (which blocks until containers are running *and* healthy against the Dockerfile `HEALTHCHECK`, failing the deploy otherwise — this is the deploy-verification gate, no custom poll loop). The runner installs the collection via `ansible-galaxy collection install community.docker`.

**`BACKEND_ORIGIN` / `BACKEND_HOST` set explicitly in compose** (`https://stringpro-backend.lausi95.net`) rather than relying on the image's Caddyfile default — the deployed backend target is visible at the deploy layer and can't silently drift with an image change.

**Dedicated SSH deploy key.** A keypair used only for CI→server deploy: public half in `tom`'s `authorized_keys`, private half in the `SSH_PRIVATE_KEY` GitHub secret. A GitHub-secret leak exposes only this deploy key (revocable independently), never a personal login.

**Host-key pinned via a GHA secret.** `SSH_KNOWN_HOSTS` (a GitHub secret holding `ssh-keyscan lausi95.net` output) is written to a `known_hosts` file at deploy time and used by Ansible — the connection is verified against a known fingerprint every run (no TOFU, no disabled checking), while keeping the repo clean.

## First-deploy bootstrap (ordered — the naive first run fails)

GHCR creates new packages **private by default**. Because deploy is automatic and the package is meant to be public, the *first* push to `main` would build+push (creating a **private** package) and then the anonymous `docker compose pull` on the server would be **denied** — a confusing red deploy with a healthy-looking build. One-time bootstrap:

1. Push `main` once. The build job creates `ghcr.io/lausi95/stringpro-frontend` (private). The deploy job is expected to fail at `pull`.
2. In GitHub → the package's settings, flip **Package visibility → Public**.
3. Re-run the failed deploy job. It now pulls anonymously and succeeds.

Subsequent pushes are fully automatic.

## Prerequisites (outside the pipeline — verify before first deploy)

- **DNS:** an `A`/`AAAA` record for `stringpro.lausi95.net` → the server's IP (Traefik's Let's Encrypt HTTP-01/TLS challenge and routing both need it resolving).
- **Keycloak:** the client's redirect URIs / web origins must include `https://stringpro.lausi95.net/*`, or login redirects back and breaks. (Realm `https://auth.lausi95.net/realms/stringpro`.)
- **GitHub:** the repo is pushed under the `lausi95` owner; secrets `SSH_PRIVATE_KEY` and `SSH_KNOWN_HOSTS` are set.
- **Server:** the deploy key's public half is in `tom`'s `authorized_keys`.

## Assumptions (true by inspection, stated so a future change doesn't silently break them)

- **Traefik uses the Docker provider** (label discovery). The entire label plan is void under the file provider.
- **The external `traefik` network is a normal bridge with internet egress.** The container sits on *only* this network, and Caddy's `/api` proxy reaches out to the *public* `stringpro-backend.lausi95.net` — so `internal: true` on that network would break the API.
- **The server already has Docker + the Compose v2 plugin + Python 3** — all near-certain since it runs Traefik in Docker, but the Compose module and Ansible's remote interpreter require them.

## Consequences

- Merging to `main` ships to production with no human step (after the one-time public-visibility bootstrap). The deploy is gated on the container reporting *healthy*, so a crash-looping or non-booting image fails the pipeline red instead of silently replacing a working one.
- The deployed version is a pinned SHA, reproducible and greppable on the box (`~/stringpro-frontend/.env`), but rollback is re-run/revert, not tag selection.
- Deploy config (compose, env, Traefik labels, inventory) is versioned with the app in `ansible/`, so the frontend's code and its deployment never drift into separate repos.
- Adds four repo artifacts: `.github/workflows/deploy.yml`, `ansible/` (playbook + inventory + `docker-compose.yml.j2` + `.env.j2`). The image (`Dockerfile`, `Caddyfile`) is untouched — this ADR is purely additive, as 0013 anticipated.
