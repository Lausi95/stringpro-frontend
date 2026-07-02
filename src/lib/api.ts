import keycloak from './keycloak'
import { loginWithOffline } from './auth'

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

export interface CustomerResponse {
  id: string
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  notes?: string
  createdAt: string
}

export interface PagedCustomerResponse {
  content: CustomerResponse[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}

export interface CustomerFormData {
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  notes?: string
}

export interface RacketResponse {
  id: string
  customerId: string
  brand: string
  model: string
  headSize: number
  stringMains: number
  stringCrosses: number
  notes?: string
  createdAt: string
}

export interface RacketFormData {
  brand: string
  model: string
  headSize: number
  stringMains: number
  stringCrosses: number
  notes?: string
}

export type ReelMaterial = 'POLYESTER' | 'NATURAL_GUT' | 'MULTIFILAMENT' | 'SYNTHETIC_GUT'
export type ReelState = 'NEW' | 'IN_USE' | 'USED_UP'

export interface ReelResponse {
  id: string
  brand: string
  model: string
  material: ReelMaterial
  /** Gauge in mm, e.g. 1.25 */
  gauge: number
  reelLengthMeters: number
  /** What the stringer paid for the reel. */
  cost: number
  /** String Fee billed to the customer per stringing. */
  stringFee: number
  metersPerJob: number
  /** ISO date (yyyy-MM-dd). */
  purchaseDate: string
  state: ReelState
  createdAt: string
}

export interface PagedReelResponse {
  content: ReelResponse[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}

export interface ReelFormData {
  brand: string
  model: string
  material: ReelMaterial
  gauge: number
  reelLengthMeters: number
  cost: number
  stringFee: number
  metersPerJob: number
  purchaseDate: string
}

export interface SettingsResponse {
  serviceFee: number
  fullName: string
  /** Bare PayPal.Me username (e.g. "TLausmann"), not an email or a paypal.me URL. */
  paypalHandle: string
  iban: string
  address: string
  /** ISO date-time; absent/zero until the settings have been saved at least once. */
  updatedAt?: string
}

export interface SettingsFormData {
  serviceFee: number
  fullName: string
  paypalHandle: string
  iban: string
  address: string
}

export type JobStage = 'ANNOUNCED' | 'PICKED_UP' | 'IN_PROGRESS' | 'DONE' | 'RETURNED'

/** The five Job stages in lifecycle order. Progress is forward-only. */
export const JOB_STAGES: JobStage[] = [
  'ANNOUNCED',
  'PICKED_UP',
  'IN_PROGRESS',
  'DONE',
  'RETURNED',
]

/**
 * The terminal Stage: being *at* it means the Job is finished, not pending.
 * Progress indicators render this Stage (and all prior steps) as done/ticked.
 * See CONTEXT.md — "Rendering a Stage as pending vs. complete".
 */
export const TERMINAL_STAGE: JobStage = 'RETURNED'

export const JOB_STAGE_LABELS: Record<JobStage, string> = {
  ANNOUNCED: 'Announced',
  PICKED_UP: 'Picked Up',
  IN_PROGRESS: 'In Progress',
  DONE: 'Return to Customer',
  RETURNED: 'Returned',
}

/** CSS badge class for each stage (defined in shared.css). */
export const JOB_STAGE_BADGE_CLASS: Record<JobStage, string> = {
  ANNOUNCED: 'badge-announced',
  PICKED_UP: 'badge-picked-up',
  IN_PROGRESS: 'badge-in-progress',
  DONE: 'badge-done',
  RETURNED: 'badge-returned',
}

/** The next stage in the forward-only lifecycle, or null when at the terminal stage. */
export function nextStage(stage: JobStage): JobStage | null {
  const i = JOB_STAGES.indexOf(stage)
  return i >= 0 && i < JOB_STAGES.length - 1 ? JOB_STAGES[i + 1] : null
}

/** Where the String on a side comes from: a Reel from inventory, or the Customer's own string. */
export type StringSideType = 'REEL' | 'OWN'

export interface StringSideRequest {
  type: StringSideType
  /** Free-text name when type === 'OWN'. */
  stringName?: string
  /** Reel id when type === 'REEL'. */
  reelId?: string
  /** String Fee billed for this side. 0 (or omitted) for 'OWN'. */
  stringFee?: number
}

export interface StringSideResponse {
  type: StringSideType
  stringName?: string
  reelId?: string
  stringFee: number
}

export interface JobResponse {
  id: string
  customerId: string
  racketId: string
  /** ISO date (yyyy-MM-dd). */
  dueDate: string
  notes?: string
  mainsTension: number
  crossesTension: number
  /** true when mains and crosses use different Strings. */
  hybrid: boolean
  mains: StringSideResponse
  /** Absent on mono Jobs (the cross side mirrors the mains). */
  crosses?: StringSideResponse
  serviceFee: number
  totalStringFee: number
  total: number
  /** Sum of recorded Payments against this Job (derived, read-only). */
  amountPaid: number
  /** True once amountPaid ≥ total (derived, read-only). */
  fullyPaid: boolean
  stage: JobStage
  createdAt: string
}

export interface PagedJobResponse {
  content: JobResponse[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}

/**
 * Create payload. For a mono Job send `mains` only and omit `crosses`
 * (the backend infers the cross side); set `hybrid: false`.
 */
export interface CreateJobRequest {
  customerId: string
  racketId: string
  dueDate: string
  notes?: string
  mainsTension: number
  crossesTension: number
  hybrid: boolean
  mains: StringSideRequest
  crosses?: StringSideRequest
  serviceFee: number
}

/** Edit payload. Customer and Racket cannot change after creation. */
export type UpdateJobRequest = Omit<CreateJobRequest, 'customerId' | 'racketId'>

/**
 * Job stages at which a Reel is considered consumed — string has physically
 * been pulled. Earlier stages reference a Reel but have not drawn from it.
 * See ADR 0007.
 */
export const CONSUMING_STAGES: ReadonlySet<JobStage> = new Set<JobStage>([
  'IN_PROGRESS',
  'DONE',
  'RETURNED',
])

export function isConsuming(job: JobResponse): boolean {
  return CONSUMING_STAGES.has(job.stage)
}

/**
 * The String Sides of a Job, treating a Mono Job as mains-only even if the
 * backend ever populates `crosses` (guards the double-count of ADR 0006).
 */
export function jobSides(job: JobResponse): StringSideResponse[] {
  if (!job.hybrid) return [job.mains]
  return job.crosses ? [job.mains, job.crosses] : [job.mains]
}

/** Which side(s) of a consuming Job drew from a given Reel. */
export interface ReelSideUsage {
  job: JobResponse
  /** true when the Reel is on the mains side. */
  mains: boolean
  /** true when the Reel is on the crosses side (Hybrid only). */
  crosses: boolean
  /** Meters this Job drew from the Reel (Hybrid side = half a stringing). */
  meters: number
  /** String Fee earned from this Reel on this Job (sum of the matching sides). */
  earned: number
}

/** Derived usage/earnings for one Reel, aggregated from consuming Jobs. See ADR 0007. */
export interface ReelUsage {
  /** Distinct consuming Jobs that drew from this Reel. */
  jobCount: number
  /** Total meters drawn from the Reel. */
  metersConsumed: number
  /** Total String Fees earned from the Reel. */
  earned: number
}

const EMPTY_USAGE: ReelUsage = { jobCount: 0, metersConsumed: 0, earned: 0 }

/**
 * How a single consuming Job draws from one Reel: meters (Hybrid side = half
 * `metersPerJob`) and earned String Fee, summed across the sides that match.
 * Returns null when the Job does not reference the Reel. See ADR 0007.
 */
export function reelSideUsage(job: JobResponse, reel: ReelResponse): ReelSideUsage | null {
  const sides = jobSides(job)
  const onMains = sides[0]?.type === 'REEL' && sides[0]?.reelId === reel.id
  const crossSide = sides[1]
  const onCrosses = crossSide?.type === 'REEL' && crossSide?.reelId === reel.id
  if (!onMains && !onCrosses) return null
  // A Hybrid side strings half the racket, so draws half a stringing's meters.
  const perSideMeters = job.hybrid ? reel.metersPerJob / 2 : reel.metersPerJob
  let meters = 0
  let earned = 0
  if (onMains) {
    meters += perSideMeters
    earned += sides[0].stringFee
  }
  if (onCrosses && crossSide) {
    meters += perSideMeters
    earned += crossSide.stringFee
  }
  return { job, mains: onMains, crosses: onCrosses, meters, earned }
}

/** Aggregate a Reel's usage from a list of Jobs (consuming stages only). */
export function aggregateReelUsage(reel: ReelResponse, jobs: JobResponse[]): ReelUsage {
  let jobCount = 0
  let metersConsumed = 0
  let earned = 0
  for (const job of jobs) {
    if (!isConsuming(job)) continue
    const usage = reelSideUsage(job, reel)
    if (!usage) continue
    jobCount += 1
    metersConsumed += usage.meters
    earned += usage.earned
  }
  return { jobCount, metersConsumed, earned }
}

/** Sum of `ReelUsage` across reels — for the inventory page summary cards. */
export function sumReelUsage(usages: Iterable<ReelUsage>): ReelUsage {
  let acc = { ...EMPTY_USAGE }
  for (const u of usages) {
    acc = {
      jobCount: acc.jobCount + u.jobCount,
      metersConsumed: acc.metersConsumed + u.metersConsumed,
      earned: acc.earned + u.earned,
    }
  }
  return acc
}

export interface ApiError extends Error {
  status: number
}

/**
 * Central authenticated fetch. Refreshes the access token just-in-time (the app
 * keeps no background refresh loop — an idle app simply refreshes on its next
 * call), attaches the bearer header, and normalises non-2xx into an ApiError.
 * Pages never call fetch directly; every endpoint below goes through here.
 * See docs/adr/0015-persist-offline-token-localstorage.md.
 */
async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    // Refresh if the access token expires within 30s. Uses the stored offline
    // token via a direct token-endpoint call; rejects once that token is gone.
    await keycloak.updateToken(30)
  } catch {
    // Offline token expired/revoked mid-session → send the user to log in again.
    void loginWithOffline()
    const err = new Error('Re-authentication required') as ApiError
    err.status = 401
    throw err
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${keycloak.token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  if (!res.ok) {
    const err = new Error(`API error ${res.status}`) as ApiError
    err.status = res.status
    throw err
  }
  return res
}

export async function listCustomers(
  params: { page?: number; size?: number; name?: string } = {},
): Promise<PagedCustomerResponse> {
  const query = new URLSearchParams()
  if (params.page !== undefined) query.set('page', String(params.page))
  if (params.size !== undefined) query.set('size', String(params.size))
  if (params.name) query.set('name', params.name)
  const res = await apiFetch(`/customers?${query}`)
  return res.json()
}

export async function createCustomer(data: CustomerFormData): Promise<CustomerResponse> {
  const res = await apiFetch(`/customers`, { method: 'POST', body: JSON.stringify(data) })
  return res.json()
}

export async function getCustomer(id: string): Promise<CustomerResponse> {
  const res = await apiFetch(`/customers/${id}`)
  return res.json()
}

export async function updateCustomer(
  id: string,
  data: CustomerFormData,
): Promise<CustomerResponse> {
  const res = await apiFetch(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  return res.json()
}

export async function deleteCustomer(id: string): Promise<void> {
  await apiFetch(`/customers/${id}`, { method: 'DELETE' })
}

export async function listRackets(customerId: string): Promise<RacketResponse[]> {
  const query = new URLSearchParams({ customerId })
  const res = await apiFetch(`/rackets?${query}`)
  return res.json()
}

export async function getRacket(id: string): Promise<RacketResponse> {
  const res = await apiFetch(`/rackets/${id}`)
  return res.json()
}

export async function createRacket(
  customerId: string,
  data: RacketFormData,
): Promise<RacketResponse> {
  const res = await apiFetch(`/rackets`, {
    method: 'POST',
    body: JSON.stringify({ ...data, customerId }),
  })
  return res.json()
}

export async function updateRacket(id: string, data: RacketFormData): Promise<RacketResponse> {
  const res = await apiFetch(`/rackets/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  return res.json()
}

export async function deleteRacket(id: string): Promise<void> {
  await apiFetch(`/rackets/${id}`, { method: 'DELETE' })
}

export async function listReels(
  params: { page?: number; size?: number; state?: ReelState } = {},
): Promise<PagedReelResponse> {
  const query = new URLSearchParams()
  if (params.page !== undefined) query.set('page', String(params.page))
  if (params.size !== undefined) query.set('size', String(params.size))
  if (params.state) query.set('state', params.state)
  const res = await apiFetch(`/reels?${query}`)
  return res.json()
}

export async function getReel(id: string): Promise<ReelResponse> {
  const res = await apiFetch(`/reels/${id}`)
  return res.json()
}

export async function createReel(data: ReelFormData): Promise<ReelResponse> {
  const res = await apiFetch(`/reels`, { method: 'POST', body: JSON.stringify(data) })
  return res.json()
}

export async function updateReel(id: string, data: ReelFormData): Promise<ReelResponse> {
  const res = await apiFetch(`/reels/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  return res.json()
}

export async function changeReelState(id: string, state: ReelState): Promise<ReelResponse> {
  const res = await apiFetch(`/reels/${id}/state`, {
    method: 'PATCH',
    body: JSON.stringify({ state }),
  })
  return res.json()
}

export async function deleteReel(id: string): Promise<void> {
  await apiFetch(`/reels/${id}`, { method: 'DELETE' })
}

export async function getSettings(): Promise<SettingsResponse> {
  const res = await apiFetch(`/settings`)
  return res.json()
}

export async function updateSettings(data: SettingsFormData): Promise<SettingsResponse> {
  const res = await apiFetch(`/settings`, { method: 'PUT', body: JSON.stringify(data) })
  return res.json()
}

export async function listJobs(
  params: {
    page?: number
    size?: number
    stage?: JobStage
    customerId?: string
    racketId?: string
    reelId?: string
    fullyPaid?: boolean
  } = {},
): Promise<PagedJobResponse> {
  const query = new URLSearchParams()
  if (params.page !== undefined) query.set('page', String(params.page))
  if (params.size !== undefined) query.set('size', String(params.size))
  if (params.stage) query.set('stage', params.stage)
  if (params.customerId) query.set('customerId', params.customerId)
  if (params.racketId) query.set('racketId', params.racketId)
  if (params.reelId) query.set('reelId', params.reelId)
  if (params.fullyPaid !== undefined) query.set('fullyPaid', String(params.fullyPaid))
  const res = await apiFetch(`/jobs?${query}`)
  return res.json()
}

/**
 * Fetch every Job matching the filters by paging to the last page. Unlike a
 * single generous `size`, this never silently truncates — Jobs grow with every
 * stringing, and the inventory money metrics depend on the full set (ADR 0007).
 */
export async function fetchAllJobs(
  params: {
    stage?: JobStage
    customerId?: string
    racketId?: string
    reelId?: string
    fullyPaid?: boolean
  } = {},
  pageSize = 200,
): Promise<JobResponse[]> {
  const all: JobResponse[] = []
  let page = 0
  // Guard against a misbehaving backend that never reports the last page.
  for (let guard = 0; guard < 1000; guard++) {
    const res = await listJobs({ ...params, page, size: pageSize })
    all.push(...res.content)
    if (res.content.length === 0 || page + 1 >= res.totalPages) break
    page += 1
  }
  return all
}

export async function getJob(id: string): Promise<JobResponse> {
  const res = await apiFetch(`/jobs/${id}`)
  return res.json()
}

export async function createJob(data: CreateJobRequest): Promise<JobResponse> {
  const res = await apiFetch(`/jobs`, { method: 'POST', body: JSON.stringify(data) })
  return res.json()
}

export async function updateJob(id: string, data: UpdateJobRequest): Promise<JobResponse> {
  const res = await apiFetch(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  return res.json()
}

export async function changeJobStage(id: string, stage: JobStage): Promise<JobResponse> {
  const res = await apiFetch(`/jobs/${id}/stage`, {
    method: 'PATCH',
    body: JSON.stringify({ stage }),
  })
  return res.json()
}

export async function deleteJob(id: string): Promise<void> {
  await apiFetch(`/jobs/${id}`, { method: 'DELETE' })
}

// ── Payments ────────────────────────────────────────────────────────────────

/** How a Payment was made. Fixed backend enum — not configurable in Settings. */
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'PAYPAL'

export const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'PAYPAL']

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  PAYPAL: 'PayPal',
}

export interface PaymentResponse {
  id: string
  jobId: string
  customerId: string
  amount: number
  method: PaymentMethod
  createdAt: string
}

export interface CreatePaymentRequest {
  jobId: string
  customerId: string
  amount: number
  method: PaymentMethod
}

/** Record a Payment against a Job. Amount may be partial or exceed the Balance (a tip). */
export async function createPayment(data: CreatePaymentRequest): Promise<PaymentResponse> {
  const res = await apiFetch(`/payments`, { method: 'POST', body: JSON.stringify(data) })
  return res.json()
}
