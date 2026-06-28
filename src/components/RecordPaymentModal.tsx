import { useState } from 'react'
import Modal from './Modal'
import { useKeycloakToken } from '../lib/KeycloakContext'
import {
  createPayment,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type JobResponse,
  type PaymentMethod,
} from '../lib/api'

interface RecordPaymentModalProps {
  job: JobResponse
  /** Resolved "First Last" for the modal subtitle; falls back to a dash. */
  customerName?: string
  onClose: () => void
  /** Called after the Payment is recorded so the caller can refresh the list. */
  onSaved: () => void
}

const money = (n: number) => `€ ${n.toFixed(2)}`

export default function RecordPaymentModal({ job, customerName, onClose, onSaved }: RecordPaymentModalProps) {
  const token = useKeycloakToken()
  const balance = Math.max(0, job.total - job.amountPaid)

  // Amount is a free-text string so the user can clear/retype; default to the full Balance.
  const [amount, setAmount] = useState<string>(balance.toFixed(2))
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const parsed = Number.parseFloat(amount)
  const valid = Number.isFinite(parsed) && parsed > 0
  const remaining = balance - parsed // >0 partial, ≈0 exact, <0 tip

  let result: { text: string; tone: 'muted' | 'paid' } = {
    text: 'Enter the amount received above.',
    tone: 'muted',
  }
  if (valid) {
    if (Math.abs(remaining) < 0.005) result = { text: 'Paid in full.', tone: 'paid' }
    else if (remaining > 0) result = { text: `${money(remaining)} still outstanding.`, tone: 'muted' }
    else result = { text: `Paid in full — ${money(-remaining)} tip.`, tone: 'paid' }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    setFormError(null)
    try {
      await createPayment(token, {
        jobId: job.id,
        customerId: job.customerId,
        amount: parsed,
        method,
      })
      onSaved()
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      setFormError(
        status === 409
          ? 'This Job has already been settled — reload the list and try again.'
          : 'Failed to record the payment. Please try again.',
      )
      setSaving(false)
    }
  }

  return (
    <Modal title="Record Payment" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid" style={{ gap: 'var(--sp-4)' }}>
          <div className="price-summary">
            <div className="price-total">
              <span className="price-key">Balance for {customerName ?? 'this Job'}</span>
              <span
                className="price-val"
                style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
              >
                {money(balance)}
              </span>
            </div>
            {job.amountPaid > 0 && (
              <div className="price-row" style={{ paddingBottom: 0 }}>
                <span className="price-key">Already paid</span>
                <span className="price-val">
                  {money(job.amountPaid)} of {money(job.total)}
                </span>
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="payment-amount">Amount received (€)</label>
            <input
              id="payment-amount"
              type="number"
              className="input"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
            />
            <p
              style={{
                margin: 'var(--sp-1) 0 0',
                fontSize: 'var(--text-sm)',
                color: result.tone === 'paid' ? 'var(--court-700)' : 'var(--fg-muted)',
              }}
            >
              {result.text}
            </p>
          </div>

          <div className="field">
            <label htmlFor="payment-method">Payment method</label>
            <select
              id="payment-method"
              className="select"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          {formError && (
            <p style={{ color: 'var(--status-overdue-fg)', fontSize: 'var(--text-sm)', margin: 0 }}>
              {formError}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-paid" disabled={saving || !valid}>
            {saving ? 'Recording…' : 'Record Payment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
