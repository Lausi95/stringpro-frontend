# Job create and edit move into a modal

Creating and editing a Job now happens in a modal layered over the page that
triggered it (the Dashboard, a Customer's detail page, or a Job's detail page),
not on the standalone `/jobs/new` and `/jobs/:id/edit` routes — both routes are
removed. This brings the Job form into line with ADR 0003, which already
mandated modal-based create/edit for all entities and named Job as a future
target; the Job form was the last route-based holdout.

The Job form is far larger than the other entity forms (customer + racket
pickers, mono/hybrid string sides, tension fields, a live price breakdown), and
its size is exactly why it was left on a full page. The trigger to convert it was
mobile ergonomics: the submit button lived in the page header, so finishing a
job meant scrolling back to the top of a long form. A modal with a footer that
holds Save fixes that — and, crucially, the footer is made **sticky on every
breakpoint** (not just the mobile bottom-sheet), because at ~900px the two-column
form is tall enough to scroll inside the panel and a static footer would recreate
the same scroll-to-submit problem on desktop. The footer also echoes the running
Total, so price and submit stay together once the price aside scrolls out of view.

Consequences and specifics:

- The shared `Modal` gains an optional `size` prop (`'default' | 'lg'`).
  `lg` widens the panel to `min(900px, 90vw)` and switches it to a
  flex column — fixed header, scrollable body, sticky footer — so the header and
  the Save button stay visible while the body scrolls. Other modals are untouched.
- `JobFormModal` is prop-driven, not route-driven: `mode`, an `initial` Job for
  edit, an optional preset customer + racket id for create prefill, plus
  `onClose`/`onSaved` — mirroring `CustomerFormModal`/`RacketFormModal`. It no
  longer reads `useParams`/`useSearchParams`/`useNavigate`.
- Edit seeds the form from the `initial` Job object the detail page already has
  (no re-fetch of the Job); the modal still loads reels + the customer/racket
  names it needs to render.
- Modal open-state lives locally in each of the three triggering pages (matching
  the existing modal convention), and `onSaved` closes the modal and refetches
  that page in place rather than navigating away.
- Trade-off accepted: Job create/edit are no longer URL-addressable, so the
  browser Back button no longer dismisses the form and the flows can't be
  deep-linked in the installed PWA. This matches how every other entity already
  behaves under ADR 0003.

Supersedes the route-based Job form (`JobFormPage` at `/jobs/new` and
`/jobs/:id/edit`); extends ADR 0003.
