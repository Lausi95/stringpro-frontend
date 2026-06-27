import { useState } from 'react'
import Modal from './Modal'
import { useKeycloakToken } from '../lib/KeycloakContext'
import {
  createRacket,
  updateRacket,
  deleteRacket,
  type RacketFormData,
  type RacketResponse,
} from '../lib/api'

interface RacketFormModalProps {
  mode: 'create' | 'edit'
  customerId: string
  /** Existing racket to edit; required when mode === 'edit'. */
  initial?: RacketResponse
  onClose: () => void
  onSaved: (racket: RacketResponse) => void
  onDeleted: () => void
}

/** Numeric fields are held as strings so the inputs can be cleared while editing. */
interface RacketFormState {
  brand: string
  model: string
  headSize: string
  stringMains: string
  stringCrosses: string
  notes: string
}

function toForm(r?: RacketResponse): RacketFormState {
  return {
    brand: r?.brand ?? '',
    model: r?.model ?? '',
    headSize: r?.headSize != null ? String(r.headSize) : '',
    stringMains: r?.stringMains != null ? String(r.stringMains) : '',
    stringCrosses: r?.stringCrosses != null ? String(r.stringCrosses) : '',
    notes: r?.notes ?? '',
  }
}

export default function RacketFormModal({
  mode,
  customerId,
  initial,
  onClose,
  onSaved,
  onDeleted,
}: RacketFormModalProps) {
  const token = useKeycloakToken()
  const [form, setForm] = useState<RacketFormState>(() => toForm(initial))
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    const payload: RacketFormData = {
      brand: form.brand,
      model: form.model,
      headSize: Number(form.headSize),
      stringMains: Number(form.stringMains),
      stringCrosses: Number(form.stringCrosses),
      notes: form.notes || undefined,
    }
    try {
      const racket =
        mode === 'edit' && initial
          ? await updateRacket(token, initial.id, payload)
          : await createRacket(token, customerId, payload)
      onSaved(racket)
    } catch {
      setFormError('Failed to save racket. Please try again.')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!initial) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteRacket(token, initial.id)
      onDeleted()
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      setDeleteError(
        status === 409 || status === 400
          ? "This racket can't be deleted because it has jobs."
          : 'Failed to delete racket. Please try again.',
      )
      setDeleting(false)
    }
  }

  if (confirmingDelete && initial) {
    return (
      <Modal title="Delete Racket" onClose={onClose}>
        <div style={{ padding: 'var(--sp-2) 0 var(--sp-4)', fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
          Are you sure you want to delete <strong>{initial.brand} {initial.model}</strong>? This cannot be undone.
        </div>
        {deleteError && (
          <p style={{ color: 'var(--status-overdue-fg)', fontSize: 'var(--text-sm)', margin: '0 0 var(--sp-3)' }}>
            {deleteError}
          </p>
        )}
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setConfirmingDelete(false)
              setDeleteError(null)
            }}
            disabled={deleting}
          >
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete Racket'}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={mode === 'edit' ? 'Edit Racket' : 'Add Racket'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid" style={{ gap: 'var(--sp-4)' }}>
          <div className="form-grid form-grid-2">
            <div className="field">
              <label htmlFor="racket-brand">Brand</label>
              <input
                id="racket-brand"
                type="text"
                className="input"
                placeholder="Wilson"
                required
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="racket-model">Model</label>
              <input
                id="racket-model"
                type="text"
                className="input"
                placeholder="Pro Staff 97"
                required
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="racket-headsize">Head size</label>
            <input
              id="racket-headsize"
              type="number"
              className="input input-mono"
              placeholder="630"
              required
              min={400}
              max={900}
              value={form.headSize}
              onChange={(e) => setForm((f) => ({ ...f, headSize: e.target.value }))}
            />
            <span className="field-hint">cm² (400–900)</span>
          </div>

          <div className="field">
            <label>String pattern</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <input
                aria-label="Mains"
                type="number"
                className="input input-mono"
                placeholder="16"
                required
                min={14}
                max={20}
                value={form.stringMains}
                onChange={(e) => setForm((f) => ({ ...f, stringMains: e.target.value }))}
              />
              <span style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>×</span>
              <input
                aria-label="Crosses"
                type="number"
                className="input input-mono"
                placeholder="19"
                required
                min={15}
                max={22}
                value={form.stringCrosses}
                onChange={(e) => setForm((f) => ({ ...f, stringCrosses: e.target.value }))}
              />
            </div>
            <span className="field-hint">mains × crosses</span>
          </div>

          <div className="field">
            <label htmlFor="racket-notes">Notes</label>
            <textarea
              id="racket-notes"
              className="textarea"
              placeholder="Anything useful to remember about this racket…"
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

        <div
          className="modal-footer"
          style={mode === 'edit' ? { justifyContent: 'space-between' } : undefined}
        >
          {mode === 'edit' && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setConfirmingDelete(true)}
              disabled={saving}
            >
              Delete
            </button>
          )}
          <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Save Racket'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
