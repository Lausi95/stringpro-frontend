# Mono Jobs send `mains` only and omit `crosses`

A Job always carries two String Sides (`mains`, `crosses`) and a `hybrid` flag. A **Mono** Job uses one String for the whole racket; a **Hybrid** Job uses different Strings on each side. The question was how to represent a Mono Job in the `CreateJobRequest` / `UpdateJobRequest` payload.

Decision: for a Mono Job, send `mains` only, omit `crosses` entirely, and set `hybrid: false`. The backend infers the cross side. We do **not** duplicate the `mains` StringSide into `crosses`.

Reason: in the OpenAPI schema `crosses` is optional (only `crossesTension` is required), which signals the backend's intended Mono representation. The alternative — sending the same StringSide as both `mains` and `crosses` — would send the same `reelId` twice and risk double-counting the String Fee or double-decrementing reel inventory. Verified empirically against the running backend: a Mono REEL Job with a €7.50 reel fee and a €10.00 service fee returned `totalStringFee: 7.50` and `total: 17.50` (the fee is counted once, not doubled), and the new Job's initial `stage` was `ANNOUNCED`. The live price summary on the create page mirrors this (Mono charges the string once; Hybrid sums both sides).

Consequence: the client-side price preview and the backend `total` are computed independently and must agree — they act as a mutual cross-check. If a future backend change starts populating `crosses` on Mono responses or alters the fee formula, revisit this decision and the `JobResponse.crosses?` optionality in `api.ts`.
