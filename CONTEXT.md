# StringPro Frontend

A single-page application for managing a tennis stringing business. The app is used by the Stringer to track Jobs from intake through payment.

## Language

### Core workflow

**Job**: The unit of work — a Racket brought in by a Customer to be strung. A Job moves through a fixed lifecycle and carries a price derived from Service Fee and String Fee.
_Avoid_: Order, request, ticket

**Stage**: The current lifecycle state of a Job. Progresses in one direction: Queued → In Progress → Ready → Done → Paid.
_Avoid_: Status, phase, step

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

### Pricing

**Service Fee**: The labor charge applied to a Job, configured in Settings.
_Avoid_: Labor cost, stringing fee

**String Fee**: The material charge billed to the Customer per stringing, configured per Reel.
_Avoid_: Material cost, string cost

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
