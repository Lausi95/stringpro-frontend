import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronRight, Check, ArrowRight, Scissors, Calendar, Receipt, Pencil, Trash2 } from 'lucide-react'
import { useToast } from '../../components/Toast'
import {
  getJob,
  getCustomer,
  getRacket,
  getReel,
  listReels,
  changeJobStage,
  changeReelState,
  updateJob,
  deleteJob,
  nextStage,
  JOB_STAGES,
  JOB_STAGE_LABELS,
  JOB_STAGE_BADGE_CLASS,
  TERMINAL_STAGE,
  type JobResponse,
  type CustomerResponse,
  type RacketResponse,
  type ReelResponse,
  type StringSideResponse,
  type StringSideRequest,
  type UpdateJobRequest,
} from '../../lib/api'

const money = (n: number) => `€ ${n.toFixed(2)}`

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * The Reel-backed String Sides of a Job, with the side they sit on. A Mono Job
 * is mains-only (matching ADR 0006); a Hybrid Job adds the crosses side.
 */
function reelSideRefs(job: JobResponse): { reelId: string; label: string }[] {
  const refs: { reelId: string; label: string }[] = []
  if (job.mains.type === 'REEL' && job.mains.reelId) {
    refs.push({ reelId: job.mains.reelId, label: 'mains' })
  }
  if (job.hybrid && job.crosses?.type === 'REEL' && job.crosses.reelId) {
    refs.push({ reelId: job.crosses.reelId, label: 'crosses' })
  }
  return refs
}

/** Distinct Reel ids a Job draws from (deduped across sides). */
function referencedReelIds(job: JobResponse): string[] {
  return [...new Set(reelSideRefs(job).map((r) => r.reelId))]
}

/**
 * The Reels a Job draws from that are still `NEW` — the ones that must be
 * committed to `IN_USE` before the Job can start. See ADR 0008. Deduped by
 * Reel, collecting the side label(s) each Reel sits on. A Reel that failed to
 * load (absent from the map) is skipped — its state is unknown.
 */
function newReelCommitments(
  job: JobResponse,
  reels: Map<string, ReelResponse>,
): { reel: ReelResponse; labels: string[] }[] {
  const byId = new Map<string, string[]>()
  for (const ref of reelSideRefs(job)) {
    byId.set(ref.reelId, [...(byId.get(ref.reelId) ?? []), ref.label])
  }
  const result: { reel: ReelResponse; labels: string[] }[] = []
  for (const [reelId, labels] of byId) {
    const reel = reels.get(reelId)
    if (reel && reel.state === 'NEW') result.push({ reel, labels })
  }
  return result
}

/**
 * The Reels a Job draws from that are already `USED_UP` — the ones that must be
 * swapped for a live Reel before the Job can start. See ADR 0010. Deduped by
 * Reel, collecting the side label(s) each Reel sits on. A Reel that failed to
 * load (absent from the map) is not returned here; unknown state is handled
 * separately (it blocks the start — see `unknownReelIds`).
 */
function usedUpReelSwaps(
  job: JobResponse,
  reels: Map<string, ReelResponse>,
): { reel: ReelResponse; labels: string[] }[] {
  const byId = new Map<string, string[]>()
  for (const ref of reelSideRefs(job)) {
    byId.set(ref.reelId, [...(byId.get(ref.reelId) ?? []), ref.label])
  }
  const result: { reel: ReelResponse; labels: string[] }[] = []
  for (const [reelId, labels] of byId) {
    const reel = reels.get(reelId)
    if (reel && reel.state === 'USED_UP') result.push({ reel, labels })
  }
  return result
}

/**
 * Referenced Reel ids whose state we couldn't read (absent from the map). The
 * start gate blocks on these rather than assuming they're usable — see ADR 0010.
 */
function unknownReelIds(job: JobResponse, reels: Map<string, ReelResponse>): string[] {
  return referencedReelIds(job).filter((rid) => !reels.has(rid))
}

/** Distinct Reels a Job draws from, with the side label(s) each sits on. */
function reelRefsByReel(job: JobResponse): { reelId: string; labels: string[] }[] {
  const byId = new Map<string, string[]>()
  for (const ref of reelSideRefs(job)) {
    byId.set(ref.reelId, [...(byId.get(ref.reelId) ?? []), ref.label])
  }
  return [...byId].map(([reelId, labels]) => ({ reelId, labels }))
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Build an UpdateJobRequest side from a saved response side, preserving its fee. */
function buildSideRequest(side: StringSideResponse): StringSideRequest {
  if (side.type === 'OWN') return { type: 'OWN', stringName: side.stringName ?? '', stringFee: 0 }
  return { type: 'REEL', reelId: side.reelId, stringFee: side.stringFee }
}

/**
 * Reconstruct a Job's own UpdateJobRequest — used as the revert payload for the
 * Reel-substitution rewrite (ADR 0009). A Mono Job omits `crosses` (ADR 0006).
 */
function toUpdateRequest(job: JobResponse): UpdateJobRequest {
  const base = {
    dueDate: job.dueDate,
    notes: job.notes,
    mainsTension: job.mainsTension,
    crossesTension: job.crossesTension,
    serviceFee: job.serviceFee,
  }
  if (!job.hybrid) {
    return { ...base, hybrid: false, mains: buildSideRequest(job.mains) }
  }
  return {
    ...base,
    hybrid: true,
    mains: buildSideRequest(job.mains),
    ...(job.crosses ? { crosses: buildSideRequest(job.crosses) } : {}),
  }
}

const reelDisplayName = (r: ReelResponse) => `${r.brand} ${r.model} · ${r.gauge} mm`

/**
 * Build the Reel-swap rewrite payload (ADR 0010): each String Side whose Reel
 * is in `swaps` (deadReelId → replacementReelId) is re-pointed at the
 * replacement Reel while **keeping its existing String Fee** — the agreed price
 * is preserved, never re-derived from the replacement Reel. Mono stays Mono and
 * Hybrid stays Hybrid (only the reel id changes). `notes` is passed through with
 * the auto-note already appended.
 */
function buildSwapRequest(
  job: JobResponse,
  swaps: Map<string, string>,
  notes: string | undefined,
): UpdateJobRequest {
  const swapSide = (side: StringSideResponse): StringSideRequest => {
    if (side.type === 'REEL' && side.reelId && swaps.has(side.reelId)) {
      return { type: 'REEL', reelId: swaps.get(side.reelId)!, stringFee: side.stringFee }
    }
    return buildSideRequest(side)
  }
  const base = {
    dueDate: job.dueDate,
    notes,
    mainsTension: job.mainsTension,
    crossesTension: job.crossesTension,
    serviceFee: job.serviceFee,
  }
  if (!job.hybrid) {
    return { ...base, hybrid: false, mains: swapSide(job.mains) }
  }
  return {
    ...base,
    hybrid: true,
    mains: swapSide(job.mains),
    ...(job.crosses ? { crosses: swapSide(job.crosses) } : {}),
  }
}

/**
 * One reversible step of the Done-transition saga (ADR 0009): `do` applies it,
 * `undo` compensates. Steps run in order; on any failure the completed steps
 * are undone in reverse so nothing changed.
 */
interface SagaStep {
  do: () => Promise<void>
  undo: () => Promise<void>
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [job, setJob] = useState<JobResponse | null>(null)
  const [customer, setCustomer] = useState<CustomerResponse | null>(null)
  const [racket, setRacket] = useState<RacketResponse | null>(null)
  const [reelNames, setReelNames] = useState<Map<string, string>>(new Map())
  const [reels, setReels] = useState<Map<string, ReelResponse>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [advancing, setAdvancing] = useState(false)
  // Unified start gate (ADR 0008 + 0010): commit New Reels and swap Used-up ones.
  const [showStart, setShowStart] = useState(false)
  const [starting, setStarting] = useState(false)
  // Used-up reel id → chosen replacement reel id (ADR 0010 swap).
  const [swapChoices, setSwapChoices] = useState<Map<string, string>>(new Map())
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Done-transition reel prompt (ADR 0009).
  const [showDone, setShowDone] = useState(false)
  const [finishing, setFinishing] = useState(false)
  // Mono: did the reel string the whole racket? null until answered.
  const [monoLasted, setMonoLasted] = useState<boolean | null>(null)
  // Mono + lasted: is that reel now empty?
  const [monoUsedUp, setMonoUsedUp] = useState(false)
  // Mono + ran out: the substitute reel chosen for the crosses.
  const [substituteReelId, setSubstituteReelId] = useState('')
  // Hybrid: reel ids the Stringer marked used up.
  const [usedUpReels, setUsedUpReels] = useState<Set<string>>(new Set())
  // Reels available as a substitute (New/In Use), loaded lazily for the prompt.
  const [availReels, setAvailReels] = useState<ReelResponse[]>([])
  const [availLoading, setAvailLoading] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const j = await getJob(id)
      setJob(j)
      const [cust, rack] = await Promise.all([
        getCustomer(j.customerId).catch(() => null),
        getRacket(j.racketId).catch(() => null),
      ])
      setCustomer(cust)
      setRacket(rack)
      const reelIds = referencedReelIds(j)
      const entries = await Promise.all(
        reelIds.map((rid) =>
          getReel(rid)
            .then((r) => [rid, r] as const)
            .catch(() => [rid, null] as const),
        ),
      )
      const reelMap = new Map<string, ReelResponse>()
      const nameMap = new Map<string, string>()
      for (const [rid, r] of entries) {
        if (r) {
          reelMap.set(rid, r)
          nameMap.set(rid, `${r.brand} ${r.model} · ${r.gauge} mm`)
        } else {
          nameMap.set(rid, 'Reel')
        }
      }
      setReels(reelMap)
      setReelNames(nameMap)
    } catch {
      setError('Job not found.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // Load replacement-reel candidates when the start gate opens with a Used-up
  // Reel to swap (ADR 0010). Shares `availReels` with the Done prompt — only
  // one modal is open at a time.
  useEffect(() => {
    if (!showStart || !job || usedUpReelSwaps(job, reels).length === 0) return
    let cancelled = false
    setAvailLoading(true)
    listReels({ size: 200 })
      .then((p) => {
        if (!cancelled) setAvailReels(p.content)
      })
      .catch(() => {
        if (!cancelled) setAvailReels([])
      })
      .finally(() => {
        if (!cancelled) setAvailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showStart, job, reels])

  // Load substitute-reel candidates when the Done prompt opens for a Mono Job
  // (the only case that can need a substitute). See ADR 0009.
  useEffect(() => {
    if (!showDone || !job || job.hybrid) return
    let cancelled = false
    setAvailLoading(true)
    listReels({ size: 200 })
      .then((p) => {
        if (!cancelled) setAvailReels(p.content)
      })
      .catch(() => {
        if (!cancelled) setAvailReels([])
      })
      .finally(() => {
        if (!cancelled) setAvailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showDone, job])

  async function advanceOnly(next: JobResponse['stage']) {
    if (!id) return
    setAdvancing(true)
    try {
      const updated = await changeJobStage(id, next)
      setJob(updated)
      showToast(`Advanced to ${JOB_STAGE_LABELS[next]}`)
    } catch {
      showToast('Failed to advance the job.', 'error')
    } finally {
      setAdvancing(false)
    }
  }

  async function handleAdvance() {
    if (!job || !id) return
    const next = nextStage(job.stage)
    if (!next) return
    // Starting a Job (entering In Progress) runs the unified start gate: swap out
    // any Used-up Reel (ADR 0010) and commit any New Reel (ADR 0008), then
    // advance — as one all-or-nothing act. Any other transition advances directly.
    if (next === 'IN_PROGRESS') {
      // Block if we can't confirm a referenced Reel's state — never start over a
      // Reel we couldn't read (ADR 0010).
      const unknown = unknownReelIds(job, reels)
      if (unknown.length > 0) {
        showToast(
          `Couldn't read the state of ${unknown.length} reel${unknown.length > 1 ? 's' : ''} — refresh and try again.`,
          'error',
        )
        return
      }
      const swaps = usedUpReelSwaps(job, reels)
      const commits = newReelCommitments(job, reels)
      if (swaps.length > 0 || commits.length > 0) {
        setSwapChoices(new Map())
        setShowStart(true)
        return
      }
    }
    // Finishing a Job (entering Done) prompts about Reel exhaustion, and on a
    // Mono Job a mid-racket run-out splits to a substitute Reel. See ADR 0009.
    // Only prompt when the Job draws from at least one Reel; OWN-only advances.
    if (next === 'DONE' && referencedReelIds(job).length > 0) {
      setMonoLasted(null)
      setMonoUsedUp(false)
      setSubstituteReelId('')
      setUsedUpReels(new Set())
      setShowDone(true)
      return
    }
    await advanceOnly(next)
  }

  /**
   * Start the Job (advance to In Progress) as one all-or-nothing act: swap out
   * any Used-up Reel for its chosen replacement (preserving the agreed price,
   * ADR 0010), commit every New Reel — originals and New replacements — to In
   * Use (ADR 0008), then advance the stage last. Any failure rolls back the
   * completed steps in reverse so nothing changed.
   */
  async function handleConfirmStart() {
    if (!job || !id) return
    const swaps = usedUpReelSwaps(job, reels)
    const commitments = newReelCommitments(job, reels)
    const steps: SagaStep[] = []
    let finalJob: JobResponse | null = null

    // 1. Swap out Used-up Reels: one Job rewrite, fees preserved, with an
    //    auto-note recording the swap (the only trace once persisted).
    const swapMap = new Map<string, string>()
    if (swaps.length > 0) {
      const clauses: string[] = []
      for (const { reel, labels } of swaps) {
        const replId = swapChoices.get(reel.id)
        if (!replId) return // guarded by the confirm button; defensive
        swapMap.set(reel.id, replId)
        const repl = availReels.find((r) => r.id === replId)
        const replName = repl ? `${repl.brand} ${repl.model}` : 'another reel'
        clauses.push(
          `${reel.brand} ${reel.model} (${labels.join(' & ')}) was used up; restrung from ${replName}.`,
        )
      }
      const note = `Reel swap: ${clauses.join(' ')}`
      const newNotes = job.notes ? `${job.notes}\n${note}` : note
      const original = toUpdateRequest(job)
      const rewrite = buildSwapRequest(job, swapMap, newNotes)
      steps.push({
        do: async () => {
          await updateJob(id, rewrite)
        },
        undo: async () => {
          await updateJob(id, original)
        },
      })
    }

    // 2. Commit every New Reel that will be strung from: the Job's existing New
    //    Reels plus any New replacement Reel. Deduped so we never double-flip.
    const commitIds = new Set<string>()
    for (const { reel } of commitments) commitIds.add(reel.id)
    for (const replId of swapMap.values()) {
      if (availReels.find((r) => r.id === replId)?.state === 'NEW') commitIds.add(replId)
    }
    for (const reelId of commitIds) {
      steps.push({
        do: async () => {
          await changeReelState(reelId, 'IN_USE')
        },
        undo: async () => {
          await changeReelState(reelId, 'NEW')
        },
      })
    }

    // 3. Advance the stage — last, so a failure is caught before the Job moves.
    steps.push({
      do: async () => {
        finalJob = await changeJobStage(id, 'IN_PROGRESS')
      },
      undo: async () => {},
    })

    setStarting(true)
    const completed: SagaStep[] = []
    try {
      for (const step of steps) {
        await step.do()
        completed.push(step)
      }
      setShowStart(false)
      if (finalJob) setJob(finalJob)
      const parts: string[] = []
      if (swaps.length > 0) parts.push(`${swaps.length} reel${swaps.length > 1 ? 's' : ''} swapped`)
      if (commitIds.size > 0) parts.push(`${commitIds.size} marked In Use`)
      showToast(`Started${parts.length ? ` · ${parts.join(', ')}` : ''}`)
    } catch {
      // Compensate: undo completed steps in reverse so nothing changed.
      let revertFailed = 0
      for (const step of completed.reverse()) {
        try {
          await step.undo()
        } catch {
          revertFailed++
        }
      }
      setShowStart(false)
      if (revertFailed > 0) {
        showToast(
          `Couldn't start the job, and ${revertFailed} change${revertFailed > 1 ? 's' : ''} couldn't be rolled back — check the Strings page.`,
          'error',
        )
      } else {
        showToast("Couldn't start the job — nothing was changed. Please try again.", 'error')
      }
    } finally {
      setStarting(false)
      // Re-sync Reel caches (the swap may have changed which Reels are referenced).
      await refreshReelMaps(finalJob ?? job)
    }
  }

  /** Refresh both Reel caches (state + display name) for a Job's referenced Reels. */
  async function refreshReelMaps(j: JobResponse) {
    const reelIds = referencedReelIds(j)
    const entries = await Promise.all(
      reelIds.map((rid) =>
        getReel(rid)
          .then((r) => [rid, r] as const)
          .catch(() => [rid, null] as const),
      ),
    )
    setReels((prev) => {
      const next = new Map(prev)
      for (const [rid, r] of entries) if (r) next.set(rid, r)
      return next
    })
    setReelNames((prev) => {
      const next = new Map(prev)
      for (const [rid, r] of entries) next.set(rid, r ? reelDisplayName(r) : 'Reel')
      return next
    })
  }

  /**
   * Finish the Job (advance to Done), recording Reel exhaustion and — on a Mono
   * Job whose Reel ran out mid-racket — a Reel substitution. Runs as an ordered
   * saga with full compensation: stage advance is last, and any failure rolls
   * back the completed steps so nothing changed. See ADR 0009.
   */
  async function handleConfirmDone() {
    if (!job || !id) return
    const isMono = !job.hybrid
    const steps: SagaStep[] = []
    let finalJob: JobResponse | null = null

    // Queue a USED_UP transition for a Reel (skipping any already used up).
    const exhaustReel = (reelId: string) => {
      const prev = reels.get(reelId)?.state
      if (prev === 'USED_UP') return
      steps.push({
        do: async () => {
          await changeReelState(reelId, 'USED_UP')
        },
        undo: async () => {
          if (prev) await changeReelState(reelId, prev)
        },
      })
    }

    if (isMono && monoLasted === false) {
      // Reel substitution: rewrite Mono → Hybrid, preserving the agreed price by
      // splitting the original String Fee F/2 on each side (not derived from the
      // substitute Reel's own fee — see ADR 0009).
      const r1 = job.mains.reelId!
      const r2 = substituteReelId
      const f = job.totalStringFee
      const mainsFee = round2(f / 2)
      const crossFee = round2(f - mainsFee) // mainsFee + crossFee === f exactly
      const subReel = availReels.find((r) => r.id === r2)
      const mainsReel = reels.get(r1)
      const subName = subReel ? `${subReel.brand} ${subReel.model}` : 'another reel'
      const mainsName = mainsReel ? `${mainsReel.brand} ${mainsReel.model}` : 'the mains reel'
      const note = `Reel substitution: ${mainsName} ran out after the mains; crosses strung from ${subName}.`
      const newNotes = job.notes ? `${job.notes}\n${note}` : note
      const original = toUpdateRequest(job)
      const rewrite: UpdateJobRequest = {
        dueDate: job.dueDate,
        notes: newNotes,
        mainsTension: job.mainsTension,
        crossesTension: job.crossesTension,
        serviceFee: job.serviceFee,
        hybrid: true,
        mains: { type: 'REEL', reelId: r1, stringFee: mainsFee },
        crosses: { type: 'REEL', reelId: r2, stringFee: crossFee },
      }
      // 1. Rewrite the Job to Hybrid.
      steps.push({
        do: async () => {
          await updateJob(id, rewrite)
        },
        undo: async () => {
          await updateJob(id, original)
        },
      })
      // 2. Commit the substitute Reel if it was New.
      if (subReel?.state === 'NEW') {
        steps.push({
          do: async () => {
            await changeReelState(r2, 'IN_USE')
          },
          undo: async () => {
            await changeReelState(r2, 'NEW')
          },
        })
      }
      // 3. The mains Reel is definitionally empty.
      exhaustReel(r1)
    } else if (isMono) {
      // Mono lasted the whole racket: optionally mark the single Reel used up.
      if (monoUsedUp && job.mains.reelId) exhaustReel(job.mains.reelId)
    } else {
      // Hybrid: mark each Reel the Stringer flagged as used up.
      for (const reelId of usedUpReels) exhaustReel(reelId)
    }

    // 4. Advance the stage — last, so a failure is caught before the Job moves.
    steps.push({
      do: async () => {
        finalJob = await changeJobStage(id, 'DONE')
      },
      undo: async () => {},
    })

    setFinishing(true)
    const completed: SagaStep[] = []
    try {
      for (const step of steps) {
        await step.do()
        completed.push(step)
      }
      setShowDone(false)
      if (finalJob) setJob(finalJob)
      showToast('Job marked Return to Customer')
    } catch {
      // Compensate: undo completed steps in reverse so nothing changed.
      let revertFailed = 0
      for (const step of completed.reverse()) {
        try {
          await step.undo()
        } catch {
          revertFailed++
        }
      }
      setShowDone(false)
      if (revertFailed > 0) {
        showToast(
          `Couldn't finish the job, and ${revertFailed} change${revertFailed > 1 ? 's' : ''} couldn't be rolled back — check the Strings page.`,
          'error',
        )
      } else {
        showToast("Couldn't finish the job — nothing was changed. Please try again.", 'error')
      }
    } finally {
      setFinishing(false)
      // Re-sync Reel caches regardless of outcome (the rewrite may have added a side).
      await refreshReelMaps(finalJob ?? job)
    }
  }

  async function handleDelete() {
    if (!id) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteJob(id)
      showToast('Job deleted')
      navigate('/')
    } catch {
      setDeleting(false)
      setDeleteError('Failed to delete the job. Please try again.')
    }
  }

  function sideText(side?: StringSideResponse): string {
    if (!side) return '—'
    if (side.type === 'OWN') return side.stringName || 'Own string'
    return (side.reelId && reelNames.get(side.reelId)) || 'Reel'
  }

  function sideSource(side?: StringSideResponse): string {
    if (!side) return ''
    return side.type === 'OWN' ? "Customer's own" : 'From reel'
  }

  if (loading) {
    return (
      <div style={{ padding: 'var(--sp-8)', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>
        Loading…
      </div>
    )
  }

  if (error || !job) {
    return (
      <div style={{ padding: 'var(--sp-8)', color: 'var(--status-overdue-fg)', fontFamily: 'var(--font-body)' }}>
        {error ?? 'Job not found.'}
      </div>
    )
  }

  const customerName = customer ? `${customer.firstName} ${customer.lastName}` : '…'
  const racketName = racket ? `${racket.brand} ${racket.model}` : '…'
  const currentIndex = JOB_STAGES.indexOf(job.stage)
  const next = nextStage(job.stage)

  // Start-gate derived values (ADR 0008 commit + ADR 0010 swap).
  const commitReels = newReelCommitments(job, reels)
  const swapReels = usedUpReelSwaps(job, reels)
  const startCandidates = availReels.filter((r) => r.state !== 'USED_UP')
  const startValid = swapReels.every(({ reel }) => swapChoices.get(reel.id))

  // Done-prompt derived values (ADR 0009).
  const isMono = !job.hybrid
  const monoMainsName =
    job.mains.type === 'REEL' && job.mains.reelId ? reelNames.get(job.mains.reelId) ?? 'the reel' : 'the reel'
  const substituteCandidates = availReels.filter((r) => r.state !== 'USED_UP' && r.id !== job.mains.reelId)
  const hybridReelRefs = reelRefsByReel(job)
  const doneValid = isMono
    ? monoLasted !== null && (monoLasted === true || substituteReelId !== '')
    : true

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link>
            <ChevronRight size={12} />
            <span>{customerName}</span>
          </div>
          <h1 className="page-title">{customerName}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginTop: 'var(--sp-2)' }}>
            <span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>{racketName}</span>
            <span className={`badge ${JOB_STAGE_BADGE_CLASS[job.stage]}`}>{JOB_STAGE_LABELS[job.stage]}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => navigate(`/jobs/${id}/edit`)}
            title="Edit job"
            aria-label="Edit job"
          >
            <Pencil size={16} />
          </button>
          <button
            className="btn btn-danger btn-icon"
            onClick={() => setShowDelete(true)}
            title="Delete job"
            aria-label="Delete job"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Stage bar */}
        <div className="card" style={{ marginBottom: 'var(--sp-6)', padding: 'var(--sp-6) var(--sp-8)' }}>
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
              color: 'var(--fg-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontFamily: 'var(--font-mono)',
              marginBottom: 'var(--sp-5)',
            }}
          >
            Job Progress
          </div>
          <div className="stage-bar">
            {JOB_STAGES.map((stage, i) => {
              // At the terminal Stage the Job is finished, so the current step renders
              // as done (ticked) too — not as a pending "you-are-here" dot. See CONTEXT.md.
              const atTerminal = job.stage === TERMINAL_STAGE
              const isDone = i < currentIndex || (i === currentIndex && atTerminal)
              const cls = isDone ? 'done' : i === currentIndex ? 'active' : ''
              // Mark the Stage the Job is at (works at the terminal Stage too, where
              // it is 'done' rather than 'active'). On mobile only this step's label
              // is shown; the others collapse to dots. See shared.css.
              const current = i === currentIndex ? 'current' : ''
              return (
                <div key={stage} className={`stage-step ${cls} ${current}`}>
                  <div className="stage-dot">{isDone && <Check size={13} strokeWidth={2.5} />}</div>
                  <div className="stage-label">{JOB_STAGE_LABELS[stage]}</div>
                </div>
              )
            })}
          </div>
          {next && (
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={handleAdvance}
              disabled={advancing || starting}
            >
              {advancing ? 'Advancing…' : `Advance to ${JOB_STAGE_LABELS[next]}`}
              {!advancing && <ArrowRight size={16} />}
            </button>
          )}
        </div>

        <div className="job-detail-grid">
          <div className="job-detail-cols">
            {/* Stringing */}
            <div className="detail-section">
              <div className="detail-section-header">
                <Scissors size={14} />
                <span className="detail-section-title">Stringing — {job.hybrid ? 'Hybrid' : 'Mono'}</span>
              </div>
              <div className="detail-section-body">
                <div className="detail-row">
                  <span className="detail-key">Racket</span>
                  <span className="detail-val">{racketName}</span>
                </div>
                {job.hybrid ? (
                  <>
                    <div className="detail-row">
                      <span className="detail-key">Mains string</span>
                      <span className="detail-val">{sideText(job.mains)} <span style={{ color: 'var(--fg-muted)' }}>· {sideSource(job.mains)}</span></span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-key">Crosses string</span>
                      <span className="detail-val">{sideText(job.crosses)} <span style={{ color: 'var(--fg-muted)' }}>· {sideSource(job.crosses)}</span></span>
                    </div>
                  </>
                ) : (
                  <div className="detail-row">
                    <span className="detail-key">String</span>
                    <span className="detail-val">{sideText(job.mains)} <span style={{ color: 'var(--fg-muted)' }}>· {sideSource(job.mains)}</span></span>
                  </div>
                )}
                <div className="detail-row">
                  <span className="detail-key">Mains tension</span>
                  <span className="detail-val mono">{job.mainsTension} kg</span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Crosses tension</span>
                  <span className="detail-val mono">{job.crossesTension} kg</span>
                </div>
                {job.notes && (
                  <div className="detail-row">
                    <span className="detail-key">Notes</span>
                    <span className="detail-val" style={{ maxWidth: '60%' }}>{job.notes}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Job details */}
            <div className="detail-section">
              <div className="detail-section-header">
                <Calendar size={14} />
                <span className="detail-section-title">Job Details</span>
              </div>
              <div className="detail-section-body">
                <div className="detail-row">
                  <span className="detail-key">Customer</span>
                  <span className="detail-val">
                    <Link to={`/customers/${job.customerId}`} style={{ color: 'var(--accent)' }}>
                      {customerName}
                    </Link>
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Due date</span>
                  <span className="detail-val mono">{formatDate(job.dueDate)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Created</span>
                  <span className="detail-val mono">{formatDate(job.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Price */}
          <div className="detail-section">
            <div className="detail-section-header">
              <Receipt size={14} />
              <span className="detail-section-title">Price</span>
            </div>
            <div className="detail-section-body">
              <div className="price-summary">
                <div className="price-row">
                  <span className="price-key">Service fee</span>
                  <span className="price-val">{money(job.serviceFee)}</span>
                </div>
                <div className="price-row">
                  <span className="price-key">String fee</span>
                  <span className="price-val">{money(job.totalStringFee)}</span>
                </div>
                <div className="price-total">
                  <span className="price-key">Total</span>
                  <span className="price-val">{money(job.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showStart && (
        <div className="modal-overlay open">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">
                {swapReels.length > 0
                  ? 'Start job — replace used-up reels'
                  : `Mark ${commitReels.length > 1 ? 'reels' : 'reel'} as In Use?`}
              </span>
            </div>
            <div style={{ padding: 'var(--sp-2) 0 var(--sp-4)', fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
              {/* Swap section: Used-up Reels must be replaced before starting (ADR 0010). */}
              {swapReels.length > 0 && (
                <div style={{ marginBottom: commitReels.length > 0 ? 'var(--sp-6)' : 0 }}>
                  <p style={{ margin: '0 0 var(--sp-3)' }}>
                    {swapReels.length > 1 ? 'These reels are' : 'This reel is'} used up and must be replaced to start
                    the job. The agreed price stays the same.
                  </p>
                  {availLoading ? (
                    <div style={{ color: 'var(--fg-muted)' }}>Loading reels…</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
                      {swapReels.map(({ reel, labels }) => {
                        const candidates = startCandidates.filter((r) => r.id !== reel.id)
                        return (
                          <div key={reel.id}>
                            <div style={{ marginBottom: 'var(--sp-2)' }}>
                              <strong>{reel.brand} {reel.model}</strong>
                              <span style={{ color: 'var(--fg-muted)' }}>
                                {' '}· {reel.gauge} mm · {labels.join(' & ')} · used up
                              </span>
                            </div>
                            {candidates.length === 0 ? (
                              <div style={{ color: 'var(--status-overdue-fg)' }}>
                                No available reel to replace this — add a reel first.
                              </div>
                            ) : (
                              <select
                                className="select"
                                value={swapChoices.get(reel.id) ?? ''}
                                onChange={(e) =>
                                  setSwapChoices((prev) => {
                                    const nextMap = new Map(prev)
                                    if (e.target.value) nextMap.set(reel.id, e.target.value)
                                    else nextMap.delete(reel.id)
                                    return nextMap
                                  })
                                }
                                disabled={starting}
                              >
                                <option value="">Replace with…</option>
                                {candidates.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {reelDisplayName(r)} · {r.state === 'NEW' ? 'New' : 'In Use'}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Commit section: New Reels move to In Use on start (ADR 0008). */}
              {commitReels.length > 0 && (
                <div>
                  <p style={{ margin: 0 }}>
                    Starting this job draws from {commitReels.length > 1 ? 'these new reels' : 'this new reel'}:
                  </p>
                  <ul
                    style={{
                      margin: 'var(--sp-3) 0 0',
                      paddingInlineStart: 'var(--sp-5)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--sp-1)',
                    }}
                  >
                    {commitReels.map(({ reel, labels }) => (
                      <li key={reel.id}>
                        <strong>{reel.brand} {reel.model}</strong>
                        <span style={{ color: 'var(--fg-muted)' }}> · {reel.gauge} mm · {labels.join(' & ')}</span>
                      </li>
                    ))}
                  </ul>
                  <p style={{ margin: 'var(--sp-4) 0 0', color: 'var(--fg-muted)' }}>
                    {commitReels.length > 1 ? "They'll" : "It'll"} move from New to In Use.
                  </p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowStart(false)} disabled={starting}>
                Not now
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmStart}
                disabled={starting || !startValid}
              >
                {starting ? 'Starting…' : swapReels.length > 0 ? 'Replace & start' : 'Mark In Use & start'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDone && (
        <div className="modal-overlay open">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Finish job — reel check</span>
            </div>
            <div style={{ padding: 'var(--sp-2) 0 var(--sp-4)', fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
              {isMono ? (
                <>
                  <p style={{ margin: '0 0 var(--sp-3)' }}>
                    Did <strong>{monoMainsName}</strong> last the whole racket?
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="mono-lasted"
                        checked={monoLasted === true}
                        onChange={() => setMonoLasted(true)}
                        disabled={finishing}
                      />
                      Yes — strung the mains and crosses
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="mono-lasted"
                        checked={monoLasted === false}
                        onChange={() => setMonoLasted(false)}
                        disabled={finishing}
                      />
                      No — it ran out after the mains
                    </label>
                  </div>

                  {monoLasted === true && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--sp-2)',
                        cursor: 'pointer',
                        marginTop: 'var(--sp-4)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={monoUsedUp}
                        onChange={(e) => setMonoUsedUp(e.target.checked)}
                        disabled={finishing}
                      />
                      The reel is now used up (empty)
                    </label>
                  )}

                  {monoLasted === false && (
                    <div style={{ marginTop: 'var(--sp-4)' }}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 500,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: 'var(--fg-muted)',
                          fontFamily: 'var(--font-mono)',
                          marginBottom: 'var(--sp-2)',
                        }}
                      >
                        Finish the crosses from
                      </label>
                      {availLoading ? (
                        <div style={{ color: 'var(--fg-muted)' }}>Loading reels…</div>
                      ) : substituteCandidates.length === 0 ? (
                        <div style={{ color: 'var(--status-overdue-fg)' }}>
                          No other reels available to finish the crosses.
                        </div>
                      ) : (
                        <select
                          className="select"
                          value={substituteReelId}
                          onChange={(e) => setSubstituteReelId(e.target.value)}
                          disabled={finishing}
                        >
                          <option value="">Select a reel…</option>
                          {substituteCandidates.map((r) => (
                            <option key={r.id} value={r.id}>
                              {reelDisplayName(r)} · {r.state === 'NEW' ? 'New' : 'In Use'}
                            </option>
                          ))}
                        </select>
                      )}
                      <p style={{ margin: 'var(--sp-3) 0 0', color: 'var(--fg-muted)' }}>
                        <strong>{monoMainsName}</strong> will be marked used up, and the job becomes a hybrid. The total
                        stays <span className="mono">{money(job.total)}</span>.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p style={{ margin: '0 0 var(--sp-3)' }}>Which reels are now used up (empty)?</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                    {hybridReelRefs.map(({ reelId, labels }) => (
                      <label
                        key={reelId}
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', cursor: 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={usedUpReels.has(reelId)}
                          onChange={(e) =>
                            setUsedUpReels((prev) => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(reelId)
                              else next.delete(reelId)
                              return next
                            })
                          }
                          disabled={finishing}
                        />
                        <span>
                          {reelNames.get(reelId) ?? 'Reel'}{' '}
                          <span style={{ color: 'var(--fg-muted)' }}>· {labels.join(' & ')}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p style={{ margin: 'var(--sp-3) 0 0', color: 'var(--fg-muted)' }}>
                    Leave all unchecked if none ran out.
                  </p>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowDone(false)} disabled={finishing}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleConfirmDone} disabled={finishing || !doneValid}>
                {finishing ? 'Finishing…' : 'Mark as Return to Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDelete && (
        <div className="modal-overlay open">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Delete Job</span>
            </div>
            <div style={{ padding: 'var(--sp-2) 0 var(--sp-4)', fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
              Are you sure you want to delete this job for <strong>{customerName}</strong>? This cannot be undone.
            </div>
            {deleteError && (
              <p style={{ color: 'var(--status-overdue-fg)', fontSize: 'var(--text-sm)', margin: '0 0 var(--sp-3)' }}>
                {deleteError}
              </p>
            )}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} disabled={deleting}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
