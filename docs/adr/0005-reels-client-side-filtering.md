# Reel inventory is filtered and counted client-side

`GET /reels` is a paginated, server-`state`-filterable endpoint, and the established page convention (see `CustomersPage`) is server-side pagination with fetches keyed on `[token, page, filter]`. The Reels page deliberately deviates: it fetches the full reel list once with a generous page size and does its filter-tab selection and per-tab counts (Active / New / Used up / All) entirely client-side.

Reason: the prototype's filter tabs show live counts for every state at once, which server-side would require multiple parallel count calls per render; and the inventory for a one-person stringing business is tiny (dozens of reels at most), so loading all of them is cheap and gives instant tab switching and accurate counts. If reel counts ever grow large, revisit and move to server-side `state` filtering with separate count queries.
