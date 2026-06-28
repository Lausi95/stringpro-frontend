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
