# Share a per-Job Payment Request message from the Payments page

Each unpaid-Job row on the Payments page gets a **share** button (left of the
Record Payment button) that opens a modal to compose and share a **Payment
Request** — a plain-text message telling the Customer that Job's Balance and how
to pay. The modal has a **German/English** toggle (defaulting to German) over a
live preview, plus **Share** (Web Share API — `navigator.share`) and **Copy**
(clipboard) actions. The message is generated client-side from the Job and
Settings and is **never persisted**: sharing it records nothing on the backend
(it is not a [[Payment]]). This fits the installed-PWA, single-operator use case
where the Stringer wants to text a Customer their balance from their phone.

Decision: the message is **per-Job**, keyed off the Job's `Balance`
(`total − amountPaid`), because the Payments page and its data are per-Job — there
is no per-Customer total anywhere. It lists three pay options mirroring the
`PaymentMethod` enum: PayPal, bank transfer (IBAN + Stringer name), and cash.
**Missing Settings data drops its line** — if the IBAN is blank the bank-transfer
line is omitted rather than showing a placeholder — so the message is always
clean even before Settings has been saved.

Considered options / trade-off worth recording: **the PayPal option is a
temporary hardcode.** A working `paypal.me/<user>/<amount>` link needs a PayPal
**username**, which cannot be derived from an email address — and the Settings
schema (`serviceFee`, `fullName`, `email`, `iban`, `address`) has **no PayPal
field** yet. Rather than block on a backend change or degrade to "email is my
PayPal handle", we hardcode the username **`TLausmann`** as a single named
constant and build `https://paypal.me/TLausmann/<amount>EUR`. This is a
deliberate stopgap: when Settings gains a `paypalMe` field, the constant is
replaced by that value and nothing else about the feature changes. The constant
is the one surprising thing here — it is centralised and commented precisely so a
future reader doesn't mistake it for a bug.

Consequence: the shared link always points at the `TLausmann` PayPal account
regardless of who runs the app, until the Settings field lands. Acceptable for a
single-operator app that is, in fact, run by that account holder.
