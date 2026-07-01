import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../../components/Toast'
import { isValidIban } from '../../lib/iban'
import {
  getSettings,
  updateSettings,
  type SettingsFormData,
  type SettingsResponse,
} from '../../lib/api'
import './SettingsPage.css'

/** Fields are held as strings so number inputs can be empty while editing. */
interface SettingsForm {
  serviceFee: string
  fullName: string
  email: string
  iban: string
  address: string
}

interface FieldErrors {
  serviceFee?: string
  email?: string
  iban?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function toForm(s: SettingsResponse): SettingsForm {
  return {
    serviceFee: s.serviceFee != null ? String(s.serviceFee) : '',
    fullName: s.fullName ?? '',
    email: s.email ?? '',
    iban: s.iban ?? '',
    address: s.address ?? '',
  }
}

/** Compare service fees by numeric value so "10" / "10.0" / 10 all match. */
function feesEqual(a: string, b: string): boolean {
  const na = parseFloat(a)
  const nb = parseFloat(b)
  if (Number.isNaN(na) && Number.isNaN(nb)) return a.trim() === b.trim()
  return na === nb
}

function isDirty(form: SettingsForm, baseline: SettingsForm): boolean {
  return (
    !feesEqual(form.serviceFee, baseline.serviceFee) ||
    form.fullName.trim() !== baseline.fullName.trim() ||
    form.email.trim() !== baseline.email.trim() ||
    form.iban.replace(/\s+/g, '').toUpperCase() !==
      baseline.iban.replace(/\s+/g, '').toUpperCase() ||
    form.address.trim() !== baseline.address.trim()
  )
}

/** updatedAt is absent/zero until the settings have been saved at least once. */
function parseSavedAt(iso?: string): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return null
  return d
}

function formatSavedAt(d: Date): string {
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const EMPTY_FORM: SettingsForm = {
  serviceFee: '',
  fullName: '',
  email: '',
  iban: '',
  address: '',
}

export default function SettingsPage() {
  const { showToast } = useToast()

  const [form, setForm] = useState<SettingsForm>(EMPTY_FORM)
  const [baseline, setBaseline] = useState<SettingsForm>(EMPTY_FORM)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setFetchError(null)
    getSettings()
      .then((s) => {
        if (!active) return
        const next = toForm(s)
        setForm(next)
        setBaseline(next)
        setSavedAt(parseSavedAt(s.updatedAt))
      })
      .catch(() => {
        if (active) setFetchError('Failed to load settings.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  const set = useCallback(
    <K extends keyof SettingsForm>(key: K) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = e.target.value
        setForm((f) => ({ ...f, [key]: value }))
        // Clear a field's error as soon as the user edits it.
        setErrors((prev) => (prev[key as keyof FieldErrors] ? { ...prev, [key]: undefined } : prev))
      },
    [],
  )

  function validate(): { errors: FieldErrors; data: SettingsFormData } | null {
    const nextErrors: FieldErrors = {}

    const feeNum = parseFloat(form.serviceFee)
    if (form.serviceFee.trim() === '' || Number.isNaN(feeNum) || feeNum < 0) {
      nextErrors.serviceFee = 'Enter a service fee of 0 or more.'
    }

    const email = form.email.trim()
    if (email && !EMAIL_RE.test(email)) {
      nextErrors.email = 'Enter a valid email address.'
    }

    const iban = form.iban.replace(/\s+/g, '').toUpperCase()
    if (iban && !isValidIban(iban)) {
      nextErrors.iban = 'This IBAN does not look valid.'
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return null

    return {
      errors: nextErrors,
      data: {
        serviceFee: feeNum,
        fullName: form.fullName.trim(),
        email,
        iban,
        address: form.address.trim(),
      },
    }
  }

  async function handleSave() {
    const result = validate()
    if (!result) return

    setSaving(true)
    try {
      const saved = await updateSettings(result.data)
      const next = toForm(saved)
      setForm(next)
      setBaseline(next)
      setSavedAt(parseSavedAt(saved.updatedAt))
      setErrors({})
      showToast('Settings saved')
    } catch {
      showToast('Failed to save settings.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const dirty = isDirty(form, baseline)

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          {!loading && !fetchError && savedAt && (
            <span className="page-eyebrow">Last saved {formatSavedAt(savedAt)}</span>
          )}
          <h1 className="page-title">Settings</h1>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={loading || !!fetchError || saving || !dirty}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="page-body">
        {fetchError ? (
          <div className="card settings-card" style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--status-overdue-fg)', marginBottom: 'var(--sp-4)' }}>
              {fetchError}
            </p>
            <button className="btn btn-secondary btn-sm" onClick={() => setReloadKey((k) => k + 1)}>
              Retry
            </button>
          </div>
        ) : loading ? (
          <>
            <SkeletonCard fields={1} />
            <SkeletonCard fields={4} />
          </>
        ) : (
          <>
            <div className="card settings-card">
              <h2 className="settings-card-title">Pricing</h2>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="service-fee">Service fee (€)</label>
                  <input
                    id="service-fee"
                    type="number"
                    className={`input input-mono${errors.serviceFee ? ' input-error' : ''}`}
                    min="0"
                    step="0.50"
                    value={form.serviceFee}
                    onChange={set('serviceFee')}
                  />
                  <div className="field-hint">
                    The labour charge applied to every job, on top of the per-reel String Fee.
                  </div>
                  {errors.serviceFee && <div className="field-error">{errors.serviceFee}</div>}
                </div>
              </div>
            </div>

            <div className="card settings-card">
              <h2 className="settings-card-title">Stringer Info</h2>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="stringer-name">Full name</label>
                  <input
                    id="stringer-name"
                    type="text"
                    className="input"
                    placeholder="Tom Lausmann"
                    value={form.fullName}
                    onChange={set('fullName')}
                  />
                </div>
                <div className="field">
                  <label htmlFor="stringer-email">Email</label>
                  <input
                    id="stringer-email"
                    type="email"
                    className={`input${errors.email ? ' input-error' : ''}`}
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={set('email')}
                  />
                  {errors.email && <div className="field-error">{errors.email}</div>}
                </div>
                <div className="field">
                  <label htmlFor="stringer-iban">IBAN</label>
                  <input
                    id="stringer-iban"
                    type="text"
                    className={`input input-mono${errors.iban ? ' input-error' : ''}`}
                    placeholder="DE89 3704 0044 0532 0130 00"
                    autoComplete="off"
                    value={form.iban}
                    onChange={set('iban')}
                  />
                  <div className="field-hint">Shown on invoices and future payment emails.</div>
                  {errors.iban && <div className="field-error">{errors.iban}</div>}
                </div>
                <div className="field">
                  <label htmlFor="stringer-address">Address</label>
                  <textarea
                    id="stringer-address"
                    className="textarea"
                    placeholder="Street, postal code, city"
                    value={form.address}
                    onChange={set('address')}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function SkeletonCard({ fields }: { fields: number }) {
  return (
    <div className="card settings-card" aria-hidden="true">
      <div className="skeleton-block skeleton-title" />
      {Array.from({ length: fields }).map((_, i) => (
        <div className="skeleton-field" key={i}>
          <div className="skeleton-block skeleton-label" />
          <div className="skeleton-block skeleton-input" />
        </div>
      ))}
    </div>
  )
}
