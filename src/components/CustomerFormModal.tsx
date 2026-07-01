import { useState } from 'react'
import Modal from './Modal'
import {
  createCustomer,
  updateCustomer,
  type CustomerFormData,
  type CustomerResponse,
} from '../lib/api'

interface CustomerFormModalProps {
  mode: 'create' | 'edit'
  /** Existing customer to edit; required when mode === 'edit'. */
  initial?: CustomerResponse
  onClose: () => void
  onSaved: (customer: CustomerResponse) => void
}

function toForm(c?: CustomerResponse): CustomerFormData {
  return {
    firstName: c?.firstName ?? '',
    lastName: c?.lastName ?? '',
    email: c?.email ?? '',
    phoneNumber: c?.phoneNumber ?? '',
    notes: c?.notes ?? '',
  }
}

export default function CustomerFormModal({ mode, initial, onClose, onSaved }: CustomerFormModalProps) {
  const [form, setForm] = useState<CustomerFormData>(() => toForm(initial))
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      const customer =
        mode === 'edit' && initial
          ? await updateCustomer(initial.id, form)
          : await createCustomer(form)
      onSaved(customer)
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      setFormError(status === 409 ? 'Email is already in use.' : 'Failed to save customer. Please try again.')
      setSaving(false)
    }
  }

  return (
    <Modal title={mode === 'edit' ? 'Edit Customer' : 'Add Customer'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid" style={{ gap: 'var(--sp-4)' }}>
          <div className="form-grid form-grid-2">
            <div className="field">
              <label htmlFor="customer-firstname">First name</label>
              <input
                id="customer-firstname"
                type="text"
                className="input"
                placeholder="Marc"
                required
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="customer-lastname">Last name</label>
              <input
                id="customer-lastname"
                type="text"
                className="input"
                placeholder="Dubois"
                required
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="customer-email">Email</label>
            <input
              id="customer-email"
              type="email"
              className="input"
              placeholder="marc@example.com"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="customer-phone">Phone</label>
            <input
              id="customer-phone"
              type="tel"
              className="input"
              placeholder="+41 78 123 45 67"
              required
              value={form.phoneNumber}
              onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="customer-notes">Notes</label>
            <textarea
              id="customer-notes"
              className="textarea"
              placeholder="Anything useful to remember about this customer…"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
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
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Save Customer'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
