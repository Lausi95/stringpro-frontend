import { useEffect, useMemo, useState } from 'react'
import { Share2, Copy, Check } from 'lucide-react'
import Modal from './Modal'
import { getSettings, type JobResponse, type SettingsResponse } from '../lib/api'
import { buildPaymentRequest, type MessageLanguage } from '../lib/paymentRequest'

interface SharePaymentRequestModalProps {
  job: JobResponse
  /** Resolved "First Last"; the first token is used to greet the Customer. */
  customerName?: string
  /** Resolved "Brand Model" for the racket the message references. */
  racketName?: string
  onClose: () => void
}

const balanceOf = (j: JobResponse) => Math.max(0, j.total - j.amountPaid)

type Identity = Pick<SettingsResponse, 'fullName' | 'iban'>

export default function SharePaymentRequestModal({ job, customerName, racketName, onClose }: SharePaymentRequestModalProps) {
  const [lang, setLang] = useState<MessageLanguage>('de')
  const [settings, setSettings] = useState<Identity | null>(null)
  const [copied, setCopied] = useState(false)

  // Load the Stringer's name + IBAN for the pay-details; degrade to blanks on failure.
  useEffect(() => {
    let alive = true
    getSettings()
      .then((s) => alive && setSettings({ fullName: s.fullName, iban: s.iban }))
      .catch(() => alive && setSettings({ fullName: '', iban: '' }))
    return () => {
      alive = false
    }
  }, [])

  const firstName = customerName?.trim().split(/\s+/)[0] ?? ''

  const text = useMemo(() => {
    if (!settings) return ''
    return buildPaymentRequest({
      firstName,
      racketName: racketName ?? '',
      balance: balanceOf(job),
      settings,
      lang,
    })
  }, [settings, firstName, racketName, job, lang])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable — nothing to do */
    }
  }

  async function handleShare() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text })
      } catch {
        /* user dismissed the share sheet, or share failed — no-op */
      }
    } else {
      await handleCopy()
    }
  }

  const ready = settings !== null

  return (
    <Modal title="Share payment info" onClose={onClose}>
      <div className="form-grid" style={{ gap: 'var(--sp-4)' }}>
        <div className="toggle-group" role="radiogroup" aria-label="Message language">
          <input
            type="radio"
            id="msg-lang-de"
            name="msg-lang"
            checked={lang === 'de'}
            onChange={() => setLang('de')}
          />
          <label htmlFor="msg-lang-de">Deutsch</label>
          <input
            type="radio"
            id="msg-lang-en"
            name="msg-lang"
            checked={lang === 'en'}
            onChange={() => setLang('en')}
          />
          <label htmlFor="msg-lang-en">English</label>
        </div>

        <div className="field">
          <label htmlFor="payment-request-preview">Preview</label>
          <textarea
            id="payment-request-preview"
            className="textarea"
            readOnly
            value={ready ? text : 'Loading…'}
            style={{ minHeight: 220, lineHeight: 1.5 }}
          />
        </div>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={handleCopy} disabled={!ready}>
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="btn btn-primary" onClick={handleShare} disabled={!ready}>
          <Share2 />
          Share
        </button>
      </div>
    </Modal>
  )
}
