# Reel consumption is derived from Jobs on the client, not stored

The String Inventory view needs per-Reel usage and earnings (meters consumed, stringings done, String Fees earned, net return) and page-level totals (fees collected, net return). The backend has **no** consumption field: `ReelResponse` carries `metersPerJob`, `reelLengthMeters`, `cost`, and `stringFee`, but nothing decrements as Jobs are strung, and Reel `state` is tracked explicitly (see ADR 0004), not derived from usage. Jobs reference Reels per String Side via `mains.reelId` / `crosses.reelId`.

Decision: compute all consumption and earnings **client-side from Job data**, treating it as a derived, read-only view that never mutates the Reel. The rules:

- A Reel is **consumed** by a Job only once the Job reaches `IN_PROGRESS` (so `IN_PROGRESS` / `DONE` / `RETURNED` count; `ANNOUNCED` / `PICKED_UP` reference the Reel but have not pulled string).
- **Meters consumed** = Σ over each consuming Job side referencing the Reel of `hybrid ? metersPerJob / 2 : metersPerJob` (a Hybrid side strings half the racket). A `hybrid === false` Job is treated as **mains-only** even if `crosses` is unexpectedly populated, to avoid the double-count guarded against in ADR 0006.
- **Earned** = Σ of each referencing side's `stringFee` (already halved for Hybrid by the backend). **Net return** = earned − Reel cost.

The **String Inventory list page** gets the data by fetching *all* Jobs once and aggregating in memory (it needs global totals and a per-Reel slice; the `/jobs` `stage` filter accepts only one stage, so multi-stage filtering is done client-side). The **Reel detail page** uses the server `?reelId=` filter, which was confirmed against the live backend to match both `mains` and `crosses` sides.

Reason: with no backend aggregate or consumption endpoint, deriving from Jobs is the only option, and it keeps Reel `state` a deliberate manual act (ADR 0004) rather than silently auto-retiring a Reel. Aggregating client-side mirrors the existing "load all, compute in memory" choice for Reels (ADR 0005).

Consequence: unlike the tiny Reel list (ADR 0005), **Jobs grow with every stringing** — hundreds per year. Both fetches therefore page through to `totalPages` rather than relying on a single generous page size; a single fixed `size` would silently truncate the money metrics once the count exceeds it. Revisit this whole approach if the backend ever exposes a reel-usage aggregate, or if the full-Jobs fetch on the inventory page becomes too heavy — at which point per-Reel queries plus a server aggregate would replace it.
