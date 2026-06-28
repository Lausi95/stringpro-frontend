# StringPro Frontend

A single-page application for managing a tennis stringing business. The app is used by the Stringer to track Jobs from intake through return.

## Language

### Core workflow

**Job**: The unit of work — a Racket brought in by a Customer to be strung. A Job moves through a fixed lifecycle and carries a price derived from Service Fee and String Fee.
_Avoid_: Order, request, ticket

**Stage**: The current lifecycle state of a Job. Progresses in one direction only, never backward: Announced → Picked Up → In Progress → Done → Returned. The backend enum values are `ANNOUNCED`, `PICKED_UP`, `IN_PROGRESS`, `DONE`, `RETURNED`. **Payment is not a Stage** — there is no `PAID` stage; payment is a separate, currently-unmodelled concern. New Jobs begin at `ANNOUNCED` (the customer has said they will bring a Racket in but it is not yet physically here).
- **Announced** (`ANNOUNCED`) — intake recorded; Racket not yet received.
- **Picked Up** (`PICKED_UP`) — Racket physically received by the Stringer.
- **In Progress** (`IN_PROGRESS`) — being strung.
- **Done** (`DONE`) — strung, awaiting handover to the Customer. **Displayed in the UI as "Return to Customer"** — a call-to-action for the Stringer's next physical step. The canonical/backend term remains "Done"/`DONE`; only the display label differs. This UI label deliberately sits immediately before "Returned"; the wording similarity between the two was raised and accepted.
- **Returned** (`RETURNED`) — handed back to the Customer; terminal. Codified as `TERMINAL_STAGE` in `src/lib/api.ts`.
_Avoid_: Status, phase, step; Queued, Ready, Paid (these were never backend stages)

**Rendering a Stage as pending vs. complete**: A progress indicator (e.g. the Job Progress card in `/jobs/:id`) must distinguish a Stage the Job is *at and still has work in* from the Stage that means the Job is *finished*. Every non-terminal Stage — including `DONE` ("Return to Customer", which still has a pending physical handover) — is a "you-are-here, work pending" state and renders unticked. Only the `TERMINAL_STAGE` (`RETURNED`) means complete: when the Job is at it, every step (itself included) renders as done/ticked, since reaching it leaves nothing to do.

**Stringer**: The person who operates the app and performs the stringing work. There is one Stringer per installation.
_Avoid_: User, operator, admin

### People and equipment

**Customer**: A person who brings Rackets in to be strung. A Customer may have multiple Rackets and multiple Jobs over time.
_Avoid_: Client, player

**Racket**: A tennis racket owned by a Customer and the physical subject of a Job.
_Avoid_: Equipment, item

**Head Size**: The area of a Racket's hitting surface, measured in cm² (typically 400–900).

**String Pattern**: The grid layout of a Racket's strings, written as mains × crosses (e.g. 16×19). Stored as two counts — the vertical strings (mains) and horizontal strings (crosses).
_Avoid_: String setup, grid

### Stringing

A Job strings a Racket on two **String Sides**: the **Mains** (vertical strings) and the **Crosses** (horizontal strings). Each side has its own tension and its own String, and each side is independently sourced.

**Mono / Hybrid**: How a Job's two String Sides relate. A **Mono** Job uses one String for both Mains and Crosses. A **Hybrid** Job uses different Strings for Mains and Crosses (e.g. a polyester main with a multifilament cross). The Stringer chooses Mono or Hybrid first when creating a Job; the choice governs whether one String or two are specified.
_Avoid_: Full bed (for mono), mixed/combo (for hybrid)

**String Side source**: Where the String on a side comes from. Either a **Reel** (`REEL`) — drawn from the Stringer's inventory and billed the Reel's String Fee — or the Customer's **Own** string (`OWN`) — supplied by the Customer, recorded by name, with no String Fee charged.
_Avoid_: "Mine" vs "customer's" (prototype wording), BYO

**Mains tension / Crosses tension**: The pull tension for each String Side, in kg. The two are independent and commonly differ slightly (crosses a little lower than mains).

### Pricing

**Service Fee**: The labor charge applied to a Job, configured in Settings.
_Avoid_: Labor cost, stringing fee

**String Fee**: The material charge billed to the Customer per stringing, configured per Reel. A Reel's String Fee covers stringing a *whole* racket, so on a **Hybrid** Job each Reel side is billed **half** its String Fee (each Reel strings only half the racket); a **Mono** Job bills the full String Fee once. Customer's-own (`OWN`) sides carry no String Fee.
_Avoid_: Material cost, string cost

### Configuration

**Settings**: The single global configuration record for the installation, owned by the Stringer. It consists of exactly: the Service Fee, and the Stringer's identity/contact details (full name, email, IBAN, address). There is no payment-method configuration — payment methods are not a modelled concept. The String Fee is *not* a Setting; it lives per Reel. Settings is a singleton (one per installation), always readable (defaults until first saved).
_Avoid_: Preferences, config, profile

### Inventory

**String**: A string product/material as a concept — a brand + model + material + gauge (e.g. "Babolat RPM Blast, polyester, 1.25 mm"). It is *what* a Racket is strung with, not a physical countable item. The inventory page is titled "String Inventory".
_Avoid_: Product, item, cord

**Reel**: A single physical roll of a String that was purchased — it has a length in meters (e.g. 100 m or 200 m), a cost, a per-stringing String Fee, and a meters-per-stringing figure. This is the countable unit of inventory; the UI shows one card per Reel ("Add Reel", "3 active reels").
_Avoid_: Roll, spool, string (when meaning the physical unit)

**Reel state**: The lifecycle of a Reel, tracked explicitly by the backend (not derived from usage):
- **New** (`NEW`) — purchased, not yet strung from.
- **In Use** (`IN_USE`) — actively being strung from.
- **Used up** (`USED_UP`) — exhausted or retired; no longer available.
_Avoid_: Status, availability, active/inactive

**Reel commitment**: A New Reel becomes In Use when the Stringer **starts** a Job that strings from it — i.e. when that Job enters **In Progress**. The Stringer confirms this; starting the Job and committing its New Reel(s) are a single all-or-nothing act (the Job will not start unless its New Reels move to In Use, and a failure leaves nothing changed). A Reel already In Use needs no commitment; declining leaves both the Reel New and the Job at Picked Up. Job-start is the **primary** New → In Use trigger; the others are a *[[Reel substitution]]* (a substitute Reel chosen at the Done transition) and a *[[Reel swap]]* (a replacement Reel chosen at job-start when a referenced Reel is already Used up). Commitment is distinct from *Reel consumption* (which never changes state) and from retiring a Reel to Used up, which happens either manually or via *Reel exhaustion*. The start gate fires whenever any referenced Reel is **New** (to commit) *or* **Used up** (to swap, see *[[Reel swap]]*).
_Avoid_: Silent/automatic state change, auto-activating a Reel without confirmation

**Reel exhaustion**: A Reel becoming depleted — no String left — recorded at the moment a Job advances to **Done**. On that transition the Stringer is asked, for each Reel the Job draws from, whether it is now exhausted; every Reel marked exhausted transitions to **Used up** (`USED_UP`). This is a *deliberate, prompted* act by the Stringer (the app never infers depletion from meters consumed — consumption stays derived and never mutates state). Together with manual retirement it is one of the two ways a Reel reaches Used up. `OWN` sides carry no Reel and are never part of the prompt.
_Avoid_: Depletion inferred from usage, "out of string" as a derived/automatic state

**Reel substitution**: What happens when a **Mono** Job's Reel runs out *partway through* — after the Mains are strung but before the Crosses. The Stringer finishes the Crosses from a **different** Reel of their choosing, and the Job is rewritten from Mono to a **Hybrid** Job: the Mains keep the original (now exhausted) Reel, the Crosses take the substitute Reel. The **price the Customer already agreed is preserved** — the original String Fee is split half on each side (so the total is unchanged even if the substitute Reel's own String Fee differs). The exhausted Mains Reel transitions to **Used up**; the substitute Reel, if **New**, is committed to **In Use** (see *[[Reel commitment]]*). An auto-note records that a substitution occurred. In persisted data a substituted Job is indistinguishable from a deliberately-chosen Hybrid Job; "Reel substitution" names the *act*, not a separate Job type.
_Avoid_: Treating the substitute as a deliberate Hybrid choice, re-pricing the Job to the new Reel's fee, a distinct "split" Job type

**Reel swap**: What happens at **job-start** (the In Progress transition) when a Reel the Job references has become **Used up** since the Job was created — exhausted by another Job or manually retired — so it cannot be strung from at all. Before the Job can start, the Stringer replaces each Used-up Reel with **any** non-used-up Reel of their choosing; the **price the Customer already agreed is preserved** — each affected String Side keeps its existing String Fee, never re-derived from the replacement Reel's own fee. The Job's *Mono*/*Hybrid* type is unchanged (a Mono Job's single Reel is replaced and it stays Mono; a Hybrid Job's affected side(s) are replaced and it stays Hybrid — both Reels may need swapping). A replacement Reel that is **New** is committed to **In Use** (see *[[Reel commitment]]*); the Used-up Reel is left untouched. An auto-note records the swap, since in persisted data the swapped side is indistinguishable from one that always referenced the replacement Reel. If no non-used-up Reel exists to swap in, the Job cannot start. A Reel swap is the fee-preserving alternative to a normal Job edit (which *recomputes* each side's fee from its Reel); it is distinct from a *[[Reel substitution]]* — that is a **mid-racket** run-out at the **Done** transition that rewrites Mono → Hybrid, whereas a swap is a same-type replacement of an **already-dead** Reel at **start**.
_Avoid_: Re-pricing the Job to the replacement Reel's fee, converting Mono ↔ Hybrid, confusing it with *Reel substitution*, editing the Job to change the Reel (that loses the agreed price)

**Reel consumption**: How a Reel is drawn down by the Jobs that string from it. A Reel is considered consumed by a Job only once that Job reaches **In Progress** — earlier Stages (`ANNOUNCED`, `PICKED_UP`) reference the Reel but have not yet pulled string from it. A **Mono** Job draws one whole stringing's worth of String from its Reel; each side of a **Hybrid** Job draws **half** a stringing (the Reel strings only half the racket). Reel consumption is a *derived, informational* view computed from Jobs — it never changes the Reel's explicitly-tracked Reel state, and it does not decrement any stored quantity.
_Avoid_: Depletion as a stored field, auto-retiring a Reel from usage

**Earned (per Reel)**: The total String Fees a Reel has brought in, summed from the String Sides that drew from it across consuming Jobs — the side's String Fee, not the Job total. **Net return** for a Reel is its Earned minus the Reel's purchase cost.
