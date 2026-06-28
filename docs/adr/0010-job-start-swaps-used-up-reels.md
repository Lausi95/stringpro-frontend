# Starting a Job swaps out any Used-up Reel it references, preserving the agreed price

When a Job enters **In Progress**, a Reel it references may already be **Used up** (`USED_UP`) — exhausted by another Job, or manually retired, *after* this Job was created (the create form filters Used-up Reels out, so a Job can only acquire a dead Reel reference later). Such a Reel cannot be strung from, so the Job cannot start as-is. This ADR adds a **Reel swap** to the start flow: the Stringer replaces each Used-up Reel with a live one before the Job starts, keeping the price the Customer already agreed. It **extends ADR 0008** (which only handled `NEW` Reels at start and explicitly deferred `USED_UP` handling) and is a sibling of — *not* the same as — the Done-transition **Reel substitution** of ADR 0009.

## Context

ADR 0008 made Job-start the place that commits `NEW` Reels to `IN_USE`, but it punted on a referenced Reel being `USED_UP` at start: the gate fires only when `newReelCommitments(job, reels).length > 0`, so a Job with a dead Reel but no New Reels would slip straight through `advanceOnly` and start while pointing at a Reel with no string left. That deferred case is exactly this scenario.

It is genuinely distinct from ADR 0009's *Reel substitution*: that is a **mid-racket** run-out discovered at the **Done** transition, which rewrites a Mono Job to Hybrid. A swap is the replacement of an **already-dead** Reel at the **start** transition, with **no** Mono↔Hybrid change. Same price-preservation principle, different trigger, timing, and mechanics — hence a separate term and ADR (see `CONTEXT.md` *Reel swap* vs *Reel substitution*).

## Decision

**One unified start gate.** The Picked Up → In Progress transition inspects the state of *every* referenced Reel. The gate now fires when **any referenced Reel is `USED_UP` (must be swapped) OR any is `NEW` (must be committed)** — broadening ADR 0008's New-only trigger. `OWN` sides carry no Reel and are ignored. The whole thing is one all-or-nothing act the Stringer confirms; `IN_USE` Reels need nothing.

- **Swap mechanics.** For each distinct `USED_UP` Reel the Job references, the Stringer picks **any** non-used-up Reel (`NEW`/`IN_USE`, never `OWN`) as its replacement. The Job's String Side(s) on that Reel are rewritten to the replacement Reel id, and the Job's **Mono/Hybrid type is unchanged**: a Mono Job's single Reel is replaced (stays Mono); a Hybrid Job's affected side(s) are replaced (stays Hybrid — both sides may need a swap if both Reels are dead).
- **Price preservation.** Each rewritten side keeps its **existing** per-side `stringFee`; it is **never** re-derived from the replacement Reel's configured fee. This is the entire reason a dedicated act exists rather than "edit the Job to change the Reel" — a normal edit *recomputes* fees and would break the agreed price. The fee is preserved by sending the original per-side `stringFee` through `PUT /jobs/{id}` (`UpdateJobRequest`), the **same backend path as ADR 0009**. **Load-bearing dependency:** the backend must honour the client-sent per-side fee rather than recomputing it from the replacement Reel — confirmed and empirically verified in ADR 0009 (a `PUT` at `IN_PROGRESS` kept the sent `stringFee` despite a different-fee Reel). Because that path is shared, this feature is covered by the same evidence.
- **Replacement reel commitment.** A replacement Reel that is `NEW` is committed to `IN_USE` (another `New → IN_USE` trigger, same semantics as ADR 0008). A replacement already `IN_USE` needs nothing. The Used-up Reel is left untouched.
- **No-replacement dead end.** If a Reel is `USED_UP` and **no** non-used-up Reel exists in inventory, the Job **cannot start**: it stays at Picked Up, nothing changes, and the Stringer is told to add a Reel first. Converting the dead side to `OWN` is explicitly rejected — that drops the String Fee and changes the agreed price.
- **Auto-note.** A note is appended recording the swap (`<dead Reel> was used up; <side> restrung from <replacement Reel>`), the only honest trace since the swapped side is otherwise indistinguishable from one that always referenced the replacement Reel — mirrors ADR 0009.
- **Unknown Reel state.** A referenced Reel that failed to load (state unknown, as ADR 0008 already tolerates) **blocks** the start conservatively rather than being assumed live — we never start a Job over a Reel we cannot confirm is usable.
- **Atomicity — ADR 0008/0009-style compensation.** Mutations run first and the **stage advance last**, so failures are caught before the Job moves. Order: `PUT` Job rewrite (swap reel ids, preserved fees, auto-note) → commit each `NEW` Reel (originals + New replacements) `→ IN_USE` → `PATCH` stage `→ IN_PROGRESS`. On any failure, compensate in reverse — revert flipped Reels and `PUT` the Job back to its original payload — ending at "nothing changed, retry" (error toast). No server-side transaction spans the aggregates, so the client owns this.

## Considered alternatives

- **Block start; make the Stringer edit the Job manually** — rejected: a normal edit recomputes each side's fee from its Reel, silently breaking the Customer's agreed price. Preserving the price is the whole point.
- **Two separate prompts (swap, then commit)** — rejected in favour of one unified gate: a Job can need both at once, and two dialogs / two atomic acts are worse than one.
- **Restrict the replacement to the same String** — rejected as it can deadlock (no same-String Reel in stock) and ADR 0009 already set the precedent that any Reel is allowed with the price preserved.
- **`OWN` fallback when no replacement exists** — rejected: drops the String Fee, contradicting price preservation.

## Consequences

This is the **third** place Job logic mutates Reel state and another `New → IN_USE` trigger; `CONTEXT.md`'s *Reel swap* entry is canonical, and ADR 0008's start flow is no longer the complete start story (its New-only gate is broadened here). Like ADR 0009, the agreed total is held fixed against a replacement Reel of a different fee, and a Job's referenced Reels can change after creation — code assuming a Job's Reel ids are fixed must tolerate it.

**Naming note (deliberate):** the act is called **"Reel swap"** to match the existing `Reel <noun>` glossary family (substitution / commitment / exhaustion / consumption); the "used-up at start" trigger lives in the definition, not the name. An earlier draft ("Used-up reel swap") was dropped for family consistency.

Revisit if the backend ever performs the swap/commit/stage-advance server-side as one atomic call — at which point this client saga and its compensation collapse, as already noted in ADR 0008/0009.
