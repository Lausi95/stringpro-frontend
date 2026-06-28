import { useState } from 'react'
import Modal from './Modal'
import { useKeycloakToken } from '../lib/KeycloakContext'
import {
  createReel,
  updateReel,
  type ReelFormData,
  type ReelMaterial,
  type ReelResponse,
} from '../lib/api'

interface ReelFormModalProps {
  mode: 'create' | 'edit'
  /** Existing reel to edit; required when mode === 'edit'. */
  initial?: ReelResponse
  onClose: () => void
  onSaved: (reel: ReelResponse) => void
}

const MATERIALS: { value: ReelMaterial; label: string }[] = [
  { value: 'POLYESTER', label: 'Polyester' },
  { value: 'NATURAL_GUT', label: 'Natural gut' },
  { value: 'MULTIFILAMENT', label: 'Multifilament' },
  { value: 'SYNTHETIC_GUT', label: 'Synthetic gut' },
]

/** Number fields are held as strings so the inputs can be empty while editing. */
interface ReelFormState {
  brand: string
  model: string
  material: ReelMaterial
  gauge: string
  reelLengthMeters: string
  cost: string
  stringFee: string
  metersPerJob: string
  purchaseDate: string
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function toForm(r?: ReelResponse): ReelFormState {
  return {
    brand: r?.brand ?? '',
    model: r?.model ?? '',
    material: r?.material ?? 'POLYESTER',
    gauge: r != null ? String(r.gauge) : '',
    reelLengthMeters: r != null ? String(r.reelLengthMeters) : '',
    cost: r != null ? String(r.cost) : '',
    stringFee: r != null ? String(r.stringFee) : '7.50',
    metersPerJob: r != null ? String(r.metersPerJob) : '11',
    purchaseDate: r?.purchaseDate ?? today(),
  }
}

export default function ReelFormModal({ mode, initial, onClose, onSaved }: ReelFormModalProps) {
  const token = useKeycloakToken()
  const [form, setForm] = useState<ReelFormState>(() => toForm(initial))
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function set<K extends keyof ReelFormState>(key: K, value: ReelFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const data: ReelFormData = {
      brand: form.brand.trim(),
      model: form.model.trim(),
      material: form.material,
      gauge: Number(form.gauge),
      reelLengthMeters: Math.round(Number(form.reelLengthMeters)),
      cost: Number(form.cost),
      stringFee: Number(form.stringFee),
      metersPerJob: Math.round(Number(form.metersPerJob)),
      purchaseDate: form.purchaseDate,
    }

    if (!data.brand || !data.model) {
      setFormError('Brand and model are required.')
      return
    }
    if (!(data.gauge > 0) || !(data.reelLengthMeters > 0) || !(data.metersPerJob > 0)) {
      setFormError('Gauge, reel length and meters per stringing must be greater than zero.')
      return
    }
    if (data.cost < 0 || data.stringFee < 0) {
      setFormError('Cost and String Fee cannot be negative.')
      return
    }

    setSaving(true)
    try {
      const reel =
        mode === 'edit' && initial
          ? await updateReel(token, initial.id, data)
          : await createReel(token, data)
      onSaved(reel)
    } catch {
      setFormError('Failed to save reel. Please try again.')
      setSaving(false)
    }
  }

  return (
    <Modal title={mode === 'edit' ? 'Edit Reel' : 'Add Reel'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid" style={{ gap: 'var(--sp-4)' }}>
          <div className="form-grid form-grid-2">
            <div className="field">
              <label htmlFor="reel-brand">Brand</label>
              <input
                id="reel-brand"
                type="text"
                className="input"
                placeholder="Babolat, Luxilon…"
                required
                value={form.brand}
                onChange={(e) => set('brand', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="reel-model">Model</label>
              <input
                id="reel-model"
                type="text"
                className="input"
                placeholder="RPM Blast"
                required
                value={form.model}
                onChange={(e) => set('model', e.target.value)}
              />
            </div>
          </div>

          <div className="form-grid form-grid-2">
            <div className="field">
              <label htmlFor="reel-material">Material</label>
              <select
                id="reel-material"
                className="select"
                value={form.material}
                onChange={(e) => set('material', e.target.value as ReelMaterial)}
              >
                {MATERIALS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="reel-gauge">Gauge (mm)</label>
              <input
                id="reel-gauge"
                type="number"
                className="input input-mono"
                placeholder="1.25"
                min="0"
                step="0.01"
                required
                value={form.gauge}
                onChange={(e) => set('gauge', e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="reel-length">Reel length (m)</label>
            <input
              id="reel-length"
              type="number"
              className="input input-mono"
              placeholder="200"
              min="1"
              step="1"
              required
              value={form.reelLengthMeters}
              onChange={(e) => set('reelLengthMeters', e.target.value)}
            />
            <div className="field-hint">Common reel sizes: 100 m or 200 m.</div>
          </div>

          <div className="form-grid form-grid-2">
            <div className="field">
              <label htmlFor="reel-cost">Reel cost (€)</label>
              <input
                id="reel-cost"
                type="number"
                className="input input-mono"
                placeholder="32.00"
                min="0"
                step="0.01"
                required
                value={form.cost}
                onChange={(e) => set('cost', e.target.value)}
              />
              <div className="field-hint">What you paid for this reel.</div>
            </div>
            <div className="field">
              <label htmlFor="reel-fee">String Fee / job (€)</label>
              <input
                id="reel-fee"
                type="number"
                className="input input-mono"
                placeholder="7.50"
                min="0"
                step="0.50"
                required
                value={form.stringFee}
                onChange={(e) => set('stringFee', e.target.value)}
              />
              <div className="field-hint">Charged to the customer per stringing.</div>
            </div>
          </div>

          <div className="form-grid form-grid-2">
            <div className="field">
              <label htmlFor="reel-mpj">Meters / stringing (m)</label>
              <input
                id="reel-mpj"
                type="number"
                className="input input-mono"
                placeholder="11"
                min="1"
                step="1"
                required
                value={form.metersPerJob}
                onChange={(e) => set('metersPerJob', e.target.value)}
              />
              <div className="field-hint">Typical: 11 m for a standard head.</div>
            </div>
            <div className="field">
              <label htmlFor="reel-date">Purchase date</label>
              <input
                id="reel-date"
                type="date"
                className="input"
                required
                value={form.purchaseDate}
                onChange={(e) => set('purchaseDate', e.target.value)}
              />
            </div>
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
            {saving ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Add Reel'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
