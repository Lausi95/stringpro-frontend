# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git conventions

- Commit messages must follow **conventional commits**: `type(scope): description` (e.g. `feat(jobs): add stage progress bar`, `fix(auth): handle token expiry`)
- Always commit on the **current branch** — never create feature branches unless explicitly instructed
- Common types: `feat`, `fix`, `refactor`, `style`, `chore`, `docs`

## Commands

```bash
pnpm dev        # start dev server (http://localhost:5173)
pnpm build      # tsc + vite build → dist/
pnpm preview    # serve dist/ locally
```

No test suite is configured yet.

## Verifying changes

There is no automated test suite, so **after implementing any visual or behavioral change, verify it in a real browser using the `/claude-in-chrome` skill** — load the affected route against a running `pnpm dev` server, exercise the change, and check the console for errors. `pnpm build` (which runs `tsc`) is the only static gate; treat a clean build plus a browser check as the definition of done.

## Stack

- **Vite 8** + **React 19** + **TypeScript 6** — pure client-side SPA
- **react-router-dom v7** — client-side routing
- **keycloak-js** — authentication (no `@react-keycloak/web`; raw keycloak-js only)
- **lucide-react** — the only icon set; import named icons (e.g. `import { Plus, Search } from 'lucide-react'`)
- Package manager: **pnpm**

## Project overview

StringPro is a React (latest) SPA for managing a tennis stringing business — jobs, customers, string inventory, and payments. The app is strictly authenticated via Keycloak.

## Backend

| Environment | URL |
|---|---|
| Local API | `http://localhost:8080` |
| Production API | `https://backend.stringpro.lausi95.net` |
| API docs (OpenAPI/Swagger) | `http://localhost:8080/v3/api-docs` |

## Authentication

Keycloak realm: `https://auth.lausi95.net/realms/stringpro`

The keycloak singleton (`src/lib/keycloak.ts`) is initialized with `onLoad: 'login-required'` in `main.tsx` before React mounts — the app never renders without a valid token. `KeycloakProvider` (`src/lib/KeycloakContext.tsx`) exposes the token via `useKeycloakToken()`. Every API call must include `Authorization: Bearer <token>` using that hook.

Every route must be behind authentication; unauthenticated users are redirected to the Keycloak login page. Do not use `@react-keycloak/web` — the project uses raw `keycloak-js`.

## API integration

**Always consult `http://localhost:8080/v3/api-docs` (OpenAPI/Swagger) before implementing any backend integration.**

The dev server proxies `/api/*` → `http://localhost:8080/*` (configured in `vite.config.ts`, which strips the `/api` prefix). Pages call the API via `API_BASE = import.meta.env.VITE_API_BASE ?? '/api'`. Always attach `Authorization: Bearer ${token}` using `useKeycloakToken()`.

### API layer (`src/lib/api.ts`)

All backend calls live in `src/lib/api.ts` as standalone async functions — **pages never call `fetch` directly**. Follow the existing shape when adding endpoints:

- Each function takes `token` as its **first argument**, then ids, then a data object.
- Request/response types are co-located here and named `<Entity>Response`, `<Entity>FormData`, and `Paged<Entity>Response` (Spring-style paged envelope: `{ content, totalElements, totalPages, page, size }`).
- Use the shared `authHeaders(token)` and `throwIfNotOk(res)` helpers. Errors throw an `ApiError` carrying a numeric `.status`.

Consult `http://localhost:8080/v3/api-docs` for the exact request/response schema before writing a new function.

### Page conventions

- Routes live under `src/pages/<area>/`; shared building blocks under `src/components/`. `App.tsx` wires routes inside a single `<AppShell />` layout route. Unbuilt routes render the local `NotImplemented` stub in `App.tsx` — replace the stub with a real page when implementing.
- Data fetching is `useEffect` + `useState` keyed on `[token, ...params]` (no data-fetching library). Every page tracks `loading` / error / empty as distinct render branches — match the pattern in `CustomersPage.tsx`.
- Debounce search inputs (~300ms) and reset pagination to page 0 on a new query, as in `CustomersPage.tsx`.
- Modals use the shared `Modal` component (`src/components/Modal.tsx`) — backdrop-click closes; pass body/footer as children. Entity create/edit modals (e.g. `CustomerFormModal`) take a `mode: 'create' | 'edit'` prop and an `onSaved` callback.

## Domain language

Use these terms exactly — they match the backend and the UI copy:

| Term | Meaning | Avoid |
|---|---|---|
| **Job** | Unit of work — a Racket brought in to be strung | Order, request, ticket |
| **Stage** | Lifecycle state of a Job | Status, phase, step |
| **Stringer** | The person who operates the app | User, operator, admin |
| **Customer** | Person who brings Rackets in | Client, player |
| **Racket** | Tennis racket owned by a Customer | Equipment, item |
| **Service Fee** | Labor charge configured in Settings | Labor cost, stringing fee |
| **String Fee** | Material cost per String in inventory | Material cost, string cost |
| **String** | A string product in inventory | Product, item, cord |

## Design system (source of truth: `.claude/prototype/shared.css`)

**Always invoke the `/stringpro-design-system` skill before working on any visual or UI code.** It contains the canonical palette, typography rules, and component patterns for this project.

All design tokens are CSS custom properties in `shared.css`. No raw hex values in component CSS — always reference a token.

**Typography**
- Display headings: `Playfair Display` (serif) — `var(--font-display)`
- Body/UI: `DM Sans` — `var(--font-body)`
- Numbers, monospace labels: `DM Mono` — `var(--font-mono)`

**Color palette** — clay-court derived OKLCH scale:
- Primary: `--clay-*` (50–900) with semantic aliases `--bg`, `--surface`, `--fg`, `--fg-muted`, `--border`, `--accent`
- Accent alt (tennis ball yellow-green): `--ball-*`
- Court green: `--court-*`
- String blue: `--string-500`

**Status token classes** (use on badges, not raw colors):
- `.badge-queued` / `.badge-progress` / `.badge-ready` / `.badge-done` / `.badge-paid` / `.badge-unpaid` / `.badge-overdue`

**Job lifecycle:** Queued → In Progress → Ready → Done → Paid

**App shell layout:**
- Fixed sidebar: `--sidebar-w: 240px` at desktop, collapses to `48px` at `≤1023px`, hidden at `≤639px`
- Mobile: bottom nav (`<nav class="mobile-nav">`) replaces sidebar
- Main content: `margin-inline-start: var(--sidebar-w)`, zero on mobile

**Responsive breakpoints:**
- `≤639px` — mobile (bottom nav, single column, condensed table)
- `≤1023px` — tablet (collapsed icon-only sidebar)
- `≥1024px` — desktop (full sidebar with labels)

## Screens / routes

The prototype HTML files in `.claude/prototype/` are **reference templates only** — visual targets and design inspiration, not a spec locked to production. They are subject to change. Use them for visual guidance but do not treat their structure or content as authoritative.

Map each prototype HTML file to a React route:

| Prototype file | Route | Description |
|---|---|---|
| `dashboard.html` | `/` | Job queue by stage + 4 summary cards |
| `jobs-new.html` | `/jobs/new` | Create job form with auto-calculated price |
| `jobs-detail.html` | `/jobs/:id` | 4-stage progress bar, stringing details, payment section |
| `customers.html` | `/customers` | Searchable list with active job count |
| `customer-detail.html` | `/customers/:id` | Contact info, racket grid, job history |
| `strings.html` | `/strings` | String inventory table with available toggle |
| `payments.html` | `/payments` | Outstanding vs. collected; tabs for unpaid/paid |
| `settings.html` | `/settings` | Service fee, string fee defaults, stringer profile |

## Component conventions

Extract design tokens into a theme file before writing components. Build layout from the shell down; avoid standalone atoms that lose spatial context.

**Required component states:** default, hover, focus, active, disabled, loading, empty, error, success.

**Shared CSS classes to reuse (not re-invent):**
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-paid`, `.btn-sm`
- `.card`, `.card-sm`
- `.data-table-wrap` + `.data-table`
- `.filter-tabs` / `.filter-tab` / `.tab-count`
- `.search-wrap` + `.search-input`
- `.detail-section` / `.detail-section-header` / `.detail-row`
- `.modal-overlay` / `.modal`
- `.stage-bar` / `.stage-step` / `.stage-dot` (4-step job progress)
- `.summary-cards` (4-column grid on desktop, 2-column on tablet/mobile)
- `.price-summary` / `.price-row` / `.price-total`
- `.breadcrumb`
- `.form-grid`, `.form-grid-2`, `.field`, `.input`, `.select`, `.textarea`, `.toggle-group`

## Design fidelity rules

- Match the prototype visually before refactoring internals. If there is a conflict between the design and a "cleaner" implementation, match the exported pixels first.
- Use `font-variant-numeric: tabular-nums` on all monetary/numeric values.
- Motion: `120ms ease-out` for most transitions; `200ms cubic-bezier(0,0,0.2,1)` for modal entrance. Honor `prefers-reduced-motion`.
- No horizontal scroll at any responsive breakpoint (360px–1920px).
