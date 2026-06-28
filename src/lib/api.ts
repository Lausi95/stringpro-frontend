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
  email: string
  iban: string
  address: string
  /** ISO date-time; absent/zero until the settings have been saved at least once. */
  updatedAt?: string
}

export interface SettingsFormData {
  serviceFee: number
  fullName: string
  email: string
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

interface ApiError extends Error {
  status: number
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (!res.ok) {
    const err = new Error(`API error ${res.status}`) as ApiError
    err.status = res.status
    throw err
  }
}

export async function listCustomers(
  token: string,
  params: { page?: number; size?: number; name?: string } = {},
): Promise<PagedCustomerResponse> {
  const query = new URLSearchParams()
  if (params.page !== undefined) query.set('page', String(params.page))
  if (params.size !== undefined) query.set('size', String(params.size))
  if (params.name) query.set('name', params.name)
  const res = await fetch(`${API_BASE}/customers?${query}`, { headers: authHeaders(token) })
  await throwIfNotOk(res)
  return res.json()
}

export async function createCustomer(
  token: string,
  data: CustomerFormData,
): Promise<CustomerResponse> {
  const res = await fetch(`${API_BASE}/customers`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  })
  await throwIfNotOk(res)
  return res.json()
}

export async function getCustomer(token: string, id: string): Promise<CustomerResponse> {
  const res = await fetch(`${API_BASE}/customers/${id}`, { headers: authHeaders(token) })
  await throwIfNotOk(res)
  return res.json()
}

export async function updateCustomer(
  token: string,
  id: string,
  data: CustomerFormData,
): Promise<CustomerResponse> {
  const res = await fetch(`${API_BASE}/customers/${id}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  })
  await throwIfNotOk(res)
  return res.json()
}

export async function deleteCustomer(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/customers/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  await throwIfNotOk(res)
}

export async function listRackets(token: string, customerId: string): Promise<RacketResponse[]> {
  const query = new URLSearchParams({ customerId })
  const res = await fetch(`${API_BASE}/rackets?${query}`, { headers: authHeaders(token) })
  await throwIfNotOk(res)
  return res.json()
}

export async function getRacket(token: string, id: string): Promise<RacketResponse> {
  const res = await fetch(`${API_BASE}/rackets/${id}`, { headers: authHeaders(token) })
  await throwIfNotOk(res)
  return res.json()
}

export async function createRacket(
  token: string,
  customerId: string,
  data: RacketFormData,
): Promise<RacketResponse> {
  const res = await fetch(`${API_BASE}/rackets`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ ...data, customerId }),
  })
  await throwIfNotOk(res)
  return res.json()
}

export async function updateRacket(
  token: string,
  id: string,
  data: RacketFormData,
): Promise<RacketResponse> {
  const res = await fetch(`${API_BASE}/rackets/${id}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  })
  await throwIfNotOk(res)
  return res.json()
}

export async function deleteRacket(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/rackets/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  await throwIfNotOk(res)
}

export async function listReels(
  token: string,
  params: { page?: number; size?: number; state?: ReelState } = {},
): Promise<PagedReelResponse> {
  const query = new URLSearchParams()
  if (params.page !== undefined) query.set('page', String(params.page))
  if (params.size !== undefined) query.set('size', String(params.size))
  if (params.state) query.set('state', params.state)
  const res = await fetch(`${API_BASE}/reels?${query}`, { headers: authHeaders(token) })
  await throwIfNotOk(res)
  return res.json()
}

export async function getReel(token: string, id: string): Promise<ReelResponse> {
  const res = await fetch(`${API_BASE}/reels/${id}`, { headers: authHeaders(token) })
  await throwIfNotOk(res)
  return res.json()
}

export async function createReel(token: string, data: ReelFormData): Promise<ReelResponse> {
  const res = await fetch(`${API_BASE}/reels`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  })
  await throwIfNotOk(res)
  return res.json()
}

export async function updateReel(
  token: string,
  id: string,
  data: ReelFormData,
): Promise<ReelResponse> {
  const res = await fetch(`${API_BASE}/reels/${id}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  })
  await throwIfNotOk(res)
  return res.json()
}

export async function changeReelState(
  token: string,
  id: string,
  state: ReelState,
): Promise<ReelResponse> {
  const res = await fetch(`${API_BASE}/reels/${id}/state`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ state }),
  })
  await throwIfNotOk(res)
  return res.json()
}

export async function deleteReel(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/reels/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  await throwIfNotOk(res)
}

export async function getSettings(token: string): Promise<SettingsResponse> {
  const res = await fetch(`${API_BASE}/settings`, { headers: authHeaders(token) })
  await throwIfNotOk(res)
  return res.json()
}

export async function updateSettings(
  token: string,
  data: SettingsFormData,
): Promise<SettingsResponse> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  })
  await throwIfNotOk(res)
  return res.json()
}

export async function listJobs(
  token: string,
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
  const res = await fetch(`${API_BASE}/jobs?${query}`, { headers: authHeaders(token) })
  await throwIfNotOk(res)
  return res.json()
}

/**
 * Fetch every Job matching the filters by paging to the last page. Unlike a
 * single generous `size`, this never silently truncates — Jobs grow with every
 * stringing, and the inventory money metrics depend on the full set (ADR 0007).
 */
export async function fetchAllJobs(
  token: string,
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
    const res = await listJobs(token, { ...params, page, size: pageSize })
    all.push(...res.content)
    if (res.content.length === 0 || page + 1 >= res.totalPages) break
    page += 1
  }
  return all
}

export async function getJob(token: string, id: string): Promise<JobResponse> {
  const res = await fetch(`${API_BASE}/jobs/${id}`, { headers: authHeaders(token) })
  await throwIfNotOk(res)
  return res.json()
}

export async function createJob(token: string, data: CreateJobRequest): Promise<JobResponse> {
  const res = await fetch(`${API_BASE}/jobs`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  })
  await throwIfNotOk(res)
  return res.json()
}

export async function updateJob(
  token: string,
  id: string,
  data: UpdateJobRequest,
): Promise<JobResponse> {
  const res = await fetch(`${API_BASE}/jobs/${id}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  })
  await throwIfNotOk(res)
  return res.json()
}

export async function changeJobStage(
  token: string,
  id: string,
  stage: JobStage,
): Promise<JobResponse> {
  const res = await fetch(`${API_BASE}/jobs/${id}/stage`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ stage }),
  })
  await throwIfNotOk(res)
  return res.json()
}

export async function deleteJob(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/jobs/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  await throwIfNotOk(res)
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
export async function createPayment(
  token: string,
  data: CreatePaymentRequest,
): Promise<PaymentResponse> {
  const res = await fetch(`${API_BASE}/payments`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  })
  await throwIfNotOk(res)
  return res.json()
}
