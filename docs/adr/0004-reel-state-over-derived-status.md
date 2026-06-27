# Reel state comes from the backend, not derived from job usage

The strings prototype derives a Reel's status (new/active/used-up) and all its metrics — usage meter, meters left, income, net profit, per-reel job history — from a client-side list of Jobs. The backend instead exposes an explicit `state` field (`NEW` / `IN_USE` / `USED_UP`) on each Reel, changed via `PATCH /reels/{id}/state`, and the Jobs domain does not exist yet.

We use the backend `state` as the single source of truth for a Reel's lifecycle and drop the prototype's "derive status from job count" logic entirely. All job-dependent UI (usage meter, meters left, income/net financials, per-reel job list) is kept in the layout but rendered as `-` placeholders until the Jobs feature ships. This is why the page intentionally shows empty/`-` financials rather than the populated cards in the prototype.
