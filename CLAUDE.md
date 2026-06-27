# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

Every route must be behind authentication. Use `@react-keycloak/web` or `keycloak-js` to wrap the app; unauthenticated users are redirected to the Keycloak login page. Never render application UI before the token is confirmed valid.

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
